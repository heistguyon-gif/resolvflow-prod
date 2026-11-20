export function canViewOtpStock(email: string, requestUrl: string, platformAdmin: boolean) {
  return email.trim().toLowerCase() === "lucasbgn.affiliate@gmail.com"
    || new URL(requestUrl).hostname === "top.resolvflow.online" && platformAdmin;
}
