# Block and list variety

Approved 2026-11-25. Decisions: pure looks stay in `{#style}` and styles with their own subject move to
`{#styled-subject}`; the Krea library splits into six category blocks; blocks asked for by name are never
empty; new people, historical/fantasy, group, object and creature subjects. The most-used recent prompt
is `{#person}, {#action}, {#scene}, {#style}`.

Corrections found while planning: `look/focus` is the focus dial's vocabulary and stays; `lore/*` and most
`name/*` lists are raw dictionary dumps and are not used as subjects; `color` being optional inside other
blocks is deliberate.

## Before (owner's settings, `scripts/variety-report.mjs`)

| Measure | Before | Target | After |
|---|---|---|---|
| `{#fragment}` empty | 17–21% | ≤5% | 0% |
| `{#prompt}` empty | 14–17% | ≤5% | 0% |
| `{#subject}` with "portrait" | 37% | <20% | 13–15% |
| "soft smooth lighting" in full prompts | 26% | <5% | 0% |
| Krea descriptors in `{#style}` | 5% | 30–36% | 33% |
| `{#style}` blocks over 60% fixed text | 11 | 0 | 0 |