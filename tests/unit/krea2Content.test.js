/** @file Krea source integrity and model-aware catalog/engine behavior through real loaders. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { createEngine } from "../../engine/core/engine.js";
import { nodeLoader } from "../../engine/core/nodeLoader.js";
import { metroLoader } from "../../engine/core/metroLoader.js";
import { buildBlocks, buildDplCompletions } from "../../engine/blockCatalog.js";
import { isStableDiffusionSelected, modelContentLoader } from "../../engine/modelContent.js";
import { makeFakeLoader } from "../helpers/fakeLoader.js";
import { resolveListLines } from "../../engine/listResolve.js";

const krea = {
  provider: "comfy-local",
  providerParams: { "comfy-local": { comfyWorkflow: "krea2" } },
  mode: "StableDiffusion",
  keywordEmphasis: false,
  autoAddFx: false,
  autoAddArtists: false,
};
const sd = { ...krea, provider: "forge" };
const tokens = (loader, settings) =>
  buildDplCompletions(loader, settings).map(({ token }) => token);

describe("Krea 2 source content", () => {
  it("rebuilds offline and accounts for every source identity without portrait framing or duplicates", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/build-krea2-content.mjs", "--check"]),
    ).not.toThrow();
    const audit = JSON.parse(
      fs.readFileSync(
        new URL("../../engine/data/sources/krea2/identity-audit.json", import.meta.url),
      ),
    );
    const people = nodeLoader.readListLines("krea2/people");
    const bands = nodeLoader.readListLines("krea2/bands");
    expect(audit).toHaveLength(1232);
    expect(people).toHaveLength(new Set(people).size);
    expect(bands).toHaveLength(new Set(bands).size);
    for (const row of audit)
      expect(row.family === "bands" ? bands : people).toContain(row.identity);
    expect(people).toContain("Dwayne Johnson");
    expect(people).not.toContain("The Rock");
    expect(people).not.toContain("The Cranberries");
    expect(bands).toContain("The Cranberries");
    expect(bands).toContain("10000 Maniacs");
    expect([...people, ...bands].join(" ")).not.toMatch(/chest up|gray background|look at camera/);
    expect(nodeLoader.groupListDirs()).not.toContain("krea2");
  });

  it("preserves all 288 complete normalized descriptors", () => {
    const source = JSON.parse(
      fs.readFileSync(
        new URL("../../engine/data/sources/krea2/styles-source.json", import.meta.url),
      ),
    );
    expect(nodeLoader.readListLines("krea2/styles")).toEqual(
      source.styles.map(({ descriptor }) =>
        descriptor.replace(/[()]/g, "").replace(/\s+/g, " ").trim(),
      ),
    );
    expect(source.styles).toHaveLength(288);
  });
});

describe("model-aware Krea visibility", () => {
  it("clears depleted list state when direct expand callers switch image models", () => {
    const engine = createEngine(nodeLoader);
    const direct = {
      ...krea,
      listEntriesUsedOnce: true,
      promptModules: ["block", "list", "cleanup"],
    };
    expect(engine.expand("{krea2/people}", direct, {}, {}).length).toBeGreaterThan(0);
    expect(engine.expand("{krea2/people}", { ...direct, ...sd }, {}, {})).toBe("");
    expect(engine.expand("{krea2/people}", direct, {}, {}).length).toBeGreaterThan(0);
  });
  it("excludes Krea content from union wildcards and nested groups with model-specific cache entries", () => {
    const descriptor = nodeLoader.readListLines("krea2/styles")[0];
    for (const loader of [nodeLoader, metroLoader]) {
      expect(loader.readListLines("keyword", false, krea)).toContain(descriptor);
      expect(loader.readListLines("keyword", false, sd)).not.toContain(descriptor);
      expect(loader.readListLines("keyword", false, krea)).toContain(descriptor);
    }
    const readers = {
      names: ["mixed", "ordinary", "krea2/people"],
      readListFile: (name) =>
        name === "ordinary" ? ["SAFE"] : name === "krea2/people" ? ["KREA"] : null,
      readGroupFile: (name) => (name === "mixed" ? ["ordinary", "krea2/people"] : null),
      contentSettings: sd,
    };
    expect(resolveListLines("mixed", readers)).toEqual(["SAFE"]);
  });
  it.each([
    [krea, false],
    [sd, true],
    [{ ...krea, providerParams: { "comfy-local": { comfyWorkflow: "checkpoint" } } }, true],
    [{ provider: "stability" }, true],
    [{ mode: "StableDiffusion" }, true],
    [{ provider: "openai", mode: "StableDiffusion" }, false],
    [
      {
        provider: "comfyui",
        providerParams: { comfyui: { comfyCheckpoint: "sdxl_base.safetensors" } },
      },
      true,
    ],
    [
      {
        provider: "comfyui",
        providerParams: { comfyui: { comfyCheckpoint: "flux-dev.safetensors" } },
      },
      false,
    ],
  ])("distinguishes model selection from prompt syntax: %j", (settings, expected) => {
    expect(isStableDiffusionSelected(settings)).toBe(expected);
  });

  it("hides Krea content from both catalogs and completions for SD, then restores it", () => {
    for (const loader of [nodeLoader, metroLoader]) {
      expect(tokens(loader, krea)).toContain("{#krea2-actors}");
      expect(tokens(loader, krea)).toContain("{#krea2-style-library}");
      expect(tokens(loader, krea)).toContain("{krea2/bands}");
      expect(tokens(loader, sd).filter((token) => token.includes("krea2"))).toEqual([]);
      expect(
        modelContentLoader(loader, () => sd)
          .listNames()
          .some((name) => name.includes("krea2")),
      ).toBe(false);
      expect(
        buildBlocks(loader, krea)[0].items.find((item) => item.token === "{#subject}"),
      ).toBeTruthy();
    }
  });

  it("expands identities/styles consistently across Node and mobile and switches without stale cached results", () => {
    const node = createEngine(nodeLoader);
    const mobile = createEngine(metroLoader);
    const people = nodeLoader.readListLines("krea2/people");
    const styles = nodeLoader.readListLines("krea2/styles");
    for (let seed = 0; seed < 12; seed++) {
      for (const prompt of ["{#krea2-actors}", "{#krea2-style-library}", "{krea2/bands}"]) {
        const options = { ...krea, prompt, seed };
        const output = node.generate(options);
        expect(mobile.generate(options)).toBe(output);
        expect(output.length).toBeGreaterThan(0);
        if (prompt === "{#krea2-actors}") expect(people).toContain(output);
        if (prompt === "{#krea2-style-library}")
          expect(styles).toContain(output.slice("Style: ".length));
        expect(node.generate({ ...options, ...sd })).toBe("");
        expect(node.generate(options)).toBe(output);
      }
    }
  });

  it("excludes Krea blocks from group/any picks and list wildcards rather than picking an empty item", () => {
    const loader = {
      ...makeFakeLoader({
        blocks: {
          "subject/krea2-actors": { default: () => "KREA" },
          "subject/person": { default: () => "PERSON" },
        },
        lists: { "krea2/people": ["KREA"], ordinary: ["ORDINARY"] },
      }),
      blockGroupDirs: () => ["subject"],
    };
    const engine = createEngine(loader);
    for (let seed = 0; seed < 30; seed++) {
      for (const prompt of ["{#subject}", "{#any}", "{#any-sfw}"]) {
        expect(engine.generate({ ...sd, prompt, seed })).toBe("PERSON");
      }
      expect(engine.generate({ ...sd, prompt: "{keyword}", keywordsFilename: false, seed })).toBe(
        "ORDINARY",
      );
    }
    expect(engine.generate({ ...sd, prompt: "{#krea2-actors}, {people}", seed: 1 })).toBe("");
  });
});
