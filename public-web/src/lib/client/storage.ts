/**
 * Client-side localStorage utilities (the "Compte gratuit" tier features run
 * locally until auth/premium lands). All reads/writes are SSR-safe (guarded by
 * `typeof window`), and namespaced under `prono:`.
 */

const PREFIX = "prono:";

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full / disabled — ignore, features degrade gracefully.
  }
}

export const storage = { get: safeGet, set: safeSet };

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
