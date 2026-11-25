/**
 * @file Measure how varied the prompt content is: list sizes, how often each block comes out empty, how
 * much of its text never changes, and what dominates whole prompts. Read-only.
 *
 *   node scripts/variety-report.mjs [--settings <settings.json>] [--provider <provider.json>] [--rolls 400]
 *     [--samples <n> --template "<prompt>"]
 *
 * `--settings` measures with a saved app settings file (its seeds and keys are ignored).
 */
import fs from "node:fs";
import {
  blockNames,
  bootNodeEngine,
  listNames,
  nodeLoader,
  setActiveSettings,
} from "../engine/nodeEngine.js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const readJson = (file) => (file ? JSON.parse(fs.readFileSync(file, "utf8")) : {});
// The image seed and pinned prompt seed would make every roll identical.
const { seed: _s, promptSeed: _p, keys: _k, ...saved } = readJson(arg("settings")) ?? {};
const provider = saved.provider || "comfy-local";
const settings = {
  ...saved,
  provider,
  providerParams: { [provider]: readJson(arg("provider")) },
  randomSeed: true,
  shuffleDeck: false,
  keywordEmphasis: false,
  keywordEditing: false,
  keywordAlternating: false,
  promptSalt: false,
};
const ROLLS = Number(arg("rolls", 400));
const engine = bootNodeEngine();
setActiveSettings(settings);
const roll = (prompt, n = ROLLS) =>
  Array.from({ length: n }, () => engine.generate({ ...settings, prompt }).trim());
const percent = (n, of) => Math.round((n / (of || 1)) * 100);
const fragments = (text) => new Set(text.split(/,\s*/).filter(Boolean));
const tally = (texts) => {
  const counts = new Map();
  for (const text of texts)
    for (const f of fragments(text)) counts.set(f, (counts.get(f) || 0) + 1);
  return counts;
};

/** Share of a block's average text made of fragments that appear in every non-empty roll. */
function measure(name) {
  const texts = roll(`{#${name}}`);
  const full = texts.filter(Boolean);
  const fixed = [...tally(full)].filter(([, n]) => n === full.length);
  const average = full.reduce((sum, t) => sum + t.length, 0) / (full.length || 1);
  return {
    name,
    distinct: new Set(texts).size,
    empty: percent(texts.length - full.length, texts.length),
    fixed: percent(
      fixed.reduce((sum, [f]) => sum + f.length, 0),
      average,
    ),
  };
}

if (arg("samples")) {
  for (const text of roll(
    arg("template", "{#person}, {#action}, {#scene}, {#style}"),
    Number(arg("samples")),
  ))
    console.log(`- ${text}`);
  process.exit(0);
}

console.log("## Small lists (under 40 entries)");
for (const name of listNames()) {
  const lines = nodeLoader.readListLines(name, settings.includeAdult === true) || [];
  if (lines.length && lines.length < 40) console.log(`${lines.length}\t${name}`);
}

const groups = ["subject", "people", "scene", "style", "styled-subject", "fragment", "prompt"];
console.log("\n## Groups: distinct / empty %");
for (const group of groups) {
  const texts = roll(`{#${group}}`, 1000);
  const empty = percent(texts.filter((t) => !t).length, texts.length);
  console.log(`{#${group}}\t${new Set(texts).size}/1000\tempty ${empty}%`);
}

console.log("\n## Blocks: distinct / empty % / fixed text %");
const rows = blockNames().map(measure);
for (const r of rows.filter((x) => x.empty >= 5 || x.fixed >= 60 || x.distinct < ROLLS / 8))
  console.log(`${r.distinct}\tempty ${r.empty}%\tfixed ${r.fixed}%\t${r.name}`);

console.log("\n## Most common fragments in {#subject}, {#scene}, {#prompt}, {#style}, {#fragment}");
const whole = roll("{#subject}, {#scene}, {#prompt}, {#style}, {#fragment}", 1000);
const common = [...tally(whole.map((t) => t.toLowerCase()))]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25);
console.log(common.map(([f, n]) => `${percent(n, 1000)}% ${f}`).join("; "));
const subjects = roll("{#subject}", 1000);
console.log(
  `portrait in {#subject}: ${percent(subjects.filter((t) => /portrait/i.test(t)).length, 1000)}%`,
);
const styles = roll("{#style}", 1000);
console.log(
  `Krea descriptor in {#style}: ${percent(styles.filter((t) => /^style:/i.test(t)).length, 1000)}%`,
);
