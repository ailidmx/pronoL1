import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, "users"),
      (snap) => {
        setUsers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")),
        );
        setError(null);
      },
      (reason) => setError(reason.message || "Impossible de charger les utilisateurs."),
    );
  }, []);

  async function toggle(uid, field, value) {
    const key = `${uid}:${field}`;
    setPending((current) => ({ ...current, [key]: true }));
    setError(null);
    try {
      await setDoc(doc(db, "users", uid), { [field]: value }, { merge: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La modification n'a pas pu être enregistrée.");
    } finally {
      setPending((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  const checkbox = (user, field, label) => {
    const key = `${user.id}:${field}`;
    return (
      <input
        type="checkbox"
        aria-label={`${label} ${user.email ?? user.id}`}
        checked={user[field] === true}
        disabled={pending[key] === true}
        onChange={(event) => toggle(user.id, field, event.target.checked)}
      />
    );
  };

  return (
    <section>
      <h2>Utilisateurs</h2>
      {error ? <p role="alert">{error}</p> : null}
      {users.length === 0 ? (
        <p>Aucun utilisateur pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Email</th><th>Pseudo</th><th>Accès</th><th>Premium</th><th>Admin</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email ?? u.id}</td>
                <td>{u.displayName ?? "—"}</td>
                <td>{checkbox(u, "isAllowed", "Accès")}</td>
                <td>{checkbox(u, "isPremium", "Premium")}</td>
                <td>{checkbox(u, "isAdmin", "Admin")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default UsersPanel;
