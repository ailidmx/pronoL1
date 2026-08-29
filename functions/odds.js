import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { collections, hasEntitlementFeature, subcollections } from "@prono-l1/domain";
import { getUserAccessContext } from "./access.js";

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  return request.auth.uid;
}

function computeCommunityOdds(rows) {
  const valid = rows.filter((row) => Number.isInteger(row.scoreDom) && Number.isInteger(row.scoreExt));
  const total = valid.length;
  const threshold = 5;
  if (total < threshold) {
    return { sufficient: false, sampleSize: total, threshold };
  }

  let home = 0;
  let draw = 0;
  let away = 0;
  const scores = new Map();
  for (const prediction of valid) {
    if (prediction.scoreDom > prediction.scoreExt) home += 1;
    else if (prediction.scoreDom === prediction.scoreExt) draw += 1;
    else away += 1;
    const key = `${prediction.scoreDom}:${prediction.scoreExt}`;
    scores.set(key, (scores.get(key) ?? 0) + 1);
  }

  const maxScoreCount = Math.max(...scores.values());
  const popularScores = [...scores.entries()]
    .filter(([, count]) => count === maxScoreCount)
    .map(([score]) => {
      const [homeScore, awayScore] = score.split(":").map(Number);
      return { homeScore, awayScore };
    });

  const odd = (count) => count > 0 ? Math.round((total / count) * 100) / 100 : null;
  return {
    sufficient: true,
    sampleSize: total,
    threshold,
    odds: { home: odd(home), draw: odd(draw), away: odd(away) },
    distribution: {
      home: Math.round((home / total) * 1000) / 10,
      draw: Math.round((draw / total) * 1000) / 10,
      away: Math.round((away / total) * 1000) / 10,
    },
    popularScore: {
      scores: popularScores,
      count: maxScoreCount,
      percentage: Math.round((maxScoreCount / total) * 1000) / 10,
    },
  };
}

export const getMatchOdds = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const matchId = typeof request.data?.matchId === "string" ? request.data.matchId.trim() : String(request.data?.matchId ?? "").trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId is required.");

  const db = getFirestore();
  const { plan, planId } = await getUserAccessContext(db, uid);
  const canSeeOfficial = hasEntitlementFeature(plan, "officialOdds");
  const canSeeCommunity = hasEntitlementFeature(plan, "communityOdds");
  if (!canSeeOfficial && !canSeeCommunity) {
    throw new HttpsError("permission-denied", "Odds are not included in this access plan.");
  }

  const matchRef = db.collection(collections.matches).doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found.");
  const match = matchSnap.data();

  let community = null;
  if (canSeeCommunity) {
    const predictions = await matchRef.collection(subcollections.pronostics).get();
    community = computeCommunityOdds(predictions.docs.map((doc) => doc.data()));
  }

  return {
    matchId,
    planId,
    official: canSeeOfficial ? (match?.odds ?? null) : null,
    community,
    access: { official: canSeeOfficial, community: canSeeCommunity },
  };
});
