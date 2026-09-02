/**
 * Scheduled sync from API-Football (api-sports.io) → Firestore.
 * Replaces the legacy `api/cron_sync.php` for clubs + standings.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  collections,
  competitionsToSynchronize,
  CURRENT_SEASON_START_YEAR,
  parseCompetitionRound,
} from "@prono-l1/domain";

const apiFootballKey = defineSecret("API_FOOTBALL_KEY");
const API_BASE = "https://v3.football.api-sports.io";
const SYNC_TARGETS = competitionsToSynchronize().map((competition) => ({ ...competition, seasonId: CURRENT_SEASON_START_YEAR }));

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

async function syncCompetitionRegistry(db, target) {
    const teams = await apiFootball(`/teams?league=${target.apiFootballId}&season=${target.seasonId}`);
    const batch = db.batch();
    for (const item of teams.response ?? []) {
      const t = item.team;
      batch.set(db.collection(collections.clubs).doc(String(t.id)),
        {
          apfId: t.id,
          nom: t.name,
          code: t.code ?? null,
          logoUrl: t.logo ?? null,
          pays: t.country ?? null,
          competitionIds: FieldValue.arrayUnion(target.id),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    // 2. Standings → standings/{competitionId}_{seasonId}_general
    const standings = await apiFootball(`/standings?league=${target.apiFootballId}&season=${target.seasonId}`);
    const league = standings.response?.[0]?.league;
    const rawRows = (league?.standings ?? []).flat();
    const rows = mapStandingRows(rawRows, "general");
    for (const mode of ["general", "domicile", "exterieur"]) {
      batch.set(db.collection(collections.standings).doc(`${target.id}_${target.seasonId}_${mode}`), {
        competitionId: target.id,
        seasonId: target.seasonId,
        mode,
        rows: mapStandingRows(rawRows, mode),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    return { competitionId: target.id, clubs: (teams.response ?? []).length, standings: rows.length };
}

async function runForTargets(db, operation, name) {
  const results = [];
  for (const target of SYNC_TARGETS) {
    const seasonRef = db.collection(collections.seasons).doc(`${target.id}_${target.seasonId}`);
    await seasonRef.set({ sync: { [`${name}LastAttemptAt`]: FieldValue.serverTimestamp() } }, { merge: true });
    try {
      const result = await operation(db, target);
      await seasonRef.set({ sync: { [`${name}LastSuccessAt`]: FieldValue.serverTimestamp(), [`${name}Error`]: null, [`${name}Result`]: result } }, { merge: true });
      results.push({ ...result, ok: true });
    } catch (error) {
      console.error(`${name} failed`, { competitionId: target.id, error: error.message });
      await seasonRef.set({ sync: { [`${name}Error`]: error.message, [`${name}FailedAt`]: FieldValue.serverTimestamp() } }, { merge: true });
      results.push({ competitionId: target.id, ok: false, error: error.message });
    }
  }
  return results;
}

export const syncFootballData = onSchedule(
  { schedule: "0 * * * *", timeoutSeconds: 300, secrets: [apiFootballKey] },
  async () => {
    const db = getFirestore();
    return { competitions: await runForTargets(db, syncCompetitionRegistry, "registry") };
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

async function syncCompetitionFixtures(db, target) {
    const fixtures = await apiFootball(`/fixtures?league=${target.apiFootballId}&season=${target.seasonId}`);
    console.log("syncFixtures: fetched", { competitionId: target.id, count: fixtures.response?.length ?? 0 });
    let count = 0;
    const batch = db.batch();
    for (const item of fixtures.response ?? []) {
      const f = item.fixture;
      const teams = item.teams;
      const goals = item.goals;
      const round = parseCompetitionRound(item.league?.round, target.format);
      batch.set(db.collection(collections.matches).doc(String(f.id)),
        {
          seasonId: target.seasonId,
          competitionId: target.id,
          apfFixtureId: f.id,
          journee: round.journey,
          stage: round.stage,
          roundKey: round.roundKey,
          roundLabel: round.roundLabel,
          leg: round.leg,
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
    await batch.commit();
    console.log("syncFixtures: wrote", { competitionId: target.id, count });
    return { competitionId: target.id, matches: count };
}

export const syncFixtures = onSchedule(
  { schedule: "0 * * * *", timeoutSeconds: 300, secrets: [apiFootballKey] },
  async () => {
    const db = getFirestore();
    return { competitions: await runForTargets(db, syncCompetitionFixtures, "fixtures") };
  },
);
