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
  updatedAt: string | null;
  events: MatchEvent[];
  lineups: MatchLineup[];
  statistics: MatchTeamStatistics[];
  venue: string | null;
  city: string | null;
  referee: string | null;
};

export type MatchEvent = {
  minute: number | null;
  extraMinute: number | null;
  teamId: string | null;
  type: string;
  detail: string | null;
  player: string | null;
  assist: string | null;
};

export type MatchLineup = {
  teamId: string;
  formation: string | null;
  coach: string | null;
  starters: MatchPlayer[];
  substitutes: MatchPlayer[];
};

export type MatchPlayer = { id: string | null; name: string; number: number | null; position: string | null; grid: string | null };
export type MatchTeamStatistics = { teamId: string; values: Record<string, string | number | null> };
export type StandingMode = "general" | "domicile" | "exterieur";

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
  standingsByMode: Record<StandingMode, StandingRow[]>;
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

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapEvents(value: unknown): MatchEvent[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const event = item as Record<string, unknown>;
    return {
      minute: asNullableNumber(event.minute),
      extraMinute: asNullableNumber(event.extraMinute),
      teamId: event.teamId == null ? null : String(event.teamId),
      type: asText(event.type) ?? "Événement",
      detail: asText(event.detail),
      player: asText(event.player),
      assist: asText(event.assist),
    };
  });
}

function mapLineups(value: unknown): MatchLineup[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const lineup = item as Record<string, unknown>;
    return {
      teamId: String(lineup.teamId ?? "inconnu"),
      formation: asText(lineup.formation),
      coach: asText(lineup.coach),
      starters: mapPlayers(lineup.starters),
      substitutes: mapPlayers(lineup.substitutes),
    };
  });
}

function mapPlayers(value: unknown): MatchPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { id: null, name: item, number: null, position: null, grid: null };
    const player = item as Record<string, unknown>;
    return { id: player.id == null ? null : String(player.id), name: asText(player.name) ?? "Joueur", number: asNullableNumber(player.number), position: asText(player.position), grid: asText(player.grid) };
  });
}

function mapStatistics(value: unknown): MatchTeamStatistics[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const stat = item as Record<string, unknown>;
    const values = stat.values && typeof stat.values === "object" ? stat.values as Record<string, string | number | null> : {};
    return { teamId: String(stat.teamId ?? "inconnu"), values };
  });
}

async function loadSeasonOverview(seasonId: number): Promise<SeasonOverview> {
  const [clubsSnapshot, matchesSnapshot, ...standingSnapshots] = await Promise.all([
    firestore.collection("clubs").get(),
    firestore.collection("matches").where("seasonId", "==", seasonId).get(),
    ...(["general", "domicile", "exterieur"] as StandingMode[]).map((mode) => firestore.collection("standings").doc(`${seasonId}_${mode}`).get()),
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
      updatedAt: asIsoDate(data.updatedAt),
      events: mapEvents(data.events),
      lineups: mapLineups(data.lineups),
      statistics: mapStatistics(data.statistics),
      venue: asText(data.venue),
      city: asText(data.city),
      referee: asText(data.referee),
    } satisfies FootballMatch;
  }).sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  const mapStandingDocument = (standingData: FirebaseFirestore.DocumentData | undefined) => (Array.isArray(standingData?.rows) ? standingData.rows : []).map((row: Record<string, unknown>) => ({
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
  const standingsByMode = Object.fromEntries((["general", "domicile", "exterieur"] as StandingMode[]).map((mode, index) => [mode, mapStandingDocument(standingSnapshots[index].data())])) as Record<StandingMode, StandingRow[]>;
  const standingData = standingSnapshots[0].data();
  const standings = standingsByMode.general;

  return {
    seasonId,
    clubs,
    matches,
    standings,
    standingsByMode,
    updatedAt: [asIsoDate(standingData?.updatedAt), ...matches.map((match) => match.updatedAt)]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null,
  };
}

export const getSeasonOverview = (seasonId: number) => unstable_cache(
  () => loadSeasonOverview(seasonId),
  ["public-season-overview", String(seasonId)],
  { revalidate: 300, tags: [`season-${seasonId}`] },
)();

export async function getMatchById(seasonId: number, matchId: string) {
  const overview = await getSeasonOverview(seasonId);
  return overview.matches.find((match) => match.id === matchId) ?? null;
}

export async function getClubById(seasonId: number, clubId: string) {
  const overview = await getSeasonOverview(seasonId);
  const club = overview.clubs.find((candidate) => candidate.id === clubId) ?? null;
  if (!club) return null;
  return {
    club,
    matches: overview.matches.filter((match) => match.homeClub.id === clubId || match.awayClub.id === clubId),
    standing: overview.standings.find((row) => row.club.id === clubId) ?? null,
    updatedAt: overview.updatedAt,
  };
}

export async function getHeadToHead(seasonId: number, firstClubId: string, secondClubId: string) {
  const overview = await getSeasonOverview(seasonId);
  return overview.matches.filter((match) => {
    const ids = new Set([match.homeClub.id, match.awayClub.id]);
    return ids.has(firstClubId) && ids.has(secondClubId);
  });
}
