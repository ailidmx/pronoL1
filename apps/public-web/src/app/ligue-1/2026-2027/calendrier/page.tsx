import { notFound, redirect } from "next/navigation";
import { resolveDefaultJourney } from "@/lib/journey-navigation";
import { getSeasonOverview } from "@/server/football-repository";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const data = await getSeasonOverview(2026);
  const journey = resolveDefaultJourney(data.matches);
  if (!journey) notFound();
  redirect(`/ligue-1/2026-2027/journee/${journey}`);
}
