#!/usr/bin/env node
/**
 * Normalize clubs to a stable key (API-Football `apfId`) and remap references.
 * - clubs: legacy numeric keys + apfId keys → `clubs/{apfId}` (with seasonIds).
 * - matches: clubDomId / clubExtId (legacy) → apfId values.
 * - standings (legacy season docs): rows[].clubId → apfId.
 *
 * Usage (dry-run by default):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node normalize-clubs.mjs --execute
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "@prono-l1/domain";

const DRY_RUN = !process.argv.includes("--execute");

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

async function main() {
  const clubsSnap = await db.collection(collections.clubs).get();

  const legacyToApf = new Map(); // legacy numeric id (string) -> apfId (number)
  const byApf = new Map();       // apfKey (string) -> merged club doc
  const legacyKeys = [];         // numeric doc ids to delete

  for (const doc of clubsSnap.docs) {
    const data = doc.data();
    if (data.seasonId != null) {
      // legacy club (from SQL import, keyed by legacy numeric id)
      legacyKeys.push(doc.id);
      const apfId = data.apfId;
      if (apfId != null) {
        legacyToApf.set(doc.id, Number(apfId));
        const key = String(apfId);
        if (!byApf.has(key)) {
          byApf.set(key, {
            apfId: Number(apfId),
            nom: data.nom,
            nomCourt: data.nomCourt,
            code: data.code,
            logoUrl: data.logoUrl,
            stade: data.stade,
            ville: data.ville,
            couleur1: data.couleur1,
            couleur2: data.couleur2,
            fdId: data.fdId,
            smId: data.smId,
            seasonIds: [],
          });
        }
        if (data.seasonId != null) byApf.get(key).seasonIds.push(data.seasonId);
      }
    } else {
      // apfId-keyed club (from API sync) — merge its fresher fields
      const key = doc.id;
      if (!byApf.has(key)) {
        byApf.set(key, { apfId: Number(key), seasonIds: [] });
      }
      const c = byApf.get(key);
      if (data.nom != null) c.nom = data.nom;
      if (data.code != null) c.code = data.code;
      if (data.logoUrl != null) c.logoUrl = data.logoUrl;
      if (data.pays != null) c.pays = data.pays;
    }
  }

  // 1. Write clubs/{apfId}
  for (const [key, club] of byApf) {
    club.seasonIds = [...new Set(club.seasonIds)].sort((a, b) => a - b);
    if (DRY_RUN) {
      console.log(`[dry-run] clubs/${key}`, JSON.stringify(club).slice(0, 160));
    } else {
      await db.collection(collections.clubs).doc(key).set({ ...club, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  // 2. Delete legacy numeric-keyed clubs
  for (const id of legacyKeys) {
    if (DRY_RUN) {
      console.log(`[dry-run] delete clubs/${id}`);
    } else {
      await db.collection(collections.clubs).doc(id).delete();
    }
  }

  // 3. Remap matches
  const matchesSnap = await db.collection(collections.matches).get();
  let remappedMatches = 0;
  for (const doc of matchesSnap.docs) {
    const m = doc.data();
    const updates = {};
    if (m.clubDomId != null && legacyToApf.has(String(m.clubDomId))) {
      updates.clubDomId = legacyToApf.get(String(m.clubDomId));
    }
    if (m.clubExtId != null && legacyToApf.has(String(m.clubExtId))) {
      updates.clubExtId = legacyToApf.get(String(m.clubExtId));
    }
    if (Object.keys(updates).length) {
      remappedMatches++;
      if (!DRY_RUN) {
        await doc.ref.set({ ...updates, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }

  // 4. Remap standings (legacy season docs only)
  const standingsSnap = await db.collection(collections.standings).get();
  let remappedStandings = 0;
  for (const doc of standingsSnap.docs) {
    const s = doc.data();
    if (s.seasonId == null || s.seasonId >= 100) continue; // skip API doc (season year 2026)
    if (!Array.isArray(s.rows)) continue;
    const rows = s.rows.map((r) => ({
      ...r,
      clubId: legacyToApf.has(String(r.clubId)) ? legacyToApf.get(String(r.clubId)) : r.clubId,
    }));
    remappedStandings++;
    if (!DRY_RUN) {
      await doc.ref.set({ rows, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  console.log(
    `Mode: ${DRY_RUN ? "DRY-RUN" : "EXECUTE"} | clubs (apfId): ${byApf.size} | delete legacy: ${legacyKeys.length} | matches remapped: ${remappedMatches} | standings remapped: ${remappedStandings}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
