import { requireWorkspaceContext, authErrorResponse } from "../../../../lib/auth";
import { readLimitedBody } from "../../../../lib/request-body";
import { ownWorkspace } from "../../../../lib/measurement/model";
import { measurementRuntime } from "../../../../lib/measurement/runtime";
import { recordUsage } from "../../../../lib/measurement/usage";

export async function POST(request: Request) {
  const json = (status: number) => Response.json({ok: status === 202}, {status, headers: {"cache-control":"private, no-store"}});
  try {
    const ctx = await requireWorkspaceContext(request, "owner");
    if (!ownWorkspace(ctx.email, ctx.workspaceOwnerUserId, ctx.role) || ctx.mustChangePassword ||
        request.headers.get("origin") !== new URL(request.url).origin) return json(403);
    const {store, usageKey} = measurementRuntime();
    if (!store || !usageKey) return json(404);
    let body: {action: unknown};
    try {
      body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 160)));
      if (!body || Object.keys(body).length !== 1 || !Object.hasOwn(body, "action")) return json(400);
    } catch { return json(400); }
    return json(await recordUsage(store, usageKey, ctx.accountUserId, body.action, Date.now()) ? 202 : 400);
  } catch (error) {
    return json(authErrorResponse(error)?.status ?? 503);
  }
}
