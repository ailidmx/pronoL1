"use client";

import { useEffect, useState } from "react";
import { ADVANCED_STATS } from "@/lib/statistics";
import { getPremiumMatchStatistics } from "@/lib/client/firebase";
import { usePremium } from "@/lib/client/premium";
import { StatRows, type StatValues } from "./match-statistics";

type PremiumStats = { home: StatValues; away: StatValues };

export function AdvancedStatistics({ matchId }: { matchId: string }) {
  const { advancedStatistics, loading: entitlementLoading } = usePremium();
  const [stats, setStats] = useState<PremiumStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!advancedStatistics) {
      setStats(null);
      setLoading(false);
      setError(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setError(false);
    getPremiumMatchStatistics({ matchId })
      .then((response) => {
        if (cancelled) return;
        const data = response.data;
        const home = data.teams.find((item) => item.teamId === data.homeTeamId)?.values;
        const away = data.teams.find((item) => item.teamId === data.awayTeamId)?.values;
        setStats(home && away ? { home, away } : null);
      })
      .catch(() => {
        if (cancelled) return;
        setStats(null);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [advancedStatistics, matchId]);

  if (entitlementLoading) {
    return (
      <section className="data-panel premium-gate" id="statistiques-avancees">
        <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
        <p>Vérification de votre accès…</p>
      </section>
    );
  }

  if (!advancedStatistics) {
    return (
      <section className="data-panel premium-gate" id="statistiques-avancees">
        <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
        <p>Buts attendus (xG), tirs détaillés, précision des passes et plus encore.</p>
        <a href="/#offres">Débloquer cette fonctionnalité</a>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="data-panel" id="statistiques-avancees">
        <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
        <p>Chargement des statistiques avancées…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="data-panel" id="statistiques-avancees">
        <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
        <p>Impossible de charger les statistiques avancées pour le moment.</p>
      </section>
    );
  }

  if (!stats) return null;
  const keys = ADVANCED_STATS.filter((key) => key in stats.home || key in stats.away);
  if (keys.length === 0) return null;

  return (
    <section className="data-panel" id="statistiques-avancees">
      <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
      <StatRows home={stats.home} away={stats.away} keys={keys} />
    </section>
  );
}
