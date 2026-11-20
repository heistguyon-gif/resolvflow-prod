export const CORE_FEATURES = [
  'Centralizar perfis habilitados.',
  'Preparar campanhas de Reels com mídia própria.',
  'Duplicar campanhas como rascunho.',
  'Revisar destinos e programação.',
  'Acompanhar os estados da fila.',
] as const;

export const PROPOSAL_NOTICE = 'Prévia interna. Preços, faixas de perfis e condições são hipóteses para comparação. Não há contratação disponível nem novos limites aplicados ao produto.';
export const CARD_CAVEAT = 'Gmail/OTP e custos de terceiros são separados. Publicação depende de conexão, permissões e regras da plataforma. Volume, armazenamento, processamento, suporte e condições ainda precisam de validação; sem garantia de capacidade ou entrega.';
export const EXCLUSIONS = 'Templates de perfil em piloto, novo visual restrito, Stories, leitor de e-mails e convites não compõem uma inclusão universal. Resolvbot é projeto separado e não está incluído.';
export const VOLUME_CRITERIA = 'Os critérios desta comparação são perfis elegíveis, mídia própria, frequência de publicação, exceções operacionais e necessidade de atendimento. As faixas de descoberta não demonstram capacidade simultânea. Este resumo não envia dados nem agenda análise humana.';

export type ProposalId = 'entrada' | 'volume' | 'anual';
export type PlanPrice = {
  value: string;
  period: '/mês' | 'por 12 meses' | '';
  kind: 'monthly' | 'range' | 'annual' | 'undetermined';
  qualification: string;
  fullLabel: string;
  equivalent?: string;
};
export type ProposedPlan = {
  id: string;
  title: string;
  description: string;
  price: PlanPrice;
  profiles: string;
  condition: string;
  cta: string;
  volumeCriteria?: boolean;
};
export type PlanProposal = {
  id: ProposalId;
  letter: 'A' | 'B' | 'C';
  title: string;
  description: string;
  emphasis: string;
  plans: readonly [ProposedPlan, ProposedPlan, ProposedPlan];
};

