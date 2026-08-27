export type AnalyticsEvent = {
  name: string;
  parameters?: Record<string, string | number | boolean>;
};

export function trackEvent({ name, parameters = {} }: AnalyticsEvent) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, parameters);
}

export function trackGoogleAdsConversion(
  destination: string,
  parameters: Record<string, string | number> = {},
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", { send_to: destination, ...parameters });
}
