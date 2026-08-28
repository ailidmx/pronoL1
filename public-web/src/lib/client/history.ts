/**
 * View history (recently viewed matches) — localStorage, no auth yet.
 * Most-recent first, capped at MAX_ENTRIES.
 */
import { storage } from "./storage";

const MAX_ENTRIES = 30;

export type HistoryEntry = { matchId: string; title: string; viewedAt: string };

export function getHistory(): HistoryEntry[] {
  return storage.get<HistoryEntry[]>("history", []);
}

export function recordMatchView(entry: Omit<HistoryEntry, "viewedAt">): void {
  const history = getHistory().filter((item) => item.matchId !== entry.matchId);
  history.unshift({ ...entry, viewedAt: new Date().toISOString() });
  storage.set("history", history.slice(0, MAX_ENTRIES));
}

export function clearHistory(): void {
  storage.set("history", []);
}
