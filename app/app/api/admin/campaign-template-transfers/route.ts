import { authErrorResponse, requirePlatformOwner } from "../../../../lib/auth";
import { TemplateTransferError, templateTransferOptions, transferCampaignTemplate } from "../../../../lib/campaign-template-transfer";
import { BodyLimitError, readLimitedBody } from "../../../../lib/request-body";

const headers = { "cache-control": "private, no-store" };
function failure(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof TemplateTransferError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof BodyLimitError || error instanceof SyntaxError) return Response.json({ error: "Solicitação inválida." }, { status: 400, headers });
  return Response.json({ error: "Não foi possível acessar o envio de templates. Tente novamente." }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformOwner(request);
    return Response.json(await templateTransferOptions(ctx.workspaceOwnerUserId), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformOwner(request);
    const payload = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 2048)));
    const result = await transferCampaignTemplate(ctx, payload);
    return Response.json(result, { status: result.replay ? 200 : 201, headers });
  } catch (error) { return failure(error); }
}
