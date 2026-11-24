import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import { Group } from "./Field.jsx";

/** Launch controls are available only in the local Windows desktop edition. */
export default function LocalServices() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/local-services", { signal: controller.signal });
        if (!response.ok) throw new Error("Could not read local service status.");
        const data = await response.json();
        if (!disposed) setState(data);
      } catch (e) {
        if (!disposed) setError(e.message);
      }
      if (!disposed) timer = setTimeout(refresh, 3000);
    };
    refresh();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  async function act(id, action) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/local-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState((old) => ({ ...old, services: data.services }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Group title={<FormattedMessage id="localServices.title" defaultMessage="Local services" />}>
      <p className="settings-hint">
        <FormattedMessage
          id="localServices.hint"
          defaultMessage="Choose NInfer Qwen as your text provider and Local GPUs as your image provider in the Providers menu. Batches are divided between ready GPUs. Only services started here stop when the desktop app closes."
        />
      </p>
      {state?.services?.map((service) => (
        <div key={service.id}>
          <strong>{service.label}</strong>
          <p className="settings-hint">
            {service.url} ·{" "}
            {service.ready ? (
              <FormattedMessage id="localServices.ready" defaultMessage="Ready" />
            ) : service.owned ? (
              <FormattedMessage id="localServices.loading" defaultMessage="Starting…" />
            ) : service.occupied ? (
              <FormattedMessage
                id="localServices.occupied"
                defaultMessage="Port occupied; waiting for a compatible server"
              />
            ) : (
              <FormattedMessage id="localServices.stopped" defaultMessage="Stopped" />
            )}
            {service.ready && !service.owned && (
              <>
                {" "}
                ·{" "}
                <FormattedMessage
                  id="localServices.external"
                  defaultMessage="Already running; left open on exit"
                />
              </>
            )}
          </p>
          <button
            className="ghost"
            disabled={
              !state.supported || !!busy || service.ready || service.owned || service.occupied
            }
            onClick={() => act(service.id, "start")}
          >
            <FormattedMessage id="localServices.start" defaultMessage="Start" />
          </button>{" "}
          <button
            className="ghost"
            disabled={!service.owned || !!busy}
            onClick={() => act(service.id, "stop")}
          >
            <FormattedMessage id="localServices.stop" defaultMessage="Stop" />
          </button>
          {service.error && <p role="alert">{service.error}</p>}
        </div>
      ))}
      {state && !state.supported && (
        <p className="settings-hint">
          <FormattedMessage
            id="localServices.desktopOnly"
            defaultMessage="Start/Stop controls require the Windows desktop app. Already-running services can still be used."
          />
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </Group>
  );
}
