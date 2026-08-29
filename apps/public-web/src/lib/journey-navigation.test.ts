import { describe, expect, it } from "vitest";
import { listAvailableJourneys, resolveDefaultJourney } from "./journey-navigation";

describe("journey navigation", () => {
  it("lists only real journeys in order", () => {
    expect(listAvailableJourneys([
      { journey: 3, date: null, status: "a_venir" },
      { journey: 1, date: null, status: "termine" },
      { journey: 3, date: null, status: "a_venir" },
      { journey: null, date: null, status: "a_venir" },
    ])).toEqual([1, 3]);
  });

  it("prefers the live journey", () => {
    expect(resolveDefaultJourney([
      { journey: 4, date: "2026-08-20T18:00:00Z", status: "termine" },
      { journey: 5, date: "2026-08-29T18:00:00Z", status: "en_cours" },
      { journey: 6, date: "2026-09-05T18:00:00Z", status: "a_venir" },
    ], new Date("2026-08-29T18:30:00Z"))).toBe(5);
  });

  it("keeps the current journey during the match window", () => {
    expect(resolveDefaultJourney([
      { journey: 5, date: "2026-08-29T18:00:00Z", status: "a_venir" },
      { journey: 5, date: "2026-08-29T20:00:00Z", status: "a_venir" },
      { journey: 6, date: "2026-09-05T18:00:00Z", status: "a_venir" },
    ], new Date("2026-08-29T21:00:00Z"))).toBe(5);
  });

  it("moves to the next journey after the current one has settled", () => {
    expect(resolveDefaultJourney([
      { journey: 5, date: "2026-08-29T18:00:00Z", status: "termine" },
      { journey: 6, date: "2026-09-05T18:00:00Z", status: "a_venir" },
    ], new Date("2026-08-30T12:00:00Z"))).toBe(6);
  });

  it("falls back to the last available journey after the season", () => {
    expect(resolveDefaultJourney([
      { journey: 33, date: "2027-05-10T18:00:00Z", status: "termine" },
      { journey: 34, date: "2027-05-17T18:00:00Z", status: "termine" },
    ], new Date("2027-06-01T12:00:00Z"))).toBe(34);
  });
});
