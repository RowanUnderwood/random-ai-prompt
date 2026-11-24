/** Local NInfer Qwen text provider; requests go through the local backend (no CORS needed). */
export default {
  id: "ninfer",
  label: "NInfer Qwen (5090)",
  rewriteLabel: "NInfer Qwen (local)",
  description: "Local Qwen on the RTX 5090. Start or connect in Settings → Local services.",
  tier: "api",
  dialect: "plain",
  transport: "hosted-proxy",
  local: true,
  needsKey: false,
  textOnly: true,
  rewrite: true,
  concurrencyDefault: 1,
};
