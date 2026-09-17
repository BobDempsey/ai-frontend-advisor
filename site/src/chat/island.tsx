/**
 * The lazily loaded half of the chat. `main.ts` imports this on first use;
 * it replaces the static button with the live island and opens the drawer,
 * sending `question` as the first message when it is not empty.
 */
import { createRoot } from 'react-dom/client';
import { ChatIsland } from './chat';

export function mountChat(mount: HTMLElement, question = ''): void {
  createRoot(mount).render(<ChatIsland initialOpen initialQuestion={question} />);
}
