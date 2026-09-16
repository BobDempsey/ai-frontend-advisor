/**
 * The chat conversation, kept for as long as the tab is open. One
 * sessionStorage key for the whole site, so the conversation follows the
 * reader from page to page. Storage can be missing or throw, so every access
 * is guarded and the conversation then lives in memory only.
 */
export interface Entry {
  role: 'user' | 'assistant';
  content: string;
  /** A failure sentence from the function, shown but never sent back. */
  failed?: boolean;
}

export const STORAGE_KEY = 'uilc-chat';

export function readConversation(): Entry[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        typeof e === 'object' && e !== null && (e.role === 'user' || e.role === 'assistant') && typeof e.content === 'string',
    );
  } catch {
    return [];
  }
}

export function writeConversation(entries: Entry[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Nothing to keep it in. The conversation lasts for this page view.
  }
}

export function clearConversation(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** What goes back to the function: what was said, without failures. */
export function asHistory(entries: Entry[]): { role: Entry['role']; content: string }[] {
  return entries.filter((e) => !e.failed && e.content.trim()).map((e) => ({ role: e.role, content: e.content }));
}
