import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { auth, authActionSettings, googleProvider } from "./firebase.js";

const passwordRules = {
  minLength: 8,
  isValid(value) {
    return value.length >= this.minLength && /[A-Za-z]/.test(value) && /\d/.test(value);
  },
};

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
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
        if (!passwordRules.isValid(password)) {
          throw new Error("Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.");
        }
        if (password !== passwordConfirmation) {
          throw new Error("Les deux mots de passe ne correspondent pas.");
        }
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user, authActionSettings);
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
      await sendPasswordResetEmail(auth, email, authActionSettings);
      setMessage("Email de réinitialisation envoyé.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img className="login-app-icon" src="/icon-192.png" alt="Icône Prono-L1" />
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
            minLength={mode === "signup" ? passwordRules.minLength : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
        {mode === "signup" && (
          <>
            <small className="login-password-help">8 caractères minimum, avec au moins une lettre et un chiffre.</small>
            <label>
              Confirmer le mot de passe
              <input
                type="password"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                required
                minLength={passwordRules.minLength}
                autoComplete="new-password"
              />
            </label>
          </>
        )}
        {error && <p className="login-error">{error}</p>}
        {message && <p className="login-message">{message}</p>}
        <button type="submit" disabled={busy}>
          {mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <div className="login-links">
        <button type="button" className="login-toggle" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setPassword(""); setPasswordConfirmation(""); setError(""); setMessage(""); }}>
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
