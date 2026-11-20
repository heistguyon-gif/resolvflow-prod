/** Accept one Instagram username, with an optional @, and store it canonically. */
export function normalizeInstagramInviteUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!/^@?[a-zA-Z0-9._]{1,30}$/.test(input)) return null;
  return input.replace(/^@/, "").toLowerCase();
}
