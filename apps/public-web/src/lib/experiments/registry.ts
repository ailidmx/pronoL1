import type { Experiment } from "./types";

function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

export const publicThemeExperiment: Experiment = {
  key: "public-theme-v1",
  enabled: enabled(process.env.NEXT_PUBLIC_THEME_EXPERIMENT_ENABLED),
  variants: [
    { key: "control", weight: 50 },
    { key: "editorial", weight: 25 },
    { key: "electric", weight: 25 },
  ],
};

export const experimentRegistry = [publicThemeExperiment] as const;
