const RATE_LIMIT_BUCKETS = new Map();

function getClientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = String(req?.headers?.["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "unknown").trim() || "unknown";
}

function pruneBucket(bucket = new Map(), now = Date.now()) {
  for (const [key, entry] of bucket.entries()) {
    if (!entry?.resetAt || entry.resetAt <= now) bucket.delete(key);
  }
}

function getBucket(name = "") {
  const bucketName = String(name || "").trim() || "default";
  if (!RATE_LIMIT_BUCKETS.has(bucketName)) {
    RATE_LIMIT_BUCKETS.set(bucketName, new Map());
  }
  const bucket = RATE_LIMIT_BUCKETS.get(bucketName);
  pruneBucket(bucket, Date.now());
  return bucket;
}

function consumeRateLimit({
  bucket = "default",
  key = "unknown",
  limit = 10,
  windowMs = 60_000,
  now = Date.now(),
} = {}) {
  const safeLimit = Math.max(1, Number(limit || 1));
  const safeWindowMs = Math.max(1_000, Number(windowMs || 60_000));
  const normalizedKey = String(key || "unknown").trim() || "unknown";
  const bucketStore = getBucket(bucket);
  const existing = bucketStore.get(normalizedKey);
  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 1,
      remaining: safeLimit - 1,
      limit: safeLimit,
      resetAt: now + safeWindowMs,
      allowed: true,
      retryAfterSeconds: 0,
    };
    bucketStore.set(normalizedKey, next);
    return next;
  }
  const nextCount = existing.count + 1;
  const allowed = nextCount <= safeLimit;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  const next = {
    count: nextCount,
    remaining: allowed ? Math.max(0, safeLimit - nextCount) : 0,
    limit: safeLimit,
    resetAt: existing.resetAt,
    allowed,
    retryAfterSeconds,
  };
  bucketStore.set(normalizedKey, next);
  return next;
}

function applyRateLimitHeaders(res, state = null) {
  if (!res || !state) return;
  res.setHeader("X-RateLimit-Limit", String(state.limit || 0));
  res.setHeader("X-RateLimit-Remaining", String(state.remaining || 0));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(Number(state.resetAt || Date.now()) / 1000)));
  if (!state.allowed && state.retryAfterSeconds) {
    res.setHeader("Retry-After", String(state.retryAfterSeconds));
  }
}

module.exports = {
  applyRateLimitHeaders,
  consumeRateLimit,
  getClientIp,
};

