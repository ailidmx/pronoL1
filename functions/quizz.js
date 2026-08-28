/**
 * Quiz RPCs.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections, subcollections, validateQuizAnswer } from "../shared/index.js";

// Save the signed-in user's answer to one quiz question.
export const saveQuizAnswer = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const { weekId, questionId, optionId } = request.data ?? {};

  if (typeof weekId !== "string" || !weekId) throw new HttpsError("invalid-argument", "weekId is required.");
  if (typeof questionId !== "string" || !questionId) throw new HttpsError("invalid-argument", "questionId is required.");
  if (validateQuizAnswer({ optionId })) throw new HttpsError("invalid-argument", "Invalid optionId.");

  const db = getFirestore();
  const weekRef = db.collection(collections.quizWeeks).doc(weekId);
  const weekSnap = await weekRef.get();
  if (!weekSnap.exists) throw new HttpsError("not-found", "Quiz week not found.");
  const week = weekSnap.data();
  if (week.statut !== "publie") throw new HttpsError("failed-precondition", "Quiz non publié.");
  if (week.dateLimite && new Date(week.dateLimite).valueOf() <= Date.now()) {
    throw new HttpsError("failed-precondition", "Date limite dépassée.");
  }

  const qRef = weekRef.collection(subcollections.questions).doc(questionId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) throw new HttpsError("not-found", "Question not found.");

  const oSnap = await qRef.collection(subcollections.options).doc(optionId).get();
  if (!oSnap.exists) throw new HttpsError("invalid-argument", "Option invalide pour cette question.");

  await qRef.collection(subcollections.answers).doc(uid).set(
    { optionId, reponduLe: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true, questionId, optionId };
});
