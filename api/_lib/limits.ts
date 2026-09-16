/**
 * What one request to the chat function may carry. Every limit is applied on
 * the server, since the client is only a suggestion.
 */

/** The longest message a reader can send in one turn. */
export const MAX_MESSAGE_CHARS = 1000;

/**
 * An earlier answer sent back as history. Answers run longer than questions,
 * so they get more room, but still a fixed amount.
 */
export const MAX_HISTORY_ANSWER_CHARS = 4000;

/** How many earlier messages go back to the model, counting each side's message as one turn. */
export const MAX_HISTORY_TURNS = 6;

/**
 * The model's output ceiling, reasoning included. A short answer needs a few
 * hundred tokens; the rest is headroom for the reasoning the model does first.
 */
export const MAX_OUTPUT_TOKENS = 1200;

/** A request body larger than this is refused before it is parsed. */
export const MAX_BODY_BYTES = 32_000;

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** Trims a message and cuts it to `max` characters. */
export function capMessage(text: string, max = MAX_MESSAGE_CHARS): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/**
 * The history as the model will see it: only well formed user and assistant
 * messages, each capped, empty ones dropped, and only the last
 * `MAX_HISTORY_TURNS` of them. Anything else the client sent is ignored.
 */
export function trimHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns: Turn[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const capped = capMessage(content, role === 'user' ? MAX_MESSAGE_CHARS : MAX_HISTORY_ANSWER_CHARS);
    if (capped) turns.push({ role, content: capped });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}
