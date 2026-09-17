/**
 * `POST /api/chat/`, the results site's one serverless function. Readers ask
 * about the comparison and get answers grounded in the repo's own files.
 * spec/site-spec.md section 14.
 *
 * Vercel serves every file in `api/` as a function. Helpers live in `_lib/`,
 * which the underscore keeps from becoming routes. `vercel.json` sets this
 * function's duration and ships the grounding files with it.
 */
import { buildSystemPrompt, loadGrounding } from './_lib/grounding';
import { createRateLimiter } from './_lib/guard';
import { createChatHandler } from './_lib/handler';
import { askModel } from './_lib/model';

// Paused on 2026-09-17 so the owner can test the advisor freely, together
// with the Vercel Firewall rule. Set back to false when tasks.md says to.
const RATE_LIMIT_PAUSED = true;

const handle = createChatHandler({
  ask: askModel,
  systemPrompt: () => buildSystemPrompt(loadGrounding()),
  // Best effort, per instance. See handoff.md for the durable upgrade.
  limiter: RATE_LIMIT_PAUSED ? { take: () => true } : createRateLimiter({ limit: 12, windowMs: 10 * 60_000 }),
});

export default {
  fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};
