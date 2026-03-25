import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export type PublicTokenRateLimitOptions = {
  windowMs: number;
  max: number;
};

export function createPublicTokenRateLimit(options: PublicTokenRateLimitOptions) {
  const { windowMs, max } = options;
  const buckets = new Map<string, Bucket>();

  return function publicTokenRateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = clientKey(req);
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        code: "rate_limited",
        message: "Too many requests. Try again later.",
      });
      return;
    }

    next();
  };
}
