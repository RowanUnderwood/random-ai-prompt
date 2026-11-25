/**
 * @file Kinetics action content: real loader expansion, correlated activity details,
 * preservation of the existing action list, seeded Node/mobile parity and catalog visibility.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { createEngine } from "../../engine/core/engine.js";
import { nodeLoader } from "../../engine/core/nodeLoader.js";
import { metroLoader } from "../../engine/core/metroLoader.js";
import { buildDplCompletions } from "../../engine/blockCatalog.js";

const curated = JSON.parse(
  fs.readFileSync(
    new URL("../../engine/data/sources/kinetics/curated-actions.json", import.meta.url),
  ),
);
const phrases = Object.values(curated).flatMap((entries) => entries.map(({ text }) => text));
const node = createEngine(nodeLoader);
const mobile = createEngine(metroLoader);
const settings = {
  prompt: "{#action}",
  keywordEmphasis: false,
  autoAddArtists: false,
  autoAddFx: false,
};

describe("Kinetics action block", () => {
  it("keeps generated lists synchronized with verified source labels", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/build-kinetics-actions.mjs", "--check"]),
    ).not.toThrow();
    for (const [family, entries] of Object.entries(curated)) {
      expect(nodeLoader.readListLines(`activity/${family}`, false)).toEqual(
        entries.map(({ text }) => text),
      );
    }
  });

  it("emits exactly one complete curated activity and reaches every family", () => {
    const output = Array.from({ length: 120 }, (_, seed) => node.generate({ ...settings, seed }));
    for (const text of output) expect(phrases).toContain(text);
    for (const entries of Object.values(curated)) {
      expect(output.some((text) => entries.some((entry) => entry.text === text))).toBe(true);
    }
  });

  it("retains the legacy {action} list rather than shadowing it with a new group", () => {
    const original = fs
      .readFileSync(new URL("../../engine/data/lists/look/action.txt", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    expect(nodeLoader.readListLines("action", false)).toEqual(original);
    expect(original).toContain(node.generate({ ...settings, prompt: "{action}", seed: 42 }));
  });

  it("composes with a human subject and remains usable at both dial extremes", () => {
    for (const dial of [1, 100]) {
      const output = node.generate({
        ...settings,
        prompt: `a person, {#action i${dial}% f${dial}%}`,
        seed: "compose",
      });
      expect(output, `dial ${dial}`).toMatch(/^a person, /);
      expect(phrases).toContain(output.slice("a person, ".length));
    }
  });

  it("has identical seeded output through the Node and mobile loaders in both adult modes", () => {
    for (const includeAdult of [false, true]) {
      for (let seed = 0; seed < 24; seed++) {
        const options = { ...settings, seed, includeAdult };
        const output = node.generate(options);
        expect(mobile.generate(options)).toBe(output);
        expect(node.generate(options)).toBe(output);
      }
    }
  });

  it("exposes the block and the prefixed family lists in the shared completion catalog", () => {
    for (const loader of [nodeLoader, metroLoader]) {
      const tokens = buildDplCompletions(loader).map(({ token }) => token);
      expect(tokens).toContain("{#action}");
      for (const family of Object.keys(curated)) expect(tokens).toContain(`{activity/${family}}`);
    }
  });
});
