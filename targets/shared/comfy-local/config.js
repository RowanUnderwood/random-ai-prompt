export default {
  id: "comfy-local",
  label: "Local GPUs (3090 + 4090)",
  description:
    "Divide image batches across your local ComfyUI instances. Optional Krea 2 workflow.",
  tier: "api",
  dialect: "plain",
  transport: "local-direct",
  local: true,
  needsKey: false,
  concurrencyDefault: 4,
  capabilities: {
    negativePrompt: true,
    steps: true,
    cfg: true,
    seed: true,
    size: "freeform",
    batch: { min: 1, max: 8 },
  },
  loadSettings: () => import("./settings.js").then((m) => m.default),
  loadGenerate: () => import("./code/generate.js").then((m) => m.default),
};
