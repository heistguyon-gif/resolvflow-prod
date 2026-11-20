import { authErrorResponse, requirePlatformOwner } from "../../../../lib/auth";
import { ownWorkspace } from "../../../../lib/measurement/model";
import {
  adminMeasurementReport, emptyFilters, emptyTelemetrySnapshot, fixtureSnapshot,
  readSnapshot, readTelemetrySnapshot,
} from "../../../../lib/measurement/report";
import { measurementRuntime } from "../../../../lib/measurement/runtime";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {"cache-control":"private, no-store"}});
  try {
    const ctx = await requirePlatformOwner(request);
    if (!ownWorkspace(ctx.email, ctx.workspaceOwnerUserId, ctx.role) || ctx.mustChangePassword) return json({error: "Acesso restrito."}, 403);
    const {store, config, usageKey} = measurementRuntime();
    const params = new URL(request.url).searchParams;
    const filters = {...emptyFilters};
    for (const key of Object.keys(filters) as Array<keyof typeof filters>) filters[key] = (params.get(key) || "").slice(0, 64);
    const snapshot = store && (config.enabled || usageKey) ? await readSnapshot(store) : fixtureSnapshot();
    const telemetry = store ? await readTelemetrySnapshot(store) : emptyTelemetrySnapshot();
    return json(adminMeasurementReport(snapshot, telemetry, filters));
  } catch (error) {
    return json({error: "Medição temporariamente indisponível."}, authErrorResponse(error)?.status ?? 503);
  }
}
