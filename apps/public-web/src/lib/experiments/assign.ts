import { createHash } from "node:crypto";
import type { Experiment, ExperimentAssignment } from "./types";

export function assignVariant(
  experiment: Experiment,
  subjectId: string,
  salt = process.env.EXPERIMENT_SALT ?? "local-development",
): ExperimentAssignment {
  if (!experiment.enabled || experiment.variants.length === 0) {
    return { experiment: experiment.key, variant: "control" };
  }

  const totalWeight = experiment.variants.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new Error(`Experiment ${experiment.key} must have a positive total weight`);
  }

  const digest = createHash("sha256")
    .update(`${salt}:${experiment.key}:${subjectId}`)
    .digest();
  const bucket = digest.readUInt32BE(0) % totalWeight;
  let cursor = 0;

  for (const candidate of experiment.variants) {
    cursor += candidate.weight;
    if (bucket < cursor) {
      return { experiment: experiment.key, variant: candidate.key };
    }
  }

  return { experiment: experiment.key, variant: experiment.variants[0].key };
}
