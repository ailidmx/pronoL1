/**
 * Bonus domain — season-long predictions (champion, buteur, relégués…).
 * Questions live in bonus/{seasonId}/questions/{questionId}; a user's answers in
 * bonus/{seasonId}/answers/{userId} (map questionId → answer).
 */
import { isInteger, isNullableString, validateFields } from "./validation.js";
import { buildPayload } from "./payload-builders.js";

const isClubIds = (v) => Array.isArray(v) && v.every((x) => isInteger(x));

// A single answer: club picks (club / multi_club) and/or a free-text player name
// (joueur). Always both keys — `playerText` null for club types, `clubIds` empty
// for joueur.
export const BONUS_ANSWER_FIELDS = {
  clubIds: isClubIds,
  playerText: isNullableString,
};

export function validateBonusAnswer(data) {
  return validateFields(data, BONUS_ANSWER_FIELDS);
}

export function buildBonusAnswerPayload(fields, options) {
  return buildPayload(fields, { schema: BONUS_ANSWER_FIELDS, ...options });
}

// Semantic check against the bonus question's type. Returns the offending field
// name, or null when valid.
export function validateBonusAnswerForQuestion(question, answer) {
  const clubIds = Array.isArray(answer?.clubIds) ? answer.clubIds : [];
  const playerText = answer?.playerText ?? null;

  if (question.type === "club") {
    return clubIds.length === 1 && playerText === null ? null : "clubIds";
  }
  if (question.type === "multi_club") {
    const distinct = new Set(clubIds).size === clubIds.length;
    return clubIds.length === question.nbChoix && distinct && playerText === null ? null : "clubIds";
  }
  if (question.type === "joueur") {
    return clubIds.length === 0 && typeof playerText === "string" && playerText.trim().length > 0
      ? null
      : "playerText";
  }
  return "type";
}

// Legacy `calculer`: points_max / nb_choix per correct pick (truncated).
export function computeBonusPointsPerPick(question) {
  return Math.trunc(question.points / question.nbChoix);
}
