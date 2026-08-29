import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  collections,
  getDefaultAccessPlan,
  hasEntitlementFeature,
  resolveProfileAccessPlanId,
} from "@prono-l1/domain";

const PREMIUM_STAT_KEYS = new Set([
  "expected_goals",
  "Shots insidebox",
  "Shots outsidebox",
  "Blocked Shots",
  "Shots off Goal",
  "Offsides",
  "Passes %",
  "goals_prevented",
]);

function premiumValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const key of PREMIUM_STAT_KEYS) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number" || item === null) {
      result[key] = item;
    }
  }
  return result;
}

function premiumTeams(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? item : {};
    return {
      teamId: String(row.teamId ?? ""),
      values: premiumValues(row.values),
    };
  });
}

export const getPremiumMatchStatistics = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const matchId = typeof request.data?.matchId === "string" ? request.data.matchId.trim() : "";
  if (!matchId) {
    throw new HttpsError("invalid-argument", "matchId is required.");
  }

  const db = getFirestore();
  const profileSnap = await db.collection(collections.users).doc(request.auth.uid).get();
  if (!profileSnap.exists) {
    throw new HttpsError("permission-denied", "Access plan required.");
  }

  const profile = profileSnap.data() ?? {};
  const planId = resolveProfileAccessPlanId(profile);
  const planSnap = await db.collection(collections.accessPlans).doc(planId).get();
  const plan = planSnap.exists ? { id: planId, ...planSnap.data() } : getDefaultAccessPlan(planId);

  if (!hasEntitlementFeature(plan, "advancedStatistics")) {
    throw new HttpsError("permission-denied", "Advanced statistics entitlement required.");
  }

  const match = await db.collection(collections.matches).doc(matchId).get();
  if (!match.exists) {
    throw new HttpsError("not-found", "Match not found.");
  }

  const data = match.data() ?? {};
  return {
    matchId,
    homeTeamId: String(data.clubDomId ?? ""),
    awayTeamId: String(data.clubExtId ?? ""),
    teams: premiumTeams(data.statistics),
  };
});
