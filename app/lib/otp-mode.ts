export type OtpBillingMode = "platform" | "supplier";

export function resolveOtpSupplierMode(explicitMode: string | null | undefined, legacySupplierMode: boolean) {
  if (explicitMode === "supplier") return true;
  if (explicitMode === "platform") return false;
  return legacySupplierMode;
}
