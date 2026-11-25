/** The node accepts even sizes from 16 to 16384; these are its own validity limits, not app caps. */
export const TARGET_MIN = 16;
export const TARGET_MAX = 16384;
export const SEED_MAX = 4294967295;

const defaults = { seedvr2Target: 4000, seedvr2Seed: 4105349922 };

/**
 * The target and seed a job will use. Blank or invalid values fall back to the workflow's own.
 * @param {object} [settings] Provider settings.
 * @returns {{target: number, seed: number}}
 */
export function seedvr2Params(settings = {}) {
  const number = (value, fallback, min, max) => {
    const n = value === "" || value == null ? NaN : Math.floor(Number(value));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const target = number(settings.seedvr2Target, defaults.seedvr2Target, TARGET_MIN, TARGET_MAX);
  return {
    target: target - (target % 2),
    seed: number(settings.seedvr2Seed, defaults.seedvr2Seed, 0, SEED_MAX),
  };
}

export default {
  defaults,
  fields: [
    {
      key: "seedvr2Target",
      label: "Longest edge (pixels)",
      type: "number",
      min: TARGET_MIN,
      max: TARGET_MAX,
      step: 2,
      info: "The upscaled image's longest edge. Larger targets need more VRAM and time.",
    },
    { key: "seedvr2Seed", label: "Seed", type: "number", min: 0, max: SEED_MAX },
  ],
};
