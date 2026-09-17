/**
 * A reader-side count of chat questions, so the drawer can warn before the
 * Vercel Firewall rule starts refusing them. The rule (handoff.md section 17)
 * allows QUESTION_LIMIT per IP per window and does not report what is left,
 * so this counts the questions this browser sent. It is a hint, not the
 * limit: the firewall decides, and a 429 from it marks the count as spent.
 *
 * localStorage, so the count survives new tabs. Storage can be missing or
 * throw; the count then lives for this page view only.
 */
export const QUESTION_LIMIT = 10;
/**
 * False while the firewall rule is paused for testing (2026-09-17): the count
 * then never moves, so the drawer shows nothing and never disables Send.
 */
export const QUOTA_ENABLED = false;
/** Show the count once this many questions are used. */
export const WARN_AFTER = 5;
/** The firewall rule's window. Kept here only to expire old entries. */
const WINDOW_MS = 10 * 60_000;
const KEY = 'uilc-chat-quota';

let memory: number[] = [];

function read(now: number): number[] {
  let stamps = memory;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(parsed)) stamps = parsed.filter((t): t is number => typeof t === 'number');
  } catch {
    // Fall back to the in-memory count.
  }
  return stamps.filter((t) => now - t < WINDOW_MS);
}

function write(stamps: number[]): void {
  memory = stamps;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stamps));
  } catch {
    // The in-memory count is all there is.
  }
}

/** Questions left before the firewall is expected to refuse, never below zero. */
export function questionsLeft(now = Date.now()): number {
  if (!QUOTA_ENABLED) return QUESTION_LIMIT;
  return Math.max(0, QUESTION_LIMIT - read(now).length);
}

export function recordQuestion(now = Date.now()): void {
  write([...read(now), now]);
}

/** The firewall refused a question, so treat the allowance as spent. */
export function markSpent(now = Date.now()): void {
  const stamps = read(now);
  write([...stamps, ...Array.from({ length: Math.max(0, QUESTION_LIMIT - stamps.length) }, () => now)]);
}
