import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { FormattedMessage } from "react-intl";
import { useModalDialog } from "../../lib/useModalDialog.js";

/** Confirm/edit the exact sent text before enqueueing one new variation. */
export default function RenderAnotherDialog({ prompt, negativePrompt, onCancel, onRender }) {
  const [text, setText] = useState(prompt);
  const [negative, setNegative] = useState(negativePrompt);
  const ref = useModalDialog();
  const titleId = useId();
  return createPortal(
    <dialog
      ref={ref}
      className="modal single-render-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) onRender({ prompt: text.trim(), negativePrompt: negative });
        }}
      >
        <h2 id={titleId}>
          <FormattedMessage
            id="single.renderAnother.title"
            defaultMessage="Render another version"
          />
        </h2>
        <p className="modal-note">
          <FormattedMessage
            id="single.renderAnother.note"
            defaultMessage="Uses this image's saved model and generation settings with a fresh seed. Edit the prompts if desired; the text below is sent as written."
          />
        </p>
        <label className="field">
          <span>
            <FormattedMessage id="single.renderAnother.prompt" defaultMessage="Prompt" />
          </span>
          <textarea
            rows={7}
            value={text}
            onChange={(event) => setText(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>
            <FormattedMessage id="single.renderAnother.negative" defaultMessage="Negative prompt" />
          </span>
          <textarea
            rows={3}
            value={negative}
            onChange={(event) => setNegative(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            <FormattedMessage id="single.renderAnother.cancel" defaultMessage="Cancel" />
          </button>
          <button type="submit" disabled={!text.trim()}>
            <FormattedMessage id="single.renderAnother.queue" defaultMessage="Queue render" />
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
