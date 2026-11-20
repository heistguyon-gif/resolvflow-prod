import { authorize, highlightResult, fail, heartbeat, jobImage, record, result, setupImage, setupStage, setupInterrupt } from "./story-bridge";
import { bridgeError, jsonBody, noStore } from "./story-bridge-http";
import { canUseStoryCredential, storyClaimPermission } from "./story-permissions";

// Only this handler bypasses application cookie auth. Bearer never grants other routes.
export async function handleStoryBridgeExtension(request: Request, env: { MEDIA?: R2Bucket }) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin !== null && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  const finish = (response: Response) => {
    noStore(response);
    response.headers.set("vary", "Origin");
    if (allowedOrigin) response.headers.set("access-control-allow-origin", origin);
    return response;
  };
  try {
    if (new URL(request.url).pathname !== "/api/story-bridge/extension") fail("not_found", "Rota não encontrada.", 404);
    if (origin !== null && !allowedOrigin) fail("origin", "Origem não autorizada.", 403);
    if (request.method === "OPTIONS") {
      const headers = (request.headers.get("access-control-request-headers") || "").toLowerCase().split(",").map(h => h.trim()).filter(Boolean);
      if (!allowedOrigin || request.headers.get("access-control-request-method") !== "POST" || headers.some(h => !["authorization", "content-type"].includes(h))) fail("origin", "Preflight inválido.", 403);
      return finish(new Response(null, { status: 204, headers: { "access-control-allow-methods": "POST", "access-control-allow-headers": "Authorization, Content-Type" } }));
    }
    if (request.method !== "POST") fail("method", "Método não permitido.", 405);
    if (!env.MEDIA) fail("unavailable", "Armazenamento indisponível.", 503);
    const auth = await authorize(env.MEDIA, request.headers.get("authorization"));
    const body = record(await jsonBody(request));
    // Preserve receipts for commands already claimed before revocation. The
    // domain still checks the exact credential, browser/session and claimed job.
    if (!["result", "highlight_result"].includes(String(body.type)) && !auth.platformOwner && !await canUseStoryCredential(env.MEDIA, auth.owner, auth.accountUserId)) fail("feature_disabled", "Stories e destaques estão desabilitados para este acesso.", 403);
    if (body.type === "heartbeat") return finish(Response.json(await heartbeat(env.MEDIA, auth, body, Date.now(), await storyClaimPermission(env.MEDIA, auth, body.browserId))));
    if (body.type === "image") return finish(await jobImage(env.MEDIA, auth, body));
    if (body.type === "highlight_result") return finish(Response.json(await highlightResult(env.MEDIA, auth, body)));
    if (body.type === "result") return finish(Response.json(await result(env.MEDIA, auth, body)));
    if (body.type === "setup_image") return finish(await setupImage(env.MEDIA, auth, body));
    if (body.type === "setup_stage") return finish(Response.json(await setupStage(env.MEDIA, auth, body)));
    if (body.type === "setup_interrupt") return finish(Response.json(await setupInterrupt(env.MEDIA, auth, body)));
    fail();
  } catch (error) { return finish(bridgeError(error)); }
}
