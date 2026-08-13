'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { sendCoachMessage, markCoachThreadRead } from '@/app/[locale]/dash/messages/actions';
import { sendTraineeMessage, markTraineeThreadRead } from '@/app/[locale]/my/messages/actions';

export interface ThreadSummary {
  key: string;
  name: string;
  preview: string | null;
  lastAt: string | null;
  sortKey: number;
  unread: number;
}

export interface ThreadMessage {
  id: string;
  body: string;
  /** True when the signed-in user wrote it. */
  mine: boolean;
  at: string;
}

interface Props {
  locale: string;
  threads: ThreadSummary[];
  activeKey: string | null;
  messages: ThreadMessage[];
  side: 'coach' | 'trainee';
  emptyLabel: string;
}

/**
 * The thread list and the conversation, shared by both sides.
 *
 * One component rather than two because the shapes are identical and the
 * difference is a single action call — and because a coach and a trainee
 * looking at the same conversation from opposite ends should see the same
 * thing, which is much easier to guarantee when it is the same code.
 *
 * A trainee has exactly one thread, so their list collapses to a header.
 */
export function MessagingPanel({
  locale,
  threads,
  activeKey,
  messages,
  side,
  emptyLabel,
}: Props) {
  const isAr = locale === 'ar';
  const router = useRouter();
  const { toast } = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [sending, startSending] = useTransition();

  const active = threads.find((thread) => thread.key === activeKey) ?? null;

  // Land at the newest message, the way every messaging app does.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeKey]);

  // Opening a thread marks it read. Deliberately an effect rather than a
  // click handler: a thread opened by a direct link is just as read as one
  // opened from the list.
  useEffect(() => {
    if (!activeKey || !messages.some((message) => !message.mine)) return;
    const mark = side === 'coach' ? markCoachThreadRead : markTraineeThreadRead;
    void mark(activeKey).then(() => router.refresh());
    // Only when the open thread changes; re-running on every render would
    // write on a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  function send() {
    const text = body.trim();
    if (!text || !activeKey) return;

    startSending(async () => {
      const result =
        side === 'coach'
          ? await sendCoachMessage({ traineeId: activeKey, body: text })
          : await sendTraineeMessage({ body: text });

      if (!result.ok) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line — the convention everywhere
    // else, and the reason nobody has to be told.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  const composer = (
    <div className="flex items-end gap-2 border-t p-3">
      <Textarea
        rows={1}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isAr ? 'اكتب رسالتك…' : 'Write a message…'}
        className="max-h-32 min-h-10 resize-none"
        maxLength={4000}
        disabled={!activeKey}
      />
      <Button size="icon" onClick={send} disabled={sending || !body.trim() || !activeKey}>
        {sending ? <Loader2 className="animate-spin" /> : <Send className="rtl:-scale-x-100" />}
      </Button>
    </div>
  );

  const conversation = (
    <Card className="flex min-h-[28rem] flex-1 flex-col overflow-hidden">
      {active ? (
        <div className="border-b px-4 py-3">
          <p className="font-display font-semibold">{active.name}</p>
        </div>
      ) : null}

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto p-4">
        {!activeKey ? (
          <p className="pt-16 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : messages.length === 0 ? (
          <p className="pt-16 text-center text-sm text-muted-foreground">
            {isAr ? 'ابدأ المحادثة برسالة.' : 'Start the conversation.'}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn('flex', message.mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed',
                  message.mine
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className={cn(
                    'mt-1 text-[0.65rem] tabular-nums',
                    message.mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                  )}
                  dir="ltr"
                >
                  {message.at}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {composer}
    </Card>
  );

  // A trainee has one coach, so there is no list to choose from.
  if (side === 'trainee') return conversation;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="max-h-[32rem] overflow-y-auto">
        <CardContent className="p-2">
          {threads.map((thread) => (
            <button
              key={thread.key}
              type="button"
              onClick={() => router.push(`/dash/messages?t=${thread.key}`)}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg p-3 text-start transition-colors hover:bg-accent/50',
                thread.key === activeKey && 'bg-accent',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{thread.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {thread.preview ?? (isAr ? 'مفيش رسائل' : 'No messages')}
                </span>
              </span>
              {thread.unread > 0 ? <Badge>{thread.unread}</Badge> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      {conversation}
    </div>
  );
}
