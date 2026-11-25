import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../testUtils.jsx";
import Settings from "../../frontend/components/Settings.jsx";
import { resetDefaultWrapper, saveDefaultWrapper } from "../../frontend/lib/wrapperStore.js";

const none = { wrapperName: "None", wrapper: { start: "", end: "" } };
const box = () => screen.getByRole("checkbox", { name: /auto-add fx/i });
const hint = () => screen.queryByText(/wrapper already adds/i);

beforeEach(() => resetDefaultWrapper());

describe("Settings — Auto-add FX", () => {
  it("reflects the setting and turns it on and off", async () => {
    const user = userEvent.setup();
    const setSettings = vi.fn();
    const { rerender } = render(
      <Settings settings={{ ...none, autoAddFx: false, noAnd: true }} setSettings={setSettings} />,
    );
    expect(box()).not.toBeChecked();
    await user.click(box());
    expect(setSettings).toHaveBeenLastCalledWith({ ...none, autoAddFx: true, noAnd: true });
    rerender(<Settings settings={{ ...none, autoAddFx: true }} setSettings={setSettings} />);
    expect(box()).toBeChecked();
    await user.click(box());
    expect(setSettings).toHaveBeenLastCalledWith({ ...none, autoAddFx: false });
  });

  it("explains when the active wrapper adds the effects regardless", () => {
    const { rerender } = render(<Settings settings={{}} setSettings={() => {}} />);
    expect(hint()).toHaveTextContent("{#fx}"); // the built-in Default wrapper
    rerender(<Settings settings={none} setSettings={() => {}} />);
    expect(hint()).toBeNull();
    rerender(
      <Settings
        settings={{ wrapperName: "Mine", wrapper: { start: "{#fx}", end: "" } }}
        setSettings={() => {}}
      />,
    );
    expect(hint()).not.toBeNull();
  });

  it("drops the explanation once the Default wrapper is edited", () => {
    saveDefaultWrapper({ start: "", end: "{#artists}" });
    render(<Settings settings={{ wrapperName: "Default" }} setSettings={() => {}} />);
    expect(hint()).toBeNull();
  });
});