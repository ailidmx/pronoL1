/**
 * Pronostics domain — matches/{matchId}/pronostics/{userId}.
 * A user predicts the exact score of a match before kick-off.
 */
import { isNullableInteger, validateFields } from "./validation.js";
import { buildPayload } from "./payload-builders.js";

const score = (value) => isNullableInteger(value, { min: 0, max: 99 });

export const PRONOSTIC_FIELDS = {
  scoreDom: score,
  scoreExt: score,
};

export function validatePronostic(data) {
  return validateFields(data, PRONOSTIC_FIELDS);
}

// A pronostic is either fully set (both scores) or cleared (both null).
export function isValidPronosticScores(scoreDom, scoreExt) {
  const bothNull = scoreDom == null && scoreExt == null;
  const bothSet = Number.isInteger(scoreDom) && Number.isInteger(scoreExt);
  return bothNull || bothSet;
}

export function buildPronosticPayload(fields, options) {
  return buildPayload(fields, { schema: PRONOSTIC_FIELDS, ...options });
}
