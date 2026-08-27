import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/ligue-1/2026-2027"];
  return paths.map((path) => ({
    url: new URL(path, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: path === "/" ? "daily" : "hourly",
    priority: path === "/" ? 1 : 0.9,
  }));
}
