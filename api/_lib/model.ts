/**
 * The one place the chat function speaks to the model provider. Nothing else
 * imports the SDK, names the model, or reads the key.
 *
 * `OPENAI_API_KEY` is read at call time, on the server. The browser never sees
 * it: the site only ever calls `/api/chat/`.
 */
import OpenAI from 'openai';
import { MAX_OUTPUT_TOKENS, type Turn } from './limits';

export const MODEL = 'gpt-5.6-luna';

/** Long enough for a slow answer, short enough that nobody waits on a dead one. */
export const TIMEOUT_MS = 30_000;

export type Answer = { ok: true; text: string } | { ok: false; message: string };

/** What the handler calls. Tests pass their own instead of this module's. */
export type Ask = (system: string, turns: readonly Turn[]) => Promise<Answer>;

export const NOT_CONFIGURED = 'The assistant is not set up on this site yet. The scoreboard and the write-up have every figure it would use.';

let client: OpenAI | null = null;

function provider(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  client ??= new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/**
 * One question, one answer. Every failure comes back as a plain sentence for
 * the reader rather than a thrown error; the detail goes to the log.
 */
export const askModel: Ask = async (system, turns) => {
  const openai = provider();
  if (!openai) return { ok: false, message: NOT_CONFIGURED };

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      // This model only refuses a reasoning effort when function tools are
      // sent. There are no tools here, so a little reasoning is allowed, and
      // low keeps a short grounded answer quick.
      reasoning_effort: 'low',
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'system', content: system }, ...turns.map((t) => ({ role: t.role, content: t.content }))],
    });
    const choice = completion.choices[0];
    const text = (choice?.message.refusal ?? choice?.message.content ?? '').trim();
    if (text) return { ok: true, text };
    if (choice?.finish_reason === 'length') {
      return { ok: false, message: 'The answer ran too long and was cut off. Try a narrower question.' };
    }
    return { ok: false, message: 'The assistant did not answer. Try asking again.' };
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return { ok: false, message: 'The assistant took too long to answer. Try again in a moment.' };
    }
    if (error instanceof OpenAI.RateLimitError) {
      return { ok: false, message: 'The assistant is busy right now. Try again in a minute.' };
    }
    if (error instanceof OpenAI.APIError) {
      return { ok: false, message: 'The assistant is unavailable right now. Try again later.' };
    }
    return { ok: false, message: 'The assistant could not be reached.' };
  }
};
