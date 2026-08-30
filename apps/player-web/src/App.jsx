import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, getProfile } from "./firebase.js";
import Login from "./Login.jsx";
import Standings from "./Standings.jsx";
import Profile from "./Profile.jsx";
import Matches from "./Matches.jsx";
import Classement from "./Classement.jsx";
import Bonus from "./Bonus.jsx";
import Quiz from "./Quiz.jsx";
import Odds from "./Odds.jsx";
import Communities from "./Communities.jsx";
import styles from "./App.module.scss";

function hasPlayerAccess(profile) {
  return profile?.isAdmin === true || profile?.isAllowed === true;
}

function getInviteCode() {
  if (typeof window === "undefined") return "";
  return (new URLSearchParams(window.location.search).get("join") || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

function App() {
  const initialInviteCode = getInviteCode();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(initialInviteCode ? "communautes" : "pronostics");
  const [pronoTab, setPronoTab] = useState("journee");
  const [access, setAccess] = useState({ checking: true, allowed: false, error: false });

  async function checkAccess(u) {
    setAccess({ checking: true, allowed: false, error: false });

    let callableSucceeded = false;
    let callableAllowed = false;
    try {
      const { data } = await getProfile();
      callableSucceeded = true;
      callableAllowed = hasPlayerAccess(data);
      if (callableAllowed) {
        setAccess({ checking: false, allowed: true, error: false });
        return;
      }
    } catch (err) {
      console.warn("getProfile access check failed; trying Firestore fallback", err);
    }

    try {
      const snapshot = await getDoc(doc(db, "users", u.uid));
      if (snapshot.exists()) {
        setAccess({ checking: false, allowed: hasPlayerAccess(snapshot.data()), error: false });
        return;
      }

      if (callableSucceeded) {
        setAccess({ checking: false, allowed: callableAllowed, error: false });
        return;
      }
    } catch (err) {
      console.error("Firestore access fallback failed", err);
      if (callableSucceeded) {
        setAccess({ checking: false, allowed: callableAllowed, error: false });
        return;
      }
    }

    setAccess({ checking: false, allowed: false, error: true });
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setAccess({ checking: false, allowed: false, error: false });
        setLoading(false);
        return;
      }
      setUser(u);
      await checkAccess(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading || access.checking) return <div className={styles.loading}>Chargement…</div>;
  if (!user) return <Login />;
  if (access.error) return <div className={styles.denied}><h1>Vérification impossible</h1><p>Prono-L1 n’a pas pu vérifier les droits de ton compte. Réessaie dans quelques instants.</p><button type="button" onClick={() => checkAccess(user)}>Réessayer</button><button type="button" onClick={() => auth.signOut()}>Changer de compte</button></div>;
  if (!access.allowed) return <div className={styles.denied}><h1>Accès refusé</h1><p>Ton compte n’a pas encore accès à l’application Prono-L1. Demande à un administrateur du projet de t’autoriser.</p><button type="button" onClick={() => checkAccess(user)}>Revérifier l’accès</button><button type="button" onClick={() => auth.signOut()}>Changer de compte</button></div>;

  return <div className={styles.app}>
    <header className={styles.header}>
      <div className={styles.brand}><span aria-hidden="true">⚽</span><div><h1>Prono L1</h1><small>Prévois. Gagne. Partage.</small></div></div>
      <div className={styles.user}><span className={styles.email}>{user.email}</span><button className={styles.avatar} type="button" onClick={() => setPage("profil")} aria-label="Mon profil">{(user.displayName || user.email || "J").slice(0, 1).toUpperCase()}</button></div>
    </header>
    <nav className={styles.nav} aria-label="Navigation principale">
      {[
        ["pronostics", "📅", "Pronos / Matchs"],
        ["podium", "🏆", "Podium"],
        ["communautes", "👥", "Communautés"],
        ["quiz", "🎯", "Quiz"],
        ["championnat", "🗓️", "Championnat"],
        ["profil", "👤", "Profil"],
      ].map(([id, icon, label]) => <button key={id} type="button" className={page === id ? styles.active : ""} onClick={() => setPage(id)}><span>{icon}</span><small>{label}</small></button>)}
    </nav>
    <main className={styles.main}>
      {page === "pronostics" ? <>
        <nav className={styles.subnav} aria-label="Pronostics"><button type="button" className={pronoTab === "journee" ? styles.active : ""} onClick={() => setPronoTab("journee")}>Journée</button><button type="button" className={pronoTab === "historique" ? styles.active : ""} onClick={() => setPronoTab("historique")}>Mes pronos</button><button type="button" className={pronoTab === "cotes" ? styles.active : ""} onClick={() => setPronoTab("cotes")}>Cotes</button><button type="button" className={pronoTab === "bonus" ? styles.active : ""} onClick={() => setPronoTab("bonus")}>Bonus</button></nav>
        {pronoTab === "journee" ? <Matches /> : pronoTab === "historique" ? <Matches mode="history" /> : pronoTab === "cotes" ? <Odds /> : <Bonus />}
      </> : null}
      {page === "podium" ? <Classement /> : null}
      {page === "communautes" ? <Communities initialInviteCode={initialInviteCode} /> : null}
      {page === "quiz" ? <Quiz /> : null}
      {page === "championnat" ? <Standings /> : null}
      {page === "profil" ? <><Profile /><button type="button" onClick={() => auth.signOut()}>Déconnexion</button></> : null}
    </main>
  </div>;
}

export default App;
