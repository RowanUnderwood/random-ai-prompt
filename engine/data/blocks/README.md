# Blocks

Each `.dpl` (or `.js`) here is a **block**: a tiny generator referenced in a prompt as
`{#name}`. Unlike a list (one random entry from a file), a block **runs code** to build a
fragment — usually probabilistic accretion (start from a base phrase, then append fragments under
independent coin-flips), freely mixing literal text with nested `{#other}` and `{list}` tokens that
the engine then resolves.

## How to reference a block

Write `{#name}` in a prompt — brace-delimited, uniform with `{list}`, and able to carry `/` paths.
(The old bare `#name` is no longer recognized; the braces also stop a stray `#` in normal text from
being eaten.) The name is resolved by **path suffix** — the same rule lists use — so you almost
never type the category folder:

- **Bare name** — `{#beach}` → `scene/beach`
- **Short / partial path** — `{#scene/beach}`

Resolution is deterministic: an exact path wins; otherwise any file whose path ends with
`/<your-ref>` matches; among matches the **shallowest** path wins, ties broken by a guaranteed
natural order (symbols, then numbers, then letters). Basenames are kept unique, so a bare
`{#name}` always resolves.

**Dials — intensity & focus:** a reference may carry two percents with a **mandatory** `i`/`f` prefix
(1–100; `0`→`1`; unspecified → 50%) — `{#beach i25%}` runs at 25% **intensity**, `{#beach f80%}` at 80%
**focus**, `{#beach i25% f80%}` both. The prefix is required because the two percents look identical; an
unprefixed `25%` is not dial syntax. *Intensity* ("how much") auto-scales the generator's gates/counts,
drives `[i<10%]` line conditions, and is interpolable as `$intensity` (the percent) / `$intensity-word`
(the word). *Focus* ("how pure / how narrow") admits fluff at low values and keeps only essentials at
high values; it is author-judged via `[f<NN%]` conditions and interpolable as `$focus` / `$focus-word`
(it does not auto-scale). See [`intensity`](../../../notes/reference/intensity-design.md) and
[`focus`](../../../notes/reference/focus-design.md) design notes.

**Global layers (auto-merge):** an imported generator renders **once** per prompt — a second nested
import of the same generator is dropped, so `{#weather}` pulled in by two scenes appears a single time.
User-typed duplicates always render. A generator that legitimately repeats (decorative fragments like
`color`/`glow`) opts out with `stacking: true` front-matter. See
[`layering`](../../../notes/reference/layering-design.md).

Special forms:

- **`{#user-name}`** → back-compat alias for a community generator under `user/`.
- **`{#folder}`** → a **pick-one group**: runs ONE random generator from that folder (e.g. `{#scene}` =
  a random scene). Any category folder with 2+ generators is automatically a group.
- **`{#any}`** / **`{#any-sfw}`** / **`{#any-nsfw}`** → pick one random generator from the WHOLE catalog
  (`{#any}` = SFW, +NSFW when adult mode is on; `-sfw` always SFW; `-nsfw` only in adult mode).

A folder's sidecar may `include` other folders in its group, and a block's sidecar may name a setting it
`requires` (the `artists` block needs `includeArtist`); a group skips a block whose setting is off.

