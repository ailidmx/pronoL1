import { useEffect, useState } from "react";
import { getCompetitionReadiness } from "./firebase.js";

const GATE_LABELS = {
  synchronizationEnabled: "Synchronisation activée",
  matchesImported: "Matchs importés",
  futureScheduleAvailable: "Calendrier futur disponible",
  clubsComplete: "Clubs complets",
  roundsClassified: "Phases reconnues",
};

export default function FootballDataPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await getCompetitionReadiness();
      setData(response.data);
    } catch (reason) {
      setError(reason.message || "Impossible d’évaluer les compétitions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // oxlint-disable-line react-hooks/set-state-in-effect

  return <section>
    <div className="section-title-row"><div><p className="section-kicker">Saison {data?.seasonId ?? "…"}</p><h2>Données football</h2></div><button type="button" onClick={load} disabled={loading}>{loading ? "Analyse…" : "Actualiser"}</button></div>
    <p>Une compétition planifiée reste invisible aux joueurs jusqu’à son activation. Le statut « prête » confirme que les données minimales sont complètes.</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="admin-data-grid">
      {(data?.competitions ?? []).map((competition) => <article className="admin-data-card" key={competition.competitionId}>
        <div className="admin-data-card-title"><div><small>{competition.format}</small><h3>{competition.name}</h3></div><strong className={competition.readyForPlayer ? "ready" : "waiting"}>{competition.readyForPlayer ? "Prête" : competition.syncEnabled ? "Préparation" : "Planifiée"}</strong></div>
        <dl>
          <div><dt>Matchs</dt><dd>{competition.counts.matches}</dd></div><div><dt>À venir</dt><dd>{competition.counts.futureMatches}</dd></div><div><dt>Clubs</dt><dd>{competition.counts.clubs}</dd></div>
          <div><dt>Classement</dt><dd>{competition.counts.standingsRows}</dd></div><div><dt>Détails</dt><dd>{competition.counts.detailedMatches}</dd></div><div><dt>Cotes</dt><dd>{competition.counts.matchesWithOdds}</dd></div>
        </dl>
        <ul className="readiness-gates">{Object.entries(competition.gates).map(([key, passed]) => <li className={passed ? "passed" : "failed"} key={key}>{passed ? "✓" : "○"} {GATE_LABELS[key] ?? key}</li>)}</ul>
        {competition.sync?.fixturesError ? <p role="alert">Fixtures : {competition.sync.fixturesError}</p> : null}
        {competition.sync?.registryError ? <p role="alert">Référentiel : {competition.sync.registryError}</p> : null}
      </article>)}
    </div>
  </section>;
}
