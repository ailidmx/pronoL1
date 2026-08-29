import type { ConsentPreferences } from "./types";

export const consentStorageKey = "prono-l1-consent-v1";
export const consentChangedEvent = "prono-l1:consent-changed";

export function updateGoogleConsent(preferences: ConsentPreferences) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("consent", "update", {
    analytics_storage: preferences.analytics,
    ad_storage: preferences.advertising,
    ad_user_data: preferences.advertising,
    ad_personalization: preferences.advertising,
  });
}

export function persistConsent(preferences: ConsentPreferences) {
  localStorage.setItem(consentStorageKey, JSON.stringify(preferences));
  updateGoogleConsent(preferences);
  window.dispatchEvent(new CustomEvent(consentChangedEvent, { detail: preferences }));
}

export function readConsent(): ConsentPreferences | null {
  try {
    const stored = localStorage.getItem(consentStorageKey);
    if (!stored) return null;
    const value = JSON.parse(stored) as ConsentPreferences;
    if (!["granted", "denied"].includes(value.analytics)) return null;
    if (!["granted", "denied"].includes(value.advertising)) return null;
    return value;
  } catch {
    return null;
  }
}
