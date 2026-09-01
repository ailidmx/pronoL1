import { useCallback, useEffect, useState } from "react";
import { savePronostic } from "./firebase.js";
import { getPlayerMatchCenter } from "./callables.js";
import { useCompetitionSeason } from "./CompetitionSeasonContext.jsx";

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
    <div className="form-row"><FormDots values={match.form?.[match.homeClubId]} /><span>Forme</span><FormDots values={match.form?.[match.awayClubId]} /></div>
    <button type="button" className="details-toggle" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? "Masquer la fiche" : "Ouvrir la fiche du match"}</button>
    {detailsOpen ? <MatchDetails match={match} clubs={clubs} /> : null}
    {match.predictionsVisible ? <Predictions predictions={match.predictions} /> : null}
  </article>;
}

function FormDots({ values = [] }) { return <span className="form-dots">{values.length ? values.map((value, index) => <i key={`${value}-${index}`} className={`form-${value.toLowerCase()}`}>{value}</i>) : <small>—</small>}</span>; }

function Predictions({ predictions }) { return <details className="predictions"><summary>Pronostics des joueurs ({predictions.length})</summary><div className="predictions-grid">{predictions.length ? predictions.map((prediction) => <div key={prediction.userId}><span>{prediction.displayName}</span><strong>{prediction.homeScore} : {prediction.awayScore}</strong>{prediction.points != null ? <small>{prediction.points} pt{prediction.points > 1 ? "s" : ""}</small> : null}</div>) : <p>Aucun pronostic pour ce match.</p>}</div></details>; }

function MatchDetails({ match, clubs }) {
  const homeStats = match.statistics?.find((item) => String(item.teamId) === match.homeClubId)?.values ?? {};
  const awayStats = match.statistics?.find((item) => String(item.teamId) === match.awayClubId)?.values ?? {};
  const statNames = [...new Set([...Object.keys(homeStats), ...Object.keys(awayStats)])];
  return <div className="match-details">
    {match.referee ? <p className="match-official">Arbitre : {match.referee}</p> : null}
    {match.headToHead?.length ? <section><h3>Confrontations directes</h3>{match.headToHead.map((item) => <div className="h2h-row" key={item.id}><small>{formatDate(item.date)}</small><span>{clubs[item.homeClubId]?.name}</span><strong>{item.homeScore} : {item.awayScore}</strong><span>{clubs[item.awayClubId]?.name}</span></div>)}</section> : null}
    {match.events?.length ? <section><h3>Faits de jeu</h3><ol className="timeline">{match.events.map((event, index) => <li key={`${event.minute}-${index}`}><time>{event.minute ?? "?"}{event.extraMinute ? `+${event.extraMinute}` : ""}&apos;</time><span>{event.type === "Goal" ? "⚽" : event.type === "Card" ? "🟨" : "↔️"} {event.player ?? event.detail}{event.assist ? ` (${event.assist})` : ""}</span></li>)}</ol></section> : null}
    {match.lineups?.length ? <section><h3>Compositions</h3><div className="lineups">{match.lineups.map((lineup) => <article key={lineup.teamId}><h4>{clubs[String(lineup.teamId)]?.name} · {lineup.formation ?? "Formation NC"}</h4>{lineup.coach ? <small>Coach : {lineup.coach}</small> : null}<ol>{lineup.starters?.map((player) => <li key={player.id ?? player.name}><b>{player.number ?? "–"}</b> {player.name}</li>)}</ol><details><summary>Remplaçants ({lineup.substitutes?.length ?? 0})</summary><ul>{lineup.substitutes?.map((player) => <li key={player.id ?? player.name}>{player.number ?? "–"} · {player.name}</li>)}</ul></details></article>)}</div></section> : null}
    {statNames.length ? <section><h3>Statistiques</h3><div className="stats-grid">{statNames.map((name) => <div key={name}><strong>{homeStats[name] ?? "–"}</strong><span>{name}</span><strong>{awayStats[name] ?? "–"}</strong></div>)}</div></section> : null}
    {!match.headToHead?.length && !match.events?.length && !match.lineups?.length && !statNames.length ? <p className="empty-detail">Les données détaillées seront disponibles dès leur publication.</p> : null}
  </div>;
}

export default function Matches({ mode = "journey" }) {
  const { competitionId, competitionName, seasonId, seasonLabel } = useCompetitionSeason();
  const [data, setData] = useState(null);
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextJourney = journey) => {
    setLoading(true);
    setError("");
    try {
      const response = await getPlayerMatchCenter({ competitionId, seasonId, scope: mode, journey: nextJourney });
      setData(response.data);
      setJourney(response.data.selectedJourney);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [competitionId, journey, mode, seasonId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    load(null);
  }, [competitionId, mode, seasonId]); // oxlint-disable-line react-hooks/exhaustive-deps

  function handleSaved(matchId, prediction) {
    setData((current) => ({ ...current, matches: current.matches.map((match) => match.id === matchId ? { ...match, myPrediction: prediction } : match) }));
  }

  if (loading && !data) return <div className="app-loading">Chargement des matchs…</div>;
  if (error && !data) return <p className="error">Erreur : {error}</p>;
  const journeys = data?.journeys ?? [];
  const index = journeys.indexOf(journey);
  return <section className="matches">
    <div className="section-title-row"><div><p className="section-kicker">{mode === "history" ? `Mes résultats · ${competitionName} ${seasonLabel}` : `${competitionName} · ${seasonLabel}`}</p><h2>{mode === "history" ? "Historique de mes pronostics" : `Journée ${journey ?? "–"}`}</h2></div>{loading ? <span className="refreshing">Actualisation…</span> : null}</div>
    {mode === "journey" ? <div className="journey-nav"><button type="button" onClick={() => load(journeys[0])} disabled={index <= 0} aria-label="Première journée">⏮</button><button type="button" onClick={() => load(journeys[index - 1])} disabled={index <= 0} aria-label="Journée précédente">◀</button><select value={journey ?? ""} onChange={(event) => load(Number(event.target.value))} aria-label="Choisir une journée">{journeys.map((number) => <option key={number} value={number}>Journée {number}</option>)}</select><button type="button" onClick={() => load(journeys[index + 1])} disabled={index < 0 || index >= journeys.length - 1} aria-label="Journée suivante">▶</button><button type="button" onClick={() => load(journeys.at(-1))} disabled={index < 0 || index >= journeys.length - 1} aria-label="Dernière journée">⏭</button></div> : null}
    {error ? <p className="error">{error}</p> : null}
    <div className="match-list">{data?.matches?.length ? data.matches.map((match) => <MatchCard key={match.id} match={match} clubs={data.clubs} onSaved={handleSaved} />) : <p className="empty-state">Aucun match à afficher.</p>}</div>
  </section>;
}

function statusLabel(status) { return { a_venir: "À venir", en_cours: "En direct", termine: "Terminé", reporte: "Reporté" }[status] ?? status; }
function formatDate(value) { if (!value) return "Date à confirmer"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
