/**
 * @file The prompt box's Random toggle (shuffle). It turns on and off like auto-fix, and while on,
 * Generate sends the UNEXPANDED `{#suggestion}` token so each prompt in a batch rolls its own.
 * An empty box sends the token too, so a batch never repeats one pre-rolled suggestion.
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import PromptComposer from "../../frontend/components/PromptComposer.jsx";
import { promptWithSuggestion } from "../../../../engine/suggestion.js";

function setup(initial = {}) {
  const onGenerate = vi.fn();
  let latest = null;
  function Harness() {
    const [settings, setSettings] = useState({
      prompt: "",
      provider: "no-such-provider",
      providerParams: {},
      rewriteProvider: "none",
      promptCount: 3,
      autoFix: false,
      autoKeyword: false,
      ...initial,
    });
    latest = settings;
    return <PromptComposer settings={settings} setSettings={setSettings} onGenerate={onGenerate} />;
  }
  render(
    <IntlProvider locale="en" messages={{}} onError={() => {}}>
      <Harness />
    </IntlProvider>,
  );
  const toggle = () => screen.getByRole("button", { name: "Random suggestion for every prompt" });
  const generate = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate prompt" }));
    });
    return onGenerate.mock.calls.at(-1)[0];
  };
  return { toggle, generate, settings: () => latest };
}

describe("PromptComposer — Random toggle", () => {
  it("turns on and off like auto-fix, and is never locked", () => {
    const { toggle, settings } = setup();
    expect(toggle()).not.toBeDisabled();
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle());
    expect(settings().autoRandom).toBe(true);
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
    expect(toggle()).toHaveClass("on");
    fireEvent.click(toggle());
    expect(settings().autoRandom).toBe(false);
  });

  it("adds the unexpanded token to typed text while on, and leaves the box untouched", async () => {
    const { toggle, generate, settings } = setup({ prompt: "a red fox" });
    expect(await generate()).toBe("a red fox");
    fireEvent.click(toggle());
    expect(await generate()).toBe("a red fox, {#suggestion}");
    expect(await generate()).toBe("a red fox, {#suggestion}");
    expect(settings().prompt).toBe("a red fox");
  });

  it("sends the token for an empty box, so each prompt in a batch gets its own suggestion", async () => {
    const { generate } = setup();
    expect(await generate()).toBe("{#suggestion}");
  });
});

describe("promptWithSuggestion", () => {
  it("appends once, without doubling a trailing comma, and keeps typed text when off", () => {
    expect(promptWithSuggestion("cat,", true)).toBe("cat, {#suggestion}");
    expect(promptWithSuggestion("  ", true)).toBe("{#suggestion}");
    expect(promptWithSuggestion(undefined, false)).toBe("{#suggestion}");
    expect(promptWithSuggestion("cat", false)).toBe("cat");
  });
});
