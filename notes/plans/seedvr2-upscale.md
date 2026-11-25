# SeedVR2 upscaling on the 4090

Approved 2026-11-25 after inspection and clarification. Decisions:

- Single-view upscales run next on the 4090, ahead of waiting renders, never preempting.
- 4000px longest edge by default, adjustable in the upscaler's settings gear.
- Workflow cleanup: `sageattn_2`, no comparer/folder loader, no redundant cache clears.
- Additions: status and queue position, cancel, the existing ComfyUI upscaler fix, Gallery bulk upscale.
- Bulk upscales use normal queue order so a long batch does not hold the 4090 ahead of renders.
- Fixed seed, no model picker (the node also lists models it would download), no auto-start.

Implementation and behavior: [local inference](../systems/local-inference.md).

## Verification

Live on the 4090: 1024×768 → 4000×3000 in 33.6s, with zero differing pixels from the original
workflow's own output. During an eight-image Krea batch, an upscale waited for the running
render, ran next on the 4090 while the 3090 kept rendering, and all eight images completed. A running
upscale was cancelled and left ComfyUI's queue empty. Mocked browser checks at 360/390/768/1280
covered submit, reload recovery, cancel, the size lock, bulk upscale and skip reporting.

## Not done

- Jobs do not persist across an app restart.
- Position, cancel and bulk are not on mobile.
- The CLI path is unit-tested through the shared adapter; it was not run live.