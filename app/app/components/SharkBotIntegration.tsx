"use client";

import { useEffect, useRef, useState } from "react";

type SharkBotEvent = {
  id: string;
  eventType: string;
  amountCents: number;
  currency: string;
  payerName: string | null;
  productName: string | null;
  botName: string | null;
  flowName: string | null;
  gateway: string | null;
  occurredAt: string;
};

type SharkBotData = {
  configured: boolean;
  isPlatformAdmin: boolean;
  routing: "linked" | "needs_configuration";
  webhookUrl: string;
  stats: { approved: number; revenueCents: number; events: number };
  events: SharkBotEvent[];
};

type PushConfiguration = {
  configured: boolean;
  publicKey: string | null;
  activeDevices: number;
  preferences: PushPreferences;
};

type PushPreferences = { newLead: boolean; paymentCreated: boolean; paymentApproved: boolean };
const DEFAULT_PUSH_PREFERENCES: PushPreferences = { newLead: true, paymentCreated: false, paymentApproved: true };

function money(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function eventLabel(type: string) {
  if (type === "payment_approved") return "Venda aprovada";
  if (type === "payment_created") return "Pagamento criado";
  if (type === "new_lead") return "Novo lead";
  return "Evento recebido";
}

function applicationServerKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = window.atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function loadPushConfiguration(endpoint?: string) {
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
  const response = await fetch(`/api/integrations/sharkbot/push${query}`, { credentials: "same-origin", cache: "no-store" });
  const payload = await response.json() as PushConfiguration & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível verificar o push.");
  return payload;
}

async function storePushSubscription(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const response = await fetch("/api/integrations/sharkbot/push", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "subscribe", endpoint: serialized.endpoint, keys: serialized.keys }),
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível ativar as notificações.");
}

function subscriptionUsesKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const left = new Uint8Array(current);
  const right = applicationServerKey(publicKey);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function SharkBotPushControls() {
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(typeof Notification === "undefined" ? "default" : Notification.permission);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void (async () => {
      try {
        let nextConfiguration = await loadPushConfiguration();
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        await registration.update();
        let existing = await registration?.pushManager.getSubscription() || null;
        if (existing && nextConfiguration.configured && nextConfiguration.publicKey) {
          if (subscriptionUsesKey(existing, nextConfiguration.publicKey)) {
            await storePushSubscription(existing);
            nextConfiguration = await loadPushConfiguration(existing.endpoint);
          } else {
            existing = null;
            if (active) setFeedback("As chaves de notificação mudaram. Ative novamente neste dispositivo.");
          }
        }
        if (!active) return;
        setConfiguration(nextConfiguration);
        setPreferences(nextConfiguration.preferences || DEFAULT_PUSH_PREFERENCES);
        setSubscription(existing);
        setPermission(Notification.permission);
      } catch (loadError) {
        if (active) setFeedback(loadError instanceof Error ? loadError.message : "Falha ao verificar as notificações.");
      }
    })();
    return () => { active = false; };
  }, [supported]);

  async function activate() {
    if (!supported || !configuration?.configured || !configuration.publicKey) return;
    setBusy(true); setFeedback("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setFeedback(nextPermission === "denied" ? "A permissão foi bloqueada no navegador. Libere-a nas configurações do site." : "A permissão não foi concedida.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await registration.update();
      await navigator.serviceWorker.ready;
      let existing = await registration.pushManager.getSubscription();
      if (existing && !subscriptionUsesKey(existing, configuration.publicKey)) {
        await existing.unsubscribe();
        existing = null;
      }
      const nextSubscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(configuration.publicKey),
      });
      await storePushSubscription(nextSubscription);
      setSubscription(nextSubscription);
      const nextConfiguration = await loadPushConfiguration(nextSubscription.endpoint);
      setConfiguration(nextConfiguration);
      setPreferences(nextConfiguration.preferences || DEFAULT_PUSH_PREFERENCES);
      setFeedback("Notificações ativadas neste dispositivo.");
    } catch (activationError) {
      setFeedback(activationError instanceof Error ? activationError.message : "Não foi possível ativar as notificações.");
    } finally { setBusy(false); }
  }

  async function deactivate() {
    if (!subscription) return;
    setBusy(true); setFeedback("");
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      const response = await fetch("/api/integrations/sharkbot/push", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível desativar as notificações.");
      setSubscription(null);
      setConfiguration(await loadPushConfiguration());
      setFeedback("Notificações desativadas neste dispositivo.");
    } catch (deactivationError) {
      setFeedback(deactivationError instanceof Error ? deactivationError.message : "Não foi possível desativar as notificações.");
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/integrations/sharkbot/push", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test" }),
      });
      const payload = await response.json() as { error?: string; delivered?: number; failed?: number };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar o teste.");
      setFeedback(payload.delivered ? `Teste enviado para ${payload.delivered} dispositivo(s).` : "Nenhum dispositivo ativo recebeu o teste.");
    } catch (testError) {
      setFeedback(testError instanceof Error ? testError.message : "Não foi possível enviar o teste.");
    } finally { setBusy(false); }
  }

  async function updatePreference(key: keyof PushPreferences, enabled: boolean) {
    if (!subscription) return;
    const next = { ...preferences, [key]: enabled };
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/integrations/sharkbot/push", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preferences", endpoint: subscription.endpoint, preferences: next }),
      });
      const payload = await response.json() as { error?: string; preferences?: PushPreferences };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar as preferências.");
      setPreferences(payload.preferences || next);
      setFeedback("Preferências de notificação atualizadas neste dispositivo.");
    } catch (preferenceError) {
      setFeedback(preferenceError instanceof Error ? preferenceError.message : "Não foi possível salvar as preferências.");
    } finally { setBusy(false); }
  }

  async function sendSaleNotification() {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/integrations/sharkbot/push", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sale" }),
      });
      const payload = await response.json() as { error?: string; delivered?: number; failed?: number; amountCents?: number; tag?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar a notificação de venda.");
      const amount = money(payload.amountCents || 0);
      if (permission === "granted") {
        try {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification("Nova Venda!", {
            body: `Você recebeu ${amount}`,
            tag: payload.tag || `sharkbot-manual-${Date.now()}`,
            icon: "/icon-192.png",
            badge: "/notification-badge-96.png",
            data: { url: "/integracoes" },
          });
        } catch {
          // O push remoto continua válido mesmo se o navegador não permitir a confirmação local.
        }
      }
      setFeedback(payload.delivered ? `Venda de ${amount} enviada para ${payload.delivered} dispositivo(s).` : "Nenhum dispositivo ativo recebeu a venda.");
    } catch (saleError) {
      setFeedback(saleError instanceof Error ? saleError.message : "Não foi possível enviar a notificação de venda.");
    } finally { setBusy(false); }
  }

  const state = !supported ? "incompatible" : !configuration ? "loading" : !configuration.configured ? "not-configured" : permission === "denied" ? "denied" : subscription ? "active" : "ready";
  const stateLabel = state === "active" ? "Ativas neste dispositivo" : state === "denied" ? "Bloqueadas no navegador" : state === "incompatible" ? "Navegador incompatível" : state === "not-configured" ? "Configuração pendente" : state === "loading" ? "Verificando" : "Disponíveis para ativar";

  return <section className="sharkbot-push" aria-labelledby="sharkbot-push-title">
    <div>
      <span className="panel-kicker">Push nativo · somente administrador</span>
      <h3 id="sharkbot-push-title">Notificações da SharkBot</h3>
      <p>{state === "incompatible" ? "Este navegador não oferece Web Push. Use um navegador compatível ou o PWA instalado." : state === "denied" ? "A permissão está negada. Abra as configurações deste site para liberar notificações." : state === "not-configured" ? "As chaves VAPID ainda precisam ser configuradas no Worker." : "Escolha quais etapas do funil este dispositivo deve receber. Nenhum dado do comprador aparece na tela bloqueada."}</p>
    </div>
    <div className="sharkbot-push-status"><span className={`ready-pill ${state === "active" ? "" : "is-pending"}`}><i />{stateLabel}</span>{configuration ? <small>{configuration.activeDevices} dispositivo(s) ativo(s)</small> : null}</div>
    {subscription ? <div className="sharkbot-push-preferences" aria-label="Tipos de notificação"><label htmlFor="sharkbot-pref-lead"><span><strong>Lead iniciou o bot</strong><small>Avisa quando uma nova pessoa começa o fluxo.</small></span><input id="sharkbot-pref-lead" aria-label="Notificar quando um lead iniciar o bot" type="checkbox" checked={preferences.newLead} disabled={busy} onChange={(event) => void updatePreference("newLead", event.target.checked)} /></label><label htmlFor="sharkbot-pref-created"><span><strong>Pedido gerado ou pendente</strong><small>Avisa quando um pagamento é criado e aguarda confirmação.</small></span><input id="sharkbot-pref-created" aria-label="Notificar quando um pedido for gerado" type="checkbox" checked={preferences.paymentCreated} disabled={busy} onChange={(event) => void updatePreference("paymentCreated", event.target.checked)} /></label><label htmlFor="sharkbot-pref-approved"><span><strong>Pedido pago</strong><small>Avisa quando a venda é aprovada.</small></span><input id="sharkbot-pref-approved" aria-label="Notificar quando um pedido for pago" type="checkbox" checked={preferences.paymentApproved} disabled={busy} onChange={(event) => void updatePreference("paymentApproved", event.target.checked)} /></label></div> : null}
    <div className="sharkbot-push-actions">
      {!subscription ? <button type="button" className="primary-button" onClick={() => void activate()} disabled={busy || state !== "ready"}>{busy ? "Ativando…" : "Ativar notificações"}</button> : <>
        <button type="button" className="primary-button" onClick={() => void sendSaleNotification()} disabled={busy}>{busy ? "Enviando…" : "Gerar notificação de venda"}</button>
        <button type="button" className="outline-button" onClick={() => void sendTest()} disabled={busy}>Enviar teste técnico</button>
        <button type="button" className="outline-button" onClick={() => void deactivate()} disabled={busy}>Desativar neste dispositivo</button>
      </>}
    </div>
    {feedback ? <p className="sharkbot-push-feedback" role="status">{feedback}</p> : null}
  </section>;
}

