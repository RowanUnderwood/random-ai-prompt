import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createServiceManager } from "../targets/web/backend/localServices.js";
import { createGpuQueue, generateLocalBatch } from "../targets/web/backend/localGpuPool.js";
import generateComfy from "../targets/shared/comfyui/code/generate.js";
import ninferRewrite from "../targets/shared/ninfer/code/rewrite.js";

afterEach(() => vi.unstubAllGlobals());
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const child = () =>
  Object.assign(new EventEmitter(), { pid: 12345, exitCode: null, signalCode: null });

describe("local process ownership", () => {
  it("reuses a running server without adopting or stopping it", async () => {
    const launch = vi.fn();
    const kill = vi.fn();
    const manager = createServiceManager({
      probe: async () => ({ ready: true, occupied: true }),
      launch,
      kill,
    });
    await manager.start("ninfer");
    expect(launch).not.toHaveBeenCalled();
    await expect(manager.stop("ninfer")).rejects.toThrow("not launched");
    expect(kill).not.toHaveBeenCalled();
    expect((await manager.status()).every((s) => !s.owned)).toBe(true);
  });
  it("serializes duplicate launch clicks and stops only the child it owns", async () => {
    const process = child();
    const launch = vi.fn(() => process);
    const kill = vi.fn();
    const manager = createServiceManager({
      probe: async () => ({ ready: false, occupied: false }),
      launch,
      kill,
    });
    await Promise.all([manager.start("comfy3090"), manager.start("comfy3090")]);
    expect(launch).toHaveBeenCalledTimes(1);
    await manager.stop("comfy3090");
    expect(kill).toHaveBeenCalledWith(process);
    expect((await manager.status()).find((s) => s.id === "comfy3090").owned).toBe(false);
  });
  it("refuses an occupied incompatible port and unknown profiles", async () => {
    const launch = vi.fn();
    const manager = createServiceManager({
      probe: async () => ({ ready: false, occupied: true }),
      launch,
    });
    await expect(manager.start("ninfer")).rejects.toThrow("occupied");
    await expect(manager.start("arbitrary command")).rejects.toThrow("Unknown");
    expect(launch).not.toHaveBeenCalled();
  });
  it("drops ownership when its launcher exits", async () => {
    const process = child();
    const manager = createServiceManager({
      probe: async () => ({ ready: false }),
      launch: () => process,
    });
    await manager.start("ninfer");
    process.emit("exit", 1);
    const state = (await manager.status()).find((s) => s.id === "ninfer");
    expect(state.owned).toBe(false);
    expect(state.error).toContain("Launcher exited");
    await expect(manager.stop("ninfer")).rejects.toThrow("not launched");
  });
});

describe("GPU queue", () => {
  it("keeps both GPUs busy and assigns the next job to whichever finishes", async () => {
    const queue = createGpuQueue();
    const slow = deferred();
    const fast = deferred();
    const seen = [];
    const first = queue.run(["3090", "4090"], async (gpu) => {
      seen.push(gpu);
      await slow.promise;
    });
    const second = queue.run(["3090", "4090"], async (gpu) => {
      seen.push(gpu);
      await fast.promise;
    });
    const third = queue.run(["3090", "4090"], async (gpu) => {
      seen.push(gpu);
    });
    await vi.waitFor(() => expect(seen).toEqual(["3090", "4090"]));
    fast.resolve();
    await second;
    await third;
    expect(seen).toEqual(["3090", "4090", "4090"]);
    slow.resolve();
    await first;
  });
  it("cancels queued jobs without executing them", async () => {
    const queue = createGpuQueue();
    const blocker = deferred();
    const running = queue.run(["3090"], () => blocker.promise);
    const ctrl = new AbortController();
    const run = vi.fn();
    const waiting = queue.run(["3090"], run, ctrl.signal);
    const failure = expect(waiting).rejects.toThrow();
    ctrl.abort();
    await failure;
    expect(run).not.toHaveBeenCalled();
    blocker.resolve();
    await running;
  });
  it("divides an image batch, increments pinned seeds, and retains image provenance", async () => {
    const seen = [];
    const result = await generateLocalBatch(
      { prompt: "a landscape", settings: { batchSize: 4, seed: 42 } },
      {
        queue: createGpuQueue(),
        probe: async () => ({ ready: true }),
        generate: async ({ settings }) => {
          seen.push(settings);
          return { images: [settings.comfyUrl], imageMeta: [{ seed: settings.seed }] };
        },
      },
    );
    expect(result.images).toHaveLength(4);
    expect(new Set(seen.map((s) => s.comfyUrl)).size).toBe(2);
    expect(seen.map((s) => s.seed)).toEqual([42, 43, 44, 45]);
    expect(seen.every((s) => s.batchSize === 1)).toBe(true);
    expect(result.imageMeta[0].localGpu).toContain("3090");
  });
  it("uses a remaining ready GPU and reports partial failures without dropping successes", async () => {
    let index = 0;
    const result = await generateLocalBatch(
      { prompt: "scene", settings: { batchSize: 3 } },
      {
        queue: createGpuQueue(),
        probe: async (s) => ({ ready: s.id === "comfy4090" }),
        generate: async () => {
          if (++index === 2) throw new Error("render failed");
          return { images: ["image"] };
        },
      },
    );
    expect(result.images).toHaveLength(2);
    expect(result.warnings).toEqual(["render failed"]);
    expect(result.imageMeta.every((m) => m.localGpu.includes("4090"))).toBe(true);
  });
});

