/**
 * @file
 * @brief JS sidecar for d.dpl — danbooru anime tag stream ({d/general-nsfw} + {d/meta}). Adult
 *        tags are never combined with named characters.
 */

import { randomInt } from "../../../helpers/random.js";
import { keywordRepeater } from "../../../helpers/keywordRepeater.js";

/**
 * Build a danbooru tag stream.
 * @param {object} settings The settings.
 * @returns {string} The generated prompt fragment.
 */
export default function (settings) {
  const metaCount = randomInt(0, 2);

  const str = [];
  str.push(keywordRepeater("d/general-nsfw", false, settings));

  for (let i = 0; i < metaCount; i++) str.push(`{d/meta}`);

  return str.join(", ");
}
