# Kinetics-derived action content

Source: **Kinetics-700-2020**, created by the Google DeepMind Kinetics team,
distributed by the [Common Visual Data Foundation](https://github.com/cvdfoundation/kinetics-dataset).
Dataset paper: Smaira et al., [A Short Note on the Kinetics-700-2020 Human Action Dataset](https://arxiv.org/abs/2010.10864).
Kinetics annotations are attributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The original [dataset page](https://www.deepmind.com/open-source/kinetics) currently redirects
to the DeepMind homepage. Videos have separate rights and are not included or used here.

## Download and provenance

Downloaded on **2026-11-25** from the validation-annotation link published in the CVDF repository:

- [Validation CSV](https://s3.amazonaws.com/kinetics/700_2020/annotations/val.csv)
- [CVDF dataset readme](https://s3.amazonaws.com/kinetics/700_2020/K700_2020_readme.txt)
- Original CSV: 1,480,292 bytes; SHA-256 `a6749d9f3bc785620de5ee96025f201b98b2436eae4b782eb3e1db61f50ab7ac`.
- `labels.txt`: the 700 distinct `label` values, alphabetically sorted, UTF-8 without BOM,
  one LF-terminated label per line. SHA-256 `2f265d35aa76060219f7e83aff12f5aaba9d1fe27360aa83f11aad7a3648fc51`.

The downloaded CSV remains an ignored working artifact in `tmp/kinetics/`; only the label
vocabulary is retained here. No video IDs, clips, model weights, or training pipeline are needed.
To refresh the snapshot, download the CSV above, parse it with `Import-Csv`, select unique
`label` values, sort them, and write the labels in the format above. Record a new date/hash
and review the curated mappings before rebuilding.

## Curation and modifications

`curated-actions.json` maps **180 selected source labels** to six families of 30 phrases:
everyday tasks, crafts, music, sports, outdoor activities, and social interactions.
Each record preserves the exact source label; its `text` is a manually authored adaptation
with a concrete pose or matching prop. These details are authored prompt content, not
annotations inferred from or verified against individual videos. Curation and phrasing:
OpenAI Codex (first 72) and Claude (108 more), for Rowan's random-ai-prompt fork. The adapted activity lists retain CC BY 4.0 attribution.

Selection favors recognizable still-image activities, avoids ambiguous recognition-only classes,
and is intentionally a subset, not an exhaustive import. Combined labels are narrowed explicitly:
`canoeing or kayaking` becomes kayaking; `hugging (not baby)` becomes hugging another person.
Unused labels remain in the source snapshot. Existing application lists are not edited.

Generate the runtime lists and metadata offline from this mapping:

```powershell
node scripts/build-kinetics-actions.mjs
node scripts/build-kinetics-actions.mjs --check
npm run manifest
```

The script validates each source label and writes `engine/data/lists/activity/`. Edit this
mapping and regenerate rather than editing those built-in lists by hand; personal overrides
can still be made in the app's `user/lists/activity/` overlay. Only the generated lists ship
as runtime prompt content; this source directory is not imported by the engine.
