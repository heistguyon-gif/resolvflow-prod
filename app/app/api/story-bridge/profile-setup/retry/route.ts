import { retrySetup } from "../../../../../lib/story-bridge";
import { profileSetupRoute, profileSetupJson } from "../../../../../lib/story-profile-routes";

export function POST(request: Request) {
  return profileSetupRoute(request, "editor", async (bucket, owner) => Response.json({ dispatch: await retrySetup(bucket, owner, await profileSetupJson(request)) }));
}
