"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { competitions, primaryCompetition } from "@/config/competitions";

export function CompetitionSelector() {
  const pathname = usePathname();
  const router = useRouter();
  const current = competitions.find((competition) => pathname.startsWith(`/${competition.route}`)) ?? primaryCompetition;

  return (
    <label className="competition-selector">
      <span>Compétition</span>
      <select
        aria-label="Choisir une compétition"
        value={current.id}
        onChange={(event) => {
          const competition = competitions.find((item) => item.id === event.target.value);
          if (competition?.status === "live") router.push(`/${competition.route}/${competition.seasonLabel}` as Route);
        }}
      >
        {competitions.map((competition) => (
          <option key={competition.id} value={competition.id} disabled={competition.status !== "live"}>
            {competition.name}{competition.status === "planned" ? " · bientôt" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
