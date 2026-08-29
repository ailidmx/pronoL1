"use client";

import { useAuth } from "./auth";

export type PremiumState = {
  isPremium: boolean;
  adFree: boolean;
  advancedStatistics: boolean;
  loading: boolean;
  error: string | null;
};

export function usePremium(): PremiumState {
  const { user, accessPlan, profileLoading, profileError } = useAuth();
  const enabled = accessPlan?.enabled === true;
  const features = accessPlan?.features ?? {};
  return {
    isPremium: Boolean(user && enabled && accessPlan?.isPaid === true),
    adFree: Boolean(user && enabled && features.adFree === true),
    advancedStatistics: Boolean(user && enabled && features.advancedStatistics === true),
    loading: Boolean(user && profileLoading),
    error: profileError,
  };
}
