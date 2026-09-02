import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "docfoot.fr";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://docfoot.fr";

const firebaseConfig = {
  projectId: "pronol1",
  appId: "1:224479040937:web:5f9d91220ff58a6a93a0b8",
  storageBucket: "pronol1.firebasestorage.app",
  apiKey: "AIzaSyD7HlCTRq32YyqPXypcazLAO0xcH-TKB1k",
  authDomain,
  messagingSenderId: "224479040937",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

export const authActionSettings = {
  url: `${siteUrl}/connexion`,
  linkDomain: authDomain,
  handleCodeInApp: false,
};

export const getProfile = httpsCallable(functions, "getProfile");
export const getPremiumMatchStatistics = httpsCallable<
  { matchId: string },
  {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    teams: Array<{ teamId: string; values: Record<string, string | number | null> }>;
  }
>(functions, "getPremiumMatchStatistics");
