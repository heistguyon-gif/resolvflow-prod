import type { ProposalId, PlanPrice } from '../shared/planProposals';
// Local view-model aligned with RF-20261118-landing-pix-checkout-contract.md.
// There is no live transport or financial amount in this package.
export type DemoPlan = {
  id: string; proposalId: ProposalId; title: string; priceKind: PlanPrice['kind'];
  displayPrice: string; displayPeriod: string; amountCents: null; currency: 'BRL';
  commercialStatus: 'hypothesis'; canCharge: false;
};
export type PreviewCatalog = { mode: 'simulation'; version: string; checkoutEnabled: false; plans: DemoPlan[] };
export type MockScenario = 'pending' | 'paid' | 'expired' | 'error' | 'uncertain' | 'status-error';
export type CheckoutPreview = {
  mode: 'simulation'; purpose: 'saas_plan'; provider: 'leztypay';
  simulationId: string; planId: string;
  status: 'simulated_pending' | 'simulated_paid' | 'simulated_expired';
  isPayable: false; copyPaste: null; qrData: null; expiresAt: null;
  fulfillment: 'not_started';
};
export type MockReceipt = CheckoutPreview & {
  requestId: string; reference: string;
  // UI-only clock, explicitly illustrative; NOT a provider expiration.
  demoDeadline: number;
};
export type CheckoutIntent = { requestId: string; planId: string };
export type CheckoutTransport = {
  mode: 'simulation';
  create: (intent: CheckoutIntent, signal: AbortSignal) => Promise<MockReceipt>;
  status: (intent: CheckoutIntent, signal: AbortSignal) => Promise<MockReceipt>;
};
