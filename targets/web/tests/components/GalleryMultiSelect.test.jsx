/**
 * @file Tests for the Gallery multi-select + mass-delete flow. Renders the grid with a couple of
 * feed items, enters selection mode, selects cells, and asserts the mass-delete callback fires with
 * the chosen paths (and that select-all covers the filtered set).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import Gallery from "../../frontend/components/Gallery.jsx";

const items = [
  { path: "/api/output/a.png", file: "a.png", name: "a", meta: { prompt: { final: "a fox" } } },
  { path: "/api/output/b.png", file: "b.png", name: "b", meta: { prompt: { final: "a cat" } } },
];

function renderGallery(props = {}) {
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <Gallery
        items={items}
        loading={false}
        query=""
        onQueryChange={() => {}}
        onOpen={() => {}}
        onRefresh={() => {}}
        onDelete={() => {}}
        {...props}
      />
    </IntlProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Gallery multi-select", () => {
  it("has no Select control without an onDeleteMany handler", () => {
    renderGallery();
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });

  it("selects one image and mass-deletes it", () => {
    const onDeleteMany = vi.fn();
    renderGallery({ onDeleteMany });

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    // Cells are now toggles; pick the fox.
    fireEvent.click(screen.getByRole("button", { name: "Select: a fox" }));
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete 1 image" }));
    expect(onDeleteMany).toHaveBeenCalledWith(["/api/output/a.png"]);
  });

  it("queues the selected images for upscaling and clears the selection", async () => {
    const onUpscaleMany = vi.fn(async () => true);
    renderGallery({ onDeleteMany: vi.fn(), onUpscaleMany });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByRole("button", { name: "Upscale 0 images" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Upscale 2 images" }));
    expect(onUpscaleMany).toHaveBeenCalledExactlyOnceWith(["/api/output/a.png", "/api/output/b.png"]);
    expect(await screen.findByText("None selected")).toBeTruthy();
  });

  it("keeps the selection when the bulk upscale is declined", async () => {
    const onUpscaleMany = vi.fn(async () => false);
    renderGallery({ onDeleteMany: vi.fn(), onUpscaleMany });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Select: a fox" }));
    fireEvent.click(screen.getByRole("button", { name: "Upscale 1 image" }));
    await Promise.resolve();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("shows upscale progress, cancels every job, and surfaces the last failure", () => {
    const onCancelUpscales = vi.fn();
    renderGallery({
      upscaleJobs: [{ id: "one" }, { id: "two" }],
      upscaleError: "a.png: out of memory",
      onCancelUpscales,
    });
    expect(screen.getByRole("status").textContent).toBe("2 upscales in progress");
    expect(screen.getByRole("alert").textContent).toBe("a.png: out of memory");
    fireEvent.click(screen.getByRole("button", { name: "Cancel all" }));
    expect(onCancelUpscales).toHaveBeenCalledExactlyOnceWith(["one", "two"]);
  });

  it("keeps the selection when the mass delete is cancelled", async () => {
    const onDeleteMany = vi.fn(() => false); // App returns false on a cancelled confirm
    renderGallery({ onDeleteMany });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Select: a fox" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 image" }));
    expect(onDeleteMany).toHaveBeenCalled();
    // Selection preserved because the delete was cancelled.
    expect(await screen.findByText("1 selected")).toBeTruthy();
  });

  it("clears the selection after a successful mass delete", async () => {
    const onDeleteMany = vi.fn(() => true);
    renderGallery({ onDeleteMany });
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Select: a fox" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete 1 image" }));
    expect(await screen.findByText("None selected")).toBeTruthy();
  });

  it("select-all covers every filtered item", () => {
    const onDeleteMany = vi.fn();
    renderGallery({ onDeleteMany });

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete 2 images" }));
    expect(onDeleteMany).toHaveBeenCalledTimes(1);
    expect(onDeleteMany.mock.calls[0][0].sort()).toEqual([
      "/api/output/a.png",
      "/api/output/b.png",
    ]);
  });

  it("renders live placeholder cells for in-flight generations", () => {
    renderGallery({ pending: [{ id: "p1", label: "a unicorn" }] });
    // The placeholder shows the prompt label (aria-hidden container, but text is present).
    expect(screen.getByText("a unicorn")).toBeTruthy();
  });
});
