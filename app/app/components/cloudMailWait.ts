export class MailWaitError extends Error {
  constructor(message: string, public code = 'unavailable', public status = 0, public retryAfterMs?: number) { super(message); }
}
export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : /^[A-Za-z]{3},/.test(value.trim()) ? (Date.parse(value) - now) / 1000 : NaN;
  return Number.isFinite(seconds) ? Math.max(1000, Math.ceil(seconds * 1000)) : undefined;
}
export type MailWaitPhase = 'idle' | 'baseline' | 'checking' | 'waiting' | 'backoff' | 'found' | 'cancelled' | 'expired' | 'error';
export type MailWaitState = { phase: MailWaitPhase; accountId: string | null; attempts: number; startedAt: number; deadlineAt: number; checkedAt: number | null; nextAt: number | null; message: string };
export const idleMailWait: MailWaitState = { phase: 'idle', accountId: null, attempts: 0, startedAt: 0, deadlineAt: 0, checkedAt: null, nextAt: null, message: '' };
export const mailWaitActive = (state: MailWaitState) => ['baseline', 'checking', 'waiting', 'backoff'].includes(state.phase);
type Detail = { account?: { id: string; source?: string }; messages: { id: string; code: string | null; receivedAt?: string; observedAt?: string }[] };
type Clock = { now(): number; set(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>; clear(timer: ReturnType<typeof setTimeout>): void };
const defaultClock: Clock = { now: Date.now, set: (fn, ms) => setTimeout(fn, ms), clear: timer => clearTimeout(timer) };

export function createCloudMailWait<T extends Detail>(options: {
  load(accountId: string, signal: AbortSignal): Promise<T>;
  refresh(accountId: string, signal: AbortSignal): Promise<T>;
  onData(accountId: string, data: T): void; onState(state: MailWaitState): void;
  clock?: Clock; durationMs?: number;
}) {
  const clock = options.clock ?? defaultClock;
  type Run = { state: MailWaitState; baseline: Set<string>; stopped: boolean; failures: number; controller?: AbortController; requestTimer?: ReturnType<typeof setTimeout>; deadlineTimer?: ReturnType<typeof setTimeout>; nextTimer?: ReturnType<typeof setTimeout> };
  let current: Run | null = null, inFlight = false, disposed = false;
  const active = (run: Run) => !disposed && current === run && !run.stopped;
  function emit(run: Run, patch: Partial<MailWaitState>) {
    run.state = { ...run.state, ...patch };
    if (!disposed && current === run) options.onState(run.state);
  }
  function stop(run: Run, phase: MailWaitPhase, message: string) {
    if (run.stopped) return;
    run.stopped = true;
    if (run.deadlineTimer !== undefined) clock.clear(run.deadlineTimer);
    if (run.nextTimer !== undefined) clock.clear(run.nextTimer);
    if (run.requestTimer !== undefined) clock.clear(run.requestTimer);
    run.controller?.abort();
    emit(run, { phase, message, nextAt: null });
  }
  function schedule(run: Run, milliseconds: number, backoff: boolean) {
    if (!active(run)) return;
    const nextAt = clock.now() + milliseconds;
    emit(run, { phase: backoff ? 'backoff' : 'waiting', nextAt, message: backoff ? 'Consulta pausada pelo serviço. A espera respeita o intervalo informado.' : 'Aguardando uma nova mensagem com código…' });
    if (nextAt >= run.state.deadlineAt) return; // Deadline timer ends visibly; never shorten Retry-After.
    run.nextTimer = clock.set(() => { run.nextTimer = undefined; void request(run, false); }, milliseconds);
  }
  async function request(run: Run, baseline: boolean) {
    if (!active(run) || inFlight) return;
    if (clock.now() >= run.state.deadlineAt) { stop(run, 'expired', 'A espera de dois minutos terminou. O histórico foi preservado.'); return; }
    inFlight = true;
    const controller = new AbortController(); run.controller = controller;
    const requestTimer = clock.set(() => stop(run, 'error', 'A consulta demorou além do limite. A espera foi interrompida; o servidor pode concluir a consulta em andamento. Não repita cliques.'), baseline ? 12_000 : 90_000);
    run.requestTimer = requestTimer;
    emit(run, { phase: baseline ? 'baseline' : 'checking', nextAt: null, attempts: run.state.attempts + (baseline ? 0 : 1), message: baseline ? 'Preparando o histórico salvo desta caixa…' : 'Consultando esta caixa. A próxima consulta começa após esta terminar.' });
    let delay: number | null = null, backoff = false;
    try {
      const data = await (baseline ? options.load(run.state.accountId!, controller.signal) : options.refresh(run.state.accountId!, controller.signal));
      if (!active(run) || controller.signal.aborted) return;
      if (data?.account?.id !== run.state.accountId || !Array.isArray(data.messages) || data.messages.some(message => !message || typeof message.id !== 'string' || !message.id) || new Set(data.messages.map(message => message.id)).size !== data.messages.length)
        throw new MailWaitError('Resposta inválida para esta caixa.', 'response_invalid');
      options.onData(run.state.accountId!, data);
      if (baseline) run.baseline = new Set(data.messages.map(message => message.id));
      else {
        emit(run, { checkedAt: clock.now() });
        const found = data.messages.some(message => !run.baseline.has(message.id) && typeof message.code === 'string' && /^\d{6}$/.test(message.code)
          && (data.account?.source === 'mixotp'
            ? typeof message.observedAt === 'string' && Date.parse(message.observedAt) >= run.state.startedAt
            : message.receivedAt === undefined || Date.parse(message.receivedAt) >= run.state.startedAt));
        if (found) { stop(run, 'found', data.account?.source === 'mixotp' ? 'Novo código observado no pedido. Confira validade no histórico.' : 'Nova mensagem com código recebida. Confira o código e sua validade no histórico.'); return; }
      }
      run.failures = 0; delay = baseline ? 0 : 1000;
    } catch (error) {
      if (!active(run) || controller.signal.aborted) return;
      const failure = error instanceof MailWaitError ? error : new MailWaitError('Não foi possível concluir a consulta.', 'network');
      if (baseline || ['auth', 'permission', 'identity', 'client', 'history_capacity', 'mail_not_found', 'mail_deleting', 'response_invalid', 'network', 'timeout'].includes(failure.code) || [401, 403].includes(failure.status)) {
        stop(run, 'error', failure.message); return;
      }
      run.failures++;
      if (run.failures > 3) { stop(run, 'error', 'O serviço continua indisponível. A espera foi interrompida e o histórico foi preservado.'); return; }
      delay = failure.retryAfterMs ?? (failure.code === 'mail_busy' ? 120_000 : failure.code === 'throttle' || failure.status === 429 ? 60_000 : Math.min(16_000, 1000 * 2 ** run.failures));
      backoff = true;
    } finally {
      clock.clear(requestTimer); inFlight = false;
      if (run.controller === controller) run.controller = undefined;
    }
    if (delay === 0 && active(run)) void request(run, false);
    else if (delay !== null && active(run)) schedule(run, delay, backoff);
  }
  return {
    start(accountId: string) {
      if (disposed || inFlight || current && !current.stopped) return false;
      const startedAt = clock.now(), duration = options.durationMs ?? 120_000;
      const run: Run = { baseline: new Set(), stopped: false, failures: 0, state: { ...idleMailWait, accountId, startedAt, deadlineAt: startedAt + duration } };
      current = run;
      run.deadlineTimer = clock.set(() => stop(run, 'expired', 'A espera de dois minutos terminou. O histórico foi preservado.'), duration);
      void request(run, true); return true;
    },
    cancel(message = 'Acompanhamento interrompido. Uma consulta já enviada pode terminar no servidor; nenhuma nova consulta será iniciada.') {
      if (current) stop(current, 'cancelled', message);
    },
    dispose() { disposed = true; if (current) stop(current, 'cancelled', ''); },
    get inFlight() { return inFlight; },
  };
}
