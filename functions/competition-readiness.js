import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { collections, COMPETITION_CATALOG, CURRENT_SEASON_START_YEAR, evaluateCompetitionReadiness } from "@prono-l1/domain";
import { loadRequestAccess } from "./access.js";

const db = getFirestore();

function isoMillis(value) {
  const millis = Date.parse(String(value ?? ""));
  return Number.isFinite(millis) ? millis : null;
}

export const getCompetitionReadiness = onCall({ cors: true }, async (request) => {
  const access = await loadRequestAccess(db, request);
  if (!access.isAdmin) throw new HttpsError("permission-denied", "Administrator access required.");

  const allMatches = await db.collection(collections.matches).where("seasonId", "==", CURRENT_SEASON_START_YEAR).get();
  const now = Date.now();
  const rows = [];
  for (const competition of COMPETITION_CATALOG) {
    const matches = allMatches.docs.filter((document) => document.data().competitionId === competition.id);
    const clubIds = [...new Set(matches.flatMap((document) => [document.data().clubDomId, document.data().clubExtId]).filter((id) => id != null).map(String))];
    const clubSnapshots = clubIds.length ? await db.getAll(...clubIds.map((id) => db.collection(collections.clubs).doc(id))) : [];
    const missingClubDocuments = clubSnapshots.filter((snapshot) => !snapshot.exists).length;
    const futureMatches = matches.filter((document) => {
      const data = document.data();
      const millis = isoMillis(data.date);
      return data.statut === "a_venir" && millis !== null && millis > now;
    }).length;
    const stagedMatches = matches.filter((document) => {
      const data = document.data();
      return typeof data.stage === "string" && data.stage !== "other" && typeof data.roundKey === "string" && data.roundKey;
    }).length;
    const detailedMatches = matches.filter((document) => document.data().detailsUpdatedAt != null).length;
    const matchesWithOdds = matches.filter((document) => document.data().odds?.coteApiMajLe).length;
    const [seasonSnapshot, standingsSnapshot] = await Promise.all([
      db.collection(collections.seasons).doc(`${competition.id}_${CURRENT_SEASON_START_YEAR}`).get(),
      db.collection(collections.standings).doc(`${competition.id}_${CURRENT_SEASON_START_YEAR}_general`).get(),
    ]);
    const readiness = evaluateCompetitionReadiness({
      syncEnabled: competition.syncEnabled,
      matches: matches.length,
      futureMatches,
      clubs: clubIds.length,
      missingClubDocuments,
      stagedMatches,
    });
    rows.push({
      competitionId: competition.id,
      name: competition.name,
      status: competition.status,
      format: competition.format,
      syncEnabled: competition.syncEnabled === true,
      readyForPlayer: readiness.readyForPlayer,
      gates: readiness.gates,
      counts: {
        matches: matches.length,
        futureMatches,
        clubs: clubIds.length,
        missingClubDocuments,
        stagedMatches,
        detailedMatches,
        matchesWithOdds,
        standingsRows: standingsSnapshot.data()?.rows?.length ?? 0,
      },
      sync: seasonSnapshot.data()?.sync ?? null,
    });
  }
  return { seasonId: CURRENT_SEASON_START_YEAR, generatedAt: new Date().toISOString(), competitions: rows };
});
