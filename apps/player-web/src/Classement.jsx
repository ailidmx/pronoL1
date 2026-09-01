import { useEffect, useState } from "react";
import { getPronosticsLeaderboard } from "./callables.js";
import { useCompetitionSeason } from "./CompetitionSeasonContext.jsx";

function Classement() {
  const { competitionName, competitionSeasonId, seasonLabel } = useCompetitionSeason();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const leaderboard = await getPronosticsLeaderboard({ competitionSeasonId });
        if (!mounted) return;
        setRows(leaderboard.data.rows ?? []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [competitionSeasonId]);

  if (loading) return <p>Chargement du classement…</p>;
  if (error) return <p className="error">Erreur : {error}</p>;
  if (rows.length === 0) return <p>Pas encore de points — fais tes pronostics !</p>;

  return (
    <section className="classement">
      <div className="section-title-row"><div><p className="section-kicker">{competitionName} · {seasonLabel}</p><h2>Podium des pronostiqueurs</h2></div></div>
      <div className="podium">{rows.slice(0, 3).map((row) => <article key={row.userId} className={`podium-rank podium-rank-${row.rank}`}><span>{row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : "🥉"}</span><strong>{row.displayName}</strong><b>{row.points} pts</b></article>)}</div>
      <div className="table-scroll"><table>
        <thead>
          <tr>
            <th>#</th>
            <th>Joueur</th>
            <th>Pts</th>
            <th>🎯</th>
            <th>✅</th>
            <th>↔️</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>{r.rank}</td>
              <td>{r.displayName}</td>
              <td>{r.points}</td>
              <td>{r.exact ?? 0}</td>
              <td>{r.bonResultat ?? 0}</td>
              <td>{r.bonusEcart ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}

export default Classement;
