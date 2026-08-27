const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID?.trim() ?? "";
const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() ?? "";

export const googleTagConfig = {
  analyticsId: /^G-[A-Z0-9]+$/.test(gaId) ? gaId : null,
  adsId: /^AW-[0-9]+$/.test(adsId) ? adsId : null,
} as const;

export const primaryGoogleTagId =
  googleTagConfig.analyticsId ?? googleTagConfig.adsId;
