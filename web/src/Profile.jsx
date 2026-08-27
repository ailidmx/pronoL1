import { useEffect, useState } from "react";
import { getProfile } from "./firebase.js";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    getProfile()
      .then((res) => {
        if (mounted) setProfile(res.data);
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) return <p className="error">Erreur profil : {error}</p>;
  if (!profile) return <p>Chargement du profil…</p>;

  return (
    <section className="profile">
      <h2>Mon profil</h2>
      <p className="profile-email">{profile.email}</p>
      {profile.displayName && <p>{profile.displayName}</p>}
    </section>
  );
}

export default Profile;
