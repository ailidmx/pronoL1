/**
 * Match alerts (web push).
 * Subscriptions + followed matches are written by the public-web API route
 * (server-side, firebase-admin). This scheduled function sends the actual push
 * notifications (kickoff reminder + full-time) via web-push.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import webpush from "web-push";
import { collections } from "@prono-l1/domain";

const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const VAPID_PUBLIC_KEY = "BO3rO2tkbCVPTgCa-wRgEMBDbLnTpC9lupFIW594liQae2NUxfyxT9P_zjrKG_C_8FTQSRYMdhKITKVFoETPu9Q";
const VAPID_SUBJECT = defineString("VAPID_SUBJECT", { default: "https://pronol1.web.app" });

const KICKOFF_WINDOW_MS = 30 * 60 * 1000;

export const sendMatchAlerts = onSchedule(
  { schedule: "*/15 * * * *", timeoutSeconds: 300, secrets: [VAPID_PRIVATE_KEY] },
  async () => {
    webpush.setVapidDetails(VAPID_SUBJECT.value(), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
    const db = getFirestore();

    const clubsSnap = await db.collection(collections.clubs).get();
    const clubNames = new Map(clubsSnap.docs.map((d) => [d.id, d.data().nom ?? d.id]));

    const subsSnap = await db.collection(collections.pushSubscriptions).get();
    const now = Date.now();
    let sent = 0;

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      const subscription = sub.subscription;
      const deviceId = sub.deviceId;
      if (!subscription?.endpoint || !deviceId) continue;

      for (const matchId of sub.followedMatchIds ?? []) {
        const matchSnap = await db.collection(collections.matches).doc(matchId).get();
        if (!matchSnap.exists) continue;
        const match = matchSnap.data();
        const home = clubNames.get(String(match.clubDomId)) ?? "Équipe 1";
        const away = clubNames.get(String(match.clubExtId)) ?? "Équipe 2";
        const url = `/match/${matchId}`;
        const kickoffAt = match.date ? new Date(match.date).valueOf() : null;

        if (kickoffAt && kickoffAt - now > 0 && kickoffAt - now <= KICKOFF_WINDOW_MS) {
          const didSend = await sendOnce(db, deviceId, matchId, "kickoff", () =>
            webpush.sendNotification(subscription, JSON.stringify({
              title: `${home} - ${away} commence bientôt`,
              body: `Coup d'envoi à ${new Date(kickoffAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
              url,
            })),
          );
          if (didSend) sent += 1;
        } else if (match.statut === "termine") {
          const score = `${match.scoreDom ?? "-"} - ${match.scoreExt ?? "-"}`;
          const didSend = await sendOnce(db, deviceId, matchId, "fulltime", () =>
            webpush.sendNotification(subscription, JSON.stringify({
              title: `${home} ${score} ${away}`,
              body: "Match terminé.",
              url,
            })),
          );
          if (didSend) sent += 1;
        }
      }
    }
    return { sent };
  },
);

async function sendOnce(db, deviceId, matchId, kind, sendFn) {
  const markerRef = db.collection(collections.pushRappels).doc(`${deviceId}_${matchId}`);
  const markerSnap = await markerRef.get();
  const sentKinds = markerSnap.exists ? (markerSnap.data().sentKinds ?? []) : [];
  if (sentKinds.includes(kind)) return false;
  try {
    await sendFn();
  } catch (err) {
    console.warn("push send failed", err.message);
    return false;
  }
  await markerRef.set(
    { deviceId, matchId, sentKinds: [...sentKinds, kind], updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return true;
}
