import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { auth, getProfile, provider } from "./firebase.js";
import UsersPanel from "./UsersPanel.jsx";
import styles from "./App.module.scss";

function Dashboard() { return <section><h2>Tableau de bord</h2><p>Le socle Admin est prêt pour le portage progressif des opérations legacy.</p></section>; }
function Placeholder({ title }) { return <section><h2>{title}</h2><p>Cette capacité sera portée depuis le back-office legacy.</p></section>; }

export default function App() {
  const [state, setState] = useState({ loading: true, user: null, admin: false });
  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return setState({ loading: false, user: null, admin: false });
    try { const { data } = await getProfile(); setState({ loading: false, user, admin: data.isAdmin === true }); }
    catch { setState({ loading: false, user, admin: false }); }
  }), []);
  if (state.loading) return <main className={styles.center}>Chargement…</main>;
  if (!state.user) return <main className={styles.center}><button onClick={() => signInWithPopup(auth, provider)}>Connexion administrateur</button></main>;
  if (!state.admin) return <main className={styles.center}><h1>Accès refusé</h1><button onClick={() => signOut(auth)}>Changer de compte</button></main>;
  return <div className={styles.shell}><aside><h1>Prono-L1 Admin</h1><nav>{["Tableau de bord", "Utilisateurs", "Quiz et bonus", "Données football", "Opérations"].map((x,i)=><NavLink key={x} to={i?`/${x.toLowerCase().replaceAll(" ","-")}`:"/"}>{x}</NavLink>)}</nav><button onClick={() => signOut(auth)}>Déconnexion</button></aside><main><Routes><Route path="/" element={<Dashboard/>}/><Route path="/utilisateurs" element={<UsersPanel/>}/><Route path="/quiz-et-bonus" element={<Placeholder title="Quiz et bonus"/>}/><Route path="/données-football" element={<Placeholder title="Données football"/>}/><Route path="/opérations" element={<Placeholder title="Opérations"/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></main></div>;
}
