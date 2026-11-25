# Human action content

`{#action}` is a reusable DPL fragment under `engine/data/blocks/fragment/action.dpl`.
It expands to **one complete human activity with a matching pose or prop**, selected from
72 curated Kinetics-700-2020 action labels. Examples:

```text
a person, {#action}
a musician, {activity/music}
documentary photograph of a person, {activity/crafts}
```

The music family can select any of its instruments. To specify violin, write the
activity explicitly rather than pairing a fixed instrument with a random music activity.

Six family lists live under `engine/data/lists/activity/`: `everyday`, `crafts`, `music`,
`sports`, `outdoor`, and `social`. Each has 12 entries. `_force-prefix` keeps inserted tokens
explicit, e.g. `{activity/outdoor}`. The implied folder union `{activity}` supplies the block;
each curated activity has equal selection weight. Family sizes may be expanded; the union
is entry-weighted, not a separate family lottery.

## Composition and limits

The block emits an activity fragment, without creating or inspecting a subject. Compose it
explicitly with a human subject. Some social activities mention another person or a dog;
they are not all compatible with a one-person-only composition. There is no automatic
subject/scene compatibility inference or action injection into existing subject blocks.
The original `{action}` list remains `look/action.txt`; the `activity/` namespace deliberately
avoids an exact-name folder union that would shadow that list.

Pose and prop details stay in the same list entry as their action. We do not independently
sample these details, which could combine incompatible activities. Each phrase is a
self-contained still-image description; it does not claim to encode temporal motion from videos.
The unconditional `{activity}` reference keeps one activity at all intensity/focus settings;
those dials do not multiply or suppress the core activity. Existing global layering and
keyword-emphasis settings still apply normally.

## Source and maintenance

- [Source snapshot, attribution and exact CSV/hash](../../engine/data/sources/kinetics/README.md).
- `engine/data/sources/kinetics/labels.txt`: 700 downloaded class names, not video metadata.
- `engine/data/sources/kinetics/curated-actions.json`: exact source label → family/phrase mapping.
- `scripts/build-kinetics-actions.mjs`: validates source membership/uniqueness, writes the six
  runtime lists and their metadata. The JSON mapping is authoring input, not a runtime import.

Edit the curated mapping and run:

```powershell
node scripts/build-kinetics-actions.mjs
node scripts/build-kinetics-actions.mjs --check
npm run manifest
```

The generated text lists intentionally have **no terminal newline**: the current loaders
preserve blank lines as selectable entries. Do not add a blank final entry when editing them.
User overrides still work through `user/lists/activity/` and `user/blocks/fragment/action.dpl`.
No new dependency, service, network request, model or provider is used during generation.
The Node and browser loaders discover the files normally; Metro's generated catalog includes
them on regeneration/build. `tests/unit/actionBlock.test.js` verifies seeded Node/Metro parity,
non-empty correlated output, family coverage, legacy resolution and shared completion discovery;
the browser facade integration test verifies the actual Vite catalog and expansion.
