# Local HTTP API reference

Verified against the local fork's source on 2026-11-26. This is the consolidated reference for
integrating another application with the running Random AI Prompt backend. These are the current
routes, not a versioned public API or an OpenAPI specification.

## Connect to the app

- **Desktop:** `http://127.0.0.1:4173` (2.60.4-local.18 and later). If something else already uses
  4173, such as `npm start` or a second copy of the app, the shell falls back to a free port chosen at
  launch. The local Providers menu's **App API address** entry shows and copies the address in use.
  Earlier builds always chose a random port.
- **Standalone release server:** `npm start` builds and serves the app; default origin is
  `http://localhost:4173`. The `PORT` environment variable overrides it; `NO_OPEN=1` suppresses
  opening a browser. This is an alternative to running the desktop app.
- **Development only:** `npm run web` normally serves the same API on `http://localhost:5173`;
  use the address the server actually reports.
- **Hosted static web edition:** does not host this local backend. Mobile does not host it either.

Append each route below to the origin; do not add `/api` twice. A useful connection probe is
`GET /api/manage/ping`, which returns `{"ok":true}`.

Send JSON bodies with `Content-Type: application/json`. Most responses are JSON, except image
downloads and the SSE stream. Check HTTP status before parsing a successful response shape.
Typical errors are `{"error":"message"}` with status 400 (invalid input), 403 (restricted action),
404 (missing resource), 409 (upscale target already met), 502 (provider/file operation failure),
or 503 (ImageMagick unavailable). Prompt engine failures use 500. Unknown routes or unsupported
methods can fall through to the SPA/static handler rather than producing a JSON 404/405.
Malformed JSON currently becomes an empty object; clients should send valid JSON explicitly.

There is no general API login, bearer token, or API-key authentication layer. Provider keys are
separate and are supplied per request where required. The backend does not install general CORS
or OPTIONS handlers: another application's server, Python, or PowerShell can call it directly;
JavaScript on a different browser origin may require a same-origin proxy. The standalone server
calls `listen(PORT)` without an explicit loopback bind address; this is a local application API,
not an authenticated network service. Do not assume every route enforces loopback-only clients.

## Prompt generation

### POST /api/prompt

Expands DPL through the shared engine and returns prompt text. It does not render images or call
the AI rewrite provider.

| Body field | Meaning |
|---|---|
| `template` | Optional nonblank string overriding `settings.prompt`; plain text and DPL tokens are accepted. Omit/blank to retain the settings/default prompt. |
| `count` | Optional batch count; default engine count is 1. The current route clamps this field to 1–100. Use a positive integer. |
| `seed` | Optional string/number pinning the prompt batch; omit for a fresh random seed with default settings. Zero is a valid seed. |
| `settings` | Optional engine settings merged over engine defaults, not the current UI's saved settings. |
| `preset` | Optional preset name or comma/whitespace-separated names (arrays are string-coerced to comma-separated names). Unknown/invalid names return 400. |

Order: engine defaults → supplied settings → presets → explicit template/count/seed overrides.
Settings are defined in [engine/settings.js](../../engine/settings.js). Examples include
`includeAdult`, `keywordCount`, `keywordMaxCount`, `autoAddFx`, `autoAddArtists`, `shuffleDeck`,
`randomSeed`, and `promptSeed`. Image model context can also be supplied through `provider` and
`providerParams` for model-aware content selection; prompt dialect alone is not image model context.
See [modelContent.js](../../engine/modelContent.js).

Request:

```json
{
  "template": "a photo of {#people}, {#action}, {#style}",
  "count": 1,
  "seed": "42",
  "settings": { "includeAdult": false }
}
```

Response shape (prompt text is illustrative):

```json
{
  "seed": "42",
  "prompts": ["The expanded prompt text"]
}
```

Read `prompts[0]` for one prompt string. There is no plain-text response option. A pinned seed
reproduces a batch given the same settings and content; content changes can change the result.

