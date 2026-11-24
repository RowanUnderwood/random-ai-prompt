import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import ComfyModelSelect from "../frontend/components/ComfyModelSelect.jsx";
import ProviderBox from "../frontend/components/ProviderBox.jsx";

afterEach(() => vi.unstubAllGlobals());
const catalog = (models) => ({ ok: true, json: async () => ({ models, warnings: [] }) });
const show = (props = {}) =>
  render(
    <IntlProvider locale="en">
      <ComfyModelSelect
        label="Diffusion model (UNET)"
        kind="diffusion"
        params={{ use3090: true, use4090: true }}
        onChange={() => {}}
        {...props}
      />
    </IntlProvider>,
  );

describe("ComfyUI model dropdown", () => {
  it("persists the selection through the real provider settings form and switches workflow fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        catalog(
          url.includes("kind=checkpoint")
            ? ["checkpoint.safetensors"]
            : ["krea2_turbo_fp8.safetensors", "Krea muse.safetensors"],
        ),
      ),
    );
    function SettingsHarness() {
      const [settings, setSettings] = useState({ provider: "comfy-local", providerParams: {} });
      return (
        <>
          <ProviderBox settings={settings} setSettings={setSettings} />
          <output data-testid="saved-model">
            {settings.providerParams["comfy-local"]?.kreaModel}
          </output>
        </>
      );
    }
    render(
      <IntlProvider locale="en">
        <SettingsHarness />
      </IntlProvider>,
    );
    await screen.findByRole("option", { name: "Krea muse.safetensors" });
    fireEvent.change(screen.getByRole("combobox", { name: /Diffusion model/ }), {
      target: { value: "Krea muse.safetensors" },
    });
    expect(screen.getByTestId("saved-model")).toHaveTextContent("Krea muse.safetensors");
    fireEvent.change(screen.getByRole("combobox", { name: "Workflow" }), {
      target: { value: "default" },
    });
    await screen.findByRole("option", { name: "checkpoint.safetensors" });
    expect(screen.queryByRole("combobox", { name: /Diffusion model/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Workflow" }), {
      target: { value: "krea2" },
    });
    await screen.findByRole("option", { name: "Krea muse.safetensors" });
    expect(screen.getByRole("combobox", { name: /Diffusion model/ })).toHaveValue(
      "Krea muse.safetensors",
    );
  });
  it("loads live filenames and sends the chosen filename to the settings callback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => catalog(["Krea fine V5.safetensors", "Krea muse.safetensors"])),
    );
    const onChange = vi.fn();
    show({ onChange });
    await screen.findByRole("option", { name: "Krea muse.safetensors" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Krea muse.safetensors" } });
    expect(onChange).toHaveBeenCalledWith("Krea muse.safetensors");
  });
  it("pressing Refresh reads newly installed models", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(catalog(["original.safetensors"]))
      .mockResolvedValueOnce(catalog(["new.safetensors"]));
    vi.stubGlobal("fetch", fetch);
    show();
    await screen.findByRole("option", { name: "original.safetensors" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));
    await screen.findByRole("option", { name: "new.safetensors" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("preserves an unavailable saved filename rather than silently switching models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => catalog(["other.safetensors"])),
    );
    const onChange = vi.fn();
    show({ value: "saved.safetensors", onChange });
    await screen.findByText(/saved model is not available/);
    expect(screen.getByRole("combobox")).toHaveValue("saved.safetensors");
    expect(onChange).not.toHaveBeenCalled();
  });
  it("reloads for workflow/model-kind and GPU selection changes", async () => {
    const fetch = vi.fn(async () => catalog(["model.safetensors"]));
    vi.stubGlobal("fetch", fetch);
    function Harness() {
      const [changed, setChanged] = useState(false);
      return (
        <>
          <button onClick={() => setChanged(true)}>Switch</button>
          <ComfyModelSelect
            label="Model"
            kind={changed ? "checkpoint" : "diffusion"}
            params={{ use3090: !changed, use4090: true }}
            onChange={() => {}}
          />
        </>
      );
    }
    render(
      <IntlProvider locale="en">
        <Harness />
      </IntlProvider>,
    );
    await screen.findByRole("option", { name: "model.safetensors" });
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url]) => url.includes("kind=checkpoint") && url.includes("use3090=false"),
        ),
      ).toBe(true),
    );
  });
});
