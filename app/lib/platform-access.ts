// The owner identity is fixed; coadmins may manage only ordinary users.
export const PLATFORM_OWNER_EMAIL = "lucasbgn.affiliate@gmail.com";

export function isPlatformOwnerEmail(email?: string | null) {
  return email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}

export function canManagePlatformLogin(actorEmail: string, targetEmail: string, targetIsAdmin: boolean) {
  return isPlatformOwnerEmail(actorEmail) || (!targetIsAdmin && !isPlatformOwnerEmail(targetEmail));
}
