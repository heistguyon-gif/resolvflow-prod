import { sharedOverview } from "../../../lib/story-sharing";
import { bridgeRoute } from "../../../lib/story-bridge-routes";

export async function GET(request: Request) {
  return bridgeRoute(request, "viewer", async (bucket, owner) => Response.json(await sharedOverview(bucket, owner)));
}
