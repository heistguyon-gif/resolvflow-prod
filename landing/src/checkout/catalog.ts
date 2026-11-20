export const CATALOG_VERSION = 'landing3-2026-11-18-v1';
export const TERMS_VERSION = 'landing3-manual-single-v1';
export const PILOT_ACK_VERSION = 'landing3-private-pix-test-v1';
export const PILOT_EMAIL = 'lucasbgn.affiliate@gmail.com';
export const PILOT_PATH = '/planos-piloto';
export const PILOT_ACK = 'Entendo que este teste privado gera uma cobrança Pix real. Vou usar meus próprios dados. Não há renovação nem liberação automática.';
export const FIXED_PLANS = [
  { id: 'entrada-essencial', label: 'Essencial', amountCents: 12700, months: 1 },
  { id: 'entrada-operacao', label: 'Operação', amountCents: 29700, months: 1 },
  { id: 'anual-essencial', label: 'Essencial anual', amountCents: 127000, months: 12 },
  { id: 'anual-operacao', label: 'Operação anual', amountCents: 297000, months: 12 },
  { id: 'anual-expansao', label: 'Expansão anual assistida', amountCents: 797000, months: 12 },
] as const;
export const CHECKOUT_SUPPORT_EMAIL = 'medchatbot5@gmail.com';
export const CHECKOUT_TERMS = 'Pagamento único pelo período selecionado, sem renovação automática. Após a confirmação do pagamento, seu acesso é liberado. O CPF ou CNPJ é enviado ao processador de pagamento para emitir o Pix.';
