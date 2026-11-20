export const LOGIN_PATH = "/login";
export const LOGOUT_PATH = "/logout";

// Destinations are pages, never another auth URL, callback or external origin.
const LOGIN_DESTINATIONS = new Set([
  "/", "/admin", "/dashboard", "/contas", "/acessos", "/campanhas", "/fila",
  "/alertas", "/relatorios", "/integracoes", "/equipe", "/otp", "/emails", "/stories",
]);

export function safeLoginNextPath(value: string): string {
  try {
    const decoded = decodeURIComponent(value || "/");
    if (decoded.includes("\\") || [...decoded].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return "/";
    const path = decoded.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    return LOGIN_DESTINATIONS.has(path) ? path : "/";
  } catch {
    return "/";
  }
}

export function loginPathFor(next = "/"): string {
  const path = safeLoginNextPath(next);
  return path === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(path)}`;
}
