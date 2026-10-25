import { parseCallingNotification, type CallingNotification, type NotificationStore } from './notifications.js';

export interface CallingNotificationRouterOptions {
  accountKey: string;
  /** Resolve your backend's recipient field; never infer identity from a call ID. */
  recipientAccount(data: unknown): string | null;
  store: NotificationStore;
  /** Set the root call layer immediately; authentication may still be loading. */
  open(callId: string): void;
  dismiss(callId: string): Promise<void>;
  refresh(): Promise<unknown>;
}
/** Mount for one restored account. Dispose on logout before changing accounts. */
export function createCallingNotificationRouter(options: CallingNotificationRouterOptions) {
  let disposed = false, queue = Promise.resolve();
  const opened = new Set<string>();
  const process = async (data: unknown, tapped: boolean) => {
    if (disposed || options.recipientAccount(data) !== options.accountKey) return false;
    const event = parseCallingNotification(data);
    if (!event) return false;
    const ledger = await options.store.load(options.accountKey);
    if (disposed) return false;
    const now = Date.now();
    for (const [id, entry] of Object.entries(ledger)) if (entry.retainUntil <= now) delete ledger[id];
    const previous = ledger[event.call_id]?.sequence || 0;
    const expires = Date.parse(event.ring_expires_at);
    if (event.sequence > previous) {
      ledger[event.call_id] = {sequence:event.sequence, retainUntil:Math.max(now, expires) + 86400000};
      await options.store.save(options.accountKey, ledger);
    }
    if (disposed) return false;
    if (expires <= now || previous >= 2 || event.sequence === 2) {
      await options.dismiss(event.call_id);
      if (!disposed) await options.refresh();
      return true;
    }
    if (tapped && !opened.has(event.call_id)) {
      opened.add(event.call_id);
      options.open(event.call_id);
      await options.dismiss(event.call_id);
    } else if (!tapped && previous < event.sequence) await options.refresh();
    return true;
  };
  return {
    handle(data: unknown, tapped = false): Promise<boolean> {
      const next = queue.then(() => process(data, tapped));
      queue = next.then(() => {}, () => {}); return next;
    },
    dispose() { disposed = true; opened.clear(); },
  };
}

/** Provider-neutral presentation decision; leave unrelated notifications alone. */
export function callingNotificationPresentation(data: unknown, foreground: boolean): 'screen' | 'notification' | 'dismiss' | null {
  const event: CallingNotification | null = parseCallingNotification(data);
  if (!event) return null;
  if (event.event === 'calling.dismissed' || Date.parse(event.ring_expires_at) <= Date.now()) return 'dismiss';
  return foreground ? 'screen' : 'notification';
}
