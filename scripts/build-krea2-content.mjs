/**
 * @file Build Krea 2 identity and style lists from attributed, pinned source snapshots, offline.
 * Preserve every source row in an audit map; deduplicate identities, strip portrait framing and
 * source occupation/age labels, separate bands, and keep whole style descriptors together.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "engine/data/sources/krea2");
const out = path.join(root, "engine/data/lists/krea2");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(source, name), "utf8"));
const curation = readJson("identity-curation.json");
const styles = readJson("styles-source.json").styles;
const rows = fs
  .readFileSync(path.join(source, "identities-source.txt"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim());
const bands = new Set(curation.bands);
const people = new Set();
const groups = new Set();
const names = new Set();
const audit = rows.map((line, index) => {
  const identity = line
    .replace(/\s+chest up on gray background, look at (?:camera|cinema)\s*$/, "")
    .trim();
  if (identity === line.trim())
    throw new Error(`Unrecognized portrait framing at row ${index + 1}`);
  // Strip trailing parenthetical annotations while preserving stage names like Sunn O))).
  const originalName = identity.replace(/(?:\s+\([^()]*\))+$/, "").trim();
  const name = curation.aliases[originalName] || originalName;
  names.add(originalName);
  const family = bands.has(name) ? "bands" : "people";
  const text = curation.disambiguation[name] || name;
  (family === "bands" ? groups : people).add(text);
  return { row: index + 1, original: identity, family, identity: text };
});
for (const name of [
  ...bands,
  ...Object.keys(curation.aliases),
  ...Object.keys(curation.disambiguation),
]) {
  if (!names.has(name)) throw new Error(`Curation references an unknown source identity: ${name}`);
}
const ids = new Set();
const descriptors = new Set();
for (const style of styles) {
  if (!style.id || ids.has(style.id)) throw new Error(`Duplicate/missing style id: ${style.id}`);
  // Source parentheses are explanatory prose, not DPL emphasis instructions. Keep their words.
  const text = style.descriptor.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  if (!text || /[{}]/.test(text) || descriptors.has(text))
    throw new Error(`Invalid/duplicate style: ${style.id}`);
  ids.add(style.id);
  descriptors.add(text);
}
const outputs = new Map([
  ["_force-prefix", ""],
  ["_disable-group-list", ""], // Avoid a union mixing people, bands and style paragraphs.
  ["people.txt", [...people].join("\n")],
  ["bands.txt", [...groups].join("\n")],
  ["styles.txt", [...descriptors].join("\n")],
]);
const descriptions = {
  people:
    "One identity from the Krea 2 source: performers, composers, historical and fictional names. No portrait framing. Bands are separate.",
  bands:
    "One band or collective from the Krea 2 identity source. Names only; some music projects are groups rather than individual people.",
  styles:
    "One intact descriptor from the 288-entry Krea 2 Style Library; names and categories remain in the source catalog.",
};
for (const [name, description] of Object.entries(descriptions))
  outputs.set(`${name}.json`, `${JSON.stringify({ description }, null, 2)}\n`);
const auditPath = path.join(source, "identity-audit.json");
const auditText = `${JSON.stringify(audit, null, 2)}\n`;
const check = process.argv.includes("--check");
if (!check) fs.mkdirSync(out, { recursive: true });
for (const [target, text] of [...outputs]
  .map(([name, text]) => [path.join(out, name), text])
  .concat([[auditPath, auditText]])) {
  if (check) {
    if (
      !fs.existsSync(target) ||
      fs.readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== text.replaceAll("\r\n", "\n")
    )
      throw new Error(`Stale Krea 2 content: ${target}`);
  } else fs.writeFileSync(target, text);
}
console.log(
  `${check ? "Verified" : "Generated"} ${people.size} people/identities, ${groups.size} bands, ${descriptors.size} styles; all ${rows.length} source rows accounted for.`,
);
