import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompetitionSeasonId,
  COMPETITION_CATALOG,
  COMPETITION_FORMATS,
  competitionsToSynchronize,
  evaluateCompetitionReadiness,
  exceedsCompetitionLimitPerSeason,
  parseCompetitionRound,
  parseCompetitionSeasonId,
} from "./index.js";

test("competition-season identifiers are stable and parseable", () => {
  assert.equal(buildCompetitionSeasonId("Champions-League", 2026), "champions-league:2026");
  assert.deepEqual(parseCompetitionSeasonId("ligue-1:2026"), { competitionId: "ligue-1", seasonId: 2026 });
  assert.equal(parseCompetitionSeasonId("ligue-1"), null);
});

test("only live and deliberately prepared competitions are synchronized", () => {
  assert.deepEqual(competitionsToSynchronize().map((competition) => competition.id), ["ligue-1", "champions-league"]);
});

test("API-Football rounds preserve league matchdays and knockout stages", () => {
  assert.deepEqual(parseCompetitionRound("Regular Season - 12"), {
    stage: "league", roundKey: "matchday-12", roundLabel: "Regular Season - 12", journey: 12, leg: null,
  });
  assert.deepEqual(parseCompetitionRound("League Stage - 3", COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT), {
    stage: "league_phase", roundKey: "matchday-3", roundLabel: "League Stage - 3", journey: 3, leg: null,
  });
  assert.equal(parseCompetitionRound("Round of 16").stage, "round_of_16");
  assert.equal(parseCompetitionRound("Semi-finals").stage, "semi_finals");
  assert.equal(parseCompetitionRound("Final").stage, "final");
  assert.equal(parseCompetitionRound("1st Qualifying Round").leg, null);
  assert.equal(parseCompetitionRound("Round of 16 - 2nd Leg").leg, 2);
  assert.notEqual(parseCompetitionRound("1st Qualifying Round").roundKey, parseCompetitionRound("2nd Qualifying Round").roundKey);
});

test("player activation requires a complete future competition schedule", () => {
  const ready = evaluateCompetitionReadiness({ syncEnabled: true, matches: 189, futureMatches: 144, clubs: 36, missingClubDocuments: 0, stagedMatches: 189 });
  assert.equal(ready.readyForPlayer, true);
  const incomplete = evaluateCompetitionReadiness({ syncEnabled: true, matches: 189, futureMatches: 144, clubs: 36, missingClubDocuments: 1, stagedMatches: 189 });
  assert.equal(incomplete.readyForPlayer, false);
  assert.equal(incomplete.gates.clubsComplete, false);
});

test("the rollout catalog captures competition format differences", () => {
  const championsLeague = COMPETITION_CATALOG.find((competition) => competition.id === "champions-league");
  const conferenceLeague = COMPETITION_CATALOG.find((competition) => competition.id === "conference-league");
  assert.equal(championsLeague.format, COMPETITION_FORMATS.LEAGUE_PHASE_KNOCKOUT);
  assert.equal(championsLeague.leaguePhaseMatchdays, 8);
  assert.equal(conferenceLeague.leaguePhaseMatchdays, 6);
});

test("free competition limits apply independently to each annual season", () => {
  assert.equal(exceedsCompetitionLimitPerSeason(["ligue-1:2026"], 1), false);
  assert.equal(exceedsCompetitionLimitPerSeason(["ligue-1:2026", "champions-league:2026"], 1), true);
  assert.equal(exceedsCompetitionLimitPerSeason(["ligue-1:2026", "champions-league:2027"], 1), false);
  assert.equal(exceedsCompetitionLimitPerSeason(["ligue-1:2026", "champions-league:2026"], null), false);
});
