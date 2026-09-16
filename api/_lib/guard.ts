/**
 * The two checks that run before a request costs anything: the request came
 * from a page on this site, and its sender has not asked too often.
 */

/**
 * Whether the request's Origin names the host it was sent to. Browsers send
 * Origin on every POST from `fetch`, so a missing one is refused too. The host
 * comes from the Host header, falling back to the request URL.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = request.headers.get('host') ?? new URL(request.url).host;
  return originHost.toLowerCase() === host.toLowerCase();
}

/**
 * The sender's address, as the first entry of `x-forwarded-for`. Vercel sets
 * that header itself. Without it, every such request shares one bucket.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || 'unknown';
}

export interface RateLimiterOptions {
  /** Requests allowed per key inside one window. */
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface RateLimiter {
  /** Records one request for `key` and says whether it is allowed. */
  take(key: string): boolean;
}

/**
 * A sliding window per key, kept in this instance's memory. It is best effort:
 * each function instance counts on its own and forgets on a cold start, so a
 * determined sender can exceed it. A durable limit needs a shared store.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  const sweep = (at: number) => {
    for (const [key, times] of hits) {
      const recent = times.filter((t) => at - t < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
    lastSweep = at;
  };

  return {
    take(key) {
      const at = now();
      // Keys that stopped asking are dropped once a window, so the map stays small.
      if (at - lastSweep >= windowMs) sweep(at);
      const recent = (hits.get(key) ?? []).filter((t) => at - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(at);
      hits.set(key, recent);
      return true;
    },
  };
}
