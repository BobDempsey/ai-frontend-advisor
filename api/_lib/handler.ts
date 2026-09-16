/**
 * The chat function's request handling, with everything it depends on passed
 * in, so tests can drive it with a fake model and a fake clock.
 *
 * Request: POST JSON `{ message: string, history?: { role, content }[] }`.
 * Response: JSON `{ reply: string }` on success, or `{ error: string }` with a
 * plain sentence the site shows as is.
 */
import { clientIp, isSameOrigin, type RateLimiter } from './guard';
import { MAX_BODY_BYTES, capMessage, trimHistory } from './limits';
import type { Ask } from './model';

export interface HandlerDeps {
  ask: Ask;
  /** Built once per instance, and only when the first valid request needs it. */
  systemPrompt: () => string;
  limiter: RateLimiter;
}

const json = (status: number, body: { reply: string } | { error: string }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const fail = (status: number, error: string, headers?: Record<string, string>) => json(status, { error }, headers);

export function createChatHandler({ ask, systemPrompt, limiter }: HandlerDeps): (request: Request) => Promise<Response> {
  let prompt: string | undefined;

  return async (request) => {
    if (request.method !== 'POST') {
      return fail(405, 'This address only answers questions sent from the site.', { allow: 'POST' });
    }
    if (!isSameOrigin(request)) {
      return fail(403, 'Questions can only be sent from this site.');
    }
    if (!limiter.take(clientIp(request))) {
      return fail(429, 'That is a lot of questions in a short time. Wait a few minutes and try again.', { 'retry-after': '600' });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'That conversation is too long to send. Start again and ask once more.');
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, 'The question could not be read. Try sending it again.');
    }
    const { message, history } = (typeof body === 'object' && body !== null ? body : {}) as { message?: unknown; history?: unknown };
    const question = typeof message === 'string' ? capMessage(message) : '';
    if (!question) return fail(400, 'Type a question first.');

    try {
      prompt ??= systemPrompt();
    } catch (error) {
      console.error(error);
      return fail(500, 'The assistant cannot read the comparison right now. Try again later.');
    }

    const answer = await ask(prompt, [...trimHistory(history), { role: 'user', content: question }]);
    return answer.ok ? json(200, { reply: answer.text }) : fail(503, answer.message);
  };
}
