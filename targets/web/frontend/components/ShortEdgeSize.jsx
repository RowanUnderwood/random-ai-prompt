/**
 * Output size as a short edge plus an aspect ratio. It edits the provider's ordinary width × height;
 * the ratio shown is read back from them, so there is nothing else to keep in step.
 * @module gui/components/ShortEdgeSize
 */
import { useEffect, useState } from "react";
import { useIntl, defineMessages } from "react-intl";
import {
  describeSize,
  ratioById,
  RATIO_GROUPS,
  SIZE_MULTIPLE,
  sizeFor,
} from "../../../shared/comfy-local/sizes.js";

const msgs = defineMessages({
  shortEdge: { id: "shortEdge.label", defaultMessage: "Short edge" },
  shortEdgeTitle: {
    id: "shortEdge.title",
    defaultMessage: "Length of the shorter side in pixels (rounded to a multiple of {multiple})",
  },
  ratio: { id: "shortEdge.ratio", defaultMessage: "Aspect ratio" },
  custom: { id: "shortEdge.custom", defaultMessage: "Custom {width}×{height}" },
  swap: { id: "shortEdge.swap", defaultMessage: "Swap landscape and portrait" },
  result: { id: "shortEdge.result", defaultMessage: "Output size in pixels" },
});

/**
 * @param {object} props
 * @param {number} props.width The stored width.
 * @param {number} props.height The stored height.
 * @param {number} [props.min] The smallest allowed edge.
 * @param {Function} props.onChange `({ width, height })`.
 * @returns {JSX.Element}
 */
export default function ShortEdgeSize({ width, height, min = SIZE_MULTIPLE, onChange }) {
  const intl = useIntl();
  const { shortEdge, ratio } = describeSize(width, height);
  const proportion = ratio || { w: width, h: height };
  const [draft, setDraft] = useState(String(shortEdge));
  useEffect(() => setDraft(String(shortEdge)), [shortEdge]);

  const apply = (edge) => {
    const size = sizeFor(edge, proportion);
    if (size.width !== width || size.height !== height) onChange(size);
  };
  // A finished value applies at once; a half-typed one waits, so it isn't rounded mid-entry.
  const edit = (text) => {
    setDraft(text);
    const edge = Number(text);
    if (edge >= min && edge % SIZE_MULTIPLE === 0) apply(edge);
  };
  const commit = () => {
    const edge = Number(draft);
    if (!draft.trim() || !Number.isFinite(edge) || edge <= 0) return setDraft(String(shortEdge));
    const valid = Math.max(min, edge);
    setDraft(String(Math.min(...Object.values(sizeFor(valid, proportion)))));
    return apply(valid);
  };

  return (
    <span className="short-edge">
      <label
        className="field-count"
        title={intl.formatMessage(msgs.shortEdgeTitle, { multiple: SIZE_MULTIPLE })}
      >
        <span className="field-count-label">{intl.formatMessage(msgs.shortEdge)}</span>
        <input
          type="number"
          min={min}
          step={SIZE_MULTIPLE}
          value={draft}
          onChange={(e) => edit(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          aria-label={intl.formatMessage(msgs.shortEdge)}
        />
      </label>
      <span className="field-size short-edge-ratio">
        <select
          className="field-size-select"
          value={ratio?.id || "custom"}
          title={intl.formatMessage(msgs.ratio)}
          aria-label={intl.formatMessage(msgs.ratio)}
          onChange={(e) => onChange(sizeFor(shortEdge, ratioById(e.target.value)))}
        >
          {!ratio && (
            <option value="custom">
              {intl.formatMessage(msgs.custom, { width: String(width), height: String(height) })}
            </option>
          )}
          {RATIO_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.ratios.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} · {r.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          className="short-edge-swap"
          disabled={width === height}
          title={intl.formatMessage(msgs.swap)}
          aria-label={intl.formatMessage(msgs.swap)}
          onClick={() => onChange({ width: height, height: width })}
        >
          ⇄
        </button>
      </span>
      <output className="short-edge-result" aria-label={intl.formatMessage(msgs.result)}>
        {width}×{height}
      </output>
    </span>
  );
}