import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { collections, subcollections } from "@prono-l1/domain";

function millis(value) { if (value instanceof Timestamp) return value.toMillis(); if (value?.toMillis) return value.toMillis(); const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function wants(profile, topic) { return Object.values(profile.notificationPreferences?.[topic] ?? {}).some(Boolean); }
async function enqueue(db, id, uid, topic, title, body, url = "/") { const ref = db.collection(collections.notificationOutbox).doc(id); if ((await ref.get()).exists) return false; await ref.create({ uid, topic, title, body, url, status: "pending", createdAt: FieldValue.serverTimestamp() }); return true; }

export const createNotificationReminders = onSchedule({ schedule: "*/15 * * * *", timeoutSeconds: 300 }, async () => {
  const db = getFirestore(); const now = Date.now(); const users = (await db.collection(collections.users).get()).docs.map((doc) => ({ id: doc.id, ...doc.data() })); let created = 0;
  const matches = await db.collection(collections.matches).get();
  for (const matchDoc of matches.docs) { const match = matchDoc.data(); const kickoff = millis(match.date); if (!kickoff || kickoff <= now || kickoff - now > 60 * 60 * 1000) continue; for (const user of users.filter((value) => wants(value, "predictionReminders"))) { const prediction = await matchDoc.ref.collection(subcollections.pronostics).doc(user.id).get(); if (prediction.exists) continue; await enqueue(db, `prediction_${matchDoc.id}_${user.id}`, user.id, "predictionReminders", "Ton pronostic ferme bientôt", "Il reste moins d’une heure avant le coup d’envoi.", "/"); created += 1; } }
  const quizWeeks = await db.collection(collections.quizWeeks).where("statut", "==", "publie").get();
  for (const weekDoc of quizWeeks.docs) { const deadline = millis(weekDoc.data().dateLimite); if (!deadline || deadline <= now || deadline - now > 24 * 60 * 60 * 1000) continue; const questions = await weekDoc.ref.collection(subcollections.questions).get(); for (const user of users.filter((value) => wants(value, "quizBonus"))) { let unanswered = false; for (const question of questions.docs) { if (!(await question.ref.collection(subcollections.answers).doc(user.id).get()).exists) { unanswered = true; break; } } if (unanswered) { await enqueue(db, `quiz_${weekDoc.id}_${user.id}`, user.id, "quizBonus", "Quiz bientôt clôturé", "Il te reste moins de 24 heures pour répondre.", "/"); created += 1; } } }
  const bonusSets = await db.collection(collections.bonus).get();
  for (const bonusSet of bonusSets.docs) { const questions = await bonusSet.ref.collection(subcollections.questions).get(); for (const question of questions.docs) { const deadline = millis(question.data().dateLimite); if (!deadline || deadline <= now || deadline - now > 24 * 60 * 60 * 1000) continue; for (const user of users.filter((value) => wants(value, "quizBonus"))) { const answers = await bonusSet.ref.collection(subcollections.answers).doc(user.id).get(); if (answers.data()?.answers?.[question.id]) continue; await enqueue(db, `bonus_${bonusSet.id}_${question.id}_${user.id}`, user.id, "quizBonus", "Bonus bientôt clôturé", `Il te reste moins de 24 heures pour répondre à « ${question.data().label ?? "Bonus"} ».`, "/"); created += 1; } } }
  return { created };
});
