/**
 * Prono-L1 Cloud Functions (Phase 2 backend).
 * See docs/rearchitecture-plan.md.
 */
import "./bootstrap.js";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  collections,
  DEFAULT_USER_PROFILE,
  validateUserProfile,
} from "@prono-l1/domain";

const db = getFirestore();

export const health = onCall({ cors: true }, () => ({
  ok: true,
  service: "prono-l1",
  time: new Date().toISOString(),
}));

export const getProfile = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const ref = db.collection(collections.users).doc(uid);
  const snap = await ref.get();

  if (snap.exists) {
    const stored = snap.data();
    if (stored.notificationPreferences == null) {
      const notificationPreferences = Object.fromEntries(Object.keys(DEFAULT_USER_PROFILE.notificationPreferences).map((topic) => [topic, {
        email: false,
        telegram: stored.notifTelegram === true,
        push: stored.notifPush === true,
      }]));
      await ref.set({ notificationPreferences, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { id: uid, ...stored, notificationPreferences };
    }
    return { id: uid, ...stored };
  }

  const profile = {
    ...DEFAULT_USER_PROFILE,
    email: request.auth.token.email ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const invalid = validateUserProfile(profile);
  if (invalid) {
    throw new HttpsError("internal", `Invalid default profile: ${invalid}`);
  }
  await ref.set(profile);
  return { id: uid, ...DEFAULT_USER_PROFILE, email: request.auth.token.email ?? null };
});

export { syncFootballData, syncFixtures, syncRecentMatchDetails } from "./sync.js";
export { syncOdds } from "./odds.js";
export { savePronostic } from "./pronostics.js";
export { saveProfile } from "./profile.js";
export { saveBonusAnswer } from "./bonus.js";
export { saveQuizAnswer } from "./quizz.js";
export { getQuizCenter } from "./quizz.js";
export { scoreFinishedMatches } from "./scoring.js";
export { getPronosticsLeaderboard } from "./leaderboard.js";
export { getPlayerMatchCenter } from "./player-match-center.js";
export { getPremiumMatchStatistics } from "./premium-statistics.js";
export { getCommunities, createCommunity, joinCommunity, leaveCommunity } from "./communities.js";
export { sendMatchAlerts } from "./push.js";
export { registerPlayerPushSubscription, sendNotificationTest, dispatchNotifications } from "./notifications.js";
export { createNotificationReminders } from "./notification-reminders.js";
export { getExperimentDashboard } from "./experiments.js";
export { getCompetitionReadiness } from "./competition-readiness.js";
