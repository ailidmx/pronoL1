/**
 * Temporary premium flag (client-side, localStorage) until auth/premium lands.
 * Replace isPremium() with a real auth/entitlement check later.
 * To test the premium experience: localStorage.setItem("prono:premium", "true").
 */
import { storage } from "./storage";

const KEY = "premium";

export function isPremium(): boolean {
  return storage.get<boolean>(KEY, false);
}

export function setPremium(value: boolean): void {
  storage.set(KEY, value);
}
