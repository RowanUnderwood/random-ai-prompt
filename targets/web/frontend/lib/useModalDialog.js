import { useLayoutEffect, useRef } from "react";

/** Native modal focus/inert handling, with focus restoration on dismissal. */
export function useModalDialog() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (node.showModal) node.showModal();
    else node.setAttribute("open", "");
    node.querySelector("textarea, button")?.focus();
    return () => {
      if (node.open && node.close) node.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);
  return ref;
}
