/**
 * @file Generate the curated Kinetics activity lists, offline, from the attributed source snapshot.
 * Every authored phrase keeps its action, pose and props in one entry. No video download or AI call.
 * Run `node scripts/build-kinetics-actions.mjs [--check]`; provenance is in sources/kinetics/README.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "engine/data/sources/kinetics");
const destination = path.join(root, "engine/data/lists/activity");
const labels = new Set(
  fs.readFileSync(path.join(source, "labels.txt"), "utf8").trim().split(/\r?\n/),
);
const curated = JSON.parse(fs.readFileSync(path.join(source, "curated-actions.json"), "utf8"));
const families = ["everyday", "crafts", "music", "sports", "outdoor", "social"];
const descriptions = {
  everyday: "Everyday human activities with matching pose and props.",
  crafts: "Human crafts and creative activities with matching tools and gestures.",
  music: "Human musical performances with instrument-specific playing poses.",
  sports: "Human sports and exercise with matching equipment and body positions.",
  outdoor: "Human outdoor activities with matching equipment and physical details.",
  social: "Human gestures and interactions; some entries explicitly include another person.",
};
const outputs = new Map([["_force-prefix", ""]]);
const seenLabels = new Set();
const seenText = new Set();
if (Object.keys(curated).sort().join() !== [...families].sort().join()) {
  throw new Error("Unexpected activity families in curated-actions.json");
}
for (const family of families) {
  const entries = curated[family];
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(`Empty family: ${family}`);
  for (const { label, text } of entries) {
    if (!labels.has(label)) throw new Error(`Unknown Kinetics label: ${label}`);
    if (seenLabels.has(label)) throw new Error(`Duplicate source label: ${label}`);
    if (typeof text !== "string" || !text.trim() || /[\r\n{}]/.test(text)) {
      throw new Error(`Invalid activity phrase for ${label}`);
    }
    if (seenText.has(text)) throw new Error(`Duplicate phrase: ${text}`);
    seenLabels.add(label);
    seenText.add(text);
  }
  // The loaders preserve blank lines as selectable entries; do not append a trailing newline.
  outputs.set(`${family}.txt`, entries.map(({ text }) => text).join("\n"));
  outputs.set(
    `${family}.json`,
    `${JSON.stringify({ description: `${descriptions[family]} Curated from Kinetics-700.` }, null, 2)}\n`,
  );
}
const check = process.argv.includes("--check");
if (!check) fs.mkdirSync(destination, { recursive: true });
for (const [name, text] of outputs) {
  const target = path.join(destination, name);
  if (check) {
    if (
      !fs.existsSync(target) ||
      fs.readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== text
    ) {
      throw new Error(`Activity list is stale: ${target}`);
    }
  } else fs.writeFileSync(target, text);
}
console.log(
  `${check ? "Verified" : "Generated"} ${seenLabels.size} activities in ${families.length} families.`,
);
