import { useState } from 'react';
import { LandingThree } from './3/Landing';
import { Header } from './shared/Header';
import { Footer } from './shared/Footer';
import { focusSection } from './shared/Offer';
import { createEventRecorder, type SyntheticEvent } from './shared/events';
import { PrivatePixPilot } from './checkout/PrivatePixPilot';
export function App({ onEvent }: { onEvent?: (event: SyntheticEvent) => void }) {
  const [recorder] = useState(() => createEventRecorder('3', onEvent));
  if (typeof document !== 'undefined' && document.documentElement.dataset.checkout === 'pilot') return <PrivatePixPilot />;
  return <div className="landing variant-3"><a className="skip-link" href="#conteudo" onClick={() => focusSection('conteudo')}>Pular para o conteúdo</a><Header page="3" /><main id="conteudo" tabIndex={-1}><LandingThree emit={recorder.emit} /></main><Footer /></div>;
}
