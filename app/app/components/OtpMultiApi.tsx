"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {usePixTopUp} from "./usePixTopUp";
import {useOtpPurchases} from "./useOtpPurchases";
import {purchaseReason,type PurchaseItem} from "../lib/otpPurchasePresentation";

function PurchaseJourney({items}:{items?:PurchaseItem[]}) {
  if(!items?.length)return null;
  return <details><summary>Ver etapas do pedido</summary>{items.map(item=><div key={item.index}><p>Item {item.index+1} · {purchaseReason(item.result)}</p>{item.steps?.length ? <ol>{item.steps.map((step,index)=><li key={index}>{item.result==="unconfirmed_refunded"&&step.result==="awaiting_confirmation" ? "Confirmação da entrega não recebida" : purchaseReason(step.result)}</li>)}</ol> : <p>Etapas anteriores não registradas.</p>}</div>)}</details>;
}

type ApiCard = {
  id: string;
  name: string;
  enabled: boolean;
  isPrimary: boolean;
  openOrders: number;
  state: string;
  balance?: string;
  currency?: string;
  error?: string;
};

type InboxOrder = {
  inboxId: string;
  order_id: string;
  email: string;
  status: string;
  codes: Array<{ code: string; at: string }>;
  closed: boolean;
  hidden: boolean;
  savedAt: string;
  supplierApiId: string | null;
  supplierApiName: string;
};

type WalletPayload = {
  accountId?:string;
  workspaceId?:string;
  reliableOrders?:boolean;
  configured?: boolean;
  usesSupplier?: boolean;
  costMode?: boolean;
  supplierBalance?: string;
  supplierCurrency?: string;
  fallbackBalance?: { state: string; balance?: number; currency?: string };
  isPlatformAdmin?: boolean;
  canViewStock?: boolean;
  canManageApis?: boolean;
  apis?: ApiCard[];
  priceCents?: number;
  pricePriorityCents?: number;
  priceRushCents?: number;
  minDepositCents?: number;
  minDepositLabel?: string;
  pixEnabled?: boolean;
  principalPixTopup?: boolean;
  pixRequiresDocument?: boolean;
  priceLabel?: string;
  pricePriorityLabel?: string;
  priceRushLabel?: string;
  balanceLabel?: string;
  balanceCents?:number;
  gmailsLeft?: number;
};

type StockPayload = { available: boolean; total?: number; checkedAt?: string };

type ApiResult = {
  apiId: string;
  apiName: string;
  state: string;
  message: string;
  ordered: number;
  requested: number;
};
type PageKind="open"|"history"|"hidden";
type InboxPayload = { orders?: InboxOrder[]; activeId?: string; activeSupplierApiId?: string | null;pages?:Record<PageKind,string|null> };
type CodeResult = { order_id?:string;supplierApiId?: string | null; supplierApiName?: string; status?: string; code?: string; error?: string; closed?: boolean; refundedCents?: number };
type CancelPayload = { cancelled?: boolean; refundedCents?: number; email?: string; code?: string };
type CodesPayload = { inbox?: InboxPayload; results?: CodeResult[]; status?: string; code?: string;nextCodeOffset?:number };
type OrderPayload = { apiResults?: ApiResult[]; ordered?: number; order_id?: string };
type MonitorMode = "gmail" | "api";
type ApiOrderGroup = {
  apiId: string;
  apiName: string;
  api: ApiCard | null;
  orders: InboxOrder[];
};

async function jsonRequest<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok)
    throw new Error(
      String(payload.error || "Não foi possível concluir a operação."),
    );
  return payload as T;
}

function statusLabel(api: ApiCard) {
  if (!api.enabled) return "Pausada";
  if (api.state === "ready") return "Disponível";
  if (api.state === "invalid_key") return "Chave inválida";
  if (api.state === "insufficient_balance") return "Sem saldo";
  if (api.state === "unavailable") return "Indisponível";
  return api.error || "Falha na leitura";
}

