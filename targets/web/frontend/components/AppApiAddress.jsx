/**
 * The app's own API address, shown at the foot of the Providers dropdown with a copy button, so other
 * tools (the ComfyUI nodes, scripts) can be pointed at this running app. The address is the page's
 * origin: the release server and the desktop shell serve the page and `/api/*` together. The desktop
 * shell uses port 4173 and falls back to a free port only when 4173 is taken, so this shows which.
 *
 * Local edition only: the online build has no backend, so the caller doesn't render it there.
 * Rendered only inside the open dropdown (never during the prerender), so reading `window` is safe.
 * @module gui/components/AppApiAddress
 */
import { useEffect, useRef, useState } from "react";
import { useIntl, defineMessages } from "react-intl";

const msgs = defineMessages({
  label: { id: "appApiAddress.label", defaultMessage: "App API address" },
  inputAria: { id: "appApiAddress.inputAria", defaultMessage: "This app's API address" },
  copy: { id: "appApiAddress.copy", defaultMessage: "Copy" },
  copyAria: { id: "appApiAddress.copyAria", defaultMessage: "Copy the API address" },
  copied: { id: "appApiAddress.copied", defaultMessage: "✓ Copied" },
  copyFailed: {
    id: "appApiAddress.copyFailed",
    defaultMessage: "Couldn't reach the clipboard. The address is selected: press Ctrl+C.",
  },
  hint: {
    id: "appApiAddress.hint",
    defaultMessage:
      "Point the ComfyUI nodes or your scripts here; endpoints are under /api. The desktop app uses port 4173, or another free port when 4173 is taken.",
  },
});

/**
 * @param {object} [props]
 * @param {string} [props.address] Override the shown address (tests); defaults to the page origin.
 * @returns {JSX.Element}
 */
export default function AppApiAddress({ address }) {
  const intl = useIntl();
  const value = address ?? window.location.origin;
  const inputRef = useRef(null);
  const [state, setState] = useState(""); // "" | "copied" | "failed"

  useEffect(() => {
    if (state !== "copied") return undefined;
    const id = setTimeout(() => setState(""), 2000);
    return () => clearTimeout(id);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Never fail silently: select the text so a manual copy is one keystroke away.
      inputRef.current?.select();
      setState("failed");
    }
  }

  return (
    <div className="pm-api">
      <div className="pm-api-row">
        <span className="pm-api-label">{intl.formatMessage(msgs.label)}</span>
        <input
          ref={inputRef}
          className="panel-input pm-api-input"
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          aria-label={intl.formatMessage(msgs.inputAria)}
        />
        <button type="button" className="primary" onClick={copy} aria-label={intl.formatMessage(msgs.copyAria)}>
          {intl.formatMessage(state === "copied" ? msgs.copied : msgs.copy)}
        </button>
      </div>
      {state === "failed" ? (
        <p className="pm-hint error" role="alert">
          {intl.formatMessage(msgs.copyFailed)}
        </p>
      ) : (
        <p className="pm-hint">{intl.formatMessage(msgs.hint)}</p>
      )}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? intl.formatMessage(msgs.copied) : ""}
      </span>
    </div>
  );
}
