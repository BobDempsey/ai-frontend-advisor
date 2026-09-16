/**
 * Entry for the chat island, the one module script on every page. The page
 * itself stays static HTML; this renders into the shell's `#chat-root`
 * placeholder and touches nothing else.
 */
import { createRoot } from 'react-dom/client';
import { ChatIsland } from './chat';

const mount = document.getElementById('chat-root');
if (mount) createRoot(mount).render(<ChatIsland />);
