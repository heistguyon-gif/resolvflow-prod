import { normalizeInstagramInviteUsername } from "../../lib/meta-invite-username";

export type StoryBrowserIdentity = { id: string; sessionId: string; instagramUserId: string | null; available: boolean; instagramUsername?: string | null; instagramUsernameSeenAt?: string | null };
export type InviteBrowser = StoryBrowserIdentity & { label: string };
export type InviteAccount = { browserId: string; sessionId: string; instagramUserId: string; username: string; label: string };

// A client's wall clock can be minutes behind the server. Anchor each received
// snapshot to server time and advance it with a monotonic clock instead.
const clocks = new WeakMap<StoryBrowserIdentity, { server: number; received: number }>();
export function bindIdentityClock(browsers: StoryBrowserIdentity[], serverTime: unknown) {
  if (typeof serverTime !== "number" || !Number.isFinite(serverTime)) return;
  const clock = { server: serverTime, received: performance.now() };
  for (const browser of browsers) clocks.set(browser, clock);
}

/** Names come only from the bridge's identity-bound evidence, never a label or numeric ID. */
export function confirmedInstagramUsername(browser: StoryBrowserIdentity, now?: number): string | null {
  const clock = clocks.get(browser);
  now ??= clock ? clock.server + performance.now() - clock.received : Date.now();
  const username = normalizeInstagramInviteUsername(browser.instagramUsername);
  const seen = typeof browser.instagramUsernameSeenAt === "string" ? Date.parse(browser.instagramUsernameSeenAt) : NaN;
  if (!browser.available || !browser.instagramUserId || !/^\d{1,30}$/.test(browser.instagramUserId) || !username || !Number.isFinite(seen) || now - seen > 75000 || seen - now > 5000) return null;
  return username;
}
export function invitationAccount(browser: InviteBrowser, now?: number): InviteAccount | null {
  const username = confirmedInstagramUsername(browser, now);
  return username && browser.id && browser.sessionId && browser.instagramUserId ? { browserId: browser.id, sessionId: browser.sessionId, instagramUserId: browser.instagramUserId, username, label: browser.label } : null;
}
export function matchesInviteAccount(browser: InviteBrowser, account: InviteAccount, now?: number): boolean {
  return browser.id === account.browserId && browser.sessionId === account.sessionId && browser.instagramUserId === account.instagramUserId && confirmedInstagramUsername(browser, now) === account.username;
}
