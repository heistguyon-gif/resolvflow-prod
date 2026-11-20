import { notFound } from "next/navigation";
import { measurementRuntime } from "../../lib/measurement/runtime";
import { MeasurementPreferences } from "./MeasurementPreferences";
import { PlanLanding } from "./PlanLanding";
import "./variant/tokens.css";
import "./variant/shared.css";
import "./variant/3/style.css";
import "./variant/checkout/checkout.css";

export const dynamic = "force-dynamic";
export const metadata = {title: "Planos · ResolvFlow", robots: {index: false, follow: false}};

export default function Plans() {
  const {publicRoute, config} = measurementRuntime();
  if (!publicRoute) notFound();
  return <PlanLanding
    tracking={publicRoute}
    preferences={config.enabled ? <MeasurementPreferences enabled/> : null}
  />;
}
