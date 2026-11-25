/**
 * Follow the backend's upscale jobs: one short poll covers all of them, and only while any is active.
 * Jobs started before a page reload are picked up again. Effects only, so it is prerender-safe.
 * @module gui/lib/useUpscaleJobs
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelUpscale,
  listUpscales,
  submitUpscale,
} from "../../../shared/seedvr2-local/code/jobs.js";

const FINISHED = ["done", "error", "cancelled"];

/**
 * @param {object} args
 * @param {boolean} args.enabled False online, where there is no backend.
 * @param {Function} args.onDone `(job)` — a job finished and its image is saved.
 * @param {Function} args.onError `(job, message)` — a job failed.
 * @param {number} [args.pollMs] Delay between polls.
 * @returns {{jobs: object[], submit: Function, cancel: Function}} `jobs` are the unfinished ones.
 */
export function useUpscaleJobs({ enabled, onDone, onError, pollMs = 1500 }) {
  const [jobs, setJobs] = useState([]);
  const tracked = useRef(new Map()); // id → last known job
  const handlers = useRef({});
  handlers.current = { onDone, onError };
  const active = jobs.length > 0;

  const publish = () => setJobs([...tracked.current.values()]);

  const poll = useCallback(async (adopt = false) => {
    // Only jobs known before the request can be judged missing from its answer.
    const before = [...tracked.current.keys()];
    let list;
    try {
      list = await listUpscales();
    } catch {
      return; // backend briefly unreachable: keep the placeholders and ask again
    }
    const byId = new Map(list.map((job) => [job.id, job]));
    if (adopt)
      for (const job of list) if (!FINISHED.includes(job.state)) tracked.current.set(job.id, job);
    for (const id of before) {
      const last = tracked.current.get(id);
      if (!last) continue;
      const job = byId.get(id);
      if (job && !FINISHED.includes(job.state)) {
        tracked.current.set(id, job);
        continue;
      }
      tracked.current.delete(id);
      if (!job) handlers.current.onError(last, "The app restarted before this upscale finished.");
      else if (job.state === "done") handlers.current.onDone(job);
      else if (job.state === "error") handlers.current.onError(job, job.error);
    }
    publish();
  }, []);

  useEffect(() => {
    if (enabled) poll(true);
  }, [enabled, poll]);

  useEffect(() => {
    if (!enabled || !active) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      await poll();
      if (!stopped) timer = setTimeout(tick, pollMs);
    };
    timer = setTimeout(tick, pollMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, active, poll, pollMs]);

  const submit = useCallback(async (request) => {
    const job = await submitUpscale(request);
    tracked.current.set(job.id, job);
    publish();
    return job;
  }, []);

  const cancel = useCallback(async (id) => {
    const job = await cancelUpscale(id);
    // A finished job is left for the next poll, which reports how it ended.
    if (tracked.current.has(id) && !FINISHED.includes(job.state)) tracked.current.set(id, job);
    publish();
  }, []);

  return { jobs, submit, cancel };
}