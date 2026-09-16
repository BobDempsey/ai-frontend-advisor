import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter, isSameOrigin } from './guard';

const request = (headers: Record<string, string>, url = 'https://site.example/api/chat/') =>
  new Request(url, { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('accepts an Origin that names the host the request went to', () => {
    expect(isSameOrigin(request({ origin: 'https://site.example', host: 'site.example' }))).toBe(true);
  });

  it('falls back to the request URL when there is no Host header', () => {
    expect(isSameOrigin(request({ origin: 'https://site.example' }))).toBe(true);
  });

  it('refuses another site', () => {
    expect(isSameOrigin(request({ origin: 'https://evil.example', host: 'site.example' }))).toBe(false);
    expect(isSameOrigin(request({ origin: 'https://site.example.evil.example', host: 'site.example' }))).toBe(false);
  });

  it('refuses a missing or unreadable Origin', () => {
    expect(isSameOrigin(request({ host: 'site.example' }))).toBe(false);
    expect(isSameOrigin(request({ origin: 'null', host: 'site.example' }))).toBe(false);
  });

  it('treats a different port as a different origin', () => {
    expect(isSameOrigin(request({ origin: 'http://127.0.0.1:9999', host: '127.0.0.1:4300' }))).toBe(false);
  });
});

describe('clientIp', () => {
  it('takes the first address in x-forwarded-for', () => {
    expect(clientIp(request({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('shares one bucket when the header is missing', () => {
    expect(clientIp(request({}))).toBe('unknown');
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit in a window, then refuses', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => now });
    expect([1, 2, 3, 4].map(() => limiter.take('a'))).toEqual([true, true, true, false]);
    // Another sender has its own count.
    expect(limiter.take('b')).toBe(true);
    now = 999;
    expect(limiter.take('a')).toBe(false);
  });

  it('allows again once the earlier requests leave the window', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    limiter.take('a');
    now = 500;
    limiter.take('a');
    expect(limiter.take('a')).toBe(false);
    now = 1000;
    // The first request has aged out, the second has not.
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    now = 3000;
    expect(limiter.take('a')).toBe(true);
  });

  it('does not count a refused request against the sender', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    limiter.take('a');
    for (let i = 0; i < 5; i += 1) limiter.take('a');
    now = 1000;
    expect(limiter.take('a')).toBe(true);
  });
});
