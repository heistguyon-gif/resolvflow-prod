import { useState } from 'react';
import { FIXED_PLANS } from '../checkout/catalog';
import { LiveCheckoutDialog } from '../checkout/LiveCheckoutDialog';
import { CheckoutDialog } from '../checkout/CheckoutDialog';
import { trackInitiateCheckout } from '../../planPixel';
import type { Emit } from './events';
import { PlanProposalSelector } from './PlanProposalSelector';
import { CARD_CAVEAT, CORE_FEATURES, EXCLUSIONS, PLAN_PROPOSALS, PROPOSAL_NOTICE, type ProposedPlan, type ProposalId } from './planProposals';

export function focusSection(id: string) {
  const target = document.getElementById(id);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.({ block: 'start' });
}

function PlanPrice({ price }: { price: ProposedPlan['price'] }) {
  return <div className="plan-pricing">
    <p className={`price price-${price.kind}`} aria-label={price.fullLabel}>{price.kind !== 'undetermined' && <span>R$</span>}<strong>{price.value}</strong>{price.period && <small>{price.period}</small>}</p>
    <span className="price-qualification">{price.qualification}</span>
    {price.equivalent && <p className="price-equivalence">{price.equivalent}<span>Equivalência aritmética, não parcelamento.</span></p>}
  </div>;
}

export function Offer({ introduction }: { emit: Emit; introduction: { title: string; description: string } }) {
  const live = true;
  const [proposalId, setProposalId] = useState<ProposalId>('entrada');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [selectionTrigger, setSelectionTrigger] = useState<HTMLButtonElement | null>(null);
  const proposal = PLAN_PROPOSALS.find(item => item.id === proposalId) ?? PLAN_PROPOSALS[0];
  const selectedPlan = proposal.plans.find(plan => plan.id === selectedPlanId);
  const fixedPlan = FIXED_PLANS.find(plan => plan.id === selectedPlanId);

  function selectProposal(id: ProposalId) {
    if (id === proposalId) return;
    setProposalId(id);
    setSelectedPlanId(null);
    setSelectionTrigger(null);
    const next = PLAN_PROPOSALS.find(item => item.id === id);
    setAnnouncement(`Proposta ${next?.letter}: ${next?.title}. ${selectedPlanId ? 'A comparação anterior foi limpa.' : 'Os três cards foram atualizados.'}`);
  }

  function selectPlan(plan: ProposedPlan, trigger: HTMLButtonElement) {
    setSelectionTrigger(trigger);
    setSelectedPlanId(plan.id);
    if (live) {
      const fixed = FIXED_PLANS.find(item => item.id === plan.id);
      if (fixed) trackInitiateCheckout(fixed);
    }
  }

  return (
    <section className="offer section-shell" aria-labelledby="planos">
      <div className="section-intro offer-intro">
        <div><p className="eyebrow">Propostas de acesso</p><h2 id="planos" tabIndex={-1}>{introduction.title}</h2><p className="offer-introduction">{introduction.description}</p></div>
        <div className="offer-context"><span className="review-label">{live ? 'Checkout Pix' : 'Propostas em validação'}</span><p>{live ? 'Os planos com preço fechado têm pagamento único por Pix. As faixas de preço servem para comparação.' : PROPOSAL_NOTICE}</p></div>
      </div>
      <PlanProposalSelector selected={proposalId} onSelect={selectProposal} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div id="proposal-panel" role="tabpanel" aria-labelledby={`proposal-tab-${proposalId}`} tabIndex={0} className="proposal-panel">
        <div className="proposal-intro"><div><span className="eyebrow">{proposal.emphasis}</span><h3>{proposal.title}</h3></div><p>{proposal.description}</p></div>
        {!live && <p className="proposal-status-note">Preços e condições abaixo são hipóteses. Sem contratação ou limites novos no produto.</p>}
        {proposal.id === 'anual' && <p className="proposal-status-note">Cancelamento, eventual restituição, retenção e renovação dependem de termos antes de qualquer venda.</p>}
        <div className="plans" data-proposal={proposal.id} key={proposal.id}>
          {proposal.plans.map((plan, index) => <article className={`plan ${index === 1 ? 'plan-featured' : ''} ${index === 2 ? 'plan-volume' : ''}`} key={plan.id} data-plan-id={plan.id}>
            <div className="plan-top"><span className="plan-symbol" aria-hidden="true">{index === 0 ? '↗' : index === 1 ? '✳' : '↗↗'}</span><span className="eyebrow">{index === 1 ? 'Hipótese de referência' : `Proposta ${proposal.letter} · opção ${index + 1}`}</span></div>
            <h4>{plan.title}</h4><p className="plan-description">{plan.description}</p>
            <PlanPrice price={plan.price} />
            <div className="plan-capacity"><span>Perfis ativos · hipótese</span><strong>{plan.profiles}</strong></div>
            <div className="plan-conditions"><p className="plan-scope">1 operador · 1 workspace propostos</p><p>{plan.condition}</p></div>
            <ul aria-label={`Núcleo da plataforma em ${plan.title}`}>{CORE_FEATURES.map(feature => <li key={feature}>{feature}</li>)}</ul>
            <p className="plan-caveat">{CARD_CAVEAT}</p>
            {FIXED_PLANS.some(item => item.id === plan.id) && <button type="button" className="button button-orange plan-buy" aria-haspopup="dialog" aria-label={`${live ? 'Comprar' : 'Simular compra de'} ${plan.title}`} onClick={event => selectPlan(plan, event.currentTarget)}>{live ? 'Comprar com Pix' : 'Simular compra'}<span aria-hidden="true">↗</span></button>}
          </article>)}
        </div>
        {live && fixedPlan && <LiveCheckoutDialog key={fixedPlan.id} plan={fixedPlan} returnFocus={selectionTrigger} close={() => setSelectedPlanId(null)} />}
        {!live && selectedPlan && <CheckoutDialog key={selectedPlan.id} plan={selectedPlan} proposalTitle={proposal.title} returnFocus={selectionTrigger} onClose={() => setSelectedPlanId(null)} />}
      </div>
      <p className="proposal-exclusions">{EXCLUSIONS}</p>
      <details className="proposal-comparison"><summary>Comparar as três propostas lado a lado <span aria-hidden="true">+</span></summary><p>Resumo de preço, período e porte. Consulte os cards de cada proposta para as condições completas.</p><div className="comparison-grid">{PLAN_PROPOSALS.map(item => <article key={item.id}><span className="eyebrow">Proposta {item.letter}</span><h3>{item.title}</h3><ul>{item.plans.map(plan => <li key={plan.id}><strong>{plan.title}</strong><span>{plan.price.fullLabel}</span><small>Perfis ativos · hipótese: {plan.profiles}</small></li>)}</ul><button type="button" onClick={() => { selectProposal(item.id); focusSection(`proposal-tab-${item.id}`); }}>Ver proposta {item.letter} <span aria-hidden="true">↗</span></button></article>)}</div></details>
      <div className="offer-foot"><p>O núcleo descrito depende do acesso e das integrações de cada operador.</p><details><summary>Como ler as faixas de perfis</summary><p>Perfis ativos são conexões autorizadas e elegíveis para operação, não registros históricos. Arquivar não apaga recibos; regras de troca e contagem ainda dependem de definição. Quantidade histórica não recebe uma quota nova por esta proposta.</p></details></div>
    </section>
  );
}
