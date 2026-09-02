import type { Experiment } from "./types";

function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

export const publicThemeExperiment: Experiment = {
  key: "docfoot-experience-v2",
  enabled: enabled(process.env.NEXT_PUBLIC_THEME_EXPERIMENT_ENABLED),
  variants: [
    { key: "data-lab", weight: 34 },
    { key: "match-day", weight: 33 },
    { key: "encyclopedia", weight: 33 },
  ],
};

export const experimentRegistry = [publicThemeExperiment] as const;
