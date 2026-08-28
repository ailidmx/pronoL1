"use client";

import { useEffect, useState } from "react";
import { clearHistory, getHistory, type HistoryEntry } from "@/lib/client/history";

export default function HistoriquePage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  function handleClear() {
    clearHistory();
    setHistory([]);
  }

  return (
    <article className="content">
      <nav className="breadcrumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a><span>›</span><span>Historique</span></nav>
      <p className="eyebrow">Espace personnel</p>
      <h1>Mon historique</h1>
      {history.length === 0 ? (
        <p className="empty-state">Aucun match consulté pour le moment. Ouvre une fiche match pour la retrouver ici.</p>
      ) : (
        <>
          <ul className="fav-list">
            {history.map((entry) => (
              <li key={entry.matchId}>
                <a href={entry.href}>{entry.title}</a>
                <span className="history-date">{formatViewed(entry.viewedAt)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="fav-button" onClick={handleClear}>Effacer l’historique</button>
        </>
      )}
    </article>
  );
}

function formatViewed(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
