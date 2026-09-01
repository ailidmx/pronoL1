import { useEffect } from "react";

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || "ca-pub-9809524492306432";
const ADSENSE_ENABLED = import.meta.env.VITE_ADSENSE_ENABLED === "true";

const SLOT_IDS = {
  masthead: import.meta.env.VITE_ADSENSE_SLOT_PLAYER_MASTHEAD || "",
  pronostics: import.meta.env.VITE_ADSENSE_SLOT_PLAYER_PRONOSTICS || "",
  section: import.meta.env.VITE_ADSENSE_SLOT_PLAYER_SECTION || "",
  bottom: import.meta.env.VITE_ADSENSE_SLOT_PLAYER_BOTTOM || "",
};

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

export function PlayerAdSlot({ enabled, placement, format = "auto" }) {
  const slotId = SLOT_IDS[placement] || "";

  useEffect(() => {
    if (!ADSENSE_ENABLED || !enabled || !slotId) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch (error) {
      console.warn("AdSense slot initialization failed", placement, error);
    }
  }, [enabled, placement, slotId]);

  if (!enabled) return null;

  if (!ADSENSE_ENABLED || !slotId) {
    return (
      <aside className="player-ad-slot player-ad-slot-placeholder" data-ad-placement={placement} aria-label="Emplacement publicitaire réservé">
        <span>Publicité</span>
        <small>{placement} · emplacement AdSense réservé</small>
      </aside>
    );
  }

  return (
    <aside className="player-ad-slot" data-ad-placement={placement} aria-label="Publicité">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
