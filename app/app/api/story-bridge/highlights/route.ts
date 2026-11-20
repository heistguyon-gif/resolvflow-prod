import { bridgeRoute } from "../../../../lib/story-bridge-routes";
import { createHighlightOperation, highlightOverview, fail, MASTER_STORY_OWNER } from "../../../../lib/story-bridge";
import { jsonBody } from "../../../../lib/story-bridge-http";
function pilot(email: string, owner: string) {
  if (email.trim().toLowerCase() !== "lucasbgn.affiliate@gmail.com" || owner !== MASTER_STORY_OWNER) fail("feature_disabled", "Recurso indisponivel.", 403);
}
export function GET(request: Request) {
  return bridgeRoute(request, "viewer", async (bucket, owner, context) => { pilot(context.email, owner); return Response.json(await highlightOverview(bucket, owner)); });
}
export function POST(request: Request) {
  return bridgeRoute(request, "editor", async (bucket, owner, context) => { pilot(context.email, owner); return Response.json({ operation: await createHighlightOperation(bucket, owner, await jsonBody(request)) }, { status: 202 }); });
}
