import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, getProfile, saveProfile } from "./firebase.js";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [displayName, setDisplayName] = useState("");
  const [equipeCoeurId, setEquipeCoeurId] = useState("");
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [notifTelegram, setNotifTelegram] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [profileRes, clubsSnap] = await Promise.all([
          getProfile(),
          getDocs(collection(db, "clubs")),
        ]);
        if (!mounted) return;
        const p = profileRes.data;
        setProfile(p);
        setDisplayName(p.displayName ?? "");
        setEquipeCoeurId(p.equipeCoeurId != null ? String(p.equipeCoeurId) : "");
        setNotifEmail(p.notifEmail ?? true);
        setNotifPush(p.notifPush ?? false);
        setNotifTelegram(p.notifTelegram ?? false);

        const list = [];
        clubsSnap.forEach((d) => list.push({ id: d.id, nom: d.data().nom ?? d.id }));
        list.sort((a, b) => a.nom.localeCompare(b.nom));
        setClubs(list);
      } catch (err) {
        if (mounted) setError(err.message);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await saveProfile({
        displayName: displayName.trim() || null,
        equipeCoeurId: equipeCoeurId === "" ? null : Number(equipeCoeurId),
        notifEmail,
        notifPush,
        notifTelegram,
      });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !profile) return <p className="error">Erreur profil : {error}</p>;
  if (!profile) return <p>Chargement du profil…</p>;

  return (
    <section className="profile">
      <h2>Mon profil</h2>
      <p className="profile-email">{profile.email}</p>
      <form onSubmit={submit} className="profile-form">
        <label>
          Pseudo
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ton pseudo"
          />
        </label>
        <label>
          Équipe de cœur
          <select value={equipeCoeurId} onChange={(e) => setEquipeCoeurId(e.target.value)}>
            <option value="">—</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Notifications</legend>
          <label>
            <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} />
            Email
          </label>
          <label>
            <input type="checkbox" checked={notifPush} onChange={(e) => setNotifPush(e.target.checked)} />
            Push
          </label>
          <label>
            <input type="checkbox" checked={notifTelegram} onChange={(e) => setNotifTelegram(e.target.checked)} />
            Telegram
          </label>
        </fieldset>
        <button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && <p className="success">Profil enregistré.</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}

export default Profile;