export function SharkBotIntegration() {
  const [data, setData] = useState<SharkBotData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lastEventId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/integrations/sharkbot", { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json() as SharkBotData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar a SharkBot.");
        if (!active) return;
        const newest = payload.events[0];
        if (lastEventId.current && newest?.id !== lastEventId.current && newest?.eventType === "payment_approved") {
          setNotice(`Nova venda${newest.payerName ? ` de ${newest.payerName}` : ""}: ${money(newest.amountCents, newest.currency)}`);
        }
        lastEventId.current = newest?.id || null;
        setData(payload); setError("");
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Falha ao atualizar a SharkBot.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return <section className="panel sharkbot-integration">
    <div className="panel-heading">
      <div><span className="panel-kicker">Vendas em tempo real</span><h2>SharkBot</h2></div>
      <span className={`ready-pill ${data?.configured ? "" : "is-pending"}`}><i />{data?.configured ? "Webhook pronto" : "Falta configurar o secret"}</span>
    </div>
    {notice ? <button type="button" className="sharkbot-notice" onClick={() => setNotice("")}><strong>{notice}</strong><span>Recebida agora · clique para fechar</span></button> : null}
    {error ? <div className="import-result error">{error}</div> : null}
    <div className="sharkbot-summary">
      <article><span>Vendas aprovadas</span><strong>{data?.stats.approved ?? 0}</strong></article>
      <article><span>Faturamento recebido</span><strong>{money(data?.stats.revenueCents ?? 0)}</strong></article>
      <article><span>Eventos armazenados</span><strong>{data?.stats.events ?? 0}</strong></article>
    </div>
    {data?.isPlatformAdmin ? <>
      <div className={`sharkbot-routing ${data.routing === "linked" ? "is-linked" : "is-pending"}`}><strong>{data.routing === "linked" ? "Webhook vinculado ao admin correto" : "Roteamento requer configuração"}</strong><span>As vendas ficam exclusivamente no workspace administrativo definido.</span></div>
      <SharkBotPushControls />
    </> : null}
    <label className="sharkbot-endpoint"><span>URL para cadastrar na SharkBot</span><input readOnly value={data?.webhookUrl || "Carregando…"} onFocus={(event) => event.currentTarget.select()} /></label>
    <p className="field-help">Na SharkBot, selecione Pagamento Aprovado e os fluxos desejados. Use o mesmo secret configurado no Worker.</p>
    <div className="sharkbot-events">
      {data?.events.length ? data.events.slice(0, 8).map((event) => <article key={event.id}>
        <span className={`sharkbot-event-dot ${event.eventType}`} />
        <span><strong>{eventLabel(event.eventType)}{event.payerName ? ` · ${event.payerName}` : ""}</strong><small>{[event.productName, event.flowName, event.botName, event.gateway].filter(Boolean).join(" · ") || "Detalhes aguardando o primeiro payload"}</small></span>
        <span><strong>{event.amountCents ? money(event.amountCents, event.currency) : "—"}</strong><time>{new Date(event.occurredAt).toLocaleString("pt-BR")}</time></span>
      </article>) : <div className="automation-empty compact"><h3>Nenhum evento recebido</h3><p>As próximas vendas aparecerão aqui depois que o webhook for cadastrado.</p></div>}
    </div>
  </section>;
}

export function SharkBotSaleNotifier() {
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/integrations/sharkbot?summary=0&limit=1", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as SharkBotData;
        const newest = payload.events.find((event) => event.eventType === "payment_approved");
        if (!active || !newest) return;
        const storageKey = "resolvflow.sharkbot.last-sale";
        const previous = sessionStorage.getItem(storageKey);
        if (previous && previous !== newest.id) {
          setNotice({ id: newest.id, text: `Nova venda${newest.payerName ? ` de ${newest.payerName}` : ""}: ${money(newest.amountCents, newest.currency)}` });
        }
        sessionStorage.setItem(storageKey, newest.id);
      } catch {
        // A integração continua tentando silenciosamente no próximo ciclo.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return notice ? <button type="button" className="sharkbot-global-notice" onClick={() => setNotice(null)}>
    <span>Venda aprovada</span><strong>{notice.text}</strong><small>Recebida agora · clique para fechar</small>
  </button> : null;
}
