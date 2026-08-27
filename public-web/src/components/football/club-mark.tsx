import type { Club } from "@/server/football-repository";

export function ClubMark({ club }: { club: Club }) {
  return (
    <span className="club-mark">
      {club.logoUrl ? <img src={club.logoUrl} alt="" width="28" height="28" loading="lazy" /> : <span className="club-fallback" />}
      <span>{club.name}</span>
    </span>
  );
}
