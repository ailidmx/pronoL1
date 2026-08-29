"use client";

import { usePremium } from "@/lib/client/premium";

type AdSlotProps = {
  name: string;
  format?: "billboard" | "leaderboard" | "rectangle" | "in-feed";
  className?: string;
};

export function AdSlot({ name, format = "in-feed", className = "" }: AdSlotProps) {
  const { adFree, loading } = usePremium();
  if (loading || adFree) return null;
  return (
    <aside
      className={`ad-slot ad-slot-${format} ${className}`.trim()}
      aria-label="Emplacement publicitaire"
      data-ad-slot={name}
      data-ad-format={format}
    >
      <span>Publicité</span>
      <small>Emplacement Google AdSense réservé</small>
    </aside>
  );
}

export function DesktopAdRail({ name }: { name: string }) {
  return (
    <div className="desktop-ad-rail" aria-hidden="true">
      <AdSlot name={name} format="rectangle" />
    </div>
  );
}
