import type { CallingController } from './types.js';
export interface CallingNotification {
  event: 'calling.incoming' | 'calling.dismissed'; event_id: string; call_id: string;
  connection_id: string; ring_expires_at: string; sequence: 1 | 2;
}
export interface NotificationLedger { [callId: string]: {sequence: number; retainUntil: number} }
export interface NotificationStore {
  load(accountKey: string): Promise<NotificationLedger>;
  save(accountKey: string, ledger: NotificationLedger): Promise<void>;
}
/** Works with AsyncStorage or another durable, account-safe key/value store. */
export function createCallingNotificationStore(storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}, prefix = '@robono/calling-notifications/'): NotificationStore {
  return {
    async load(accountKey) {
      const raw = await storage.getItem(prefix + encodeURIComponent(accountKey));
      if (!raw) return Object.create(null) as NotificationLedger;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('calling_notification_store_invalid');
      const ledger: NotificationLedger = Object.create(null);
      for (const [key, entry] of Object.entries(data)) {
        const value = entry as {sequence?: number; retainUntil?: number} | null;
        if (!value || ![1, 2].includes(value.sequence!) || !Number.isFinite(value.retainUntil)) throw Error('calling_notification_store_invalid');
        if (value.retainUntil! > Date.now()) ledger[key] = {sequence:value.sequence!, retainUntil:value.retainUntil!};
      }
      return ledger;
    },
    save: (accountKey, ledger) => storage.setItem(prefix + encodeURIComponent(accountKey), JSON.stringify(ledger)),
  };
}
export function parseCallingNotification(data: unknown): CallingNotification | null {
  if (!data || typeof data !== 'object') return null;
  const p = data as Record<string, unknown>;
  if (!['calling.incoming', 'calling.dismissed'].includes(String(p.event))) return null;
  if (['call_id', 'event_id', 'connection_id'].some(key => typeof p[key] !== 'string' || !p[key] || (p[key] as string).length > 256)) return null;
  if (typeof p.ring_expires_at !== 'string' || !Number.isFinite(Date.parse(p.ring_expires_at))) return null;
  if (p.sequence !== (p.event === 'calling.incoming' ? 1 : 2)) return null;
  return {event: p.event, event_id: p.event_id, call_id: p.call_id, connection_id: p.connection_id, ring_expires_at: p.ring_expires_at, sequence: p.sequence} as CallingNotification;
}
/** Host retains its push provider, credentials and notification handler. */
export function createCallingNotificationHandler(options: {
  controller: CallingController; accountKey: string; store: NotificationStore;
  dismiss(callId: string): Promise<void>;
}) {
  let queue = Promise.resolve(), disposed = false;
  const process = async (data: unknown, opened: boolean) => {
    if (disposed) return false;
    const event = parseCallingNotification(data); if (!event) return false;
    const ledger = await options.store.load(options.accountKey);
    if (disposed) return false;
    const now = Date.now();
    for (const [id, value] of Object.entries(ledger)) if (value.retainUntil < now) delete ledger[id];
    const previous = ledger[event.call_id]?.sequence || 0;
    const expired = Date.parse(event.ring_expires_at) <= now;
    if (event.sequence > previous) {
      ledger[event.call_id] = {sequence: event.sequence, retainUntil: Math.max(now, Date.parse(event.ring_expires_at)) + 86400000};
      await options.store.save(options.accountKey, ledger);
    }
    if (disposed) return false;
    if (previous >= 2 || event.sequence === 2 || expired) {
      await options.dismiss(event.call_id);
      // State refresh clears stale invitations but does not hang up an answered call.
      await options.controller.refresh(); return false;
    }
    if (opened) return options.controller.openIncoming(event.call_id);
    if (previous >= event.sequence) return false;
    // A push alone never authorizes microphone capture or an Answer button.
    await options.controller.refresh(); return true;
  };
  return {
    handle(data: unknown, options: {opened?: boolean} = {}): Promise<boolean> {
      const next = queue.then(() => process(data, !!options.opened));
      queue = next.then(() => {}, () => {}); return next;
    },
    dispose() { disposed = true; },
  };
}
