/**
 * The lazily loaded half of the chat. `main.ts` imports this on first use;
 * it replaces the static button with the live island and opens the drawer.
 */
import { createRoot } from 'react-dom/client';
import { ChatIsland } from './chat';

export function mountChat(mount: HTMLElement): void {
  createRoot(mount).render(<ChatIsland initialOpen />);
}
