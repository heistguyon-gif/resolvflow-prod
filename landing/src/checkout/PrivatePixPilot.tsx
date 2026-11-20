import { useState } from 'react';
import { FIXED_PLANS } from './catalog';
import { LiveCheckoutDialog } from './LiveCheckoutDialog';

export function PrivatePixPilot() {
  const [choice,setChoice]=useState<{ plan:typeof FIXED_PLANS[number]; button:HTMLButtonElement } | null>(null);
  const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  return <div className="landing variant-3"><main className="section-shell">
    <div className="section-intro">
      <div><p className="eyebrow">Ambiente restrito ao titular</p><h1>Teste privado de Pix</h1>
      <p>O valor corresponde ao plano selecionado. Gerar o Pix cria uma cobrança real. A confirmação do pagamento não libera acesso automaticamente.</p></div>
    </div>
    <ul aria-label="Planos disponíveis para teste">
      {FIXED_PLANS.map(plan=><li key={plan.id}>
        <p><strong>{plan.label}</strong> · {money.format(plan.amountCents/100)} · {plan.months===1?'1 mês':'12 meses'}</p>
        <button className="button button-orange" onClick={e=>setChoice({plan,button:e.currentTarget})}>Testar {plan.label}</button>
      </li>)}
    </ul>
    {choice && <LiveCheckoutDialog privatePilot plan={choice.plan} close={()=>setChoice(null)} returnFocus={choice.button} />}
  </main></div>;
}
