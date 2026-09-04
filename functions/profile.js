/**
 * Profile RPCs.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  collections,
  validateProfileEdit,
  buildProfileEditPayload,
  normalizeAvatarInitiales,
} from "@prono-l1/domain";

// Save the signed-in user's editable profile fields (pseudo, favorite team,
// notif prefs). `avatarInitiales` is derived from the pseudo.
export const saveProfile = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const data = request.data ?? {};

  // Explicitly pick only editable fields — never let a caller touch isAdmin/email.
  const fields = {
    displayName: data.displayName,
    equipeCoeurId: data.equipeCoeurId,
    notifEmail: data.notifEmail,
    notifPush: data.notifPush,
    notifTelegram: data.notifTelegram,
    telegramChatId: data.telegramChatId,
    avatarInitiales: data.avatarInitiales,
    notificationPreferences: data.notificationPreferences,
  };

  const invalid = validateProfileEdit(fields);
  if (invalid) {
    throw new HttpsError("invalid-argument", `Invalid profile field: ${invalid}`);
  }

  const payload = buildProfileEditPayload(fields);
  payload.avatarInitiales = normalizeAvatarInitiales(payload.avatarInitiales, payload.displayName);

  const db = getFirestore();
  await db.collection(collections.users).doc(uid).set(payload, { merge: true });

  return { ok: true, id: uid };
});
