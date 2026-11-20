import { createProfileSequence, profileSequenceOverview, requireProfileSequenceRelease } from "../../../../../lib/story-profile-sequence";
import { profileSetupRoute, profileSetupJson } from "../../../../../lib/story-profile-routes";

export function GET(request: Request) {
  return profileSetupRoute(request, "viewer", async (bucket, owner) => Response.json(await profileSequenceOverview(bucket, owner)));
}
export function POST(request: Request) {
  return profileSetupRoute(request, "editor", async (bucket, owner) => { requireProfileSequenceRelease(); return Response.json({ sequence: await createProfileSequence(bucket, owner, await profileSetupJson(request)) }); });
}
