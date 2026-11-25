/**
 * Quality checks over the real prompt content: nothing blank, nothing duplicated in the curated lists,
 * and every reference a block makes resolves.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeLoader } from "../../engine/core/nodeLoader.js";
import { metroLoader } from "../../engine/core/metroLoader.js";
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

  const curated = ["look/color", "style/general", "artist/secondary"];
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
