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

// Set true only to test without limits, together with the Vercel Firewall
// rule (paused 2026-09-17, back on the same day). See handoff.md section 20.
const RATE_LIMIT_PAUSED = false;

const handle = createChatHandler({
  ask: askModel,
  systemPrompt: () => buildSystemPrompt(loadGrounding()),
  // Best effort, per instance, and a second layer only: the firewall rule
  // allows 20 per IP per 10 minutes, so this sits slightly above it.
  limiter: RATE_LIMIT_PAUSED ? { take: () => true } : createRateLimiter({ limit: 25, windowMs: 10 * 60_000 }),
});

export default {
  fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};
