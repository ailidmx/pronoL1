"use client";

import { useEffect, useState } from "react";
import {
  persistConsent,
  readConsent,
} from "@/lib/google/consent";
import type { ConsentPreferences } from "@/lib/google/types";

export const openPrivacySettingsEvent = "prono-l1:open-privacy-settings";

const acceptAll: ConsentPreferences = { analytics: "granted", advertising: "granted" };
const analyticsOnly: ConsentPreferences = { analytics: "granted", advertising: "denied" };
const rejectAll: ConsentPreferences = { analytics: "denied", advertising: "denied" };

export function ConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = readConsent();
    if (stored) persistConsent(stored);
    else setOpen(true);

    const reopen = () => setOpen(true);
    window.addEventListener(openPrivacySettingsEvent, reopen);
    return () => window.removeEventListener(openPrivacySettingsEvent, reopen);
  }, []);

  function choose(preferences: ConsentPreferences) {
    persistConsent(preferences);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <aside className="consent-banner" aria-labelledby="consent-title" role="dialog" aria-modal="true">
      <div>
        <h2 id="consent-title">Tes choix de confidentialité</h2>
        <p>
          Nous utilisons la mesure d’audience pour améliorer Prono L1 et, avec
          ton accord, des technologies publicitaires pour financer le service.
        </p>
      </div>
      <div className="consent-actions">
        <button onClick={() => choose(rejectAll)}>Tout refuser</button>
        <button onClick={() => choose(analyticsOnly)}>Audience uniquement</button>
        <button className="consent-primary" onClick={() => choose(acceptAll)}>Tout accepter</button>
      </div>
    </aside>
  );
}

export function PrivacySettingsButton() {
  return (
    <button
      className="privacy-settings"
      onClick={() => window.dispatchEvent(new Event(openPrivacySettingsEvent))}
    >
      Gérer mes choix
    </button>
  );
}
