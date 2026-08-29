/**
 * Quiz RPCs.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections, subcollections, validateQuizAnswer } from "@prono-l1/domain";

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

export const getQuizCenter = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const db = getFirestore();
  const weeksSnapshot = await db.collection(collections.quizWeeks).where("statut", "==", "publie").get();
  const weeks = weeksSnapshot.docs.sort((a, b) => String(b.data().dateLimite ?? "").localeCompare(String(a.data().dateLimite ?? "")));
  const result = [];
  for (const weekDocument of weeks.slice(0, 12)) {
    const week = weekDocument.data();
    const questionsSnapshot = await weekDocument.ref.collection(subcollections.questions).get();
    const questions = await Promise.all(questionsSnapshot.docs
      .sort((a, b) => Number(a.data().ordre ?? 0) - Number(b.data().ordre ?? 0))
      .map(async (questionDocument) => {
        const [optionsSnapshot, answerSnapshot] = await Promise.all([
          questionDocument.ref.collection(subcollections.options).get(),
          questionDocument.ref.collection(subcollections.answers).doc(request.auth.uid).get(),
        ]);
        const answer = answerSnapshot.data() ?? null;
        return { id: questionDocument.id, wording: questionDocument.data().enonce ?? "Question", order: questionDocument.data().ordre ?? 0,
          options: optionsSnapshot.docs.map((option) => ({ id: option.id, text: option.data().texte ?? option.id })),
          answer: answer ? { optionId: answer.optionId ?? null, points: answer.points ?? null, correct: answer.correct ?? null } : null };
      }));
    result.push({ id: weekDocument.id, journey: week.journee ?? null, deadline: week.dateLimite ?? null,
      closed: Boolean(week.dateLimite && new Date(week.dateLimite).valueOf() <= Date.now()), questions,
      points: questions.reduce((total, question) => total + (question.answer?.points ?? 0), 0) });
  }
  return { current: result.find((week) => !week.closed) ?? result[0] ?? null, history: result.filter((week) => week.closed) };
});
