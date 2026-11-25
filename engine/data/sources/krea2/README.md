# Krea 2 identities and style descriptors

These are pinned text sources for the two Krea-specific blocks. No reference images, model
weights, third-party scripts, or generation workflows are imported. Generation remains offline.

## Identity source

- Author: **simsim9-stack**.
- [Source gist](https://gist.github.com/simsim9-stack/1cc90f751cda7f638b250cf029a18cf4).
- Reviewed API revision: `803eddb59c5ed353209e9bbd59c38fed2ed9cd07`.
- File snapshot: `identities-source.txt`, downloaded/reviewed **2026-11-25**.
- SHA-256: `b06d8d9aa9802bc66c7d0c72373ae4609822f7a6058ab3e7e4166c047d94e599`.

The 1,232 non-empty source rows include actors, musicians, composers, comedians, wrestlers,
bands/collectives, historical figures, fictional/mythological figures, and ambiguous first names.
The source mislabels many non-musicians as composers and instrumentalists as singers. We preserve
its identity vocabulary without endorsing those occupations or claiming Krea recognition scores.

Modifications authorized by the owner:

- Remove the repeated portrait/gray-background/camera-direction suffix (including one `cinema` typo).
- Remove source parenthetical occupation/genre/age annotations from emitted text.
- Deduplicate repeated names and explicitly merge four reviewed aliases/title variants.
- Separate 53 bands/collectives into `krea2/bands`, preserving group stage names.
- Keep three explicit musical identity qualifiers where an unqualified name could point to
  another public figure. Ambiguous first names remain as supplied; identities are not invented.
- Emit `10000 Maniacs` without its thousands separator, preventing comma cleanup from splitting
  the band's number into separate prompt fragments. The original spelling remains in the audit.
- Produce 1,010 individual/source-name entries in `krea2/people`. This is an identity vocabulary,
  not a verified roster of actors or a factual biographical database.

`identity-curation.json` records the reviewed band, alias and disambiguation decisions.
`identity-audit.json` maps **every source row** to its normalized output and family; no identity
is silently dropped. Multiple source rows may intentionally map to one deduplicated identity.

## Style source

- Catalog/visual reference author: **matplinta**.
- [Style library](https://matplinta.github.io/t2i-krea-2-style-library/).
- [Source repository](https://github.com/matplinta/t2i-krea-2-style-library).
- [Catalog JSON](https://raw.githubusercontent.com/matplinta/t2i-krea-2-style-library/master/data/styles.json).
- File snapshot: `styles-source.json`, downloaded/reviewed **2026-11-25**.
- SHA-256: `e14df00be2e0e0a317a7482a6e598a2a231fd9805c23326d25386b06265e68dc`.
- The repository credits **u/Dear-Spend-2865**'s
  [Krea 2 styles/wildcards](https://www.reddit.com/r/StableDiffusion/comments/1uzdj7o/krea_2_styles_wildcards_txt/)
  as the original descriptor source.

All 288 unique style descriptors are retained as whole entries. Whitespace is collapsed to one
line and explanatory parentheses are removed **while preserving all their words**, so the engine
does not interpret those prose annotations as typed emphasis. Original punctuation, style IDs,
names, ordering, and multi-category metadata remain in the untouched snapshot. Runtime output is
`Style: <one full descriptor>`, not a random mix of sentences or clauses. Source style names and
artist attributions are preserved as supplied; their factual accuracy is not independently verified.

## Attribution and regeneration

Neither the reviewed gist nor the style repository metadata declares an explicit content license.
Imported text retains its source authors' rights; the repository's public-domain statement for
internally authored lists does not apply to these imports. Keep the source links and credit above
with the imported content. Curation/import tooling: OpenAI Codex for Rowan's fork.

Run from the repository root:

```powershell
node scripts/build-krea2-content.mjs
node scripts/build-krea2-content.mjs --check
npm run manifest
```

The generator validates reviewed identities, preserves the audit mapping, and writes text lists
without terminal newlines (blank list lines are selectable in the current loaders). The `krea2/`
folder is force-prefixed and has `_disable-group-list`: pooling identity names and long style
descriptors into one group would mix incompatible content types. Source snapshots do not execute.
