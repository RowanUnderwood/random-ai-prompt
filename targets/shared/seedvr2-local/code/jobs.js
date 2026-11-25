/** Client for the backend's upscale jobs. Every call is short, so waiting never holds a connection. */
import { apiUrl, transportFetch } from "../../_shared/transport/config.js";

const ROUTE = "/api/local-upscale";

async function call(path, init) {
  const res = await transportFetch(apiUrl(ROUTE + path), init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upscale request failed (${res.status}).`);
  return data;
}

/**
 * @param {object} job `{ image, settings, priority }`; `image` is a served path or `data:` URL.
 * @returns {Promise<object>} The queued job.
 */
export const submitUpscale = (job) =>
  call("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  }).then((data) => data.job);

/** @returns {Promise<object[]>} Every known job, oldest first. */
export const listUpscales = () => call("").then((data) => data.jobs);

/** @returns {Promise<object>} The job, after asking for it to be cancelled. */
export const cancelUpscale = (id) =>
  call(`/${encodeURIComponent(id)}`, { method: "DELETE" }).then((data) => data.job);

/** Where a job's result can be downloaded when the backend did not save it to its own gallery. */
export const upscaleResultUrl = (id) => apiUrl(`${ROUTE}/${encodeURIComponent(id)}/image`);
