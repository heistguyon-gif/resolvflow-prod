import type { LandingId } from '../types';
import { focusSection } from './Offer';
const logo = '/planos-assets/brand-original.png';
export function Header({ page }: { page: LandingId }) {
  return <header className="site-header"><div className="header-inner"><a className="brand" href="#conteudo" onClick={() => focusSection('conteudo')} aria-label="ResolvFlow, início"><span className="brand-image"><img src={logo} alt="ResolvFlow" width="1920" height="640" /></span></a><nav aria-label="Navegação principal"><a href={page === '3' ? '#demo' : '#fluxo'} onClick={() => focusSection(page === '3' ? 'demo' : 'fluxo')}>{page === '3' ? 'Demo' : 'Como funciona'}</a><a href="#planos" onClick={() => focusSection('planos')}>Propostas</a><a href="#duvidas" onClick={() => focusSection('duvidas')}>Dúvidas</a></nav><a className="review-index-link" href="#planos" onClick={() => focusSection('planos')}><span>Checkout · Pix</span><span aria-hidden="true">↗</span></a></div></header>;
}
