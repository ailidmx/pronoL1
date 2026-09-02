"use client";

import Script from "next/script";
import { useEffect } from "react";
import { consentChangedEvent, consentStorageKey } from "@/lib/google/consent";
import { publicThemeExperiment } from "@/lib/experiments/registry";
import { publicExperienceChangedEvent, publicExperienceStorageKey } from "@/lib/experiments/client";

const visitorStorageKey = "prono-l1-visitor-id-v1";
const assignmentStorageKey = publicExperienceStorageKey;
const exposureStorageKey = "docfoot-exposure-experience-v2";
const experimentKey = publicThemeExperiment.key;
const experimentEnabled = publicThemeExperiment.enabled;
const experimentSalt = process.env.NEXT_PUBLIC_EXPERIMENT_SALT ?? "";
const experimentVariants = publicThemeExperiment.variants;

const bootstrap = `(() => {
  const enabled = ${experimentEnabled ? "true" : "false"};
  const visitorKey = ${JSON.stringify(visitorStorageKey)};
  const assignmentKey = ${JSON.stringify(assignmentStorageKey)};
  const experimentKey = ${JSON.stringify(experimentKey)};
  const salt = ${JSON.stringify(experimentSalt)};
  const variants = ${JSON.stringify(experimentVariants)};
  let visitorId = localStorage.getItem(visitorKey);
  if (!visitorId) {
    visitorId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem(visitorKey, visitorId);
  }
  const allowedVariants = variants.map((item) => item.key);
  let variant = localStorage.getItem(assignmentKey);
  if (!variant || !allowedVariants.includes(variant)) {
    variant = variants[0]?.key || "data-lab";
  }
  if (enabled && variants.length && !localStorage.getItem(assignmentKey)) {
    const totalWeight = variants.reduce((sum, item) => sum + item.weight, 0);
    const source = salt + ":" + experimentKey + ":" + visitorId;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = (hash >>> 0) % totalWeight;
    let cursor = 0;
    for (const candidate of variants) {
      cursor += candidate.weight;
      if (bucket < cursor) { variant = candidate.key; break; }
    }
  }
  localStorage.setItem(assignmentKey, variant);
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
      properties: {
        experiment: experimentKey,
        variant,
        [`$feature/${experimentKey}`]: variant,
      },
    }),
  }).catch(() => undefined);
}

export function ExperimentBootstrap() {
  useEffect(() => {
    void captureExposure();
    const onConsentChanged = () => void captureExposure();
    const onExperienceChanged = () => void captureExposure();
    window.addEventListener(consentChangedEvent, onConsentChanged);
    window.addEventListener(publicExperienceChangedEvent, onExperienceChanged);
    return () => {
      window.removeEventListener(consentChangedEvent, onConsentChanged);
      window.removeEventListener(publicExperienceChangedEvent, onExperienceChanged);
    };
  }, []);
  return <Script id="public-experiment-bootstrap" strategy="beforeInteractive">{bootstrap}</Script>;
}

declare global {
  interface Window { __PRONO_EXPERIMENTS__?: Record<string, string>; }
}
