import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../testUtils.jsx";

const resetDecks = vi.hoisted(() => vi.fn());
vi.mock("../../frontend/lib/promptEngine.js", () => ({ getListNames: () => [], resetDecks }));
import Settings from "../../frontend/components/Settings.jsx";
import { defaultSettings } from "../../frontend/lib/settings.js";
import { REWRITE_SYSTEM } from "../../../shared/_shared/rewriteSystem.js";

afterEach(() => vi.clearAllMocks());

const DEFAULT_TEXT =
  "You are a prompt engineer for text-to-image models. Rewrite the user's raw, mechanical prompt into ONE clean, well-structured image-generation prompt that will produce a better result: fix grammar, remove redundancy and contradictions, group related ideas, and keep every important subject, style, and detail. Reply with ONLY the rewritten prompt — no preamble, no quotes, no explanation.";

function show(overrides) {
  let latest;
  function Harness() {
    const [s, set] = useState({ ...defaultSettings, ...overrides });
    latest = s;
    return <Settings settings={s} setSettings={set} />;
  }
  render(<Harness />);
  return () => latest;
}
const box = () => screen.getByRole("textbox", { name: "Auto-fix system prompt" });
const reset = () => screen.getByRole("button", { name: "Reset to default" });

describe("Settings — auto-fix system prompt", () => {
  it("shows the requested default and starts with nothing to reset", () => {
    const settings = show();
    expect(REWRITE_SYSTEM).toBe(DEFAULT_TEXT);
    expect(box()).toHaveValue(DEFAULT_TEXT);
    expect(reset()).toBeDisabled();
    expect(settings().rewriteSystem).toBeNull();
  });

  it("edits, clears and resets", () => {
    const settings = show();
    fireEvent.change(box(), { target: { value: "Describe a photo." } });
    expect(settings().rewriteSystem).toBe("Describe a photo.");
    fireEvent.change(box(), { target: { value: "" } });
    expect(box()).toHaveValue("");
    fireEvent.click(reset());
    expect(box()).toHaveValue(DEFAULT_TEXT);
    expect(settings().rewriteSystem).toBeNull();
    fireEvent.change(box(), { target: { value: "x" } });
    fireEvent.change(box(), { target: { value: DEFAULT_TEXT } });
    expect(settings().rewriteSystem).toBeNull();
  });
});

describe("Settings — shuffled decks", () => {
  const deck = () => screen.getByRole("checkbox", { name: "Draw from shuffled decks" });

  it("turns on and off, and reshuffles on request", () => {
    const settings = show();
    expect(deck()).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Reshuffle now" })).toBeNull();
    fireEvent.click(deck());
    expect(settings().shuffleDeck).toBe(true);
    expect(screen.getByText(/repeats until every option/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reshuffle now" }));
    expect(resetDecks).toHaveBeenCalledOnce();
    fireEvent.click(deck());
    expect(settings().shuffleDeck).toBe(false);
  });

  it("says when a pinned seed pauses the decks", () => {
    show({ shuffleDeck: true, randomSeed: false, promptSeed: "42" });
    expect(screen.getByText(/Paused while a seed is pinned/)).toBeInTheDocument();
  });

  it("no longer offers the checkbox that did nothing", () => {
    show();
    expect(screen.queryByText("Reload lists each prompt")).toBeNull();
  });
});