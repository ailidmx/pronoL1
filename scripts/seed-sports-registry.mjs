#!/usr/bin/env node
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp({ projectId: "pronol1", credential: applicationDefault() });
const db = getFirestore();

await Promise.all([
  db.collection("competitions").doc("ligue-1").set({
    name: "Ligue 1",
    shortName: "L1",
    country: "France",
    apiFootballId: 61,
    format: "domestic_league",
    status: "live",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }),
  db.collection("seasons").doc("ligue-1_2026").set({
    competitionId: "ligue-1",
    startYear: 2026,
    label: "2026-2027",
    status: "live",
    current: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }),
]);

console.log("Canonical sports registry seeded.");
