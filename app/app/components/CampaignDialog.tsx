"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function CampaignDialog({ children, titleId, descriptionId, className = "", busy = false, onClose, alert = false, returnFocusFallbackId }: {
  children: ReactNode; titleId: string; descriptionId?: string; className?: string; busy?: boolean; onClose: () => void; alert?: boolean;
  returnFocusFallbackId?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else if (returnFocusFallbackId) document.getElementById(returnFocusFallbackId)?.focus();
    };
  }, [returnFocusFallbackId]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <div ref={root} tabIndex={-1} className={`import-modal ${className}`} role={alert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (typeof target?.closest === "function" && target.closest('[role="dialog"],[role="alertdialog"]') !== event.currentTarget) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
      if (event.key !== "Tab") return;
      // A nested dialog owns Tab even when no wrap is needed. Do not run its parent's trap.
      event.stopPropagation();
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"],summary,video[controls]')).filter(element => !element.hidden && element.getClientRects().length > 0 && element.closest('[role="dialog"],[role="alertdialog"]') === event.currentTarget);
      const first = targets[0]; const last = targets.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
    }}>{children}</div>
  </div>;
}
