import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompetitionSeasonId,
  COMPETITION_CATALOG,
  COMPETITION_FORMATS,
  exceedsCompetitionLimitPerSeason,
  parseCompetitionSeasonId,
} from "./index.js";

test("competition-season identifiers are stable and parseable", () => {
  assert.equal(buildCompetitionSeasonId("Champions-League", 2026), "champions-league:2026");
  assert.deepEqual(parseCompetitionSeasonId("ligue-1:2026"), { competitionId: "ligue-1", seasonId: 2026 });
  assert.equal(parseCompetitionSeasonId("ligue-1"), null);
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