### Random toggle and Auto-fix

These UI behaviors are orchestrated outside `/api/prompt`. Sending `autoRandom: true` or
`autoFix: true` in its settings does not perform those actions.

For **Random**, explicitly use `"template":"{#suggestion}"`. With typed text, use
`"template":"a red fox, {#suggestion}"`. Each prompt expands its own suggestion. This matches
the composition in [suggestion.js](../../engine/suggestion.js), including the empty-box fallback.

For **Auto-fix**, make a second call to `/api/rewrite` with the generated text. A complete
PowerShell example, returning only the final text:

```powershell
$baseUrl = "http://localhost:4173" # Replace with the running app's origin.

$generated = Invoke-RestMethod "$baseUrl/api/prompt" `
    -Method Post -ContentType "application/json" `
    -Body (@{
        template = "{#suggestion}"
        count = 1
        settings = @{ includeAdult = $false }
    } | ConvertTo-Json -Depth 10)

$fixed = Invoke-RestMethod "$baseUrl/api/rewrite" `
    -Method Post -ContentType "application/json" `
    -Body (@{
        providerId = "ninfer"
        prompt = $generated.prompts[0]
        mode = "fix"
    } | ConvertTo-Json -Depth 10)

$fixed.text
```

NInfer must be running for that example. To reproduce a custom UI Auto-fix instruction, pass it as
`system` in the rewrite request; it is not loaded automatically. For a batch, rewrite each returned
prompt separately. If keyword translation is also desired, rewrite the fixed result again with
`mode: "keyword"`, matching the UI's fix-then-keyword order.

### GET /api/prompt/catalog

No body. Returns `lists`, `blocks`, `presets`, `listGroups`, and `blockGroups`, each an array of
names. Use these for selecting tokens and presets. This route accepts no per-request settings
filter; do not treat its output as a guarantee that every name is permitted in every generation
context (for example, content safety and model-specific filtering).

## AI rewriting

### POST /api/rewrite

| Body field | Meaning |
|---|---|
| `providerId` | Text provider ID (see list below). |
| `prompt` | Required nonempty text to rewrite. |
| `mode` | `fix` (or omitted): prose Auto-fix; `keyword`: tag translation; `expand`: expansion. The `dpl-*` modes in the shared rewrite systems also select Manage AI tasks. |
| `system` | Optional custom Auto-fix system instructions; blank/null uses the built-in instructions. Specialized keyword/expand/DPL modes select their own instructions. |
| `key` | Required provider API key, except for `ninfer`. |

Returns `{"text":"Rewritten prompt"}`. Missing prompt returns 400; provider/key/rewrite failures
return 502. The route does not automatically read the UI's provider choice, key, or custom system.

Current provider IDs: `ninfer`, `openai`, `gemini`, `grok`, `deepseek`, `mistral`, `together`,
`perplexity`, `fireworks`, `cerebras`, `qwen`, `moonshot`, `ai21`, `huggingface`, `llama`,
`anthropic`, `cohere`. Provider availability and models depend on their adapters.

The fork's `ninfer` adapter calls `http://127.0.0.1:1234/v1/chat/completions`, uses model
`qwen3.8-27b`, and requests medium reasoning effort. It returns answer content with `<think>`
blocks stripped. See [local inference](local-inference.md),
[dispatch.js](../../targets/web/backend/dispatch.js), and
[rewriteSystem.js](../../targets/shared/_shared/rewriteSystem.js) for exact provider/mode definitions.

## Image generation and provider proxies

These routes consume already expanded prompt text. They do not run Random or Auto-fix implicitly.

