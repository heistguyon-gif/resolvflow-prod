import { authErrorResponse, requireWorkspaceContext } from "../../../../lib/auth";
import { cloudMail, mailErrorResponse, mailJson, mailResponse } from "../../../../lib/cloud-mail-runtime";
import { completeMailExport, hasCompleteMailImport, resolvbotMailPackage } from "../../../../lib/cloud-mail-export-format";
import { MailError } from "../../../../lib/cloud-mail";
import { BodyLimitError } from "../../../../lib/request-body";

const headers = { "cache-control": "private, no-store", "pragma": "no-cache", "x-content-type-options": "nosniff", "vary": "Cookie, Origin" };
export function GET() { return mailResponse({ error: "Use o download explícito no painel." }, 405, { ...headers, allow: "POST" }); }
export const HEAD = GET;
export async function POST(request: Request) {
  try {
    const context = await requireWorkspaceContext(request, "owner");
    if (context.role !== "owner" || context.email.trim().toLowerCase() !== "lucasbgn.affiliate@gmail.com") return mailResponse({ error: "Exportação indisponível para este login." }, 403, headers);
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return mailResponse({ error: "Origem inválida." }, 403, headers);
    const body = await mailJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["mode", "accountIds", "filter", "localMerge", "format"].includes(key))
      || !["all", "selected"].includes(body.mode) || !["all", "under-five", "unknown"].includes(body.filter)
      || (body.format !== undefined && !["original-txt", "resolvbot-json"].includes(body.format))
      || (body.localMerge !== undefined && typeof body.localMerge !== "boolean")
      || (body.format === "resolvbot-json" && body.localMerge === true)
      || (body.mode === "selected" && (!Array.isArray(body.accountIds) || !body.accountIds.length || body.accountIds.some((id: unknown) => typeof id !== "string")))
      || (body.mode === "all" && body.accountIds !== undefined)) return mailResponse({ error: "Seleção ou filtro inválido." }, 400, headers);
    const rows = await cloudMail(context.email).exportRows({ ...body, includeHistory: body.format === "resolvbot-json" });
    if (body.format === "resolvbot-json") return new Response(JSON.stringify(resolvbotMailPackage(rows, new Date().toISOString()), null, 2) + "\n", {
      headers: { ...headers, "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="resolvbot-caixas-com-historico.json"' },
    });
    const missing = rows.filter(row => !hasCompleteMailImport(row));
    if (missing.length && body.localMerge !== true) return mailResponse({ code: "original_required", error: `${missing.length} caixa(s) sem dados originais completos. Selecione o TXT original para completar somente no navegador. Nenhum TXT parcial foi gerado.`, missingIds: missing.map(row => row.id) }, 409, headers);
    if (body.localMerge === true) return Response.json({ rows }, { headers: { ...headers, "content-disposition": 'attachment; filename="hotmail-local-completion.json"' } });
    return new Response(completeMailExport(rows), { headers: { ...headers, "content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="hotmail-completo.txt"' } });
  } catch (error) {
    if (error instanceof MailError && error.code === "export_history") return mailResponse({ code: error.code, error: "Histórico salvo inconsistente. Nenhum pacote parcial foi gerado." }, error.status, headers);
    if (error instanceof BodyLimitError) return mailResponse({ error: "A seleção excede 2 MB por requisição." }, 413, headers);
    if (error instanceof MailError && ["export_empty", "export_selection"].includes(error.code)) return mailResponse({ code: error.code, error: error.code === "export_empty" ? "Nenhuma caixa corresponde à seleção e ao filtro. Nenhum arquivo foi gerado." : "A seleção ou um cadastro mudou. Atualize a lista e confira a seleção; nenhum arquivo parcial foi gerado." }, error.status, headers);
    const response = authErrorResponse(error) || mailErrorResponse(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
