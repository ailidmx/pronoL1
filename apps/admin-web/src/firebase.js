import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

const app = initializeApp({
  projectId: "pronol1",
  appId: "1:224479040937:web:5f9d91220ff58a6a93a0b8",
  storageBucket: "pronol1.firebasestorage.app",
  apiKey: "AIzaSyD7HlCTRq32YyqPXypcazLAO0xcH-TKB1k",
  authDomain: "pronol1.firebaseapp.com",
  messagingSenderId: "224479040937",
});
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const getProfile = httpsCallable(getFunctions(app), "getProfile");
