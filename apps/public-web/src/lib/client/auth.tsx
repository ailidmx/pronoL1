"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, getProfile } from "./firebase";

type UserProfile = {
  isPremium?: boolean;
  isAllowed?: boolean;
  isAdmin?: boolean;
  [key: string]: unknown;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  profileError: string | null;
};

const INITIAL_STATE: AuthState = {
  user: null,
  loading: true,
  profile: null,
  profileLoading: false,
  profileError: null,
};

const AuthContext = createContext<AuthState>(INITIAL_STATE);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  useEffect(() => {
    let profileUnsubscribe = () => {};
    let generation = 0;

    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      generation += 1;
      const currentGeneration = generation;
      profileUnsubscribe();
      profileUnsubscribe = () => {};

      if (!user) {
        setState({ user: null, loading: false, profile: null, profileLoading: false, profileError: null });
        return;
      }

      setState({ user, loading: false, profile: null, profileLoading: true, profileError: null });

      getProfile()
        .then(() => {
          if (currentGeneration !== generation) return;
          profileUnsubscribe = onSnapshot(
            doc(db, "users", user.uid),
            (snapshot) => {
              if (currentGeneration !== generation) return;
              setState({
                user,
                loading: false,
                profile: snapshot.exists() ? (snapshot.data() as UserProfile) : null,
                profileLoading: false,
                profileError: null,
              });
            },
            (error) => {
              if (currentGeneration !== generation) return;
              setState({ user, loading: false, profile: null, profileLoading: false, profileError: error.message });
            },
          );
        })
        .catch((error: unknown) => {
          if (currentGeneration !== generation) return;
          const message = error instanceof Error ? error.message : "Profil indisponible";
          setState({ user, loading: false, profile: null, profileLoading: false, profileError: message });
        });
    });

    return () => {
      generation += 1;
      profileUnsubscribe();
      authUnsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
