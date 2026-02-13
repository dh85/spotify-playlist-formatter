import { json } from "@sveltejs/kit";
import { issueSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifyPassword } from "$lib/server/auth";
import { CSRF_ERROR_MESSAGE, isSameOriginPostRequest } from "$lib/server/csrf";
import {
  clearLoginAttempts,
  getLoginRateLimitKey,
  isLoginRateLimited,
  LOGIN_RATE_LIMIT_MESSAGE,
  recordFailedLoginAttempt
} from "$lib/server/login-rate-limit";

export const POST = async ({ request, cookies, url, getClientAddress }) => {
  if (!isSameOriginPostRequest(request, url)) {
    return new Response(CSRF_ERROR_MESSAGE, { status: 403 });
  }

  const key = getLoginRateLimitKey(getClientAddress?.());

  if (await isLoginRateLimited(key)) {
    return new Response(LOGIN_RATE_LIMIT_MESSAGE, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as null | { password?: string; next?: string };
  const password = body?.password ?? "";
  const next = body?.next ?? "/";

  if (!verifyPassword(password)) {
    await recordFailedLoginAttempt(key);
    if (await isLoginRateLimited(key)) {
      return new Response(LOGIN_RATE_LIMIT_MESSAGE, { status: 429 });
    }
    return new Response("Invalid password", { status: 401 });
  }

  await clearLoginAttempts(key);

  try {
    cookies.set(SESSION_COOKIE_NAME, issueSessionToken(), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: SESSION_MAX_AGE_SECONDS
    });
  } catch {
    return new Response("Missing SESSION_SECRET on the server.", { status: 500 });
  }

  const redirectTo = next.startsWith("/") ? next : "/";
  return json({ redirectTo });
};
