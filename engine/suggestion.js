/**
 * @file The random prompt suggestion shared by every target: the prompt box's rotating "Try: …" text
 * and the Random toggle (`settings.autoRandom`). Pure and browser-safe.
 *
 * The toggle adds the UNEXPANDED token to the prompt text, so each prompt in a batch expands it with
 * its own seed and gets its own suggestion. `{#suggestion}` draws on `{#subject}` and `{#style}`, which
 * include the Krea content when a Krea model is selected (see modelContent.js).
 */

/** The DPL block that builds a random suggestion. */
export const SUGGESTION_TOKEN = "{#suggestion}";

/**
 * The prompt text a generate should use.
 * @param {string} typed The prompt box text.
 * @param {boolean} random Whether the Random toggle is on.
 * @returns {string} The typed text plus the suggestion token when on; the token alone when the box is
 *   empty (so an empty box still rolls a new suggestion per prompt).
 */
export function promptWithSuggestion(typed, random) {
  const text = String(typed ?? "").trim();
  if (!text) return SUGGESTION_TOKEN;
  if (!random) return typed;
  return `${text.replace(/,\s*$/, "")}, ${SUGGESTION_TOKEN}`;
}
