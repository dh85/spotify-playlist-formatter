import { SESSION_COOKIE_NAME } from "$lib/server/auth";
import { CSRF_ERROR_MESSAGE, isSameOriginPostRequest } from "$lib/server/csrf";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  if (!isSameOriginPostRequest(request, url)) {
    return new Response(CSRF_ERROR_MESSAGE, { status: 403 });
  }

  cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
  return new Response(null, { status: 204 });
};
