"use client";

import type { ReactNode } from "react";
import { LandingThree } from "./variant/3/Landing";
import { Header } from "./variant/shared/Header";
import { Footer } from "./variant/shared/Footer";
import { PlanFunnelTracking } from "./PlanFunnelTracking";

export function PlanLanding({preferences, tracking = true}: {preferences: ReactNode; tracking?: boolean}) {
  return <div className="landing variant-3">
    <PlanFunnelTracking enabled={tracking}/>
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <Header page="3"/>
    <main id="conteudo" tabIndex={-1}>
      <LandingThree emit={() => undefined}/>
      {preferences && <div className="shell">{preferences}</div>}
    </main>
    <Footer/>
  </div>;
}