// Internal hypotheses from RF-20261117-plan-variants-brief.md. No billing or entitlement contract.
// Descriptions state only what the code defines: CORE_FEATURES, profile limit, period and the
// "1 operador · 1 workspace" scope. Undefined deliverables are marked PLACEHOLDER below.
const CORE_SUMMARY = 'perfis habilitados em um painel, campanhas de Reels com mídia própria, duplicação de campanhas em rascunho, revisão de destinos e programação e acompanhamento dos estados da fila';
export const PLAN_PROPOSALS: readonly PlanProposal[] = [
  {
    id: 'entrada', letter: 'A', title: 'Entrada e operação', emphasis: 'Porte e adequação',
    description: 'Compare uma entrada menor, a operação recorrente e o dimensionamento assistido.',
    plans: [
      { id: 'entrada-essencial', title: 'Essencial', description: `Acesso por 1 mês para 1 operador em 1 workspace, com até 5 perfis ativos: ${CORE_SUMMARY}.`, price: { value: '127', period: '/mês', kind: 'monthly', qualification: 'Hipótese', fullLabel: 'R$ 127/mês · hipótese' }, profiles: 'Até 5', condition: 'Capacidade e condições ainda em validação.', cta: 'Comparar Essencial' },
      { id: 'entrada-operacao', title: 'Operação', description: `Acesso por 1 mês para 1 operador em 1 workspace, com até 20 perfis ativos: ${CORE_SUMMARY}.`, price: { value: '297', period: '/mês', kind: 'monthly', qualification: 'Hipótese', fullLabel: 'R$ 297/mês · hipótese' }, profiles: 'Até 20', condition: 'Não inclui equipe ou aprovação de clientes.', cta: 'Comparar Operação' },
      { id: 'entrada-volume', title: 'Volume assistido', // PLACEHOLDER: capacity, price and support scope are not defined in code.
        description: `Mesmo núcleo de campanhas (${CORE_SUMMARY}) para mais de 20 perfis ativos. Capacidade, preço e atendimento a definir após análise da operação.`, price: { value: 'A dimensionar', period: '', kind: 'undetermined', qualification: 'Preço mensal a dimensionar', fullLabel: 'Preço mensal a dimensionar' }, profiles: 'Acima de 20 · adequação individual', condition: 'Faixas de descoberta: 21–60, 61–200 e 201–600+. Não são capacidade incluída, simultânea ou garantida; atendimento ainda sem escopo/SLA definidos.', cta: 'Ver critérios de volume', volumeCriteria: true },
    ],
  },
  {
    id: 'volume', letter: 'B', title: 'Volume', emphasis: 'Faixas para pesquisa',
    description: 'Explore faixas comerciais para operações maiores. Os números abaixo não demonstram capacidade do sistema.',
    plans: [
      { id: 'volume-operacao20', title: 'Operação20', description: `Até 20 perfis ativos, a validar, com ${CORE_SUMMARY}. Preço mensal em faixa de pesquisa.`, price: { value: '247–397', period: '/mês', kind: 'range', qualification: 'Faixa proposta', fullLabel: 'R$ 247–397/mês · faixa proposta' }, profiles: 'Até 20, a validar', condition: 'Faixa para pesquisa; não é desconto aplicado sobre a proposta A.', cta: 'Examinar Operação20' },
      { id: 'volume-expansao60', title: 'Expansão60', description: `Até 60 perfis ativos, a validar, com ${CORE_SUMMARY}. Preço mensal em faixa de pesquisa.`, price: { value: '697–997', period: '/mês', kind: 'range', qualification: 'Faixa proposta', fullLabel: 'R$ 697–997/mês · faixa proposta' }, profiles: 'Até 60, a validar', condition: 'Volume depende de validação de capacidade e custos. Não promete 60 publicações simultâneas ou suporte ampliado.', cta: 'Examinar Expansão60', volumeCriteria: true },
      { id: 'volume-dimensionado', title: 'Volume dimensionado', // PLACEHOLDER: capacity and support scope above 60 profiles are not defined in code.
        description: `Mesmo núcleo de campanhas (${CORE_SUMMARY}) para mais de 60 perfis ativos. Capacidade e atendimento a definir após análise da operação.`, price: { value: '1.497–2.997', period: '/mês', kind: 'range', qualification: 'Faixa exploratória', fullLabel: 'R$ 1.497–2.997/mês · faixa exploratória' }, profiles: 'Acima de 60 · sem teto contratado nesta prévia', condition: 'Descoberta nas faixas 61–200 e 201–600+. A faixa de preço não compra automaticamente 200 ou 600 perfis; a proposta pode ficar fora dela ou ser inviável após análise.', cta: 'Examinar dimensionamento', volumeCriteria: true },
    ],
  },
  {
    id: 'anual', letter: 'C', title: 'Acesso anual', emphasis: 'Período de acesso',
    description: 'Compare acesso por 12 meses com pagamento anual proposto. Mesmo núcleo; muda o compromisso comercial.',
    plans: [
      { id: 'anual-essencial', title: 'Essencial anual', description: `Acesso por 12 meses para 1 operador em 1 workspace, com até 5 perfis ativos: ${CORE_SUMMARY}.`, price: { value: '1.270', period: 'por 12 meses', kind: 'annual', qualification: 'Hipótese · total anual', fullLabel: 'R$ 1.270 por 12 meses · hipótese', equivalent: 'Equivale a R$ 105,83/mês; total anual proposto R$ 1.270.' }, profiles: 'Até 5', condition: 'Pagamento anual único proposto; sem renovação automática definida.', cta: 'Comparar anual Essencial' },
      { id: 'anual-operacao', title: 'Operação anual', description: `Acesso por 12 meses para 1 operador em 1 workspace, com até 20 perfis ativos: ${CORE_SUMMARY}.`, price: { value: '2.970', period: 'por 12 meses', kind: 'annual', qualification: 'Hipótese · total anual', fullLabel: 'R$ 2.970 por 12 meses · hipótese', equivalent: 'Equivale a R$ 247,50/mês; total anual proposto R$ 2.970.' }, profiles: 'Até 20', condition: 'Mesmo núcleo do mensal; não inclui novos recursos, créditos ou prioridade.', cta: 'Comparar anual Operação' },
      { id: 'anual-expansao', title: 'Expansão anual assistida', // PLACEHOLDER: assisted support/implementation scope is not defined in code.
        description: `Acesso por 12 meses com até 60 perfis ativos, sujeito a adequação prévia: ${CORE_SUMMARY}. Atendimento e implantação a definir.`, price: { value: '7.970', period: 'por 12 meses', kind: 'annual', qualification: 'Hipótese · total anual', fullLabel: 'R$ 7.970 por 12 meses · hipótese', equivalent: 'Equivale a R$ 664,17/mês; total anual proposto R$ 7.970.' }, profiles: 'Até 60, sujeito a adequação prévia', condition: 'Não é vitalício nem capacidade já validada. Atendimento e implantação dependem de definição.', cta: 'Comparar anual assistido', volumeCriteria: true },
    ],
  },
];
