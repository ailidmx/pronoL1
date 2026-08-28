/**
 * Quiz domain — weekly quiz (quizWeeks/{weekId}/questions/{qId}/options/{optionId}
 * and answers/{userId}).
 */
import { validateFields } from "./validation.js";
import { buildPayload } from "./payload-builders.js";

// Option ids are numeric strings (the option doc id from the legacy id).
const isOptionId = (v) => typeof v === "string" && /^\d{1,10}$/.test(v);

export const QUIZ_ANSWER_FIELDS = {
  optionId: isOptionId,
};

export function validateQuizAnswer(data) {
  return validateFields(data, QUIZ_ANSWER_FIELDS);
}

export function buildQuizAnswerPayload(fields, options) {
  return buildPayload(fields, { schema: QUIZ_ANSWER_FIELDS, ...options });
}
