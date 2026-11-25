import { describe, expect, it } from "vitest";
import {
  describeSize,
  ratioById,
  RATIO_GROUPS,
  sizeFor,
} from "../../targets/shared/comfy-local/sizes.js";
import settings from "../../targets/shared/comfy-local/settings.js";
import { findProvider } from "../../targets/shared/index.js";

const ratios = RATIO_GROUPS.flatMap((g) => g.ratios);

describe("Krea sizes", () => {
  it("lists each ratio once", () => {
    expect(ratios).toHaveLength(14);
    expect(new Set(ratios.map((r) => r.w / r.h)).size).toBe(14);
    expect(new Set(ratios.map((r) => r.id)).size).toBe(14);
  });

  it.each([256, 512, 640, 768, 864, 1024, 1080, 1440, 2048])(
    "reads every ratio back from its pixels at a %i px short edge",
    (edge) => {
      for (const ratio of ratios) {
        const { width, height } = sizeFor(edge, ratio);
        expect([width % 8, height % 8]).toEqual([0, 0]);
        expect(describeSize(width, height).ratio?.id).toBe(ratio.id);
        expect(describeSize(width, height).shortEdge).toBe(Math.min(width, height));
      }
    },
  );

  it("keeps existing saved and default sizes exactly", () => {
    expect(describeSize(1024, 768)).toMatchObject({ shortEdge: 768, ratio: { id: "4:3" } });
    const { imageWidth, imageHeight } = settings.defaults;
    expect(describeSize(imageWidth, imageHeight)).toMatchObject({
      shortEdge: 864,
      ratio: { id: "16:9" },
    });
  });

  it("uses the short edge for height in landscape and width in portrait, snapping to 8", () => {
    expect(sizeFor(768, ratioById("2.39:1"))).toEqual({ width: 1832, height: 768 });
    expect(sizeFor(768, ratioById("2:3"))).toEqual({ width: 768, height: 1152 });
    expect(sizeFor(771, ratioById("1:1"))).toEqual({ width: 768, height: 768 });
  });

  it("treats unlisted proportions as custom and preserves them when resized", () => {
    expect(describeSize(800, 1280).ratio).toBeNull();
    expect(sizeFor(400, { w: 800, h: 1280 })).toEqual({ width: 400, height: 640 });
  });

  it("survives shared-settings folding into the provider schema", async () => {
    const schema = await findProvider("comfy-local").loadSettings();
    expect(schema.shortEdgeSize).toEqual({ workflow: "krea2" });
  });
});
