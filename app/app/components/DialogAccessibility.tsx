"use client";

import { useEffect } from "react";

const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard navigation inside the topmost dialog and return to its opener. */
export function DialogAccessibility() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    const openers = new Map<HTMLElement, HTMLElement | null>();
    const focusable = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((node) => node.getClientRects().length > 0 && !node.closest('[inert], [aria-hidden="true"]'));
    const focusDialog = (dialog: HTMLElement) => {
      const nodes = focusable(dialog);
      const target = nodes.find((node) => node.hasAttribute("autofocus")) || nodes[0] || dialog;
      if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
      target.focus({ preventScroll: true });
    };
    const sync = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
        .filter((node) => node.getClientRects().length > 0);
      const next = dialogs.at(-1) || null;
      if (next === active) return;
      const previous = active;
      active = next;
      const opener = previous ? openers.get(previous) : null;
      if (previous && !dialogs.includes(previous)) openers.delete(previous);
      if (next) {
        if (!openers.has(next)) openers.set(next, previous && !dialogs.includes(previous) && opener?.isConnected ? opener : document.activeElement instanceof HTMLElement ? document.activeElement : null);
        if (opener?.isConnected && next.contains(opener)) opener.focus({ preventScroll: true });
        else if (!next.contains(document.activeElement)) focusDialog(next);
      } else if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !active) return;
      const nodes = focusable(active);
      const first = nodes[0];
      const last = nodes.at(-1);
      if (!first || !last) {
        event.preventDefault();
        active.focus();
      } else if (!active.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first || document.activeElement === active : document.activeElement === last || document.activeElement === active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-hidden", "aria-modal"] });
    document.addEventListener("keydown", onKeyDown);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