describe("Krea workflow and Qwen", () => {
  it("patches Jake's API graph, validates models, and uses unique output prefixes", async () => {
    let graph;
    const classes = [
      "CLIPTextEncode",
      "KSampler",
      "VAEDecode",
      "SaveImage",
      "LoraLoaderStack",
      "VAELoader",
      "EmptyLatentImage",
      "CLIPLoader",
      "UNETLoader",
    ];
    const result = await generateComfy({
      prompt: "a forest",
      settings: {
        comfyWorkflow: "krea2",
        seed: 7,
        imageWidth: 1024,
        imageHeight: 768,
      },
      transport: {
        getJson: async (url) =>
          url.endsWith("object_info")
            ? Object.fromEntries(classes.map((c) => [c, {}]))
            : {
                test: { outputs: { 152: { images: [{ filename: "result.png" }] } } },
              },
        postJson: async (_, body) => {
          graph = body.prompt;
          return { prompt_id: "test" };
        },
      },
    });
    expect(graph["104"].inputs.text).toBe("a forest");
    expect(graph["138"].inputs).toMatchObject({ seed: 7, cfg: 1, steps: 12, scheduler: "simple" });
    expect(graph["106:10"].inputs).toMatchObject({ width: 1024, height: 768 });
    expect(graph["172"].inputs.lora_01).toBe("None");
    expect(graph["152"].inputs.filename_prefix).toMatch(/^RandomPrompt\/[\da-f-]+$/);
    expect(result.imageMeta[0]).toMatchObject({ seed: 7, comfyWorkflow: "krea2" });
  });
  it("fails before submission when required custom nodes are absent", async () => {
    const postJson = vi.fn();
    await expect(
      generateComfy({
        prompt: "scene",
        settings: { comfyWorkflow: "krea2" },
        transport: {
          getJson: async () => ({}),
          postJson,
        },
      }),
    ).rejects.toThrow("needs the");
    expect(postJson).not.toHaveBeenCalled();
  });
  it("handles Comfy execution errors immediately", async () => {
    await expect(
      generateComfy({
        prompt: "scene",
        settings: { comfyWorkflow: "krea2" },
        transport: {
          getJson: async (url) =>
            url.endsWith("object_info")
              ? new Proxy({}, { get: () => ({}) })
              : {
                  test: {
                    status: {
                      status_str: "error",
                      messages: [["execution_error", { exception_message: "out of memory" }]],
                    },
                  },
                },
          postJson: async () => ({ prompt_id: "test" }),
        },
      }),
    ).rejects.toThrow("out of memory");
  });
  it("calls Qwen without an API key and excludes reasoning from the returned prompt", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              reasoning_content: "private reasoning",
              content: "<think>reasoning</think>A forest in sunlight",
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetch);
    expect(await ninferRewrite({ prompt: "forest", system: "Expand this prompt" })).toEqual({
      text: "A forest in sunlight",
    });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content).toBe("Expand this prompt");
  });
});
