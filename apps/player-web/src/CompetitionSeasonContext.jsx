import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

const STORAGE_KEY = "prono-l1-competition-season";
const CompetitionSeasonContext = createContext(null);

function normalizeSeason(docSnapshot) {
  const data = docSnapshot.data();
  const year = Number(data.startYear ?? data.anneeDebut ?? data.seasonId);
  if (!Number.isInteger(year) || typeof data.competitionId !== "string" || !data.competitionId) return null;
  return {
    id: docSnapshot.id,
    competitionId: data.competitionId,
    year,
    label: data.label ?? `${year}-${year + 1}`,
    current: data.current === true || data.statut === "en_cours" || data.status === "live",
  };
}

export function CompetitionSeasonProvider({ children }) {
  const [competitions, setCompetitions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectionKey, setSelectionKey] = useState(() => window.localStorage.getItem(STORAGE_KEY) ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([
      getDocs(collection(db, "competitions")),
      getDocs(collection(db, "seasons")),
    ]).then(([competitionSnapshot, seasonSnapshot]) => {
      if (!mounted) return;
      const competitionList = competitionSnapshot.docs
        .map((item) => ({ id: item.id, name: item.data().name ?? item.data().nom ?? item.id, shortName: item.data().shortName ?? item.data().name ?? item.id, status: item.data().status }))
        .filter((item) => item.status !== "planned" && item.status !== "paused");
      const seasonList = seasonSnapshot.docs.map(normalizeSeason).filter(Boolean);
      if (!competitionList.length) throw new Error("Aucune compétition active conforme dans competitions.");
      if (!seasonList.length) throw new Error("Aucune saison conforme dans seasons.");
      if (seasonList.some((season) => !season.competitionId || !competitionList.some((competition) => competition.id === season.competitionId))) {
        throw new Error("Chaque saison doit référencer un competitionId existant.");
      }
      setCompetitions(competitionList);
      setSeasons(seasonList);
    }).catch((reason) => {
      if (!mounted) return;
      setError(reason.message || "Impossible de charger les compétitions.");
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const availableSelections = useMemo(() => {
    const values = seasons.map((season) => {
      const competition = competitions.find((item) => item.id === season.competitionId);
      return { ...season, competition, key: `${competition.id}:${season.year}` };
    });
    return values.sort((a, b) => Number(b.current) - Number(a.current) || b.year - a.year || a.competition.name.localeCompare(b.competition.name));
  }, [competitions, seasons]);

  const selection = availableSelections.find((item) => item.key === selectionKey) ?? availableSelections[0] ?? null;

  const select = useCallback((nextKey) => {
    if (!availableSelections.some((item) => item.key === nextKey)) return;
    setSelectionKey(nextKey);
    window.localStorage.setItem(STORAGE_KEY, nextKey);
  }, [availableSelections]);

  const value = useMemo(() => ({
    loading,
    error,
    selections: availableSelections,
    selection,
    competitionId: selection?.competition.id ?? null,
    competitionName: selection?.competition.name ?? "Compétition",
    seasonId: selection?.year ?? null,
    seasonLabel: selection?.label ?? "Saison",
    competitionSeasonId: selection?.key ?? null,
    select,
  }), [availableSelections, error, loading, select, selection]);

  return <CompetitionSeasonContext.Provider value={value}>{children}</CompetitionSeasonContext.Provider>;
}

export function useCompetitionSeason() {
  const context = useContext(CompetitionSeasonContext);
  if (!context) throw new Error("useCompetitionSeason must be used inside CompetitionSeasonProvider");
  return context;
}
