import "server-only";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitBucket>;

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

const STORE_KEY = "__eventrl_rate_limit_store__";
const GC_KEY = "__eventrl_rate_limit_gc__";

function getStore(): RateLimitStore {
  const globalState = globalThis as typeof globalThis & {
    [STORE_KEY]?: RateLimitStore;
    [GC_KEY]?: number;
  };

  if (!globalState[STORE_KEY]) {
    globalState[STORE_KEY] = new Map<string, RateLimitBucket>();
  }

  return globalState[STORE_KEY];
}

function maybeGcExpiredBuckets(now: number) {
  const globalState = globalThis as typeof globalThis & {
    [GC_KEY]?: number;
  };
  const lastGcAt = globalState[GC_KEY] ?? 0;
  if (now - lastGcAt < 60_000) {
    return;
  }

  const store = getStore();
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
  globalState[GC_KEY] = now;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  maybeGcExpiredBuckets(now);
  const store = getStore();
  const existing = store.get(params.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + params.windowMs;
    store.set(params.key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: params.limit,
      remaining: Math.max(params.limit - 1, 0),
      retryAfterSeconds: Math.ceil(params.windowMs / 1000),
    };
  }

  existing.count += 1;
  store.set(params.key, existing);

  const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
  const remaining = Math.max(params.limit - existing.count, 0);

  if (existing.count > params.limit) {
    return {
      allowed: false,
      limit: params.limit,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    limit: params.limit,
    remaining,
    retryAfterSeconds,
  };
}

export function applyRateLimitHeaders(response: Response, result: RateLimitResult) {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
}
