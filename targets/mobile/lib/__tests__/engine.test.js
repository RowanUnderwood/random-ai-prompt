/** Regression: an example must show only its own DPL, even when the caller passes full settings. */
import { expandOnce, run } from "../engine.js";

it("keeps auto-added effects and artists out of examples", () => {
  const roll = jest.spyOn(run, "generatePrompts").mockReturnValue({ seed: "1", prompts: ["x"] });
  expect(expandOnce("{color}", { autoAddFx: true, autoAddArtists: true, noAnd: true })).toBe("x");
  expect(roll).toHaveBeenCalledWith(
    expect.objectContaining({ autoAddFx: false, autoAddArtists: false, noAnd: true }),
  );
});