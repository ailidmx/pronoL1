/**
 * Bonus RPCs.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  collections,
  validateBonusAnswer,
  validateBonusAnswerForQuestion,
  buildBonusAnswerPayload,
  parseCompetitionSeasonId,
} from "@prono-l1/domain";

// Save (or update) the signed-in user's answer to one bonus question.
export const saveBonusAnswer = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const { competitionSeasonId, questionId } = request.data ?? {};
  const raw = request.data?.answer ?? {};

  // Normalize (undefined → null/[]) so Firestore never receives `undefined`.
  const answer = {
    clubIds: Array.isArray(raw.clubIds) ? raw.clubIds : [],
    playerText: typeof raw.playerText === "string" && raw.playerText.trim() ? raw.playerText : null,
  };

  if (!parseCompetitionSeasonId(competitionSeasonId)) {
    throw new HttpsError("invalid-argument", "competitionSeasonId is invalid.");
  }
  if (typeof questionId !== "string" || !questionId) {
    throw new HttpsError("invalid-argument", "questionId is required.");
  }
  if (validateBonusAnswer(answer)) {
    throw new HttpsError("invalid-argument", "Invalid answer.");
  }

  const db = getFirestore();
  const qRef = db.collection(collections.bonus).doc(competitionSeasonId).collection("questions").doc(questionId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) {
    throw new HttpsError("not-found", "Bonus question not found.");
  }
  const q = qSnap.data();
  if (q.actif !== true) {
    throw new HttpsError("failed-precondition", "Bonus fermé.");
  }
  if (q.dateLimite && new Date(q.dateLimite).valueOf() <= Date.now()) {
    throw new HttpsError("failed-precondition", "Date limite dépassée.");
  }
  if (validateBonusAnswerForQuestion(q, answer)) {
    throw new HttpsError("invalid-argument", "Réponse invalide pour cette question.");
  }

  const payload = buildBonusAnswerPayload(answer);
  const ansRef = db.collection(collections.bonus).doc(competitionSeasonId).collection("answers").doc(uid);
  const ansSnap = await ansRef.get();
  const answers = ansSnap.exists ? (ansSnap.data().answers ?? {}) : {};
  answers[questionId] = { clubIds: payload.clubIds, playerText: payload.playerText ?? null };

  await ansRef.set({ userId: uid, answers, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, questionId };
});
