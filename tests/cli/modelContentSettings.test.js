/** @file CLI model visibility reads the selected provider's saved workflow without writing user data. */
import { describe, it, expect, vi } from "vitest";
const saved = vi.hoisted(() => new Map());
vi.mock("../../targets/cli/src/lib/store.js", () => ({ read: (name) => saved.get(name) || null }));
import { effectiveSettings } from "../../targets/cli/src/lib/settings.js";
import { isStableDiffusionSelected } from "../../engine/modelContent.js";

describe("CLI model context", () => {
  it("passes the active provider's saved workflow into prompt generation without mixing other providers", () => {
    saved.set("providers/comfy-local", { comfyWorkflow: "checkpoint" });
    saved.set("providers/openai", { model: "another-model" });
    const selected = effectiveSettings({ shareGui: false, overrides: { provider: "comfy-local" } });
    expect(selected.providerParams).toEqual({ "comfy-local": { comfyWorkflow: "checkpoint" } });
    expect(isStableDiffusionSelected(selected)).toBe(true);
    saved.set("providers/comfy-local", { comfyWorkflow: "krea2" });
    expect(
      isStableDiffusionSelected(
        effectiveSettings({ shareGui: false, overrides: { provider: "comfy-local" } }),
      ),
    ).toBe(false);
    saved.clear();
  });
});
