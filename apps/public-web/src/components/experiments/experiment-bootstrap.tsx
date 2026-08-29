"use client";

import Script from "next/script";
import { useEffect } from "react";
import { consentStorageKey } from "@/lib/google/consent";

const visitorStorageKey = "prono-l1-visitor-id-v1";
const exposureStorageKey = "prono-l1-exposure-public-theme-v1";
const experimentKey = "public-theme-v1";
const experimentEnabled = process.env.NEXT_PUBLIC_THEME_EXPERIMENT_ENABLED === "true" || process.env.NEXT_PUBLIC_THEME_EXPERIMENT_ENABLED === "1";

const bootstrap = `(() => {
  const enabled = ${experimentEnabled ? "true" : "false"};
  const visitorKey = ${JSON.stringify(visitorStorageKey)};
  const experimentKey = ${JSON.stringify(experimentKey)};
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) {
    visitorId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem(visitorKey, visitorId);
  }
  let variant = "control";
  if (enabled) {
    const source = experimentKey + ":" + visitorId;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = (hash >>> 0) % 100;
    variant = bucket < 50 ? "control" : bucket < 75 ? "editorial" : "electric";
  }
  document.documentElement.dataset.publicTheme = variant;
  window.__PRONO_EXPERIMENTS__ = { ...(window.__PRONO_EXPERIMENTS__ || {}), [experimentKey]: variant };
})();`;

function hasAnalyticsConsent() {
  try {
    const raw = localStorage.getItem(consentStorageKey);
    if (!raw) return false;
    const value = JSON.parse(raw) as { analytics?: string };
    return value.analytics === "granted";
  } catch {
    return false;
  }
}

async function captureExposure() {
  if (!experimentEnabled || !hasAnalyticsConsent()) return;
  const visitorId = localStorage.getItem(visitorStorageKey);
  const variant = window.__PRONO_EXPERIMENTS__?.[experimentKey];
  if (!visitorId || !variant) return;

  const exposureKey = `${exposureStorageKey}:${variant}`;
  if (sessionStorage.getItem(exposureKey)) return;
  sessionStorage.setItem(exposureKey, "1");

  await fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event: "experiment_exposure",
      distinctId: visitorId,
      properties: { experiment: experimentKey, variant },
    }),
  }).catch(() => undefined);
}

export function ExperimentBootstrap() {
  useEffect(() => {
    void captureExposure();
    const onConsentChanged = () => void captureExposure();
    window.addEventListener("prono-l1:consent-changed", onConsentChanged);
    return () => window.removeEventListener("prono-l1:consent-changed", onConsentChanged);
  }, []);

  return <Script id="public-experiment-bootstrap" strategy="beforeInteractive">{bootstrap}</Script>;
}

declare global {
  interface Window {
    __PRONO_EXPERIMENTS__?: Record<string, string>;
  }
}
