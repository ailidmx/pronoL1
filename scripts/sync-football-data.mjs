#!/usr/bin/env node
/**
 * One-off local sync: API-Football → Firestore (mirrors functions/sync.js).
 * Useful to seed/refresh data without waiting for the hourly schedule.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   API_FOOTBALL_KEY=... \
 *   node scripts/sync-football-data.mjs
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://v3.football.api-sports.io";
const LIGUE1_ID = 61;
const SEASON = 2026;

if (!API_KEY) {
  console.error("Missing API_FOOTBALL_KEY env var");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

async function apiFootball(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": API_KEY },
  });
  if (!res.ok) {
    throw new Error(`API-Football HTTP ${res.status}`);
  }
  return res.json();
}

async function main() {
  const teams = await apiFootball(`/teams?league=${LIGUE1_ID}&season=${SEASON}`);
  console.log(`teams from API: ${teams.response?.length ?? 0}`);

  const clubs = [];
  for (const item of teams.response ?? []) {
    const t = item.team;
    const doc = {
      apfId: t.id,
      nom: t.name,
      code: t.code ?? null,
      logoUrl: t.logo ?? null,
      pays: t.country ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection(collections.clubs).doc(String(t.id)).set(doc, { merge: true });
    clubs.push(doc.nom);
  }
  console.log(`clubs written: ${clubs.length}`);

  const standings = await apiFootball(`/standings?league=${LIGUE1_ID}&season=${SEASON}`);
  const league = standings.response?.[0]?.league;
  const rows = (league?.standings?.[0] ?? []).map((s) => ({
    clubId: s.team.id,
    rang: s.rank,
    j: s.all.played,
    g: s.all.win,
    n: s.all.draw,
    p: s.all.lose,
    bp: s.all.goals.for,
    bc: s.all.goals.against,
    diff: s.goalsDiff,
    pts: s.points,
    forme: s.forme ?? null,
  }));
  await db.collection(collections.standings).doc(`${SEASON}_general`).set({
    seasonId: SEASON,
    mode: "general",
    rows,
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`standings rows: ${rows.length}`);
  console.log("DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
