#!/usr/bin/env node
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { COMPETITION_CATALOG, CURRENT_SEASON_START_YEAR } from "@prono-l1/domain";

if (getApps().length === 0) initializeApp({ projectId: "pronol1", credential: applicationDefault() });
const db = getFirestore();

const startYear = CURRENT_SEASON_START_YEAR;
await Promise.all(COMPETITION_CATALOG.flatMap((competition) => [
  db.collection("competitions").doc(competition.id).set({
    ...competition,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }),
  db.collection("seasons").doc(`${competition.id}_${startYear}`).set({
    competitionId: competition.id,
    startYear,
    label: `${startYear}-${startYear + 1}`,
    status: competition.status,
    current: competition.status === "live",
    syncEnabled: competition.syncEnabled === true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }),
]));

console.log("Canonical sports registry seeded.");
