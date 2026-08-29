import { useEffect, useState } from "react";
import { saveQuizAnswer } from "./firebase.js";
import { getQuizCenter } from "./callables.js";

export default function Quiz() {
  const [data, setData] = useState(null);
  const [view, setView] = useState("current");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  async function load() {
    try { const response = await getQuizCenter(); setData(response.data); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, []); // oxlint-disable-line react-hooks/exhaustive-deps

  async function pick(week, question, optionId) {
    setSavingId(question.id); setError("");
    try { await saveQuizAnswer({ weekId: week.id, questionId: question.id, optionId }); await load(); }
    catch (saveError) { setError(saveError.message); }
    finally { setSavingId(null); }
  }

  if (loading) return <p>Chargement du quiz…</p>;
  const current = data?.current;
  return <section className="quiz">
    <div className="section-title-row"><div><p className="section-kicker">Questions football</p><h2>Quiz de la semaine</h2></div></div>
    <div className="view-switcher"><button type="button" className={view === "current" ? "active" : ""} onClick={() => setView("current")}>Quiz actuel</button><button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}>Historique ({data?.history?.length ?? 0})</button></div>
    {error ? <p className="error">{error}</p> : null}
    {view === "current" ? current ? <QuizWeek week={current} savingId={savingId} onPick={pick} /> : <p className="empty-state">Aucun quiz publié pour le moment.</p> : <div className="quiz-history">{data?.history?.length ? data.history.map((week) => <QuizWeek key={week.id} week={week} readOnly />) : <p className="empty-state">Aucun historique disponible.</p>}</div>}
  </section>;
}

function QuizWeek({ week, savingId, onPick, readOnly = false }) {
  return <article className="quiz-week"><header><strong>{week.journey != null ? `Journée ${week.journey}` : "Quiz"}</strong><span>{week.closed ? `${week.points} point${week.points > 1 ? "s" : ""}` : `Limite : ${formatDate(week.deadline)}`}</span></header>
    <ol className="quiz-list">{week.questions.map((question) => <li key={question.id} className="quiz-question"><p className="quiz-enonce">{question.wording}</p><div className="quiz-options">{question.options.map((option) => { const selected = question.answer?.optionId === option.id; return <button type="button" key={option.id} className={selected ? "selected" : ""} disabled={readOnly || week.closed || savingId === question.id} onClick={() => onPick?.(week, question, option.id)}><span>{option.text}</span>{selected ? <b>{question.answer?.points != null ? `+${question.answer.points}` : "✓"}</b> : null}</button>; })}</div></li>)}</ol>
  </article>;
}

function formatDate(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }); }
