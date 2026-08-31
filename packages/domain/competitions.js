export const COMPETITION_FORMATS = Object.freeze({
  DOMESTIC_LEAGUE: "domestic_league",
  LEAGUE_PHASE_KNOCKOUT: "league_phase_knockout",
  KNOCKOUT: "knockout",
});

export const COMPETITION_STATUSES = Object.freeze({
  LIVE: "live",
  PLANNED: "planned",
  PAUSED: "paused",
});

export const COMPETITION_CATALOG = Object.freeze([
  { id: "ligue-1", apiFootballId: 61, name: "Ligue 1", shortName: "L1", country: "France", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 34, rolloutOrder: 1, status: COMPETITION_STATUSES.LIVE },
  { id: "champions-league", apiFootballId: 2, name: "Ligue des champions", shortName: "C1", country: null, format: COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT, leaguePhaseMatchdays: 8, rolloutOrder: 2, status: COMPETITION_STATUSES.PLANNED },
  { id: "europa-league", apiFootballId: 3, name: "Ligue Europa", shortName: "C2", country: null, format: COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT, leaguePhaseMatchdays: 8, rolloutOrder: 3, status: COMPETITION_STATUSES.PLANNED },
  { id: "conference-league", apiFootballId: 848, name: "Ligue Conférence", shortName: "C3", country: null, format: COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT, leaguePhaseMatchdays: 6, rolloutOrder: 4, status: COMPETITION_STATUSES.PLANNED },
  { id: "premier-league", apiFootballId: 39, name: "Premier League", shortName: "PL", country: "Angleterre", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 38, rolloutOrder: 5, status: COMPETITION_STATUSES.PLANNED },
  { id: "la-liga", apiFootballId: 140, name: "LaLiga", shortName: "Liga", country: "Espagne", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 38, rolloutOrder: 6, status: COMPETITION_STATUSES.PLANNED },
  { id: "bundesliga", apiFootballId: 78, name: "Bundesliga", shortName: "Bundesliga", country: "Allemagne", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 34, rolloutOrder: 7, status: COMPETITION_STATUSES.PLANNED },
  { id: "serie-a", apiFootballId: 135, name: "Serie A", shortName: "Serie A", country: "Italie", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 38, rolloutOrder: 8, status: COMPETITION_STATUSES.PLANNED },
]);

const COMPETITION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SEASON_PATTERN = /^\d{4}$/;

export function buildCompetitionSeasonId(competitionId, seasonId) {
  const normalizedCompetitionId = typeof competitionId === "string" ? competitionId.trim().toLowerCase() : "";
  const normalizedSeasonId = String(seasonId ?? "").trim();
  if (!COMPETITION_ID_PATTERN.test(normalizedCompetitionId) || !SEASON_PATTERN.test(normalizedSeasonId)) return null;
  return `${normalizedCompetitionId}:${normalizedSeasonId}`;
}

export function parseCompetitionSeasonId(value) {
  if (typeof value !== "string") return null;
  const [competitionId, seasonId, ...extra] = value.trim().toLowerCase().split(":");
  if (extra.length || !COMPETITION_ID_PATTERN.test(competitionId ?? "") || !SEASON_PATTERN.test(seasonId ?? "")) return null;
  return { competitionId, seasonId: Number(seasonId) };
}

export function competitionSeasonYear(value) {
  return parseCompetitionSeasonId(value)?.seasonId ?? null;
}

export function exceedsCompetitionLimitPerSeason(competitionSeasonIds, limit) {
  if (limit === null) return false;
  if (!Number.isInteger(limit) || limit < 0) return true;
  const counts = new Map();
  for (const value of new Set(competitionSeasonIds)) {
    const parsed = parseCompetitionSeasonId(value);
    if (!parsed) continue;
    counts.set(parsed.seasonId, (counts.get(parsed.seasonId) ?? 0) + 1);
    if (counts.get(parsed.seasonId) > limit) return true;
  }
  return false;
}
