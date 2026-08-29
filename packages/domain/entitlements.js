export const ENTITLEMENT_FEATURES = [
  { key: "scores", label: "Scores et résultats" },
  { key: "calendar", label: "Calendrier" },
  { key: "standings", label: "Classements" },
  { key: "analyses", label: "Analyses de match" },
  { key: "favorites", label: "Favoris" },
  { key: "history", label: "Historique" },
  { key: "matchAlerts", label: "Alertes matchs" },
  { key: "advancedStatistics", label: "Statistiques avancées" },
  { key: "officialOdds", label: "Cotes officielles" },
  { key: "communityOdds", label: "Cotes communauté" },
  { key: "communities", label: "Communautés" },
  { key: "multiCompetition", label: "Multi-compétitions" },
  { key: "adFree", label: "Sans publicité" },
  { key: "pronoAdvantages", label: "Avantages Prono L1" },
];

export const DEFAULT_ACCESS_PLAN_ID = "registered";

export const DEFAULT_ACCESS_PLANS = [
  {
    id: "public",
    name: "Accès libre",
    description: "Consultation sans compte.",
    enabled: true,
    isPaid: false,
    sortOrder: 10,
    analysisDailyLimit: 5,
    maxCommunities: 0,
    maxCompetitions: 0,
    features: {
      scores: true,
      calendar: true,
      standings: true,
      analyses: true,
      favorites: false,
      history: false,
      matchAlerts: false,
      advancedStatistics: false,
      officialOdds: false,
      communityOdds: false,
      communities: false,
      multiCompetition: false,
      adFree: false,
      pronoAdvantages: false,
    },
  },
  {
    id: "registered",
    name: "Compte gratuit",
    description: "Accès gratuit avec une compétition et une communauté.",
    enabled: true,
    isPaid: false,
    sortOrder: 20,
    analysisDailyLimit: 10,
    maxCommunities: 1,
    maxCompetitions: 1,
    features: {
      scores: true,
      calendar: true,
      standings: true,
      analyses: true,
      favorites: true,
      history: true,
      matchAlerts: true,
      advancedStatistics: false,
      officialOdds: false,
      communityOdds: false,
      communities: true,
      multiCompetition: false,
      adFree: false,
      pronoAdvantages: false,
    },
  },
  {
    id: "premium",
    name: "Premium",
    description: "Accès complet : cotes, communautés et compétitions sans limite produit.",
    enabled: true,
    isPaid: true,
    sortOrder: 30,
    analysisDailyLimit: null,
    maxCommunities: null,
    maxCompetitions: null,
    features: {
      scores: true,
      calendar: true,
      standings: true,
      analyses: true,
      favorites: true,
      history: true,
      matchAlerts: true,
      advancedStatistics: true,
      officialOdds: true,
      communityOdds: true,
      communities: true,
      multiCompetition: true,
      adFree: true,
      pronoAdvantages: true,
    },
  },
];

export const DEFAULT_SUBSCRIPTION_OFFERS = [
  {
    id: "premium-monthly",
    name: "Premium mensuel",
    accessPlanId: "premium",
    enabled: true,
    featured: false,
    currency: "EUR",
    priceCents: 499,
    billingInterval: "month",
    intervalCount: 1,
    badge: null,
    sortOrder: 10,
  },
  {
    id: "premium-annual",
    name: "Premium annuel",
    accessPlanId: "premium",
    enabled: true,
    featured: true,
    currency: "EUR",
    priceCents: 4999,
    billingInterval: "year",
    intervalCount: 1,
    badge: "Près de 2 mois offerts",
    sortOrder: 20,
  },
];

export function getDefaultAccessPlan(planId) {
  return DEFAULT_ACCESS_PLANS.find((plan) => plan.id === planId) ?? null;
}

export function resolveProfileAccessPlanId(profile) {
  if (typeof profile?.accessPlanId === "string" && profile.accessPlanId.trim()) {
    return profile.accessPlanId;
  }
  return profile?.isPremium === true ? "premium" : DEFAULT_ACCESS_PLAN_ID;
}

export function hasEntitlementFeature(plan, featureKey) {
  return plan?.enabled === true && plan?.features?.[featureKey] === true;
}

export function getEntitlementLimit(plan, key) {
  const value = plan?.[key];
  if (value === null) return null;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}
