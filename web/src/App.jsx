import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import Login from "./Login.jsx";
import Standings from "./Standings.jsx";
import Profile from "./Profile.jsx";
import Matches from "./Matches.jsx";
import Classement from "./Classement.jsx";
import Bonus from "./Bonus.jsx";
import "./App.css";

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
    return <div className="app-loading">Chargement…</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Prono-L1</h1>
        <div className="app-user">
          <span className="app-email">{user.email}</span>
          <button type="button" onClick={() => auth.signOut()}>
            Déconnexion
          </button>
        </div>
      </header>
      <main className="app-main">
        <Profile />
        <Matches />
        <Classement />
        <Bonus />
        <Standings />
      </main>
    </div>
  );
}

export default App;
