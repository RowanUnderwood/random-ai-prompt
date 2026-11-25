import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "./testUtils.jsx";
import SingleView from "../frontend/components/SingleView.jsx";
import { useUpscaleJobs } from "../frontend/lib/useUpscaleJobs.js";
import upscale from "../../shared/seedvr2-local/code/upscale.js";

afterEach(() => vi.unstubAllGlobals());

const item = {
  name: "first",
  file: "first.png",
  path: "/api/output/first.png",
  children: [],
  meta: { provider: "comfy-local", prompt: { final: "A fox" }, settings: {} },
};
function show(overrides = {}) {
  const props = {
    items: [item],
    current: item,
    active: true,
    settings: {},
    magick: { available: false, formats: [] },
    onBack: vi.fn(),
    onNavigate: vi.fn(),
    onDerive: vi.fn(),
    onResize: vi.fn(),
    onUpscale: vi.fn(),
    onDelete: vi.fn(),
    onSearch: vi.fn(),
    onCancelUpscale: vi.fn(),
    ...overrides,
  };
  return { ...render(<SingleView {...props} />), props };
}
const option = () => screen.getByRole("option", { name: /SeedVR2/ });
const loadImage = (width, height) => {
  const img = screen.getByAltText("A fox");
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
  fireEvent.load(img);
};

describe("Single view: SeedVR2 resize", () => {
  it("submits the open image from the Resize menu", () => {
    const { props } = show();
    loadImage(1024, 768);
    expect(option()).toHaveTextContent("AI Upscale · SeedVR2 (RTX 4090) · 4000px");
    expect(option()).toBeEnabled();
    fireEvent.change(option().closest("select"), { target: { value: "ai:seedvr2-local" } });
    expect(props.onUpscale).toHaveBeenCalledExactlyOnceWith(item, "seedvr2-local");
  });

  it("uses the adjustable target and locks images already that large", () => {
    show({ settings: { providerParams: { "seedvr2-local": { seedvr2Target: 2000 } } } });
    loadImage(1536, 864);
    expect(option()).toBeEnabled();
    expect(option()).toHaveTextContent("2000px");
    loadImage(1500, 2000);
    expect(option()).toBeDisabled();
    expect(option()).toHaveTextContent("already 2000px (target 2000px)");
  });

  it("shows each stage and cancels this image's job, ignoring another image's", () => {
    const job = (id, state, extra) => ({ id, state, ahead: 0, ...extra });
    const row = (parentPath, j) => ({ id: j.id, parentPath, kind: "resize", job: j });
    const { props } = show({
      derivations: [
        row(item.path, job("a", "queued", { ahead: 2 })),
        row(item.path, job("b", "waiting")),
        row(item.path, job("c", "running", { cancelling: true })),
        row("/api/output/other.png", job("d", "running")),
      ],
    });
    expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([
      "Waiting for the RTX 4090 · 2 ahead",
      "Waiting in ComfyUI…",
      "Cancelling…",
    ]);
    const buttons = screen.getAllByRole("button", { name: "Cancel upscale" });
    expect(buttons[2]).toBeDisabled();
    fireEvent.click(buttons[1]);
    expect(props.onCancelUpscale).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("shows the result size in the lineage", () => {
    const child = {
      ...item,
      meta: {
        ...item.meta,
        parent: "gone",
        derivedKind: "resize",
        upscale: { width: 4000, height: 3000 },
      },
    };
    show({ items: [child], current: child });
    expect(screen.getByText("(4000×3000)")).toBeInTheDocument();
  });
});

/** A backend whose job list the test controls. */
function backend(jobs = []) {
  const state = { jobs, down: false };
  state.fetch = vi.fn(async (url, init = {}) => {
    if (state.down) throw new TypeError("Failed to fetch");
    const reply = (data) => ({ ok: true, json: async () => structuredClone(data) });
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      const job = { id: `j${state.jobs.length + 1}`, image: body.image, state: "queued", ahead: 1 };
      state.jobs.push(job);
      return reply({ job });
    }
    if (init.method === "DELETE") {
      const job = state.jobs.find((j) => url.endsWith(j.id));
      job.cancelling = true;
      return reply({ job });
    }
    return reply({ jobs: state.jobs });
  });
  vi.stubGlobal("fetch", state.fetch);
  return state;
}
const follow = (props = {}) => {
  const onDone = vi.fn();
  const onError = vi.fn();
  return {
    onDone,
    onError,
    ...renderHook(() => useUpscaleJobs({ enabled: true, onDone, onError, pollMs: 15, ...props })),
  };
};

describe("useUpscaleJobs", () => {
  it("restores unfinished jobs after a reload without replaying finished ones", async () => {
    const server = backend([
      { id: "old", image: "/x.png", state: "done", path: "/y.png" },
      { id: "live", image: "/a.png", state: "running" },
    ]);
    const { result, onDone } = follow();
    await waitFor(() => expect(result.current.jobs.map((j) => j.id)).toEqual(["live"]));
    server.jobs[1] = { ...server.jobs[1], state: "done", path: "/api/output/big.png" };
    await waitFor(() => expect(result.current.jobs).toEqual([]));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "live" }));
    const calls = server.fetch.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(server.fetch.mock.calls.length).toBe(calls);
  });

  it("uses one poll for several jobs, keeps them while the backend is unreachable", async () => {
    const server = backend();
    const { result, onError } = follow();
    await act(async () => {
      await result.current.submit({ image: "/a.png" });
      await result.current.submit({ image: "/b.png" });
    });
    expect(result.current.jobs).toHaveLength(2);
    server.down = true;
    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.jobs).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
    server.down = false;
    server.jobs[0] = { ...server.jobs[0], state: "error", error: "out of memory" };
    server.jobs[1] = { ...server.jobs[1], state: "cancelled" };
    await waitFor(() => expect(result.current.jobs).toEqual([]));
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "j1" }),
      "out of memory",
    );
  });

  it("cancels a job and reports jobs lost to an app restart", async () => {
    const server = backend();
    const { result, onError } = follow();
    await act(async () => {
      await result.current.submit({ image: "/a.png" });
    });
    await act(async () => {
      await result.current.cancel("j1");
    });
    expect(result.current.jobs[0].cancelling).toBe(true);
    server.jobs = [];
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0][1]).toContain("restarted");
  });

  it("makes no requests online", () => {
    const server = backend();
    follow({ enabled: false });
    expect(server.fetch).not.toHaveBeenCalled();
  });
});

