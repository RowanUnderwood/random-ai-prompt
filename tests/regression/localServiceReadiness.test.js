import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeService, runWithServiceActivity } from "../../targets/web/backend/localServices.js";
import { generateLocalBatch } from "../../targets/web/backend/localGpuPool.js";

const servers = [];
const timers = new Set();
afterEach(async () => {
  vi.restoreAllMocks();
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
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

async function comfyServer(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { id: "comfy3090", port, url: `http://127.0.0.1:${port}` };
}
const reply = (res, data) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};

describe("ComfyUI readiness under load", () => {
  it("checks the queue rather than GPU statistics, and accepts a busy worker", async () => {
    const paths = [];
    const service = await comfyServer((req, res) => {
      paths.push(req.url);
      if (req.url === "/queue")
        return reply(res, { queue_running: [[1, "active-render"]], queue_pending: [] });
      res.statusCode = 503;
      reply(res, { error: "GPU memory statistics unavailable during rendering" });
    });
    expect(await probeService(service)).toMatchObject({ ready: true, occupied: true });
    expect(paths).toEqual(["/queue"]);
  });

  it("does not reject a healthy server just because it takes over two seconds to reply", async () => {
    const service = await comfyServer((req, res) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        reply(
          res,
          req.url === "/queue"
            ? { queue_running: [], queue_pending: [] }
            : { system: {}, devices: [{ name: "RTX 3090" }] },
        );
      }, 2250);
      timers.add(timer);
    });
    expect(await probeService(service)).toMatchObject({ ready: true, occupied: true });
  });

  it("rejects an unrelated service even though its port is open", async () => {
    const service = await comfyServer((_, res) => reply(res, { message: "Some other service" }));
    expect(await probeService(service)).toMatchObject({ ready: false, occupied: true });
  });

  it("shares a concurrent readiness check across UI and batch requests", async () => {
    let requests = 0;
    const service = await comfyServer((_, res) => {
      requests++;
      reply(res, { queue_running: [], queue_pending: [] });
    });
    const results = await Promise.all([
      probeService(service),
      probeService(service),
      probeService(service),
    ]);
    expect(results.every((state) => state.ready)).toBe(true);
    expect(requests).toBe(1);
  });

  it("keeps a verified worker ready during an admitted render without another HTTP probe", async () => {
    let requests = 0;
    const service = await comfyServer((_, res) => {
      requests++;
      reply(res, { queue_running: [], queue_pending: [] });
    });
    expect((await probeService(service)).ready).toBe(true);
    await runWithServiceActivity(service.url, async () => {
      expect(await probeService(service)).toMatchObject({
        ready: true,
        occupied: true,
        busy: true,
      });
      expect(requests).toBe(1);
    });
    await probeService(service);
    expect(requests).toBe(2);
  });

  it("retains recent verified readiness during a transient HTTP failure", async () => {
    let available = true;
    const service = await comfyServer((_, res) => {
      if (!available) return res.destroy();
      reply(res, { queue_running: [], queue_pending: [] });
    });
    expect((await probeService(service)).ready).toBe(true);
    available = false;
    expect(await probeService(service)).toMatchObject({ ready: true, occupied: true, busy: true });
  });

  it("expires fallback readiness instead of keeping a stalled external service ready forever", async () => {
    let available = true;
    const service = await comfyServer((_, res) => {
      if (!available) return res.destroy();
      reply(res, { queue_running: [], queue_pending: [] });
    });
    expect((await probeService(service)).ready).toBe(true);
    available = false;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
    expect(await probeService(service)).toMatchObject({ ready: false, occupied: true });
  });

  it("invalidates recent readiness when the TCP listener closes, even during a render", async () => {
    const service = await comfyServer((_, res) =>
      reply(res, { queue_running: [], queue_pending: [] }),
    );
    expect((await probeService(service)).ready).toBe(true);
    const server = servers.pop();
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
    await runWithServiceActivity(service.url, async () => {
      expect(await probeService(service)).toMatchObject({ ready: false, occupied: false });
    });
  });

  it("invalidates recent readiness on an explicit incompatible response", async () => {
    let compatible = true;
    const service = await comfyServer((_, res) =>
      reply(res, compatible ? { queue_running: [], queue_pending: [] } : { other: "server" }),
    );
    expect((await probeService(service)).ready).toBe(true);
    compatible = false;
    expect(await probeService(service)).toMatchObject({ ready: false, occupied: true });
  });

  it("does not tell users to start servers whose ports are already listening", async () => {
    await expect(
      generateLocalBatch(
        { prompt: "a scene" },
        {
          probe: async () => ({
            ready: false,
            occupied: true,
            reason: "Readiness check timed out",
          }),
        },
      ),
    ).rejects.toThrow("They may still be starting or busy; wait and retry");
  });
});
