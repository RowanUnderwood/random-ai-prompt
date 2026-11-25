import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine/core/engine.js";
import { createDecks, usesDecks } from "../../engine/core/decks.js";
import { createPromptRun } from "../../engine/promptRun.js";
import { withAmbientDecks } from "../../engine/helpers/random.js";
import { makeFakeLoader } from "../helpers/fakeLoader.js";

afterEach(() => vi.restoreAllMocks());

const letters = [..."abcdefgh"];
const plain = {
  keywordEmphasis: false,
  autoAddFx: false,
  autoAddArtists: false,
  promptSalt: false,
  shuffleDeck: true,
};
const roll = (engine, prompt, n, extra) =>
  Array.from({ length: n }, () => engine.generate({ ...plain, ...extra, prompt }));
const cycles = (items, size) =>
  Array.from({ length: items.length / size }, (_, i) =>
    [...items.slice(i * size, (i + 1) * size)].sort(),
  );

describe("createDecks", () => {
  it("deals every option once per cycle and never repeats across a reshuffle", () => {
    for (let trial = 0; trial < 40; trial++) {
      const decks = createDecks();
      const dealt = Array.from({ length: 80 }, () => decks.session().draw("k", letters));
      for (const cycle of cycles(dealt, 8)) expect(cycle).toEqual(letters);
      for (let i = 1; i < dealt.length; i++) expect(dealt[i]).not.toBe(dealt[i - 1]);
    }
  });

  it("varies the order between cycles", () => {
    const decks = createDecks();
    const orders = Array.from({ length: 12 }, () =>
      letters.map(() => decks.session().draw("k", letters)).join(""),
    );
    expect(new Set(orders).size).toBeGreaterThan(6);
  });

  it("keeps keys independent, counts duplicates once, and handles a single option", () => {
    const decks = createDecks();
    const s = decks.session();
    expect([s.draw("x", ["a", "a", "b"]), s.draw("x", ["a", "a", "b"])].sort()).toEqual(["a", "b"]);
    expect(s.draw("y", ["a"])).toBe("a");
    expect(s.draw("y", ["a"])).toBe("a");
  });

  it("starts over on reset", () => {
    const decks = createDecks();
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      seen.add(decks.session().draw("k", letters));
      decks.reset();
    }
    expect(seen.size).toBeGreaterThan(3);
    const first = Array.from({ length: 8 }, () => decks.session().draw("k", letters));
    expect([...first].sort()).toEqual(letters);
  });

  it("reconciles content changes without forgetting what was dealt", () => {
    const decks = createDecks();
    const draw = (options) => decks.session().draw("k", options);
    const first = [draw(letters), draw(letters), draw(letters)];
    const gone = letters.find((l) => !first.includes(l));
    const next = [...letters.filter((l) => l !== gone), "new"];
    const rest = Array.from({ length: next.length - 3 }, () => draw(next));
    expect([...first, ...rest].sort()).toEqual([...next].sort());
  });

  it("puts cards already used in this prompt last when it must reshuffle part-way", () => {
    for (let trial = 0; trial < 40; trial++) {
      const decks = createDecks();
      for (let i = 0; i < 6; i++) decks.session().draw("k", letters);
      const prompt = decks.session();
      const drawn = Array.from({ length: 8 }, () => prompt.draw("k", letters));
      expect(new Set(drawn).size).toBe(8);
    }
  });

  it("honours exclusions even when only excluded cards remain, and deals those next", () => {
    const decks = createDecks();
    const s = decks.session();
    const first = [s.draw("k", ["a", "b", "c"]), s.draw("k", ["a", "b", "c"])];
    const left = ["a", "b", "c"].find((c) => !first.includes(c));
    expect(decks.session().draw("k", ["a", "b", "c"], new Set([left]))).not.toBe(left);
    expect(decks.session().draw("k", ["a", "b", "c"])).toBe(left);
  });
});

describe("usesDecks", () => {
  it("is off by default and paused while a seed is pinned", () => {
    expect(usesDecks({})).toBe(false);
    expect(usesDecks({ shuffleDeck: true })).toBe(true);
    expect(usesDecks({ shuffleDeck: true, randomSeed: true, promptSeed: "7" })).toBe(true);
    expect(usesDecks({ shuffleDeck: true, randomSeed: false, promptSeed: "7" })).toBe(false);
    expect(usesDecks({ shuffleDeck: true, randomSeed: false, promptSeed: 0 })).toBe(false);
    expect(usesDecks({ shuffleDeck: true, randomSeed: false, promptSeed: " " })).toBe(true);
  });
});

