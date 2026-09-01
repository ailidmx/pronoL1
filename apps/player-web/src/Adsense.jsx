import { useEffect } from "react";

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || "ca-pub-9809524492306432";
const ADSENSE_ENABLED = import.meta.env.VITE_ADSENSE_ENABLED === "true";

export function shouldShowAds(profile) {
  if (!profile) return false;
  if (profile.isAdmin === true) return false;
  if (profile.accessPlanId === "premium" || profile.isPremium === true) return false;
  return true;
}

export default function Adsense({ enabled }) {
  useEffect(() => {
    if (!ADSENSE_ENABLED || !enabled || !ADSENSE_CLIENT) return undefined;

    const scriptId = "prono-l1-adsense";
    if (document.getElementById(scriptId)) return undefined;

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
    document.head.appendChild(script);

    return undefined;
  }, [enabled]);

  return null;
}
