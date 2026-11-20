/** Keep the current local path/query without allowing an external return URL. */
export function dashboardLoginHref(location: { pathname?: string; search?: string }) {
  const path = location.pathname || "/";
  const query = location.search || "";
  const hasControl = (value: string) => [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  let next = "/";
  if (path.startsWith("/") && !path.startsWith("//") && !/[\\#?]/.test(path) && !hasControl(path)
    && (!query || query.startsWith("?")) && !query.includes("#") && !hasControl(query)
    && !["/login", "/logout", "/__nexoflow/login", "/__nexoflow/logout"].includes(path.replace(/\/$/, ""))) {
    next = path + query;
  }
  return `/login?next=${encodeURIComponent(next)}`;
}
