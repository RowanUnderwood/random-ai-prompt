/**
 * Quality checks over the real prompt content: nothing blank, nothing duplicated in the curated lists,
 * and every reference a block makes resolves.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeLoader } from "../../engine/core/nodeLoader.js";
import { createEngine } from "../../engine/core/engine.js";
import { createDecks } from "../../engine/core/decks.js";
import { makeBlockStage } from "../../engine/core/stages/block.js";
import { withAmbientDecks } from "../../engine/helpers/random.js";
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
    ...lists.filter((n) => /^(people|thing|activity|medium)\//.test(n)),
  ];
  it("offer enough variety in the curated lists", () => {
    const short = ["people/noun", "people/age", "people/build", "medium/backdrop"];
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

  const direct = (dir) =>
    blocks.filter((n) => path.posix.dirname(n) === dir).map((n) => path.posix.basename(n));
  const outputs = (token, settings = {}, rolls = 120) => {
    const engine = createEngine(nodeLoader);
    const base = { provider: "comfy-local", includeAdult: true, randomSeed: true, ...settings };
    return Array.from({ length: rolls }, () =>
      engine.generate({ ...base, keywordEmphasis: false, prompt: token }).trim(),
    );
  };

  it("keep helpers out of every random group but usable by name", () => {
    const groups = nodeLoader.blockGroupDirsAll();
    expect(groups).toEqual(expect.arrayContaining(["subject", "people", "style", "fragment"]));
    expect(groups).not.toContain("helper");
    for (const name of ["color", "glow", "neon", "portrait", "entity-name", "living-entity"])
      expect(resolveName(name, blocks)).toBe(`helper/${name}`);
  });

  it("keep {#style} to pure looks, a third of them Krea, and move subject-bearing looks out", () => {
    const styles = direct("style");
    expect(styles).toHaveLength(18);
    expect(styles.filter((n) => n.startsWith("krea2-"))).toHaveLength(6);
    expect(direct("styled-subject")).toHaveLength(19);
    for (const name of ["sticker", "comic", "plushie", "3d-print", "retro-poster", "silhouette"])
      expect(resolveName(name, blocks)).toBe(`styled-subject/${name}`);
    const subject = /\{#(entity|living-entity|animal|person|entity-name|subject|people)\b/;
    for (const [file, text] of sources)
      if (/^style[\\/]/.test(file)) expect([file, subject.test(text)]).toEqual([file, false]);
  });

  it("put every Krea style in exactly one category list", () => {
    const all = nodeLoader.readListLines("krea2/styles", false);
    const split = lists
      .filter((n) => n.startsWith("krea2/style-"))
      .flatMap((n) => nodeLoader.readListLines(n, false));
    expect(split).toHaveLength(288);
    expect([...split].sort()).toEqual([...all].sort());
  });

  it("hide the Krea styles for Stable Diffusion, leaving the other looks", () => {
    const texts = outputs("{#style}", { provider: "forge" }, 200);
    expect(texts.filter((t) => !t || /^style:/i.test(t))).toEqual([]);
  });

  it("deals every member of the style, people and subject groups once per cycle", () => {
    for (const group of ["style", "people", "subject"]) {
      const include = nodeLoader.readBlockMeta(group)?.include || [];
      const members = [group, ...include].flatMap((d) =>
        blocks.filter((n) => path.posix.dirname(n) === d),
      );
      const drawn = [];
      const decks = createDecks();
      const spy = {
        draw: (key, options, exclude) => {
          const card = decks.session().draw(key, options, exclude);
          if (key === `blocks:${group}`) drawn.push(card);
          return card;
        },
      };
      const stage = makeBlockStage(nodeLoader);
      for (let i = 0; i < members.length; i++)
        withAmbientDecks(spy, () =>
          stage(`{#${group}}`, { provider: "comfy-local", includeAdult: true }, {}, {}),
        );
      expect([...drawn].sort()).toEqual([...members].sort());
    }
  });

  it("offer only human subjects under {#people}", () => {
    expect(direct("people").sort()).toEqual([
      "everyday-person",
      "fantasy-role",
      "group",
      "historical-figure",
      "knight",
      "krea2-actors",
      "krea2-bands",
      "occupation",
      "pair",
      "person",
      "scifi-role",
    ]);
    expect(nodeLoader.readBlockMeta("subject").include).toEqual(["people"]);
  });

  it.each(["weather", "water", "wildlife", "expressive", "fx", "camera", "settlement"])(
    "{#%s} is never empty",
    (name) => expect(outputs(`{#${name}}`).filter((t) => !t)).toEqual([]),
  );

  it.each(["subject", "people", "scene", "style", "fragment", "prompt"])(
    "the {#%s} group is rarely empty",
    (name) => {
      const texts = outputs(`{#${name}}`, { includeArtist: false }, 300);
      expect(texts.filter((t) => !t).length).toBeLessThanOrEqual(15);
    },
  );

  it("never describe people as children", () => {
    const young = /\b(girl|boy|child|children|kid|teen|teenage|toddler|baby|schoolgirl|loli)\b/i;
    for (const name of lists.filter((n) => n.startsWith("people/")))
      expect(nodeLoader.readListLines(name, true).filter((l) => young.test(l))).toEqual([]);
    expect(outputs("{#portrait-princess}").filter((t) => /\bgirl\b/.test(t))).toEqual([]);
  });

  it("{#entity} describes its subject instead of only naming it (regression)", () => {
    const ages = nodeLoader.readListLines("people/age", false);
    const aged = (texts) => texts.filter((t) => ages.some((age) => t.startsWith(`${age} `)));
    expect(aged(outputs("{#entity}", {}, 300)).length).toBeGreaterThan(10);
    expect(aged(outputs("{#entity-name}", {}, 100))).toEqual([]);
  });

  it("dress anime characters from the SFW clothes only", () => {
    const nsfw = new Set(nodeLoader.readListLines("clothes-nsfw", true));
    for (const line of nodeLoader.readListLines("clothes-sfw", true)) nsfw.delete(line);
    const source = fs.readFileSync(path.join(BLOCKS, "subject/entity.js"), "utf8");
    expect(nsfw.size).toBeGreaterThan(0);
    expect(source).toMatch(/d\/character\}`;\s+clothes = "\{clothes-sfw\}"/);
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
