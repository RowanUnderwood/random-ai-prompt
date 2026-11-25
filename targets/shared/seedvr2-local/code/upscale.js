/**
 * SeedVR2 — submit one job and wait for it (CLI and mobile). The web app follows jobs itself, so it
 * can show their place in the queue and cancel them.
 * @module targets/shared/seedvr2-local/code/upscale
 */
import { cancelUpscale, listUpscales, submitUpscale, upscaleResultUrl } from "./jobs.js";

const POLL_MS = 2000;
const MAX_POLL_FAILURES = 15;

/**
 * @param {object} args
 * @param {string} [args.image] A served `/api/output/...` path, filename, or `data:` URL.
 * @param {string} [args.imageBase64] Raw base64 bytes (how the phone hands over a local image).
 * @param {object} [args.settings] Provider settings.
 * @param {AbortSignal} [args.signal] Cancels the job.
 * @param {number} [args.pollMs] Delay between progress checks.
 * @returns {Promise<{images: string[], saved: boolean}>} `saved` means the gallery already has it.
 */
export default async function upscale({
  image,
  imageBase64,
  settings = {},
  signal,
  pollMs = POLL_MS,
}) {
  const source = imageBase64 ? `data:image/png;base64,${imageBase64}` : String(image);
  let job = await submitUpscale({
    image: source.startsWith("data:") ? source : source.replace(/^https?:\/\/[^/]+/, ""),
    settings,
    priority: 1,
  });
  let failures = 0;
  while (!["done", "error", "cancelled"].includes(job.state)) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (signal?.aborted) {
      await cancelUpscale(job.id);
      signal.throwIfAborted();
    }
    try {
      const { id } = job;
      job = (await listUpscales()).find((j) => j.id === id);
      failures = 0;
    } catch (error) {
      if (++failures >= MAX_POLL_FAILURES) throw error;
    }
    if (!job) throw new Error("The upscale job is no longer known to the app.");
  }
  if (job.state !== "done") throw new Error(job.error || "The upscale was cancelled.");
  return { images: [job.path || upscaleResultUrl(job.id)], saved: !!job.path };
}
