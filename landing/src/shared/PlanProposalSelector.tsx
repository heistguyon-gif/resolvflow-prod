import { useRef, type KeyboardEvent } from 'react';
import { PLAN_PROPOSALS, type ProposalId } from './planProposals';

export function PlanProposalSelector({ selected, onSelect }: { selected: ProposalId; onSelect: (id: ProposalId) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (current + 1) % PLAN_PROPOSALS.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + PLAN_PROPOSALS.length) % PLAN_PROPOSALS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = PLAN_PROPOSALS.length - 1;
    else return;
    event.preventDefault();
    onSelect(PLAN_PROPOSALS[next].id);
    tabs.current[next]?.focus();
  }
  return <div className="proposal-tabs" role="tablist" aria-label="Propostas de planos em avaliação" aria-orientation="horizontal">{PLAN_PROPOSALS.map((proposal, index) => <button type="button" role="tab" key={proposal.id} ref={element => { tabs.current[index] = element; }} id={`proposal-tab-${proposal.id}`} aria-selected={proposal.id === selected} aria-controls="proposal-panel" tabIndex={proposal.id === selected ? 0 : -1} onClick={() => onSelect(proposal.id)} onKeyDown={event => navigate(event, index)}><span className="proposal-letter" aria-hidden="true">{proposal.letter}</span><span><span className="proposal-option-label">Proposta {proposal.letter}</span><strong>{proposal.title}</strong></span><span className="proposal-selected-mark" aria-hidden="true">{proposal.id === selected ? '✓' : '↗'}</span></button>)}</div>;
}
