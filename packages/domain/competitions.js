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

export const CURRENT_SEASON_START_YEAR = 2026;

export const COMPETITION_CATALOG = Object.freeze([
  { id: "ligue-1", apiFootballId: 61, name: "Ligue 1", shortName: "L1", country: "France", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 34, rolloutOrder: 1, status: COMPETITION_STATUSES.LIVE, syncEnabled: true },
  { id: "champions-league", apiFootballId: 2, name: "Ligue des champions", shortName: "C1", country: null, format: COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT, leaguePhaseMatchdays: 8, rolloutOrder: 2, status: COMPETITION_STATUSES.PLANNED, syncEnabled: true },
  { id: "europa-league", apiFootballId: 3, name: "Ligue Europa", shortName: "C2", country: null, format: COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT, leaguePhaseMatchdays: 8, rolloutOrder: 3, status: COMPETITION_STATUSES.PLANNED, syncEnabled: false },
  { id: "conference-league", apiFootballId: 848, name: "Ligue Conférence", shortName: "C3", country: null, format: COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT, leaguePhaseMatchdays: 6, rolloutOrder: 4, status: COMPETITION_STATUSES.PLANNED, syncEnabled: false },
  { id: "premier-league", apiFootballId: 39, name: "Premier League", shortName: "PL", country: "Angleterre", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 38, rolloutOrder: 5, status: COMPETITION_STATUSES.PLANNED, syncEnabled: false },
  { id: "la-liga", apiFootballId: 140, name: "LaLiga", shortName: "Liga", country: "Espagne", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 38, rolloutOrder: 6, status: COMPETITION_STATUSES.PLANNED, syncEnabled: false },
  { id: "bundesliga", apiFootballId: 78, name: "Bundesliga", shortName: "Bundesliga", country: "Allemagne", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 34, rolloutOrder: 7, status: COMPETITION_STATUSES.PLANNED, syncEnabled: false },
  { id: "serie-a", apiFootballId: 135, name: "Serie A", shortName: "Serie A", country: "Italie", format: COMPETITION_FORMATS.DOMESTIC_LEAGUE, leaguePhaseMatchdays: 38, rolloutOrder: 8, status: COMPETITION_STATUSES.PLANNED, syncEnabled: false },
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

export function competitionsToSynchronize(catalog = COMPETITION_CATALOG) {
  return catalog.filter((competition) => competition.syncEnabled === true && Number.isInteger(competition.apiFootballId));
}

export function parseCompetitionRound(roundName, format = COMPETITION_FORMATS.DOMESTIC_LEAGUE) {
  const label = typeof roundName === "string" && roundName.trim() ? roundName.trim() : "Phase à confirmer";
  const normalized = label.toLowerCase();
  const numberedRound = normalized.match(/(?:regular season|league stage|matchday)[^0-9]*(\d+)\s*$/);
  if (numberedRound) {
    const journey = Number(numberedRound[1]);
    return {
      stage: format === COMPETITION_FORMATS.DOMESTIC_LEAGUE ? "league" : "league_phase",
      roundKey: `matchday-${journey}`,
      roundLabel: label,
      journey,
      leg: null,
    };
  }

  const stages = [
    [/qualif|preliminary/, "qualifying"],
    [/play-?offs?|barrages?/, "playoffs"],
    [/round of 16|8th finals?|huitièmes?/, "round_of_16"],
    [/quarter|quarts?/, "quarter_finals"],
    [/semi|demi/, "semi_finals"],
    [/final/, "final"],
  ];
  const stage = stages.find(([pattern]) => pattern.test(normalized))?.[1] ?? "other";
  const legMatch = normalized.match(/\bleg\s*(1|2)\b|\b(1st|2nd)\s+leg\b/);
  const leg = legMatch ? (legMatch[1] ? Number(legMatch[1]) : legMatch[2] === "1st" ? 1 : 2) : null;
  const roundKey = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
  return { stage, roundKey, roundLabel: label, journey: null, leg };
}

export function evaluateCompetitionReadiness({ syncEnabled, matches, futureMatches, clubs, missingClubDocuments, stagedMatches }) {
  const gates = {
    synchronizationEnabled: syncEnabled === true,
    matchesImported: matches > 0,
    futureScheduleAvailable: futureMatches > 0,
    clubsComplete: clubs > 0 && missingClubDocuments === 0,
    roundsClassified: matches > 0 && stagedMatches === matches,
  };
  return { gates, readyForPlayer: Object.values(gates).every(Boolean) };
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
