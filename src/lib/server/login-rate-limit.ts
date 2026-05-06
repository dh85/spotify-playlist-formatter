import { env } from "$env/dynamic/private";

type RateLimitState = {
  attempts: number[];
  blockedUntil: number;
};

const attemptsByKey = new Map<string, RateLimitState>();

export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_BLOCK_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MESSAGE = "Too many login attempts. Please try again later.";

const REDIS_PREFIX = "login_rl";

function getRedisConfig(): { url: string; token: string } | null {
  const url = env.RATE_LIMIT_REDIS_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.RATE_LIMIT_REDIS_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;

  return url && token ? { url, token } : null;
}

function getAttemptsKey(key: string): string {
  return `${REDIS_PREFIX}:${key}:attempts`;
}

function getBlockedKey(key: string): string {
  return `${REDIS_PREFIX}:${key}:blocked`;
}

async function redisCommand(command: string, ...args: string[]): Promise<unknown> {
  const config = getRedisConfig();

  if (!config) {
    throw new Error("Redis backend is not configured.");
  }

  const path = [command, ...args.map((arg) => encodeURIComponent(arg))].join("/");
  const response = await fetch(`${config.url.replace(/\/$/, "")}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` }
  });

  if (!response.ok) {
    throw new Error(`Redis command failed (${response.status}).`);
  }

  const payload = (await response.json().catch(() => null)) as null | { result?: unknown };
  return payload?.result;
}

function shouldUseRedis(): boolean {
  return getRedisConfig() !== null;
}

async function isLoginRateLimitedRedis(key: string): Promise<boolean> {
  const blocked = await redisCommand("GET", getBlockedKey(key));
  return blocked !== null;
}

async function recordFailedLoginAttemptRedis(key: string): Promise<void> {
  const blocked = await isLoginRateLimitedRedis(key);
  if (blocked) return;

  const attemptsKey = getAttemptsKey(key);
  const nextCount = Number(await redisCommand("INCR", attemptsKey));
  if (nextCount === 1) {
    await redisCommand("EXPIRE", attemptsKey, String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
  }

  if (nextCount >= LOGIN_MAX_FAILED_ATTEMPTS) {
    await redisCommand("SET", getBlockedKey(key), "1", "EX", String(Math.ceil(LOGIN_BLOCK_MS / 1000)));
    await redisCommand("DEL", attemptsKey);
  }
}

async function clearLoginAttemptsRedis(key: string): Promise<void> {
  await redisCommand("DEL", getAttemptsKey(key), getBlockedKey(key));
}

function pruneAttempts(state: RateLimitState, now: number): void {
  state.attempts = state.attempts.filter((attemptAt) => now - attemptAt <= LOGIN_WINDOW_MS);
  if (state.blockedUntil <= now) {
    state.blockedUntil = 0;
  }
}

function getOrCreateState(key: string): RateLimitState {
  const existing = attemptsByKey.get(key);
  if (existing) return existing;

  const created: RateLimitState = { attempts: [], blockedUntil: 0 };
  attemptsByKey.set(key, created);
  return created;
}

export function getLoginRateLimitKey(clientAddress: string | undefined): string {
  const address = clientAddress && clientAddress.trim() ? clientAddress.trim() : "unknown";
  return address;
}

export async function isLoginRateLimited(key: string, now = Date.now()): Promise<boolean> {
  if (shouldUseRedis()) {
    try {
      return await isLoginRateLimitedRedis(key);
    } catch (error) {
      console.error("Login rate limit Redis check failed; falling back to in-memory state.", error);
    }
  }

  const state = attemptsByKey.get(key);
  if (!state) return false;

  pruneAttempts(state, now);

  if (state.blockedUntil > now) return true;
  if (!state.attempts.length) {
    attemptsByKey.delete(key);
  }
  return false;
}

export async function recordFailedLoginAttempt(key: string, now = Date.now()): Promise<void> {
  if (shouldUseRedis()) {
    try {
      await recordFailedLoginAttemptRedis(key);
      return;
    } catch (error) {
      console.error("Login rate limit Redis write failed; falling back to in-memory state.", error);
    }
  }

  const state = getOrCreateState(key);
  pruneAttempts(state, now);
  state.attempts.push(now);

  if (state.attempts.length >= LOGIN_MAX_FAILED_ATTEMPTS) {
    state.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

export async function clearLoginAttempts(key: string): Promise<void> {
  if (shouldUseRedis()) {
    try {
      await clearLoginAttemptsRedis(key);
      return;
    } catch (error) {
      console.error("Login rate limit Redis clear failed; falling back to in-memory state.", error);
    }
  }

  attemptsByKey.delete(key);
}

export function resetLoginRateLimitForTests(): void {
  attemptsByKey.clear();
}
