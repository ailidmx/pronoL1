"use client";

import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/client/firebase";
import { useAuth } from "@/lib/client/auth";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export default function ConnexionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!loading && user) {
    return (
      <article className="content">
        <p className="eyebrow">Compte</p>
        <h1>Tu es connecté</h1>
        <p>Connecté en tant que {user.email}.</p>
        <a className="primary" href="/">Retour à l’accueil</a>
      </article>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "signin") await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(err instanceof Error ? err.message : "Erreur.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setError("");
    setMessage("");
    if (!email) {
      setError("Entre ton email pour réinitialiser le mot de passe.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Email de réinitialisation envoyé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="content connexion">
      <p className="eyebrow">Compte</p>
      <h1>Connexion</h1>
      <button type="button" className="login-google" onClick={handleGoogle} disabled={busy}>
        Continuer avec Google
      </button>
      <div className="login-divider"><span>ou</span></div>
      <form onSubmit={handleSubmit} className="connexion-form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="login-message">{message}</p>}
        <button type="submit" className="analysis-cta" disabled={busy}>
          {mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <div className="login-links">
        <button type="button" className="login-toggle" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Pas de compte ? S’inscrire" : "Déjà un compte ? Se connecter"}
        </button>
        {mode === "signin" && (
          <button type="button" className="login-reset" onClick={handleReset} disabled={busy}>Mot de passe oublié ?</button>
        )}
      </div>
    </article>
  );
}
