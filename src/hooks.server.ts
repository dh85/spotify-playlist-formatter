import { redirect } from "@sveltejs/kit";
import { SESSION_COOKIE_NAME, verifySessionToken } from "$lib/server/auth";

export const handle = async ({ event, resolve }) => {
  const { url, cookies } = event;

  const isPublic =
    url.pathname === "/login" ||
    url.pathname.startsWith("/api/login") ||
    url.pathname.startsWith("/api/logout") ||
    url.pathname.startsWith("/_app/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/favicon.png";

  if (!isPublic) {
    const token = cookies.get(SESSION_COOKIE_NAME);
    const ok = token ? verifySessionToken(token) : false;
    if (!ok) {
      throw redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
    }
  }

  return resolve(event);
};