The "pick one" always selects a single generator and runs it — it is not a union of many (the
generator-level analog of the lists' pick-one folder group, where the unit is one word).

## Folders

Generators are sorted into category folders (suffix resolution means the category never has to be
typed). A folder with 2+ generators is also a **pick-one group** — `{#<folder>}` runs one random
generator from it:

| Folder | What's in it |
|--------|--------------|
| `scene/` | Full standalone scenes & places — `city`, `castle`, `beach`, `landscape`, `room`, `space`, `ship`, … |
| `subject/` | Subjects — the `entity` polymorphism, `animal`, `animal-scene`, `still-life`, `food`, `machine`, the `portrait-*` family, … Its sidecar includes `people/`, so `{#subject}` draws from both |
| `people/` | Adults only — `person`, `everyday-person`, `occupation`, `historical-figure`, `fantasy-role`, `scifi-role`, `pair`, `group`, … Use `{#people}` with `{#action}` |
| `helper/` | Pieces used inside other blocks (`color`, `glow`, `neon`, `portrait`, `entity-name`, `living-entity`); usable by name, never picked by a group |
| `fragment/` | Partial modifiers / garnishes composed into fulls — `weather`, `water`, `nature`, `camera`, … |
| `style/` | Art-style & product-render templates (mostly publicprompts.art) — the `3d-*` set, `comic`, `sticker`, `funko-3d-print`, … |
| `prompt/` | Whole-prompt builders & tag streams (force-prefixed → `{#prompt/…}`) — `random` (composite), `random-words`, `simple-random`, `extra-random`, `artists`, `fx`, `d` (danbooru) |
| `expansion/` | Reusable lighting / detail accents referenced from other generators (`{#rays}`, `{#dap}`, …); not listed as pickable chips |
| `user/` | Community-submitted generators (`{#user-name}`) |

`{#action}` is a reusable human-activity fragment: for example, `a person, {#action}`.
It draws one complete activity with a matching pose/prop from the six Kinetics-derived
`activity/` lists. It never adds an unrelated second activity or chooses a subject;
some social actions explicitly include another person. `{action}` remains the original
poses/activities list. See [action content](../../../notes/systems/action-content.md).

`{#krea2-actors}` under People emits one identity without the source's portrait framing;
bands are separate in `{krea2/bands}`. `{#krea2-style-library}` under Style emits one full
descriptor. Both participate in normal category groups, and Krea-specific names are excluded
when Stable Diffusion is selected. See [Krea content](../../../notes/systems/krea2-content.md).

## Keeping a generator out of suggestions

There is no full/partial distinction — every generator is just a "prompt", and the whole set is
the `{#random}` suggestion pool. `export const suggestion_exclude` (front matter: `suggestions:
off`) keeps a valid generator out of that pool. How densely a generator renders is governed by the
**intensity** and **focus** dials, not by a standalone/fragment flag. (The old `full` / `partial`
concept is gone.)

## Adult gating

A generator whose name carries an `nsfw` token (e.g. `subject/nude-nsfw`) is automatically gated:
while `includeAdult` is off it is hidden from the picker and resolves to nothing — the same
name-token rule lists use (no hardcoded list to maintain).

## Metadata (`<name>.json`)

Each generator may have an optional `<name>.json` sidecar next to it (e.g.
`scene/beach.json`) holding metadata — currently just a `description` used for the editor
button tooltip:

```json
{ "description": "A beach / coastal scene — palm trees, sand, ocean." }
```

A category folder may also carry a `<folder>.json` (e.g. `scene.json`). The project ships
one for every built-in generator and folder. Metadata files are never generators (never loaded
as code, never shown as buttons). They're regenerated by
`scripts/dynprompt-meta/write-dynprompt-meta.mjs`.

## Internal / config files (`_` prefix)

Any file whose name starts with an underscore is **internal/config**, never a generator — the
loaders ignore `_`-prefixed files entirely (the same convention as `engine/data/lists/`). A folder
containing an empty **`_force-prefix`** file shows/inserts its entries with the path from that
folder down; resolution still works by suffix, so the prefix is shown, not strictly required.

## Authoring shape

The generators are authored in the **DPL** block language (`.dpl`); a few keep a `.js`
sidecar for logic that needs real code. A `.js`-only generator looks like:

```js
/** @returns {string} */
export default function (settings, imageSettings, upscaleSettings) {
  let prompt = "city, streetview, {city}";
  if (Math.random() < 0.5) prompt += ", {#weather}";
  return prompt;
}
// export const suggestion_exclude = true; // keep this generator out of {#random} suggestions
```

Generators import shared helpers out of `src/` (e.g. `../../../engine/helpers/keywordRepeater.js`
from a `<category>/` file) and compose siblings either as `#tokens` (let the engine resolve)
or as direct relative imports (`../fragment/nature.js`).

See `../lists/README.md` for the parallel system and
`../../notes/reference/blocks-architecture.md` for the design.
