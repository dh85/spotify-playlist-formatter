import { SESSION_COOKIE_NAME } from "$lib/server/auth";
import { CSRF_ERROR_MESSAGE, isSameOriginPostRequest } from "$lib/server/csrf";

export const POST = async ({ request, cookies, url }) => {
  if (!isSameOriginPostRequest(request, url)) {
    return new Response(CSRF_ERROR_MESSAGE, { status: 403 });
  }

  cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
  return new Response(null, { status: 204 });
};
