import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpscaler, imageSize } from "../targets/web/backend/localUpscale.js";
import { createGpuQueue } from "../targets/web/backend/localGpuPool.js";
import { seedvr2Params } from "../targets/shared/seedvr2-local/settings.js";
import concurrency from "../targets/shared/_shared/settings/concurrency.js";
import config from "../targets/shared/seedvr2-local/config.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
/** A PNG header is all the size check reads. */
const png = (width, height, tag = "") => {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return Buffer.concat([buf, Buffer.from(tag)]);
};

let dir;
const servers = [];
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rap-upscale-"));
});
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

const combo = (...options) => ["COMBO", { options }];
/** A ComfyUI that holds each submitted prompt until the test releases it. */
async function fakeComfy(overrides = {}) {
  const state = {
    info: {
      SeedVR2LoadDiTModel: {
        input: {
          required: { model: combo("seedvr2_ema_7b_fp16.safetensors") },
          optional: { attention_mode: combo("sdpa", "sageattn_2") },
        },
      },
      SeedVR2LoadVAEModel: { input: { required: { model: [["ema_vae_fp16.safetensors"]] } } },
      SeedVR2VideoUpscaler: { input: {} },
      "easy cleanGpuUsed": { input: {} },
    },
    running: [],
    pending: [],
    history: {},
    graphs: [],
    uploads: [],
    interrupts: [],
    deletes: [],
    paths: [],
    failPolls: 0,
    ...overrides,
  };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("latin1");
    const url = new URL(req.url, "http://x");
    state.paths.push(`${req.method} ${url.pathname}`);
    const reply = (data) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    if (url.pathname.startsWith("/object_info/")) {
      const type = decodeURIComponent(url.pathname.slice(13));
      return reply(state.info[type] ? { [type]: state.info[type] } : {});
    }
    if (url.pathname === "/upload/image") {
      state.uploads.push(raw.match(/filename="([^"]+)"/)[1]);
      return reply({ name: state.uploads.at(-1), subfolder: "random-ai-prompt" });
    }
    if (url.pathname === "/prompt") {
      const id = `p${state.graphs.push(JSON.parse(raw).prompt)}`;
      (state.startPending ? state.pending : state.running).push([0, id]);
      return reply({ prompt_id: id });
    }
    if (url.pathname === "/queue" && req.method === "GET") {
      if (state.failPolls-- > 0) return res.destroy();
      return reply({ queue_running: state.running, queue_pending: state.pending });
    }
    if (url.pathname === "/queue") {
      const ids = JSON.parse(raw).delete;
      state.deletes.push(...ids);
      state.pending = state.pending.filter(([, id]) => !ids.includes(id));
      return reply({});
    }
    if (url.pathname === "/interrupt") {
      const id = JSON.parse(raw).prompt_id;
      state.interrupts.push(id);
      state.running = state.running.filter(([, other]) => other !== id);
      state.history[id] = {
        outputs: {},
        status: { status_str: "error", messages: [["execution_interrupted", {}]] },
      };
      return reply({});
    }
    if (url.pathname.startsWith("/history/")) {
      const id = url.pathname.slice(9);
      return reply(state.history[id] ? { [id]: state.history[id] } : {});
    }
    if (url.pathname === "/view") return res.end(png(4000, 3000));
    res.statusCode = 404;
    reply({});
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  state.service = {
    id: "comfy4090",
    label: "ComfyUI · RTX 4090",
    port,
    url: `http://127.0.0.1:${port}`,
  };
  state.finish = (id = "p1", entry) => {
    state.running = state.running.filter(([, other]) => other !== id);
    state.history[id] = entry || {
      status: { completed: true, status_str: "success" },
      outputs: {
        24: { images: [{ filename: "up.png", subfolder: "RandomPrompt", type: "output" }] },
      },
    };
  };
  return state;
}

function upscaler(comfy, overrides = {}) {
  return createUpscaler({
    service: comfy.service,
    queue: createGpuQueue(),
    probe: async () => ({ ready: true }),
    resolveSource: (p) => path.join(dir, String(p).replace("/api/output/", "")),
    outputDir: dir,
    fallbackSize: async () => null,
    pollMs: 10,
    ...overrides,
  });
}
const source = (name = "a.png", buf = png(1024, 768), meta) => {
  fs.writeFileSync(path.join(dir, name), buf);
  if (meta) fs.writeFileSync(path.join(dir, name.replace(/\.\w+$/, ".json")), JSON.stringify(meta));
  return `/api/output/${name}`;
};
const until = (manager, id, state) =>
  vi.waitFor(() => expect(manager.list().find((j) => j.id === id)).toMatchObject({ state }), {
    timeout: 4000,
  });

