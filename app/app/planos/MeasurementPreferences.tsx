"use client";
import { useEffect, useRef, useState } from "react";
import type { MetaSpec } from "../../lib/measurement/collection";
import { PIXEL_ID, PUBLIC_ORIGIN, PUBLIC_PATH, type Choice } from "../../lib/measurement/model";
import styles from "../components/Measurement.module.css";

type Queue = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[][]; push?: Queue; loaded?: boolean; version?: string };
type PixelWindow = Window & {fbq?: Queue; _fbq?: Queue};
const endpoint = "/api/measurement/public";
const channelName = "resolvflow-measurement-consent";
const denied = {analytics: false, marketing: false};

function browserCanLoadPixel() {
  if (window.location.href !== PUBLIC_ORIGIN + PUBLIC_PATH) return false;
  if (!document.referrer) return true;
  const referrer = new URL(document.referrer);
  return referrer.href === referrer.origin + "/" &&
    ["https://www.facebook.com", "https://l.facebook.com", "https://www.instagram.com", "https://www.google.com", "https://www.google.com.br"].includes(referrer.origin);
}

function pixel(event: MetaSpec) {
  if (!browserCanLoadPixel() || event.sourceUrl !== PUBLIC_ORIGIN + PUBLIC_PATH ||
      !["PageView","ViewContent"].includes(event.name)) return;
  const page = window as PixelWindow;
  if (!page.fbq) {
    const queue: Queue = (...args) => queue.callMethod ? queue.callMethod(...args) : queue.queue?.push(args);
    queue.queue = [];
    queue.push = queue;
    queue.loaded = true;
    queue.version = "2.0";
    page.fbq = page._fbq = queue;
    queue("set", "autoConfig", false, PIXEL_ID);
    queue("init", PIXEL_ID);
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.async = true;
    script.referrerPolicy = "no-referrer";
    document.head.appendChild(script);
  }
  page.fbq("consent", "grant");
  page.fbq("trackSingle", PIXEL_ID, event.name, {}, {eventID: event.eventId});
}

function stopPixel() {
  const fbq = (window as PixelWindow).fbq;
  if (!fbq) return;
  fbq("consent", "revoke");
  for (const cookie of ["_fbp", "_fbc"]) document.cookie = cookie + "=; Path=/; Max-Age=0; Secure; SameSite=Lax";
}

export function MeasurementPreferences({enabled}: {enabled: boolean}) {
  const [choice, setChoice] = useState<Choice>(denied);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [demo, setDemo] = useState(false);
  const permission = useRef<Choice | null>(null);
  const version = useRef(0);
  const viewed = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const attribution = useRef<{source?: string; campaign?: string; referrerHost?: string}>({});

  async function record(stage: "page_view" | "view_content") {
    const current = permission.current;
    if (!enabled || !current || (!current.marketing && !current.analytics)) return;
    const requestVersion = version.current;
    try {
      const response = await fetch(endpoint, {
        method: "POST", referrerPolicy: "same-origin", headers: {"content-type":"application/json"},
        body: JSON.stringify({act: "event", stage, id: crypto.randomUUID(), ...attribution.current}),
      });
      if (!response.ok) return;
      const result = await response.json() as {pixel?: MetaSpec};
      if (result.pixel && permission.current?.marketing && version.current === requestVersion) pixel(result.pixel);
    } catch { /* Collection never interrupts the page. */ }
  }

  async function markViewed(value: Choice) {
    if ((!value.marketing && !value.analytics) || viewed.current) return;
    viewed.current = true;
    await record("page_view");
    await record("view_content");
  }

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const landing = new URL(location.href);
    const source = landing.searchParams.getAll("utm_source");
    const campaign = landing.searchParams.getAll("utm_campaign");
    let referrerHost: string | undefined;
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      if (["resolvflow.online","www.google.com","www.google.com.br","facebook.com","www.facebook.com","l.facebook.com","instagram.com","www.instagram.com"].includes(host)) referrerHost = host;
    } catch { /* Ignore malformed attribution. */ }
    attribution.current = {
      source: source.length === 1 && ["meta","facebook","instagram","google","partner"].includes(source[0]) ? source[0] : undefined,
      campaign: campaign.length === 1 && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(campaign[0]) ? campaign[0] : undefined,
      referrerHost,
    };
    if (landing.search || landing.hash) history.replaceState(history.state, "", PUBLIC_PATH);
    const panelVersion = version.current;
    fetch(endpoint).then(response => {
      if (!response.ok) throw Error("disabled");
      return response.json() as Promise<{choice: Choice | null}>;
    }).then(data => {
      if (!active || panelVersion !== version.current) return;
      permission.current = data.choice;
      setChoice(data.choice ?? denied);
      setOpen(!data.choice);
      setReady(true);
      if (data.choice) void markViewed(data.choice);
    }).catch(() => { if (active) setFailed(true); });
    if (typeof BroadcastChannel === "function") {
      const changes = new BroadcastChannel(channelName);
      channel.current = changes;
      changes.onmessage = () => {
        version.current++;
        permission.current = null;
        stopPixel();
        setOpen(true);
        setChoice(denied);
      };
    }
    const pause = () => { permission.current = null; version.current++; stopPixel(); };
    window.addEventListener("pagehide", pause);
    return () => {
      active = false;
      pause();
      window.removeEventListener("pagehide", pause);
      channel.current?.close();
      channel.current = null;
    };
    // Setup is tied to the route's runtime flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function save(value: Choice) {
    const saveVersion = ++version.current;
    permission.current = null;
    if (!value.marketing) stopPixel();
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(endpoint, {
        method: "POST", referrerPolicy: "same-origin", headers: {"content-type":"application/json"}, body: JSON.stringify({act:"choice", ...value}),
      });
      if (!response.ok) throw Error("unavailable");
      if (version.current !== saveVersion) return;
      permission.current = value;
      channel.current?.postMessage("changed");
      setChoice(value);
      setOpen(false);
      await markViewed(value);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => setDemo(!demo)}>
      {demo ? "Fechar demonstração" : "Ver etapa da demonstração"}
    </button>
    {demo && <p>Exemplo com dados sintéticos. A revisão organiza o que está pronto e o que ainda precisa de atenção.</p>}
    {!enabled && <p className={styles.muted}>Medição desativada nesta candidata.</p>}
    {enabled && ready && <button type="button" aria-expanded={open} aria-controls="measurement-preferences" onClick={() => setOpen(!open)}>
      Preferências de medição
    </button>}
    {enabled && ready && open && <section id="measurement-preferences" className={styles.card} aria-labelledby="preference-title">
      <h2 id="preference-title">Preferências de medição</h2>
      <p>Escolha o que autoriza. Você pode mudar sua decisão nesta página.</p>
      <fieldset disabled={busy} className={styles.preferences}>
        <legend>Finalidades opcionais</legend>
        <label><input type="checkbox" checked={choice.analytics} onChange={e => setChoice({...choice,analytics:e.target.checked})}/> Análise de uso desta página</label>
        <label><input type="checkbox" checked={choice.marketing} onChange={e => setChoice({...choice,marketing:e.target.checked})}/> Medição de publicidade com a Meta</label>
        <button type="button" onClick={() => void save(denied)}>Rejeitar as duas</button>
        <button type="button" onClick={() => void save(choice)}>Salvar escolhas</button>
      </fieldset>
    </section>}
    {enabled && failed && <p role="alert">As preferências estão indisponíveis. Sua escolha não foi confirmada pelo servidor.</p>}
  </>;
}
