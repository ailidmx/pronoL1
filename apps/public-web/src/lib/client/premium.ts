"use client";

import { useEffect, useState } from "react";
import { getProfile } from "./firebase";
import { useAuth } from "./auth";

// Premium entitlement: reads users/{uid}.isPremium via getProfile (which also
// creates the profile on first login). Replaces the old localStorage flag.
export function usePremium(): boolean {
  const { user } = useAuth();
  const [premium, setPremium] = useState(false);

  useEffect(() => {
    if (!user) {
      setPremium(false);
      return;
    }
    let cancelled = false;
    getProfile()
      .then((res) => {
        if (!cancelled) setPremium((res.data as { isPremium?: boolean })?.isPremium === true);
      })
      .catch(() => {
        if (!cancelled) setPremium(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return premium;
}

