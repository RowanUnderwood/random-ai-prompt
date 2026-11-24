import { LOCAL_SERVICES } from "./localServices.js";

const MODEL_INPUTS = {
  diffusion: { node: "UNETLoader", input: "unet_name" },
  checkpoint: { node: "CheckpointLoaderSimple", input: "ckpt_name" },
};

/** ComfyUI's own loader choices, common to the selected reachable workers. */
export async function listLocalModels(
  { kind = "diffusion", use3090 = true, use4090 = true, signal } = {},
  deps = {},
) {
  const modelInput = Object.hasOwn(MODEL_INPUTS, kind) ? MODEL_INPUTS[kind] : null;
  if (!modelInput) throw new Error("Unknown ComfyUI model type.");
  const selected = LOCAL_SERVICES.filter(
    (service) =>
      (service.id === "comfy3090" && use3090 !== false) ||
      (service.id === "comfy4090" && use4090 !== false),
  );
  if (!selected.length) throw new Error("Select at least one image GPU to list its models.");
  const getInfo =
    deps.getInfo ||
    (async (url) => {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`ComfyUI returned HTTP ${response.status}`);
      return response.json();
    });
  const workers = await Promise.all(
    selected.map(async (service) => {
      try {
        const info = await getInfo(`${service.url}/object_info/${modelInput.node}`);
        const names = info[modelInput.node]?.input?.required?.[modelInput.input]?.[0];
        if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
          throw new Error(`The ${modelInput.node} model list is unavailable`);
        }
        return {
          id: service.id,
          label: service.label,
          available: true,
          models: [...new Set(names)],
        };
      } catch (error) {
        return { id: service.id, label: service.label, available: false, error: error.message };
      }
    }),
  );
  const reachable = workers.filter((worker) => worker.available);
  const models = reachable.length
    ? reachable[0].models.filter((name) =>
        reachable.every((worker) => worker.models.includes(name)),
      )
    : [];
  return {
    models: models.sort((a, b) => a.localeCompare(b)),
    workers: workers.map(({ models: _models, ...worker }) => worker),
    warnings: workers
      .filter((worker) => !worker.available)
      .map((worker) => `${worker.label}: ${worker.error}`),
  };
}
