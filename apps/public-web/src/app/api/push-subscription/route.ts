import { NextResponse } from "next/server";
import { firestore } from "@/server/firebase-admin";

// Saves (or updates) a device push subscription + follows/unfollows a match.
// Written server-side via firebase-admin; the sendMatchAlerts Cloud Function
// reads these subscriptions and sends the actual push.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { deviceId, subscription, matchId, follow } = body ?? {};

  if (typeof deviceId !== "string" || !deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }
  if (typeof matchId !== "string" || !matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint || typeof p256dh !== "string" || !p256dh || typeof auth !== "string" || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const subId = `${deviceId}_${shortHash(endpoint)}`;
  const ref = firestore.collection("pushSubscriptions").doc(subId);
  const snap = await ref.get();
  const followed = new Set<string>(snap.exists ? (snap.data()?.followedMatchIds ?? []) : []);
  if (follow) followed.add(matchId);
  else followed.delete(matchId);

  await ref.set(
    {
      deviceId,
      subscription: { endpoint, keys: { p256dh, auth } },
      followedMatchIds: [...followed],
      updatedAt: new Date(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, following: Boolean(follow) });
}

function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
