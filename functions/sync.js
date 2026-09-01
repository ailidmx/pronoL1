/**
 * Scheduled sync from API-Football (api-sports.io) → Firestore.
 * Replaces the legacy `api/cron_sync.php` for clubs + standings.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { collections } from "@prono-l1/domain";

const apiFootballKey = defineSecret("API_FOOTBALL_KEY");
const API_BASE = "https://v3.football.api-sports.io";
const LIGUE1_ID = 61;
const SEASON = 2026; // Ligue 1 2026-27 → start year 2026
const COMPETITION_ID = "ligue-1";

function mapStandingRows(rows, mode) {
  const mapped = (rows ?? []).map((s) => {
    const split = mode === "general" ? s.all : s[mode === "domicile" ? "home" : "away"];
    return {
      clubId: s.team.id,
      rang: s.rank,
      j: split.played,
      g: split.win,
      n: split.draw,
      p: split.lose,
      bp: split.goals.for,
      bc: split.goals.against,
      diff: split.goals.for - split.goals.against,
      pts: mode === "general" ? s.points : split.win * 3 + split.draw,
      forme: mode === "general" ? (s.form ?? null) : null,
    };
  });

  if (mode === "general") {
    // The API already returns the official rank (ties share the same rank).
    return mapped.sort((a, b) => a.rang - b.rang);
  }

  // Home/away: recompute rank from home/away stats, sharing rank on ties
  // (1, 1, 3, 3, 5…) instead of a plain counter.
  return mapped
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.bp - a.bp)
    .map((row, index, arr) => {
      const prev = arr[index - 1];
      const tied = Boolean(prev) && row.pts === prev.pts && row.diff === prev.diff && row.bp === prev.bp;
      return { ...row, rang: tied ? prev.rang : index + 1 };
    });
}

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

    // 2. Standings → standings/{competitionId}_{seasonId}_general
    const standings = await apiFootball(`/standings?league=${LIGUE1_ID}&season=${SEASON}`);
    const league = standings.response?.[0]?.league;
    const rawRows = league?.standings?.[0] ?? [];
    const rows = mapStandingRows(rawRows, "general");
    for (const mode of ["general", "domicile", "exterieur"]) {
      await db.collection(collections.standings).doc(`${COMPETITION_ID}_${SEASON}_${mode}`).set({
        competitionId: COMPETITION_ID,
        seasonId: SEASON,
        mode,
        rows: mapStandingRows(rawRows, mode),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { clubs: (teams.response ?? []).length, standings: rows.length };
  },
);

function mapFixtureDetails(item) {
  return {
    venue: item.fixture?.venue?.name ?? null,
    city: item.fixture?.venue?.city ?? null,
    referee: item.fixture?.referee ?? null,
    events: (item.events ?? []).map((event) => ({
      minute: event.time?.elapsed ?? null,
      extraMinute: event.time?.extra ?? null,
      teamId: event.team?.id ?? null,
      type: event.type ?? "Événement",
      detail: event.detail ?? null,
      comments: event.comments ?? null,
      player: event.player?.name ?? null,
      playerId: event.player?.id ?? null,
      assist: event.assist?.name ?? null,
      assistId: event.assist?.id ?? null,
    })),
    lineups: (item.lineups ?? []).map((lineup) => ({
      teamId: lineup.team?.id,
      formation: lineup.formation ?? null,
      coach: lineup.coach?.name ?? null,
      starters: (lineup.startXI ?? []).map(({ player }) => ({
        id: player.id ?? null, name: player.name, number: player.number ?? null,
        position: player.pos ?? null, grid: player.grid ?? null,
      })),
      substitutes: (lineup.substitutes ?? []).map(({ player }) => ({
        id: player.id ?? null, name: player.name, number: player.number ?? null,
        position: player.pos ?? null,
      })),
    })),
    statistics: (item.statistics ?? []).map((team) => ({
      teamId: team.team?.id,
      values: Object.fromEntries((team.statistics ?? []).map((stat) => [stat.type, stat.value ?? null])),
    })),
    detailsUpdatedAt: FieldValue.serverTimestamp(),
  };
}

// Refresh detailed data around kick-off and after the final whistle. Historical
// backfill uses scripts/sync-match-details.mjs to avoid burning the hourly quota.
export const syncRecentMatchDetails = onSchedule(
  { schedule: "15 * * * *", timeoutSeconds: 300, secrets: [apiFootballKey] },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const from = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const to = new Date(now + 8 * 60 * 60 * 1000).toISOString();
    const snapshot = await db.collection(collections.matches)
      .where("date", ">=", from).where("date", "<=", to).get();
    let count = 0;
    for (const document of snapshot.docs) {
      const fixture = await apiFootball(`/fixtures?id=${document.id}`);
      const item = fixture.response?.[0];
      if (!item) continue;
      await document.ref.set(mapFixtureDetails(item), { merge: true });
      count++;
    }
    return { detailedMatches: count };
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
          competitionId: COMPETITION_ID,
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
