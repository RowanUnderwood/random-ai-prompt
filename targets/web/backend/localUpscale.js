/**
 * SeedVR2 upscaling on the RTX 4090. Jobs go through the same GPU queue as image renders, so the app
 * never runs both on that card at once. Work submitted to ComfyUI by other programs is serialized by
 * ComfyUI's own queue, and waiting there never counts as a timeout.
 *
 * Jobs are followed by polling rather than by holding a request open: a browser allows only six
 * connections per host, and several waiting upscales would otherwise stall the whole interface.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import workflow from "../../shared/seedvr2-local/data/seedvr2-workflow.json" with { type: "json" };
import { seedvr2Params } from "../../shared/seedvr2-local/settings.js";
import { directJson, gpuQueue } from "./localGpuPool.js";
import { LOCAL_SERVICES, probeService, runWithServiceActivity } from "./localServices.js";
import { detectMagick, IMAGE_TYPES, OUTPUT_DIR, resolveOutputFile } from "./vite-api-helpers.js";

const execFileP = promisify(execFile);
const PROVIDER_ID = "seedvr2-local";
const SAVE_NODE = "24";
const FINISHED = new Set(["done", "error", "cancelled"]);
const KEEP_FINISHED = 50;
/** Give up on ComfyUI after this long without one successful poll; it stalls while loading models. */
const SILENT_MS = 180000;
/** Polls in a row that find a submitted job in neither the queue nor the history. */
const LOST_POLLS = 3;

/**
 * Pixel size from a PNG or JPEG header.
 * @param {Buffer} buf The image bytes.
 * @returns {{width: number, height: number}|null} Null for other formats.
 */
