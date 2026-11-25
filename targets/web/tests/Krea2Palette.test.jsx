/** @file Real browser catalog + palette interactions while switching image providers/workflows. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "./testUtils.jsx";
import BlockPalette from "../frontend/components/home/BlockPalette.jsx";
import { ensureCatalog, expandPrompt, getDplCompletions, getListNames } from "../frontend/lib/promptEngine.js";

beforeAll(() => ensureCatalog(), 30000);
const krea = { provider: "comfy-local", providerParams: { "comfy-local": { comfyWorkflow: "krea2" } }, keywordEmphasis: false, autoAddFx: false, autoAddArtists: false };
const sd = { ...krea, provider: "forge" };

describe("Krea 2 palette", () => {
  it("inserts the real tokens, hides them on SD selection, and restores them on returning to Krea", () => {
    const onInsert = vi.fn();
    const props = { includeAdult: false, onInsert, onShowTip: vi.fn(), onMoveTip: vi.fn(), onHideTip: vi.fn() };
    const view = render(<BlockPalette {...props} settings={krea} />);
    fireEvent.change(screen.getByPlaceholderText("Search blocks…"), { target: { value: "krea2" } });
    fireEvent.click(screen.getByRole("button", { name: "krea2-actors", exact: true }));
    expect(onInsert).toHaveBeenLastCalledWith("{#krea2-actors}");
    fireEvent.click(screen.getByRole("button", { name: "krea2-style-library", exact: true }));
    expect(onInsert).toHaveBeenLastCalledWith("{#krea2-style-library}");
    view.rerender(<BlockPalette {...props} settings={sd} />);
    expect(screen.queryByRole("button", { name: "krea2-actors", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "krea2-style-library", exact: true })).toBeNull();
    view.rerender(<BlockPalette {...props} settings={krea} />);
    expect(screen.getByRole("button", { name: "krea2-actors", exact: true })).toBeTruthy();
    view.rerender(<BlockPalette {...props} settings={{ ...krea, providerParams: { "comfy-local": { comfyWorkflow: "checkpoint" } } }} />);
    expect(screen.queryByRole("button", { name: "krea2-actors", exact: true })).toBeNull();
    cleanup();
  });

  it("applies model visibility to actual Vite-backed generation, completions and vocabulary choices", () => {
    for (const prompt of ["{#krea2-actors}", "{#krea2-style-library}", "{krea2/bands}"]) {
      expect(expandPrompt(prompt, krea).length).toBeGreaterThan(0);
      expect(expandPrompt(prompt, sd)).toBe("");
    }
    expect(getDplCompletions(sd).some(({ token }) => token.includes("krea2"))).toBe(false);
    expect(getListNames(sd).some((name) => name.includes("krea2"))).toBe(false);
    expect(getDplCompletions(krea).some(({ token }) => token === "{#krea2-actors}")).toBe(true);
    expect(getListNames(krea)).toContain("krea2/bands");
  });
});
