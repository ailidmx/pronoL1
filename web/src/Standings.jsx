import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";

function Standings() {
  const [rows, setRows] = useState([]);
  const [clubNames, setClubNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [standingsSnap, clubsSnap] = await Promise.all([
          getDoc(doc(db, "standings", "2026_general")),
          getDocs(collection(db, "clubs")),
        ]);
        if (!mounted) return;
        const names = {};
        clubsSnap.forEach((d) => {
          names[d.id] = d.data().nom ?? d.id;
        });
        setClubNames(names);
        setRows(standingsSnap.data()?.rows ?? []);
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

  const sorted = [...rows].sort((a, b) => a.rang - b.rang);

  return (
    <section className="standings">
      <h2>Classement Ligue 1</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Club</th>
            <th>J</th>
            <th>G</th>
            <th>N</th>
            <th>P</th>
            <th>BP</th>
            <th>BC</th>
            <th>Diff</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.clubId}>
              <td>{r.rang}</td>
              <td>{clubNames[r.clubId] ?? r.clubId}</td>
              <td>{r.j}</td>
              <td>{r.g}</td>
              <td>{r.n}</td>
              <td>{r.p}</td>
              <td>{r.bp}</td>
              <td>{r.bc}</td>
              <td>{r.diff}</td>
              <td>{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default Standings;
