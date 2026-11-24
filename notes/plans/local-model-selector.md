# Local workflow model selection

User requested a dropdown matching ComfyUI's available diffusion models in the Local GPUs
workflow settings. Use the running instances' node definitions rather than scanning model paths.

1. Read `UNETLoader.unet_name` for Krea and `CheckpointLoaderSimple.ckpt_name` for standard
   workflows from each enabled GPU endpoint. Offer the common names across reachable endpoints;
   report unavailable workers and empty intersections without substituting another model.
2. Show a workflow-specific model dropdown with loading/error states and Refresh models.
   Preserve saved choices across refreshes and switches, including an unavailable-choice warning.
3. Patch the selected diffusion filename into Jake's UNET loader and record it in image metadata.
   Validate exact selections before submission; standard workflow selections must not silently change.
4. Test catalog intersection/failure handling, actual selection callbacks, refresh, workflow switching,
   and graph injection. Build the native update, inspect its UI, and retain the running user's app.

Completed: live catalogs and conditional dropdowns implemented; 965-test full gate passed.
Verified actual catalogs (64 common diffusion models), selection through the built UI, and
layout at 360/390/768/1280. Native version .3 is staged without closing the user's current app.
