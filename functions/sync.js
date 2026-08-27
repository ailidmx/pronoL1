/**
 * Scheduled sync from API-Football (api-sports.io) → Firestore.
 * Replaces the legacy `api/cron_sync.php` for clubs + standings.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "../shared/index.js";

const apiFootballKey = defineSecret("API_FOOTBALL_KEY");
const API_BASE = "https://v3.football.api-sports.io";
const LIGUE1_ID = 61;
const SEASON = 2026; // Ligue 1 2026-27 → start year 2026

async function apiFootball(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiFootballKey.value() },
  });
  if (!res.ok) {
    throw new Error(`API-Football HTTP ${res.status}`);
  }
  return res.json();
}

export const syncFootballData = onSchedule(
  { schedule: "0 * * * *", timeoutSeconds: 300, secrets: [apiFootballKey] },
  async () => {
    const db = getFirestore();

    // 1. Teams → clubs
    const teams = await apiFootball(`/teams?league=${LIGUE1_ID}&season=${SEASON}`);
    for (const item of teams.response ?? []) {
      const t = item.team;
      await db.collection(collections.clubs).doc(String(t.id)).set(
        {
          apfId: t.id,
          nom: t.name,
          code: t.code ?? null,
          logoUrl: t.logo ?? null,
          pays: t.country ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    // 2. Standings → standings/{seasonId}_general
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

    return { clubs: (teams.response ?? []).length, standings: rows.length };
  },
);

function mapStatus(short) {
  if (!short) return "a_venir";
  if (["NS", "TBD"].includes(short)) return "a_venir";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short)) return "en_cours";
  if (["FT", "AET", "PEN"].includes(short)) return "termine";
  if (["PST", "SUSP", "INT", "CANC", "ABD", "AWD", "WO"].includes(short)) return "reporte";
  return "a_venir";
}

// Sync Ligue 1 fixtures (matches + scores) from API-Football.
export const syncFixtures = onSchedule(
  { schedule: "0 * * * *", timeoutSeconds: 300, secrets: [apiFootballKey] },
  async () => {
    const db = getFirestore();
    const fixtures = await apiFootball(`/fixtures?league=${LIGUE1_ID}&season=${SEASON}`);
    console.log("syncFixtures: fetched", fixtures.response?.length, "fixtures");
    let count = 0;
    for (const item of fixtures.response ?? []) {
      const f = item.fixture;
      const teams = item.teams;
      const goals = item.goals;
      const round = item.league?.round ?? null;
      const m = round ? round.match(/(\d+)\s*$/) : null;
      const journee = m ? Number(m[1]) : null;
      await db.collection(collections.matches).doc(String(f.id)).set(
        {
          seasonId: SEASON,
          apfFixtureId: f.id,
          journee,
          date: f.date ?? null,
          clubDomId: teams.home.id,
          clubExtId: teams.away.id,
          scoreDom: goals?.home ?? null,
          scoreExt: goals?.away ?? null,
          statut: mapStatus(f.status?.short),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      count++;
    }
    console.log("syncFixtures: wrote", count, "matches");
    return { matches: count };
  },
);
