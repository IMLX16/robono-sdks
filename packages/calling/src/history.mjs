// Pure helpers shared by clients; only finalized server records enter history.
export function mergeCallHistory(saved, page) {
  if (!page || !Array.isArray(page.entries) || !Number.isSafeInteger(page.nextCursor) ||
      page.nextCursor < saved.cursor || typeof page.hasMore !== 'boolean') throw Error('invalid_call_history');
  const byId = new Map(saved.entries.map(entry => [entry.id, entry]));
  let sequence = saved.cursor;
  for (const entry of page.entries) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.connectionId !== 'string' ||
        !['caller', 'callee'].includes(entry.role) || typeof entry.reason !== 'string' ||
        !Number.isSafeInteger(entry.sequence) || entry.sequence <= sequence || entry.sequence > page.nextCursor ||
        !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.endedAt) ||
        !Number.isFinite(entry.durationMs) || entry.durationMs < 0 ||
        entry.connectedAt !== null && !Number.isFinite(entry.connectedAt)) throw Error('invalid_call_history');
    sequence = entry.sequence;
    byId.set(entry.id, entry);
  }
  if (page.hasMore && page.nextCursor <= saved.cursor) throw Error('invalid_call_history');
  return { cursor: page.nextCursor, entries: [...byId.values()].sort((a,b) => a.sequence - b.sequence) };
}
export function describeCall(entry) {
  const incoming = entry.role === 'callee';
  if (entry.connectedAt != null) return { label: incoming ? 'Incoming voice call' : 'Outgoing voice call',
    detail: `${Math.floor(entry.durationMs / 60000)}:${String(Math.floor(entry.durationMs / 1000) % 60).padStart(2, '0')}`, missed: false };
  if (entry.reason === 'declined') return { label: incoming ? 'Declined voice call' : 'Call declined', detail: '', missed: incoming };
  if (['cancelled', 'no_answer'].includes(entry.reason)) return { label: incoming ? 'Missed voice call' : entry.reason === 'cancelled' ? 'Cancelled voice call' : 'No answer', detail: '', missed: incoming };
  return { label: 'Call couldn’t connect', detail: '', missed: incoming };
}
