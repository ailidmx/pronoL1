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
    expect(isFavoriteClub("c1")).toBe(false);
    expect(toggleFavoriteClub("c1")).toBe(true);
    expect(isFavoriteClub("c1")).toBe(true);
    expect(toggleFavoriteClub("c1")).toBe(false);
  });

  it("toggles a match independently", () => {
    toggleFavoriteClub("c1");
    toggleFavoriteMatch("m1");
    expect(getFavorites()).toEqual({ clubs: ["c1"], matches: ["m1"] });
  });
});

describe("history", () => {
  it("records most-recent first and dedupes", () => {
    recordMatchView({ matchId: "m1", title: "A - B" });
    recordMatchView({ matchId: "m2", title: "C - D" });
    recordMatchView({ matchId: "m1", title: "A - B" });
    const history = getHistory();
    expect(history.map((h) => h.matchId)).toEqual(["m1", "m2"]);
    expect(history[0].viewedAt).toBeTruthy();
  });

  it("clears", () => {
    recordMatchView({ matchId: "m1", title: "A - B" });
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
