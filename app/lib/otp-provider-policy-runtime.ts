import { getMediaBucket } from "./media-storage";
import { effectiveProvider, policyUnavailable, readProviderPolicy } from "./otp-provider-policy";
import { runtimeEnv } from "./runtime-env";

/** Only for new allocations/readiness. Historical orders retain their stored origin. No cache. */
export async function resolveOtpPrimaryProvider(input: { accountUserId: string; email?: string | null; selfSupply: boolean }) {
  if (input.selfSupply) return "instacaster";
  try {
    const { policy } = await readProviderPolicy(getMediaBucket());
    if (!policy && runtimeEnv().TOP_LOCAL_PREVIEW === "1") return "otpgmail";
    return effectiveProvider(policy, input.accountUserId, input.email).provider;
  } catch { return policyUnavailable(); }
}
