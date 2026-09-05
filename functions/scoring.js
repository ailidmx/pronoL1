/**
 * Scoring of finished matches + leaderboard materialization.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  collections,
  subcollections,
  decomposePoints,
  DEFAULT_BAREME,
  buildCompetitionSeasonId,
} from "@prono-l1/domain";

// Scores pronostics of finished matches not yet scored, then materializes the
// per-player leaderboard (leaderboardPronostics/{competitionSeasonId}/rows/{userId}).
export const scoreFinishedMatches = onSchedule(
  { schedule: "*/15 * * * *", timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const finishedSnap = await db.collection(collections.matches)
      .where("statut", "==", "termine")
      .get();

    let scoredMatches = 0;
    let scoredPronostics = 0;
    for (const matchDoc of finishedSnap.docs) {
      const match = matchDoc.data();
      if (match.scoredAt != null) continue;
      const scoreDom = match.scoreDom;
      const scoreExt = match.scoreExt;
      if (scoreDom == null || scoreExt == null) continue;
      const competitionSeasonId = buildCompetitionSeasonId(match.competitionId, match.seasonId);
      if (!competitionSeasonId) throw new Error(`Match ${matchDoc.id} has no canonical competition-season identity.`);

      const pronosSnap = await matchDoc.ref.collection(subcollections.pronostics).get();
      for (const pDoc of pronosSnap.docs) {
        const p = pDoc.data();
        if (p.scoreDom == null || p.scoreExt == null) continue;
        const decomposition = decomposePoints(DEFAULT_BAREME, p.scoreDom, p.scoreExt, scoreDom, scoreExt);
        await pDoc.ref.set(
          {
            points: decomposition.total,
            resultat: decomposition.resultat,
            decomposition,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        await addLeaderboardPoints(db, competitionSeasonId, pDoc.id, decomposition);
        await db.collection(collections.notificationOutbox).doc(`result_${matchDoc.id}_${pDoc.id}`).set({
          uid: pDoc.id,
          topic: "results",
          title: "Ton pronostic a été compté",
          body: `${decomposition.total} point${decomposition.total > 1 ? "s" : ""} gagné${decomposition.total > 1 ? "s" : ""} sur ce match.`,
          url: `/`,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        scoredPronostics++;
      }

      await matchDoc.ref.set({ scoredAt: FieldValue.serverTimestamp() }, { merge: true });
      scoredMatches++;
    }

    return { scoredMatches, scoredPronostics };
  },
);

async function addLeaderboardPoints(db, competitionSeasonId, userId, d) {
  const rowRef = db
    .collection(collections.leaderboardPronostics)
    .doc(competitionSeasonId)
    .collection("rows")
    .doc(userId);
  const rowSnap = await rowRef.get();
  const prev = rowSnap.exists ? rowSnap.data() : {};
  await rowRef.set({
    userId,
    points: (prev.points ?? 0) + d.total,
    exact: (prev.exact ?? 0) + d.exact,
    bonResultat: (prev.bonResultat ?? 0) + d.bonResultat,
    bonusEcart: (prev.bonusEcart ?? 0) + d.bonusEcart,
    bonusButsDom: (prev.bonusButsDom ?? 0) + d.bonusButsDom,
    bonusButsExt: (prev.bonusButsExt ?? 0) + d.bonusButsExt,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
