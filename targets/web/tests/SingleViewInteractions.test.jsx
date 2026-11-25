import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "./testUtils.jsx";
import SingleView from "../frontend/components/SingleView.jsx";

const first = {
  name: "first",
  file: "first.png",
  path: "/api/output/first.png",
  children: [],
  meta: {
    provider: "comfy-local",
    prompt: { dpl: "{animal}", final: "A fox in a forest" },
    negative: { final: "blurry" },
    settings: { comfyWorkflow: "krea2", seed: 42, imageWidth: 1024, imageHeight: 768 },
  },
};
const second = { ...first, name: "second", file: "second.png", path: "/api/output/second.png" };
function show(overrides = {}) {
  const props = {
    items: [first, second],
    current: first,
    active: true,
    settings: {},
    magick: { available: false, formats: [] },
    onBack: vi.fn(),
    onNavigate: vi.fn(),
    onDerive: vi.fn(),
    onResize: vi.fn(),
    onDelete: vi.fn(),
    onSearch: vi.fn(),
    ...overrides,
  };
  return { ...render(<SingleView {...props} />), props };
}

describe("Single view: render another", () => {
  it("opens the editor, keeps keyboard editing local, and queues the edited text on confirmation", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: "Render another" }));
    const editor = screen.getByRole("dialog", { name: "Render another version" });
    const prompt = within(editor).getByRole("textbox", { name: "Prompt" });
    const negative = within(editor).getByRole("textbox", { name: "Negative prompt" });
    expect(prompt).toHaveValue("A fox in a forest");
    expect(negative).toHaveValue("blurry");
    fireEvent.change(prompt, { target: { value: "A fox beside a river" } });
    fireEvent.change(negative, { target: { value: "" } });
    fireEvent.keyDown(prompt, { key: "ArrowRight" });
    expect(props.onNavigate).not.toHaveBeenCalled();
    fireEvent.click(within(editor).getByRole("button", { name: "Queue render" }));
    expect(props.onDerive).toHaveBeenCalledExactlyOnceWith(first, "variation", "final", {
      prompt: "A fox beside a river",
      negativePrompt: "",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(first.meta.prompt.final).toBe("A fox in a forest");
    expect(props.onBack).not.toHaveBeenCalled();
  });
  it("cancels without submitting and disables empty prompts", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: "Render another" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Queue render" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDerive).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("Escape dismisses the editor without leaving Single view", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: "Render another" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(props.onBack).not.toHaveBeenCalled();
    expect(props.onDerive).not.toHaveBeenCalled();
  });
  it("locks render another when source generation metadata is unavailable", () => {
    show({ current: { ...first, meta: null } });
    expect(screen.getByRole("button", { name: "Render another" })).toBeDisabled();
  });
  it("allows another render with a keyed image provider that does not expose seeds", () => {
    show({
      current: { ...first, meta: { ...first.meta, provider: "openai" } },
      settings: { keys: { openai: "test-key" } },
    });
    expect(screen.getByRole("button", { name: "Render another" })).toBeEnabled();
  });
  it("does not navigate when arrow keys originate inside contenteditable text", () => {
    const { props } = show();
    render(
      <div contentEditable suppressContentEditableWarning>
        <span data-testid="editable-text">Editing text</span>
      </div>,
    );
    fireEvent.keyDown(screen.getByTestId("editable-text"), { key: "ArrowRight" });
    expect(props.onNavigate).not.toHaveBeenCalled();
  });
});

describe("Single view: image-only viewing", () => {
  it("toggles on image click and returns without leaving Single view", () => {
    const { props } = show();
    fireEvent.click(screen.getByRole("button", { name: "View image only" }));
    const viewer = screen.getByRole("dialog", { name: "Image-only view" });
    expect(within(viewer).getByRole("img")).toHaveAttribute("src", first.path);
    fireEvent.click(within(viewer).getByRole("button", { name: "Return to Single view" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(props.onBack).not.toHaveBeenCalled();
  });
  it("arrow keys navigate once while the viewer stays open; Escape restores the normal view", () => {
    const navigate = vi.fn();
    const back = vi.fn();
    function Harness() {
      const [current, setCurrent] = useState(first);
      return (
        <SingleView
          items={[first, second]}
          current={current}
          active
          settings={{}}
          magick={{ available: false, formats: [] }}
          onBack={back}
          onNavigate={(item) => {
            navigate(item);
            setCurrent(item);
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "View image only" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Return to Single view" }), {
      key: "ArrowRight",
    });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(second);
    expect(within(screen.getByRole("dialog")).getByRole("img")).toHaveAttribute("src", second.path);
    fireEvent.keyDown(screen.getByRole("button", { name: "Return to Single view" }), {
      key: "ArrowLeft",
    });
    expect(navigate).toHaveBeenLastCalledWith(first);
    fireEvent.keyDown(screen.getByRole("button", { name: "Return to Single view" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("releases the overlay when Single view becomes inactive", () => {
    const { rerender, props } = show();
    fireEvent.click(screen.getByRole("button", { name: "View image only" }));
    rerender(<SingleView {...props} active={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
