import Link from "next/link";

export function JourneyPicker({ currentJourney, journeys }: { currentJourney: number; journeys: number[] }) {
  return (
    <nav className="journey-picker" aria-label="Choisir une journée">
      {journeys.map((journey) => {
        const active = journey === currentJourney;
        return (
          <Link
            key={journey}
            href={`/ligue-1/2026-2027/journee/${journey}`}
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
