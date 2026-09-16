/**
 * The navbar's chat button. The same component renders twice: as static HTML
 * in every page's shell, so the button is there before any script loads, and
 * inside the chat island once a reader first opens it. Keeping one component
 * means the swap is invisible.
 */
import * as React from 'react';
import { Bot } from 'lucide-react';
import { Button } from '../components/ui/button';

export const CHAT_LABEL = 'Ask about this comparison';

export const ChatToggle = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<'button'>>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={CHAT_LABEL}
      title={CHAT_LABEL}
      className={['chat-toggle relative [&[hidden]]:hidden', className].filter(Boolean).join(' ')}
      {...props}
    >
      <Bot aria-hidden="true" />
      {/* A live status dot. It stops pulsing for readers who ask for reduced motion. */}
      <span aria-hidden="true" className="pointer-events-none absolute top-1 right-1 flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-green-500" />
      </span>
    </Button>
  ),
);
ChatToggle.displayName = 'ChatToggle';
