import "server-only";

import { unstable_cache } from "next/cache";
import { firestore } from "./firebase-admin";

export type Club = {
  id: string;
  name: string;
  code: string | null;
  logoUrl: string | null;
};

export type FootballMatch = {
  id: string;
  journey: number | null;
  date: string | null;
  homeClub: Club;
  awayClub: Club;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type StandingRow = {
  rank: number;
  club: Club;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  difference: number;
  points: number;
  form: string | null;
};

export type SeasonOverview = {
  seasonId: number;
  clubs: Club[];
  matches: FootballMatch[];
  standings: StandingRow[];
  updatedAt: string | null;
};

const unknownClub = (id: string): Club => ({ id, name: `Club ${id}`, code: null, logoUrl: null });

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asIsoDate(value: unknown): string | null {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }
  return null;
}

async function loadSeasonOverview(seasonId: number): Promise<SeasonOverview> {
  const [clubsSnapshot, matchesSnapshot, standingsSnapshot] = await Promise.all([
    firestore.collection("clubs").get(),
    firestore.collection("matches").where("seasonId", "==", seasonId).get(),
    firestore.collection("standings").doc(`${seasonId}_general`).get(),
  ]);

  const clubs = clubsSnapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: typeof data.nom === "string" ? data.nom : `Club ${document.id}`,
      code: typeof data.code === "string" ? data.code : null,
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
    } satisfies Club;
  }).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const findClub = (value: unknown) => {
    const id = String(value ?? "inconnu");
    return clubsById.get(id) ?? unknownClub(id);
  };

  const matches = matchesSnapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      journey: asNullableNumber(data.journee),
      date: asIsoDate(data.date),
      homeClub: findClub(data.clubDomId),
      awayClub: findClub(data.clubExtId),
      homeScore: asNullableNumber(data.scoreDom),
      awayScore: asNullableNumber(data.scoreExt),
      status: typeof data.statut === "string" ? data.statut : "a_venir",
    } satisfies FootballMatch;
  }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const standingData = standingsSnapshot.data();
  const rawRows = Array.isArray(standingData?.rows) ? standingData.rows : [];
  const standings = rawRows.map((row: Record<string, unknown>) => ({
    rank: asNumber(row.rang),
    club: findClub(row.clubId),
    played: asNumber(row.j),
    won: asNumber(row.g),
    drawn: asNumber(row.n),
    lost: asNumber(row.p),
    goalsFor: asNumber(row.bp),
    goalsAgainst: asNumber(row.bc),
    difference: asNumber(row.diff),
    points: asNumber(row.pts),
    form: typeof row.forme === "string" ? row.forme : null,
  })).sort((a: StandingRow, b: StandingRow) => a.rank - b.rank) as StandingRow[];

  return {
    seasonId,
    clubs,
    matches,
    standings,
    updatedAt: asIsoDate(standingData?.updatedAt),
  };
}

export const getSeasonOverview = (seasonId: number) => unstable_cache(
  () => loadSeasonOverview(seasonId),
  ["public-season-overview", String(seasonId)],
  { revalidate: 300, tags: [`season-${seasonId}`] },
)();
