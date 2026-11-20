import { PLAN_PROPOSALS } from '../shared/planProposals';
import type { PreviewCatalog, CheckoutIntent, CheckoutTransport, MockReceipt, MockScenario } from './types';

export const previewCatalog: PreviewCatalog = {
  mode: 'simulation', version: 'landing-hypotheses-20261118', checkoutEnabled: false,
  plans: PLAN_PROPOSALS.flatMap(proposal => proposal.plans.map(plan => ({
    id: plan.id, proposalId: proposal.id, title: plan.title, priceKind: plan.price.kind,
    displayPrice: plan.price.fullLabel, displayPeriod: plan.price.period,
    amountCents: null, currency: 'BRL' as const, commercialStatus: 'hypothesis' as const, canCharge: false as const,
  }))),
};

export class MockCheckoutError extends Error {
  constructor(public readonly kind: 'not-created' | 'uncertain' | 'unavailable') {
    super(kind);
  }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// No fetch, storage, provider credentials, monetary amounts or buyer fields.
// Repeated calls for the same intent return the same local receipt.
export function createCheckoutMock(scenario: MockScenario = 'pending', latencyMs = 650): CheckoutTransport {
  const receipts = new Map<string, MockReceipt>();
  function receiptFor(intent: CheckoutIntent) {
    if (!intent.requestId.startsWith('demo-') || !previewCatalog.plans.some(plan => plan.id === intent.planId)) throw new MockCheckoutError('not-created');
    const existing = receipts.get(intent.requestId);
    if (existing) {
      if (existing.planId !== intent.planId) throw new MockCheckoutError('unavailable');
      return existing;
    }
    const receipt: MockReceipt = {
      mode: 'simulation', purpose: 'saas_plan', provider: 'leztypay', ...intent,
      simulationId: intent.requestId, reference: intent.requestId,
      status: 'simulated_pending', isPayable: false, copyPaste: null, qrData: null, expiresAt: null, fulfillment: 'not_started',
      demoDeadline: Date.now() + (scenario === 'expired' ? 3000 : 15 * 60_000),
    };
    receipts.set(intent.requestId, receipt);
    return receipt;
  }
  return {
    mode: 'simulation',
    async create(intent, signal) {
      await wait(latencyMs, signal);
      if (scenario === 'error') throw new MockCheckoutError('not-created');
      const receipt = receiptFor(intent);
      if (scenario === 'uncertain') throw new MockCheckoutError('uncertain');
      return { ...receipt };
    },
    async status(intent, signal) {
      await wait(latencyMs, signal);
      if (scenario === 'status-error') throw new MockCheckoutError('unavailable');
      const receipt = receipts.get(intent.requestId);
      if (!receipt || receipt.planId !== intent.planId) throw new MockCheckoutError('unavailable');
      if (receipt.status !== 'simulated_paid') receipt.status = Date.now() >= receipt.demoDeadline ? 'simulated_expired' : scenario === 'paid' ? 'simulated_paid' : 'simulated_pending';
      return { ...receipt };
    },
  };
}
