/**
 * @file One-shot: write `<name>.json` sidecar metadata next to each block generator
 * and each category folder, for the `data/blocks/` tree. Re-runnable.
 *
 * Each sidecar is `{ description }`, plus two optional fields:
 *   - `priority` (category folders only): the block picker orders the category/folder pills by
 *     this number, ascending — **lower lifts a category higher**, default 1000. Lets the curated
 *     order (Any · Prompt · Scene · Subject · Style · Fragment · User · Special) be data-driven.
 *   - `nsfw: true` (generators): the generator is adult — when the app's NSFW switch is OFF it is
 *     treated as if it did not exist (hidden from the picker, never picked by `{#any}` / a group,
 *     resolves to "" if referenced). The automatic `nsfw`-name-token rule still applies on top.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "..", "data", "blocks");

// Category-pill order in the block picker (lower = higher up). `any` (0) and `special` (9000) are
// virtual categories ordered in the SPA itself; these are the real folder categories in between.
const PRIORITY = {
  prompt: 200,
  scene: 300,
  subject: 400,
  style: 500,
  fragment: 600,
  user: 700,
};

// Generators that are adult (hard-hidden when NSFW is off). Empty today — the catalog is SFW, and
// any nsfw-named generator is already gated by the name-token rule — but this is the escape hatch
// for an adult generator whose name carries no `nsfw` token.
const NSFW = new Set([]);

const D = {
  // ---- category folders (the category-pill tooltip; describe the category itself) ----
  scene:
    "Complete scenes and places — landscapes, cityscapes, interiors, vehicles, and other full settings.",
  subject: "Subjects to depict — people, animals, creatures, and portraits.",
  fragment:
    "Garnishes that flavor a prompt — colors, lighting, weather, moods, and material accents.",
  style:
    "Art styles and product-render looks — 3D / isometric, stickers, figurines, comic, poster, and more.",
  prompt:
    "Whole-prompt builders and tag streams — random prompt generators, auto-added artists & fx, and danbooru anime tags.",
  user: "Community-submitted generators.",

  // ---- scene ----
  "scene/beach": "A beach / coastal scene — palm trees, sand, ocean.",
  "scene/cave": "A cave interior — rock formations, depth, optional ice/lava/crystal.",
  "scene/city": "A city street view — buildings, cityscape, wide shot.",
  "scene/micro-city": "A tiny, isometric-style miniature city.",
  "scene/castle": "A castle / fortress scene.",
  "scene/ruins": "Ancient ruins — crumbling architecture and overgrowth.",
  "scene/house": "A house / home exterior or setting.",
  "scene/log-cabin": "A rustic log cabin set in nature.",
  "scene/room": "A generic interior room.",
  "scene/school-room": "A classroom interior.",
  "scene/store-interior": "The inside of a shop / store.",
  "scene/storefront": "A shop exterior / storefront.",
  "scene/ship": "A sailing ship / boat scene.",
  "scene/spaceship": "A spaceship / spacecraft.",
  "scene/vehicle": "A vehicle (car and the like).",
  "scene/landscape": "A natural landscape — a wide scenic vista.",
  "scene/micro-landscape": "A tiny, miniature landscape.",
  "scene/mountains": "A mountain-range scene.",
  "scene/space": "Outer space — stars, nebulae, cosmos.",
  "scene/park": "A public park scene.",
  "scene/zoo": "A zoo with animals and enclosures.",
  "scene/great-bridge": "A grand bridge spanning a landscape.",
  "scene/great-tree": "An enormous, majestic tree.",
  "scene/settlement": "A small settlement / village.",
  "scene/futuristic": "A futuristic, sci-fi scene.",
  "scene/underwaterscape": "A full underwater scene.",

  // ---- subject ----
  "subject/entity":
    "Polymorphic subject — picks an animal, flower, instrument, creature, tree, or person.",
  "helper/entity-name": "Just the name/label of a random entity (no descriptors).",
  "subject/anime-character": "A named anime character in everyday clothes.",
  "subject/animal": "A random animal subject (entity specialized to animals).",
  "people/person": "A random person subject (entity specialized to humans).",
  "helper/living-entity": "A random living subject (entity specialized to living things).",
  "subject/furry": "An anthropomorphic animal (furry) character.",
  "people/knight": "An armored knight character.",
  "subject/wildlife": "Wildlife — animals in a natural setting.",
  "helper/portrait": "Portrait framing / garnish for a subject.",
  "subject/portrait-animal": "A full animal portrait.",
  "subject/portrait-person": "A full person portrait.",
  "subject/portrait-princess": "A full princess portrait.",

  // ---- fragment ----
  "helper/color": "A random color word.",
  "helper/glow": "A glowing / luminous accent.",
  "helper/neon": "A neon-lighting accent.",
  "fragment/eerie": "An eerie, unsettling mood.",
  "fragment/mystical": "A mystical, magical mood.",
  "fragment/nature": "A natural-element garnish (foliage, terrain, and the like).",
  "fragment/weather": "A random weather condition.",
  "fragment/water": "A water-element garnish.",
  "fragment/expressive": "An emotional-expression garnish.",
  "fragment/general-state": "A general scene-state modifier.",
  "fragment/room-state": "An interior-state modifier.",
  "fragment/ice": "An ice / frozen accent.",
  "fragment/lava": "A lava / molten accent.",
  "fragment/crystal": "A crystal accent.",
  "fragment/underwater": "An underwater garnish (bubbles, depth).",

  // ---- style ----
  "styled-subject/3d-isometric": "Isometric 3D render style.",
  "styled-subject/3d-isometric-print": "Isometric 3D-print render style.",
  "styled-subject/3d-isometric-room": "Isometric 3D room render.",
  "styled-subject/3d-print": "3D-print render style.",
  "styled-subject/lowpoly-3d-isometric": "Low-poly isometric 3D style.",
  "styled-subject/comic": "Comic-book art style.",
  "styled-subject/sticker": "Die-cut sticker style.",
  "styled-subject/funko-3d-print": "Funko-Pop-style 3D figurine.",
  "styled-subject/fluffy-animal": "Fluffy plush-animal style.",
  "styled-subject/needle-felt": "Needle-felted craft style.",
  "styled-subject/silhouette": "Silhouette art style.",
  "styled-subject/psychedelic": "Psychedelic, trippy art style.",
  "styled-subject/space-hologram": "Holographic space render.",
  "styled-subject/gold-pendant": "Golden pendant / jewelry render.",
  "styled-subject/sports-logo": "Sports-team logo style.",
  "styled-subject/anime-realism": "Realistic anime-style face portrait.",
  "styled-subject/plushie": "Plush-toy style.",
  "styled-subject/retro-poster": "Retro travel-poster style.",
  "styled-subject/vibrant-art": "Vivid, saturated art style.",

  // ---- prompt ----
  "prompt/random": "A composite random prompt — full scenes in AND-weighted blends.",
  "prompt/random-words": "A pile of completely random keywords (maximum chaos).",
  "prompt/simple-random": "A single, lighter random prompt suggestion.",
  "prompt/suggestion":
    "A random prompt suggestion: a subject, a style and two keywords. Uses Krea content when a Krea model is selected.",
  "prompt/extra-random": "A total-random prompt drawing from every list.",
  "prompt/artists": "Auto-appended artist tags.",
  "prompt/fx": "Auto-appended visual-effect / quality tags.",
  "prompt/d": "Danbooru anime tag stream (general / meta).",

  // ---- user ----
  "user/beach-merk": "Community beach scene by Merk (composes siblings as direct imports).",
};

let wrote = 0;
for (const [name, description] of Object.entries(D)) {
  const meta = { description };
  if (name in PRIORITY) meta.priority = PRIORITY[name];
  if (NSFW.has(name)) meta.nsfw = true;
  const file = path.join(root, `${name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(meta, null, 2) + "\n");
  wrote++;
}
console.log(`wrote ${wrote} block meta files`);
