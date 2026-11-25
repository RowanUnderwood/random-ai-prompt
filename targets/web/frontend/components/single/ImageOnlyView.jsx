import { createPortal } from "react-dom";
import { useIntl } from "react-intl";
import { useModalDialog } from "../../lib/useModalDialog.js";
import { msgs } from "./messages.js";

/** Viewport-sized, uncropped image browsing; native modal behavior hides/inerts app chrome. */
export default function ImageOnlyView({ item, previous, next, onNavigate, onClose }) {
  const intl = useIntl();
  const ref = useModalDialog();
  const close = (event) => {
    event.preventDefault();
    onClose();
  };
  return createPortal(
    <dialog
      ref={ref}
      className="single-image-only"
      aria-label={intl.formatMessage(msgs.imageOnly)}
      onCancel={close}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "Escape") close(event);
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const target = event.key === "ArrowLeft" ? previous : next;
          if (target) onNavigate(target);
        }
      }}
    >
      <button type="button" aria-label={intl.formatMessage(msgs.exitImageOnly)} onClick={onClose}>
        <img src={item.path} alt={item.file || ""} />
      </button>
    </dialog>,
    document.body,
  );
}
