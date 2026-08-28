import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { auth, db, savePronostic } from "./firebase.js";

const UPCOMING_LIMIT = 10;

function PronosticForm({ matchId, initial, onSaved }) {
  const [dom, setDom] = useState(initial?.scoreDom ?? "");
  const [ext, setExt] = useState(initial?.scoreExt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    const domVal = dom === "" ? null : Number(dom);
    const extVal = ext === "" ? null : Number(ext);
    const bothEmpty = domVal == null && extVal == null;
    const bothSet = domVal != null && extVal != null;
    if (!bothEmpty && !bothSet) {
      setError("Rellena los dos marcadores o deja ambos vacíos.");
      return;
    }
    setSaving(true);
    try {
      const res = await savePronostic({ matchId, scoreDom: domVal, scoreExt: extVal });
      onSaved(matchId, res.data.scoreDom, res.data.scoreExt);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="prono-form">
      <div className="prono-inputs">
        <input
          type="number"
          min="0"
          max="99"
          value={dom}
          onChange={(e) => setDom(e.target.value)}
          placeholder="-"
          aria-label="Goles local"
        />
        <span className="prono-sep">:</span>
        <input
          type="number"
          min="0"
          max="99"
          value={ext}
          onChange={(e) => setExt(e.target.value)}
          placeholder="-"
          aria-label="Goles visitante"
        />
      </div>
      <button type="button" onClick={submit} disabled={saving}>
        {saving ? "Guardando…" : "Guardar"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Matches() {
  const [matches, setMatches] = useState([]);
  const [clubNames, setClubNames] = useState({});
  const [myPronostics, setMyPronostics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const clubsSnap = await getDocs(collection(db, "clubs"));
        const names = {};
        clubsSnap.forEach((d) => {
          names[d.id] = d.data().nom ?? d.id;
        });

        const matchesSnap = await getDocs(
          query(collection(db, "matches"), where("statut", "==", "a_venir")),
        );
        const upcoming = matchesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
          .slice(0, UPCOMING_LIMIT);

        const uid = auth.currentUser?.uid;
        const pronos = {};
        if (uid) {
          for (const m of upcoming) {
            const p = await getDoc(doc(db, "matches", m.id, "pronostics", uid));
            if (p.exists()) {
              pronos[m.id] = { scoreDom: p.data().scoreDom, scoreExt: p.data().scoreExt };
            }
          }
        }

        if (!mounted) return;
        setClubNames(names);
        setMatches(upcoming);
        setMyPronostics(pronos);
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

  function handleSaved(matchId, scoreDom, scoreExt) {
    setMyPronostics((p) => ({ ...p, [matchId]: { scoreDom, scoreExt } }));
  }

  if (loading) return <p>Chargement des matchs…</p>;
  if (error) return <p className="error">Erreur : {error}</p>;
  if (matches.length === 0) return <p>Aucun match à venir pour le moment.</p>;

  return (
    <section className="matches">
      <h2>Prochains matchs</h2>
      <ul className="match-list">
        {matches.map((m) => (
          <li key={m.id} className="match-card">
            <div className="match-teams">
              <span className="team">{clubNames[m.clubDomId] ?? m.clubDomId}</span>
              <span className="vs">vs</span>
              <span className="team">{clubNames[m.clubExtId] ?? m.clubExtId}</span>
            </div>
            <div className="match-date">{formatDate(m.date)}</div>
            <PronosticForm matchId={m.id} initial={myPronostics[m.id]} onSaved={handleSaved} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return String(value);
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default Matches;
