import { apiUrl, transportFetch } from "../../_shared/transport/config.js";

/** The backend owns the pool so Home and Gallery share the same GPU workers. */
export default async function generate({ prompt, settings, signal }) {
  const res = await transportFetch(apiUrl("/api/local-generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ prompt, settings }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Local GPU generation failed.");
  return data;
}
