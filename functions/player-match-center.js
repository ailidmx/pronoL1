import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { collections, subcollections } from "@prono-l1/domain";
import { canUseFeature, loadRequestAccess } from "./access.js";

const db = getFirestore();
const COMMUNITY_ODDS_MIN_SAMPLE = 5;

function cleanMatch(document) {
  const data = document.data();
  return {
    id: document.id,
    seasonId: data.seasonId ?? null,
    journey: data.journee ?? null,
    date: data.date ?? null,
    homeClubId: String(data.clubDomId ?? ""),
    awayClubId: String(data.clubExtId ?? ""),
    homeScore: data.scoreDom ?? null,
    awayScore: data.scoreExt ?? null,
    status: data.statut ?? "a_venir",
    venue: data.venue ?? null,
    city: data.city ?? null,
    referee: data.referee ?? null,
    events: Array.isArray(data.events) ? data.events : [],
    lineups: Array.isArray(data.lineups) ? data.lineups : [],
    statistics: Array.isArray(data.statistics) ? data.statistics : [],
  };
}

function resultForClub(match, clubId) {
  const data = match.data();
  if (data.statut !== "termine" || data.scoreDom == null || data.scoreExt == null) return null;
  const home = String(data.clubDomId) === clubId;
  const scored = home ? data.scoreDom : data.scoreExt;
  const conceded = home ? data.scoreExt : data.scoreDom;
  return scored === conceded ? "N" : scored > conceded ? "V" : "D";
}

function cleanPrediction(document) {
  const data = document.data();
  return {
    userId: document.id,
    homeScore: data.scoreDom ?? null,
    awayScore: data.scoreExt ?? null,
    points: data.points ?? null,
    result: data.resultat ?? null,
    breakdown: data.decomposition ?? null,
  };
}

function cleanOfficialOdds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const home = Number(value.coteDomApi);
  const draw = Number(value.coteNulApi);
  const away = Number(value.coteExtApi);
  if (![home, draw, away].some(Number.isFinite)) return null;
  return {
    home: Number.isFinite(home) ? home : null,
    draw: Number.isFinite(draw) ? draw : null,
    away: Number.isFinite(away) ? away : null,
    frozenAt: value.figeeLe ?? null,
  };
}

function communityOdds(predictions = []) {
  const usable = predictions.filter((prediction) => Number.isInteger(prediction.homeScore) && Number.isInteger(prediction.awayScore));
  const sampleSize = usable.length;
  if (sampleSize < COMMUNITY_ODDS_MIN_SAMPLE) {
    return { sufficient: false, sampleSize, threshold: COMMUNITY_ODDS_MIN_SAMPLE, home: null, draw: null, away: null };
  }
  const counts = usable.reduce((result, prediction) => {
    const key = prediction.homeScore === prediction.awayScore ? "draw" : prediction.homeScore > prediction.awayScore ? "home" : "away";
    result[key] += 1;
    return result;
  }, { home: 0, draw: 0, away: 0 });
  const asOdd = (count) => count > 0 ? Math.round((sampleSize / count) * 100) / 100 : null;
  return { sufficient: true, sampleSize, threshold: COMMUNITY_ODDS_MIN_SAMPLE, home: asOdd(counts.home), draw: asOdd(counts.draw), away: asOdd(counts.away) };
}

