/**
 * @file Component test for the mobile Generate screen. Mounts the REAL <GenerateScreen/> through the
 * jest-expo renderer (native modules + app data mocked) and asserts the composer renders and its core
 * flows wire: rolling prompts into results, opening the full prompt-settings gear, and the live preview.
 */
import React from "react";
import { Switch } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";

jest.mock("../../lib/theme.js", () => ({
  useTheme: () => ({
    T: new Proxy({}, { get: (_t, k) => (typeof k === "string" && k.startsWith("radius") ? 12 : "#334") }),
    provider: "plain",
    rewriteProvider: "none",
    providerSettings: {},
    setProviderSetting: jest.fn(),
    backendUrl: "",
  }),
}));
jest.mock("../../lib/engine.js", () => ({
  run: {
    generatePrompts: jest.fn(() => ({ seed: "7", prompts: ["hello world"] })),
    generatePrompt: jest.fn(() => "hello world"),
  },
  baseSettings: { prompt: "{#random-words}" },
  expandOnce: jest.fn(() => "a live preview line"),
  resetDecks: jest.fn(),
  getListNames: jest.fn(() => []),
}));
jest.mock("../../lib/blockCatalog.js", () => ({ getDplCompletions: jest.fn(() => []) }));
jest.mock("../../lib/imageProviders.js", () => ({
  getImageProvider: jest.fn(() => ({ id: "plain", copy: true, label: "None" })),
  getTextProvider: jest.fn(),
  providerDefaults: jest.fn(() => ({})),
  systemFor: jest.fn(() => "sys"),
}));
jest.mock("../../lib/single.js", () => ({ sizeFromSettings: jest.fn(() => "") }));
jest.mock("../../lib/keys.js", () => ({ getKey: jest.fn(async () => "") }));
jest.mock("../../lib/storage.js", () => ({ saveImageSrc: jest.fn(async () => ({})) }));
jest.mock("../../components/InsertMenu.js", () => () => null);
jest.mock("../../components/BlockPalette.js", () => () => null);

import * as providers from "../../lib/imageProviders.js";
import * as engine from "../../lib/engine.js";
import * as storage from "../../lib/storage.js";
import GenerateScreen from "../GenerateScreen.js";

// Default: the "plain" copy provider (prompts only, no images).
const COPY_PROVIDER = { id: "plain", copy: true, label: "None" };
beforeEach(() => {
  providers.getImageProvider.mockReturnValue(COPY_PROVIDER);
  storage.saveImageSrc.mockResolvedValue({});
});

async function setup() {
  const onGenerated = jest.fn(), onOpenImage = jest.fn();
  const utils = render(<GenerateScreen onGenerated={onGenerated} onOpenImage={onOpenImage} />);
  await act(async () => {});
  return { ...utils, onGenerated, onOpenImage };
}

