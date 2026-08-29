import { useEffect, useState } from "react";
import { getPlayerMatchCenter } from "./callables.js";

function odd(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "—";
}

export default function Odds() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getPlayerMatchCenter({ seasonId: 2026, scope: "journey" })
      .then((response) => setData(response.data))
      .catch((reason) => setError(reason.message || "Cotes indisponibles."));
  }, []);

  if (error) return <p className="feature-error">{error}</p>;
  if (!data) return <p>Chargement des cotes…</p>;
  const unlocked = data.oddsAccess?.official || data.oddsAccess?.community;
  if (!unlocked) return <section className="premium-odds-gate"><span aria-hidden="true">🔒</span><h2>Les cotes sont réservées au Premium</h2><p>Compare les cotes officielles avec le consensus des joueurs Prono L1 pour affiner tes pronostics.</p><strong>Bookmakers + communauté</strong></section>;

  return <section className="odds-center">
    <div className="feature-hero"><p className="feature-kicker">Aide au pronostic</p><h2>Cotes de la journée {data.selectedJourney}</h2><p>Les cotes officielles viennent des données bookmakers. Les cotes communauté sont calculées à partir de la répartition réelle des pronostics.</p></div>
    <div className="odds-list">{data.matches.map((match) => {
      const home = data.clubs[match.homeClubId]?.name ?? "Domicile";
      const away = data.clubs[match.awayClubId]?.name ?? "Extérieur";
      return <article className="odds-card" key={match.id}>
        <h3>{home} <span>vs</span> {away}</h3>
        {data.oddsAccess.official ? <div className="odds-row"><strong>Officielles</strong><span>1 <b>{odd(match.odds?.official?.home)}</b></span><span>N <b>{odd(match.odds?.official?.draw)}</b></span><span>2 <b>{odd(match.odds?.official?.away)}</b></span></div> : null}
        {data.oddsAccess.community ? <div className="odds-row community"><strong>Communauté</strong>{match.odds?.community?.sufficient ? <><span>1 <b>{odd(match.odds.community.home)}</b></span><span>N <b>{odd(match.odds.community.draw)}</b></span><span>2 <b>{odd(match.odds.community.away)}</b></span></> : <em>{match.odds?.community?.sampleSize ?? 0}/{match.odds?.community?.threshold ?? 5} pronos · échantillon insuffisant</em>}</div> : null}
      </article>;
    })}</div>
  </section>;
}
