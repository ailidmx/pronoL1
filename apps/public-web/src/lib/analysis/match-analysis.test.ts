import { describe, expect, it } from "vitest";
import { analyzeMatch, computeForm } from "./match-analysis";
import type { Club, FootballMatch, SeasonOverview, StandingRow } from "@/server/football-repository";

const clubA: Club = { id: "a", name: "Club A", code: null, logoUrl: null };
const clubB: Club = { id: "b", name: "Club B", code: null, logoUrl: null };

function match(
  id: string,
  home: Club,
  away: Club,
  homeScore: number | null,
  awayScore: number | null,
  status = "termine",
  date = "2026-08-01T00:00:00Z",
): FootballMatch {
  return {
    id, journey: 1, date, homeClub: home, awayClub: away,
    homeScore, awayScore, status, updatedAt: null,
    events: [], lineups: [], statistics: [], venue: null, city: null, referee: null,
  };
}

function standing(rank: number, club: Club): StandingRow {
  return { rank, club, played: 5, won: 3, drawn: 1, lost: 1, goalsFor: 10, goalsAgainst: 5, difference: 5, points: 10, form: null };
}

function makeClubs(count: number): Club[] {
  return Array.from({ length: count }, (_, i) => ({ id: `c${i}`, name: `Club ${i}`, code: null, logoUrl: null }));
}

describe("computeForm", () => {
  it("counts wins/draws/losses and points", () => {
    const matches = [
      match("1", clubA, clubB, 2, 0),
      match("2", clubB, clubA, 1, 1),
      match("3", clubA, clubB, 0, 1),
    ];
    expect(computeForm(clubA, matches)).toEqual({ wins: 1, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 2, points: 4 });
  });
});

describe("analyzeMatch", () => {
  it("favors the home team with the better standing", () => {
    const overview: SeasonOverview = {
      seasonId: 2026,
      clubs: [clubA, clubB, ...makeClubs(16)],
      matches: [match("1", clubA, clubB, 2, 0)],
      standings: [standing(1, clubA), standing(18, clubB)],
      standingsByMode: { general: [], domicile: [], exterieur: [] },
      updatedAt: null,
    };
    const target = match("t", clubA, clubB, null, null, "a_venir", "2026-09-01T00:00:00Z");
    const analysis = analyzeMatch(target, overview);
    expect(analysis.favorite).toBe("home");
    expect(analysis.verdict).toContain("Club A");
    expect(analysis.headToHead.homeWins).toBe(1);
  });
});
