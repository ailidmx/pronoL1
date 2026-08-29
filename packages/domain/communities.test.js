import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ACCESS_PLANS,
  getEntitlementLimit,
  normalizeCommunityName,
  normalizeCompetitionKeys,
  normalizeInviteCode,
  validateCommunityInput,
} from "./index.js";

test("registered users are limited to one community and one competition", () => {
  const plan = DEFAULT_ACCESS_PLANS.find((item) => item.id === "registered");
  assert.equal(getEntitlementLimit(plan, "maxCommunities"), 1);
  assert.equal(getEntitlementLimit(plan, "maxCompetitions"), 1);
  assert.equal(plan.features.officialOdds, false);
  assert.equal(plan.features.communityOdds, false);
  assert.equal(plan.features.communities, true);
});

test("premium users unlock odds and unlimited communities/competitions", () => {
  const plan = DEFAULT_ACCESS_PLANS.find((item) => item.id === "premium");
  assert.equal(getEntitlementLimit(plan, "maxCommunities"), null);
  assert.equal(getEntitlementLimit(plan, "maxCompetitions"), null);
  assert.equal(plan.features.officialOdds, true);
  assert.equal(plan.features.communityOdds, true);
});

test("community input is normalized and validated", () => {
  assert.equal(normalizeCommunityName("  Les   collègues  "), "Les collègues");
  assert.deepEqual(normalizeCompetitionKeys(["LIGUE-1:2026", "ligue-1:2026", "bad"]), ["ligue-1:2026"]);
  assert.equal(normalizeInviteCode(" ab-12 cd "), "AB12CD");
  assert.equal(validateCommunityInput({ name: "Amis", competitionIds: ["ligue-1:2026"] }), null);
  assert.equal(validateCommunityInput({ name: "A", competitionIds: ["ligue-1:2026"] }), "name");
});
