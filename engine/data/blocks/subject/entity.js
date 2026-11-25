/**
 * @file
 * @brief JS sidecar for entity.dpl — the polymorphic subject type-system (picks animal / flower /
 *        instrument / creature / tree / described adult). Reused by the animal/person/living-entity/
 *        entity-name wrappers. Named anime characters live in anime-character.dpl only.
 */

import { randomInt, randomFloat } from "../../../helpers/random.js";

// People appear twice where they used to share their odds with named characters.
const pools = {
  any: ["animal", "flower", "instrument", "creature", "tree", "person", "person"],
  human: ["person"],
  animal: ["animal", "creature"],
  living: ["animal", "creature", "person", "person"],
};

const named = {
  animal: "{animal}",
  flower: "{#color} {flower}",
  instrument: "{instrument}",
  creature: "{mythological-creature}",
  tree: "{tree}",
};

// A described adult, instead of the bare word "person".
function describedAdult() {
  let out = "{people/age} {people/heritage} {people/noun}";
  if (randomFloat() < 0.4) out += ", {people/build}";
  if (randomFloat() < 0.6) out += ", with {people/feature}";
  if (randomFloat() < 0.6) out += ", wearing {people/outfit}";
  if (randomFloat() < 0.4) out += ", {emotion}";
  return out;
}

/**
 * Generate an entity subject.
 * @param {object} settings Settings.
 * @param {object} imageSettings Image settings.
 * @param {object} upscaleSettings Upscale settings.
 * @param {string} [specificEntity] One of "human" | "animal" | "living" to restrict the pool.
 * @param {boolean} [nameOnly] Emit just the subject token (no description).
 * @returns {string} The generated prompt fragment.
 */
export default function (settings, imageSettings, upscaleSettings, specificEntity, nameOnly) {
  const pool = Object.hasOwn(pools, specificEntity) ? pools[specificEntity] : pools.any;
  const kind = pool[randomInt(0, pool.length - 1)];
  if (kind !== "person") return named[kind];
  // Called as a block, the last two arguments are the intensity and focus dials, not options.
  return nameOnly === true ? "{people/occupation}" : describedAdult();
}
