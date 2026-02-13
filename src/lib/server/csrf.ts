export const CSRF_ERROR_MESSAGE = "Invalid request origin.";

function getOriginFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isSameOriginPostRequest(request: Request, url: URL): boolean {
  const expectedOrigin = url.origin;
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return getOriginFromReferer(referer) === expectedOrigin;
  }

  return false;
}
