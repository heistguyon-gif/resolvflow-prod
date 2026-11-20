import { measurementRuntime } from "../../../../lib/measurement/runtime";
import { publicTelemetry } from "../../../../lib/measurement/telemetry-http";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const runtime = measurementRuntime();
  return publicTelemetry(request, runtime.store, runtime.publicRoute && Boolean(runtime.store));
}
