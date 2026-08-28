import type { KillBusPayload } from "./types";

export const KILL_BUS_REDIS_KEY =
  process.env.BUILDLOGIC_KILL_BUS_REDIS_KEY ??
  "buildlogic:ai_action_kill_switch";

type RedisLike = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  quit?: () => Promise<unknown>;
};

let redisClient: RedisLike | null | undefined;
let redisPoller: ReturnType<typeof setInterval> | null = null;
let redisCache: { payload: KillBusPayload | null; checkedAt: number } = {
  payload: null,
  checkedAt: 0,
};

const POLL_MS = Number(process.env.BUILDLOGIC_KILL_BUS_POLL_MS ?? 1000);

export function resolveRedisUrl(): string | undefined {
  const url =
    process.env.REDIS_URL ||
    process.env.RATE_LIMIT_REDIS_URL ||
    process.env.BUILDLOGIC_KILL_BUS_REDIS_URL;
  if (!url) return undefined;
  // Skip Upstash REST HTTPS — ioredis needs redis:// / rediss://
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return undefined;
  }
  return url;
}

function getRedisClient(): RedisLike | null {
  if (redisClient !== undefined) return redisClient;
  const url = resolveRedisUrl();
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis") as new (url: string) => RedisLike;
    redisClient = new Redis(url);
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

/** Test helper: inject a fake Redis client. */
export function setRedisClientForTests(client: RedisLike | null): void {
  redisClient = client;
  redisCache = { payload: null, checkedAt: 0 };
}

export function getCachedRedisKillPayload(): KillBusPayload | null {
  return redisCache.payload;
}

export async function readRedisKillPayload(): Promise<KillBusPayload | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(KILL_BUS_REDIS_KEY);
    if (!raw) {
      redisCache = { payload: null, checkedAt: Date.now() };
      return null;
    }
    const parsed = JSON.parse(raw) as KillBusPayload;
    redisCache = { payload: parsed, checkedAt: Date.now() };
    return parsed;
  } catch {
    // Fail-open on Redis read errors only when we have no prior kill cache.
    // If cache already said killed, keep it (fail-close).
    if (redisCache.payload?.active) return redisCache.payload;
    return null;
  }
}

export async function writeRedisKillPayload(
  payload: KillBusPayload
): Promise<void> {
  const client = getRedisClient();
  redisCache = { payload, checkedAt: Date.now() };
  if (!client) return;
  try {
    if (!payload.active) {
      await client.del(KILL_BUS_REDIS_KEY);
      return;
    }
    await client.set(KILL_BUS_REDIS_KEY, JSON.stringify(payload));
  } catch {
    // Write failure: local cache still holds truth for this process.
  }
}

/** Start background poll so sync checkKillSwitch can read a fresh cache. */
export function ensureRedisKillBusPoller(): void {
  if (redisPoller || !resolveRedisUrl()) return;
  void readRedisKillPayload();
  redisPoller = setInterval(() => {
    void readRedisKillPayload();
  }, POLL_MS);
  if (typeof redisPoller.unref === "function") {
    redisPoller.unref();
  }
}

export function stopRedisKillBusPoller(): void {
  if (redisPoller) {
    clearInterval(redisPoller);
    redisPoller = null;
  }
}

/** Apply cached Redis kill into process.env (sync; uses last poll). */
export function applyRedisKillCacheToEnv(): KillBusPayload | null {
  ensureRedisKillBusPoller();
  const payload = redisCache.payload;
  if (!payload) return null;
  if (payload.active) {
    process.env.AI_ACTION_KILL_SWITCH = "true";
    if (payload.aiHstKillToken) {
      process.env.AI_HST_KILL_TOKEN = payload.aiHstKillToken;
    }
  }
  return payload;
}
