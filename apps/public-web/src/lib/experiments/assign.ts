import type { Experiment, ExperimentAssignment } from "./types";

export function experimentBucket(source: string, totalWeight: number) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % totalWeight;
}

export function assignVariant(
  experiment: Experiment,
  subjectId: string,
  salt = process.env.NEXT_PUBLIC_EXPERIMENT_SALT ?? "",
): ExperimentAssignment {
  if (!experiment.enabled || experiment.variants.length === 0) {
    return { experiment: experiment.key, variant: "control" };
  }

  const totalWeight = experiment.variants.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new Error(`Experiment ${experiment.key} must have a positive total weight`);
  }

  const bucket = experimentBucket(`${salt}:${experiment.key}:${subjectId}`, totalWeight);
  let cursor = 0;

  for (const candidate of experiment.variants) {
    cursor += candidate.weight;
    if (bucket < cursor) {
      return { experiment: experiment.key, variant: candidate.key };
    }
  }

  return { experiment: experiment.key, variant: experiment.variants[0].key };
}
