import { env } from "cloudflare:workers";
import { runtimeEnv } from "./runtime-env";
import { OtpProviderCoordinator } from "./otp-provider-coordinator";
import { OtpOrderStore } from "./otp-order-store";

export function reliableOtpEnabled() { return runtimeEnv().OTP_RELIABLE_ORDERS_ENABLED === "1"; }
export function otpOrderStore() { return new OtpOrderStore((env as unknown as {DB:D1Database}).DB); }
export async function coordinatedOtpFetch(provider: "instacaster" | "otpgmail", key: string) {
  return reliableOtpEnabled() ? new OtpProviderCoordinator((env as unknown as {DB:D1Database}).DB).fetcher(provider,key) : fetch;
}
