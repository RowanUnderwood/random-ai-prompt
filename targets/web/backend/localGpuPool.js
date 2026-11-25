import generateComfy from "../../shared/comfyui/code/generate.js";
import { LOCAL_SERVICES, probeService, runWithServiceActivity } from "./localServices.js";

/**
 * One running job per endpoint, shared across all callers. Faster workers take the next job.
 * A higher-priority job goes ahead of lower-priority ones still waiting; it never interrupts a
 * running job, and jobs of equal priority keep their arrival order.
 */
export function createGpuQueue() {
  const busy = new Set();
  const waiting = [];
  const pump = () => {
    for (let i = 0; i < waiting.length;) {
      const job = waiting[i];
      if (job.signal?.aborted) {
        waiting.splice(i, 1);
        job.cleanup();
        job.reject(job.signal.reason);
        continue;
      }
      const endpoint = job.endpoints.find((e) => !busy.has(e));
      if (!endpoint) {
        i++;
        continue;
      }
      waiting.splice(i, 1);
      job.cleanup();
      busy.add(endpoint);
      Promise.resolve()
        .then(() => job.run(endpoint))
        .then(job.resolve, job.reject)
        .finally(() => {
          busy.delete(endpoint);
          pump();
        });
    }
  };
  return {
    /** How many jobs stand between a waiting job and its endpoint (0 once it is running or unknown). */
    ahead(id) {
      const index = waiting.findIndex((job) => job.id !== undefined && job.id === id);
      if (index < 0) return 0;
      const { endpoints } = waiting[index];
      const shares = (job) => job.endpoints.some((e) => endpoints.includes(e));
      return (
        waiting.slice(0, index).filter(shares).length +
        (endpoints.every((e) => busy.has(e)) ? 1 : 0)
      );
    },
    run(endpoints, run, signal, { priority = 0, id } = {}) {
      if (!endpoints.length) return Promise.reject(new Error("Select at least one image GPU."));
      return new Promise((resolve, reject) => {
        const onAbort = () => pump();
        const job = {
          endpoints,
          run,
          signal,
          priority,
          id,
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener("abort", onAbort),
        };
        const behind = waiting.findIndex((other) => other.priority < priority);
        waiting.splice(behind < 0 ? waiting.length : behind, 0, job);
        signal?.addEventListener("abort", onAbort, { once: true });
        pump();
      });
    },
  };
}

/** The one queue every local GPU job goes through: image batches and upscales alike. */
export const gpuQueue = createGpuQueue();
export const directJson = async (url, body, signal) => {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      data.error?.message ||
        JSON.stringify(data.node_errors || data.error) ||
        `ComfyUI returned ${res.status}`,
    );
  return data;
};
const transport = {
  getJson: (url, signal) => directJson(url, null, signal),
  postJson: (url, body, signal) => directJson(url, body, signal),
};

export async function generateLocalBatch({ prompt, settings = {}, signal }, deps = {}) {
  const probe = deps.probe || probeService;
  const generate = deps.generate || generateComfy;
  const workers = deps.queue || gpuQueue;
  const selected = LOCAL_SERVICES.filter(
    (s) =>
      (s.id === "comfy3090" && settings.use3090 !== false) ||
      (s.id === "comfy4090" && settings.use4090 !== false),
  );
  if (!selected.length) throw new Error("Select at least one image GPU in the provider settings.");
  const checked = await Promise.all(
    selected.map(async (service) => ({ service, state: await probe(service) })),
  );
  const ready = checked.filter(({ state }) => state.ready).map(({ service }) => service);
  if (!ready.length) {
    if (checked.some(({ state }) => state.occupied)) {
      const details = checked
        .map(({ service, state }) => `${service.label}: ${state.reason || "not ready"}`)
        .join("; ");
      throw new Error(
        `Selected ComfyUI instances are listening but not responding as ready. They may still be starting or busy; wait and retry. ${details}`,
      );
    }
    throw new Error(
      "No selected ComfyUI instance is ready. Start one in Settings → Local services.",
    );
  }
  const count = Number(settings.batchSize ?? 1);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("Images per prompt must be a positive integer.");
  const fixedSeed = Number(settings.seed ?? -1);
  // Split even a single prompt's image batch, rather than sending the entire batch to one GPU.
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, index) =>
      workers.run(
        ready.map((s) => s.url),
        async (url) => {
          signal?.throwIfAborted();
          const service = ready.find((s) => s.url === url);
          const result = await runWithServiceActivity(url, () =>
            generate({
              prompt,
              settings: {
                ...settings,
                comfyUrl: url,
                comfyStrictModel: true,
                batchSize: 1,
                seed: fixedSeed >= 0 ? (fixedSeed + index) % Number.MAX_SAFE_INTEGER : -1,
              },
              signal,
              transport,
            }),
          );
          return {
            ...result,
            imageMeta: result.images.map((_, i) => ({
              ...result.imageMeta?.[i],
              localGpu: service.label,
              batchSize: 1,
            })),
          };
        },
        signal,
      ),
    ),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failures = results.filter((r) => r.status === "rejected");
  if (!succeeded.length) throw new Error(failures[0]?.reason?.message || "No images generated.");
  return {
    images: succeeded.flatMap((r) => r.images),
    imageMeta: succeeded.flatMap((r) => r.imageMeta),
    warnings: failures.map((r) => r.reason?.message || String(r.reason)),
  };
}
