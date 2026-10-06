import { and, desc, eq, isNotNull, isNull, like, or } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { appUsers, otpInbox, otpSupplierApis, workspaces } from "../../../../../db/schema";
import { authErrorResponse, requirePlatformAdmin } from "../../../../../lib/auth";
import { summarizeOtpHistoryRow } from "../../../../../lib/admin-otp-history";

const PAGE_SIZE = 20;
const MAX_PAGE = 100;
const noStore = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const params = new URL(request.url).searchParams;
    const requestedPage = Number(params.get("page") || 1);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > MAX_PAGE) {
      return Response.json({ error: "Página inválida." }, { status: 400, headers: noStore });
    }
    const status = params.get("status") || "all";
    if (!["all", "open", "closed", "hidden"].includes(status)) {
      return Response.json({ error: "Estado inválido." }, { status: 400, headers: noStore });
    }
    const email = (params.get("email") || "").trim().replace(/[%_]/g, "").slice(0, 100);
    const accountUserId = (params.get("accountUserId") || "").trim().slice(0, 100);
    const workspaceOwnerUserId = (params.get("workspaceOwnerUserId") || "").trim().slice(0, 100);
    const conditions = [
      accountUserId ? eq(otpInbox.accountUserId, accountUserId) : undefined,
      workspaceOwnerUserId ? eq(otpInbox.workspaceOwnerUserId, workspaceOwnerUserId) : undefined,
      email ? or(like(otpInbox.email, `%${email}%`), like(appUsers.email, `%${email}%`)) : undefined,
      status === "open" ? and(eq(otpInbox.closed, 0), isNull(otpInbox.hiddenAt)) : undefined,
      status === "closed" ? and(eq(otpInbox.closed, 1), isNull(otpInbox.hiddenAt)) : undefined,
      status === "hidden" ? isNotNull(otpInbox.hiddenAt) : undefined,
    ].filter((condition) => condition !== undefined);
    const rows = await getDb().select({
      id: otpInbox.id,
      email: otpInbox.email,
      userEmail: appUsers.email,
      userName: appUsers.displayName,
      workspaceName: workspaces.name,
      workspaceOwnerUserId: otpInbox.workspaceOwnerUserId,
      supplierApiId: otpInbox.supplierApiId,
      supplierApiName: otpSupplierApis.name,
      closed: otpInbox.closed,
      hiddenAt: otpInbox.hiddenAt,
      price: otpInbox.price,
      codesJson: otpInbox.codesJson,
      createdAt: otpInbox.createdAt,
      updatedAt: otpInbox.updatedAt,
    }).from(otpInbox)
      .leftJoin(appUsers, eq(appUsers.id, otpInbox.accountUserId))
      .leftJoin(workspaces, eq(workspaces.id, otpInbox.workspaceOwnerUserId))
      .leftJoin(otpSupplierApis, eq(otpSupplierApis.id, otpInbox.supplierApiId))
      .where(and(...conditions))
      .orderBy(desc(otpInbox.createdAt), desc(otpInbox.id))
      .limit(PAGE_SIZE + 1).offset((requestedPage - 1) * PAGE_SIZE);
    return Response.json({
      page: requestedPage,
      pageSize: PAGE_SIZE,
      hasMore: rows.length > PAGE_SIZE,
      items: rows.slice(0, PAGE_SIZE).map(summarizeOtpHistoryRow),
    }, { headers: noStore });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      const headers = new Headers(authResponse.headers);
      headers.set("cache-control", "private, no-store");
      return new Response(authResponse.body, { status: authResponse.status, headers });
    }
    return Response.json({ error: "Não foi possível carregar o histórico de Gmail OTP." }, { status: 500, headers: noStore });
  }
}