describe("SeedVR2 adapter (CLI and mobile)", () => {
  it("submits the phone's image inline, waits, and returns a download link", async () => {
    const server = backend();
    const result = upscale({ imageBase64: "QUJD", pollMs: 5, settings: { seedvr2Target: 2000 } });
    await waitFor(() => expect(server.jobs).toHaveLength(1));
    expect(JSON.parse(server.fetch.mock.calls[0][1].body)).toMatchObject({
      image: "data:image/png;base64,QUJD",
      settings: { seedvr2Target: 2000 },
    });
    server.jobs[0].state = "done";
    expect(await result).toEqual({ images: ["/api/local-upscale/j1/image"], saved: false });
  });

  it("returns the saved gallery path, and reports failures", async () => {
    const server = backend();
    const saved = upscale({ image: "http://localhost:4173/api/output/a.png", pollMs: 5 });
    await waitFor(() => expect(server.jobs).toHaveLength(1));
    expect(server.jobs[0].image).toBe("/api/output/a.png");
    Object.assign(server.jobs[0], { state: "done", path: "/api/output/big.png" });
    expect(await saved).toEqual({ images: ["/api/output/big.png"], saved: true });
    const failed = upscale({ image: "b.png", pollMs: 5 });
    failed.catch(() => {});
    await waitFor(() => expect(server.jobs).toHaveLength(2));
    Object.assign(server.jobs[1], { state: "error", error: "out of memory" });
    await expect(failed).rejects.toThrow("out of memory");
  });
});