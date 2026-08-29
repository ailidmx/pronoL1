import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

function UsersPanel() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    return onSnapshot(collection(db, "users"), (snap) => {
      setUsers(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")),
      );
    });
  }, []);

  function toggle(uid, field, value) {
    setDoc(doc(db, "users", uid), { [field]: value }, { merge: true });
  }

  return (
    <section>
      <h2>Utilisateurs</h2>
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
                <td><input type="checkbox" checked={u.isAllowed === true} onChange={(e) => toggle(u.id, "isAllowed", e.target.checked)} /></td>
                <td><input type="checkbox" checked={u.isPremium === true} onChange={(e) => toggle(u.id, "isPremium", e.target.checked)} /></td>
                <td><input type="checkbox" checked={u.isAdmin === true} onChange={(e) => toggle(u.id, "isAdmin", e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default UsersPanel;