export const getPlayerMatchCenter = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const access = await loadRequestAccess(db, request);
  const uid = access.uid;
  const seasonId = Number(request.data?.seasonId);
  const scope = request.data?.scope === "history" ? "history" : "journey";
  const requestedJourney = Number(request.data?.journey);
  if (!Number.isInteger(seasonId) || seasonId < 2000 || seasonId > 2100) {
    throw new HttpsError("invalid-argument", "Invalid seasonId.");
  }
  const oddsAccess = {
    official: canUseFeature(access, "officialOdds"),
    community: canUseFeature(access, "communityOdds"),
  };

  const snapshot = await db.collection(collections.matches).where("seasonId", "==", seasonId).get();
  const allMatchDocs = snapshot.docs.sort((a, b) => String(a.data().date ?? "").localeCompare(String(b.data().date ?? "")));
  const journeys = [...new Set(allMatchDocs.map((match) => match.data().journee).filter(Number.isInteger))].sort((a, b) => a - b);

  let selectedJourney = requestedJourney;
  if (!journeys.includes(selectedJourney)) {
    selectedJourney = journeys.find((journey) => allMatchDocs.some((match) => match.data().journee === journey && match.data().statut === "a_venir")) ?? journeys.at(-1) ?? null;
  }

  const candidateDocs = scope === "history" ? allMatchDocs : allMatchDocs.filter((match) => match.data().journee === selectedJourney);
  const ownRefs = candidateDocs.map((match) => match.ref.collection(subcollections.pronostics).doc(uid));
  const ownSnapshots = ownRefs.length ? await db.getAll(...ownRefs) : [];
  const ownByMatch = new Map();
  ownSnapshots.forEach((prediction, index) => {
    if (prediction.exists) ownByMatch.set(candidateDocs[index].id, cleanPrediction(prediction));
  });

  const visibleDocs = scope === "history"
    ? candidateDocs.filter((match) => ownByMatch.has(match.id)).sort((a, b) => String(b.data().date ?? "").localeCompare(String(a.data().date ?? "")))
    : candidateDocs;

  const allPredictions = new Map();
  const publicPredictions = new Map();
  await Promise.all(visibleDocs.map(async (match) => {
    const finishedAndVisible = scope !== "history" && match.data().statut !== "a_venir";
    if (!finishedAndVisible && !oddsAccess.community) return;
    const predictions = await match.ref.collection(subcollections.pronostics).get();
    const cleaned = predictions.docs.map(cleanPrediction);
    allPredictions.set(match.id, cleaned);
    if (finishedAndVisible) publicPredictions.set(match.id, cleaned);
  }));

  const clubIds = [...new Set(visibleDocs.flatMap((match) => [String(match.data().clubDomId ?? ""), String(match.data().clubExtId ?? "")]).filter(Boolean))];
  const clubSnapshots = clubIds.length ? await db.getAll(...clubIds.map((id) => db.collection(collections.clubs).doc(id))) : [];
  const clubs = Object.fromEntries(clubSnapshots.map((club) => [club.id, { id: club.id, name: club.data()?.nom ?? club.id, logoUrl: club.data()?.logoUrl ?? null }]));

  const playerIds = [...new Set([...publicPredictions.values()].flat().map((prediction) => prediction.userId))];
  const playerSnapshots = playerIds.length ? await db.getAll(...playerIds.map((id) => db.collection(collections.users).doc(id))) : [];
  const playerNames = new Map(playerSnapshots.map((player) => [player.id, player.data()?.displayName || "Joueur"]));

  return {
    seasonId,
    scope,
    journeys,
    selectedJourney,
    clubs,
    oddsAccess,
    accessPlanId: access.planId,
    matches: visibleDocs.map((document) => ({
      ...cleanMatch(document),
      form: Object.fromEntries([String(document.data().clubDomId), String(document.data().clubExtId)].map((clubId) => [clubId, allMatchDocs
        .filter((candidate) => candidate.id !== document.id && [String(candidate.data().clubDomId), String(candidate.data().clubExtId)].includes(clubId) && String(candidate.data().date ?? "") < String(document.data().date ?? ""))
        .slice(-5).map((candidate) => resultForClub(candidate, clubId)).filter(Boolean)])),
      headToHead: allMatchDocs.filter((candidate) => candidate.id !== document.id
        && candidate.data().statut === "termine"
        && [String(candidate.data().clubDomId), String(candidate.data().clubExtId)].includes(String(document.data().clubDomId))
        && [String(candidate.data().clubDomId), String(candidate.data().clubExtId)].includes(String(document.data().clubExtId)))
        .slice(-5).reverse().map(cleanMatch),
      myPrediction: ownByMatch.get(document.id) ?? null,
      predictionsVisible: scope === "journey" && document.data().statut !== "a_venir",
      predictions: (publicPredictions.get(document.id) ?? []).map((prediction) => ({ ...prediction, displayName: playerNames.get(prediction.userId) ?? "Joueur" })),
      odds: {
        official: oddsAccess.official ? cleanOfficialOdds(document.data().odds) : null,
        community: oddsAccess.community ? communityOdds(allPredictions.get(document.id) ?? []) : null,
      },
    })),
  };
});
