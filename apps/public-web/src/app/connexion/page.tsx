"use client";

import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, authActionSettings } from "@/lib/client/firebase";
import { useAuth } from "@/lib/client/auth";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const passwordRules = {
  minLength: 8,
  isValid(value: string) {
    return value.length >= this.minLength && /[A-Za-z]/.test(value) && /\d/.test(value);
  },
};

export default function ConnexionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!loading && user && !user.emailVerified) {
    return (
      <article className="content connexion connexion-verification">
        <p className="eyebrow">Activation du compte</p>
        <h1>Vérifie ton adresse email</h1>
        <p>Un lien d’activation a été envoyé à <strong>{user.email}</strong>.</p>
        {message ? <p className="login-message">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">
          <button className="primary" type="button" onClick={async () => { setError(""); setMessage(""); await reload(user); if (user.emailVerified) router.push("/"); else setMessage("L’adresse n’est pas encore vérifiée."); }}>J’ai vérifié mon email</button>
          <button type="button" onClick={async () => { setError(""); try { await sendEmailVerification(user, authActionSettings); setMessage("Un nouveau lien d’activation vient d’être envoyé."); } catch (err) { setError(err instanceof Error ? err.message : "Erreur."); } }}>Renvoyer l’email</button>
          <button type="button" onClick={() => signOut(auth)}>Changer d’adresse</button>
        </div>
      </article>
    );
  }

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
      if (mode === "signin") {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        if (credential.user.emailVerified) router.push("/");
      } else {
        if (!passwordRules.isValid(password)) throw new Error("Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.");
        if (password !== passwordConfirmation) throw new Error("Les deux mots de passe ne correspondent pas.");
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user, authActionSettings);
      }
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
      await sendPasswordResetEmail(auth, email, authActionSettings);
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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? passwordRules.minLength : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </label>
        {mode === "signup" ? <><small className="login-password-help">8 caractères minimum, avec au moins une lettre et un chiffre.</small><label>Confirmer le mot de passe<input type="password" value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} required minLength={passwordRules.minLength} autoComplete="new-password" /></label></> : null}
        {error && <p className="error">{error}</p>}
        {message && <p className="login-message">{message}</p>}
        <button type="submit" className="analysis-cta" disabled={busy}>
          {mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <div className="login-links">
        <button type="button" className="login-toggle" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setPassword(""); setPasswordConfirmation(""); setError(""); setMessage(""); }}>
          {mode === "signin" ? "Pas de compte ? S’inscrire" : "Déjà un compte ? Se connecter"}
        </button>
        {mode === "signin" && (
          <button type="button" className="login-reset" onClick={handleReset} disabled={busy}>Mot de passe oublié ?</button>
        )}
      </div>
    </article>
  );
}
