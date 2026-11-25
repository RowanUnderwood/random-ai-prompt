import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { generate, ingest, roll } = vi.hoisted(() => ({
  generate: vi.fn(),
  ingest: vi.fn(),
  roll: vi.fn(),
}));
vi.mock("../../frontend/lib/providers/index.js", () => ({
  getProvider: () => ({
    id: "comfy-local",
    capabilities: { seed: true },
    loadGenerate: async () => generate,
  }),
}));
vi.mock("../../frontend/lib/output.js", () => ({ ingestImage: ingest }));
vi.mock("../../frontend/lib/promptEngine.js", () => ({ generatePrompt: roll }));
import { deriveImage } from "../../frontend/lib/derive.js";

beforeEach(() => {
  vi.clearAllMocks();
  generate.mockResolvedValue({ images: ["new.png"], imageMeta: [{ seed: 987, localGpu: "4090" }] });
  ingest.mockResolvedValue("/api/output/child.png");
});
afterEach(() => vi.restoreAllMocks());
const item = {
  name: "parent",
  meta: {
    provider: "comfy-local",
    prompt: { dpl: "{animal}", final: "original prompt" },
    negative: { final: "original negative" },
    settings: {
      seed: 42,
      batchSize: 4,
      kreaModel: "saved-model.safetensors",
      imageWidth: 1024,
      imageHeight: 768,
      imageSteps: 12,
      cfg: 1,
      comfyWorkflow: "krea2",
    },
  },
};
describe("render another generation recipe", () => {
  it("uses saved model/dimensions, one fresh image, verbatim edits and ancestry metadata", async () => {
    await deriveImage({
      item,
      kind: "variation",
      source: "final",
      settings: {
        providerParams: {
          "comfy-local": { kreaModel: "current-model.safetensors", imageWidth: 512 },
        },
      },
      promptEdits: { prompt: "edited prompt", negativePrompt: "" },
    });
    const request = generate.mock.calls[0][0];
    expect(request.prompt).toBe("edited prompt");
    expect(request.settings).toMatchObject({
      kreaModel: "saved-model.safetensors",
      imageWidth: 1024,
      imageHeight: 768,
      imageSteps: 12,
      cfg: 1,
      batchSize: 1,
      negativePrompt: "",
    });
    expect(request.settings.seed).not.toBe(42);
    expect(roll).not.toHaveBeenCalled();
    const meta = ingest.mock.calls[0][1];
    expect(meta).toMatchObject({
      parent: "parent",
      derivedKind: "variation",
      prompt: { final: "edited prompt", dpl: null },
      negative: { final: null },
      settings: { seed: 987, localGpu: "4090", negativePrompt: "" },
    });
    expect(item.meta.prompt.final).toBe("original prompt");
    expect(item.meta.settings.seed).toBe(42);
  });
  it("does not submit an empty edited prompt", async () => {
    await expect(
      deriveImage({
        item,
        kind: "variation",
        source: "final",
        settings: {},
        promptEdits: { prompt: " ", negativePrompt: "" },
      }),
    ).rejects.toThrow("prompt layer");
    expect(generate).not.toHaveBeenCalled();
  });
  it("guarantees a new seed even if randomness initially matches the source seed", async () => {
    vi.spyOn(Math, "random").mockReturnValue(42 / 1e15);
    await deriveImage({
      item,
      kind: "variation",
      source: "final",
      settings: {},
      promptEdits: { prompt: "another fox", negativePrompt: "" },
    });
    expect(generate.mock.calls[0][0].settings.seed).toBe(43);
  });
});
