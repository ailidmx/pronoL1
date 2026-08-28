import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

function Classement() {
  const [rows, setRows] = useState([]);
  const [userNames, setUserNames] = useState({});
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

        const [rowsSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "leaderboardPronostics", seasonKey, "rows")),
          getDocs(collection(db, "users")),
        ]);
        if (!mounted) return;

        const names = {};
        usersSnap.forEach((d) => {
          names[d.id] = d.data().displayName ?? d.data().email ?? d.id;
        });

        const raw = rowsSnap.docs.map((d) => ({ userId: d.id, ...d.data() }));
        setUserNames(names);
        setRows(rank(raw));
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
              <td>{userNames[r.userId] ?? r.userId}</td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// Shared rank on ties (1, 1, 3, 3, 5…).
function rank(rows) {
  const sorted = [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  let prev = null;
  let prevRank = 0;
  return sorted.map((r, i) => {
    const rk = (r.points ?? 0) === prev ? prevRank : i + 1;
    prev = r.points ?? 0;
    prevRank = rk;
    return { ...r, rank: rk };
  });
}

export default Classement;