describe("GPU queue priority", () => {
  it("runs upscales next without preempting, in click order, while the 3090 keeps rendering", async () => {
    const queue = createGpuQueue();
    const gates = { r1: deferred(), r2: deferred(), u1: deferred(), u2: deferred() };
    const seen = [];
    const job = (name) => async (gpu) => {
      seen.push(`${name}@${gpu}`);
      await gates[name]?.promise;
    };
    const both = ["3090", "4090"];
    const all = [
      queue.run(both, job("r1")),
      queue.run(both, job("r2")),
      queue.run(both, job("r3")),
      queue.run(both, job("r4")),
      queue.run(["4090"], job("u1"), undefined, { priority: 1, id: "u1" }),
      queue.run(["4090"], job("u2"), undefined, { priority: 1, id: "u2" }),
    ];
    await vi.waitFor(() => expect(seen).toEqual(["r1@3090", "r2@4090"]));
    expect([queue.ahead("u1"), queue.ahead("u2"), queue.ahead("unknown")]).toEqual([1, 2, 0]);
    gates.r2.resolve();
    await vi.waitFor(() => expect(seen).toContain("u1@4090"));
    expect([queue.ahead("u1"), queue.ahead("u2")]).toEqual([0, 1]);
    gates.r1.resolve();
    await vi.waitFor(() => expect(seen).toContain("r4@3090"));
    expect(seen).toEqual(["r1@3090", "r2@4090", "u1@4090", "r3@3090", "r4@3090"]);
    gates.u1.resolve();
    gates.u2.resolve();
    await Promise.all(all);
    expect(seen.at(-1)).toBe("u2@4090");
  });

  it("counts only jobs that can occupy the same GPU", async () => {
    const queue = createGpuQueue();
    const gate = deferred();
    const all = [
      queue.run(["3090"], () => gate.promise),
      queue.run(["4090"], () => gate.promise),
      queue.run(["3090"], () => {}),
      queue.run(["4090"], () => {}, undefined, { id: "last" }),
    ];
    expect(queue.ahead("last")).toBe(1);
    gate.resolve();
    await Promise.all(all);
  });
});

describe("SeedVR2 settings", () => {
  it("uses the workflow's values, keeps targets even, and ignores invalid input", () => {
    expect(seedvr2Params()).toEqual({ target: 4000, seed: 4105349922 });
    expect(seedvr2Params({ seedvr2Target: "3001", seedvr2Seed: 0 })).toEqual({
      target: 3000,
      seed: 0,
    });
    expect(seedvr2Params({ seedvr2Target: "", seedvr2Seed: -1 })).toEqual(seedvr2Params());
    expect(seedvr2Params({ seedvr2Target: 99999 }).target).toBe(4000);
  });
  it("has no request-concurrency setting, because the GPU queue owns that", () => {
    expect(concurrency.applies(config)).toBe(false);
  });
});

describe("image dimensions", () => {
  it("reads PNG and JPEG headers", () => {
    expect(imageSize(png(1536, 864))).toEqual({ width: 1536, height: 864 });
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc2, 0x00, 0x11, 0x08, 0x03, 0x00,
      0x04, 0x00, 0x03,
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 1024, height: 768 });
    expect(imageSize(Buffer.from("RIFF....WEBP"))).toBeNull();
  });
});

