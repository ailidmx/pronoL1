import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { auth, db, saveQuizAnswer } from "./firebase.js";

function Quiz() {
  const [week, setWeek] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [optionsByQuestion, setOptionsByQuestion] = useState({});
  const [myAnswers, setMyAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const weeksSnap = await getDocs(query(collection(db, "quizWeeks"), where("statut", "==", "publie")));
        const weeks = weeksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (weeks.length === 0) {
          if (mounted) { setWeek(null); setQuestions([]); }
          return;
        }
        weeks.sort((a, b) => (b.dateLimite ?? "").localeCompare(a.dateLimite ?? ""));
        const currentWeek = weeks[0];
        currentWeek.closed = !!currentWeek.dateLimite && new Date(currentWeek.dateLimite).valueOf() <= Date.now();
        if (mounted) setWeek(currentWeek);

        const qSnap = await getDocs(collection(db, "quizWeeks", currentWeek.id, "questions"));
        const qs = qSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => Number(a.ordre) - Number(b.ordre));
        if (mounted) setQuestions(qs);

        const uid = auth.currentUser?.uid;
        const opts = {};
        const ans = {};
        for (const q of qs) {
          const oSnap = await getDocs(collection(db, "quizWeeks", currentWeek.id, "questions", q.id, "options"));
          opts[q.id] = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (uid) {
            const aSnap = await getDoc(doc(db, "quizWeeks", currentWeek.id, "questions", q.id, "answers", uid));
            if (aSnap.exists()) ans[q.id] = aSnap.data().optionId;
          }
        }
        if (mounted) { setOptionsByQuestion(opts); setMyAnswers(ans); }
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

  async function pick(q, optionId) {
    setSavingId(q.id);
    setError("");
    try {
      await saveQuizAnswer({ weekId: week.id, questionId: q.id, optionId });
      setMyAnswers((prev) => ({ ...prev, [q.id]: optionId }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p>Chargement du quizz…</p>;
  if (error && !week) return <p className="error">Erreur : {error}</p>;
  if (!week) return <p>Aucun quizz publié pour le moment.</p>;

  const closed = week.closed;

  return (
    <section className="quiz">
      <h2>Quizz de la semaine</h2>
      {week.journee != null && <p className="quiz-journee">Journée {week.journee}</p>}
      <p className="quiz-meta">Date limite : {formatDate(week.dateLimite)}</p>
      <ul className="quiz-list">
        {questions.map((q) => (
          <li key={q.id} className="quiz-question">
            <p className="quiz-enonce">{q.enonce}</p>
            <ul className="quiz-options">
              {(optionsByQuestion[q.id] ?? []).map((o) => (
                <li key={o.id}>
                  <label>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={myAnswers[q.id] === o.id}
                      onChange={() => pick(q, o.id)}
                      disabled={closed || savingId === q.id}
                    />
                    {o.texte}
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return String(value);
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

export default Quiz;
