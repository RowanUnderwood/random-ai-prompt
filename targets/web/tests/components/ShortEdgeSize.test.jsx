import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../testUtils.jsx";
import InlineImageControls from "../../frontend/components/InlineImageControls.jsx";

function Harness({ params, onSettings }) {
  const [settings, setSettings] = useState({
    provider: "comfy-local",
    providerParams: { "comfy-local": params },
  });
  onSettings(settings);
  return (
    <>
      <InlineImageControls settings={settings} setSettings={setSettings} />
      <button
        onClick={() =>
          setSettings((s) => ({
            ...s,
            providerParams: {
              "comfy-local": { ...s.providerParams["comfy-local"], comfyWorkflow: "default" },
            },
          }))
        }
      >
        standard
      </button>
    </>
  );
}
async function show(params = { imageWidth: 1024, imageHeight: 768, comfyWorkflow: "krea2" }) {
  const seen = vi.fn();
  render(<Harness params={params} onSettings={seen} />);
  await screen.findByLabelText(/Images generated/);
  const saved = () => {
    const p = seen.mock.lastCall[0].providerParams["comfy-local"];
    return [p.imageWidth, p.imageHeight];
  };
  return { saved };
}
const edge = () => screen.getByRole("spinbutton", { name: "Short edge" });
const ratio = () => screen.getByRole("combobox", { name: "Aspect ratio" });

describe("Krea short edge + ratio", () => {
  it("reads the saved size, replacing width and height, without changing it", async () => {
    const { saved } = await show();
    expect(edge()).toHaveValue(768);
    expect(ratio()).toHaveDisplayValue("4:3 · Standard");
    expect(screen.getByRole("status")).toHaveTextContent("1024×768");
    expect(screen.queryByLabelText("Width")).toBeNull();
    expect(saved()).toEqual([1024, 768]);
  });

  it("uses the workflow's default when nothing is saved", async () => {
    await show({});
    expect(edge()).toHaveValue(864);
    expect(ratio()).toHaveDisplayValue("16:9 · Widescreen");
  });

  it("applies a ratio, a short edge and an orientation swap", async () => {
    const { saved } = await show();
    fireEvent.change(ratio(), { target: { value: "21:9" } });
    expect(saved()).toEqual([1792, 768]);
    fireEvent.change(edge(), { target: { value: "1024" } });
    expect(saved()).toEqual([2392, 1024]);
    fireEvent.change(ratio(), { target: { value: "16:9" } });
    fireEvent.click(screen.getByRole("button", { name: /Swap/ }));
    expect(saved()).toEqual([1024, 1824]);
    expect(ratio()).toHaveDisplayValue("9:16 · Phone / story");
  });

  it("does not round while typing, snaps on blur or Enter, and restores invalid input", async () => {
    const { saved } = await show();
    fireEvent.change(edge(), { target: { value: "1" } });
    fireEvent.change(edge(), { target: { value: "10" } });
    fireEvent.change(edge(), { target: { value: "1001" } });
    expect(edge()).toHaveValue(1001);
    expect(saved()).toEqual([1024, 768]);
    fireEvent.blur(edge());
    expect(edge()).toHaveValue(1000);
    expect(saved()[1]).toBe(1000);
    fireEvent.change(edge(), { target: { value: "" } });
    fireEvent.blur(edge());
    expect(edge()).toHaveValue(1000);
    fireEvent.change(edge(), { target: { value: "5" } });
    fireEvent.keyDown(edge(), { key: "Enter" });
    expect(edge()).toHaveValue(64);
  });

  it("shows a custom size and swaps unpaired ratios through it", async () => {
    const { saved } = await show({ imageWidth: 1280, imageHeight: 800, comfyWorkflow: "krea2" });
    expect(ratio()).toHaveDisplayValue("16:10 · Desktop");
    const swap = () => fireEvent.click(screen.getByRole("button", { name: /Swap/ }));
    swap();
    expect(ratio()).toHaveDisplayValue("Custom 800×1280");
    swap();
    expect(ratio()).toHaveDisplayValue("16:10 · Desktop");
    fireEvent.change(ratio(), { target: { value: "1:1" } });
    expect(saved()).toEqual([800, 800]);
    expect(screen.getByRole("button", { name: /Swap/ })).toBeDisabled();
  });

  it("returns to width × height for the standard workflow, keeping the pixels", async () => {
    const { saved } = await show();
    fireEvent.click(screen.getByText("standard"));
    expect(screen.getByLabelText("Width")).toHaveValue(1024);
    expect(screen.queryByRole("combobox", { name: "Aspect ratio" })).toBeNull();
    expect(saved()).toEqual([1024, 768]);
  });
});