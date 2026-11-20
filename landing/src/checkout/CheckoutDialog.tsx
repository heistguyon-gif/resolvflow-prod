import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ProposedPlan } from '../shared/planProposals';
import { createCheckoutMock, MockCheckoutError } from './checkoutMock';
import type { CheckoutTransport, MockReceipt, MockScenario } from './types';

type Stage = 'form' | 'creating' | 'waiting' | 'checking' | 'error' | 'uncertain' | 'paid' | 'expired';
type Props = {
  plan: ProposedPlan;
  proposalTitle: string;
  onClose: () => void;
  returnFocus: HTMLElement | null;
  transport?: CheckoutTransport;
};

const scenarioLabels: Record<MockScenario, string> = {
  pending: 'Aguardar pagamento', paid: 'Confirmar ao consultar', expired: 'Expirar em 3 segundos',
  error: 'Falha ao preparar', uncertain: 'Resultado incerto ao preparar', 'status-error': 'Falha ao consultar status',
};

function QrIllustration() {
  return <div className="checkout-qr" role="img" aria-label="Ilustração de QR, sem dados de pagamento e não escaneável">
    <svg viewBox="0 0 160 160" aria-hidden="true"><g fill="currentColor"><path d="M8 8h42v42H8zm8 8v26h26V16zm94-8h42v42h-42zm8 8v26h26V16zM8 110h42v42H8zm8 8v26h26v-26z" fillRule="evenodd"/><path d="M23 23h12v12H23zm102 0h12v12h-12zM23 125h12v12H23zM62 10h12v18H62zm23 5h11v31H85zM58 38h13v13H58zm61 77h16v12h-16zm-9 24h13v13h-13zm30-7h12v20h-12zM60 118h15v28H60zm27 4h10v16H87z"/></g></svg>
    <span>PRÉVIA<span>Não pagável</span></span>
  </div>;
}

