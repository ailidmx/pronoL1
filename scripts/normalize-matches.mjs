#!/usr/bin/env node
/**
 * Normalize matches to a stable key (API-Football fixture id).
 * - legacy matches with apfFixtureId → merge/re-key into matches/{apfFixtureId},
 *   then delete the legacy-keyed doc.
 * - legacy matches without apfFixtureId → keep keyed by legacy id.
 *
 * Usage (dry-run by default):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node normalize-matches.mjs --execute
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const DRY_RUN = !process.argv.includes("--execute");

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

async function main() {
  const snap = await db.collection(collections.matches).get();

  const legacy = [];
  const apf = new Map();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.apfFixtureId != null && String(data.apfFixtureId) === doc.id) {
      apf.set(doc.id, data);
    } else {
      legacy.push({ id: doc.id, data });
    }
  }

  let merged = 0;
  let rekeyed = 0;
  let kept = 0;
  const legacyOnlyFields = ["odds", "reporte", "fdId"];

  for (const item of legacy) {
    const apfId = item.data.apfFixtureId;
    if (apfId == null) {
      kept++;
      continue;
    }
    const key = String(apfId);
    const existing = apf.get(key);
    if (existing) {
      // apf doc is fresher (date/scores/status); carry over legacy-only fields.
      const mergedDoc = { ...existing };
      for (const field of legacyOnlyFields) {
        if (item.data[field] != null && mergedDoc[field] == null) {
          mergedDoc[field] = item.data[field];
        }
      }
      if (DRY_RUN) {
        console.log(`[dry-run] merge ${item.id} -> ${key}`);
      } else {
        await db.collection(collections.matches).doc(key).set(
          { ...mergedDoc, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        await db.collection(collections.matches).doc(item.id).delete();
      }
      merged++;
    } else {
      if (DRY_RUN) {
        console.log(`[dry-run] rekey ${item.id} -> ${key}`);
      } else {
        await db.collection(collections.matches).doc(key).set(item.data, { merge: true });
        await db.collection(collections.matches).doc(item.id).delete();
      }
      rekeyed++;
    }
  }

  console.log(
    `Mode: ${DRY_RUN ? "DRY-RUN" : "EXECUTE"} | merged: ${merged} | rekeyed: ${rekeyed} | kept legacy (no apfId): ${kept}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
