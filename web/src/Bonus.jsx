import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { auth, db, saveBonusAnswer } from "./firebase.js";

function emptyAnswer(q) {
  return {
    clubIds: q.type === "joueur" ? [] : Array(q.nbChoix ?? 1).fill(""),
    playerText: "",
  };
}

function Bonus() {
  const [seasonId, setSeasonId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const seasonsSnap = await getDocs(collection(db, "seasons"));
        let seasonKey = null;
        seasonsSnap.forEach((d) => {
          if (d.data().statut === "en_cours") seasonKey = String(d.data().anneeDebut);
        });
        if (!seasonKey) {
          if (mounted) setError("Aucune saison en cours.");
          return;
        }

        const uid = auth.currentUser?.uid;
        const [questionsSnap, clubsSnap, answersSnap] = await Promise.all([
          getDocs(collection(db, "bonus", seasonKey, "questions")),
          getDocs(collection(db, "clubs")),
          uid ? getDoc(doc(db, "bonus", seasonKey, "answers", uid)) : Promise.resolve(null),
        ]);
        if (!mounted) return;

        const clubList = [];
        clubsSnap.forEach((d) => clubList.push({ id: d.id, nom: d.data().nom ?? d.id }));
        clubList.sort((a, b) => a.nom.localeCompare(b.nom));
        setClubs(clubList);

        const now = Date.now();
        const qs = questionsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((q) => q.actif !== false)
          .sort((a, b) => Number(a.id) - Number(b.id))
          .map((q) => ({ ...q, closed: !!q.dateLimite && new Date(q.dateLimite).valueOf() <= now }));
        setQuestions(qs);

        const saved = answersSnap?.exists ? (answersSnap.data().answers ?? {}) : {};
        const init = {};
        for (const q of qs) {
          const a = saved[q.id];
          init[q.id] = a
            ? { clubIds: (a.clubIds ?? []).map(String), playerText: a.playerText ?? "" }
            : emptyAnswer(q);
        }
        setDrafts(init);
        setSeasonId(seasonKey);
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

  function setPick(q, index, value) {
    setDrafts((prev) => {
      const next = { ...prev[q.id], clubIds: [...prev[q.id].clubIds] };
      next.clubIds[index] = value;
      return { ...prev, [q.id]: next };
    });
  }

  function setPlayer(q, value) {
    setDrafts((prev) => ({ ...prev, [q.id]: { ...prev[q.id], playerText: value } }));
  }

  async function submit(q) {
    setError("");
    setSavingId(q.id);
    setSavedId(null);
    const draft = drafts[q.id] ?? emptyAnswer(q);
    let clubIds = [];
    if (q.type === "club") {
      clubIds = draft.clubIds[0] ? [Number(draft.clubIds[0])] : [];
    } else if (q.type === "multi_club") {
      clubIds = draft.clubIds.filter(Boolean).map(Number);
    }
    const playerText = q.type === "joueur" ? (draft.playerText.trim() || null) : null;
    try {
      await saveBonusAnswer({ seasonId, questionId: q.id, answer: { clubIds, playerText } });
      setSavedId(q.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p>Chargement des bonus…</p>;
  if (error && questions.length === 0) return <p className="error">Erreur : {error}</p>;
  if (questions.length === 0) return <p>Aucun bonus pour le moment.</p>;

  return (
    <section className="bonus">
      <h2>Bonus de saison</h2>
      <p className="bonus-intro">Fais tes pronostics de fin de saison avant la date limite.</p>
      <ul className="bonus-list">
        {questions.map((q) => {
          const closed = q.closed;
          const draft = drafts[q.id] ?? emptyAnswer(q);
          return (
            <li key={q.id} className="bonus-card">
              <div className="bonus-head">
                <strong>{q.label}</strong>
                <span className="bonus-points">{q.points} pts</span>
              </div>
              <div className="bonus-meta">Date limite : {formatDate(q.dateLimite)}</div>
              {q.type === "joueur" ? (
                <input
                  type="text"
                  value={draft.playerText}
                  onChange={(e) => setPlayer(q, e.target.value)}
                  placeholder="Nom du joueur"
                  disabled={closed}
                />
              ) : (
                Array.from({ length: q.nbChoix ?? 1 }).map((_, i) => (
                  <select
                    key={i}
                    value={draft.clubIds[i] ?? ""}
                    onChange={(e) => setPick(q, i, e.target.value)}
                    disabled={closed}
                  >
                    <option value="">—</option>
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select>
                ))
              )}
              <button type="button" onClick={() => submit(q)} disabled={closed || savingId === q.id}>
                {closed ? "Clôturé" : savingId === q.id ? "Enregistrement…" : "Enregistrer"}
              </button>
              {savedId === q.id && <span className="success">Enregistré.</span>}
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return String(value);
  return d.toLocaleString("fr-FR", { dateStyle: "long" });
}

export default Bonus;