describe("GenerateScreen (mounted)", () => {
  it("renders the composer (editor, prompts count, generate button)", async () => {
    const { getByPlaceholderText, getByText, getByLabelText } = await setup();
    // The empty box advertises the rotating random suggestion (web parity: "Try: …"); it falls back
    // to "{#random-words}" only until the first suggestion rolls.
    expect(getByPlaceholderText("Try: a live preview line")).toBeTruthy();
    expect(getByText("PROMPTS")).toBeTruthy();
    expect(getByLabelText("Generate prompts")).toBeTruthy();
  });

  it("rolling generates prompts into the results feed", async () => {
    const { getByLabelText, findByText } = await setup();
    fireEvent.press(getByLabelText("Generate prompts"));
    expect(await findByText("hello world")).toBeTruthy();
  });

  it("the gear opens the full prompt-settings sheet", async () => {
    const { getByLabelText, findByText, getByText } = await setup();
    fireEvent.press(getByLabelText("Prompt settings"));
    expect(await findByText("Salt & lists")).toBeTruthy();
    expect(getByText("Vocabulary")).toBeTruthy();
    expect(getByText("Emphasis")).toBeTruthy();
  });

  it("the Auto-add FX switch reaches the next roll", async () => {
    const { getByLabelText, findByText, UNSAFE_getAllByType } = await setup();
    fireEvent.press(getByLabelText("Prompt settings"));
    const label = await findByText(/Auto-add FX/);
    const row = label.parent.parent;
    const toggle = UNSAFE_getAllByType(Switch).find((s) => {
      for (let node = s.parent; node; node = node.parent) if (node === row) return true;
      return false;
    });
    for (const on of [true, false]) {
      fireEvent(toggle, "valueChange", on);
      fireEvent.press(getByLabelText("Generate prompts"));
      await act(async () => {});
      expect(engine.run.generatePrompts).toHaveBeenLastCalledWith(
        expect.objectContaining({ autoAddFx: on }),
      );
    }
  });

  it("edits and resets the rewrite prompt, and reshuffles decks", async () => {
    const { getByLabelText, findByText, getByText, queryByText, UNSAFE_getAllByType } =
      await setup();
    fireEvent.press(getByLabelText("Prompt settings"));
    await findByText("AI rewrite");
    const box = () => getByLabelText("Auto-fix system prompt");
    const original = box().props.value;
    expect(original).toMatch(/^You are a prompt engineer/);
    fireEvent.changeText(box(), "Mine");
    expect(box().props.value).toBe("Mine");
    fireEvent.press(getByText("Reset rewrite prompt"));
    expect(box().props.value).toBe(original);

    expect(queryByText("Reload lists each prompt")).toBeNull();
    expect(queryByText("Reshuffle now")).toBeNull();
    const row = getByText("Draw from shuffled decks").parent.parent;
    const toggle = UNSAFE_getAllByType(Switch).find((s) => {
      for (let node = s.parent; node; node = node.parent) if (node === row) return true;
      return false;
    });
    fireEvent(toggle, "valueChange", true);
    fireEvent.press(getByText("Reshuffle now"));
    expect(engine.resetDecks).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText("Generate prompts"));
    await act(async () => {});
    expect(engine.run.generatePrompts).toHaveBeenLastCalledWith(
      expect.objectContaining({ shuffleDeck: true, rewriteSystem: null }),
    );
  });

  it("live preview renders a re-rolled example", async () => {
    const { getByLabelText, findByText } = await setup();
    fireEvent.press(getByLabelText("Toggle live preview"));
    expect(await findByText("PREVIEW · LIVE")).toBeTruthy();
  });

  // --- Image batches: INTERACTION tests (regression) ---------------------------------------------
  // These press things. The previous suite only asserted rendering, so two real bugs sailed through:
  //   1. App passed `onOpenImage` but GenerateScreen never destructured it → thumbs were dead.
  //   2. Generate saved images to the Gallery but never attached them to their prompt row, so nothing
  //      appeared inline on Generate; and the row stored RAW provider sources (which Single, which
  //      resolves by saved gallery uri, could never open).

  const savedItem = { name: "img-1.png", uri: "file:///doc/rap/images/img-1.png" };
  const withImageProvider = () => {
    providers.getImageProvider.mockReturnValue({
      id: "comfyui",
      local: true,
      copy: false,
      label: "ComfyUI",
      generate: jest.fn(async () => ({ images: ["data:image/png;base64,AAA"] })),
    });
    storage.saveImageSrc.mockResolvedValue(savedItem);
  };

  it("generating auto-attaches the image INLINE to its prompt row", async () => {
    withImageProvider();
    const { getByLabelText, findByLabelText } = await setup();
    fireEvent.press(getByLabelText("Generate prompts"));
    // The thumb shows under the prompt (not only in the Gallery).
    expect(await findByLabelText("Open generated image 1")).toBeTruthy();
  });

  it("tapping a generated image opens it in Single via onOpenImage (with the SAVED gallery item)", async () => {
    withImageProvider();
    const { getByLabelText, findByLabelText, onOpenImage } = await setup();
    fireEvent.press(getByLabelText("Generate prompts"));
    fireEvent.press(await findByLabelText("Open generated image 1"));
    // Must hand Single the saved {name, uri} — Single resolves by gallery uri, not the raw source.
    expect(onOpenImage).toHaveBeenCalledWith(savedItem);
  });

  it("the per-row 'Generate images' link also yields a tappable, openable image", async () => {
    withImageProvider();
    const { getByLabelText, getByText, findByLabelText, onOpenImage } = await setup();
    fireEvent.press(getByLabelText("Generate prompts"));
    await findByLabelText("Open generated image 1");
    fireEvent.press(getByText("Generate images")); // per-row link
    const thumbs = await findByLabelText("Open generated image 2");
    fireEvent.press(thumbs);
    expect(onOpenImage).toHaveBeenCalledWith(savedItem);
  });
});
/**
 * Regression: the toolbar's 5th slot used to be a SECOND building-blocks button — an exact duplicate
 * of the green FAB (same icon, same `setPaletteOpen(true)` handler) — which meant the web's SHUFFLE
 * control (now the Random toggle) was missing from mobile entirely.
 *
 * Nothing automated caught it: the surface-parity check greps for /suggestions/, which matched the
 * DPL *completion strip* (a different feature that happens to share the word), and a render-only test
 * sees a perfectly fine button. It was found by LOOKING at a screenshot. See working-agreements §B3.
 */