function inboxOrderKey(order: InboxOrder) {
  return order.inboxId || `${order.supplierApiId || "legacy"}:${order.order_id}`;
}
function canCancelSupplierOrder(order: InboxOrder) {
  return order.order_id.startsWith("og_") && !order.closed && !order.hidden && order.codes.length === 0;
}
function brl(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function mergeInbox(current:InboxOrder[],next:InboxOrder[]) {
  const rows=new Map(current.map(order=>[inboxOrderKey(order),order]));
  next.forEach(order=>rows.set(inboxOrderKey(order),order));
  return [...rows.values()].sort((a,b)=>orderActivity(b)-orderActivity(a));
}

function orderActivity(order: InboxOrder) {
  return Math.max(
    new Date(order.savedAt).getTime() || 0,
    ...order.codes.map((item) => new Date(item.at).getTime() || 0),
  );
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LiveGmailCard({
  order,
  selected,
  refreshing,
  onSelect,
  onRefresh,
  onClose,
  onCancel,
  cancelLabel,
  cancelDisabled,
  onCopy,
  showOrigin,
}: {
  order: InboxOrder;
  selected: boolean;
  refreshing: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  onCopy: (value: string, label: string) => void;
  showOrigin: boolean;
}) {
  return (
    <article className={`otp-live-order-card ${selected ? "selected" : ""}`}>
      <header>
        <div>
          {showOrigin ? <span className="otp-origin-badge">{order.supplierApiName}</span> : null}
          <span
            className={`otp-live-state ${order.codes.length ? "ready" : "waiting"}`}
          >
            {order.codes.length ? "Código recebido" : "Aguardando"}
          </span>
        </div>
        <time>Atualizado {shortTime(order.codes[0]?.at || order.savedAt)}</time>
      </header>
      <button
        type="button"
        className="otp-live-email"
        onClick={onSelect}
        aria-label={`Selecionar ${order.email}`}
      >
        <strong>{order.email}</strong>
        <span>
          {selected
            ? "Selecionado na caixa unificada"
            : "Ver na caixa unificada"}
        </span>
      </button>
      <div className="otp-live-actions">
        <button
          type="button"
          className="outline-button"
          onClick={() => onCopy(order.email, "E-mail")}
        >
          Copiar e-mail
        </button>
        <button
          type="button"
          className="text-button"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Buscando…" : "Buscar agora"}
        </button>
        <button type="button" className="text-button danger" onClick={onClose}>
          Encerrar
        </button>
        {onCancel ? (
          <button type="button" className="outline-button" disabled={refreshing || cancelDisabled} onClick={onCancel}>
            {cancelLabel || "Cancelar no fornecedor"}
          </button>
        ) : null}
      </div>
      <div className="otp-active-codes" aria-live="polite">
        {order.codes.length ? (
          order.codes.map((item) => (
            <button
              type="button"
              key={`${item.code}:${item.at}`}
              onClick={() => onCopy(item.code, "Código")}
            >
              <b>{item.code}</b>
              <span>Copiar código</span>
              <time>{shortTime(item.at)}</time>
            </button>
          ))
        ) : (
          <div className="otp-wait pulse">Aguardando código…</div>
        )}
      </div>
    </article>
  );
}

function LiveApiCard({
  group,
  refreshing,
  selectedKey,
  onSelect,
  onRefresh,
  onClose,
  onCancel,
  cancelLabel,
  onCloseAll,
  onCopy,
}: {
  group: ApiOrderGroup;
  refreshing: boolean;
  selectedKey: string;
  onSelect: (order: InboxOrder) => void;
  onRefresh: () => void;
  onClose: (order: InboxOrder) => void;
  onCancel: (order: InboxOrder) => void;
  cancelLabel: string;
  onCloseAll: () => void;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <article className="otp-live-api-card">
      <header>
        <div>
          <span className={`otp-api-state ${group.api?.state || "ready"}`}>
            {group.api ? statusLabel(group.api) : "Disponível"}
          </span>
          <h3>{group.apiName}</h3>
          <small>
            {group.orders.length} Gmail(s) aberto(s)
            {group.api?.balance !== undefined
              ? ` · Saldo ${group.api.balance} ${group.api.currency || ""}`
              : ""}
          </small>
        </div>
        <div className="otp-live-api-header-actions">
          <button
            type="button"
            className="outline-button"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {refreshing ? "Buscando…" : "Buscar agora"}
          </button>
          <button
            type="button"
            className="text-button danger"
            onClick={onCloseAll}
          >
            Encerrar todos
          </button>
        </div>
      </header>
      <div className="otp-live-api-orders">
        {group.orders.map((order) => (
          <section
            className={selectedKey === inboxOrderKey(order) ? "selected" : ""}
            key={inboxOrderKey(order)}
          >
            <div className="otp-live-api-email">
              <span className="otp-origin-badge">{group.apiName}</span>
              <button type="button" onClick={() => onSelect(order)}>
                <strong>{order.email}</strong>
                <small>
                  {order.codes.length
                    ? `${order.codes.length} código(s)`
                    : "Aguardando código"}
                </small>
              </button>
              <button
                type="button"
                className="otp-copy-compact"
                onClick={() => onCopy(order.email, "E-mail")}
              >
                Copiar e-mail
              </button>
              <button
                type="button"
                className="otp-copy-compact danger"
                onClick={() => onClose(order)}
              >
                Encerrar
              </button>
              {canCancelSupplierOrder(order) ? (
                <button type="button" className="otp-copy-compact" onClick={() => onCancel(order)}>
                  {cancelLabel}
                </button>
              ) : null}
            </div>
            <div className="otp-live-api-codes">
              {order.codes.length ? (
                order.codes.map((item) => (
                  <button
                    type="button"
                    key={`${item.code}:${item.at}`}
                    onClick={() => onCopy(item.code, "Código")}
                  >
                    <b>{item.code}</b>
                    <span>{shortTime(item.at)} · copiar</span>
                  </button>
                ))
              ) : (
                <span className="otp-wait pulse">Aguardando código…</span>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export function OtpMultiApi({
  canOperate,
}: {
  canOperate: boolean;
}) {
  const [wallet, setWallet] = useState<WalletPayload | null>(null);
  const [stock, setStock] = useState<StockPayload | null>(null);
  const [workspaceSection, setWorkspaceSection] = useState<
    "operation" | "apis"
  >("operation");
  const [selectedApiId, setSelectedApiId] = useState("all");
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [monitorMode, setMonitorMode] = useState<MonitorMode>("gmail");
  const [refreshingScopes, setRefreshingScopes] = useState<string[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [apiName, setApiName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const codesInFlight = useRef(false);
  const codeOffset=useRef(0);
  const loadedPages=useRef(new Set<PageKind>());
  const [pages,setPages]=useState<Record<PageKind,string|null>>({open:null,history:null,hidden:null});
  const [loadingPage,setLoadingPage]=useState<PageKind|null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [apiResults, setApiResults] = useState<ApiResult[]>([]);
  const [codeResults, setCodeResults] = useState<
    Array<{ apiId: string; apiName: string; state: string; message: string }>
  >([]);
  const [pixAmount, setPixAmount] = useState("20");
  const [pixDocument, setPixDocument] = useState("");
  const [pixQr, setPixQr] = useState<{ scope: string; paymentId: string; code: string; dataUrl: string } | null>(null);
  const [revealedApiKeys, setRevealedApiKeys] = useState<
    Record<string, string>
  >({});

  const apis = useMemo(() => wallet?.apis || [], [wallet?.apis]);
  const selectedApi = apis.find((api) => api.id === selectedApiId) || null;
  const hasOpenOrders = orders.some((order) => !order.closed);
  const enabledApis = apis.filter((api) => api.enabled);
  const totalOpenOrders = orders.filter((order) => !order.closed).length;
  const canManageApis = Boolean(wallet?.canManageApis);
  const stockEnabled = wallet?.canViewStock === true;
  const activeSection = canManageApis ? workspaceSection : "operation";
  const canRequestSelected =
    !canManageApis ? Boolean(wallet?.configured) : selectedApiId === "all"
      ? enabledApis.length > 0
      : Boolean(selectedApi?.enabled);
  const orderTotal=quantity*(wallet?.priceCents??300);
  const insufficientBalance=Boolean(wallet&&!wallet.costMode&&!wallet.usesSupplier&&typeof wallet.balanceCents==="number"&&wallet.balanceCents<orderTotal);

  const loadInbox = useCallback(async (apiId: string) => {
    const inbox = await jsonRequest<InboxPayload>(
      `/api/otp/inbox?apiId=${encodeURIComponent(apiId)}`,
    );
    const next = Array.isArray(inbox.orders)
      ? (inbox.orders as InboxOrder[])
      : [];
    setOrders(current=>mergeInbox(current,next));
    if(inbox.pages)setPages(current=>({open:loadedPages.current.has("open")?current.open:inbox.pages!.open,history:loadedPages.current.has("history")?current.history:inbox.pages!.history,hidden:loadedPages.current.has("hidden")?current.hidden:inbox.pages!.hidden}));
    const preferred =
      next.find(
        (order) =>
          order.order_id === inbox.activeId &&
          (!inbox.activeSupplierApiId ||
            order.supplierApiId === inbox.activeSupplierApiId),
      ) || next.find((order) => !order.hidden);
    setActiveKey(
      preferred
        ? inboxOrderKey(preferred)
        : "",
    );
  }, []);

  const walletRequest = useRef(0);
  const loadWallet = useCallback(async () => {
    const sequence=++walletRequest.current;
    const next = await jsonRequest<WalletPayload>("/api/otp/wallet");
    if(sequence===walletRequest.current)setWallet(next);
    return next as WalletPayload;
  }, []);
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden)void loadWallet().catch(()=>undefined);};
    const timer=window.setInterval(refresh,15000);
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("focus",refresh);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("focus",refresh);};
  },[loadWallet]);
  const purchaseChanged=useCallback(()=>Promise.all([loadWallet(),loadInbox("all")]),[loadWallet,loadInbox]);
  const purchases=useOtpPurchases(wallet?.reliableOrders===true,wallet?.accountId ? `${wallet.accountId}:${wallet.workspaceId||""}` : "",purchaseChanged);

  useEffect(() => {
    if (!stockEnabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await jsonRequest("/api/otp/stock") as StockPayload;
        if (active) setStock(next);
      } catch {
        if (active) setStock({ available: false });
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 45_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [stockEnabled]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const hashSection = window.location.hash.replace(/^#/, "");
      const requestedSection =
        hashSection ||
        new URLSearchParams(window.location.search).get("otpSection");
      if (
        requestedSection === "operation" ||
        requestedSection === "apis"
      )
        setWorkspaceSection(requestedSection);
      Promise.all([loadWallet(), loadInbox("all")]).catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível abrir o Gmail OTP.",
          );
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadInbox, loadWallet]);

  useEffect(() => {
    const syncSectionFromHash = () => {
      const section = window.location.hash.replace(/^#/, "");
      if (
        section === "operation" ||
        section === "apis"
      )
        setWorkspaceSection(section);
    };
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedMode = window.sessionStorage.getItem("otp-monitor-mode");
      if (savedMode === "gmail" || savedMode === "api")
        setMonitorMode(savedMode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const refreshCodes = useCallback(
    async (silent = false) => {
      if (codesInFlight.current || (silent && document.hidden)) return;
      codesInFlight.current = true;
      if (!silent) setBusy(true);
      try {
        const payload = await jsonRequest<CodesPayload>("/api/otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "codes", apiId: selectedApiId,codeOffset:codeOffset.current }),
        });
        const next = Array.isArray(payload.inbox?.orders)
          ? (payload.inbox.orders as InboxOrder[])
          : [];
        codeOffset.current=payload.nextCodeOffset||0;
        setOrders(current=>mergeInbox(current.map(order=>{
          const update=payload.results?.find(item=>item.order_id===order.order_id);
          const received=update?.status==="ready"&&update.code&&!order.codes.some(item=>item.code===update.code);
          const withCode=received&&update.code?{...order,codes:[...order.codes,{code:update.code,at:new Date().toISOString()}]}:order;
          return update?.closed ? {...withCode,closed:true,status:"closed"} : withCode;
        }),next));
        const ready = Array.isArray(payload.results)
          ? payload.results.filter(
              (item: { status?: string; code?: string }) =>
                item.status === "ready" && item.code,
            )
          : [];
        const failures = new Map<
          string,
          { apiId: string; apiName: string; state: string; message: string }
        >();
        if (Array.isArray(payload.results)) {
          for (const item of payload.results as Array<{
            supplierApiId?: string | null;
            supplierApiName?: string;
            status?: string;
            error?: string;
          }>) {
            if (
              !item.error &&
              item.status !== "api_unavailable" &&
              item.status !== "unavailable"
            )
              continue;
            const apiId = item.supplierApiId || "legacy";
            failures.set(apiId, {
              apiId,
              apiName: item.supplierApiName || "API principal",
              state: item.status || "error",
              message: item.error || "API indisponível nesta consulta.",
            });
          }
        }
        setCodeResults([...failures.values()]);
        const refunded = Array.isArray(payload.results) ? payload.results.filter((item) => (item.refundedCents || 0) > 0) : [];
        if (refunded.length) {
          const cents = refunded.reduce((sum, item) => sum + (item.refundedCents || 0), 0);
          setMessage(`${refunded.length} Gmail(s) sem código: ${brl(cents)} devolvido(s) à carteira.`);
          void loadWallet();
        } else if (ready.length && !silent) {
          setMessage(`${ready.length} código(s) atualizado(s).`);
        }
      } catch (cause) {
        if (!silent)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível atualizar os códigos.",
          );
      } finally {
        codesInFlight.current = false;
        if (!silent) setBusy(false);
      }
    },
    [loadWallet, selectedApiId],
  );

  useEffect(() => {
    if (!wallet || !hasOpenOrders) return;
    const initial=window.setTimeout(()=>void refreshCodes(true),0);
    const timer = window.setInterval(() => void refreshCodes(true), 8_000);
    const onVisible = () => { if (!document.hidden) void refreshCodes(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasOpenOrders, refreshCodes, wallet]);

  const visibleOrders = useMemo(
    () =>
      !canManageApis || selectedApiId === "all"
        ? orders
        : orders.filter((order) => order.supplierApiId === selectedApiId),
    [canManageApis, orders, selectedApiId],
  );
  const openVisibleOrders = useMemo(
    () =>
      visibleOrders
        .filter((order) => !order.closed && !order.hidden)
        .sort((a, b) => {
          const codePriority =
            Number(Boolean(b.codes.length)) - Number(Boolean(a.codes.length));
          return codePriority || orderActivity(b) - orderActivity(a);
        }),
    [visibleOrders],
  );
  const openOrdersByApi = useMemo(() => {
    const groups = new Map<string, ApiOrderGroup>();
    for (const order of openVisibleOrders) {
      const apiId = order.supplierApiId || "legacy";
      const current = groups.get(apiId);
      if (current) current.orders.push(order);
      else
        groups.set(apiId, {
          apiId,
          apiName: order.supplierApiName || "API principal",
          api: apis.find((api) => api.id === order.supplierApiId) || null,
          orders: [order],
        });
    }
    return [...groups.values()];
  }, [apis, openVisibleOrders]);
  const historyPool = useMemo(
    () =>
      visibleOrders.filter((order) => canManageApis
        ? !order.hidden && inboxOrderKey(order) !== activeKey
        : order.closed && !order.hidden),
    [activeKey, canManageApis, visibleOrders],
  );
  const historyOrders = useMemo(
    () => (historyExpanded ? historyPool : historyPool.slice(0, 6)),
    [historyExpanded, historyPool],
  );
  const hiddenHistoryCount = Math.max(0, historyPool.length - 6);
  const hiddenOrders = visibleOrders.filter((order) => order.hidden);
  const minDepositReais = Math.max(5, Math.ceil((wallet?.minDepositCents || 1500) / 100));
  const pixPacks = [...new Set([minDepositReais, 20, 50, 100, 200].filter((amount) => amount >= minDepositReais))].slice(0, 4);

  const pixScope = wallet?.accountId && wallet?.workspaceId ? `${wallet.accountId}:${wallet.workspaceId}` : "";
  const pix = usePixTopUp(pixScope, loadWallet);
  const pixCharge = pix.charge, pixBusy = pix.busy;
  const pixQrDataUrl = pixQr && pixQr.scope === pixScope && pixQr.paymentId === pixCharge?.id && pixQr.code === pixCharge.qrCode ? pixQr.dataUrl : "";

  useEffect(() => {
    if (!pixCharge?.qrCode || pixCharge.status === "paid") return;
    let cancelled = false;
    import("qrcode").then((module) => module.default.toDataURL(pixCharge.qrCode, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })).then((url) => { if (!cancelled) setPixQr({ scope: pixScope, paymentId: pixCharge.id, code: pixCharge.qrCode, dataUrl: url }); }).catch(() => { if (!cancelled) setPixQr(null); });
    return () => { cancelled = true; };
  }, [pixCharge, pixScope]);

  async function createPix(amount: number) {
    if (!Number.isFinite(amount) || Math.round(amount * 100) < (wallet?.minDepositCents || 1500)) {
      setError(`Depósito mínimo ${wallet?.minDepositLabel || `R$ ${minDepositReais},00`}.`);
      return;
    }
    const customerDocument = pixDocument.replace(/\D/g, "");
    if (wallet?.pixRequiresDocument && ![11, 14].includes(customerDocument.length)) {
      setError("Informe um CPF ou CNPJ válido para gerar o PIX.");
      return;
    }
    if (!canOperate || !wallet?.pixEnabled) return;
    await pix.start(Math.round(amount * 100), customerDocument);
  }

  async function mutateApi(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await jsonRequest<WalletPayload>("/api/otp/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setWallet(next);
      return next;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar a API.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addApi() {
    if (!apiName.trim() || !apiKey.trim())
      return setError("Informe o nome e a chave da API.");
    const next = await mutateApi({
      action: "add_api",
      name: apiName,
      supplierKey: apiKey,
    });
    if (next) {
      setApiName("");
      setApiKey("");
      setAdding(false);
      setMessage(
        "API adicionada. A chave foi protegida e permanece oculta por padrão.",
      );
    }
  }

  async function deleteApi(api: ApiCard) {
    const warning =
      api.openOrders > 0
        ? `A API “${api.name}” possui ${api.openOrders} pedido(s) aberto(s). Excluir agora encerrará esses pedidos e eles não receberão novos códigos. A chave será removida, mas o histórico será preservado. Deseja continuar?`
        : `Excluir a API “${api.name}”? A chave será removida, mas os pedidos encerrados continuarão no histórico.`;
    if (!window.confirm(warning)) return;
    const next = await mutateApi({
      action: "delete_api",
      apiId: api.id,
      closeOpenOrders: api.openOrders > 0,
    });
    if (!next) return;
    if (selectedApiId === api.id) {
      setSelectedApiId("all");
      setHistoryExpanded(false);
      await loadInbox("all");
    }
    setMessage(`API “${api.name}” excluída. O histórico foi preservado.`);
  }

  async function revealApiKey(api: ApiCard) {
    if (revealedApiKeys[api.id]) {
      setRevealedApiKeys((current) => {
        const next = { ...current };
        delete next[api.id];
        return next;
      });
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await jsonRequest("/api/otp/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reveal_api", apiId: api.id }),
      });
      if (!payload.supplierKey)
        throw new Error("A chave desta API não está disponível.");
      setRevealedApiKeys((current) => ({
        ...current,
        [api.id]: String(payload.supplierKey),
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível visualizar a chave.",
      );
    } finally {
      setBusy(false);
    }
  }

  function supplierCancelLabel() {
    return wallet?.costMode ? "Cancelar no fornecedor" : `Cancelar e devolver ${wallet?.priceLabel || "R$ 3,00"}`;
  }

  async function cancelOrders(targets: InboxOrder[]) {
    const pending = targets.filter(canCancelSupplierOrder);
    if (!pending.length) return;
    const refundText = wallet?.costMode
      ? "O saldo do fornecedor volta. Esta conta não paga pela carteira."
      : `Se o fornecedor confirmar que não chegou código, ${wallet?.priceLabel || "R$ 3,00"} volta para a carteira de cada Gmail.`;
    const prompt = pending.length === 1
      ? `Cancelar ${pending[0].email} no fornecedor? ${refundText} Se o código chegar durante o cancelamento, nada é devolvido.`
      : `Cancelar ${pending.length} Gmails sem código no fornecedor? ${refundText} Gmail que receber código durante o cancelamento continua cobrado.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setMessage("");
    let refundedCents = 0;
    let cancelled = 0;
    const failures: string[] = [];
    for (const order of pending) {
      try {
        const result = await jsonRequest<CancelPayload>("/api/otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel", inboxId: order.inboxId, orderId: order.order_id }),
        });
        cancelled += 1;
        refundedCents += result.refundedCents || 0;
        setOrders((current) => current.map((item) => item.inboxId === order.inboxId ? { ...item, closed: true, status: "closed" } : item));
      } catch (cause) {
        failures.push(cause instanceof Error ? `${order.email}: ${cause.message}` : order.email);
      }
    }
    await Promise.all([loadWallet(), loadInbox(selectedApiId)]).catch(() => undefined);
    if (refundedCents > 0) setMessage(`${cancelled} Gmail(s) cancelado(s). ${brl(refundedCents)} devolvido(s) à carteira.`);
    else if (cancelled) setMessage(`${cancelled} Gmail(s) cancelado(s) no fornecedor.`);
    if (failures.length) setError(failures.slice(0, 3).join(" "));
    setBusy(false);
  }

  async function closeOrder(order: InboxOrder) {
    if(canCancelSupplierOrder(order)){await cancelOrders([order]);return;}
    const warning = canCancelSupplierOrder(order)
      ? `Encerrar o acompanhamento de ${order.email}? Ele sai desta tela e continua no histórico. Isso não cancela no fornecedor e não devolve o saldo. Para receber a devolução, use cancelar.`
      : `Encerrar o acompanhamento de ${order.email}? Ele continuará no histórico. Esta ação não cancela o pedido no fornecedor.`;
    if (!window.confirm(warning))
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/otp/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "close",
          inboxId: order.inboxId,
          orderId: order.order_id,
          supplierApiId: order.supplierApiId,
        }),
      });
      await Promise.all([loadWallet(), loadInbox(selectedApiId)]);
      setMessage(`Gmail ${order.email} encerrado. O histórico foi preservado.`);
      setOrders(current=>current.map(item=>item.inboxId===order.inboxId?{...item,closed:true}:item));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível encerrar o Gmail.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeHistoryVisibility(order: InboxOrder, hidden: boolean) {
    if (hidden && !window.confirm(`Ocultar ${order.email} da sua lista? Você poderá restaurá-lo na seção Ocultos. O registro e a cobrança serão preservados.`)) return;
    setBusy(true);
    setError("");
    try {
      await jsonRequest("/api/otp/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: hidden ? "hide" : "restore", inboxId: order.inboxId }),
      });
      await loadInbox(selectedApiId);
      setMessage(hidden ? "Gmail ocultado da lista. Você pode restaurá-lo em Ocultos." : "Gmail restaurado no histórico.");
      setOrders(current=>current.map(item=>item.inboxId===order.inboxId?{...item,hidden}:item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o histórico.");
    } finally {
      setBusy(false);
    }
  }

  async function closeApiOrders(api: ApiCard) {
    if (!api.openOrders) return;
    if (
      !window.confirm(
        `Encerrar ${api.openOrders} pedido(s) aberto(s) da API “${api.name}”? Eles continuarão no histórico, mas não receberão novos códigos.`,
      )
    )
      return;
    const next = await mutateApi({ action: "close_api_orders", apiId: api.id });
    if (!next) return;
    await loadInbox(selectedApiId);
    setMessage(
      `${api.openOrders} pedido(s) da API “${api.name}” encerrado(s).`,
    );
  }

  async function orderEmails() {
    if(busy)return;
    setBusy(true);
    setError("");
    setMessage("");
    setApiResults([]);
    try {
      if(wallet?.reliableOrders){await purchases.start(quantity);return;}
      const payload = await jsonRequest<OrderPayload>("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "order",
          apiId: selectedApiId,
          allApis: selectedApiId === "all",
          quantity,
          priorityMode: 0,
          product: "ig_gmail_otp",
        }),
      });
      const results = Array.isArray(payload.apiResults)
        ? (payload.apiResults as ApiResult[])
        : [];
      setApiResults(results);
      const successful = results.reduce(
        (total, result) => total + Number(result.ordered || 0),
        0,
      ) || Number(payload.ordered || (payload.order_id ? 1 : 0));
      setMessage(
        successful
          ? wallet?.costMode
            ? `${successful} Gmail(s) criado(s) ao custo do fornecedor.`
            : canManageApis
            ? `${successful} Gmail(s) criado(s). As APIs que falharam continuam identificadas abaixo.`
            : `${successful} Gmail(s) criado(s). O valor foi descontado do seu saldo.`
          : canManageApis
            ? "Nenhuma API conseguiu criar o pedido."
            : "Não foi possível criar o Gmail. Nenhum valor foi descontado.",
      );
      await Promise.all([loadWallet(), loadInbox(selectedApiId)]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível solicitar os Gmails.",
      );
    } finally {
      await loadWallet().catch(()=>undefined);
      setBusy(false);
    }
  }

  async function selectOrder(order: InboxOrder) {
    setActiveKey(inboxOrderKey(order));
    await jsonRequest("/api/otp/inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "select",
        inboxId: order.inboxId,
        orderId: order.order_id,
        supplierApiId: order.supplierApiId,
      }),
    }).catch(() => undefined);
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copiado.`);
    } catch {
      setError(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  }

  function changeMonitorMode(mode: MonitorMode) {
    setMonitorMode(mode);
    window.sessionStorage.setItem("otp-monitor-mode", mode);
  }

  function markRefreshing(scope: string, active: boolean) {
    setRefreshingScopes((current) =>
      active
        ? [...new Set([...current, scope])]
        : current.filter((item) => item !== scope),
    );
  }

  async function refreshOrder(order: InboxOrder) {
    const scope = `order:${inboxOrderKey(order)}`;
    markRefreshing(scope, true);
    setError("");
    setMessage("");
    try {
      const payload = await jsonRequest<CodesPayload>("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "code",
          inboxId: order.inboxId,
          orderId: order.order_id,
          supplierApiId: order.supplierApiId,
        }),
      });
      await loadInbox(selectedApiId);
      setMessage(
        payload.status === "ready" && payload.code
          ? `Código atualizado em ${order.email}.`
          : `${order.email} ainda está aguardando código.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Não foi possível atualizar ${order.email}.`,
      );
    } finally {
      markRefreshing(scope, false);
    }
  }

  async function refreshApiGroup(group: ApiOrderGroup) {
    const scope = `api:${group.apiId}`;
    markRefreshing(scope, true);
    setError("");
    setMessage("");
    try {
      const payload = await jsonRequest<CodesPayload>("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "codes",
          apiId: group.apiId === "legacy" ? "all" : group.apiId,
        }),
      });
      const next = Array.isArray(payload.inbox?.orders)
        ? (payload.inbox.orders as InboxOrder[])
        : [];
      if (group.apiId === "legacy") setOrders(current=>mergeInbox(current,next));
      else
        setOrders((current) =>
          [
            ...next,
            ...current.filter((order) => order.supplierApiId !== group.apiId),
          ].sort((a, b) => orderActivity(b) - orderActivity(a)),
        );
      const failures = Array.isArray(payload.results)
        ? (
            payload.results as Array<{
              supplierApiId?: string | null;
              supplierApiName?: string;
              status?: string;
              error?: string;
            }>
          )
            .filter(
              (item) =>
                item.error ||
                item.status === "api_unavailable" ||
                item.status === "unavailable",
            )
            .map((item) => ({
              apiId: item.supplierApiId || group.apiId,
              apiName: item.supplierApiName || group.apiName,
              state: item.status || "error",
              message: item.error || "API indisponível nesta consulta.",
            }))
        : [];
      setCodeResults((current) => [
        ...current.filter((item) => item.apiId !== group.apiId),
        ...failures,
      ]);
      const ready = Array.isArray(payload.results)
        ? payload.results.filter(
            (item: { status?: string; code?: string }) =>
              item.status === "ready" && item.code,
          ).length
        : 0;
      setMessage(
        ready
          ? `${ready} código(s) atualizado(s) em ${group.apiName}.`
          : `${group.apiName} atualizada; nenhum código novo.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Não foi possível atualizar ${group.apiName}.`,
      );
    } finally {
      markRefreshing(scope, false);
    }
  }

  function selectWorkspaceSection(section: "operation" | "apis") {
    if (section !== "operation" && !canManageApis) return;
    setWorkspaceSection(section);
    const url = new URL(window.location.href);
    url.hash = section;
    window.history.replaceState(null, "", url);
  }
  async function loadMore(kind:PageKind) {
    const cursor=pages[kind];if(!cursor||loadingPage)return;
    setLoadingPage(kind);setError("");
    try {
      const page=await jsonRequest<{orders:InboxOrder[];nextCursor:string|null}>(`/api/otp/inbox?kind=${kind}&cursor=${encodeURIComponent(cursor)}&apiId=${encodeURIComponent(selectedApiId)}`);
      setOrders(current=>mergeInbox(current,page.orders));loadedPages.current.add(kind);
      setPages(current=>({...current,[kind]:page.nextCursor}));
      if(kind==="history")setHistoryExpanded(true);
    }catch(cause){setError(cause instanceof Error ? cause.message : "Não foi possível carregar mais e-mails.");}finally{setLoadingPage(null);}
  }

  function showOperation(focusOrder = false) {
    selectWorkspaceSection("operation");
    if (focusOrder)
      window.setTimeout(
        () => document.getElementById("otp-order-panel")?.focus(),
        0,
      );
  }

  return (
    <div className={`content otp-page otp-multi-page ${canManageApis ? "" : "otp-customer-page"}`}>
      <header className="otp-workspace-header">
        <div className="otp-title-block">
          <span className="eyebrow">Gmail OTP</span>
          <h1>Central de Gmail</h1>
          <p>
            {canManageApis
              ? "Peça, acompanhe e copie códigos sem perder a origem de cada API."
              : "Peça, acompanhe e copie seus códigos em um só lugar."}
          </p>
        </div>
        <div className="otp-quick-stats" aria-label="Resumo da operação">
          {canManageApis ? (
            <span>
              <b>{enabledApis.length}</b> APIs habilitadas
            </span>
          ) : (
            <>
              {wallet?.costMode ? <>
                <span><b>Custo da API</b> por Gmail</span>
              </> : <>
                <span><b>{wallet?.balanceLabel || "R$ 0,00"}</b> saldo disponível</span>
                <span><b>{wallet?.priceLabel || "—"}</b> por Gmail</span>
              </>}
            </>
          )}
          <span>
            <b>{totalOpenOrders}</b> pedidos abertos
          </span>
        </div>
        <div className="otp-header-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canOperate || busy || !canRequestSelected || purchases.blocked}
            onClick={() => showOperation(true)}
          >
            Solicitar Gmail
          </button>
          <button
            type="button"
            className="outline-button"
            disabled={busy || !hasOpenOrders}
            onClick={() => {
              showOperation();
              void refreshCodes();
            }}
          >
            Atualizar códigos
          </button>
        </div>
      </header>

      {wallet?.isPlatformAdmin ? <div className="otp-admin-provider-balances" aria-label="Saldos originais dos fornecedores">
        <span><small>Saldo da integração principal</small><strong>{wallet.supplierBalance == null ? "Indisponível" : `${wallet.supplierBalance} ${wallet.supplierCurrency || ""}`}</strong></span>
        <span><small>Saldo da integração alternativa</small><strong>{wallet.fallbackBalance?.state === "ready" ? `${wallet.fallbackBalance.balance?.toLocaleString("pt-BR")} ${wallet.fallbackBalance.currency || "VND"}` : "Indisponível"}</strong></span>
      </div> : null}

      <div
        className="otp-section-nav"
        aria-label="Áreas do Gmail OTP"
        role="tablist"
      >
        <button
          type="button"
          id="otp-tab-operation"
          role="tab"
          aria-controls="otp-panel-operation"
          aria-selected={activeSection === "operation"}
          className={activeSection === "operation" ? "active" : ""}
          onClick={() => selectWorkspaceSection("operation")}
        >
          <span>01</span>Operação
        </button>
        {canManageApis ? (
          <button
            type="button"
            id="otp-tab-apis"
            role="tab"
            aria-controls="otp-panel-apis"
            aria-selected={workspaceSection === "apis"}
            className={workspaceSection === "apis" ? "active" : ""}
            onClick={() => selectWorkspaceSection("apis")}
          >
            <span>02</span>APIs
          </button>
        ) : null}
      </div>
      {wallet?.isPlatformAdmin ? (
        <p className="otp-admin-top-entry">Administração global de Gmail OTP: <a href="/admin?view=otp">abrir no TOP</a>.</p>
      ) : null}

      {message ? (
        <div
          className="operation-banner success otp-compact-banner"
          role="status"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="operation-banner error otp-compact-banner" role="alert">
          {error}
        </div>
      ) : null}
      {purchases.notice ? <div className="operation-banner success otp-compact-banner" role="status">{purchases.notice}</div> : null}
      {purchases.error ? <div className="operation-banner error otp-compact-banner" role="alert">{purchases.error}</div> : null}
      {purchases.unconfirmed ? <section className="panel otp-purchase-progress" aria-label="Recuperando pedido"><div><strong>Recuperando a solicitação…</strong><p>A conexão foi interrompida. Estamos recuperando o resultado do mesmo pedido automaticamente. Solicitar Gmail inicia uma compra separada.</p></div><button type="button" className="outline-button" disabled={busy||purchases.blocked} onClick={()=>void purchases.retry()}>Conferir pedido</button></section> : null}
      {purchases.operations.map(operation=><section key={operation.operationId} className="panel otp-purchase-progress" aria-live="polite">
        <div><strong>{operation.cancelled ? "Tentativas canceladas" : operation.needsReview ? "Finalizando solicitação…" : "Solicitando seus Gmails…"}</strong><p>{operation.ordered} de {operation.requested} entregue(s) · {operation.pending} em processamento</p>
        <small>{operation.cancelled||operation.needsReview ? "Estamos finalizando este pedido. O resultado e a devolução de crédito aparecerão no histórico assim que o processamento terminar." : "Seu pedido foi salvo e é acompanhado automaticamente. Você pode cancelar novas tentativas ou solicitar outro Gmail."}</small>
        <p><small>Pedido {operation.operationId.slice(0,8)}</small></p>
        {operation.needsReview ? <p>Você pode fazer outro pedido com o saldo disponível.</p> : null}<PurchaseJourney items={operation.items}/></div>
        {!wallet?.costMode ? <div className="otp-purchase-values"><span>Entregues <b>{(operation.charged_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></span><span>Reservado <b>{(operation.reserved_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></span>{operation.refunded_cents ? <span>Devolvido <b>{(operation.refunded_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></span> : null}</div> : null}
        {!operation.cancelled&&canOperate ? <button type="button" className="outline-button" disabled={busy||purchases.blocked} onClick={()=>{if(window.confirm("Cancelar os itens pendentes deste pedido? O valor reservado para esses itens será devolvido. Gmails já entregues serão preservados. Você poderá fazer um novo pedido."))void purchases.cancel(operation.operationId);}}>Cancelar pendentes</button> : null}
      </section>)}
      {purchases.recent.length ? <details className="panel"><summary>Pedidos recentes ({purchases.recent.length})</summary>{purchases.recent.map(operation=><div key={operation.operationId}><strong>Pedido {operation.operationId.slice(0,8)} · {operation.state==="unconfirmed_refunded" ? "Encerrado · entrega não confirmada" : operation.state==="out_of_stock" ? "Sem estoque no fornecedor" : operation.state==="review_refunded" ? "Pedido encerrado" : operation.cancelled ? "Tentativas canceladas" : operation.ordered ? "Entrega concluída" : "Nenhum Gmail entregue"}</strong><p>{operation.ordered} de {operation.requested} entregue(s){!wallet?.costMode&&operation.refunded_cents ? ` · Devolvido: ${(operation.refunded_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}` : ""}</p><PurchaseJourney items={operation.items}/></div>)}</details> : null}

      {activeSection === "operation" ? (
        <div
          className="otp-workspace-panel"
          id="otp-panel-operation"
          role="tabpanel"
          aria-labelledby="otp-tab-operation"
        >
          {canManageApis ? (
            <div className="otp-operation-toolbar">
              <label>
                <span>Ambiente de operação</span>
                <select
                  value={selectedApiId}
                  onChange={(event) => {
                    setSelectedApiId(event.target.value);
                    setHistoryExpanded(false);
                    void loadInbox(event.target.value);
                  }}
                >
                  <option value="all">Todas as APIs</option>
                  {apis.map((api) => (
                    <option value={api.id} key={api.id}>
                      {api.name}
                      {api.enabled ? "" : " · pausada"}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span
                  className={`otp-api-state ${selectedApiId === "all" || selectedApi?.enabled ? "ready" : "disabled"}`}
                >
                  {selectedApiId === "all"
                    ? `${enabledApis.length} APIs disponíveis`
                    : selectedApi
                      ? statusLabel(selectedApi)
                      : "Selecione uma API"}
                </span>
                <small>
                  {selectedApiId === "all"
                    ? "Pedidos serão distribuídos pelas APIs habilitadas."
                    : `Saldo: ${selectedApi?.balance ?? "indisponível"} ${selectedApi?.currency || ""}`}
                </small>
              </div>
            </div>
          ) : null}

          {((!canManageApis && !wallet?.costMode) || wallet?.principalPixTopup) ? (
            <details className="panel otp-pix-panel">
              <summary>
                <span><strong>Carteira e recarga PIX</strong><small>Saldo {wallet?.balanceLabel || "R$ 0,00"} · depósito mínimo {wallet?.minDepositLabel || "—"}</small></span>
                <b aria-hidden="true">+</b>
              </summary>
              <div className="otp-pix-panel-body">
                {wallet?.principalPixTopup ? <p className="field-help">Recarga da carteira ResolvFlow. Este PIX não adiciona saldo ao fornecedor nem altera o modo de compra atual.</p> : null}
                {wallet?.pixRequiresDocument ? (
                  <label className="otp-pix-document">
                    <span>CPF ou CNPJ do pagador</span>
                    <input disabled={pixBusy || pix.locked} value={pixDocument} onChange={(event) => setPixDocument(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="Somente números" maxLength={18} />
                    <small className="field-help">Exigido pela operadora para emitir a cobrança. Não é salvo no navegador.</small>
                  </label>
                ) : null}
                <div className="otp-pix-packs">
                  {pixPacks.map((amount) => (
                    <button type="button" className="outline-button" key={amount} disabled={!canOperate || !wallet?.pixEnabled || pixBusy || pix.locked || !wallet?.accountId || !wallet?.workspaceId} onClick={() => { setPixAmount(String(amount)); void createPix(amount); }}>
                      R$ {amount.toFixed(2).replace(".", ",")}
                    </button>
                  ))}
                </div>
                <div className="otp-credit-row">
                  <label><span>Outro valor (mínimo {wallet?.minDepositLabel || "—"})</span><input disabled={pixBusy || pix.locked} value={pixAmount} onChange={(event) => setPixAmount(event.target.value)} inputMode="decimal" /></label>
                  <button type="button" className="primary-button" disabled={!canOperate || !wallet?.pixEnabled || pixBusy || pix.locked || !wallet?.accountId || !wallet?.workspaceId} onClick={() => void createPix(Number(pixAmount.replace(",", ".")))}>
                    {pixBusy ? "Gerando…" : "Gerar PIX"}
                  </button>
                </div>
                {!wallet?.pixEnabled ? <small className="field-help">PIX ainda não está disponível. Avise o administrador.</small> : null}
                {pix.error ? <p role="alert">{pix.error}</p> : null}
                {pix.notice ? <p role="status">{pix.notice}</p> : null}
                {pix.intent?.paymentId && !pix.canStartNew ? <button type="button" className="outline-button" disabled={pixBusy} onClick={() => void pix.check()}>{pixBusy ? "Consultando…" : "Conferir este pagamento"}</button> : null}
                {pix.canStartNew ? <button type="button" className="outline-button" onClick={pix.newIntent}>Iniciar outra recarga</button> : null}
                {pixCharge?.qrCode && !pix.canStartNew ? (
                  <div className="otp-pix-box">
                    <strong>PIX {pixCharge.priceLabel}</strong>
                    <div className="otp-pix-pay">
                      {pixQrDataUrl ? <figure className="otp-pix-qr"><div className="otp-pix-qr-image" role="img" aria-label="QR Code PIX" style={{ backgroundImage: `url(${pixQrDataUrl})` }} /><figcaption>Aponte a câmera do celular</figcaption></figure> : null}
                      <div className="otp-pix-copy">
                        <textarea readOnly rows={4} value={pixCharge.qrCode} aria-label="Código PIX copia e cola" />
                        <div className="heading-actions">
                          <button type="button" className="primary-button" onClick={() => void copy(pixCharge.qrCode, "PIX")}>Copiar PIX</button>
                          {pixCharge.ticketUrl ? <a className="outline-button" href={pixCharge.ticketUrl} target="_blank" rel="noreferrer">Abrir no banco</a> : null}
                        </div>
                      </div>
                    </div>
                    <small>A validade depende do provedor. O saldo é liberado após a confirmação do pagamento.</small>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}

          <section
            className="panel otp-order otp-order-compact"
            id="otp-order-panel"
            tabIndex={-1}
            aria-labelledby="otp-order-title"
          >
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">Novo pedido</span>
                <h2 id="otp-order-title">
                  {canManageApis
                    ? selectedApiId === "all"
                      ? "Solicitar em todas"
                      : `Solicitar em ${selectedApi?.name || "API"}`
                    : "Solicitar Gmail"}
                </h2>
              </div>
            </div>
            <div className={`otp-order-controls ${stockEnabled ? "" : "otp-order-controls-without-stock"}`}>
              {stockEnabled ? <div className="otp-order-availability">
                <div className={`otp-order-stock ${stock?.available && Number(stock.total) > 0 ? "ready" : "waiting"}`} role="status" aria-live="polite" title="Estoque de reserva para Instagram em Gmail. O fornecedor atualiza os dados a cada 30–60 segundos.">
                  <i aria-hidden="true" />
                  <span>Estoque disponível na reserva</span>
                  <strong>{stock?.available && typeof stock.total === "number" ? stock.total.toLocaleString("pt-BR") : "—"}</strong>
                </div>
                <small>Atualiza a cada 45 s · {wallet?.costMode ? "custo do fornecedor" : "R$ 3,00 por Gmail"}</small>
              </div> : null}
              <div className="otp-qty-row">
                <label>
                  <span>
                    {canManageApis ? "Quantidade por API" : "Quantidade"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={13}
                    step={1}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        Math.min(
                          13,
                          Math.max(1, Math.round(Number(event.target.value) || 1)),
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canOperate || busy || !canRequestSelected || purchases.blocked || insufficientBalance}
                  onClick={() => void orderEmails()}
                >
                  {busy
                    ? "Processando…"
                    : canManageApis
                      ? selectedApiId === "all"
                        ? `Solicitar em ${enabledApis.length} API(s)`
                        : "Solicitar nesta API"
                      : "Solicitar Gmail"}
                </button>
              </div>
            </div>
            {canManageApis ? (
              <small className="field-help">
                A quantidade é aplicada por API. Uma falha não bloqueia as
                demais.
              </small>
            ) : <><div className="otp-order-total" aria-live="polite">{!wallet?.costMode ? <span>{quantity} Gmail(s) · <strong>{(orderTotal/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong></span> : null}{insufficientBalance ? <span>Saldo insuficiente. Recarregue a carteira ou reduza a quantidade.</span> : null}{wallet&&!wallet.configured ? <span>Serviço de Gmail indisponível no momento. Tente novamente em instantes.</span> : null}</div><small className="field-help">{wallet?.costMode ? "O fornecedor cobra somente os pedidos entregues diretamente no saldo da API correspondente." : wallet?.reliableOrders ? "O total fica reservado durante a solicitação. Você paga R$ 3,00 por Gmail entregue. Ao encerrar sem entrega confirmada, o crédito é devolvido automaticamente." : "O saldo é debitado somente pelos Gmails entregues. Pedidos que falharem são devolvidos automaticamente."}</small></>}
            {apiResults.length ? (
              <div
                className="otp-api-results otp-result-strip"
                aria-live="polite"
              >
                {apiResults.map((result) => (
                  <article className={result.state} key={result.apiId}>
                    <strong>
                      {canManageApis ? result.apiName : "Solicitação"}
                    </strong>
                    <span>{result.message}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section
            className="otp-live-monitor"
            aria-labelledby="otp-live-monitor-title"
          >
            <div className="otp-live-monitor-heading">
              <div>
                <span className="panel-kicker">{canManageApis ? "Em tempo real" : "Abertos · em tempo real"}</span>
                <h2 id="otp-live-monitor-title">Monitoramento ao vivo</h2>
                <p>
                  {openVisibleOrders.length} Gmail(s) aberto(s) nesta visão.
                </p>
              </div>
              <div className="otp-live-monitor-tools">
              {openVisibleOrders.some(canCancelSupplierOrder) ? (
                <button type="button" className="outline-button" disabled={busy} onClick={() => void cancelOrders(openVisibleOrders)}>
                  {wallet?.costMode ? `Cancelar ${openVisibleOrders.filter(canCancelSupplierOrder).length} sem código` : `Cancelar ${openVisibleOrders.filter(canCancelSupplierOrder).length} sem código e devolver`}
                </button>
              ) : null}
              {canManageApis ? (
                <div
                  className="otp-monitor-mode"
                  role="group"
                  aria-label="Modo de monitoramento"
                >
                  <button
                    type="button"
                    className={monitorMode === "gmail" ? "active" : ""}
                    aria-pressed={monitorMode === "gmail"}
                    onClick={() => changeMonitorMode("gmail")}
                  >
                    Por Gmail
                  </button>
                  <button
                    type="button"
                    className={monitorMode === "api" ? "active" : ""}
                    aria-pressed={monitorMode === "api"}
                    onClick={() => changeMonitorMode("api")}
                  >
                    Por API
                  </button>
                </div>
              ) : null}
              </div>
            </div>

            {openVisibleOrders.length ? (
              !canManageApis || monitorMode === "gmail" ? (
                <div className="otp-live-gmail-grid">
                  {openVisibleOrders.map((order) => (
                    <LiveGmailCard
                      key={inboxOrderKey(order)}
                      order={order}
                      selected={activeKey === inboxOrderKey(order)}
                      refreshing={refreshingScopes.includes(
                        `order:${inboxOrderKey(order)}`,
                      )}
                      onSelect={() => void selectOrder(order)}
                      onRefresh={() => void refreshOrder(order)}
                      onClose={() => void closeOrder(order)}
                      onCancel={canCancelSupplierOrder(order) ? () => void cancelOrders([order]) : undefined}
                      cancelLabel={supplierCancelLabel()}
                      cancelDisabled={busy}
                      onCopy={(value, label) => void copy(value, label)}
                      showOrigin={canManageApis}
                    />
                  ))}
                </div>
              ) : (
                <div className="otp-live-api-grid">
                  {openOrdersByApi.map((group) => (
                    <LiveApiCard
                      key={group.apiId}
                      group={group}
                      refreshing={refreshingScopes.includes(
                        `api:${group.apiId}`,
                      )}
                      selectedKey={activeKey}
                      onSelect={(order) => void selectOrder(order)}
                      onRefresh={() => void refreshApiGroup(group)}
                      onClose={(order) => void closeOrder(order)}
                      onCancel={(order) => void cancelOrders([order])}
                      cancelLabel={supplierCancelLabel()}
                      onCloseAll={() =>
                        group.api ? void closeApiOrders(group.api) : undefined
                      }
                      onCopy={(value, label) => void copy(value, label)}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="panel otp-live-empty">
                <strong>Nenhum Gmail aberto</strong>
                <span>
                  {canManageApis
                    ? "Faça um pedido ou escolha outra API para acompanhar novos códigos."
                    : "Faça um pedido para acompanhar seus códigos aqui."}
                </span>
              </div>
            )}
          </section>

          {codeResults.length ? (
            <div
              className="otp-api-results otp-code-results"
              aria-live="polite"
            >
              {codeResults.map((result) => (
                <article className={result.state} key={result.apiId}>
                  <strong>{canManageApis ? result.apiName : "Atualização"}</strong>
                  <span>{result.message}</span>
                </article>
              ))}
            </div>
          ) : null}
          {pages.open ? <button type="button" className="outline-button otp-load-more" disabled={Boolean(loadingPage)} onClick={()=>void loadMore("open")}>{loadingPage==="open" ? "Carregando…" : "Carregar Gmails abertos anteriores"}</button> : null}

          <section
            className="panel otp-history otp-history-compact"
            aria-labelledby="otp-history-title"
          >
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">{canManageApis ? "Caixa unificada" : "Acompanhamento encerrado"}</span>
                <h2 id="otp-history-title">{canManageApis ? "Pedidos recentes" : "Histórico / Encerrados"}</h2>
              </div>
              <div className="heading-actions">
                <span className="date-pill">
                  {historyPool.length} e-mail(s)
                </span>
                <button
                  type="button"
                  className="outline-button"
                  disabled={busy || !hasOpenOrders}
                  onClick={() => void refreshCodes()}
                >
                  Atualizar
                </button>
              </div>
            </div>
            <div className="otp-history-list otp-unified-list">
              {historyOrders.map((order) => (
                <article
                  className={order.closed ? "closed" : ""}
                  key={inboxOrderKey(order)}
                >
                  <button
                    type="button"
                    className="otp-order-main"
                    onClick={() => void selectOrder(order)}
                  >
                    {canManageApis ? <span className="otp-origin-badge">{order.supplierApiName}</span> : null}
                    <strong>{order.email}</strong>
            <small>
                      {order.closed
                        ? "Encerrado"
                        : order.codes[0]
                          ? `Código às ${new Date(order.codes[0].at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                          : "Aguardando código"}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="otp-copy-quick"
                    onClick={() =>
                      void copy(
                        order.codes[0]?.code || order.email,
                        order.codes[0] ? "Código" : "E-mail",
                      )
                    }
                  >
                    <b>{order.codes[0]?.code || "Copiar e-mail"}</b>
                    <span>
                      {order.codes[0]
                        ? "Copiar código"
                        : order.closed
                          ? "E-mail"
                          : "Aguardando"}
                    </span>
                  </button>
                  {order.closed && !canManageApis ? (
                    <button type="button" className="text-button danger otp-history-hide" disabled={busy} onClick={() => void changeHistoryVisibility(order, true)}>
                      Ocultar do histórico
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
            {!historyPool.length ? (
              <div className="empty-state">{canManageApis ? "Nenhum Gmail nesta visão." : "Nenhum acompanhamento encerrado."}</div>
            ) : null}
            {hiddenHistoryCount > 0 || historyExpanded ? (
              <button
                type="button"
                className="otp-history-toggle"
                aria-expanded={historyExpanded}
                onClick={() => setHistoryExpanded((value) => !value)}
              >
                {historyExpanded
                  ? "Recolher histórico"
                  : `Ver mais ${hiddenHistoryCount} pedido(s)`}
              </button>
            ) : null}
          </section>
          {pages.history ? <button type="button" className="outline-button otp-load-more" disabled={Boolean(loadingPage)} onClick={()=>void loadMore("history")}>{loadingPage==="history" ? "Carregando…" : "Carregar histórico anterior"}</button> : null}
          {!canManageApis ? (
            <section className="panel otp-history otp-history-compact otp-hidden-history" aria-labelledby="otp-hidden-title">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">Ocultação reversível</span>
                  <h2 id="otp-hidden-title">Ocultos</h2>
                </div>
                <button type="button" className="outline-button" aria-expanded={hiddenExpanded} onClick={() => setHiddenExpanded((value) => !value)}>
                  {hiddenExpanded ? "Recolher" : `Mostrar ${hiddenOrders.length}`}
                </button>
              </div>
              {hiddenExpanded && pages.hidden ? <button type="button" className="outline-button" disabled={Boolean(loadingPage)} onClick={()=>void loadMore("hidden")}>{loadingPage==="hidden" ? "Carregando…" : "Carregar ocultos anteriores"}</button> : null}
              {hiddenExpanded ? (
                hiddenOrders.length ? <div className="otp-hidden-list">{hiddenOrders.map((order) => (
                  <article key={inboxOrderKey(order)}>
                    <div><strong>{order.email}</strong><small>Oculto · acompanhamento encerrado</small></div>
                    <button type="button" className="outline-button" disabled={busy} onClick={() => void changeHistoryVisibility(order, false)}>Restaurar</button>
                  </article>
                ))}</div> : <div className="empty-state">Nenhum Gmail oculto.</div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {workspaceSection === "apis" && canManageApis ? (
        <section
          className="panel otp-api-manager otp-workspace-panel"
          id="otp-panel-apis"
          aria-labelledby="otp-tab-apis"
          role="tabpanel"
        >
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Ambientes independentes</span>
              <h2 id="otp-api-title">APIs de Gmail</h2>
              <p>
                Saldo, disponibilidade e pedidos abertos sem misturar as
                operações.
              </p>
            </div>
            <div className="heading-actions">
              <button
                type="button"
                className="outline-button"
                disabled={busy}
                onClick={() => void loadWallet()}
              >
                Atualizar saldos
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!canOperate || busy}
                onClick={() => setAdding((value) => !value)}
              >
                Adicionar API
              </button>
            </div>
          </div>
          {adding ? (
            <div className="otp-api-form">
              <label>
                <span>Nome da API</span>
                <input
                  value={apiName}
                  maxLength={60}
                  onChange={(event) => setApiName(event.target.value)}
                  placeholder="Ex.: Operação 2"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>Chave</span>
                <input
                  value={apiKey}
                  type="password"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Cole a chave uma única vez"
                  autoComplete="new-password"
                />
              </label>
              <div className="heading-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setAdding(false);
                    setApiKey("");
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || !apiName.trim() || !apiKey.trim()}
                  onClick={() => void addApi()}
                >
                  Salvar API
                </button>
              </div>
              <small className="field-help">
                A chave é criptografada e nunca volta para a tela.
              </small>
            </div>
          ) : null}
          <div className="otp-api-tabs" role="list" aria-label="APIs de Gmail">
            {apis.map((api) => (
              <article
                className={
                  selectedApiId === api.id
                    ? "otp-api-card selected"
                    : "otp-api-card"
                }
                key={api.id}
              >
                <button
                  type="button"
                  className="otp-api-select"
                  aria-pressed={selectedApiId === api.id}
                  onClick={() => {
                    setSelectedApiId(api.id);
                    setHistoryExpanded(false);
                    void loadInbox(api.id);
                  }}
                >
                  <span className={`otp-api-state ${api.state}`}>
                    {statusLabel(api)}
                  </span>
                  <strong>
                    {api.name}
                    {api.isPrimary ? " · principal" : ""}
                  </strong>
                  <b>
                    {api.balance !== undefined
                      ? `${api.balance} ${api.currency || ""}`
                      : "Saldo indisponível"}
                  </b>
                  <small>{api.openOrders} pedido(s) aberto(s)</small>
                </button>
                <div className="otp-api-card-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !canOperate}
                    onClick={() =>
                      void mutateApi({
                        action: "set_enabled",
                        apiId: api.id,
                        enabled: !api.enabled,
                      })
                    }
                  >
                    {api.enabled ? "Pausar" : "Habilitar"}
                  </button>
                  {api.openOrders > 0 ? (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !canOperate}
                      onClick={() => void closeApiOrders(api)}
                    >
                      Encerrar {api.openOrders}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-button danger"
                    title={
                      api.openOrders
                        ? "Excluir e encerrar os pedidos abertos"
                        : "Excluir API"
                    }
                    disabled={busy || !canOperate}
                    onClick={() => void deleteApi(api)}
                  >
                    {api.openOrders ? "Excluir mesmo assim" : "Excluir"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!apis.length ? (
            <div className="empty-state">
              Adicione a primeira API para começar a operação.
            </div>
          ) : null}
          {selectedApiId !== "all" ? (
            <button
              type="button"
              className="otp-use-selection"
              onClick={() => showOperation(true)}
            >
              Usar API selecionada na operação
            </button>
          ) : null}
        </section>
      ) : null}

      {workspaceSection === "apis" && wallet?.isPlatformAdmin && apis.length ? (
        <section className="panel otp-key-vault" aria-label="Chaves das APIs">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Acesso do superadmin</span>
              <h2>Chaves das APIs</h2>
              <p>
                Visualize somente quando necessário. Cada consulta fica
                registrada na auditoria.
              </p>
            </div>
          </div>
          <div className="otp-key-vault-list">
            {apis.map((api) => (
              <article key={api.id}>
                <span>
                  <strong>{api.name}</strong>
                  <small>{revealedApiKeys[api.id] || "Chave oculta"}</small>
                </span>
                <div className="heading-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void revealApiKey(api)}
                  >
                    {revealedApiKeys[api.id] ? "Ocultar" : "Ver chave"}
                  </button>
                  {revealedApiKeys[api.id] ? (
                    <button
                      type="button"
                      className="outline-button"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          revealedApiKeys[api.id],
                        )
                      }
                    >
                      Copiar
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