describe("SeedVR2 jobs", () => {
  it("runs the cleaned workflow on its own endpoint and saves a linked child", async () => {
    const comfy = await fakeComfy();
    const manager = upscaler(comfy);
    const image = source("a.png", png(1024, 768), {
      prompt: { final: "a fox" },
      provider: "comfy-local",
      providerLabel: "Local GPUs",
      settings: { seed: 7, kreaModel: "krea.safetensors" },
    });
    const job = await manager.submit({ image, settings: { seedvr2Target: 3000 }, priority: 1 });
    await until(manager, job.id, "running");
    comfy.finish();
    await until(manager, job.id, "done");

    const graph = comfy.graphs[0];
    expect(Object.keys(graph).sort()).toEqual(["20", "22", "23", "24", "26", "29", "33"]);
    expect(graph["20"].inputs).toMatchObject({
      model: "seedvr2_ema_7b_fp16.safetensors",
      blocks_to_swap: 35,
      attention_mode: "sageattn_2",
    });
    expect(graph["33"].inputs).toMatchObject({
      image: ["22", 0],
      resolution: 3000,
      max_resolution: 3000,
      seed: 4105349922,
    });
    expect(graph["26"].inputs.image).toBe(`random-ai-prompt/${comfy.uploads[0]}`);
    expect(graph["24"].inputs.filename_prefix).toMatch(/^RandomPrompt\/[\da-f-]{36}$/);

    const saved = manager.list()[0].path.replace("/api/output/", "");
    expect(imageSize(fs.readFileSync(path.join(dir, saved)))).toEqual({
      width: 4000,
      height: 3000,
    });
    const meta = JSON.parse(
      fs.readFileSync(path.join(dir, saved.replace(".png", ".json")), "utf8"),
    );
    expect(meta).toMatchObject({
      prompt: { final: "a fox" },
      parent: "a",
      derivedKind: "resize",
      aiUpscaleBy: "seedvr2-local",
      settings: { seed: 7, kreaModel: "krea.safetensors" },
      upscale: { target: 3000, width: 4000, height: 3000, localGpu: "ComfyUI · RTX 4090" },
    });
  });

  it("shares the render queue, so it waits for a render already on the 4090", async () => {
    const comfy = await fakeComfy();
    const queue = createGpuQueue();
    const render = deferred();
    const rendering = queue.run([comfy.service.url], () => render.promise);
    const manager = upscaler(comfy, { queue });
    const job = await manager.submit({ image: source() });
    expect(job).toMatchObject({ state: "queued", ahead: 1 });
    await new Promise((r) => setTimeout(r, 60));
    expect(comfy.graphs).toHaveLength(0);
    render.resolve();
    await rendering;
    await until(manager, job.id, "running");
    comfy.finish();
    await until(manager, job.id, "done");
  });

  it("does not time out while other programs hold ComfyUI's queue", async () => {
    const comfy = await fakeComfy({ startPending: true });
    const manager = upscaler(comfy, { silentMs: 40 });
    const job = await manager.submit({ image: source() });
    await until(manager, job.id, "waiting");
    await new Promise((r) => setTimeout(r, 200));
    expect(manager.list()[0].state).toBe("waiting");
    comfy.running = comfy.pending;
    comfy.pending = [];
    await until(manager, job.id, "running");
    comfy.finish();
    await until(manager, job.id, "done");
  });

  it("rides out brief poll failures but reports lost contact, without resubmitting", async () => {
    const comfy = await fakeComfy();
    const manager = upscaler(comfy);
    const first = await manager.submit({ image: source() });
    await until(manager, first.id, "running");
    comfy.failPolls = 4;
    await vi.waitFor(() => expect(comfy.failPolls).toBeLessThan(0));
    comfy.finish();
    await until(manager, first.id, "done");

    const impatient = upscaler(comfy, { silentMs: 60 });
    const second = await impatient.submit({ image: source("b.png", png(800, 600, "b")) });
    await until(impatient, second.id, "running");
    comfy.failPolls = 1000;
    await until(impatient, second.id, "error");
    expect(impatient.list()[0].error).toContain("Lost contact");
    expect(comfy.graphs).toHaveLength(2);
  });

  it("reports a job ComfyUI no longer has, and ComfyUI execution errors", async () => {
    const comfy = await fakeComfy();
    const manager = upscaler(comfy);
    const gone = await manager.submit({ image: source() });
    await until(manager, gone.id, "running");
    comfy.running = [];
    await until(manager, gone.id, "error");
    expect(manager.list()[0].error).toContain("no longer has this job");

    const broken = await manager.submit({ image: source("b.png", png(800, 600, "b")) });
    await until(manager, broken.id, "running");
    comfy.finish("p2", {
      outputs: {},
      status: {
        status_str: "error",
        messages: [["execution_error", { exception_message: "CUDA out of memory" }]],
      },
    });
    await until(manager, broken.id, "error");
    expect(manager.list()[1].error).toBe("CUDA out of memory");
  });

  it.each([
    ["a missing node", (info) => delete info["easy cleanGpuUsed"], "easy cleanGpuUsed"],
    [
      "a missing model",
      (info) => (info.SeedVR2LoadDiTModel.input.required.model = combo("other")),
      "does not offer model",
    ],
    [
      "a missing VAE in the older list format",
      (info) => (info.SeedVR2LoadVAEModel.input.required.model = [["other"]]),
      "does not offer model",
    ],
  ])("fails before submission for %s", async (_, change, message) => {
    const comfy = await fakeComfy();
    change(comfy.info);
    const manager = upscaler(comfy);
    const job = await manager.submit({ image: source() });
    await until(manager, job.id, "error");
    expect(manager.list()[0].error).toContain(message);
    expect(comfy.graphs).toHaveLength(0);
  });

  it("rejects sources that would shrink, missing sources, non-images and a stopped 4090", async () => {
    const comfy = await fakeComfy();
    const manager = upscaler(comfy);
    await expect(manager.submit({ image: source("big.png", png(3000, 4000)) })).rejects.toThrow(
      "already 4000px",
    );
    await expect(manager.submit({ image: "/api/output/none.png" })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      manager.submit({ image: source("notes.json", Buffer.from("{}")) }),
    ).rejects.toThrow("Unsupported image type");
    await expect(manager.submit({})).rejects.toThrow();
    const stopped = upscaler(comfy, { probe: async () => ({ ready: false, occupied: false }) });
    await expect(stopped.submit({ image: source() })).rejects.toThrow("Start it in Settings");
    expect(comfy.graphs).toHaveLength(0);
  });

  it("returns the job already in progress for a repeated click", async () => {
    const comfy = await fakeComfy();
    const manager = upscaler(comfy);
    const image = source();
    const [one, two] = await Promise.all([manager.submit({ image }), manager.submit({ image })]);
    expect(two.id).toBe(one.id);
    await until(manager, one.id, "running");
    expect((await manager.submit({ image, settings: { seedvr2Target: 2000 } })).id).not.toBe(
      one.id,
    );
    comfy.finish();
    await until(manager, one.id, "done");
    await vi.waitFor(() => expect(comfy.graphs).toHaveLength(2));
    comfy.finish("p2");
  });

  it("keeps an inlined image out of the gallery and offers its result for download", async () => {
    const comfy = await fakeComfy();
    const manager = upscaler(comfy);
    const image = `data:image/png;base64,${png(512, 512).toString("base64")}`;
    const job = await manager.submit({ image });
    await until(manager, job.id, "running");
    comfy.finish();
    await until(manager, job.id, "done");
    expect(manager.list()[0]).toMatchObject({ path: null, image: null });
    expect(manager.resultUrl(job.id)).toContain(`${comfy.service.url}/view?filename=up.png`);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  describe("cancelling", () => {
    it("drops a job still in the app's queue without contacting ComfyUI", async () => {
      const comfy = await fakeComfy();
      const queue = createGpuQueue();
      const gate = deferred();
      const rendering = queue.run([comfy.service.url], () => gate.promise);
      const manager = upscaler(comfy, { queue });
      const job = await manager.submit({ image: source() });
      manager.cancel(job.id);
      await until(manager, job.id, "cancelled");
      expect(comfy.paths).toEqual([]);
      gate.resolve();
      await rendering;
    });

    it("deletes only its own pending prompt", async () => {
      const comfy = await fakeComfy({ startPending: true, pending: [[0, "someone-else"]] });
      const manager = upscaler(comfy);
      const job = await manager.submit({ image: source() });
      await until(manager, job.id, "waiting");
      manager.cancel(job.id);
      await until(manager, job.id, "cancelled");
      expect(new Set(comfy.deletes)).toEqual(new Set(["p1"]));
      expect(comfy.interrupts).toEqual([]);
      expect(comfy.pending).toEqual([[0, "someone-else"]]);
    });

    it("interrupts only its own prompt and holds the GPU until it stops", async () => {
      const comfy = await fakeComfy();
      const queue = createGpuQueue();
      const manager = upscaler(comfy, { queue });
      const job = await manager.submit({ image: source() });
      await until(manager, job.id, "running");
      const order = [];
      const next = queue.run([comfy.service.url], () => {
        order.push(comfy.running.length);
      });
      manager.cancel(job.id);
      await until(manager, job.id, "cancelled");
      await next;
      expect(order).toEqual([0]);
      expect(new Set(comfy.interrupts)).toEqual(new Set(["p1"]));
      expect(fs.readdirSync(dir)).toEqual(["a.png"]);
    });

    it("leaves finished jobs alone and reports unknown ones", async () => {
      const comfy = await fakeComfy();
      const manager = upscaler(comfy);
      const job = await manager.submit({ image: source() });
      await until(manager, job.id, "running");
      comfy.finish();
      await until(manager, job.id, "done");
      expect(manager.cancel(job.id).state).toBe("done");
      expect(manager.cancel("nope")).toBeNull();
      expect(comfy.interrupts).toEqual([]);
    });
  });
});