describe("engine with shuffled decks", () => {
  const choice = "Start\n===\none of:\n    - a\n    - b\n    - c\n    - d";
  const dpl = {
    "subject/one": "Start\n===\nONE",
    "subject/two": "Start\n===\nTWO",
    "subject/three": "Start\n===\nTHREE",
    pick: choice,
    pair: "Start\n===\n2 of:\n    - a\n    - b\n    - c",
    weighted: "Start\n===\none of:\n    - 98% a\n    - 2% b",
  };
  const make = () => {
    const loader = makeFakeLoader({ lists: { color: letters, size: ["s", "m"] }, dpl });
    loader.blockGroupDirsAll = () => ["subject"];
    return createEngine(loader);
  };

  it("deals list entries across separate generations and batches", () => {
    const engine = make();
    const out = [
      ...roll(engine, "{color}", 3),
      ...engine.generateMany({ ...plain, prompt: "{color}", promptCount: 5, seed: "any" }),
    ];
    expect([...out].sort()).toEqual(letters);
    expect([...roll(engine, "{color}", 8)].sort()).toEqual(letters);
  });

  it("deals block groups, plain choices and the fully-random list choice", () => {
    const engine = make();
    for (const cycle of cycles(roll(engine, "{#subject}", 12), 3))
      expect(cycle).toEqual(["ONE", "THREE", "TWO"]);
    for (const cycle of cycles(roll(engine, "{#pick i100%}", 16), 4))
      expect(cycle).toEqual(["a", "b", "c", "d"]);
    const any = roll(engine, "{#any}", 6);
    expect(any.length).toBe(6);
    const listed = roll(engine, "{keyword}", 2, { keywordsFilename: "false" });
    expect(listed.filter((v) => letters.includes(v))).toHaveLength(1);
  });

  it("keeps an N-of pick distinct and fair, and leaves weighted choices weighted", () => {
    const engine = make();
    const pairs = roll(engine, "{#pair i100%}", 60).map((p) => p.split(", "));
    const counts = {};
    for (const pair of pairs) {
      expect(new Set(pair).size).toBe(2);
      for (const v of pair) counts[v] = (counts[v] || 0) + 1;
    }
    expect(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))).toBeLessThan(4);
    expect(roll(engine, "{#weighted i100%}", 60).filter((v) => v === "a").length).toBeGreaterThan(
      45,
    );
  });

  it("cannot hang when a deck keeps returning the same card (regression)", () => {
    const stuck = { draw: (_key, options) => options[0] };
    const loader = makeFakeLoader({ dpl });
    const text = withAmbientDecks(stuck, () =>
      loader.loadBlock("pair").default({}, {}, {}, 100, 50),
    );
    expect(text).toBe("a");
  });

  it("deals the keyword randomizers' entries too", () => {
    const engine = make();
    const s = {
      keywordEmphasis: true,
      emphasisChance: 1,
      emphasisLevelChance: 0,
      mode: "Midjourney",
    };
    const words = roll(engine, "{color}", 8, s)
      .join(" ")
      .match(/\b[a-h]\b/g);
    expect(new Set(words.slice(0, 8)).size).toBe(8);
  });

  it("never draws for previews or negatives, and keeps pinned seeds reproducible", () => {
    const engine = make();
    const run = createPromptRun(engine);
    const settings = { ...plain, prompt: "{color}" };
    const first = [run.generatePrompt(settings), run.generatePrompt(settings)];
    for (let i = 0; i < 30; i++) {
      run.expandPrompt("{color}", settings);
      run.expandPromptSeeded("{color}", settings);
    }
    const pinned = { ...settings, randomSeed: false, promptSeed: "x" };
    expect(new Set(Array.from({ length: 5 }, () => run.generatePrompt(pinned))).size).toBe(1);
    const rest = Array.from({ length: 6 }, () => run.generatePrompt(settings));
    expect([...first, ...rest].sort()).toEqual(letters);
  });

  it("still makes the original draws when off, and resets on request", () => {
    const off = { ...plain, shuffleDeck: false, prompt: "{color} {#subject} {#pick i100%}" };
    const engine = make();
    const a = Array.from({ length: 10 }, (_, seed) => engine.generate({ ...off, seed }));
    roll(engine, "{color}", 3);
    expect(Array.from({ length: 10 }, (_, seed) => engine.generate({ ...off, seed }))).toEqual(a);
    engine.resetDecks();
    expect([...roll(engine, "{color}", 8)].sort()).toEqual(letters);
  });
});
