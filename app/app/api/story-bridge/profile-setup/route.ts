import { createSetup, setupOverview } from "../../../../lib/story-bridge";
import { profileSetupRoute, profileSetupJson } from "../../../../lib/story-profile-routes";

export function GET(request: Request) {
  return profileSetupRoute(request, "viewer", async (bucket, owner) => Response.json(await setupOverview(bucket, owner)));
}
export function POST(request: Request) {
  return profileSetupRoute(request, "editor", async (bucket, owner) => Response.json({ dispatch: await createSetup(bucket, owner, await profileSetupJson(request)) }));
}
