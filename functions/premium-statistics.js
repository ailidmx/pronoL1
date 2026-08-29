import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { collections } from "@prono-l1/domain";

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
  const profile = await db.collection(collections.users).doc(request.auth.uid).get();
  if (!profile.exists || profile.data()?.isPremium !== true) {
    throw new HttpsError("permission-denied", "Premium entitlement required.");
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