| Method and route | Input | Success response / behavior |
|---|---|---|
| `POST /api/generate` | `{providerId,prompt,key,params?}`; prompt and key required | Provider output, normally `{images:[...]}`. IDs: `openai`, `replicate`, `fal`, `stability`, `gemini`, `grok`, `bfl`, `ideogram`, `leonardo`. Missing prompt/key: 400; dispatch failures: 502. |
| `POST /api/upscale` | `{providerId,image,key?,params?}`; image is a base64 data URL or saved output filename/path | `{images:[dataUrl,...]}`. Saved source is inlined; upstream result URLs are downloaded. Key required except `comfyui`. Source missing: 404; no usable result/provider failure: 502. |
| `POST /api/forward` | `{url,method?,body?}`; default method `GET` | Forwards JSON to an allowed local hostname; parsed JSON returned with 200 on upstream success, otherwise upstream error status. Non-JSON upstream content becomes `{error:...}`. This is not a binary proxy. |

Upscale provider IDs: `replicate`, `deepai`, `picsart`, `segmind`, `comfyui`, `venice`, `clipdrop`,
`wavespeed`, `claid`, `deepimage`, `neurallove`, `vanceai`. `params` are adapter-specific; see
[shared providers](../../targets/shared/README.md) and [dispatch.js](../../targets/web/backend/dispatch.js).

`/api/forward` and image URL ingestion below currently accept hostname values `127.0.0.1`,
`localhost`, `0.0.0.0`, and `::1` via a literal `URL.hostname` check. Other hostnames return 403.
Use `127.0.0.1` in integrations (URL parsing may represent IPv6 hostnames with brackets).

## Local GPUs, services, and SeedVR2

| Method and route | Input | Success response / behavior |
|---|---|---|
| `GET /api/local-services` | None | `{supported,services:[...]}` with service status. `supported` describes native Windows desktop service-control availability. |
| `POST /api/local-services` | `{id,action:"start"}` or `{id,action:"stop"}` | `{services:[...]}`. IDs: `ninfer`, `comfy3090`, `comfy4090`. Requires native Windows desktop, loopback caller, and matching Origin if provided; otherwise 403. Bad action/service operation: 400. |
| `GET /api/local-models` | Query `kind=diffusion` (default) or `checkpoint`; `use3090=false` / `use4090=false` excludes a GPU | `{models:[...],workers:[...],warnings:[...]}`. Exact filenames common to selected reachable workers. Worker entries contain `id,label,available` and optional `error`. Invalid selection/kind: 400. |
| `POST /api/local-generate` | `{prompt,settings?}` | `{images:[...],imageMeta:[...],warnings:[...]}`. Splits image batches among ready selected GPUs. Missing prompt: 400; total failure: 502. Partial success preserves images and reports warnings. |
| `POST /api/local-upscale` | `{image,settings?,priority?}` | **202** `{job:{...}}`. Submits a SeedVR2 job on the 4090. Image is a saved output path/name or image base64 data URL. |
| `GET /api/local-upscale` | None | `{jobs:[...]}`; poll this list for status. There is no individual-job GET route. |
| `DELETE /api/local-upscale/{id}` | None | `{job:{...}}`; requests cancellation. Unknown job: 404. |
| `GET /api/local-upscale/{id}/image` | None | Binary upstream result image. Not ready/unknown: 404. The saved output is also available through the job's `path`. |

Local generation settings are flattened adapter settings, including `use3090`, `use4090`,
`batchSize` (positive integer), `seed` (negative means random), and workflow/model/dimension settings
defined in [comfy-local settings](../../targets/shared/comfy-local/settings.js) and the shared
[ComfyUI adapter](../../targets/shared/comfyui/code/generate.js). Returned image URLs/data must
be saved explicitly through `/api/image` if persistent gallery storage is wanted.

SeedVR2 settings: `seedvr2Target` (default 4000, valid 16–16384, rounded down to even) and
`seedvr2Seed` (default 4105349922, range 0–4294967295). Invalid values fall back to workflow
defaults. Sources already at/above the target longest edge return 409. A truthy `priority` gives
priority over waiting normal renders; it does not preempt an active job.

