import type { Experiment } from "./types";

export const experiments = {
  freeAnalysisQuota: {
    key: "free-analysis-quota-v1",
    enabled: true,
    variants: [
      { key: "quota-5", weight: 50 },
      { key: "quota-8", weight: 50 },
    ],
  },
  registrationPrompt: {
    key: "registration-prompt-v1",
    enabled: true,
    variants: [
      { key: "prono-first", weight: 50 },
      { key: "premium-first", weight: 50 },
    ],
  },
} satisfies Record<string, Experiment>;
