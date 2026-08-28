import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase.js";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message);
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
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
        setError(err.message);
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>Prono-L1</h1>
      <button type="button" className="login-google" onClick={handleGoogle} disabled={busy}>
        Continuer avec Google
      </button>
      <div className="login-divider"><span>ou</span></div>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        {message && <p className="login-message">{message}</p>}
        <button type="submit" disabled={busy}>
          {mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <div className="login-links">
        <button type="button" className="login-toggle" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
        </button>
        {mode === "signin" && (
          <button type="button" className="login-reset" onClick={handleReset} disabled={busy}>
            Mot de passe oublié ?
          </button>
        )}
      </div>
    </div>
  );
}

export default Login;