Job fields: `id,image,state,ahead,cancelling,target,path,error`. `image` is the source's served
path (null for inline input); `path` becomes the saved result. States include `queued`, `starting`,
`waiting`, `running`, `saving`, `done`, `error`, and `cancelled`. Jobs are in memory and disappear
on restart; only a bounded recent finished-job history is kept. Identical active upscale submissions
reuse the existing job. The backend saves successful upscale images and sidecars itself.
Do not automatically retry submitted generation work: a lost response can otherwise duplicate images.

## Gallery, image files, and metadata

Saved paths use `/api/output/<filename>`; many image actions also accept a bare filename.
Paths are restricted to the output directory, with traversal rejected.

| Method and route | Input | Success response / behavior |
|---|---|---|
| `POST /api/image` | `{src,meta?}`; src is a base64 data URL or allowed local URL | Saves a new image and optional JSON sidecar; `{path:"/api/output/..."}`. Remote nonlocal URLs: 403. |
| `GET /api/output/{filename}` | Filename in URL | Binary file, MIME inferred from extension; absent file: empty 404. |
| `GET /api/feed` | None | `{items:[{path,file,name,mtime,meta},...]}` sorted newest first. `mtime` is milliseconds; `meta` may be null. No pagination/filter query is implemented. |
| `GET /api/magick` | None | `{available,formats:[...]}` listing installed ImageMagick still-image output formats. |
| `GET /api/image/convert` | Query `file` and `format`; URL-encode values | Binary attachment converted by ImageMagick, first frame only; does not save a gallery entry. |
| `POST /api/image/resize` | `{path,scale,meta?}`; `0 < scale <= 8` | Saves a new first-frame image, optional sidecar; `{path:"/api/output/..."}`. Requires ImageMagick. |
| `POST /api/image/delete` | `{path}` | Deletes image and matching sidecar; `{ok:true}`. A valid already-missing filename is accepted. |
| `POST /api/image/reveal` | `{path}` | Requests OS file-manager reveal; `{ok:true}` acknowledges launch, not OS completion. |
| `POST /api/image/open` | `{path}` | Requests opening in default application; `{ok:true}` acknowledges launch. |
| `POST /api/image/meta` | `{path,patch:{...}}` | Shallow-merges sidecar fields, creates a sidecar if missing; `{ok:true,meta:{...}}`. |

Ingest/resize sidecars add `file`, `image`, and `savedAt`. Sidecar writes for these two routes are
best-effort; image save success does not guarantee a sidecar. Metadata patching is a separate
explicit operation. This image patch route retains null values (unlike Manage sidecar patches).

## Content management

These routes access the actual app's files. Mutating requests change content on disk; filesystem
delete is recursive. Prefer user overlay roots for personal overrides.

Root IDs: `lists` → `engine/data/lists`, `blocks` → `engine/data/blocks`, `user-lists` →
`user/lists`, `user-blocks` → `user/blocks`. Paths are relative to the chosen root, with traversal
rejected. In packaged desktop builds these paths belong to the app's staged data tree.

| Method and route | Input | Success response / behavior |
|---|---|---|
| `GET /api/manage/ping` | None | `{ok:true}`; local backend capability probe. |
| `GET /api/manage/snapshot` | None | Merged built-in and user content maps, user wins; fields described below. |
| `GET /api/manage/tree` | None | Object keyed by the four root IDs; each tree node is `{name,dirs:[...],files:[...]}`. |
| `GET /api/manage/file` | Query `root,path` | `{text:"..."}` containing raw file text; missing file: 404. |
| `POST /api/manage/file` | `{root,path,text}` | Atomic write, creating parent folders; `{ok:true,root,path}`. Replaces existing contents. |
| `POST /api/manage/sidecar` | `{root,name,patch}`; name has no `.json` extension | `{ok:true,meta:{...}}`. Shallow patch; null deletes a field; empty sidecar is removed. Prototype-related keys ignored. |
| `POST /api/manage/marker` | `{root,dir,marker,on}`; dir may be empty | `{ok:true}`. Marker is `_force-prefix`, `_enable-group-list`, or `_disable-group-list`; truthy on creates, false removes. |
| `POST /api/manage/fs` | `{op,root,path,to?,toRoot?,text?}` | `{ok:true}`; operations described below. Invalid operations/paths: 400. |
| `GET /api/manage/watch` | None | SSE stream with named `data`, `output`, and `settings` events, timestamp payloads, and 30-second keepalive comments. Changes debounced 200ms per scope. |
| `GET /api/manage/remote-manifest` | Optional query `fresh=1` | `{lists:[...],blocks:[...]}` of upstream stable content paths including extensions. Cached remote fetch, stale-cache fallback when offline. |
| `POST /api/manage/restore` | `{root,path}` | Downloads and overwrites with repository default; `{ok:true}` or 502. User overlay roots are refused; upstream 404 leaves the file unchanged. See [manageFs.js](../../targets/web/backend/manageFs.js). |