describe("GenerateScreen — random suggestion (shuffle)", () => {
  it("the shuffle toggles Random, which adds the unexpanded suggestion to every roll", async () => {
    const { getByLabelText, getByDisplayValue } = await setup();
    const roll = async () => {
      fireEvent.press(getByLabelText("Generate prompts"));
      await act(async () => {});
      return engine.run.generatePrompts.mock.calls.at(-1)[0].prompt;
    };

    expect(await roll()).toBe("{#random-words}");

    fireEvent.press(getByLabelText("Random suggestion for every prompt"));
    // The typed text stays put; the token is added at roll time so each prompt expands its own.
    expect(getByDisplayValue("{#random-words}")).toBeTruthy();
    expect(await roll()).toBe("{#random-words}, {#suggestion}");

    fireEvent.press(getByLabelText("Random suggestion for every prompt (on)"));
    expect(await roll()).toBe("{#random-words}");
  });

  it("advertises the suggestion in the placeholder (web parity: 'Try: …')", async () => {
    const { getByPlaceholderText } = await setup();
    expect(getByPlaceholderText("Try: a live preview line")).toBeTruthy();
  });

  it("has exactly ONE building-blocks control (the FAB) — not a duplicate in the toolbar", async () => {
    const { getAllByLabelText } = await setup();
    expect(getAllByLabelText("Open the building-blocks palette")).toHaveLength(1);
  });
});
/**
 * Regression, twofold:
 *
 *  1. The prompts-per-roll count was STEPPER-ONLY, so a large roll was reachable only by tapping +
 *     hundreds of times. The web has a numeric input. Found while writing the max-load perf test —
 *     the test was absurd because the UI was.
 *
 *  2. It then CAPPED the user at 1000 (in five places). It shouldn't: nothing in this app tells the
 *     user "no". The documented 1000 is the load the app supports with *no performance loss* — a
 *     promise about behaviour, not a limit. Past it the app degrades gracefully; it never refuses.
 */
describe("GenerateScreen — prompts-per-roll count", () => {
  it("is directly editable, with a floor of 1 and NO upper cap", async () => {
    const { getByLabelText } = await setup();
    const count = getByLabelText("Number of prompts per roll");

    fireEvent.changeText(count, "1000");
    expect(count.props.value).toBe("1000");

    // Beyond the documented support level → still honoured, never clamped or rejected.
    fireEvent.changeText(count, "9999");
    expect(count.props.value).toBe("9999");

    fireEvent.changeText(count, "250000");
    expect(count.props.value).toBe("250000");

    fireEvent.changeText(count, ""); // emptied → falls back to 1, never NaN (validity, not a limit)
    expect(count.props.value).toBe("1");
  });

  it("the steppers still work alongside it", async () => {
    const { getByLabelText } = await setup();
    const count = getByLabelText("Number of prompts per roll");

    fireEvent.press(getByLabelText("One more prompt"));
    expect(count.props.value).toBe("2");

    fireEvent.press(getByLabelText("One fewer prompt"));
    expect(count.props.value).toBe("1");
  });
});