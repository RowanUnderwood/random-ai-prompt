# Krea 2 prompt content and model visibility

Two normal catalog blocks extend the shared content pool:

- **People → `{#krea2-actors}`** (part of `{#subject}`) emits one identity from 1,010 deduplicated source names.
  It includes all individual/source identities, not just actors. It adds no portrait framing,
  background, clothing or action. Example: `{#krea2-actors}, {#action}`.
- **Style → `{#krea2-style-library}`** emits `Style: ` followed by one complete descriptor
  from matplinta's 288-entry Krea 2 Style Library. It never combines unrelated descriptor clauses.
- **`{krea2/bands}`** separately selects one of 53 band/collective names; bands do not appear
  in the actors block; `{#krea2-bands}` draws on them. `{krea2/people}` and `{krea2/styles}` can be inserted directly too.

The lists live in `engine/data/lists/krea2/`, force-prefixed to avoid ambiguous names.
`_disable-group-list` prevents an incoherent union of people, bands and style paragraphs.
The two blocks participate normally in `{#subject}`, `{#style}`, `{#any}` and random suggestions
whenever the selected image model permits them. No automatic model/workflow change is made.

## Source and quality

[Source provenance, snapshots, hashes, author credits and curation](../../engine/data/sources/krea2/README.md)
record simsim9-stack's gist, matplinta's catalog and the credited original style contributor.
The source's repeated portrait suffix is removed; duplicate names and reviewed aliases collapse
to one entry. The source also contains historical/fictional figures and ambiguous first names,
sometimes incorrectly labeled composers. Those names are retained without the false occupation
labels. The data is not a verified biographical database or a model-recognition benchmark.
Every original identity row has an output mapping in `identity-audit.json`.

Style whitespace is collapsed to one line. Explanatory parentheses lose their brackets but retain
their words, avoiding accidental DPL emphasis. All original descriptors, IDs, names and category
metadata remain in the source snapshot. Additional random artists, effects or other styles can
deliberately blend with the selected style; importing these blocks does not alter those settings.

Regenerate offline after editing the reviewed curation/source snapshots:

```powershell
node scripts/build-krea2-content.mjs
node scripts/build-krea2-content.mjs --check
npm run manifest
```

## Stable Diffusion visibility

`engine/modelContent.js` owns the shared rule: a `krea2` name token marks Krea-specific content.
The active **image provider/model/workflow**, rather than prompt dialect, determines visibility.
Krea 2 can legitimately use SD-compatible prompt syntax.

- `comfy-local`'s default/`krea2` workflow allows Krea additions; `checkpoint` excludes them.
- Stable Diffusion provider selections (`sd`, `stable-diffusion`, `local-webui`, `forge`, `sdnext`,
  `stability`) exclude them. Explicit SD-family model names are recognized too.
- Explicit Krea/FLUX model names are not classified as SD. Arbitrarily named checkpoints on a
  generic ComfyUI/custom provider cannot reliably reveal their architecture; no family is guessed.
- Provider-less callers with explicit `mode: StableDiffusion` retain the legacy SD context.
  Other providers keep the content available. No new persisted setting or CLI flag is required.

The web/mobile palettes, completions and vocabulary choices use the same filtered catalog.
CLI prompt runs read the selected provider's saved workflow into their model context, and
picker-facing CLI block/list commands apply the same visibility rule. Raw inventory APIs remain complete.
Core generation filters direct references, group/any pools and list-name randomization.
`listResolve` applies the rule recursively inside list groups and `{keyword}` unions;
all loaders pass the model context and keep SD/allowed list-cache entries separate.
Switching providers/workflows restores content without deleting it or rewriting saved prompt text.
An existing Krea token remains in the editor but expands empty while SD is selected, matching the
app's unavailable-content behavior. Manage retains the complete editable content inventory.

## Verification

`tests/unit/krea2Content.test.js` covers source accounting, whole descriptors, model/dialect
distinction, Node/Metro parity, direct references, wildcard/group exclusion and cache switching.
`targets/web/tests/Krea2Palette.test.jsx` presses the real insert buttons and verifies provider/
workflow switching against the actual Vite catalog, generation, completions and vocabulary choices.
