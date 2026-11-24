# Local inference in the Windows desktop fork

The optional **NInfer Qwen (5090)** text provider supports existing rewrite, keyword, expansion,
and Manage AI actions without an API key. Requests go through the local backend to
`http://127.0.0.1:1234/v1/chat/completions`, model `qwen3.8-27b`, reasoning effort `medium`.
The launcher's model selection is preserved; no external scripts are edited.

The optional **Local GPUs (3090 + 4090)** image provider divides images between ComfyUI on
ports **8190** and **8191**. Select either or both in the provider gear. One job runs per endpoint
across Home and Gallery together. The next image goes to whichever worker finishes first;
prompts are not duplicated. A single prompt's multiple-image batch is split too. Pinned image
seeds increment by image index. Sidecars record actual seeds, workflow, endpoint, GPU, and
sampler settings. Ready workers remain usable when another worker is offline. Partial failures
save successes and report errors without automatically retrying submitted images.

Readiness uses ComfyUI's lightweight `/queue` endpoint with a ten-second response timeout.
Both empty and busy queues are ready; the probe validates both queue arrays. Concurrent UI and
batch probes share one in-flight request per service. Do not use `/system_stats` for readiness:
this local installation synchronously queries memory on every visible GPU there, which can stall
under load. An open port with a failed probe is reported as starting/busy or incompatible rather
than telling the user to start another instance.

After a worker is verified, an admitted pool render keeps it ready as long as its TCP port is
still listening; readiness checks skip HTTP while that render is active. A recent successful
check also covers transient HTTP failures for up to 60 seconds, helping when another client
submits work. A closed TCP port or explicit incompatible response invalidates remembered
readiness immediately. An unverified startup is never accepted just because its port is open.

## Workflows

The pool offers **Krea 2 — Jake's workflow** and a standard checkpoint workflow. Selecting the
new provider is opt-in; existing providers retain their defaults.

`targets/shared/comfyui/data/krea2-workflow.json` derives from the supplied
`H:\Qwen video harness\krea2Simple_fixed jakes version (3).json`, the flattened API export of
`krea2Simple_fixed jakes version.json`. The sample prompt is removed. The model, VAE, encoder,
and five-slot LoRA stack (all None) are preserved, with 12 steps, CFG 1, Euler/simple. Required
nodes and model names are checked before submission. UI dimensions override the saved 16:9,
1.4 MP resolution selector. UUID output prefixes prevent collisions in the shared output folder.
For a standard checkpoint, select its name and adjust steps/CFG for that model.

## Launch and ownership

Settings → **Local services** shows readiness and Start/Stop buttons for fixed profiles:

| Service | Existing launcher |
|---|---|
| NInfer / 5090 | `H:\Ninfer Qwen\launch-ninfer.bat` |
| ComfyUI / 3090 | `H:\Qwen video harness\launchers\comfy_image_3090.bat` |
| ComfyUI / 4090 | `H:\Qwen video harness\launchers\comfy_4090.bat` |

Machine-specific paths and ports live in `localServices.js`. HTTP clients cannot supply commands
or executable paths. Controls require the native Windows shell, loopback access, and matching
origin. Launches are hidden; logs go to the app's `user/logs/`. Repeated Start clicks reuse a
running/loading service. An incompatible occupied port prevents duplicate launches.

Already-running services are reused without adopting ownership. Stop only terminates a live
child launched by this app. A private Windows Job Object contains the Node backend and its
launched descendants. Closing the shell kills that job, including batch wrappers; pre-existing
services remain outside it. Job creation failure prevents unmanaged service launches.

Managed NInfer launch requires **BACKEND=windows**. A manually started compatible WSL server
can be reused, but managed WSL startup is rejected because Windows jobs cannot guarantee Linux
daemon termination. The 4090 launcher's NInfer GPU comment is stale: the actual NInfer command
selects GPU 0, the 5090. The 5090 video launcher is not included.

## Building and running

Install root/web npm dependencies and desktop npm tools. The local builder explicitly selects
Rust **1.88.0**, installed alongside the default toolchain without replacing it.

Run `npm run desktop:build:local`, then double-click repo-root `launch-desktop.bat`. The portable
executable is `output/desktop/Random AI Prompt Local.exe`. Its `.portable` marker keeps runtime
data in `output/desktop/data/app/`. Its application identifier is distinct from upstream, and
upstream update suggestions are disabled for this fork's native shell.

The stager writes a unique `BUILD_ID` each time. The shell compares it with the working copy's
`.staged-version`, so rebuilding at the same version refreshes code while preserving user data.
The service controls are inside the prompt box's **Prompt settings** gear → **Local services**.

When rebuilding while the portable app is open, Windows locks its executable. The builder stages
`Random AI Prompt Local.next.exe` instead and refreshes the bundled payload, leaving the running
working copy and services alone. Close the old app and run `launch-desktop.bat`; it replaces the
executable before launch. If the old app is still open, the launcher asks for it to be closed and
does not start an extra copy. User settings and images stay in the same portable data directory.

Node 25 requires `NODE_OPTIONS=--no-experimental-webstorage` for the existing jsdom suite;
otherwise native localStorage shadows test storage. Node HTTP integration tests need loopback
network permission. See [desktop.md](desktop.md) and [gui.md](gui.md).
