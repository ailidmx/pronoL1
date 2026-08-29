import { useCallback, useEffect, useState } from "react";
import { createCommunity, getCommunities, joinCommunity, leaveCommunity } from "./callables.js";

const CURRENT_COMPETITION = "ligue-1:2026";

function limitLabel(value) {
  return value == null ? "illimité" : String(value);
}

export default function Communities() {
  const [data, setData] = useState(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await getCommunities();
      setData(response.data);
    } catch (error) {
      setFeedback(error.message || "Impossible de charger les communautés.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(action) {
    setBusy(true);
    setFeedback("");
    try {
      await action();
      await load();
    } catch (error) {
      setFeedback(error.message || "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="community-center"><p>Chargement des communautés…</p>{feedback ? <p className="feature-error">{feedback}</p> : null}</section>;

  return <section className="community-center">
    <div className="feature-hero">
      <p className="feature-kicker">Mode communauté</p>
      <h2>Joue avec tes proches</h2>
      <p>Crée une communauté ou rejoins-en une avec un code. Ton plan <strong>{data.planId}</strong> autorise {limitLabel(data.limits.maxCommunities)} communauté(s) et {limitLabel(data.limits.maxCompetitions)} compétition(s).</p>
    </div>

    <div className="community-actions">
      <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) run(async () => { const response = await createCommunity({ name, competitionIds: [CURRENT_COMPETITION] }); setName(""); setFeedback(`Communauté créée · code ${response.data.invitationCode}`); }); }}>
        <h3>Créer</h3>
        <label>Nom de la communauté<input value={name} onChange={(event) => setName(event.target.value)} maxLength="80" placeholder="Les collègues" /></label>
        <button type="submit" disabled={busy || name.trim().length < 3}>Créer la communauté</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); if (code.trim()) run(async () => { await joinCommunity({ code }); setCode(""); setFeedback("Communauté rejointe ✓"); }); }}>
        <h3>Rejoindre</h3>
        <label>Code d’invitation<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength="16" placeholder="A1B2C3D4" /></label>
        <button type="submit" disabled={busy || code.trim().length < 6}>Rejoindre</button>
      </form>
    </div>

    {feedback ? <p className="feature-feedback">{feedback}</p> : null}
    <div className="community-list">
      {data.communities.length === 0 ? <p className="empty-state">Tu n’appartiens encore à aucune communauté.</p> : data.communities.map((community) => <article className="community-card" key={community.id}>
        <div><small>{community.role === "owner" ? "Propriétaire" : "Membre"}</small><h3>{community.name}</h3><p>{community.memberCount} membre{community.memberCount > 1 ? "s" : ""} · {community.competitionIds.join(", ")}</p></div>
        {community.invitationCode ? <div className="invite-code"><span>Code d’invitation</span><strong>{community.invitationCode}</strong></div> : null}
        {community.role !== "owner" ? <button type="button" disabled={busy} onClick={() => run(() => leaveCommunity({ communityId: community.id }))}>Quitter</button> : null}
      </article>)}
    </div>
  </section>;
}
