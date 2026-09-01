#!/usr/bin/env node
/** One-time migration to the canonical `ligue-1:2026` scope. Remove after 2026-09-30. */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp({ projectId: "pronol1", credential: applicationDefault() });
const db = getFirestore();
const marker = db.collection("_migrations").doc("ligue1-2026-scope");
if ((await marker.get()).exists) {
  console.log("Migration ligue1-2026-scope already applied.");
  process.exit(0);
}

const matches = await db.collection("matches").where("seasonId", "==", 2026).get();
for (const match of matches.docs) await match.ref.set({ competitionId: "ligue-1" }, { merge: true });

for (const mode of ["general", "domicile", "exterieur"]) {
  const source = await db.collection("standings").doc(`2026_${mode}`).get();
  if (source.exists) await db.collection("standings").doc(`ligue-1_2026_${mode}`).set({ ...source.data(), competitionId: "ligue-1" }, { merge: true });
}

for (const [collectionName, childName] of [["leaderboardPronostics", "rows"], ["bonus", "answers"]]) {
  const source = await db.collection(collectionName).doc("2026").collection(childName).get();
  for (const item of source.docs) await db.collection(collectionName).doc("ligue-1:2026").collection(childName).doc(item.id).set(item.data(), { merge: true });
}

await marker.set({ appliedAt: FieldValue.serverTimestamp(), matches: matches.size });
console.log(`Migration complete: ${matches.size} matches scoped.`);
