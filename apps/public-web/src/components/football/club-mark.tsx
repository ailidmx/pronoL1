import type { Club } from "@/server/football-repository";
import { slugify } from "@/lib/slug";

export function ClubMark({ club, linked = true }: { club: Club; linked?: boolean }) {
  const content = (
    <>
      {club.logoUrl ? <img src={club.logoUrl} alt="" width="28" height="28" loading="lazy" /> : <span className="club-fallback" />}
      <span>{club.name}</span>
    </>
  );
  return linked
    ? <a className="club-mark" href={`/club/${club.id}/${slugify(club.name)}`}>{content}</a>
    : <span className="club-mark">{content}</span>;
}
