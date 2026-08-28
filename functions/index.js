/**
 * Prono-L1 Cloud Functions (Phase 2 backend).
 * See docs/rearchitecture-plan.md.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  collections,
  DEFAULT_USER_PROFILE,
  validateUserProfile,
} from "../shared/index.js";

initializeApp();
const db = getFirestore();

// RPC: ping the backend.
export const health = onCall({ cors: true }, () => ({
  ok: true,
  service: "prono-l1",
  time: new Date().toISOString(),
}));

// Returns the signed-in user's profile, creating it with defaults if missing.
export const getProfile = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const ref = db.collection(collections.users).doc(uid);
  const snap = await ref.get();

  if (snap.exists) {
    return { id: uid, ...snap.data() };
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
  return { id: uid, ...profile };
});

export { syncFootballData, syncFixtures, syncRecentMatchDetails } from "./sync.js";
export { savePronostic } from "./pronostics.js";
export { scoreFinishedMatches } from "./scoring.js";
