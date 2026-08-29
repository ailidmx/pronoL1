import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const FEATURE_LABELS = {
  scores: "Scores et résultats",
  calendar: "Calendrier",
  standings: "Classements",
  analyses: "Analyses de match",
  favorites: "Favoris",
  history: "Historique",
  matchAlerts: "Alertes matchs",
  advancedStatistics: "Statistiques avancées",
  officialOdds: "Cotes officielles",
  communityOdds: "Cotes de la communauté",
  communities: "Communautés de pronostics",
  adFree: "Sans publicité",
  pronoAdvantages: "Avantages Prono L1",
};

const LIMIT_LABELS = {
  maxCommunities: "Communautés maximum",
  maxCompetitions: "Compétitions maximum",
};

function moneyFromCents(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function EntitlementsPanel() {
  const [plans, setPlans] = useState([]);
  const [offers, setOffers] = useState([]);
  const [pending, setPending] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    const stopPlans = onSnapshot(
      collection(db, "accessPlans"),
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setError(null);
      },
      (reason) => setError(reason.message || "Impossible de charger les plans."),
    );
    const stopOffers = onSnapshot(
      collection(db, "subscriptionOffers"),
      (snap) => {
        setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setError(null);
      },
      (reason) => setError(reason.message || "Impossible de charger les offres."),
    );
    return () => { stopPlans(); stopOffers(); };
  }, []);

  const featureKeys = useMemo(() => {
    const dynamic = plans.flatMap((plan) => Object.keys(plan.features ?? {}));
    return [...new Set([...Object.keys(FEATURE_LABELS), ...dynamic])];
  }, [plans]);

  const limitKeys = useMemo(() => {
    const dynamic = plans.flatMap((plan) => Object.keys(plan.limits ?? {}));
    return [...new Set([...Object.keys(LIMIT_LABELS), ...dynamic])];
  }, [plans]);

  async function save(collectionName, id, patch) {
    const key = `${collectionName}:${id}`;
    setPending((current) => ({ ...current, [key]: true }));
    setError(null);
    try {
      await setDoc(doc(db, collectionName, id), patch, { merge: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La modification n'a pas pu être enregistrée.");
    } finally {
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function addPlan() {
    const id = window.prompt("Identifiant du nouveau plan (ex: vip)")?.trim();
    if (!id) return;
    save("accessPlans", id, {
      name: id,
      description: "",
      enabled: false,
      isPaid: false,
      sortOrder: plans.length * 10 + 10,
      analysisDailyLimit: 10,
      limits: Object.fromEntries(limitKeys.map((key) => [key, 0])),
      features: Object.fromEntries(featureKeys.map((key) => [key, false])),
    });
  }

  function addOffer() {
    const id = window.prompt("Identifiant de la nouvelle offre (ex: vip-annual)")?.trim();
    if (!id) return;
    save("subscriptionOffers", id, {
      name: id,
      accessPlanId: plans[0]?.id ?? "registered",
      enabled: false,
      featured: false,
      currency: "EUR",
      priceCents: 0,
      billingInterval: "month",
      intervalCount: 1,
      badge: null,
      sortOrder: offers.length * 10 + 10,
    });
  }

  return (
    <section>
      <h2>Accès & tarifs</h2>
      <p>Source de vérité Firestore pour les droits produit, les quotas et les offres commerciales.</p>
      {error ? <p role="alert">{error}</p> : null}

      <div className="admin-section-heading"><h3>Plans d'accès</h3><button onClick={addPlan}>Nouveau plan</button></div>
      {plans.length === 0 ? <p>Aucun plan. Exécute le seed du catalogue ou crée un plan ici.</p> : null}
      {plans.map((plan) => {
        const busy = pending[`accessPlans:${plan.id}`] === true;
        return (
          <article className="admin-card" key={plan.id}>
            <div className="admin-grid">
              <label>Identifiant<input value={plan.id} disabled /></label>
              <label>Nom<input value={plan.name ?? ""} disabled={busy} onChange={(e) => save("accessPlans", plan.id, { name: e.target.value })} /></label>
              <label>Limite analyses / jour<input type="number" min="0" value={plan.analysisDailyLimit ?? ""} disabled={busy} onChange={(e) => save("accessPlans", plan.id, { analysisDailyLimit: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              {limitKeys.map((key) => (
                <label key={key}>{LIMIT_LABELS[key] ?? key}<input type="number" min="0" placeholder="Illimité" value={plan.limits?.[key] ?? ""} disabled={busy} onChange={(e) => save("accessPlans", plan.id, { limits: { ...(plan.limits ?? {}), [key]: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
              ))}
              <label><input type="checkbox" checked={plan.enabled === true} disabled={busy} onChange={(e) => save("accessPlans", plan.id, { enabled: e.target.checked })} /> Actif</label>
              <label><input type="checkbox" checked={plan.isPaid === true} disabled={busy} onChange={(e) => save("accessPlans", plan.id, { isPaid: e.target.checked })} /> Payant</label>
            </div>
            <div className="feature-matrix">
              {featureKeys.map((key) => (
                <label key={key}><input type="checkbox" checked={plan.features?.[key] === true} disabled={busy} onChange={(e) => save("accessPlans", plan.id, { features: { ...(plan.features ?? {}), [key]: e.target.checked } })} /> {FEATURE_LABELS[key] ?? key}</label>
              ))}
            </div>
          </article>
        );
      })}

      <div className="admin-section-heading"><h3>Offres commerciales</h3><button onClick={addOffer}>Nouvelle offre</button></div>
      {offers.length === 0 ? <p>Aucune offre commerciale.</p> : null}
      {offers.map((offer) => {
        const busy = pending[`subscriptionOffers:${offer.id}`] === true;
        return (
          <article className="admin-card" key={offer.id}>
            <div className="admin-grid">
              <label>Nom<input value={offer.name ?? ""} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { name: e.target.value })} /></label>
              <label>Plan<select value={offer.accessPlanId ?? ""} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { accessPlanId: e.target.value })}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name ?? plan.id}</option>)}</select></label>
              <label>Prix<input type="number" min="0" step="0.01" value={moneyFromCents(offer.priceCents)} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { priceCents: Math.round(Number(e.target.value || 0) * 100) })} /></label>
              <label>Devise<input value={offer.currency ?? "EUR"} maxLength="3" disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { currency: e.target.value.toUpperCase() })} /></label>
              <label>Période<select value={offer.billingInterval ?? "month"} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { billingInterval: e.target.value })}><option value="month">Mensuelle</option><option value="year">Annuelle</option></select></label>
              <label>Badge<input value={offer.badge ?? ""} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { badge: e.target.value || null })} /></label>
              <label><input type="checkbox" checked={offer.enabled === true} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { enabled: e.target.checked })} /> Active</label>
              <label><input type="checkbox" checked={offer.featured === true} disabled={busy} onChange={(e) => save("subscriptionOffers", offer.id, { featured: e.target.checked })} /> Mise en avant</label>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default EntitlementsPanel;