export function CheckoutDialog({ plan, proposalTitle, onClose, returnFocus, transport: injectedTransport }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [requestId] = useState(() => `demo-${crypto.randomUUID()}`);
  const [scenario, setScenario] = useState<MockScenario>('pending');
  const transport = useMemo(() => injectedTransport ?? createCheckoutMock(scenario), [injectedTransport, scenario]);
  const [stage, setStage] = useState<Stage>('form');
  const [receipt, setReceipt] = useState<MockReceipt | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [copyMessage, setCopyMessage] = useState('');
  const [notice, setNotice] = useState('');
  const expired = receipt !== null && receipt.status !== 'simulated_paid' && clock >= receipt.demoDeadline;
  const shownStage = stage !== 'paid' && expired ? 'expired' : stage;
  const isBusy = stage === 'creating' || stage === 'checking';
  const canCopy = receipt !== null && shownStage === 'waiting';

  useEffect(() => {
    active.current = true;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    nameInput.current?.focus();
    return () => {
      active.current = false;
      controller.current?.abort();
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  useEffect(() => {
    if (!receipt || stage === 'paid') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [receipt, stage]);

  useEffect(() => { if (shownStage !== 'form') title.current?.focus(); }, [shownStage]);

  function close() {
    active.current = false;
    generation.current++;
    controller.current?.abort();
    onClose();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
    const first = elements[0], last = elements.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === title.current)) { event.preventDefault(); first.focus(); }
  }

  async function perform(kind: 'create' | 'status') {
    if (busy.current || !active.current || transport.mode !== 'simulation') return;
    busy.current = true;
    const current = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setStage(kind === 'create' ? 'creating' : 'checking');
    setNotice(''); setCopyMessage('');
    try {
      // Only synthetic IDs cross this local boundary. Buyer fixtures never do.
      const result = await transport[kind]({ requestId, planId: plan.id }, abort.signal);
      if (!active.current || abort.signal.aborted || generation.current !== current) return;
      if (result.mode !== 'simulation' || result.purpose !== 'saas_plan' || result.provider !== 'leztypay' || result.isPayable !== false || result.fulfillment !== 'not_started' || result.copyPaste !== null || result.qrData !== null || result.expiresAt !== null || result.simulationId !== requestId || result.requestId !== requestId || result.planId !== plan.id || !Number.isFinite(result.demoDeadline) || !['simulated_pending', 'simulated_paid', 'simulated_expired'].includes(result.status)) throw new MockCheckoutError('unavailable');
      setReceipt(result); setClock(Date.now());
      setStage(result.status === 'simulated_paid' ? 'paid' : result.status === 'simulated_expired' ? 'expired' : 'waiting');
      if (kind === 'status' && result.status === 'simulated_pending') setNotice('Consulta simulada concluída. O exemplo continua aguardando pagamento.');
    } catch (error) {
      if (!active.current || abort.signal.aborted || generation.current !== current) return;
      setStage(error instanceof MockCheckoutError && error.kind === 'not-created' ? 'error' : 'uncertain');
    } finally {
      if (generation.current === current) { busy.current = false; controller.current = null; }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform('create');
  }

  async function copy() {
    if (!receipt || !canCopy || Date.now() >= receipt.demoDeadline) { setClock(Date.now()); return; }
    const current = generation.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(receipt.reference);
      if (active.current && current === generation.current) setCopyMessage('Referência da demo copiada. Não é um código Pix.');
    } catch {
      if (active.current && current === generation.current) setCopyMessage('Cópia indisponível neste navegador. Selecione a referência abaixo.');
    }
  }

  const titles: Record<Stage, string> = { form: 'Simule sua compra.', creating: 'Preparando o exemplo…', waiting: 'Seu Pix de demonstração.', checking: 'Consultando o exemplo…', error: 'Não foi possível preparar.', uncertain: 'Resultado ainda não confirmado.', paid: 'Pagamento simulado confirmado.', expired: 'Este exemplo expirou.' };
  const remaining = receipt ? Math.max(0, Math.ceil((receipt.demoDeadline - clock) / 1000)) : 0;
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return createPortal(<dialog ref={dialog} className="checkout-dialog" aria-labelledby="checkout-title" aria-describedby="checkout-simulation" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={trapFocus}>
    <div className="checkout-bar"><span><i aria-hidden="true" />Ambiente de simulação</span><button type="button" className="checkout-close" onClick={close} aria-label="Fechar simulação de compra">×</button></div>
    <div className="checkout-layout">
      <aside className="checkout-summary" aria-label="Resumo da proposta selecionada">
        <span className="eyebrow">Sua proposta em avaliação</span><p className="checkout-family">{proposalTitle}</p><h2>{plan.title}</h2>
        <p className="checkout-price">{plan.price.fullLabel}</p>
        {plan.price.equivalent && <p className="checkout-equivalence">{plan.price.equivalent} Equivalência, não parcelamento.</p>}
        <dl><div><dt>Perfis ativos · hipótese</dt><dd>{plan.profiles}</dd></div><div><dt>Escopo proposto</dt><dd>1 operador · 1 workspace</dd></div><div><dt>Pagamento previsto</dt><dd>Pix</dd></div></dl>
        <p>{plan.condition}</p><details><summary>O que esta prévia não faz</summary><p>Não cobra, cria conta, reserva plano ou libera acesso. Gmail/OTP e Resolvbot não estão incluídos. Preços e condições continuam em validação.</p></details>
      </aside>
      <div className="checkout-main" aria-busy={isBusy}>
        <p className="checkout-step">{shownStage === 'form' ? '01 / Dados de exemplo' : '02 / Pagamento simulado'}</p>
        <h2 id="checkout-title" tabIndex={-1} ref={title}>{titles[shownStage]}</h2>
        <p id="checkout-simulation" className="checkout-disclosure">Prévia local. Nenhuma cobrança ou envio de dados. Dados fictícios fixos, sem coleta de informações.</p>
        {stage === 'form' && <form onSubmit={submit} className="checkout-form" autoComplete="off">
          <label htmlFor="checkout-name">Nome<input ref={nameInput} id="checkout-name" name="example-name" readOnly value="Pessoa Exemplo" /></label>
          <label htmlFor="checkout-user">Usuário desejado<input id="checkout-user" name="example-user" readOnly autoCapitalize="none" spellCheck={false} value="operador.exemplo" /><small>Somente para visualizar o formulário; não reserva um usuário.</small></label>
          <label htmlFor="checkout-email">E-mail de exemplo<input id="checkout-email" name="example-email" type="email" readOnly autoCapitalize="none" spellCheck={false} value="pessoa@exemplo.invalid" /></label>
          <label htmlFor="checkout-document">CPF ou CNPJ · estrutura futura<input id="checkout-document" name="example-document" disabled placeholder="Documento não coletado nesta prévia" /><small>Exigido no checkout real pelo provedor. Nenhum documento é usado nesta simulação.</small></label>
          {!injectedTransport && <details className="checkout-scenarios"><summary>Cenário de demonstração</summary><label htmlFor="checkout-scenario">Resultado para revisar<select id="checkout-scenario" value={scenario} onChange={event => setScenario(event.target.value as MockScenario)}>{Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p>Altera apenas esta simulação. Não consulta um gateway.</p></details>}
          <button type="submit" className="button button-orange checkout-primary">Continuar com simulação <span aria-hidden="true">↗</span></button>
          <p className="checkout-helper">Dados de exemplo não editáveis para revisar a estrutura. Nada será salvo, enviado ou cadastrado.</p>
        </form>}
        {(shownStage === 'creating' || shownStage === 'checking') && <div className="checkout-loading" role="status"><span className="checkout-spinner" aria-hidden="true" /><p>{shownStage === 'creating' ? 'Montando a apresentação do pagamento.' : 'Verificando o mesmo exemplo, sem gerar outro.'}<small>Simulação local · sem conexão com o processador de pagamento.</small></p></div>}
        {receipt && shownStage === 'waiting' && <div className="checkout-payment">
          <div className="checkout-payment-top"><span className="checkout-status">Aguardando · simulado</span><span className="checkout-countdown" aria-label={`Prazo ilustrativo: ${Math.floor(remaining / 60)} minutos e ${remaining % 60} segundos`}>{countdown}</span></div>
          <QrIllustration />
          <p className="checkout-qr-caption">QR ilustrativo e prazo de demonstração. Não pagável.</p>
          <label className="checkout-copy-label" htmlFor="checkout-copy">Referência de demonstração<input id="checkout-copy" readOnly value={receipt.reference} onFocus={event => event.target.select()} /></label>
          <button type="button" className="button button-quiet checkout-primary" disabled>Copiar Pix indisponível na prévia</button>
          <button type="button" className="button button-orange checkout-primary" onClick={() => void copy()}>Copiar referência da demo <span aria-hidden="true">⧉</span></button>
          <button type="button" className="button button-quiet checkout-primary" onClick={() => void perform('status')}>Consultar status simulado</button>
          <p className="checkout-helper">A cópia não confirma pagamento. A consulta usa o mesmo identificador local.</p>
        </div>}
        {shownStage === 'error' && <div className="checkout-feedback" role="alert"><span className="checkout-state-icon" aria-hidden="true">!</span><p>Falha simulada antes de criar o exemplo. Nenhum pagamento foi gerado.</p><button type="button" className="button button-quiet" onClick={() => void perform('create')}>Tentar o mesmo exemplo</button></div>}
        {shownStage === 'uncertain' && <div className="checkout-feedback" role="alert"><span className="checkout-state-icon" aria-hidden="true">?</span><p>A simulação não confirmou o resultado. Consulte o mesmo identificador; não será criada outra tentativa automaticamente.</p><button type="button" className="button button-quiet" onClick={() => void perform('status')}>Consultar o mesmo exemplo</button></div>}
        {shownStage === 'paid' && <div className="checkout-feedback checkout-success" role="status"><span className="checkout-state-icon" aria-hidden="true">✓</span><p>Você chegou ao final do fluxo de demonstração.</p><p><strong>Nenhum valor foi pago e nenhum acesso foi liberado.</strong> A entrega de um plano real ainda depende de implementação e condições aprovadas.</p><button type="button" className="button button-orange" onClick={close}>Voltar às propostas</button></div>}
        {shownStage === 'expired' && <div className="checkout-feedback" role="status"><span className="checkout-state-icon" aria-hidden="true">◷</span><p>O prazo do exemplo terminou. O QR ilustrativo e a cópia foram desativados.</p><p>Nenhuma nova tentativa é criada automaticamente.</p><button type="button" className="button button-quiet" onClick={close}>Voltar às propostas</button></div>}
        <div className="checkout-announcements" role="status" aria-live="polite">{notice && <p>{notice}</p>}{copyMessage && <p>{copyMessage}</p>}</div>
        {receipt && <p className="checkout-reference">Referência local: <code>{receipt.reference}</code></p>}
      </div>
    </div>
    <div className="checkout-bottom">Estrutura em avaliação · pagamento via Pix · sem conexão de pagamento</div>
  </dialog>, document.body);
}
