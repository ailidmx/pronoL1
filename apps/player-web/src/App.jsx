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
        <h1>Prono-L1</h1>
        <div className={styles.user}>
          <span className={styles.email}>{user.email}</span>
          <button type="button" onClick={() => auth.signOut()}>
            Déconnexion
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Profile />
        <Matches />
        <Classement />
        <Bonus />
        <Quiz />
        <Standings />
      </main>
    </div>
  );
}

export default App;
