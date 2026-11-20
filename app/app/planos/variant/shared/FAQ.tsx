import { commonQuestions, specificQuestions } from '../copy';
import type { LandingId } from '../types';
export function FAQ({ page }: { page: LandingId }) {
  return <section className="faq shell" aria-labelledby="duvidas"><div><span className="eyebrow">Antes de decidir</span><h2 id="duvidas" tabIndex={-1}>Clareza também<br />nas condições.</h2><p>Entenda o que esta prévia apresenta e o que ainda precisa ser avaliado.</p></div><div className="faq-list">{[...specificQuestions[page], ...commonQuestions].map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>;
}
