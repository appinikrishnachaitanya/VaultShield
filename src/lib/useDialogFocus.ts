import { useEffect, useRef } from "react";
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    if (!element) return;
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    element.addEventListener("keydown", key);
    return () => {
      element.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open, onClose]);
  return ref;
}
