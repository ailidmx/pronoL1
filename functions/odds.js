import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { collections, competitionsToSynchronize, CURRENT_SEASON_START_YEAR } from "@prono-l1/domain";

const apiFootballKey = defineSecret("API_FOOTBALL_KEY");
const API_BASE = "https://v3.football.api-sports.io";
const SYNC_TARGETS = competitionsToSynchronize().map((competition) => ({ ...competition, seasonId: CURRENT_SEASON_START_YEAR }));
const MAX_PAGES = 10;

async function apiFootball(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": apiFootballKey.value() },
  });
  if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
  return response.json();
}

function averageMatchWinnerOdds(entry) {
  let home = 0;
  let draw = 0;
  let away = 0;
  let bookmakers = 0;

  for (const bookmaker of entry?.bookmakers ?? []) {
    const market = (bookmaker?.bets ?? []).find((bet) => bet?.name === "Match Winner");
    if (!market) continue;
    const values = Object.fromEntries((market.values ?? []).map((item) => [item.value, Number(item.odd)]));
    if (![values.Home, values.Draw, values.Away].every(Number.isFinite)) continue;
    home += values.Home;
    draw += values.Draw;
    away += values.Away;
    bookmakers += 1;
  }

  if (bookmakers === 0) return null;
  const round = (value) => Math.round((value / bookmakers) * 100) / 100;
  return {
    coteDomApi: round(home),
    coteNulApi: round(draw),
    coteExtApi: round(away),
    nbBookmakersApi: bookmakers,
  };
}

export const syncOdds = onSchedule(
  { schedule: "*/15 * * * *", timeoutSeconds: 300, secrets: [apiFootballKey] },
  async () => {
    const db = getFirestore();
    const matchSnapshot = await db.collection(collections.matches).where("seasonId", "==", CURRENT_SEASON_START_YEAR).get();
    const results = [];
    for (const target of SYNC_TARGETS) {
      const upcoming = matchSnapshot.docs.filter((document) => {
        const data = document.data();
        return data.competitionId === target.id && data.statut === "a_venir" && Number.isInteger(Number(data.apfFixtureId));
      });
      const byFixture = new Map(upcoming.map((document) => [Number(document.data().apfFixtureId), document.ref]));
      const pending = new Set(byFixture.keys());
      let page = 1;
      let totalPages = 1;
      let updated = 0;

      while (pending.size > 0 && page <= totalPages && page <= MAX_PAGES) {
        const payload = await apiFootball(`/odds?league=${target.apiFootballId}&season=${target.seasonId}&page=${page}`);
        totalPages = Math.min(Number(payload?.paging?.total ?? 1) || 1, MAX_PAGES);
        for (const entry of payload?.response ?? []) {
          const fixtureId = Number(entry?.fixture?.id);
          const ref = byFixture.get(fixtureId);
          if (!ref) continue;
          const odds = averageMatchWinnerOdds(entry);
          if (!odds) continue;
          await ref.set({ odds: { ...odds, coteApiMajLe: new Date().toISOString() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          pending.delete(fixtureId);
          updated += 1;
        }
        page += 1;
      }
      results.push({ competitionId: target.id, updated, pending: pending.size, pages: page - 1 });
    }
    console.log("syncOdds", results);
    return { competitions: results };
  },
);
