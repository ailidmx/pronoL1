import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { slugify } from "@/lib/slug";
import { getSeasonOverview } from "@/server/football-repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let data = null;
  try { data = await getSeasonOverview(2026); }
  catch (error) { console.error("Dynamic sitemap data unavailable", error); }
  const paths: Array<{ path: string; changeFrequency: "daily" | "hourly" | "weekly"; priority: number; lastModified?: string }> = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/ligue-1/2026-2027", changeFrequency: "hourly", priority: 0.9, lastModified: data?.updatedAt ?? undefined },
    { path: "/pronostics", changeFrequency: "weekly", priority: 0.6 },
  ];
  for (const club of data?.clubs ?? []) paths.push({ path: `/club/${club.id}/${slugify(club.name)}`, changeFrequency: "daily", priority: 0.75, lastModified: data?.updatedAt ?? undefined });
  for (const match of data?.matches ?? []) paths.push({ path: `/match/${match.id}/${slugify(`${match.homeClub.name}-${match.awayClub.name}`)}`, changeFrequency: match.status === "termine" ? "weekly" : "hourly", priority: 0.8, lastModified: match.updatedAt ?? undefined });
  const journeys = new Set((data?.matches ?? []).map((match) => match.journey).filter((journey): journey is number => journey !== null));
  for (const journey of journeys) paths.push({ path: `/ligue-1/2026-2027/journee/${journey}`, changeFrequency: "daily", priority: 0.7, lastModified: data?.updatedAt ?? undefined });

  return paths.map(({ path, changeFrequency, priority, lastModified }) => ({
    url: new URL(path, siteConfig.url).toString(),
    lastModified: lastModified ? new Date(lastModified) : new Date(),
    changeFrequency,
    priority,
  }));
}
