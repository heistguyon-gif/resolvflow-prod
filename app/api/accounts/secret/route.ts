import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts } from "../../../../db/schema";
import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { decryptToken } from "../../../../lib/token-crypto";
import { recordAuditEvent } from "../../../../lib/audit";

export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "owner");
    const payload = await request.json() as { id?: string; kind?: string };
    const id = payload.id?.trim() || "";
    const kind = payload.kind === "email" ? "email" : "login";
    if (!id) return Response.json({ error: "Informe a conta." }, { status: 400 });
    const [account] = await getDb().select({
      id: accounts.id,
      username: accounts.username,
      loginPasswordCiphertext: accounts.loginPasswordCiphertext,
      loginPasswordIv: accounts.loginPasswordIv,
      emailPasswordCiphertext: accounts.emailPasswordCiphertext,
      emailPasswordIv: accounts.emailPasswordIv,
    }).from(accounts).where(and(eq(accounts.ownerUserId, context.workspaceOwnerUserId), eq(accounts.id, id))).limit(1);
    if (!account) return Response.json({ error: "Conta não encontrada." }, { status: 404 });
    const ciphertext = kind === "email" ? account.emailPasswordCiphertext : account.loginPasswordCiphertext;
    const iv = kind === "email" ? account.emailPasswordIv : account.loginPasswordIv;
    if (!ciphertext || !iv) return Response.json({ error: kind === "email" ? "Esta conta ainda não tem senha do e-mail guardada." : "Esta conta ainda não tem senha guardada." }, { status: 404 });
    const password = await decryptToken(ciphertext, iv);
    await recordAuditEvent(request, { ownerUserId: context.workspaceOwnerUserId, action: kind === "email" ? "accounts.email_secret_reveal" : "accounts.secret_reveal", entityType: "account", entityId: account.id, summary: kind === "email" ? `Senha do e-mail de @${account.username} revelada no cofre.` : `Senha de @${account.username} revelada no cofre.` });
    return Response.json({ username: account.username, password, kind });
  } catch (error) {
    const authResponse = authErrorResponse(error); if (authResponse) return authResponse;
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível revelar a senha." }, { status: 500 });
  }
}
