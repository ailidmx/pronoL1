/**
 * Daily analysis counter — localStorage, no auth yet. Enforces the daily limit
 * from the monetization policy (anonymous limit until auth/premium lands).
 */
import { storage, todayKey } from "./storage";

type CounterState = { date: string; count: number };

export function getAnalysisCount(): number {
  const state = storage.get<CounterState>("analysis-counter", { date: todayKey(), count: 0 });
  return state.date === todayKey() ? state.count : 0;
}

export function incrementAnalysisCount(): number {
  const next = getAnalysisCount() + 1;
  storage.set("analysis-counter", { date: todayKey(), count: next });
  return next;
}

export function remainingAnalyses(limit: number): number {
  return Math.max(0, limit - getAnalysisCount());
}

export function canAnalyse(limit: number): boolean {
  return getAnalysisCount() < limit;
}
