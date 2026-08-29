import { useEffect, useState } from "react";
import { getExperimentDashboard } from "./firebase.js";

const LABELS = {
  control: "Dark Lime",
  editorial: "Editorial",
  electric: "Electric",
};

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)} %`;
}

export default function ExperimentsPanel() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await getExperimentDashboard();
      setState({ loading: false, data: result.data, error: null });
    } catch (reason) {
      setState({ loading: false, data: null, error: reason instanceof Error ? reason.message : "Impossible de charger les expériences." });
    }
  }

  useEffect(() => { void load(); }, []);

  const variants = state.data?.variants ?? [];
  const total = variants.reduce((sum, item) => sum + item.exposedUsers, 0);

  return (
    <section>
      <div className="admin-section-heading">
        <div><h2>Expériences</h2><p>Suivi PostHog des tests actifs sur le site public.</p></div>
        <button onClick={load} disabled={state.loading}>{state.loading ? "Actualisation…" : "Actualiser"}</button>
      </div>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.data ? (
        <>
          <article className="admin-card">
            <div className="admin-grid">
              <div><strong>Test</strong><p>{state.data.experiment}</p></div>
              <div><strong>Fenêtre</strong><p>{state.data.windowDays} jours</p></div>
              <div><strong>Utilisateurs exposés</strong><p>{total}</p></div>
              <div><strong>Dernière lecture</strong><p>{new Date(state.data.refreshedAt).toLocaleString("fr-FR")}</p></div>
            </div>
          </article>
          <table>
            <thead><tr><th>Variante</th><th>Exposés</th><th>Part trafic</th><th>Fiches match ouvertes</th><th>Conversion</th></tr></thead>
            <tbody>
              {variants.map((item) => (
                <tr key={item.key}>
                  <td><strong>{LABELS[item.key] ?? item.key}</strong><br /><small>{item.key}</small></td>
                  <td>{item.exposedUsers}</td>
                  <td>{total > 0 ? percent(item.exposedUsers / total) : "—"}</td>
                  <td>{item.convertedUsers}</td>
                  <td>{percent(item.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {variants.length === 0 ? <p>Aucune exposition reçue pour le moment.</p> : null}
        </>
      ) : null}
    </section>
  );
}
