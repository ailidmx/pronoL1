import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

// Firebase web config — public values (not secrets).
const firebaseConfig = {
  projectId: "pronol1",
  appId: "1:224479040937:web:5f9d91220ff58a6a93a0b8",
  storageBucket: "pronol1.firebasestorage.app",
  apiKey: "AIzaSyD7HlCTRq32YyqPXypcazLAO0xcH-TKB1k",
  authDomain: "pronol1.firebaseapp.com",
  messagingSenderId: "224479040937",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Google provider — configured in Firebase console (Authentication → Sign-in
// method → Google). "Sign up with Google" is enabled automatically once the
// provider is on (Firebase creates an account on first sign-in).
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const getProfile = httpsCallable(functions, "getProfile");
export const saveProfile = httpsCallable(functions, "saveProfile");
export const savePronostic = httpsCallable(functions, "savePronostic");
export const saveBonusAnswer = httpsCallable(functions, "saveBonusAnswer");
export const saveQuizAnswer = httpsCallable(functions, "saveQuizAnswer");
