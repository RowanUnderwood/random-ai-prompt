/** Fixed local launch profiles. Never accept command lines or executable paths from HTTP clients. */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
export const LOCAL_SERVICES = [
  {
    id: "ninfer",
    label: "NInfer Qwen · RTX 5090",
    port: 1234,
    launcher: "H:\\Ninfer Qwen\\launch-ninfer.bat",
  },
  {
    id: "comfy3090",
    label: "ComfyUI · RTX 3090",
    port: 8190,
    launcher: "H:\\Qwen video harness\\launchers\\comfy_image_3090.bat",
  },
  {
    id: "comfy4090",
    label: "ComfyUI · RTX 4090",
    port: 8191,
    launcher: "H:\\Qwen video harness\\launchers\\comfy_4090.bat",
  },
].map((s) => ({ ...s, url: `http://127.0.0.1:${s.port}` }));

const pendingProbes = new Map();
const verifiedServices = new Map();
const activeServices = new Map();
const RECENT_READY_MS = 60000;

/** A render already admitted by the pool is proof of activity, not a reason to probe its GPU. */
export async function runWithServiceActivity(url, run) {
  activeServices.set(url, (activeServices.get(url) || 0) + 1);
  try {
    return await run();
  } finally {
    const remaining = activeServices.get(url) - 1;
    if (remaining) activeServices.set(url, remaining);
    else activeServices.delete(url);
  }
}

/** Share concurrent UI/batch checks so a batch does not flood the same server with probes. */
export function probeService(service) {
  const key = `${service.id}:${service.url}:${service.port}`;
  if (!pendingProbes.has(key)) {
    const pending = probeServiceNow(service, key).finally(() => pendingProbes.delete(key));
    pendingProbes.set(key, pending);
  }
  return pendingProbes.get(key);
}

async function probeServiceNow(service, key) {
  const occupied = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: service.port });
    socket.setTimeout(1000);
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
  if (!occupied) {
    verifiedServices.delete(key);
    return { ready: false, occupied: false, reason: "Port is not listening" };
  }
  const verifiedAt = verifiedServices.get(key);
  if (verifiedAt !== undefined && activeServices.has(service.url)) {
    return { ready: true, occupied: true, busy: true, reason: "" };
  }
  try {
    // /system_stats synchronously queries CUDA memory on every visible GPU in this install.
    // Under load that can stall or time out even while ComfyUI is serving generation requests.
    // /queue only reads the prompt queue; non-empty queues mean busy, not unavailable.
    const response = await fetch(
      `${service.url}/${service.id === "ninfer" ? "v1/models" : "queue"}`,
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await response.json();
    const ready =
      response.ok &&
      (service.id === "ninfer"
        ? data.data?.some((m) => m.id === "qwen3.8-27b")
        : Array.isArray(data.queue_running) && Array.isArray(data.queue_pending));
    if (ready) verifiedServices.set(key, Date.now());
    else verifiedServices.delete(key);
    return {
      ready: !!ready,
      occupied: true,
      reason: ready
        ? ""
        : response.ok
          ? "Unexpected readiness response"
          : `HTTP ${response.status}`,
    };
  } catch (error) {
    // ComfyUI can also stall on model loading or another client's synchronous GPU-stat query.
    // Retain recent verified readiness only for transient transport errors and an open TCP port.
    if (
      error.name !== "SyntaxError" &&
      verifiedAt !== undefined &&
      Date.now() - verifiedAt < RECENT_READY_MS
    ) {
      return {
        ready: true,
        occupied: true,
        busy: true,
        reason: "Using recent readiness while the server is slow",
      };
    }
    if (error.name === "SyntaxError") verifiedServices.delete(key);
    return {
      ready: false,
      occupied: true,
      reason: ["TimeoutError", "AbortError"].includes(error.name)
        ? "Readiness check timed out"
        : "Readiness request failed",
    };
  }
}

export function createServiceManager({
  probe = probeService,
  launch = (service) => {
    if (process.platform !== "win32" || process.env.RAP_DESKTOP !== "1") {
      throw new Error("Launching local services requires the Windows desktop app.");
    }
    if (!fs.existsSync(service.launcher))
      throw new Error(`Launcher not found: ${service.launcher}`);
    if (
      service.id === "ninfer" &&
      !/^set\s+"BACKEND=windows"/im.test(fs.readFileSync(service.launcher, "utf8"))
    ) {
      throw new Error(
        "Managed NInfer launch requires BACKEND=windows. WSL services can be connected manually.",
      );
    }
    const logDir = path.resolve("user", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const log = fs.openSync(path.join(logDir, `${service.id}.log`), "a");
    try {
      // Only fixed, trusted .bat paths above reach cmd.exe. The desktop's Windows Job owns descendants.
      return spawn("cmd.exe", ["/d", "/s", "/c", `call "${service.launcher}"`], {
        cwd: path.dirname(service.launcher),
        windowsVerbatimArguments: true,
        windowsHide: true,
        stdio: ["ignore", log, log],
      });
    } finally {
      fs.closeSync(log);
    }
  },
  kill = async (child) => {
    // A live ChildProcess reference is the ownership proof; never kill by port or executable name.
    if (child.exitCode !== null || child.signalCode !== null) return;
    await execFileP("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  },
} = {}) {
  const owned = new Map();
  const locks = new Map();
  const errors = new Map();
  const find = (id) => {
    const service = LOCAL_SERVICES.find((s) => s.id === id);
    if (!service) throw new Error("Unknown local service.");
    return service;
  };
  const serial = (id, fn) => {
    const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    locks.set(id, next);
    return next.finally(() => {
      if (locks.get(id) === next) locks.delete(id);
    });
  };
  return {
    async status() {
      return Promise.all(
        LOCAL_SERVICES.map(async (s) => ({
          ...s,
          ...(await probe(s)),
          owned: owned.has(s.id),
          error: errors.get(s.id) || "",
        })),
      );
    },
    start(id) {
      return serial(id, async () => {
        const service = find(id);
        const state = await probe(service);
        if (state.ready) return; // Reuse it, without adopting ownership.
        if (owned.has(id)) return; // Already loading; repeated clicks must not launch duplicates.
        if (state.occupied)
          throw new Error(
            `${service.url} is occupied by an incompatible or loading server. No duplicate was launched.`,
          );
        errors.delete(id);
        const child = launch(service);
        owned.set(id, child);
        const release = () => {
          if (owned.get(id) === child) owned.delete(id);
        };
        child.once("error", (error) => {
          errors.set(id, error.message);
          release();
        });
        child.once("exit", (code) => {
          if (owned.get(id) === child && code)
            errors.set(id, `Launcher exited (${code}). See user/logs/${id}.log.`);
          release();
        });
      });
    },
    stop(id) {
      return serial(id, async () => {
        find(id);
        const child = owned.get(id);
        if (!child) throw new Error("This service was not launched by this app; leave it running.");
        await kill(child);
        if (owned.get(id) === child) owned.delete(id);
      });
    },
  };
}

export const localServices = createServiceManager();
