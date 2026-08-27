export type MonetizationModel = "open" | "balanced" | "subscription-first";

export type MonetizationPolicy = {
  adsEnabled: boolean;
  anonymousDailyAnalysisLimit: number | null;
  registeredDailyAnalysisLimit: number | null;
  premiumRequiredForAdvancedHistory: boolean;
};

const policies: Record<MonetizationModel, MonetizationPolicy> = {
  open: {
    adsEnabled: true,
    anonymousDailyAnalysisLimit: null,
    registeredDailyAnalysisLimit: null,
    premiumRequiredForAdvancedHistory: false,
  },
  balanced: {
    adsEnabled: true,
    anonymousDailyAnalysisLimit: 5,
    registeredDailyAnalysisLimit: 10,
    premiumRequiredForAdvancedHistory: true,
  },
  "subscription-first": {
    adsEnabled: false,
    anonymousDailyAnalysisLimit: 3,
    registeredDailyAnalysisLimit: 5,
    premiumRequiredForAdvancedHistory: true,
  },
};

export function getMonetizationPolicy(
  model = process.env.MONETIZATION_MODEL ?? "balanced",
): MonetizationPolicy {
  if (!(model in policies)) {
    throw new Error(`Unknown monetization model: ${model}`);
  }
  return policies[model as MonetizationModel];
}
