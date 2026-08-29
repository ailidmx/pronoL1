export type JourneyNavigationMatch = {
  journey: number | null;
  date: string | null;
  status: string;
};

const MATCH_SETTLE_GRACE_MS = 4 * 60 * 60 * 1000;

export function listAvailableJourneys(matches: JourneyNavigationMatch[]) {
  return [...new Set(matches
    .map((match) => match.journey)
    .filter((journey): journey is number => Number.isInteger(journey) && journey !== null && journey > 0 && journey <= 34))]
    .sort((a, b) => a - b);
}

export function resolveDefaultJourney(matches: JourneyNavigationMatch[], now = new Date()): number | null {
  const journeys = listAvailableJourneys(matches);
  if (journeys.length === 0) return null;

  const liveMatch = matches.find((match) => match.status === "en_cours" && match.journey !== null && journeys.includes(match.journey));
  if (liveMatch?.journey) return liveMatch.journey;

  const nowMs = now.getTime();
  const datedJourneys = journeys
    .map((journey) => {
      const dates = matches
        .filter((match) => match.journey === journey && match.date)
        .map((match) => new Date(match.date as string).getTime())
        .filter(Number.isFinite);

      return {
        journey,
        firstKickoff: dates.length > 0 ? Math.min(...dates) : Number.POSITIVE_INFINITY,
        lastKickoff: dates.length > 0 ? Math.max(...dates) : Number.NEGATIVE_INFINITY,
      };
    })
    .filter(({ firstKickoff }) => Number.isFinite(firstKickoff))
    .sort((a, b) => a.firstKickoff - b.firstKickoff);

  const currentOrNext = datedJourneys.find(({ lastKickoff }) => lastKickoff + MATCH_SETTLE_GRACE_MS >= nowMs);
  if (currentOrNext) return currentOrNext.journey;

  const undatedUpcoming = matches.find((match) => match.status === "a_venir" && !match.date && match.journey !== null && journeys.includes(match.journey));
  if (undatedUpcoming?.journey) return undatedUpcoming.journey;

  return journeys[journeys.length - 1];
}
