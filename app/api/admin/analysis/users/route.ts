import { asc, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appUsers } from "../../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../../lib/auth";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const query = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase().slice(0, 100);
    const literal = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const filter = query ? sql`(lower(${appUsers.displayName}) like ${literal} escape '\\' or lower(${appUsers.email}) like ${literal} escape '\\')` : undefined;
    const db = getDb();
    const users = await db.select({ id: appUsers.id, displayName: appUsers.displayName, email: appUsers.email })
      .from(appUsers).where(filter).orderBy(asc(appUsers.displayName)).limit(30);
    return Response.json({ users }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: "Não foi possível buscar usuários." }, { status: 500 });
  }
}
