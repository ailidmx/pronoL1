import "server-only";

import { firestore } from "./firebase-admin";

export type PublicAccessPlan = {
  id: string;
  name: string;
  enabled: boolean;
  isPaid: boolean;
  features: Record<string, boolean>;
  sortOrder: number;
};

export type PublicSubscriptionOffer = {
  id: string;
  name: string;
  accessPlanId: string;
  enabled: boolean;
  featured: boolean;
  currency: string;
  priceCents: number;
  billingInterval: "month" | "year";
  badge: string | null;
  sortOrder: number;
};

const fallbackPlans: PublicAccessPlan[] = [
  { id: "public", name: "Accès libre", enabled: true, isPaid: false, sortOrder: 10, features: { scores: true, calendar: true, standings: true } },
  { id: "registered", name: "Compte gratuit", enabled: true, isPaid: false, sortOrder: 20, features: { scores: true, calendar: true, standings: true, analyses: true, favorites: true, history: true, matchAlerts: true } },
  { id: "premium", name: "Premium", enabled: true, isPaid: true, sortOrder: 30, features: { scores: true, calendar: true, standings: true, analyses: true, favorites: true, history: true, matchAlerts: true, advancedStatistics: true, adFree: true, pronoAdvantages: true } },
];

const fallbackOffers: PublicSubscriptionOffer[] = [
  { id: "premium-monthly", name: "Premium mensuel", accessPlanId: "premium", enabled: true, featured: false, currency: "EUR", priceCents: 499, billingInterval: "month", badge: null, sortOrder: 10 },
  { id: "premium-annual", name: "Premium annuel", accessPlanId: "premium", enabled: true, featured: true, currency: "EUR", priceCents: 4999, billingInterval: "year", badge: "2 mois offerts", sortOrder: 20 },
];

export async function getPublicEntitlementCatalog() {
  try {
    const [plansSnap, offersSnap] = await Promise.all([
      firestore.collection("accessPlans").get(),
      firestore.collection("subscriptionOffers").get(),
    ]);

    const plans = plansSnap.empty ? fallbackPlans : plansSnap.docs.map((document) => ({ id: document.id, ...document.data() } as PublicAccessPlan));
    const offers = offersSnap.empty ? fallbackOffers : offersSnap.docs.map((document) => ({ id: document.id, ...document.data() } as PublicSubscriptionOffer));

    return {
      plans: plans.filter((plan) => plan.enabled === true).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      offers: offers.filter((offer) => offer.enabled === true).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    };
  } catch (error) {
    console.error("Entitlement catalog unavailable", error);
    return { plans: fallbackPlans, offers: fallbackOffers };
  }
}

export function formatOfferPrice(offer: PublicSubscriptionOffer) {
  const value = offer.priceCents / 100;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: offer.currency }).format(value);
}

export function offerIntervalLabel(offer: PublicSubscriptionOffer) {
  return offer.billingInterval === "year" ? "/ an" : "/ mois";
}
