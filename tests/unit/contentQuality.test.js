/**
 * Quality checks over the real prompt content: nothing blank, nothing duplicated in the curated lists,
 * and every reference a block makes resolves.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeLoader } from "../../engine/core/nodeLoader.js";
import { metroLoader } from "../../engine/core/metroLoader.js";
import { classifyRemoval } from "../../engine/contentSafety.js";
import { resolveListLines, resolveName } from "../../engine/listManifest.js";

const BLOCKS = path.resolve("engine/data/blocks");
const lists = nodeLoader.listNames();
const blocks = nodeLoader.blockNames();

describe("lists", () => {
  it.each([
    ["Node", nodeLoader],
    ["Metro", metroLoader],
  ])("never yield blank entries (%s)", (_, loader) => {
    for (const name of loader.listNames())
      for (const adult of [true, false])
        for (const line of loader.readListLines(name, adult) || [])
          if (!line.trim()) expect.fail(`${name} has a blank entry`);
  });

  it("drop blank lines in plain and NSFW-paired lists, but keep a missing list missing", () => {
    const files = { a: ["x", "", " ", "y", ""], b: ["s", ""], "b-nsfw": ["n", ""] };
    const readers = {
      names: ["a", "b"],
      readListFile: (n) => files[n] ?? null,
      readGroupFile: () => null,
    };
    expect(resolveListLines("a", readers)).toEqual(["x", "y"]);
    expect(resolveListLines("b", readers, false)).toEqual(["s"]);
    expect(resolveListLines("b", readers, true)).toEqual(["s", "n"]);
    expect(resolveListLines("none", readers)).toBeNull();
  });

  const curated = [
    "look/color",
    "style/general",
    "artist/secondary",
    "style/construct",
    "nature/water",
    "nature/animal-behavior",
    ...["view", "weather", "time", "calendar", "mood", "expression", "shot", "lens"].map(
      (n) => `look/${n}`,
    ),
    ...lists.filter((n) => /^(people|thing|activity)\//.test(n)),
  ];
  it("offer enough variety in the curated lists", () => {
    const short = ["people/noun", "people/age", "people/build"];
    for (const name of curated.filter((n) => !short.includes(n)))
      expect([name, nodeLoader.readListLines(name, true).length >= 25]).toEqual([name, true]);
  });

  it("keep suggestive expressions out while NSFW is off", () => {
    const read = (adult) => nodeLoader.readListLines("expression", adult);
    expect(read(false)).toContain("soft smile");
    expect(read(false)).not.toContain("seductive smile");
    expect(read(true)).toEqual(expect.arrayContaining(["soft smile", "seductive smile"]));
  });

  it("contain nothing the content-safety filter would remove", () => {
    for (const name of curated)
      for (const line of nodeLoader.readListLines(name, false))
        expect([name, line, classifyRemoval(line, { listType: "content" })]).toEqual([
          name,
          line,
          null,
        ]);
  });

  it.each(curated)("%s has no repeated entries", (name) => {
    const lines = nodeLoader.readListLines(name, true).map((l) => l.trim().toLowerCase());
    expect(lines.filter((l, i) => lines.indexOf(l) !== i)).toEqual([]);
  });
});

describe("blocks", () => {
  const sources = fs
    .readdirSync(BLOCKS, { recursive: true })
    .map(String)
    .filter((f) => /\.(dpl|js)$/.test(f))
    .map((f) => [
      f,
      fs
        .readFileSync(path.join(BLOCKS, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\/|^\s*(\/\/|;).*$/gm, ""),
    ]);
  const runtimeTokens = new Set(["tok", "keyword", "artist"]);

  it("reference only lists that exist", () => {
    const missing = [];
    for (const [file, text] of sources)
      for (const [, ref] of text.matchAll(/(?<!\$)\{([a-z0-9][a-z0-9/-]*)\}/g))
        if (!runtimeTokens.has(ref) && !lists.includes(resolveName(ref, lists)))
          missing.push(`${file}: {${ref}}`);
    expect(missing).toEqual([]);
  });

  it("reference only blocks and groups that exist", () => {
    const known = [...blocks, ...nodeLoader.blockGroupDirsAll()];
    const missing = [];
    for (const [file, text] of sources)
      for (const [, ref] of text.matchAll(/\{#([\w/-]+)/g))
        if (!known.includes(resolveName(ref, known))) missing.push(`${file}: {#${ref}}`);
    expect(missing).toEqual([]);
  });
});
