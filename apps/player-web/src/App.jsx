import { useEffect, useState } from "react";
import { onAuthStateChanged, reload, sendEmailVerification } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, authActionSettings, db, getProfile } from "./firebase.js";
import Login from "./Login.jsx";
import Standings from "./Standings.jsx";
import AccountCenter from "./AccountCenter.jsx";
import Matches from "./Matches.jsx";
import Classement from "./Classement.jsx";
import Bonus from "./Bonus.jsx";
import Quiz from "./Quiz.jsx";
import Odds from "./Odds.jsx";
import Communities from "./Communities.jsx";
import Adsense, { PlayerAdSlot, shouldShowAds } from "./Adsense.jsx";
import styles from "./App.module.scss";
import { useCompetitionSeason } from "./CompetitionSeasonContext.jsx";

const THEME_STORAGE_KEY = "prono-l1-theme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function hasPlayerAccess(profile) {
  return Boolean(profile);
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
  const competitionSeason = useCompetitionSeason();
  const initialInviteCode = getInviteCode();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(initialInviteCode ? "communautes" : "pronostics");
  const [pronoTab, setPronoTab] = useState("journee");
  const [theme, setTheme] = useState(getInitialTheme);
  const [access, setAccess] = useState({ checking: true, allowed: false, error: false });
  const [verificationMessage, setVerificationMessage] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountSection, setAccountSection] = useState(null);

  async function checkAccess(u) {
    setAccess({ checking: true, allowed: false, error: false });
    setProfile(null);

    if (!u.emailVerified) {
      setAccess({ checking: false, allowed: false, error: false });
      return;
    }

    let callableSucceeded = false;
    let callableAllowed = false;
    try {
      const { data } = await getProfile();
      callableSucceeded = true;
      callableAllowed = hasPlayerAccess(data);
      if (callableAllowed) {
        setProfile(data);
        setAccess({ checking: false, allowed: true, error: false });
        return;
      }
    } catch (err) {
      console.warn("getProfile access check failed; trying Firestore fallback", err);
    }

    try {
      const snapshot = await getDoc(doc(db, "users", u.uid));
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile(data);
        setAccess({ checking: false, allowed: hasPlayerAccess(data), error: false });
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
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setProfile(null);
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

  if (loading || access.checking) return <div className={styles.loading}><img src="/icon-192.png" alt="" /><span>Chargement…</span></div>;
  if (!user) return <Login />;
  if (!user.emailVerified) return <div className={styles.denied}><h1>Vérifie ton adresse email</h1><p>Nous avons envoyé un lien d’activation à <strong>{user.email}</strong>. Ouvre-le pour activer ton compte, puis reviens ici.</p>{verificationMessage && <p>{verificationMessage}</p>}<button type="button" onClick={async () => { setVerificationMessage(""); await reload(user); if (user.emailVerified) await checkAccess(user); else setVerificationMessage("L’adresse n’est pas encore vérifiée."); }}>J’ai vérifié mon email</button><button type="button" onClick={async () => { await sendEmailVerification(user, authActionSettings); setVerificationMessage("Un nouveau lien d’activation vient d’être envoyé."); }}>Renvoyer l’email</button><button type="button" onClick={() => auth.signOut()}>Changer d’adresse</button></div>;
  if (access.error) return <div className={styles.denied}><h1>Vérification impossible</h1><p>Prono-L1 n’a pas pu vérifier les droits de ton compte. Réessaie dans quelques instants.</p><button type="button" onClick={() => checkAccess(user)}>Réessayer</button><button type="button" onClick={() => auth.signOut()}>Changer de compte</button></div>;
  if (!access.allowed) return <div className={styles.denied}><h1>Activation impossible</h1><p>Ton profil n’a pas pu être créé automatiquement. Réessaie dans quelques instants.</p><button type="button" onClick={() => checkAccess(user)}>Réessayer</button><button type="button" onClick={() => auth.signOut()}>Changer de compte</button></div>;
  if (competitionSeason.loading) return <div className={styles.loading}><img src="/icon-192.png" alt="" /><span>Chargement des compétitions…</span></div>;
  if (competitionSeason.error || !competitionSeason.selection) return <div className={styles.denied}><h1>Configuration sportive invalide</h1><p>{competitionSeason.error || "Aucune compétition et saison actives ne sont configurées."}</p><button type="button" onClick={() => window.location.reload()}>Réessayer</button></div>;

  const adsEnabled = shouldShowAds(profile);

  return <div className={styles.app}>
    <Adsense enabled={adsEnabled} />
    <header className={styles.header}>
      <div className={styles.brand}><img src="/icon-192.png" alt="" /><div><h1>Prono L1</h1><small>Prévois. Gagne. Partage.</small></div></div>
      <div className={styles.user}>
        <span className={styles.email}>{user.email}</span>
        <button className={styles.themeToggle} type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"} title={theme === "dark" ? "Thème clair" : "Thème sombre"}>{theme === "dark" ? "☀️" : "🌙"}</button>
        <div className={styles.accountMenu}>
          <button className={styles.avatar} type="button" onClick={() => setAccountMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={accountMenuOpen} aria-label="Ouvrir le menu du compte">{profile?.avatarInitiales || (profile?.displayName || user.email || "J").slice(0, 1).toUpperCase()}</button>
          {accountMenuOpen ? <div className={styles.accountDropdown} role="menu"><strong>{profile?.displayName || "Mon compte"}</strong><span>{user.email}</span>{[["identity", "✏️ Pseudo et initiales"], ["team", "⭐ Équipe de cœur"], ["notifications", "🔔 Notifications"], ["rules", "📖 Règles"], ["password", "🔒 Mot de passe"]].map(([id, label]) => <button type="button" role="menuitem" key={id} onClick={() => { setAccountSection(id); setAccountMenuOpen(false); }}>{label}</button>)}<button type="button" role="menuitem" onClick={() => auth.signOut()}>🚪 Déconnexion</button></div> : null}
        </div>
      </div>
    </header>
    <section className={styles.competitionBar} aria-label="Compétition et saison">
      <label htmlFor="competition-season">Compétition</label>
      <select id="competition-season" value={competitionSeason.selection?.key ?? ""} onChange={(event) => competitionSeason.select(event.target.value)} disabled={competitionSeason.loading || competitionSeason.selections.length < 2}>
        {competitionSeason.selections.map((item) => <option key={item.key} value={item.key}>{item.competition.name} · {item.label}</option>)}
      </select>
    </section>
    <PlayerAdSlot enabled={adsEnabled} placement="masthead" />
    <nav className={styles.nav} aria-label="Navigation principale">
      {[
        ["pronostics", "📅", "Pronos / Matchs"],
        ["podium", "🏆", "Podium"],
        ["communautes", "👥", "Communautés"],
        ["quiz", "🎯", "Quiz"],
        ["championnat", "🗓️", "Championnat"],
      ].map(([id, icon, label]) => <button key={id} type="button" className={page === id ? styles.active : ""} onClick={() => setPage(id)}><span>{icon}</span><small>{label}</small></button>)}
    </nav>
    <main className={styles.main}>
      {page === "pronostics" ? <>
        <nav className={styles.subnav} aria-label="Pronostics"><button type="button" className={pronoTab === "journee" ? styles.active : ""} onClick={() => setPronoTab("journee")}>Journée</button><button type="button" className={pronoTab === "historique" ? styles.active : ""} onClick={() => setPronoTab("historique")}>Mes pronos</button><button type="button" className={pronoTab === "cotes" ? styles.active : ""} onClick={() => setPronoTab("cotes")}>Cotes</button><button type="button" className={pronoTab === "bonus" ? styles.active : ""} onClick={() => setPronoTab("bonus")}>Bonus</button></nav>
        {pronoTab === "journee" ? <Matches /> : pronoTab === "historique" ? <Matches mode="history" /> : pronoTab === "cotes" ? <Odds /> : <Bonus />}
        <PlayerAdSlot enabled={adsEnabled} placement="pronostics" />
      </> : null}
      {page === "podium" ? <><Classement /><PlayerAdSlot enabled={adsEnabled} placement="section" /></> : null}
      {page === "communautes" ? <><Communities initialInviteCode={initialInviteCode} /><PlayerAdSlot enabled={adsEnabled} placement="section" /></> : null}
      {page === "quiz" ? <><Quiz /><PlayerAdSlot enabled={adsEnabled} placement="section" /></> : null}
      {page === "championnat" ? <><Standings /><PlayerAdSlot enabled={adsEnabled} placement="section" /></> : null}
      <PlayerAdSlot enabled={adsEnabled} placement="bottom" />
    </main>
    {accountSection ? <AccountCenter section={accountSection} onSectionChange={setAccountSection} onClose={() => setAccountSection(null)} onSignOut={() => auth.signOut()} /> : null}
  </div>;
}

export default App;
