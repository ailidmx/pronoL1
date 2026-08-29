/**
 * Single source of truth for Firestore collection + subcollection names and
 * document path builders. See docs/rearchitecture-plan.md §4 for the model.
 *
 * Never hardcode a collection name anywhere else — import it from here.
 */

export const collections = {
  users: "users",
  accessPlans: "accessPlans",
  subscriptionOffers: "subscriptionOffers",
  seasons: "seasons",
  clubs: "clubs",
  players: "players",
  matches: "matches",
  standings: "standings",
  leaderboardPronostics: "leaderboardPronostics",
  leaderboardQuiz: "leaderboardQuiz",
  quizWeeks: "quizWeeks",
  bonus: "bonus",
  pushSubscriptions: "pushSubscriptions",
  pushRappels: "pushRappels",
  annonces: "annonces",
  communities: "communities",
  communityMemberships: "communityMemberships",
  communityInvites: "communityInvites",
};

export const subcollections = {
  pronostics: "pronostics",
  compositions: "compositions",
  stats: "stats",
  odds: "odds",
  questions: "questions",
  answers: "answers",
  options: "options",
};

export const paths = {
  user: (userId) => `${collections.users}/${userId}`,
  accessPlan: (planId) => `${collections.accessPlans}/${planId}`,
  subscriptionOffer: (offerId) => `${collections.subscriptionOffers}/${offerId}`,
  season: (seasonId) => `${collections.seasons}/${seasonId}`,
  club: (clubId) => `${collections.clubs}/${clubId}`,
  match: (matchId) => `${collections.matches}/${matchId}`,
  pronostic: (matchId, userId) =>
    `${collections.matches}/${matchId}/${subcollections.pronostics}/${userId}`,
  quizWeek: (weekId) => `${collections.quizWeeks}/${weekId}`,
  quizQuestion: (weekId, questionId) =>
    `${collections.quizWeeks}/${weekId}/${subcollections.questions}/${questionId}`,
  pushSubscription: (userId, hash) => `${collections.pushSubscriptions}/${userId}_${hash}`,
  pushRappel: (userId, matchId) => `${collections.pushRappels}/${userId}_${matchId}`,
  community: (communityId) => `${collections.communities}/${communityId}`,
  communityMembership: (communityId, userId) => `${collections.communityMemberships}/${communityId}_${userId}`,
  communityInvite: (code) => `${collections.communityInvites}/${code}`,
};
