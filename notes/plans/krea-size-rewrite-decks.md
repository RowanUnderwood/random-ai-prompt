# Krea sizing, editable rewrite prompt, shuffled decks

Approved 2026-11-25. Decisions: decks cover lists, block groups and unweighted choices; 14 ratios with
shared names combined; custom auto-fix instructions for positive prompts only; reshuffle button,
orientation swap, size readout; remove the "Reload lists each prompt" checkbox, which nothing read (its
setting key and CLI flag remain).

Behavior: [local inference](../systems/local-inference.md) and
[rng-design](../reference/rng-design.md).

## Verification

All 14 ratios round-trip at nine short edges. 1,010 Krea actor draws gave 1,010 distinct names; block
groups never repeated back to back. Browser checks at 360/390/768/1030/1100/1280 pressed every control,
confirmed saving, reload, and that the rewrite and size reached the requests. Live: 1832×768 and
768×1152 images rendered at exactly those sizes on the 3090, and NInfer followed custom instructions. The
4090 instance was not running, so it was not used.

## Not done

- Mobile keeps width and height for Krea.
- Decks and their progress are not saved across restarts, by request.
- The top bar overflows near 1030px with the long Local GPUs name. It predates this work.