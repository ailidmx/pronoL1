import { useEffect, useState } from "react";
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { auth, db, getProfile, provider } from "./firebase.js";
import UsersPanel from "./UsersPanel.jsx";
import EntitlementsPanel from "./EntitlementsPanel.jsx";
import ExperimentsPanel from "./ExperimentsPanel.jsx";
import FootballDataPanel from "./FootballDataPanel.jsx";
import styles from "./App.module.scss";

function Dashboard() { return <section><h2>Tableau de bord</h2><p>Le socle Admin est prêt pour le portage progressif des opérations legacy.</p></section>; }
function Placeholder({ title }) { return <section><h2>{title}</h2><p>Cette capacité sera portée depuis le back-office legacy.</p></section>; }

function shouldUseRedirectAuth() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function authErrorMessage(error) {
  const code = error?.code ?? "";
  if (code === "auth/unauthorized-domain") {
    return `Le domaine ${window.location.hostname} n’est pas encore autorisé dans Firebase Authentication.`;
  }
  if (code === "auth/network-request-failed") {
    return "La connexion à Firebase a échoué. Vérifie le réseau puis réessaie.";
  }
  return `La connexion Google n’a pas abouti${code ? ` (${code})` : ""}. Réessaie.`;
}

async function verifyAdmin(user) {
  let callableSucceeded = false;
  let callableAdmin = false;

  try {
    const { data } = await getProfile();
    callableSucceeded = true;
    callableAdmin = data?.isAdmin === true;
    if (callableAdmin) return { admin: true, error: false };
  } catch (error) {
    console.warn("Admin profile callable failed; trying Firestore fallback", error);
  }

  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (snapshot.exists()) return { admin: snapshot.data()?.isAdmin === true, error: false };
    if (callableSucceeded) return { admin: callableAdmin, error: false };
  } catch (error) {
    console.error("Admin Firestore fallback failed", error);
    if (callableSucceeded) return { admin: callableAdmin, error: false };
  }

  return { admin: false, error: true };
}

export default function App() {
  const [state, setState] = useState({ loading: true, user: null, admin: false, verificationError: false });
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function refreshAdmin(user) {
    setState((current) => ({ ...current, loading: true, verificationError: false }));
    const result = await verifyAdmin(user);
    setState({ loading: false, user, admin: result.admin, verificationError: result.error });
  }

  useEffect(() => {
    getRedirectResult(auth).catch((error) => {
      console.error("Admin redirect sign-in failed", error);
      setAuthError(authErrorMessage(error));
      setSigningIn(false);
    });

    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ loading: false, user: null, admin: false, verificationError: false });
        return;
      }
      const result = await verifyAdmin(user);
      setState({ loading: false, user, admin: result.admin, verificationError: result.error });
    });
  }, []);

  async function signInAdmin() {
    setAuthError("");
    setSigningIn(true);
    try {
      if (shouldUseRedirectAuth()) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Admin sign-in failed", error);
      setAuthError(authErrorMessage(error));
      setSigningIn(false);
    }
  }

  if (state.loading) return <main className={styles.center}><img className={styles.splashIcon} src="/icon-192.png" alt="" /><p>Chargement…</p></main>;
  if (!state.user) return <main className={styles.center}><section className={styles.loginCard}><img className={styles.loginIcon} src="/icon-192.png" alt="Icône Prono-L1 Admin" /><h1>Prono-L1 Admin</h1><p>Connecte-toi avec ton compte administrateur.</p><button className={styles.primary} type="button" disabled={signingIn} onClick={signInAdmin}>{signingIn ? "Connexion…" : "Continuer avec Google"}</button>{authError ? <p className={styles.error}>{authError}</p> : null}</section></main>;
  if (state.verificationError) return <main className={styles.center}><section className={styles.loginCard}><h1>Vérification impossible</h1><p>Impossible de vérifier tes droits administrateur pour le moment.</p><div className={styles.actions}><button className={styles.primary} type="button" onClick={() => refreshAdmin(state.user)}>Réessayer</button><button type="button" onClick={() => signOut(auth)}>Changer de compte</button></div></section></main>;
  if (!state.admin) return <main className={styles.center}><section className={styles.loginCard}><h1>Accès refusé</h1><p>Ce compte n’a pas les droits administrateur Prono-L1.</p><div className={styles.actions}><button className={styles.primary} type="button" onClick={() => refreshAdmin(state.user)}>Revérifier l’accès</button><button type="button" onClick={() => signOut(auth)}>Changer de compte</button></div></section></main>;

  const links = [
    ["Tableau de bord", "/"],
    ["Utilisateurs", "/utilisateurs"],
    ["Accès & tarifs", "/acces-tarifs"],
    ["Expériences", "/experiences"],
    ["Quiz et bonus", "/quiz-et-bonus"],
    ["Données football", "/donnees-football"],
    ["Opérations", "/operations"],
  ];

  return <div className={styles.shell}><aside><h1>Prono-L1 Admin</h1><nav>{links.map(([label, to]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav><button onClick={() => signOut(auth)}>Déconnexion</button></aside><main><Routes><Route path="/" element={<Dashboard/>}/><Route path="/utilisateurs" element={<UsersPanel/>}/><Route path="/acces-tarifs" element={<EntitlementsPanel/>}/><Route path="/experiences" element={<ExperimentsPanel/>}/><Route path="/quiz-et-bonus" element={<Placeholder title="Quiz et bonus"/>}/><Route path="/donnees-football" element={<FootballDataPanel/>}/><Route path="/operations" element={<Placeholder title="Opérations"/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></main></div>;
}
