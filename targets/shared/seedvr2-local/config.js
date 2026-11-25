import { seedvr2Params } from "./settings.js";

/**
 * SeedVR2 on the RTX 4090 — an upscale-only local provider. It runs a fixed ComfyUI workflow through
 * the local backend's shared GPU queue, so it never overlaps an image render on that card.
 * @module targets/shared/seedvr2-local
 */
export default {
  id: "seedvr2-local",
  label: "SeedVR2 (RTX 4090)",
  description: "Detailed AI upscaling on your local RTX 4090 ComfyUI instance.",
  tier: "api",
  dialect: "plain",
  transport: "local-direct",
  local: true,
  needsKey: false,
  upscaleOnly: true,
  // The backend queues, runs and saves the job; clients submit it and follow its progress.
  upscaleJobs: true,
  // The longest edge its result will have; a source already that large is not offered.
  upscaleTarget: (params) => seedvr2Params(params).target,
  capabilities: { upscale: true },
  loadSettings: () => import("./settings.js").then((m) => m.default),
  loadUpscale: () => import("./code/upscale.js").then((m) => m.default),
};
