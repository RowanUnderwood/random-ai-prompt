/**
 * @file Shared model-specific content visibility. Prompt dialect is not a model family:
 * Krea can use SD-compatible syntax. Only a selected SD model/provider hides Krea additions.
 */
import { resolveName } from "./nameOrder.js";

const KREA_TOKEN = /(^|[/._-])krea2([/._-]|$)/i;
const SD_MODEL = /stable[-_ ]?diffusion|(^|[/._-])sd(?:xl|3|2|1|15)(?:[/._-]|$)/i;

/** Resolve the selected image model family from app or flattened adapter settings. */
export function isStableDiffusionSelected(settings = {}) {
  const provider = settings.provider;
  const params = { ...settings, ...(settings.providerParams?.[provider] || {}) };
  if (provider === "comfy-local") return (params.comfyWorkflow || "krea2") === "checkpoint";
  const model = String(params.model || params.comfyCheckpoint || "");
  if (/krea[-_ ]?2|flux/i.test(model)) return false;
  if (SD_MODEL.test(model)) return true;
  if (
    ["sd", "stable-diffusion", "local-webui", "forge", "sdnext", "stability"].includes(provider)
  ) {
    return true;
  }
  // A generic ComfyUI checkpoint's family cannot be inferred from an arbitrary filename.
  // Provider-less engine callers retain the explicit legacy SD selection.
  return !provider && settings.mode === "StableDiffusion";
}

/** Whether a named content item is available for this selected image model. */
export function modelContentAllowed(name, settings = {}) {
  return !KREA_TOKEN.test(String(name)) || !isStableDiffusionSelected(settings);
}

/**
 * Bind one visibility rule to a loader, with live settings for engine runs or a fixed catalog view.
 * Direct suffix references and random pools use the same rule; switching models never deletes data.
 */
export function modelContentLoader(loader, settingsFor = () => ({})) {
  const allowed = (name) => modelContentAllowed(name, settingsFor());
  return {
    ...loader,
    blockNames: () => loader.blockNames().filter(allowed),
    listNames: () => loader.listNames().filter(allowed),
    loadBlock: (name) =>
      allowed(resolveName(name, loader.blockNames())) ? loader.loadBlock(name) : null,
    readListLines: (name, includeAdult) =>
      allowed(resolveName(name, loader.listNames()))
        ? loader.readListLines(name, includeAdult, settingsFor())
        : [],
  };
}
