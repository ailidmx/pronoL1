import type { PublicAccessPlan, PublicSubscriptionOffer } from "@/server/entitlements-repository";
import { formatOfferPrice, offerIntervalLabel } from "@/server/entitlements-repository";

const FEATURE_ROWS = [
  ["scores", "Scores et résultats"],
  ["calendar", "Calendrier complet"],
  ["standings", "Classements"],
  ["analyses", "Analyses de match"],
  ["favorites", "Favoris"],
  ["history", "Historique personnel"],
  ["matchAlerts", "Alertes matchs"],
  ["communities", "Communautés privées"],
  ["multiCompetition", "Plusieurs compétitions"],
  ["advancedStatistics", "Statistiques avancées"],
  ["officialOdds", "Cotes officielles"],
  ["communityOdds", "Cotes de la communauté"],
  ["adFree", "Sans publicité"],
] as const;

type ComparisonColumn = {
  id: string;
  name: string;
  price: string;
  interval: string | null;
  badge: string | null;
  featured: boolean;
  href: string;
  action: string;
  plan: PublicAccessPlan;
};

function availability(enabled: boolean) {
  return enabled
    ? <><span className="comparison-check" aria-hidden="true">✓</span><span className="sr-only">Inclus</span></>
    : <><span className="comparison-dash" aria-hidden="true">—</span><span className="sr-only">Non inclus</span></>;
}

function limitValue(value: number | null | undefined) {
  if (value == null) return "Illimité";
  if (value === 0) return "—";
  return String(value);
}

export function PricingComparison({ plans, offers }: { plans: PublicAccessPlan[]; offers: PublicSubscriptionOffer[] }) {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const freeColumns: ComparisonColumn[] = plans
    .filter((plan) => plan.isPaid !== true)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      price: "0 €",
      interval: null,
      badge: plan.id === "registered" ? "Recommandé pour commencer" : null,
      featured: plan.id === "registered",
      href: plan.id === "public" ? "/ligue-1/2026-2027" : "/connexion",
      action: plan.id === "public" ? "Consulter" : "Créer mon compte",
      plan,
    }));
  const paidColumns: ComparisonColumn[] = offers.flatMap((offer) => {
    const plan = planById.get(offer.accessPlanId);
    if (!plan) return [];
    return [{
      id: offer.id,
      name: offer.name,
      price: formatOfferPrice(offer),
      interval: offerIntervalLabel(offer),
      badge: offer.badge,
      featured: offer.featured,
      href: "/pronostics",
      action: "Choisir cette offre",
      plan,
    }];
  });
  const columns = [...freeColumns, ...paidColumns];

  return (
    <div className="pricing-comparison-shell">
      <p className="comparison-scroll-hint">Fais glisser les offres pour les comparer <span aria-hidden="true">→</span></p>
      <div className="pricing-comparison-scroll" role="region" aria-label="Comparaison des offres" tabIndex={0}>
        <table className="pricing-comparison">
          <thead>
            <tr>
              <th scope="col">Fonctionnalités</th>
              {columns.map((column) => <th className={column.featured ? "is-featured" : ""} scope="col" key={column.id}>
                {column.badge ? <span className="comparison-badge">{column.badge}</span> : null}
                <strong>{column.name}</strong>
                <span className="comparison-price">{column.price} {column.interval ? <small>{column.interval}</small> : null}</span>
                <a href={column.href} data-experiment-action={`pricing-${column.id}`} data-experiment-location="pricing-table">{column.action}</a>
              </th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Communautés</th>
              {columns.map((column) => <td key={column.id}>{limitValue(column.plan.maxCommunities)}</td>)}
            </tr>
            <tr>
              <th scope="row">Compétitions par saison</th>
              {columns.map((column) => <td key={column.id}>{limitValue(column.plan.maxCompetitions)}</td>)}
            </tr>
            {FEATURE_ROWS.map(([key, label]) => <tr key={key}>
              <th scope="row">{label}</th>
              {columns.map((column) => <td key={column.id}>{availability(column.plan.features?.[key] === true)}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
