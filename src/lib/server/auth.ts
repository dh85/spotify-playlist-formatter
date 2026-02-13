import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { env } from "$env/dynamic/private";

export const SESSION_COOKIE_NAME = "spf_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  iat: number;
  exp: number;
};

function asBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string | null {
  try {
    return Buffer.from(input, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return cryptoTimingSafeEqual(aBuf, bBuf);
}

function sign(value: string): string {
  if (!env.SESSION_SECRET) {
    throw new Error("Missing SESSION_SECRET.");
  }

  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

export function verifyPassword(candidate: string): boolean {
  if (!env.APP_PASSWORD) return false;
  return safeEqual(candidate, env.APP_PASSWORD);
}

export function issueSessionToken(now = Date.now()): string {
  const payload: SessionPayload = {
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS * 1000
  };
  const encodedPayload = asBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string, now = Date.now()): boolean {
  if (!token || !env.SESSION_SECRET) return false;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0) return false;

  const encodedPayload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  const expectedSignature = sign(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return false;

  const payloadRaw = fromBase64Url(encodedPayload);
  if (!payloadRaw) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return false;
  }

  if (typeof payload !== "object" || payload === null) return false;
  const maybePayload = payload as Partial<SessionPayload>;
  if (typeof maybePayload.exp !== "number" || !Number.isFinite(maybePayload.exp)) return false;

  return now < maybePayload.exp;
}
