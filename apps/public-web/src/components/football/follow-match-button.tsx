"use client";

import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BO3rO2tkbCVPTgCa-wRgEMBDbLnTpC9lupFIW594liQae2NUxfyxT9P_zjrKG_C_8FTQSRYMdhKITKVFoETPu9Q";

function getDeviceId(): string {
  const KEY = "prono:device-id";
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = (globalThis.crypto?.randomUUID?.() as string | undefined) ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(KEY, id);
  return id;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function FollowMatchButton({ matchId }: { matchId: string }) {
  const [following, setFollowing] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }, []);

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Autorise les notifications pour suivre ce match.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const next = !following;
      const res = await fetch("/api/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          subscription: subscription.toJSON(),
          matchId,
          follow: next,
        }),
      });
      if (!res.ok) throw new Error("Erreur serveur lors de l’enregistrement de l’alerte.");
      setFollowing(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="follow-match">
      <button type="button" className={following ? "fav-button is-active" : "fav-button"} onClick={toggle} disabled={busy} aria-pressed={following}>
        <span aria-hidden="true">🔔</span> {busy ? "Enregistrement…" : following ? "Alertes activées" : "Suivre le match"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
