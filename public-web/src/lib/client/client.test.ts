import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  clear() { this.map.clear(); }
}

const memory = new MemoryStorage();
vi.stubGlobal("window", { localStorage: memory });

import { getFavorites, isFavoriteClub, toggleFavoriteClub, toggleFavoriteMatch } from "./favorites";
import { clearHistory, getHistory, recordMatchView } from "./history";
import { canAnalyse, getAnalysisCount, incrementAnalysisCount, remainingAnalyses } from "./analysis-counter";

beforeEach(() => memory.clear());

describe("favorites", () => {
  it("toggles a club", () => {
    const item = { id: "c1", name: "Club 1", href: "/club/c1/club-1" };
    expect(isFavoriteClub("c1")).toBe(false);
    expect(toggleFavoriteClub(item)).toBe(true);
    expect(isFavoriteClub("c1")).toBe(true);
    expect(toggleFavoriteClub(item)).toBe(false);
  });

  it("stores name + href for linking", () => {
    toggleFavoriteClub({ id: "c1", name: "Club 1", href: "/club/c1" });
    toggleFavoriteMatch({ id: "m1", name: "A - B", href: "/match/m1" });
    expect(getFavorites()).toEqual({
      clubs: [{ id: "c1", name: "Club 1", href: "/club/c1" }],
      matches: [{ id: "m1", name: "A - B", href: "/match/m1" }],
    });
  });
});

describe("history", () => {
  it("records most-recent first and dedupes", () => {
    recordMatchView({ matchId: "m1", title: "A - B", href: "/match/m1" });
    recordMatchView({ matchId: "m2", title: "C - D", href: "/match/m2" });
    recordMatchView({ matchId: "m1", title: "A - B", href: "/match/m1" });
    const history = getHistory();
    expect(history.map((h) => h.matchId)).toEqual(["m1", "m2"]);
    expect(history[0].href).toBe("/match/m1");
    expect(history[0].viewedAt).toBeTruthy();
  });

  it("clears", () => {
    recordMatchView({ matchId: "m1", title: "A - B", href: "/match/m1" });
    clearHistory();
    expect(getHistory()).toEqual([]);
  });
});

describe("analysis counter", () => {
  it("counts and enforces the daily limit", () => {
    expect(getAnalysisCount()).toBe(0);
    expect(canAnalyse(5)).toBe(true);
    incrementAnalysisCount();
    incrementAnalysisCount();
    expect(getAnalysisCount()).toBe(2);
    expect(remainingAnalyses(5)).toBe(3);
  });

  it("is exhausted at the limit", () => {
    for (let i = 0; i < 5; i++) incrementAnalysisCount();
    expect(canAnalyse(5)).toBe(false);
    expect(remainingAnalyses(5)).toBe(0);
  });
});
