import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";

/** Fetch live ComfyUI loader choices and keep explicit saved selections intact. */
export default function ComfyModelSelect({ label, value = "", kind, params, onChange }) {
  const [catalog, setCatalog] = useState({ models: [], warnings: [], loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  const use3090 = params.use3090 !== false;
  const use4090 = params.use4090 !== false;
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setCatalog({ models: [], warnings: [], loading: true, error: "" });
    const query = new URLSearchParams({ kind, use3090: String(use3090), use4090: String(use4090) });
    fetch(`/api/local-models?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load ComfyUI models.");
        if (alive) setCatalog({ ...data, loading: false, error: "" });
      })
      .catch((error) => {
        if (alive) setCatalog({ models: [], warnings: [], loading: false, error: error.message });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [kind, use3090, use4090, revision]);
  const unavailable = value && !catalog.models.includes(value);
  return (
    <div className="comfy-model-control">
      <label className="field">
        <span>{label}</span>
        <select
          value={value}
          title={value}
          disabled={catalog.loading}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">
            {catalog.loading ? (
              <FormattedMessage id="comfyModels.loading" defaultMessage="Loading models…" />
            ) : kind === "checkpoint" ? (
              <FormattedMessage
                id="comfyModels.auto"
                defaultMessage="Automatic (first installed checkpoint)"
              />
            ) : (
              <FormattedMessage id="comfyModels.choose" defaultMessage="Choose a diffusion model" />
            )}
          </option>
          {unavailable && (
            <option value={value} disabled>
              {value}
            </option>
          )}
          {catalog.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="link-btn"
        disabled={catalog.loading}
        onClick={() => setRevision((current) => current + 1)}
      >
        <FormattedMessage id="comfyModels.refresh" defaultMessage="Refresh models" />
      </button>
      {!catalog.loading && unavailable && (
        <p className="hint" role="status">
          <FormattedMessage
            id="comfyModels.unavailable"
            defaultMessage="The saved model is not available on every reachable selected GPU. Choose another model or refresh after starting the instances."
          />
        </p>
      )}
      {!catalog.loading && !catalog.models.length && !catalog.error && (
        <p className="hint" role="status">
          <FormattedMessage
            id="comfyModels.empty"
            defaultMessage="No shared models found. Start the selected ComfyUI instances and refresh."
          />
        </p>
      )}
      {kind === "diffusion" && (
        <p className="hint">
          <FormattedMessage
            id="comfyModels.workflowHint"
            defaultMessage="ComfyUI's diffusion models are listed. Choose a Krea 2 model for this workflow; its text encoder and VAE stay unchanged."
          />
        </p>
      )}
      {catalog.warnings?.map((warning) => (
        <p className="hint" key={warning} role="status">
          {warning}
        </p>
      ))}
      {catalog.error && (
        <p className="hint" role="alert">
          {catalog.error}
        </p>
      )}
    </div>
  );
}
