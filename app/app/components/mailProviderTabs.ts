// Tabs classify addresses, never authentication transports. MixOTP remains code-only.
export function mailProviderTab(email:string):"gmail"|"hotmail" {
 return email.trim().toLowerCase().endsWith("@gmail.com") ? "gmail" : "hotmail";
}
