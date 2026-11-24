import { REWRITE_SYSTEM } from "../../_shared/rewriteSystem.js";

/** NInfer's OpenAI-compatible API. Keep reasoning separate from the returned prompt. */
export default async function rewrite({ prompt, system, signal }) {
  const response = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: signal || AbortSignal.timeout(600000),
    body: JSON.stringify({
      model: "qwen3.8-27b",
      messages: [
        { role: "system", content: system || REWRITE_SYSTEM },
        { role: "user", content: prompt },
      ],
      reasoning_effort: "medium",
      stream: false,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `NInfer returned ${response.status}`);
  const text = data?.choices?.[0]?.message?.content
    ?.replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (!text)
    throw new Error("NInfer returned no text. Check its status in Settings → Local services.");
  return { text };
}
