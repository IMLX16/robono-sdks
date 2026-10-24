import test from 'node:test';
import assert from 'node:assert/strict';
import { RobonoCallingClient, createHttpTransport } from '../dist/index.js';
import { mergeCallHistory, describeCall } from '../dist/history.js';
test('public build imports without browser globals and preserves finalized history', async () => {
  const client = new RobonoCallingClient({ request: async () => ({ voiceAvailable: true }) });
  assert.deepEqual(await client.availability('bridge:friend'), { voiceAvailable: true });
  assert.equal(typeof createHttpTransport, 'function');
  const entry = { id: 'call', sequence: 1, connectionId: 'bridge:friend', role: 'callee', reason: 'cancelled', createdAt: 100, answeredAt: null, connectedAt: null, endedAt: 200, durationMs: 0 };
  const saved = mergeCallHistory({ cursor: 0, entries: [] }, { entries: [entry], nextCursor: 1, hasMore: false });
  assert.equal(saved.cursor, 1);
  assert.equal(describeCall(saved.entries[0]).label, 'Missed voice call');
  assert.equal(describeCall({ ...entry, connectedAt: 150, durationMs: 62000 }).detail, '1:02');
  await client.dispose();
});
