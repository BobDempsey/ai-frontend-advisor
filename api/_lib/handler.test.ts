import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './guard';
import { createChatHandler } from './handler';
import type { Turn } from './limits';
import { NOT_CONFIGURED, askModel, type Ask } from './model';

const ORIGIN = 'https://site.example';

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/chat/`, {
    method: 'POST',
    headers: { origin: ORIGIN, host: 'site.example', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function setup(ask?: Ask, limit = 100) {
  const calls: { system: string; turns: readonly Turn[] }[] = [];
  const fake: Ask =
    ask ??
    (async (system, turns) => {
      calls.push({ system, turns });
      return { ok: true, text: 'Take a suite. See [the write-up](/write-up/).' };
    });
  const systemPrompt = vi.fn(() => 'SYSTEM');
  const handle = createChatHandler({ ask: fake, systemPrompt, limiter: createRateLimiter({ limit, windowMs: 60_000 }) });
  return { handle, calls, systemPrompt };
}

const read = async (response: Response) => ({ status: response.status, body: (await response.json()) as { reply?: string; error?: string } });

describe('createChatHandler', () => {
  it('answers a question with the model reply', async () => {
    const { handle, calls } = setup();
    const { status, body } = await read(await handle(post({ message: 'what should I use for my blog?' })));
    expect(status).toBe(200);
    expect(body.reply).toContain('/write-up/');
    expect(calls).toEqual([{ system: 'SYSTEM', turns: [{ role: 'user', content: 'what should I use for my blog?' }] }]);
  });

  it('sends the trimmed history before the capped question', async () => {
    const { handle, calls } = setup();
    const history = Array.from({ length: 13 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    await handle(post({ message: 'q'.repeat(1500), history: [{ role: 'system', content: 'x' }, ...history] }));
    const turns = calls[0]?.turns ?? [];
    expect(turns).toHaveLength(11);
    expect(turns.slice(0, 10).map((t) => t.content)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12']);
    expect(turns[10]).toEqual({ role: 'user', content: 'q'.repeat(1000) });
  });

  it('builds the system prompt once and reuses it', async () => {
    const { handle, systemPrompt } = setup();
    await handle(post({ message: 'one' }));
    await handle(post({ message: 'two' }));
    expect(systemPrompt).toHaveBeenCalledTimes(1);
  });

  it('refuses anything but POST', async () => {
    const { handle, calls } = setup();
    const response = await handle(new Request(`${ORIGIN}/api/chat/`, { headers: { origin: ORIGIN } }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect((await response.json()).error).toMatch(/\w/);
    expect(calls).toHaveLength(0);
  });

  it('refuses a cross-origin or origin-less request', async () => {
    const { handle, calls } = setup();
    expect((await handle(post({ message: 'hi' }, { origin: 'https://evil.example' }))).status).toBe(403);
    const bare = new Request(`${ORIGIN}/api/chat/`, { method: 'POST', body: JSON.stringify({ message: 'hi' }) });
    expect((await handle(bare)).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('rate limits by x-forwarded-for', async () => {
    const { handle, calls } = setup(undefined, 2);
    expect((await handle(post({ message: 'a' }))).status).toBe(200);
    expect((await handle(post({ message: 'b' }))).status).toBe(200);
    const limited = await handle(post({ message: 'c' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await handle(post({ message: 'd' }, { 'x-forwarded-for': '198.51.100.1' }))).status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it('refuses an empty, unreadable, or oversized request', async () => {
    const { handle, calls } = setup();
    expect((await read(await handle(post({ message: '   ' })))).status).toBe(400);
    expect((await read(await handle(post({ nothing: true })))).status).toBe(400);
    expect((await read(await handle(post('{ not json')))).status).toBe(400);
    expect((await read(await handle(post({ message: 'x', history: 'y'.repeat(40_000) })))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('passes a model failure through as a plain sentence', async () => {
    const { handle } = setup(async () => ({ ok: false, message: 'The assistant took too long to answer. Try again in a moment.' }));
    const { status, body } = await read(await handle(post({ message: 'hi' })));
    expect(status).toBe(503);
    expect(body.error).toBe('The assistant took too long to answer. Try again in a moment.');
  });

  it('answers with a sentence when the grounding cannot be read', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handle = createChatHandler({
      ask: async () => ({ ok: true, text: 'never' }),
      systemPrompt: () => {
        throw new Error('results/react-mui.json missing');
      },
      limiter: createRateLimiter({ limit: 10, windowMs: 1000 }),
    });
    const { status, body } = await read(await handle(post({ message: 'hi' })));
    expect(status).toBe(500);
    expect(body.error).not.toContain('results/');
    errors.mockRestore();
  });
});

describe('askModel without a key', () => {
  const saved = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  });

  it('says the assistant is not set up, without calling anything', async () => {
    delete process.env.OPENAI_API_KEY;
    expect(await askModel('SYSTEM', [{ role: 'user', content: 'hi' }])).toEqual({ ok: false, message: NOT_CONFIGURED });
  });

  it('reaches the reader as a 503 with that sentence', async () => {
    delete process.env.OPENAI_API_KEY;
    const handle = createChatHandler({ ask: askModel, systemPrompt: () => 'SYSTEM', limiter: createRateLimiter({ limit: 10, windowMs: 1000 }) });
    const { status, body } = await read(await handle(post({ message: 'hi' })));
    expect(status).toBe(503);
    expect(body.error).toBe(NOT_CONFIGURED);
  });
});
