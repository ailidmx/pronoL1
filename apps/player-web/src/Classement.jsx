import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";
import { getPronosticsLeaderboard } from "./callables.js";

function Classement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // Current season (statut === "en_cours") → its anneeDebut is the
        // leaderboard key (same seasonId as on the synced matches).
        const seasonsSnap = await getDocs(collection(db, "seasons"));
        let seasonKey = null;
        seasonsSnap.forEach((d) => {
          if (d.data().statut === "en_cours") seasonKey = String(d.data().anneeDebut);
        });
        if (!seasonKey) {
          if (mounted) setError("Aucune saison en cours.");
          return;
        }

        const leaderboard = await getPronosticsLeaderboard({ seasonId: seasonKey });
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
  }, []);

  if (loading) return <p>Chargement du classement…</p>;
  if (error) return <p className="error">Erreur : {error}</p>;
  if (rows.length === 0) return <p>Pas encore de points — fais tes pronostics !</p>;

  return (
    <section className="classement">
      <h2>Classement joueurs</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Joueur</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>{r.rank}</td>
              <td>{r.displayName}</td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default Classement;