export function imageSize(buf) {
  if (buf.length >= 24 && buf.toString("latin1", 1, 4) === "PNG")
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // Start-of-frame markers, excluding the Huffman/arithmetic table markers in the same range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

async function magickSize(file) {
  const magick = await detectMagick();
  if (!magick.available) return null;
  const { stdout } = await execFileP(magick.bin, [`${file}[0]`, "-format", "%w %h", "info:"], {
    timeout: 20000,
  });
  const [width, height] = stdout.trim().split(/\s+/).map(Number);
  return width > 0 && height > 0 ? { width, height } : null;
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** A loader's choices, in either ComfyUI format: `[[...]]` or `["COMBO", { options }]`. */
const choicesOf = (info, key) => {
  const spec = info.input?.required?.[key] ?? info.input?.optional?.[key];
  if (Array.isArray(spec?.[0])) return spec[0];
  return Array.isArray(spec?.[1]?.options) ? spec[1].options : null;
};

/** @returns {object} An upscale job manager. Dependencies are replaceable for tests. */
export function createUpscaler({
  service = LOCAL_SERVICES.find((s) => s.id === "comfy4090"),
  queue = gpuQueue,
  probe = probeService,
  resolveSource = resolveOutputFile,
  outputDir = OUTPUT_DIR,
  fallbackSize = magickSize,
  pollMs = 1200,
  silentMs = SILENT_MS,
} = {}) {
  const jobs = new Map();

  const view = (job) => ({
    id: job.id,
    image: job.served,
    state: job.state,
    ahead: job.state === "queued" ? queue.ahead(job.id) : 0,
    cancelling: job.controller.signal.aborted && !FINISHED.has(job.state),
    target: job.target,
    path: job.path,
    error: job.error,
  });

  async function requireReady() {
    const state = await probe(service);
    if (state.ready) return;
    throw fail(
      state.occupied
        ? `${service.label} is listening but not ready (${state.reason || "unknown reason"}). Wait and retry.`
        : `${service.label} is not running. Start it in Settings → Local services.`,
      503,
    );
  }

  /** Confirm the nodes and model files exist before queueing work that would otherwise fail late. */
  async function validate(graph) {
    const required = ["SeedVR2LoadDiTModel", "SeedVR2LoadVAEModel", "SeedVR2VideoUpscaler"];
    for (const type of [...required, "easy cleanGpuUsed"]) {
      const info = (await directJson(`${service.url}/object_info/${encodeURIComponent(type)}`))[
        type
      ];
      if (!info)
        throw new Error(
          `SeedVR2 needs the "${type}" node on ${service.label}. Install its custom nodes first.`,
        );
      for (const { class_type, inputs } of Object.values(graph)) {
        if (class_type !== type) continue;
        for (const key of ["model", "attention_mode"]) {
          const choices = choicesOf(info, key);
          if (inputs[key] && choices && !choices.includes(inputs[key]))
            throw new Error(`${service.label} does not offer ${key} "${inputs[key]}".`);
        }
      }
    }
  }

  async function upload(buf, ext) {
    // Named by content, so upscaling an image again reuses its copy in ComfyUI's input folder.
    // Not "temp": the instances share that folder and each one clears it when it starts.
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
    const form = new FormData();
    form.append("image", new Blob([buf], { type: IMAGE_TYPES[ext] }), `${hash}.${ext}`);
    form.append("subfolder", "random-ai-prompt");
    const res = await fetch(`${service.url}/upload/image`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.name)
      throw new Error(data.error || `ComfyUI image upload failed (${res.status}).`);
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  }

  /** Remove our own prompt from ComfyUI, and only ours. */
  async function cancelRemote(promptId, running) {
    const res = await fetch(`${service.url}/${running ? "interrupt" : "queue"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(running ? { prompt_id: promptId } : { delete: [promptId] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`ComfyUI returned ${res.status}`);
  }

  /** Follow a submitted prompt to its end. The GPU slot stays held until ComfyUI is done with it. */
  async function follow(job, promptId) {
    const { signal } = job.controller;
    let lastContact = Date.now();
    let refused = 0;
    let lost = 0;
    for (;;) {
      let entry;
      try {
        // The queue first: a job leaving it is already in the history by the time we read that.
        const state = await directJson(`${service.url}/queue`);
        const holds = (list) => list?.some((item) => item[1] === promptId);
        const running = holds(state.queue_running);
        const pending = holds(state.queue_pending);
        if (signal.aborted && (running || pending)) await cancelRemote(promptId, running);
        entry = (await directJson(`${service.url}/history/${promptId}`))[promptId];
        if (running) job.state = "running";
        lost = running || pending || entry ? 0 : lost + 1;
        lastContact = Date.now();
        refused = 0;
      } catch (error) {
        refused = error.cause?.code === "ECONNREFUSED" ? refused + 1 : 0;
        if (refused >= LOST_POLLS || Date.now() - lastContact > silentMs)
          throw new Error(
            `Lost contact with ${service.label} during the upscale. It was not resubmitted.`,
            { cause: error },
          );
      }
      if (entry) {
        signal.throwIfAborted();
        if (entry.status?.status_str === "error") {
          const message = (type) => entry.status.messages?.find(([t]) => t === type)?.[1];
          if (message("execution_interrupted"))
            throw new Error("The upscale was interrupted in ComfyUI.");
          throw new Error(
            message("execution_error")?.exception_message || "The SeedVR2 workflow failed.",
          );
        }
        const image = entry.outputs?.[SAVE_NODE]?.images?.[0];
        if (image) return image;
        if (entry.status?.completed) throw new Error("ComfyUI finished without an image.");
      }
      if (lost >= LOST_POLLS) {
        signal.throwIfAborted(); // a cancelled pending job leaves no history
        throw new Error(
          `${service.label} no longer has this job; it may have restarted. It was not resubmitted.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  async function save(job, buf, promptId) {
    let parent = {};
    const base = path.basename(job.file).replace(/\.[^.]+$/, "");
    try {
      parent = JSON.parse(fs.readFileSync(job.file.replace(/\.[^.]+$/, ".json"), "utf8")) || {};
    } catch {
      // an image without a readable sidecar can still be upscaled
    }
    const size = imageSize(buf);
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 6)}`;
    const sidecar = path.join(outputDir, `${name}.json`);
    // The sidecar first, so the gallery never sees the image without it.
    fs.writeFileSync(
      sidecar,
      JSON.stringify(
        {
          prompt: parent.prompt || null,
          negative: parent.negative || null,
          provider: parent.provider,
          providerLabel: parent.providerLabel,
          // The parent's own recipe, unchanged, so the child can still be rendered again.
          settings: { ...parent.settings, aiUpscaleBy: PROVIDER_ID },
          parent: base,
          derivedKind: "resize",
          aiUpscaleBy: PROVIDER_ID,
          upscale: {
            workflow: "seedvr2",
            model: job.graph["20"].inputs.model,
            target: job.target,
            seed: job.seed,
            ...size,
            localGpu: service.label,
            comfyUrl: service.url,
            promptId,
            seconds: Math.round((Date.now() - job.startedAt) / 100) / 10,
          },
          file: `${name}.png`,
          image: `/api/output/${name}.png`,
          savedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
    try {
      fs.writeFileSync(path.join(outputDir, `${name}.png`), buf, { flag: "wx" });
    } catch (error) {
      fs.rmSync(sidecar, { force: true });
      throw error;
    }
    return `/api/output/${name}.png`;
  }

  async function execute(job) {
    const { signal } = job.controller;
    job.state = "starting";
    job.startedAt = Date.now();
    signal.throwIfAborted();
    await requireReady();
    const graph = structuredClone(workflow);
    job.graph = graph;
    await validate(graph);
    if (job.file && !fs.existsSync(job.file)) throw new Error("The source image was deleted.");
    const buf = job.file ? fs.readFileSync(job.file) : job.data;
    graph["26"].inputs.image = await upload(buf, job.ext);
    graph[SAVE_NODE].inputs.filename_prefix = `RandomPrompt/${crypto.randomUUID()}`;
    Object.assign(graph["33"].inputs, {
      seed: job.seed,
      resolution: job.target,
      max_resolution: job.target,
    });
    signal.throwIfAborted();
    // Deliberately not abortable: without its id, a submitted prompt could not be cancelled.
    const { prompt_id: promptId } = await directJson(`${service.url}/prompt`, {
      prompt: graph,
      client_id: crypto.randomUUID(),
    });
    if (!promptId) throw new Error("ComfyUI did not return a prompt id.");
    job.state = "waiting";
    const image = await follow(job, promptId);
    job.state = "saving";
    const url = `${service.url}/view?${new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder || "",
      type: image.type || "output",
    })}`;
    if (!job.file) {
      job.resultUrl = url;
      return;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Could not read the upscaled image (${res.status}).`);
    job.path = await save(job, Buffer.from(await res.arrayBuffer()), promptId);
  }

  function start(job) {
    queue
      .run(
        [service.url],
        () => runWithServiceActivity(service.url, () => execute(job)),
        job.controller.signal,
        { priority: job.priority, id: job.id },
      )
      .then(
        () => {
          job.state = "done";
        },
        (error) => {
          job.state = job.controller.signal.aborted ? "cancelled" : "error";
          if (job.state === "error") job.error = error.message || String(error);
        },
      )
      .finally(() => {
        job.data = null;
        job.graph = null;
        const finished = [...jobs.values()].filter((j) => FINISHED.has(j.state));
        for (const old of finished.slice(0, -KEEP_FINISHED)) jobs.delete(old.id);
      });
  }

  return {
    list: () => [...jobs.values()].map(view),
    resultUrl: (id) => jobs.get(id)?.resultUrl || null,

    /**
     * Queue an upscale. Asking again for an identical one still in progress returns that job.
     * @param {object} request `{ image, settings, priority }`.
     * @returns {Promise<object>} The job.
     */
    async submit({ image, settings, priority } = {}) {
      const { target, seed } = seedvr2Params(settings || {});
      let file = null;
      let data = null;
      let ext;
      const inline = typeof image === "string" && image.match(/^data:image\/(\w+);base64,(.*)$/s);
      if (inline) {
        data = Buffer.from(inline[2], "base64");
        ext = inline[1] === "jpeg" ? "jpg" : inline[1];
      } else {
        file = resolveSource(image);
        ext = path.extname(file || "").slice(1).toLowerCase();
      }
      if ((file && !fs.existsSync(file)) || (!file && !data))
        throw fail("Source image not found.", 404);
      if (!IMAGE_TYPES[ext]) throw fail("Unsupported image type.");
      let size = imageSize(data || fs.readFileSync(file));
      if (!size && file) size = await fallbackSize(file).catch(() => null);
      if (!size) throw fail("Could not read the image's dimensions.");
      const longest = Math.max(size.width, size.height);
      if (longest >= target)
        throw fail(
          `This image is already ${longest}px on its longest edge; the upscale target is ${target}px.`,
          409,
        );
      await requireReady();

      const source = file || crypto.createHash("sha256").update(data).digest("hex");
      const key = `${source}|${target}|${seed}`;
      const existing = [...jobs.values()].find(
        (job) => job.key === key && !FINISHED.has(job.state) && !job.controller.signal.aborted,
      );
      if (existing) return view(existing);
      const job = {
        id: crypto.randomUUID(),
        key,
        served: file ? `/api/output/${path.basename(file)}` : null,
        file,
        data,
        ext,
        target,
        seed,
        priority: priority ? 1 : 0,
        state: "queued",
        path: null,
        error: "",
        controller: new AbortController(),
      };
      jobs.set(job.id, job);
      start(job);
      return view(job);
    },

    /** Cancel a job at any stage. Returns null for an unknown id; finished jobs are left alone. */
    cancel(id) {
      const job = jobs.get(id);
      if (!job) return null;
      if (!FINISHED.has(job.state)) job.controller.abort(new Error("The upscale was cancelled."));
      return view(job);
    },
  };
}

export const localUpscaler = createUpscaler();
