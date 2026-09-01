import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { collections, parseCompetitionSeasonId } from "@prono-l1/domain";

const db = getFirestore();

/**
 * Read-model endpoint: equivalent to a safe SQL view joining leaderboard rows
 * with the public part of player profiles. Private profile fields never leave
 * the backend and the client does not need collection-wide access to `users`.
 */
export const getPronosticsLeaderboard = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");

  const competitionSeasonId = String(request.data?.competitionSeasonId ?? "");
  if (!parseCompetitionSeasonId(competitionSeasonId)) throw new HttpsError("invalid-argument", "Invalid competitionSeasonId.");

  const rowsSnapshot = await db
    .collection(collections.leaderboardPronostics)
    .doc(competitionSeasonId)
    .collection("rows")
    .get();

  const userRefs = rowsSnapshot.docs.map((row) => db.collection(collections.users).doc(row.id));
  const userSnapshots = userRefs.length ? await db.getAll(...userRefs) : [];
  const names = new Map(userSnapshots.map((user) => [user.id, user.data()?.displayName || "Joueur"]));

  const rows = rowsSnapshot.docs
    .map((row) => ({ userId: row.id, displayName: names.get(row.id) ?? "Joueur", ...row.data() }))
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  let previousPoints = null;
  let previousRank = 0;
  return {
    competitionSeasonId,
    rows: rows.map((row, index) => {
      const rank = row.points === previousPoints ? previousRank : index + 1;
      previousPoints = row.points;
      previousRank = rank;
      return { ...row, rank };
    }),
  };
});
