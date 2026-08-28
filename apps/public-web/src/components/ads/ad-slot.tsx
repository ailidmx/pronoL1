"use client";

import { useEffect, useState } from "react";
import { isPremium } from "@/lib/client/premium";

type AdSlotProps = {
  name: string;
  format?: "leaderboard" | "rectangle" | "in-feed";
};

// "Sans publicité" premium benefit: hides the slot for premium users.
export function AdSlot({ name, format = "in-feed" }: AdSlotProps) {
  const [premium, setPremium] = useState(false);
  useEffect(() => {
    setPremium(isPremium());
  }, []);
  if (premium) return null;
  return (
    <aside
      className={`ad-slot ad-slot-${format}`}
      aria-label="Emplacement publicitaire"
      data-ad-slot={name}
      data-ad-format={format}
    >
      <span>Publicité</span>
      <small>Emplacement Google AdSense réservé</small>
    </aside>
  );
}

