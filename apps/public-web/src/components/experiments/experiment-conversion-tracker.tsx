"use client";

import { useEffect } from "react";
import { readConsent } from "@/lib/google/consent";
import { trackEvent } from "@/lib/google/events";
import { publicThemeExperiment } from "@/lib/experiments/registry";

const visitorStorageKey = "prono-l1-visitor-id-v1";

function capture(event: string, properties: Record<string, string> = {}) {
  if (!publicThemeExperiment.enabled || readConsent()?.analytics !== "granted") return;
  const distinctId = localStorage.getItem(visitorStorageKey);
  const variant = window.__PRONO_EXPERIMENTS__?.[publicThemeExperiment.key];
  if (!distinctId || !variant) return;

  const experimentProperties = {
    experiment: publicThemeExperiment.key,
    variant,
    ...properties,
    [`$feature/${publicThemeExperiment.key}`]: variant,
  };

  trackEvent({ name: event, parameters: experimentProperties });
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ event, distinctId, properties: experimentProperties }),
  }).catch(() => undefined);
}

export function ExperimentConversionTracker() {
  useEffect(() => {
    const clicked = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-experiment-action]") : null;
      if (!target) return;
      capture("experiment_cta_clicked", {
        action: target.dataset.experimentAction ?? "unknown",
        location: target.dataset.experimentLocation ?? "unknown",
      });
    };

    const viewed = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
        const section = entry.target.dataset.experimentSection;
        if (!section || viewed.has(section)) return;
        viewed.add(section);
        capture("experiment_section_viewed", { section });
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    document.addEventListener("click", clicked);
    document.querySelectorAll<HTMLElement>("[data-experiment-section]").forEach((element) => observer.observe(element));
    return () => {
      document.removeEventListener("click", clicked);
      observer.disconnect();
    };
  }, []);

  return null;
}
