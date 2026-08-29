import { useEffect, useState } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [pending, setPending] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    const stopUsers = onSnapshot(
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
    const stopPlans = onSnapshot(
      collection(db, "accessPlans"),
      (snap) => setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((plan) => plan.enabled === true).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))),
      (reason) => setError(reason.message || "Impossible de charger les plans d'accès."),
    );
    return () => { stopUsers(); stopPlans(); };
  }, []);

  async function update(uid, field, value) {
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

  async function updatePlan(user, accessPlanId) {
    const key = `${user.id}:accessPlanId`;
    setPending((current) => ({ ...current, [key]: true }));
    setError(null);
    try {
      const selected = plans.find((plan) => plan.id === accessPlanId);
      await setDoc(doc(db, "users", user.id), {
        accessPlanId,
        isPremium: selected?.isPaid === true,
      }, { merge: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le plan n'a pas pu être enregistré.");
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
        onChange={(event) => update(user.id, field, event.target.checked)}
      />
    );
  };

  return (
    <section>
      <h2>Utilisateurs</h2>
      <p>Le plan contrôle les fonctionnalités réellement disponibles pour chaque compte.</p>
      {error ? <p role="alert">{error}</p> : null}
      {users.length === 0 ? (
        <p>Aucun utilisateur pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Email</th><th>Pseudo</th><th>Accès</th><th>Plan</th><th>Admin</th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const planId = u.accessPlanId || (u.isPremium === true ? "premium" : "registered");
              return (
                <tr key={u.id}>
                  <td>{u.email ?? u.id}</td>
                  <td>{u.displayName ?? "—"}</td>
                  <td>{checkbox(u, "isAllowed", "Accès")}</td>
                  <td>
                    <select value={planId} disabled={pending[`${u.id}:accessPlanId`] === true} onChange={(event) => updatePlan(u, event.target.value)}>
                      {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name ?? plan.id}</option>)}
                    </select>
                  </td>
                  <td>{checkbox(u, "isAdmin", "Admin")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default UsersPanel;
