"use client";

import { useEffect } from "react";
import { PUBLIC_ORIGIN, PUBLIC_PATH } from "../../lib/measurement/model";
import type { TelemetryStage } from "../../lib/measurement/telemetry";
import { trackPageView } from "./planPixel";

const endpoint = "/api/measurement/telemetry";
const stageSelectors: { stage: TelemetryStage; selector: string }[] = [
  { stage: "hero", selector: ".hero-three" },
  { stage: "demo", selector: "#demo" },
  { stage: "offer", selector: "#planos" },
  { stage: "faq", selector: ".faq" },
  { stage: "closing", selector: ".closing-three" },
];

function targetHint(node: EventTarget | null) {
  if (!(node instanceof Element)) return "unknown";
  const el = node.closest("button,a,input,label,summary,[data-plan-id],.plan-buy") || node;
  const id = el.id ? "#" + el.id : "";
  const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  return (el.tagName.toLowerCase() + id + cls).slice(0, 120);
}

function stageFor(node: Element | null): TelemetryStage | undefined {
  if (!node) return undefined;
  if (node.closest("dialog.checkout-dialog")) return "checkout";
  if (node.closest(".hero-three")) return "hero";
  if (node.closest("#demo, .campaign-demo, .demo-result")) return "demo";
  if (node.closest("#planos, .offer, .proposal-panel")) return "offer";
  if (node.closest(".faq, #perguntas")) return "faq";
  if (node.closest(".closing-three")) return "closing";
  return undefined;
}

async function send(body: Record<string, unknown>) {
  try {
    await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      referrerPolicy: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch { /* Telemetry must never block the funnel. */ }
}

export function PlanFunnelTracking({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || window.location.origin !== PUBLIC_ORIGIN || window.location.pathname !== PUBLIC_PATH) return;
    trackPageView();

    const landing = new URL(location.href);
    const source = landing.searchParams.getAll("utm_source");
    const campaign = landing.searchParams.getAll("utm_campaign");
    let referrerHost: string | undefined;
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : undefined;
    } catch { /* ignore */ }
    void send({
      kind: "lead",
      at: Date.now(),
      path: PUBLIC_PATH,
      ...(referrerHost && /^[a-z0-9.-]{1,100}$/i.test(referrerHost) ? { referrerHost } : {}),
      ...(source.length === 1 && /^[a-z]{1,16}$/.test(source[0]) ? { source: source[0] } : {}),
      ...(campaign.length === 1 && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(campaign[0]) ? { campaign: campaign[0] } : {}),
    });

    const dwell = new Map<TelemetryStage, { enteredAt: number; accumulated: number }>();
    const markEnter = (stage: TelemetryStage) => {
      if (!dwell.has(stage)) dwell.set(stage, { enteredAt: Date.now(), accumulated: 0 });
      else if (dwell.get(stage)!.enteredAt === 0) dwell.get(stage)!.enteredAt = Date.now();
    };
    const markLeave = (stage: TelemetryStage) => {
      const row = dwell.get(stage);
      if (!row || !row.enteredAt) return;
      row.accumulated += Date.now() - row.enteredAt;
      row.enteredAt = 0;
    };
    const flushStage = (stage: TelemetryStage) => {
      markLeave(stage);
      const row = dwell.get(stage);
      if (!row || row.accumulated < 250) return;
      const dwellMs = row.accumulated;
      row.accumulated = 0;
      void send({ kind: "stage", at: Date.now(), stage, dwellMs, enteredAt: Date.now() - dwellMs });
    };

    markEnter("entry");
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const found = stageSelectors.find((item) => entry.target.matches(item.selector) || entry.target.id === item.selector.replace("#", ""));
          const stage = found?.stage || stageFor(entry.target);
          if (!stage) continue;
          if (entry.isIntersecting) markEnter(stage);
          else flushStage(stage);
        }
      }, { threshold: 0.35 })
      : null;

    for (const item of stageSelectors) {
      const node = document.querySelector(item.selector);
      if (node) observer?.observe(node);
    }

    const onClick = (event: MouseEvent) => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, document.documentElement.scrollHeight || window.innerHeight);
      const x = Math.min(1, Math.max(0, event.pageX / w));
      const y = Math.min(1, Math.max(0, event.pageY / h));
      void send({
        kind: "click",
        at: Date.now(),
        x,
        y,
        w,
        h,
        target: targetHint(event.target),
        stage: stageFor(event.target instanceof Element ? event.target : null),
      });
      if (event.target instanceof Element && event.target.closest("dialog.checkout-dialog")) markEnter("checkout");
    };
    document.addEventListener("click", onClick, { capture: true, passive: true });

    const onHide = () => {
      flushStage("entry");
      for (const stage of dwell.keys()) flushStage(stage);
    };
    window.addEventListener("pagehide", onHide);

    return () => {
      onHide();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", onHide);
      observer?.disconnect();
    };
  }, [enabled]);

  return null;
}
