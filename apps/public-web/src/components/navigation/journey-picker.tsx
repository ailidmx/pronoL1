import type { Route } from "next";
import Link from "next/link";

export function JourneyPicker({ currentJourney, journeys }: { currentJourney: number; journeys: number[] }) {
  return (
    <nav className="journey-picker" aria-label="Choisir une journée">
      {journeys.map((journey) => {
        const active = journey === currentJourney;
        const href = `/ligue-1/2026-2027/journee/${journey}` as Route;
        return (
          <Link
            key={journey}
            href={href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            J{journey}
          </Link>
        );
      })}
    </nav>
  );
}
