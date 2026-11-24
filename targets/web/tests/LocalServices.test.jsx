import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import LocalServices from "../frontend/components/LocalServices.jsx";

afterEach(() => vi.unstubAllGlobals());
const show = (service) => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      supported: true,
      services: [
        {
          id: "comfy3090",
          label: "ComfyUI 3090",
          url: "http://127.0.0.1:8190",
          ...service,
        },
      ],
    }),
  }));
  vi.stubGlobal("fetch", fetch);
  render(
    <IntlProvider locale="en">
      <LocalServices />
    </IntlProvider>,
  );
  return fetch;
};

describe("local service controls", () => {
  it("pressing Start sends only the fixed profile id and action", async () => {
    const fetch = show({ ready: false, owned: false, occupied: false });
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, init]) =>
            url === "/api/local-services" &&
            init?.method === "POST" &&
            init.body === JSON.stringify({ id: "comfy3090", action: "start" }),
        ),
      ).toBe(true),
    );
  });
  it("pressing Stop sends the owned service id", async () => {
    const fetch = show({ ready: true, owned: true, occupied: true });
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([, init]) => init?.body === JSON.stringify({ id: "comfy3090", action: "stop" }),
        ),
      ).toBe(true),
    );
  });
  it("does not offer to stop or relaunch an externally running instance", async () => {
    show({ ready: true, owned: false, occupied: true });
    expect(await screen.findByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByText(/Already running; left open on exit/)).toBeInTheDocument();
  });
});
