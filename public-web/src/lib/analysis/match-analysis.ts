/**
 * Computed match analysis (no AI) — synthesizes recent form, head-to-head and
 * standings into a readable verdict. Pure + testable; the match page computes it
 * server-side and hands the result to a client component that gates it behind
 * the daily analysis counter.
 */
import type { Club, FootballMatch, SeasonOverview, StandingRow } from "@/server/football-repository";

export type FormRecord = {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type TeamAnalysis = {
  club: Club;
  form: FormRecord;
  standing: StandingRow | null;
  score: number;
};

export type MatchAnalysis = {
  home: TeamAnalysis;
  away: TeamAnalysis;
  headToHead: { played: number; homeWins: number; awayWins: number; draws: number };
  verdict: string;
  verdictReason: string;
  favorite: "home" | "away" | "draw";
};

const EMPTY_FORM: FormRecord = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };

export function computeForm(club: Club, matches: FootballMatch[], limit = 5): FormRecord {
  const completed = matches
    .filter((match) => match.status === "termine")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
  const record: FormRecord = { ...EMPTY_FORM };
  for (const match of completed) {
    const isHome = match.homeClub.id === club.id;
    const own = isHome ? match.homeScore : match.awayScore;
    const other = isHome ? match.awayScore : match.homeScore;
    if (own == null || other == null) continue;
    if (own > other) { record.wins += 1; record.points += 3; }
    else if (own === other) { record.draws += 1; record.points += 1; }
    else record.losses += 1;
    record.goalsFor += own;
    record.goalsAgainst += other;
  }
  return record;
}

export function computeHeadToHead(match: FootballMatch, matches: FootballMatch[], limit = 5) {
  const direct = matches
    .filter((candidate) =>
      candidate.id !== match.id &&
      candidate.status === "termine" &&
      ((candidate.homeClub.id === match.homeClub.id && candidate.awayClub.id === match.awayClub.id) ||
       (candidate.homeClub.id === match.awayClub.id && candidate.awayClub.id === match.homeClub.id)),
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (const candidate of direct) {
    const homeIsHome = candidate.homeClub.id === match.homeClub.id;
    const homeScore = homeIsHome ? candidate.homeScore : candidate.awayScore;
    const awayScore = homeIsHome ? candidate.awayScore : candidate.homeScore;
    if (homeScore == null || awayScore == null) continue;
    if (homeScore > awayScore) homeWins += 1;
    else if (homeScore < awayScore) awayWins += 1;
    else draws += 1;
  }
  return { played: direct.length, homeWins, awayWins, draws };
}

export function analyzeMatch(match: FootballMatch, overview: SeasonOverview): MatchAnalysis {
  const homeForm = computeForm(match.homeClub, overview.matches);
  const awayForm = computeForm(match.awayClub, overview.matches);
  const homeStanding = overview.standings.find((row) => row.club.id === match.homeClub.id) ?? null;
  const awayStanding = overview.standings.find((row) => row.club.id === match.awayClub.id) ?? null;
  const headToHead = computeHeadToHead(match, overview.matches);

  const clubCount = overview.clubs.length || 18;
  const standingScore = (row: StandingRow | null) => (row ? clubCount - row.rank + 1 : 0);

  // Heuristic (documented, transparent): form points + standing position +
  // home advantage (+3) + recent head-to-head (capped at 3).
  const homeScore = homeForm.points + standingScore(homeStanding) + 3 + Math.min(headToHead.homeWins, 3);
  const awayScore = awayForm.points + standingScore(awayStanding) + Math.min(headToHead.awayWins, 3);

  const diff = homeScore - awayScore;
  const favorite: "home" | "away" | "draw" = Math.abs(diff) <= 2 ? "draw" : diff > 0 ? "home" : "away";

  const favoriteName = favorite === "home" ? match.homeClub.name : favorite === "away" ? match.awayClub.name : null;
  const verdict = favoriteName ? `${favoriteName} est favori.` : "Match serré — aucune équipe ne se détache.";

  const verdictReason = [
    `${match.homeClub.name} : ${homeForm.wins}V ${homeForm.draws}N ${homeForm.losses}D (${homeForm.points} pts de forme)`,
    `${match.awayClub.name} : ${awayForm.wins}V ${awayForm.draws}N ${awayForm.losses}D (${awayForm.points} pts de forme)`,
    headToHead.played > 0
      ? `Confrontations : ${headToHead.homeWins}–${headToHead.awayWins} (${headToHead.draws} nuls)`
      : "Aucune confrontation récente.",
  ].join(" · ");

  return {
    home: { club: match.homeClub, form: homeForm, standing: homeStanding, score: homeScore },
    away: { club: match.awayClub, form: awayForm, standing: awayStanding, score: awayScore },
    headToHead,
    verdict,
    verdictReason,
    favorite,
  };
}
