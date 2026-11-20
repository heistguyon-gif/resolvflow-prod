import { footerCopy } from '../copy';
import { focusSection } from './Offer';
export function Footer() {
  return <footer className="site-footer shell"><div className="footer-signature">resolvflow<span aria-hidden="true">↗</span></div><p>{footerCopy}</p><div><a href="#planos" onClick={() => focusSection('planos')}>Comparar propostas</a><a href="#conteudo" onClick={() => focusSection('conteudo')}>Voltar ao início ↑</a></div></footer>;
}
