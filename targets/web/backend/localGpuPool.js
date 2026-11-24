import generateComfy from "../../shared/comfyui/code/generate.js";
import { LOCAL_SERVICES, probeService } from "./localServices.js";

/** One running job per endpoint, shared across all callers. Faster workers take the next job. */
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
    run(endpoints, run, signal) {
      if (!endpoints.length) return Promise.reject(new Error("Select at least one image GPU."));
      return new Promise((resolve, reject) => {
        const onAbort = () => pump();
        const job = {
          endpoints,
          run,
          signal,
          resolve,
          reject,
          cleanup: () => signal?.removeEventListener("abort", onAbort),
        };
        waiting.push(job);
        signal?.addEventListener("abort", onAbort, { once: true });
        pump();
      });
    },
  };
}

const queue = createGpuQueue();
const directJson = async (url, body, signal) => {
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
  const workers = deps.queue || queue;
  const selected = LOCAL_SERVICES.filter(
    (s) =>
      (s.id === "comfy3090" && settings.use3090 !== false) ||
      (s.id === "comfy4090" && settings.use4090 !== false),
  );
  if (!selected.length) throw new Error("Select at least one image GPU in the provider settings.");
  const ready = (
    await Promise.all(selected.map(async (s) => ((await probe(s)).ready ? s : null)))
  ).filter(Boolean);
  if (!ready.length)
    throw new Error(
      "No selected ComfyUI instance is ready. Start one in Settings → Local services.",
    );
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
          const result = await generate({
            prompt,
            settings: {
              ...settings,
              comfyUrl: url,
              batchSize: 1,
              seed: fixedSeed >= 0 ? (fixedSeed + index) % Number.MAX_SAFE_INTEGER : -1,
            },
            signal,
            transport,
          });
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