Snapshot fields: `lists`, `listGroups`, `listMeta`, `listForcePrefixDirs`, `listEnableGroupDirs`,
`listDisableGroupDirs`, `dpDpl`, `dpMeta`, `dpGroups`, `dpJsKeys`, `dpForcePrefixDirs`,
`dpEnableGroupDirs`, `dpDisableGroupDirs`. Text maps contain source text, metadata maps parsed
JSON, and directory/key fields arrays. `dpJsKeys` identifies JS generators without same-name DPL.

Filesystem operations: `mkdir` creates folders; `mkfile` creates a new text file (optional `text`);
`delete` removes a file or folder recursively; `move` renames within the same root using `to`;
`copy` copies one file to `to`, optionally in `toRoot`. Create/copy/move refuse an existing
destination as implemented; `mkdir` allows an existing directory.

SSE example: `event: data` followed by `data: <timestamp>` and a blank line. Watch support is
best-effort for existing directories; clients should retain a manual refresh path.

## Settings storage and update information

| Method and route | Input | Success response / behavior |
|---|---|---|
| `GET /api/storage?keys=1` | Any nonempty `keys` query value triggers listing | `{keys:[namespace,...]}`. |
| `GET /api/storage?ns=...` | URL-encoded namespace | `{value:...}`; null for missing/unreadable namespace. |
| `PUT /api/storage?ns=...` | `{value:...}` | Atomic JSON namespace write; `{ok:true}`. Invalid namespace: 400. |
| `DELETE /api/storage?ns=...` | Namespace | Removes the namespace; `{ok:true}`. |
| `GET /api/update` | None | `{currentVersion,edition,latest,updateAvailable:false}`. Edition is `portable`, `installer`, or `git`; latest is null or `{version,url,publishedAt,edition}`. Client decides whether an update is newer. |

Namespaces such as `providers/openai` map to JSON files under `user/settings/`. Settings can
contain provider credentials; this API reads/writes the real local store. Storage does not make
`/api/prompt` automatically use saved UI values. Local-fork desktop builds suppress upstream
update lookup (`latest:null`); other builds may contact GitHub through the backend.

## Implementation, examples, and maintenance

The [API handler](../../targets/web/backend/apiHandler.js) is shared by the release server and
Vite plugin. [HTTP helpers](../../targets/web/backend/vite-api-helpers.js) define body parsing,
JSON responses, output paths, and namespace storage. Desktop port selection is in
[lib.rs](../../targets/web-shell/src/lib.rs).

Working prompt request examples and seed/preset/catalog coverage are in
[promptApi.test.js](../../tests/integration/promptApi.test.js). The
[ComfyUI Python client](../../targets/comfyui/client.py) is an existing external HTTP integration;
see [ComfyUI system notes](comfyui.md). GPU job details are in
[localUpscale.js](../../targets/web/backend/localUpscale.js) and
[local inference notes](local-inference.md).

Maintain this reference alongside route, payload, provider, or connection changes. Examples here
were checked against source; this documentation task does not claim a live generation/rewrite run.
