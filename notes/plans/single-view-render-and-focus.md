# Single view: render another and image-only viewing

Approved 2026-11-25 after inspection and clarification:

- Add **Render another** beside Resize. Open a multiline editor for the final sent prompt and
  negative prompt before queueing. Preserve the source image's saved provider/model/dimensions
  and other generation settings; generate exactly one image with a fresh seed. Use the shared
  local GPU queue, retain the original, show a pending linked child, and stay on the source image.
- Clicking the main image toggles an image-only overlay filling the app viewport with
  `object-fit: contain` (no cropping, correct aspect ratio, margins as needed). Hide app text and
  controls behind it. Click or Escape restores normal Single view; left/right navigation retains
  the existing image order and remains in image-only mode.
- Fix keyboard ownership: textarea/contenteditable and modal editing must not navigate images;
  Escape closes the active editor/image-only view before invoking Single's Back action.

Implementation: reuse App's derivation lifecycle and `deriveImage`, recording edited text and
ancestry in sidecars. Use a dedicated accessible render editor and a body-level image overlay
so hidden view containers and stacking contexts cannot leave app chrome visible. Add focused
interaction/metadata tests, verify actual queue reuse, inspect UI at narrow/wide sizes, run the
full gate, stage the native update without stopping the user's existing app, and update CLAUDE.md.

Implemented in 2.60.4-local.4. Native build staged successfully. Isolated browser checks confirmed
the existing queue endpoint, saved recipe, one linked child and viewer navigation at four viewport
widths (360, 390, 768, 1280), with landscape and portrait images. Generation was mocked; no live GPU
request was needed. Keyboard regression fails under the old handler and passes after the fix.
Completed validation: full gate green with 977 tests (405 Node, 450 web, 122 mobile), including
12 added UI/metadata regressions. CLAUDE.md, system notes, session and changelog updated.
