"use client";

import { useEffect } from "react";
import { recordMatchView } from "@/lib/client/history";

type Props = { matchId: string; title: string; href: string };

// Records a match view in localStorage history (renders nothing).
export function MatchViewRecorder({ matchId, title, href }: Props) {
  useEffect(() => {
    recordMatchView({ matchId, title, href });
  }, [matchId, title, href]);

  return null;
}
