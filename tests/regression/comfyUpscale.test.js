import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import upscaleServer from "../../targets/shared/comfyui/code/upscale-server.js";
import { dispatchUpscale } from "../../targets/web/backend/dispatch.js";
import { createApiHandler } from "../../targets/web/backend/apiHandler.js";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";
const servers = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

async function listen(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const read = async (req) => {
  let body = "";
  for await (const chunk of req) body += chunk.toString("latin1");
  return body;
};

/** A minimal ComfyUI; `state` is shared so a test can steer the queue and history. */
async function fakeComfy(state) {
  state.uploads = [];
  return listen(async (req, res) => {
    const reply = (data) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    const body = await read(req);
    if (req.url === "/upload/image") {
      const name = body.match(/filename="([^"]+)"/)[1];
      state.uploads.push(name);
      return reply({ name, subfolder: "", type: "input" });
    }
    if (req.url.startsWith("/object_info"))
      return reply({ UpscaleModelLoader: { input: { required: { model_name: [["4x.pth"]] } } } });
    if (req.url === "/prompt") return reply({ prompt_id: "p1" });
    if (req.url === "/queue") return reply(state.queue || { queue_running: [], queue_pending: [] });
    if (req.url.startsWith("/history")) return reply(state.history || {});
    res.statusCode = 404;
    res.end("{}");
  });
}
const DONE = { p1: { outputs: { 4: { images: [{ filename: "out.png", type: "output" }] } } } };

describe("ComfyUI upscaler", () => {
  it("runs without an API key, while keyed upscalers still require one", async () => {
    const base = await fakeComfy({ history: DONE });
    const out = await dispatchUpscale({ providerId: "comfyui", image: IMAGE, params: { base } });
    expect(out.images[0]).toContain("/view?filename=out.png");
    await expect(dispatchUpscale({ providerId: "deepai", image: IMAGE })).rejects.toThrow(
      "Missing API key",
    );
  });

  it("does not reject a keyless request at the route", async () => {
    const base = await fakeComfy({ history: {} });
    const handler = createApiHandler();
    const api = await listen((req, res) => handler(req, res, () => res.end()));
    const post = async (body) => {
      const response = await fetch(`${api}/api/upscale`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };
    // A missing source proves it passed the key guard without needing a render.
    const keyless = await post({
      providerId: "comfyui",
      image: "/api/output/no-such-file-for-upscale-test.png",
      params: { base },
    });
    expect(keyless).toMatchObject({ status: 404, data: { error: "Source image not found" } });
    expect((await post({ providerId: "deepai", image: IMAGE })).status).toBe(400);
  });

  it("gives every upload its own name so parallel jobs cannot swap sources", async () => {
    const state = { history: DONE };
    const base = await fakeComfy(state);
    await Promise.all([
      upscaleServer({ image: IMAGE, params: { base } }),
      upscaleServer({ image: IMAGE, params: { base } }),
    ]);
    expect(new Set(state.uploads).size).toBe(2);
  });

  it("reports a ComfyUI execution error immediately", async () => {
    const base = await fakeComfy({
      history: {
        p1: {
          outputs: {},
          status: {
            status_str: "error",
            messages: [["execution_error", { exception_message: "out of memory" }]],
          },
        },
      },
    });
    await expect(upscaleServer({ image: IMAGE, params: { base } })).rejects.toThrow(
      "out of memory",
    );
  });

  describe("while ComfyUI is busy", () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));

    it("does not count time spent in ComfyUI's queue against the timeout", async () => {
      const state = { queue: { queue_running: [], queue_pending: [[1, "p1"]] }, history: {} };
      const base = await fakeComfy(state);
      const result = upscaleServer({ image: IMAGE, params: { base } });
      result.catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      vi.setSystemTime(Date.now() + 600000);
      await new Promise((r) => setTimeout(r, 1600));
      state.queue = { queue_running: [], queue_pending: [] };
      state.history = DONE;
      expect((await result).images).toHaveLength(1);
    });
  });
});
