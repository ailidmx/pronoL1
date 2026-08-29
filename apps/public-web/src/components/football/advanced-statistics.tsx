"use client";

import type { FootballMatch } from "@/server/football-repository";
import { ADVANCED_STATS } from "@/lib/statistics";
import { StatRows, type StatValues } from "./match-statistics";
import { usePremium } from "@/lib/client/premium";

export function AdvancedStatistics({ match }: { match: FootballMatch }) {
  const premium = usePremium();

  const home = match.statistics.find((item) => item.teamId === match.homeClub.id)?.values as StatValues | undefined;
  const away = match.statistics.find((item) => item.teamId === match.awayClub.id)?.values as StatValues | undefined;
  if (!home || !away) return null;
  const keys = ADVANCED_STATS.filter((key) => key in home || key in away);
  if (keys.length === 0) return null;

  if (!premium) {
    return (
      <section className="data-panel premium-gate" id="statistiques-avancees">
        <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
        <p>Buts attendus (xG), tirs détaillés, précision des passes et plus encore.</p>
        <a href="/#offres">Débloquer avec Premium</a>
      </section>
    );
  }

  return (
    <section className="data-panel" id="statistiques-avancees">
      <div className="section-heading"><div><p className="eyebrow">Premium</p><h2>Statistiques avancées</h2></div></div>
      <StatRows home={home} away={away} keys={keys} />
    </section>
  );
}
