import { describe, expect, it, vi } from "vitest";
import { listLocalModels } from "../targets/web/backend/localModelCatalog.js";
import generate from "../targets/shared/comfyui/code/generate.js";

const choices = (names, node = "UNETLoader", input = "unet_name") => ({
  [node]: { input: { required: { [input]: [names] } } },
});

describe("live local model catalogs", () => {
  it("offers exact model filenames common to both selected GPUs", async () => {
    const result = await listLocalModels(
      {},
      {
        getInfo: async (url) =>
          choices(
            url.includes(":8190")
              ? ["b.safetensors", "shared\\a.safetensors", "only3090.safetensors"]
              : ["shared\\a.safetensors", "b.safetensors", "only4090.safetensors"],
          ),
      },
    );
    expect(result.models).toEqual(["b.safetensors", "shared\\a.safetensors"]);
    expect(result.workers).toHaveLength(2);
  });
  it("queries only enabled GPUs and the proper loader for checkpoints", async () => {
    const getInfo = vi.fn(async () =>
      choices(["checkpoint.safetensors"], "CheckpointLoaderSimple", "ckpt_name"),
    );
    expect(
      (await listLocalModels({ kind: "checkpoint", use3090: false }, { getInfo })).models,
    ).toEqual(["checkpoint.safetensors"]);
    expect(getInfo).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:8191/object_info/CheckpointLoaderSimple",
    );
  });
  it("lists a reachable GPU's models and explains which instance could not be read", async () => {
    const result = await listLocalModels(
      {},
      {
        getInfo: async (url) => {
          if (url.includes(":8190")) throw new Error("Instance is stopped");
          return choices(["available.safetensors"]);
        },
      },
    );
    expect(result.models).toEqual(["available.safetensors"]);
    expect(result.warnings[0]).toContain("3090");
  });
  it("returns no models when the selected instances have no common filenames", async () => {
    const result = await listLocalModels({}, { getInfo: async (url) => choices([url]) });
    expect(result.models).toEqual([]);
    expect(result.workers.every((worker) => worker.available)).toBe(true);
  });
  it("rejects unknown loader types and an empty GPU selection without making requests", async () => {
    const getInfo = vi.fn();
    await expect(listLocalModels({ kind: "arbitrary" }, { getInfo })).rejects.toThrow("Unknown");
    await expect(listLocalModels({ use3090: false, use4090: false }, { getInfo })).rejects.toThrow(
      "Select",
    );
    expect(getInfo).not.toHaveBeenCalled();
  });
});

describe("selected ComfyUI model execution", () => {
  const info = () => new Proxy({}, { get: () => ({}) });
  it("sends the chosen Krea UNET filename and records that exact model", async () => {
    let graph;
    const result = await generate({
      prompt: "a forest",
      settings: { comfyWorkflow: "krea2", kreaModel: "Krea 2 fineV5INT8FP8_v5BF16.safetensors" },
      transport: {
        getJson: async (url) =>
          url.endsWith("object_info")
            ? info()
            : { test: { outputs: { 152: { images: [{ filename: "image.png" }] } } } },
        postJson: async (_, body) => {
          graph = body.prompt;
          return { prompt_id: "test" };
        },
      },
    });
    expect(graph["106:1"].inputs.unet_name).toBe("Krea 2 fineV5INT8FP8_v5BF16.safetensors");
    expect(result.imageMeta[0].kreaModel).toBe(graph["106:1"].inputs.unet_name);
  });
  it("does not submit when the chosen diffusion model is missing", async () => {
    const postJson = vi.fn();
    await expect(
      generate({
        prompt: "a forest",
        settings: { comfyWorkflow: "krea2", kreaModel: "missing.safetensors" },
        transport: {
          getJson: async () =>
            new Proxy(
              {},
              {
                get: (_, node) =>
                  node === "UNETLoader" ? choices(["other.safetensors"]).UNETLoader : {},
              },
            ),
          postJson,
        },
      }),
    ).rejects.toThrow("missing.safetensors");
    expect(postJson).not.toHaveBeenCalled();
  });
  it("never silently substitutes a different explicitly selected pool checkpoint", async () => {
    const postJson = vi.fn();
    await expect(
      generate({
        prompt: "a forest",
        settings: { comfyStrictModel: true, comfyCheckpoint: "chosen.safetensors" },
        transport: {
          getJson: async (url) =>
            url.includes("CheckpointLoaderSimple")
              ? choices(["other.safetensors"], "CheckpointLoaderSimple", "ckpt_name")
              : {},
          postJson,
        },
      }),
    ).rejects.toThrow("chosen.safetensors");
    expect(postJson).not.toHaveBeenCalled();
  });
});
