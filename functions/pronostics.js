/**
 * Pronostics RPCs.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  collections,
  subcollections,
  validatePronostic,
  isValidPronosticScores,
} from "../shared/index.js";

// Save (or clear) the signed-in user's pronostic for a match, if not started.
export const savePronostic = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const { matchId, scoreDom, scoreExt } = request.data ?? {};

  if (typeof matchId !== "string" || !matchId) {
    throw new HttpsError("invalid-argument", "matchId is required.");
  }
  if (validatePronostic({ scoreDom, scoreExt }) || !isValidPronosticScores(scoreDom, scoreExt)) {
    throw new HttpsError("invalid-argument", "Invalid scores.");
  }

  const db = getFirestore();
  const matchRef = db.collection(collections.matches).doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new HttpsError("not-found", "Match not found.");
  }
  if (matchSnap.data()?.statut !== "a_venir") {
    throw new HttpsError("failed-precondition", "Match already started.");
  }

  await matchRef.collection(subcollections.pronostics).doc(uid).set(
    { matchId, scoreDom, scoreExt, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return { ok: true, matchId, scoreDom, scoreExt };
});
