import type { CallHistoryEntry, CallHistoryPage } from './index.mjs';
export interface SavedCallHistory { cursor: number; entries: CallHistoryEntry[] }
export function mergeCallHistory(saved: SavedCallHistory, page: CallHistoryPage): SavedCallHistory;
export function describeCall(entry: CallHistoryEntry): { label: string; detail: string; missed: boolean };
