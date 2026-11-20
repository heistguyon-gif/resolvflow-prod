import { env } from "cloudflare:workers";
import { getMediaBucket } from "./media-storage";
import { DurableOtpPurchases } from "./otp-durable-purchase";
import { durableOtpReview } from "./otp-durable-review";

export function durableOtpAdmin() {return durableOtpReview(env.DB,getMediaBucket());}

export function durableOtpStore(ctx: {workspaceOwnerUserId:string;accountUserId:string;email?:string}) {
  return new DurableOtpPurchases(env.DB,getMediaBucket(),ctx.workspaceOwnerUserId,ctx.accountUserId,ctx.email);
}
