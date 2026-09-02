import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DocFoot.fr — résultats, données et expertise", short_name: "DocFoot",
    description: "Résultats, calendriers, classements, compositions et statistiques de football.",
    start_url: "/?source=pwa", scope: "/", display: "standalone", orientation: "portrait-primary",
    background_color: "#0b0e13", theme_color: "#0b0e13", lang: "fr", categories: ["sports", "news"],
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Derniers résultats", short_name: "Résultats", url: "/ligue-1/2026-2027/resultats?source=pwa" },
      { name: "Calendrier Ligue 1", short_name: "Calendrier", url: "/ligue-1/2026-2027/calendrier?source=pwa" },
      { name: "Classement Ligue 1", short_name: "Classement", url: "/ligue-1/2026-2027/classement/general?source=pwa" },
    ],
  };
}
