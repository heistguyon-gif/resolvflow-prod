// Provider selection is independent of wallet pricing and supplier-balance permissions.
export const OTPGMAIL_PRIMARY_EMAILS = new Set([
  "south.negociosdigitais@gmail.com",
  "lucasbgn.affiliate@gmail.com",
  "contato.peachagencia@gmail.com",
]);

export function isOtpGmailPrimaryEmail(email?: string | null) {
  return OTPGMAIL_PRIMARY_EMAILS.has(email?.trim().toLowerCase() || "");
}
