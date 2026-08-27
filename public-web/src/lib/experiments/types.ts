export type ExperimentVariant = {
  key: string;
  weight: number;
};

export type Experiment = {
  key: string;
  enabled: boolean;
  variants: readonly ExperimentVariant[];
};

export type ExperimentAssignment = {
  experiment: string;
  variant: string;
};
