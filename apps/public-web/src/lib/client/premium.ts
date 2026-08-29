"use client";

import { useAuth } from "./auth";

export type PremiumState = {
  isPremium: boolean;
  loading: boolean;
  error: string | null;
};

export function usePremium(): PremiumState {
  const { user, profile, profileLoading, profileError } = useAuth();
  return {
    isPremium: Boolean(user && profile?.isPremium === true),
    loading: Boolean(user && profileLoading),
    error: profileError,
  };
}
