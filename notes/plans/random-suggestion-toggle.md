# Random toggle and Krea-aware suggestions

Approved 2026-11-26. Shipped in 2.60.4-local.16.

## The ask

1. Check that the prompt box's "Random — drop a suggestion in" button uses the recent Krea additions.
2. Make that button an on/off toggle like auto-fix. While on, use a new suggestion on every Generate,
   and a new one for each prompt when Prompts is above 1.

## Findings

- The button rolled `{#random-words}`: 5–7 draws from the `{keyword}` wildcard (all list vocabulary,
  77,801 lines). Krea lists are 1,351 of those (1.7%), so about 1 suggestion in 10 carried one Krea
  entry. The Krea **blocks** (`style/krea2-*`, `people/krea2-actors`, `helper/krea2-style-library`)
  were never reached. SD hiding (`engine/modelContent.js`) worked on this path in all three loaders.
- With an empty box and Prompts above 1, Generate sent one already-expanded suggestion, so a batch
  repeated it.
- `{#subject}` can pick `{#anime-character}`. Plain `{keyword}` with NSFW on could pair a named
  character with adult vocabulary, which the content rules forbid, so the block uses `{keyword-sfw}`.

## Decisions (owner)

- New structured `{#suggestion}` block: `{#subject}`, `{#style}`, two `{keyword-sfw}`.
- With text in the box and Random on, the suggestion is **appended** to the typed text.
- Web (Home and Gallery share `PromptComposer`), mobile, and a CLI flag.

## Design

The toggle adds the **unexpanded** `{#suggestion}` token, so the existing per-prompt loop
(`buildRoll` on web, `rollPrompts`/`generatePrompts` on mobile and CLI) expands it once per prompt with
a forked seed. No new loop. One rule shared by all targets: `promptWithSuggestion` in
`engine/suggestion.js`.

- Setting `autoRandom` (web settings, kept out of image sidecars via `SNAPSHOT_DROP`; mobile local
  state like its auto-fix; CLI `--random-suggestion`, default off). The CLI shares the GUI's saved
  settings unless `--no-gui-share`, as it already does for auto-fix.
- Single view's Render another sends explicit text and ignores the toggle.
- A pinned seed repeats the same suggestions across clicks (still different within a batch), and
  pauses shuffled decks, as for any roll.
- The one-shot "drop it in" action is gone; the rotating placeholder still shows a sample.

## Verification

See the [session log](../sessions/2026-11/2026-11-26.md) for the results.
