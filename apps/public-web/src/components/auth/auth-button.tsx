"use client";

import { signOut } from "firebase/auth";
import { auth } from "@/lib/client/firebase";
import { useAuth } from "@/lib/client/auth";

export function AuthButton() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return <a href="/connexion" className="auth-link">Se connecter</a>;
  }
  return (
    <span className="auth-user">
      <span className="auth-email">{user.email}</span>
      <button type="button" onClick={() => signOut(auth)}>Déconnexion</button>
    </span>
  );
}
