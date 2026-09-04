import { createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import webpush from "web-push";
import { collections } from "@prono-l1/domain";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const VAPID_PUBLIC_KEY = "BO3rO2tkbCVPTgCa-wRgEMBDbLnTpC9lupFIW594liQae2NUxfyxT9P_zjrKG_C_8FTQSRYMdhKITKVFoETPu9Q";

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  return request.auth.uid;
}

export const registerPlayerPushSubscription = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const subscription = request.data?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
    throw new HttpsError("invalid-argument", "Invalid push subscription.");
  }
  const id = `${uid}_${createHash("sha256").update(subscription.endpoint).digest("hex").slice(0, 24)}`;
  await getFirestore().collection(collections.pushSubscriptions).doc(id).set({
    uid, deviceId: id, subscription, source: "player", updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, subscriptionId: id };
});

export const sendNotificationTest = onCall(
  { cors: true, secrets: [TELEGRAM_BOT_TOKEN, VAPID_PRIVATE_KEY] },
  async (request) => {
    const uid = requireAuth(request);
    const channel = request.data?.channel;
    if (!["telegram", "push"].includes(channel)) throw new HttpsError("invalid-argument", "This notification channel is unavailable.");
    const profileSnap = await getFirestore().collection(collections.users).doc(uid).get();
    if (!profileSnap.exists) throw new HttpsError("failed-precondition", "Profile missing.");
    const profile = profileSnap.data();

    if (channel === "telegram") {
      if (!profile.telegramChatId) throw new HttpsError("failed-precondition", "Telegram Chat ID missing.");
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: profile.telegramChatId, text: "🔔 Prono L1\n\nTa connexion Telegram fonctionne 🎉" }),
      });
      if (!response.ok) throw new HttpsError("failed-precondition", "Telegram rejected this Chat ID.");
    }

    if (channel === "push") {
      const subscriptions = await getFirestore().collection(collections.pushSubscriptions).where("uid", "==", uid).get();
      if (subscriptions.empty) throw new HttpsError("failed-precondition", "No browser registered for push.");
      webpush.setVapidDetails("mailto:contact@docfoot.fr", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
      const results = await Promise.allSettled(subscriptions.docs.map((doc) => webpush.sendNotification(doc.data().subscription, JSON.stringify({ title: "Prono L1", body: "Tes notifications push fonctionnent 🎉", url: "/" }))));
      if (!results.some((result) => result.status === "fulfilled")) throw new HttpsError("unavailable", "Push delivery failed.");
    }
    return { ok: true, channel };
  },
);

export const dispatchNotifications = onSchedule(
  { schedule: "*/5 * * * *", timeoutSeconds: 300, secrets: [TELEGRAM_BOT_TOKEN, VAPID_PRIVATE_KEY] },
  async () => {
    const db = getFirestore();
    const pending = await db.collection(collections.notificationOutbox).where("status", "==", "pending").limit(100).get();
    let delivered = 0;
    for (const messageDoc of pending.docs) {
      const message = messageDoc.data();
      const profileSnap = await db.collection(collections.users).doc(message.uid).get();
      if (!profileSnap.exists) { await messageDoc.ref.set({ status: "failed", error: "profile-missing" }, { merge: true }); continue; }
      const profile = profileSnap.data();
      const channels = profile.notificationPreferences?.[message.topic] ?? {};
      const results = {};
      if (channels.telegram && profile.telegramChatId) {
        try { const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.value()}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: profile.telegramChatId, text: `🔔 ${message.title}\n\n${message.body}` }) }); results.telegram = response.ok ? "sent" : `http-${response.status}`; } catch (error) { results.telegram = error.message; }
      }
      if (channels.push) {
        const subscriptions = await db.collection(collections.pushSubscriptions).where("uid", "==", message.uid).get();
        if (!subscriptions.empty) { webpush.setVapidDetails("mailto:contact@docfoot.fr", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value()); const pushes = await Promise.allSettled(subscriptions.docs.map((doc) => webpush.sendNotification(doc.data().subscription, JSON.stringify({ title: message.title, body: message.body, url: message.url || "/" })))); results.push = pushes.some((result) => result.status === "fulfilled") ? "sent" : "failed"; }
      }
      await messageDoc.ref.set({ status: "processed", channelResults: results, processedAt: FieldValue.serverTimestamp() }, { merge: true }); delivered += 1;
    }
    return { processed: pending.size, delivered };
  },
);
