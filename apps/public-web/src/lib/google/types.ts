export type ConsentValue = "granted" | "denied";

export type ConsentPreferences = {
  analytics: ConsentValue;
  advertising: ConsentValue;
};

export type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: Gtag;
  }
}
