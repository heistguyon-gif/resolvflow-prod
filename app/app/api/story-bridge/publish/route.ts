import { publishForWorkspace } from "../../../../lib/story-sharing";
import { jsonBody } from "../../../../lib/story-bridge-http";
import { bridgeRoute } from "../../../../lib/story-bridge-routes";

export async function POST(request: Request) {
  return bridgeRoute(request, "editor", async (bucket, owner) => Response.json({ dispatch: await publishForWorkspace(bucket, owner, await jsonBody(request)) }));
}
