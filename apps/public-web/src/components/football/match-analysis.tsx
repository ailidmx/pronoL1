"use client";

import { useEffect, useState } from "react";
import { canAnalyse, incrementAnalysisCount, remainingAnalyses } from "@/lib/client/analysis-counter";
import type { MatchAnalysis } from "@/lib/analysis/match-analysis";

export function MatchAnalysis({ analysis, limit = 5 }: { analysis: MatchAnalysis; limit?: number }) {
  const [unlocked, setUnlocked] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    setRemaining(remainingAnalyses(limit));
  }, [limit]);

  function unlock() {
    if (!canAnalyse(limit)) return;
    incrementAnalysisCount();
    setUnlocked(true);
    setRemaining(remainingAnalyses(limit));
  }

  if (!unlocked) {
    const exhausted = remaining !== null && remaining <= 0;
    return (
      <section className="data-panel analysis-gate" id="analyse">
        <div className="section-heading"><div><p className="eyebrow">Analyse</p><h2>Analyse du match</h2></div></div>
        <p>Forme récente, confrontations et tendance — calculé à partir des données du match, sans IA.</p>
        <button type="button" className="analysis-cta" onClick={unlock} disabled={exhausted}>
          {exhausted
            ? "Limite d’analyses atteinte aujourd’hui"
            : remaining === null
              ? "Consulter l’analyse"
              : `Consulter l’analyse (${remaining} restante${remaining > 1 ? "s" : ""} aujourd’hui)`}
        </button>
      </section>
    );
  }

  const { home, away, headToHead } = analysis;
  return (
    <section className="data-panel analysis-panel" id="analyse">
      <div className="section-heading"><div><p className="eyebrow">Analyse</p><h2>Analyse du match</h2></div></div>
      <p className="analysis-verdict">{analysis.verdict}</p>
      <p className="analysis-reason">{analysis.verdictReason}</p>
      <div className="analysis-grid">
        <div className="analysis-team">
          <h3>{home.club.name}</h3>
          <p><strong>{home.form.wins}V · {home.form.draws}N · {home.form.losses}D</strong></p>
          <p>{home.form.goalsFor} buts marqués · {home.form.goalsAgainst} encaissés</p>
          {home.standing ? <p>{home.standing.rank}<sup>e</sup> au classement · {home.standing.points} pts</p> : null}
        </div>
        <div className="analysis-team">
          <h3>{away.club.name}</h3>
          <p><strong>{away.form.wins}V · {away.form.draws}N · {away.form.losses}D</strong></p>
          <p>{away.form.goalsFor} buts marqués · {away.form.goalsAgainst} encaissés</p>
          {away.standing ? <p>{away.standing.rank}<sup>e</sup> au classement · {away.standing.points} pts</p> : null}
        </div>
      </div>
      <p className="analysis-h2h">
        {headToHead.played > 0
          ? `Dernières confrontations : ${headToHead.homeWins} – ${headToHead.awayWins} (${headToHead.draws} nuls)`
          : "Aucune confrontation récente entre ces deux clubs."}
      </p>
      {remaining !== null && <p className="analysis-note">Il te reste {remaining} analyse{remaining > 1 ? "s" : ""} aujourd’hui.</p>}
    </section>
  );
}
