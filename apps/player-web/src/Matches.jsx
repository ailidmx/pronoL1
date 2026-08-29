import { useCallback, useEffect, useState } from "react";
import { savePronostic } from "./firebase.js";
import { getPlayerMatchCenter } from "./callables.js";

function PronosticForm({ matchId, initial, onSaved }) {
  const [home, setHome] = useState(initial?.homeScore ?? "");
  const [away, setAway] = useState(initial?.awayScore ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function submit() {
    const homeScore = home === "" ? null : Number(home);
    const awayScore = away === "" ? null : Number(away);
    if ((homeScore == null) !== (awayScore == null)) {
      setFeedback("Renseigne les deux scores, ou laisse les deux vides.");
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      const response = await savePronostic({ matchId, scoreDom: homeScore, scoreExt: awayScore });
      onSaved(matchId, { homeScore: response.data.scoreDom, awayScore: response.data.scoreExt });
      setFeedback("Pronostic enregistré ✓");
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="prono-form">
    <div className="prono-inputs"><input type="number" min="0" max="99" inputMode="numeric" value={home} onChange={(event) => setHome(event.target.value)} aria-label="Buts équipe à domicile" /><span className="prono-sep">:</span><input type="number" min="0" max="99" inputMode="numeric" value={away} onChange={(event) => setAway(event.target.value)} aria-label="Buts équipe à l’extérieur" /></div>
    <button type="button" onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
    {feedback ? <small className="form-feedback">{feedback}</small> : null}
  </div>;
}

function Club({ club, align = "left" }) {
  return <span className={`match-club match-club-${align}`}>{club?.logoUrl ? <img src={club.logoUrl} alt="" /> : null}<strong>{club?.name ?? "Club"}</strong></span>;
}

function MatchCard({ match, clubs, onSaved }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const home = clubs[match.homeClubId];
  const away = clubs[match.awayClubId];
  const finished = match.status === "termine";
  return <article className={`match-card match-status-${match.status}`}>
    <div className="match-card-meta"><span>{formatDate(match.date)}</span><span className="status-badge">{statusLabel(match.status)}</span></div>
    <div className="match-scoreline"><Club club={home} align="right" /><strong className="match-score">{match.homeScore != null || match.awayScore != null ? `${match.homeScore ?? "–"} : ${match.awayScore ?? "–"}` : "– : –"}</strong><Club club={away} /></div>
    {match.venue ? <p className="match-venue">{match.venue}{match.city ? ` · ${match.city}` : ""}</p> : null}
    {match.status === "a_venir" ? <PronosticForm key={`${match.id}-${match.myPrediction?.homeScore}-${match.myPrediction?.awayScore}`} matchId={match.id} initial={match.myPrediction} onSaved={onSaved} /> : match.myPrediction ? <div className="my-result"><span>Mon prono <strong>{match.myPrediction.homeScore} : {match.myPrediction.awayScore}</strong></span>{finished && match.myPrediction.points != null ? <span className={`points points-${match.myPrediction.result ?? ""}`}>+{match.myPrediction.points} pt{match.myPrediction.points > 1 ? "s" : ""}</span> : null}</div> : <p className="no-prediction">Aucun pronostic enregistré</p>}
    {match.predictionsVisible ? <><button type="button" className="details-toggle" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? "Masquer" : "Voir"} les pronostics ({match.predictions.length})</button>{detailsOpen ? <div className="predictions-grid">{match.predictions.length ? match.predictions.map((prediction) => <div key={prediction.userId}><span>{prediction.displayName}</span><strong>{prediction.homeScore} : {prediction.awayScore}</strong>{prediction.points != null ? <small>{prediction.points} pt{prediction.points > 1 ? "s" : ""}</small> : null}</div>) : <p>Aucun pronostic pour ce match.</p>}</div> : null}</> : null}
  </article>;
}

export default function Matches({ mode = "journey" }) {
  const [data, setData] = useState(null);
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextJourney = journey) => {
    setLoading(true);
    setError("");
    try {
      const response = await getPlayerMatchCenter({ seasonId: 2026, scope: mode, journey: nextJourney });
      setData(response.data);
      setJourney(response.data.selectedJourney);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [journey, mode]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load(null);
  }, [mode]); // oxlint-disable-line react-hooks/exhaustive-deps

  function handleSaved(matchId, prediction) {
    setData((current) => ({ ...current, matches: current.matches.map((match) => match.id === matchId ? { ...match, myPrediction: prediction } : match) }));
  }

  if (loading && !data) return <div className="app-loading">Chargement des matchs…</div>;
  if (error && !data) return <p className="error">Erreur : {error}</p>;
  const journeys = data?.journeys ?? [];
  const index = journeys.indexOf(journey);
  return <section className="matches">
    <div className="section-title-row"><div><p className="section-kicker">{mode === "history" ? "Mes résultats" : "Saison 2026-2027"}</p><h2>{mode === "history" ? "Historique de mes pronostics" : `Journée ${journey ?? "–"}`}</h2></div>{loading ? <span className="refreshing">Actualisation…</span> : null}</div>
    {mode === "journey" ? <div className="journey-nav"><button type="button" onClick={() => load(journeys[0])} disabled={index <= 0} aria-label="Première journée">⏮</button><button type="button" onClick={() => load(journeys[index - 1])} disabled={index <= 0} aria-label="Journée précédente">◀</button><select value={journey ?? ""} onChange={(event) => load(Number(event.target.value))} aria-label="Choisir une journée">{journeys.map((number) => <option key={number} value={number}>Journée {number}</option>)}</select><button type="button" onClick={() => load(journeys[index + 1])} disabled={index < 0 || index >= journeys.length - 1} aria-label="Journée suivante">▶</button><button type="button" onClick={() => load(journeys.at(-1))} disabled={index < 0 || index >= journeys.length - 1} aria-label="Dernière journée">⏭</button></div> : null}
    {error ? <p className="error">{error}</p> : null}
    <div className="match-list">{data?.matches?.length ? data.matches.map((match) => <MatchCard key={match.id} match={match} clubs={data.clubs} onSaved={handleSaved} />) : <p className="empty-state">Aucun match à afficher.</p>}</div>
  </section>;
}

function statusLabel(status) { return { a_venir: "À venir", en_cours: "En direct", termine: "Terminé", reporte: "Reporté" }[status] ?? status; }
function formatDate(value) { if (!value) return "Date à confirmer"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
