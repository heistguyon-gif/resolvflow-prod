"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  order_id: string;
  email: string;
  status: string;
  codes: Array<{ code: string; at: string }>;
  closed: boolean;
  savedAt: string;
  supplierApiId: string | null;
  supplierApiName: string;
};

type WalletPayload = {
  usesSupplier?: boolean;
  isPlatformAdmin?: boolean;
  canManageApis?: boolean;
  apis?: ApiCard[];
  priceCents?: number;
  pricePriorityCents?: number;
  priceRushCents?: number;
  minDepositCents?: number;
  priceLabel?: string;
  pricePriorityLabel?: string;
  priceRushLabel?: string;
  balanceLabel?: string;
  gmailsLeft?: number;
};

type ApiResult = {
  apiId: string;
  apiName: string;
  state: string;
  message: string;
  ordered: number;
  requested: number;
};
type MonitorMode = "gmail" | "api";
type ApiOrderGroup = {
  apiId: string;
  apiName: string;
  api: ApiCard | null;
  orders: InboxOrder[];
};

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      String(payload.error || "Não foi possível concluir a operação."),
    );
  return payload;
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
  return `${order.supplierApiId || "legacy"}:${order.order_id}`;
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
  onCopy,
}: {
  order: InboxOrder;
  selected: boolean;
  refreshing: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onClose: () => void;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <article className={`otp-live-order-card ${selected ? "selected" : ""}`}>
      <header>
        <div>
          <span className="otp-origin-badge">{order.supplierApiName}</span>
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
  onCloseAll,
  onCopy,
}: {
  group: ApiOrderGroup;
  refreshing: boolean;
  selectedKey: string;
  onSelect: (order: InboxOrder) => void;
  onRefresh: () => void;
  onClose: (order: InboxOrder) => void;
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
  fallback,
}: {
  canOperate: boolean;
  fallback: ReactNode;
}) {
  const [wallet, setWallet] = useState<WalletPayload | null>(null);
  const [workspaceSection, setWorkspaceSection] = useState<
    "operation" | "apis" | "settings"
  >("operation");
  const [selectedApiId, setSelectedApiId] = useState("all");
  const [orders, setOrders] = useState<InboxOrder[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [monitorMode, setMonitorMode] = useState<MonitorMode>("gmail");
  const [refreshingScopes, setRefreshingScopes] = useState<string[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [priorityMode, setPriorityMode] = useState(0);
  const [apiName, setApiName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [apiResults, setApiResults] = useState<ApiResult[]>([]);
  const [codeResults, setCodeResults] = useState<
    Array<{ apiId: string; apiName: string; state: string; message: string }>
  >([]);
  const [priceNormal, setPriceNormal] = useState("2,00");
  const [pricePriority, setPricePriority] = useState("2,50");
  const [priceRush, setPriceRush] = useState("3,00");
  const [minDeposit, setMinDeposit] = useState("20,00");
  const [platformSupplierKey, setPlatformSupplierKey] = useState("");
  const [manualCredit, setManualCredit] = useState("");
  const [revealedApiKeys, setRevealedApiKeys] = useState<
    Record<string, string>
  >({});

  const apis = useMemo(() => wallet?.apis || [], [wallet?.apis]);
  const selectedApi = apis.find((api) => api.id === selectedApiId) || null;
  const hasOpenOrders = orders.some((order) => !order.closed);
  const enabledApis = apis.filter((api) => api.enabled);
  const totalOpenOrders = apis.reduce(
    (total, api) => total + api.openOrders,
    0,
  );
  const canRequestSelected =
    selectedApiId === "all"
      ? enabledApis.length > 0
      : Boolean(selectedApi?.enabled);
  const canManageApis = Boolean(wallet?.canManageApis);

  const loadInbox = useCallback(async (apiId: string) => {
    const inbox = await jsonRequest(
      `/api/otp/inbox?apiId=${encodeURIComponent(apiId)}`,
    );
    const next = Array.isArray(inbox.orders)
      ? (inbox.orders as InboxOrder[])
      : [];
    setOrders(next);
    const preferred =
      next.find(
        (order) =>
          order.order_id === inbox.activeId &&
          (!inbox.activeSupplierApiId ||
            order.supplierApiId === inbox.activeSupplierApiId),
      ) || next[0];
    setActiveKey(
      preferred
        ? `${preferred.supplierApiId || "legacy"}:${preferred.order_id}`
        : "",
    );
  }, []);

  const loadWallet = useCallback(async () => {
    const next = await jsonRequest("/api/otp/wallet");
    setWallet(next);
    if (next.priceCents)
      setPriceNormal((next.priceCents / 100).toFixed(2).replace(".", ","));
    if (next.pricePriorityCents)
      setPricePriority(
        (next.pricePriorityCents / 100).toFixed(2).replace(".", ","),
      );
    if (next.priceRushCents)
      setPriceRush((next.priceRushCents / 100).toFixed(2).replace(".", ","));
    if (next.minDepositCents)
      setMinDeposit((next.minDepositCents / 100).toFixed(2).replace(".", ","));
    return next as WalletPayload;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const hashSection = window.location.hash.replace(/^#/, "");
      const requestedSection =
        hashSection ||
        new URLSearchParams(window.location.search).get("otpSection");
      if (
        requestedSection === "operation" ||
        requestedSection === "apis" ||
        requestedSection === "settings"
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
        section === "apis" ||
        section === "settings"
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
      if (!wallet?.usesSupplier) return;
      if (!silent) setBusy(true);
      try {
        const payload = await jsonRequest("/api/otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "codes", apiId: selectedApiId }),
        });
        const next = Array.isArray(payload.inbox?.orders)
          ? (payload.inbox.orders as InboxOrder[])
          : [];
        setOrders(next);
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
        if (ready.length && !silent)
          setMessage(`${ready.length} código(s) atualizado(s).`);
      } catch (cause) {
        if (!silent)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível atualizar os códigos.",
          );
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [selectedApiId, wallet?.usesSupplier],
  );

  useEffect(() => {
    if (!wallet?.usesSupplier || !hasOpenOrders) return;
    const timer = window.setInterval(() => void refreshCodes(true), 8_000);
    return () => window.clearInterval(timer);
  }, [hasOpenOrders, refreshCodes, wallet?.usesSupplier]);

  const visibleOrders = useMemo(
    () =>
      selectedApiId === "all"
        ? orders
        : orders.filter((order) => order.supplierApiId === selectedApiId),
    [orders, selectedApiId],
  );
  const openVisibleOrders = useMemo(
    () =>
      visibleOrders
        .filter((order) => !order.closed)
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
      visibleOrders.filter(
        (order) =>
          `${order.supplierApiId || "legacy"}:${order.order_id}` !== activeKey,
      ),
    [activeKey, visibleOrders],
  );
  const historyOrders = useMemo(
    () => (historyExpanded ? historyPool : historyPool.slice(0, 6)),
    [historyExpanded, historyPool],
  );
  const hiddenHistoryCount = Math.max(0, historyPool.length - 6);

  if (wallet && !wallet.usesSupplier) return <>{fallback}</>;

  async function mutateApi(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await jsonRequest("/api/otp/wallet", {
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

  async function closeOrder(order: InboxOrder) {
    if (
      !window.confirm(
        `Encerrar o Gmail ${order.email}? Ele continuará no histórico, mas não receberá novos códigos.`,
      )
    )
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
          orderId: order.order_id,
          supplierApiId: order.supplierApiId,
        }),
      });
      await Promise.all([loadWallet(), loadInbox(selectedApiId)]);
      setMessage(`Gmail ${order.email} encerrado. O histórico foi preservado.`);
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
    setBusy(true);
    setError("");
    setMessage("");
    setApiResults([]);
    try {
      const payload = await jsonRequest("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "order",
          apiId: selectedApiId,
          allApis: selectedApiId === "all",
          quantity,
          priorityMode,
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
      );
      setMessage(
        successful
          ? canManageApis
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
      setBusy(false);
    }
  }

  async function selectOrder(order: InboxOrder) {
    setActiveKey(`${order.supplierApiId || "legacy"}:${order.order_id}`);
    await jsonRequest("/api/otp/inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "select",
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
      const payload = await jsonRequest("/api/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "code",
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
      const payload = await jsonRequest("/api/otp", {
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
      if (group.apiId === "legacy") setOrders(next);
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

  async function savePlatformSettings() {
    setBusy(true);
    setError("");
    try {
      await jsonRequest("/api/otp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          priceReais: priceNormal,
          pricePriorityReais: pricePriority,
          priceRushReais: priceRush,
          minDepositReais: minDeposit,
          supplierKey: platformSupplierKey.trim() || undefined,
        }),
      });
      setPlatformSupplierKey("");
      setPixToken("");
      setMessage("Configurações da plataforma atualizadas.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addManualCredit() {
    const amountCents = Math.round(
      Number(manualCredit.replace(",", ".")) * 100,
    );
    if (!Number.isFinite(amountCents) || amountCents < 100)
      return setError("Informe um crédito em reais.");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await jsonRequest("/api/otp/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "credit", amountCents }),
      });
      setManualCredit("");
      await loadWallet();
      setMessage(
        `Crédito adicionado. Saldo ${next.balanceLabel || "atualizado"}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível adicionar o crédito.",
      );
    } finally {
      setBusy(false);
    }
  }

  function selectWorkspaceSection(section: "operation" | "apis" | "settings") {
    if (section !== "operation" && !canManageApis) return;
    setWorkspaceSection(section);
    const url = new URL(window.location.href);
    url.hash = section;
    window.history.replaceState(null, "", url);
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
    <div className="content otp-page otp-multi-page">
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
              <span><b>{wallet?.balanceLabel || "R$ 0,00"}</b> saldo disponível</span>
              <span><b>{wallet?.priceLabel || "—"}</b> por Gmail normal</span>
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
            disabled={!canOperate || busy || !canRequestSelected}
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
          aria-selected={workspaceSection === "operation"}
          className={workspaceSection === "operation" ? "active" : ""}
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
        {wallet?.isPlatformAdmin ? (
          <button
            type="button"
            id="otp-tab-settings"
            role="tab"
            aria-controls="otp-panel-settings"
            aria-selected={workspaceSection === "settings"}
            className={workspaceSection === "settings" ? "active" : ""}
            onClick={() => selectWorkspaceSection("settings")}
          >
            <span>03</span>Configurações
          </button>
        ) : null}
      </div>

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

      {workspaceSection === "operation" || !canManageApis ? (
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
            <div className="otp-order-controls">
              <div className="otp-priority">
                <span>Prioridade</span>
                <div>
                  {[
                    { mode: 0, label: "Normal", price: wallet?.priceLabel },
                    { mode: 1, label: "30s antes", price: wallet?.pricePriorityLabel },
                    { mode: 2, label: "Na hora", price: wallet?.priceRushLabel },
                  ].map((option) => (
                    <button
                      type="button"
                      key={option.mode}
                      className={
                        priorityMode === option.mode
                          ? "primary-button"
                          : "outline-button"
                      }
                      onClick={() => setPriorityMode(option.mode)}
                      disabled={busy}
                    >
                      <b>{option.label}</b>
                      {!canManageApis ? <small>{option.price || "—"}</small> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="otp-qty-row">
                <label>
                  <span>
                    {canManageApis ? "Quantidade por API" : "Quantidade"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={13}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        Math.min(
                          13,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canOperate || busy || !canRequestSelected}
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
            ) : <small className="field-help">O saldo é debitado somente pelos Gmails entregues. Pedidos que falharem são devolvidos automaticamente.</small>}
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
                <span className="panel-kicker">Em tempo real</span>
                <h2 id="otp-live-monitor-title">Monitoramento ao vivo</h2>
                <p>
                  {openVisibleOrders.length} Gmail(s) aberto(s) nesta visão.
                </p>
              </div>
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
                      onCopy={(value, label) => void copy(value, label)}
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
                  Faça um pedido ou escolha outra API para acompanhar novos
                  códigos.
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

          <section
            className="panel otp-history otp-history-compact"
            aria-labelledby="otp-history-title"
          >
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">Caixa unificada</span>
                <h2 id="otp-history-title">Pedidos recentes</h2>
              </div>
              <div className="heading-actions">
                <span className="date-pill">
                  {visibleOrders.length} e-mail(s)
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
                  key={`${order.supplierApiId || "legacy"}:${order.order_id}`}
                >
                  <button
                    type="button"
                    className="otp-order-main"
                    onClick={() => void selectOrder(order)}
                  >
                    <span className="otp-origin-badge">
                      {order.supplierApiName}
                    </span>
                    <strong>{order.email}</strong>
                    <small>
                      {order.closed
                        ? "Fechado"
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
                </article>
              ))}
            </div>
            {!visibleOrders.length ? (
              <div className="empty-state">Nenhum Gmail nesta visão.</div>
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

      {workspaceSection === "settings" && wallet?.isPlatformAdmin ? (
        <section
          className="otp-workspace-panel"
          id="otp-panel-settings"
          role="tabpanel"
          aria-labelledby="otp-tab-settings"
        >
          <div className="otp-admin-intro">
            <span className="panel-kicker">Acesso administrativo</span>
            <h2>Configurações da plataforma</h2>
            <p>
              Preços, fornecedor global, PIX e crédito manual. Estes controles
              não aparecem para usuários comuns.
            </p>
          </div>
          <details className="panel otp-platform-settings">
            <summary>
              <span>
                <strong>Abrir configurações administrativas</strong>
                <small>
                  Recolhidas por segurança. Alterações afetam o serviço de Gmail
                  OTP.
                </small>
              </span>
              <b aria-hidden="true">+</b>
            </summary>
            <div className="otp-settings-body">
              <div className="otp-price-grid">
                <label>
                  <span>Normal (R$)</span>
                  <input
                    value={priceNormal}
                    inputMode="decimal"
                    onChange={(event) => setPriceNormal(event.target.value)}
                  />
                </label>
                <label>
                  <span>30s (R$)</span>
                  <input
                    value={pricePriority}
                    inputMode="decimal"
                    onChange={(event) => setPricePriority(event.target.value)}
                  />
                </label>
                <label>
                  <span>Na hora (R$)</span>
                  <input
                    value={priceRush}
                    inputMode="decimal"
                    onChange={(event) => setPriceRush(event.target.value)}
                  />
                </label>
                <label>
                  <span>PIX mínimo (R$)</span>
                  <input
                    value={minDeposit}
                    inputMode="decimal"
                    onChange={(event) => setMinDeposit(event.target.value)}
                  />
                </label>
                <label className="otp-wide-field">
                  <span>Chave global do fornecedor · opcional</span>
                  <input
                    type="password"
                    value={platformSupplierKey}
                    onChange={(event) =>
                      setPlatformSupplierKey(event.target.value)
                    }
                    autoComplete="new-password"
                    placeholder="Deixe vazio para manter a atual"
                  />
                </label>
              </div>
              <small className="field-help">
                A chave PIX da Lezty Pay fica somente nos segredos do Worker e
                não é exibida nesta tela.
              </small>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void savePlatformSettings()}
              >
                Salvar configurações
              </button>
              <div className="otp-admin-divider" />
              <div className="otp-credit-admin">
                <div>
                  <strong>Crédito manual</strong>
                  <small>Adiciona saldo à carteira desta operação.</small>
                </div>
                <label>
                  <span>Valor em reais</span>
                  <input
                    value={manualCredit}
                    inputMode="decimal"
                    placeholder="0,00"
                    onChange={(event) => setManualCredit(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="outline-button"
                  disabled={busy || !manualCredit.trim()}
                  onClick={() => void addManualCredit()}
                >
                  Adicionar saldo
                </button>
              </div>
            </div>
          </details>
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
