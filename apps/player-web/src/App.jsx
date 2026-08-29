import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import Login from "./Login.jsx";
import Standings from "./Standings.jsx";
import Profile from "./Profile.jsx";
import Matches from "./Matches.jsx";
import Classement from "./Classement.jsx";
import Bonus from "./Bonus.jsx";
import Quiz from "./Quiz.jsx";
import styles from "./App.module.scss";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("pronostics");
  const [pronoTab, setPronoTab] = useState("journee");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return <div className={styles.loading}>Chargement…</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}><span aria-hidden="true">⚽</span><div><h1>Prono L1</h1><small>Prévois. Gagne. Partage.</small></div></div>
        <div className={styles.user}>
          <span className={styles.email}>{user.email}</span>
          <button className={styles.avatar} type="button" onClick={() => setPage("profil")} aria-label="Mon profil">{(user.displayName || user.email || "J").slice(0, 1).toUpperCase()}</button>
        </div>
      </header>
      <nav className={styles.nav} aria-label="Navigation principale">
        {[
          ["pronostics", "📅", "Pronos / Matchs"],
          ["podium", "🏆", "Podium"],
          ["quiz", "🎯", "Quiz"],
          ["championnat", "🗓️", "Championnat"],
          ["profil", "👤", "Profil"],
        ].map(([id, icon, label]) => <button key={id} type="button" className={page === id ? styles.active : ""} onClick={() => setPage(id)}><span>{icon}</span><small>{label}</small></button>)}
      </nav>
      <main className={styles.main}>
        {page === "pronostics" ? <>
          <nav className={styles.subnav} aria-label="Pronostics"><button type="button" className={pronoTab === "journee" ? styles.active : ""} onClick={() => setPronoTab("journee")}>Journée</button><button type="button" className={pronoTab === "historique" ? styles.active : ""} onClick={() => setPronoTab("historique")}>Mes pronos</button><button type="button" className={pronoTab === "bonus" ? styles.active : ""} onClick={() => setPronoTab("bonus")}>Bonus</button></nav>
          {pronoTab === "journee" ? <Matches /> : pronoTab === "historique" ? <Matches mode="history" /> : <Bonus />}
        </> : null}
        {page === "podium" ? <Classement /> : null}
        {page === "quiz" ? <Quiz /> : null}
        {page === "championnat" ? <Standings /> : null}
        {page === "profil" ? <><Profile /><button type="button" onClick={() => auth.signOut()}>Déconnexion</button></> : null}
      </main>
    </div>
  );
}

export default App;
