import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { dashboardPreferences } from "../../../db/schema";
import { authErrorResponse, requireWorkspaceContext } from "../../../lib/auth";
import { DEFAULT_DASHBOARD_PREFERENCES, normalizeDashboardPreferences } from "../../../lib/dashboard-preferences";

export async function GET(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "viewer");
    const [row] = await getDb().select().from(dashboardPreferences).where(eq(dashboardPreferences.workspaceOwnerUserId, context.workspaceOwnerUserId)).limit(1);
    if (!row) return Response.json({ preferences: DEFAULT_DASHBOARD_PREFERENCES, exists: false });
    let parsed: unknown;
    try { parsed = JSON.parse(row.preferencesJson); } catch { parsed = DEFAULT_DASHBOARD_PREFERENCES; }
    return Response.json({ preferences: normalizeDashboardPreferences(parsed), exists: true, updatedAt: row.updatedAt });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a personalização." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "editor");
    const payload = await request.json() as { preferences?: unknown };
    const preferences = normalizeDashboardPreferences(payload.preferences);
    const now = new Date().toISOString();
    await getDb().insert(dashboardPreferences).values({
      workspaceOwnerUserId: context.workspaceOwnerUserId,
      preferencesJson: JSON.stringify(preferences),
      version: 1,
      updatedByUserId: context.accountUserId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: dashboardPreferences.workspaceOwnerUserId,
      set: { preferencesJson: JSON.stringify(preferences), version: 1, updatedByUserId: context.accountUserId, updatedAt: now },
    });
    return Response.json({ preferences, updatedAt: now });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a personalização." }, { status: 500 });
  }
}
