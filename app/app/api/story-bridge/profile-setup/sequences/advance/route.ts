import { advanceProfileSequence, requireProfileSequenceRelease } from "../../../../../../lib/story-profile-sequence";
import { profileSetupRoute, profileSetupJson } from "../../../../../../lib/story-profile-routes";

export function POST(request: Request) {
  return profileSetupRoute(request, "editor", async (bucket, owner) => { requireProfileSequenceRelease(); return Response.json({ sequence: await advanceProfileSequence(bucket, owner, await profileSetupJson(request)) }); });
}
