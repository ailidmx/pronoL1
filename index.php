<?php
// ============================================================
// Empêche le navigateur (surtout en PWA installée sur mobile)
// de garder cette page en cache trop longtemps : à chaque
// ouverture de l'appli, on force une revérification auprès du
// serveur, pour être sûr que le lien vers app.js/style.css
// pointe toujours vers la dernière version (?v=...).
// ============================================================
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
?>
<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#1a4a8a">
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap">
<!-- Changer la lettre du ?v= de la ligne juste en dessous quand on modifie style.css -->
<link rel="stylesheet" href="style.css?v=20260826a">
<title>Prono-L1 — Ligue 1 McDonald's</title>
</head>
<body>

<!-- ============================================================
     HEADER
     ============================================================ -->
<header>
  <div class="header-main">
  <div class="header-topline">
  <div class="logo">
    <img src="logo-header-icone.png" alt="Prono L1" class="logo-icon">
    <img src="logo-header-texte.png" alt="Prono L1 — Prévois. Gagne. Partage." class="logo-img">
  </div>
  <div class="header-saison-centre">
    <select id="select-saison-header" onchange="changerSaisonAffichee(this.value)" title="Changer de saison"></select>
    <small id="badge-saison-archivee" class="hidden">🔒 lecture seule</small>
    <small id="badge-saison-entrainement" class="hidden" style="color:var(--or)">🎓 scores fictifs</small>
  </div>
  <div class="header-right">
    <div class="header-right-icons">
      <button class="btn-theme btn-theme-icon" onclick="toggleTheme()" id="btn-theme" title="Changer de thème">
        <span id="btn-theme-emoji">☀️</span>
      </button>
      <div class="avatar-wrap" id="avatar-wrap" style="display:none">
        <div class="avatar" id="avatar" onclick="ouvrirModalPseudo()" title="Mon profil">
          --
        </div>
        <span class="avatar-chevron" onclick="ouvrirModalPseudo()">▾</span>
      </div>
    </div>
  </div>
  </div><!-- fin header-topline -->

  <div class="header-stats header-stats-lg" id="header-stats-lg">
    <div class="hstat" title="Ma position"><div class="hstat-val" id="stat-position-lg">–</div><div class="hstat-lbl"><span class="hstat-icon">📍</span></div></div>
    <div class="hstat" title="Mes points"><div class="hstat-val" id="stat-points-lg">–</div><div class="hstat-lbl"><span class="hstat-icon">⭐</span></div></div>
    <div class="hstat" title="Exacts"><div class="hstat-val" id="stat-exacts-lg">–</div><div class="hstat-lbl"><span class="hstat-icon">🎯</span></div></div>
    <div class="hstat" title="Bons"><div class="hstat-val" id="stat-bons-lg">–</div><div class="hstat-lbl"><span class="hstat-icon">✅</span></div></div>
    <div class="hstat" title="Écart"><div class="hstat-val" id="stat-ecart-lg">–</div><div class="hstat-lbl"><span class="hstat-icon">↔️</span></div></div>
    <div class="hstat" title="Buts D"><div class="hstat-val" id="stat-buts-dom-lg">–</div><div class="hstat-lbl"><span class="hstat-icon hstat-icon-combo"><span>🏠</span><span>⚽</span></span></div></div>
    <div class="hstat" title="Buts E"><div class="hstat-val" id="stat-buts-ext-lg">–</div><div class="hstat-lbl"><span class="hstat-icon hstat-icon-combo"><span>✈️</span><span>⚽</span></span></div></div>
    <div class="hstat" title="Journées de champion"><div class="hstat-val" id="stat-champion-lg">–</div><div class="hstat-lbl"><span class="hstat-icon">🏆</span></div></div>
    <div class="hstat" title="Pronos + Bonus"><div class="hstat-val" id="stat-pronos-lg">–</div><div class="hstat-lbl"><span class="hstat-icon hstat-icon-combo"><span>📋</span><span>🎁</span></span></div></div>
  </div>
  <div class="header-stats-compact" id="header-stats-compact" onclick="ouvrirDetailStatsHeader()" title="Voir le détail de mes stats">
    <div class="hstat"><div class="hstat-val" id="stat-position-mini">–</div><div class="hstat-lbl">Ma position</div></div>
    <div class="hstat"><div class="hstat-val" id="stat-points-mini">–</div><div class="hstat-lbl">Mes points</div></div>
    <span class="hstats-loupe">🔍</span>
  </div>
  </div><!-- fin header-main -->
  <div id="compte-rebours"></div>
</header>

<!-- ============================================================
     NAVIGATION PRINCIPALE
     ============================================================ -->
<nav id="main-nav">
  <button onclick="showPage('pronostics', this)" class="active"><span class="nav-icon">📅</span><span class="nav-txt">Pronos/<wbr>Matchs</span></button>
  <button onclick="showPage('joueurs', this)"><span class="nav-icon">🏆</span><span class="nav-txt">Podium</span></button>
  <button onclick="showPage('quizz', this)" style="position:relative"><span class="nav-icon">🎯</span><span class="nav-txt">Quizz</span><span id="quizz-nav-dot" class="quizz-nav-dot" style="display:none"></span></button>
  <button onclick="showPage('championnat', this)"><span class="nav-icon">🗓️</span><span class="nav-txt">Championnat</span></button>
  <button onclick="showPage('faq', this)"><span class="nav-icon">❓</span><span class="nav-txt">FAQ</span></button>
  <button onclick="showPage('admin', this)" id="nav-admin" style="display:none"><span class="nav-icon">⚙️</span><span class="nav-txt">Admin</span></button>
</nav>

<!-- SOUS-ONGLETS -->
<div id="subtabs"></div>

<!-- ============================================================
     CONTENU PRINCIPAL
     ============================================================ -->
<main>

  <!-- ══════════════ PAGE : PRONOSTICS ══════════════ -->
  <div id="page-pronostics">

    <!-- Sous-onglet : Journée -->
    <div id="sub-journee" style="overflow:visible">
      <!-- Ligne de navigation — sticky sur toute la hauteur de la liste des
           matchs ci-dessous (d'où sa position en enfant direct de
           #sub-journee, et non nichée dans le petit bloc avec les dates :
           position:sticky ne reste collé que tant qu'on est dans son
           propre conteneur parent, donc il lui faut un parent aussi haut
           que toute la liste pour fonctionner sur tout le scroll) -->
      <div class="journee-nav-row" style="display:flex;align-items:center;justify-content:center;gap:6px">
        <button onclick="changeJournee(-999)" id="btn-first-j" title="Première journée" class="journee-nav-btn">⏮</button>
        <button onclick="changeJournee(-1)" id="btn-prev-j" title="Journée précédente" class="journee-nav-btn">◀</button>
        <select id="select-journee" onchange="allerJournee(this.value)" class="journee-nav-select"></select>
        <button onclick="changeJournee(1)" id="btn-next-j" title="Journée suivante" class="journee-nav-btn">▶</button>
        <button onclick="changeJournee(999)" id="btn-last-j" title="Dernière journée" class="journee-nav-btn">⏭</button>
        <span id="badge-journee"></span>
        <button onclick="toggleTousPronos(this)" id="btn-toggle-tous-pronos" title="Ouvrir/fermer tous les pronos de la journée" class="journee-nav-btn">👥</button>
        <button onclick="toggleTousH2H(this)" id="btn-toggle-tous-h2h" title="Ouvrir/fermer tous les H2H de la journée" class="journee-nav-btn">⚔️</button>
        <button onclick="toggleTousForme(this)" id="btn-toggle-tous-forme" title="Ouvrir/fermer toutes les Formes de la journée" class="journee-nav-btn">📈</button>
      </div>
      <div style="background:var(--bg);text-align:center;margin-bottom:10px;line-height:1.7">
        <div style="font-size:.76rem;color:var(--txt2)" id="journee-dates"></div>
        <div style="font-size:.76rem;color:var(--txt2)" id="journee-stats"></div>
      </div>
      <div class="matches-grid" id="matches-grid">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <!-- Sous-onglet : Mes pronos -->
    <div id="sub-mes-pronos" class="hidden">
      <div class="section-title">Mon historique de pronostics</div>
      <div class="journee-nav-row" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:12px">
        <button onclick="changeJourneeMesPronos(-999)" title="Toutes les journées" class="journee-nav-btn">⏮</button>
        <button onclick="changeJourneeMesPronos(-1)" title="Journée précédente" class="journee-nav-btn">◀</button>
        <select id="select-journee-mes-pronos" onchange="allerJourneeMesPronos(this.value)" class="journee-nav-select"></select>
        <button onclick="changeJourneeMesPronos(1)" title="Journée suivante" class="journee-nav-btn">▶</button>
        <button onclick="changeJourneeMesPronos(999)" title="Dernière journée" class="journee-nav-btn">⏭</button>
      </div>
      <div id="mes-pronos-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <!-- Sous-onglet : Bonus (déplacé depuis l'ancien onglet principal Bonus) -->
    <div id="sub-bonus" class="hidden">
      <div id="bonus-info" class="note-info" style="display:none"></div>
      <div class="bonus-grid" id="bonus-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

  </div><!-- fin page-pronostics -->

  <!-- ══════════════ PAGE : CHAMPIONNAT ══════════════ -->
  <div id="page-championnat" class="hidden">

    <div id="sub-programme" class="hidden">
      <div class="section-title">Prochains matchs</div>
      <div class="filtre-programme">
        <button class="filtre-btn active" data-filtre="normal" onclick="changerFiltreProgramme('normal')">À venir</button>
        <button class="filtre-btn" data-filtre="retard" onclick="changerFiltreProgramme('retard')">⚠️ En retard</button>
        <button class="filtre-btn" data-filtre="tout" onclick="changerFiltreProgramme('tout')">Tout</button>
      </div>
      <div id="programme-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <div id="sub-resultats" class="hidden">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;
                  padding:10px 0 14px;border-bottom:1px solid var(--bord);margin-bottom:12px">
        <button onclick="changeJourneeResultats(-999)" class="journee-nav-btn" title="Première">⏮</button>
        <button onclick="changeJourneeResultats(-1)" class="journee-nav-btn" title="Précédente">◀</button>
        <select id="select-journee-resultats" onchange="allerJourneeResultats(this.value)"
          class="journee-nav-select"></select>
        <button onclick="changeJourneeResultats(1)" class="journee-nav-btn" title="Suivante">▶</button>
        <button onclick="changeJourneeResultats(999)" class="journee-nav-btn" title="Dernière">⏭</button>
      </div>
      <div id="resultats-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <div id="sub-grille" class="hidden">
      <div class="section-title">Grille complète</div>
      <div class="grille-wrapper" id="grille-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <!-- Sous-onglet Classement : regroupe les 7 vues (Général/Domicile/Extérieur/
         Attaque/Défense/Buteurs/Passeurs) derrière une seule entrée dans la barre
         principale, avec une mini-nav interne — même mécanique que le filtre de
         Programme. -->
    <div id="sub-classement">
      <div class="filtre-programme">
        <button class="filtre-btn active" data-vue="general"   onclick="changerVueClassement('general')">📊 Général</button>
        <button class="filtre-btn"        data-vue="domicile"  onclick="changerVueClassement('domicile')">🏠 Domicile</button>
        <button class="filtre-btn"        data-vue="exterieur" onclick="changerVueClassement('exterieur')">✈️ Extérieur</button>
        <button class="filtre-btn"        data-vue="attaque"   onclick="changerVueClassement('attaque')">🎯 Attaque</button>
        <button class="filtre-btn"        data-vue="defense"   onclick="changerVueClassement('defense')">🛡️ Défense</button>
        <button class="filtre-btn"        data-vue="buteurs"   onclick="changerVueClassement('buteurs')">⚽🎯 Buteurs &amp; Passeurs</button>
      </div>

      <div id="classement-legende" class="legende">
        <div class="legende-item"><div class="leg-dot" style="background:var(--ldc)"></div> Ligue des Champions</div>
        <div class="legende-item"><div class="leg-dot" style="background:var(--europa)"></div> Ligue Europa</div>
        <div class="legende-item"><div class="leg-dot" style="background:var(--conference)"></div> Ligue Conférence</div>
        <div class="legende-item"><div class="leg-dot" style="background:var(--barrage)"></div> Barrage L1-L2</div>
        <div class="legende-item"><div class="leg-dot" style="background:var(--relégation)"></div> Relégation</div>
      </div>

      <div id="vue-general">
        <div id="classement-general-contenu">
          <div class="loading"><div class="spinner"></div> Chargement…</div>
        </div>
      </div>

      <div id="vue-domicile" class="hidden">
        <div id="classement-domicile-contenu">
          <div class="loading"><div class="spinner"></div> Chargement…</div>
        </div>
      </div>

      <div id="vue-exterieur" class="hidden">
        <div id="classement-exterieur-contenu">
          <div class="loading"><div class="spinner"></div> Chargement…</div>
        </div>
      </div>

      <div id="vue-attaque" class="hidden">
        <div id="classement-attaque-contenu">
          <div class="loading"><div class="spinner"></div> Chargement…</div>
        </div>
      </div>

      <div id="vue-defense" class="hidden">
        <div id="classement-defense-contenu">
          <div class="loading"><div class="spinner"></div> Chargement…</div>
        </div>
      </div>

      <div id="vue-buteurs" class="hidden">
        <div class="buteurs-passeurs-grid">
          <div class="bp-col">
            <div class="bp-col-titre">⚽ Buteurs</div>
            <div id="buteurs-contenu">
              <div class="loading"><div class="spinner"></div> Chargement…</div>
            </div>
          </div>
          <div class="bp-col">
            <div class="bp-col-titre">🎯 Passeurs</div>
            <div id="passeurs-contenu">
              <div class="loading"><div class="spinner"></div> Chargement…</div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div><!-- fin page-championnat -->

  <!-- ══════════════ PAGE : JOUEURS ══════════════ -->
  <div id="page-joueurs" class="hidden">

    <div id="sub-classement-joueurs">
      <div class="bonus-toggle-wrap">
        <span class="bonus-toggle-label">Classement :</span>
        <button class="filtre-btn active" id="btn-avec-bonus" onclick="toggleBonusJoueurs(true)">🎁 Avec Bonus</button>
        <button class="filtre-btn" id="btn-sans-bonus" onclick="toggleBonusJoueurs(false)">🚫 Sans Bonus</button>
      </div>
      <div class="bonus-toggle-wrap">
        <span class="bonus-toggle-label">Barème :</span>
        <button class="filtre-btn active" id="btn-classique" onclick="toggleCotesJoueurs(false)">📋 Classique</button>
        <button class="filtre-btn" id="btn-avec-cotes" onclick="toggleCotesJoueurs(true)">📊 Avec cotes</button>
      </div>
      <div id="podium-contenu"></div>
      <div style="text-align:right;margin-bottom:2px">
        <button class="filtre-btn" onclick="ouvrirModalLegende()">ℹ️ Légende</button>
      </div>
      <div id="joueurs-table-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <div id="sub-par-journee" class="hidden">
      <div class="journee-header">
        <div class="journee-nav">
          <button onclick="changeJourneeJoueurs(-999)" title="Première journée">⏮</button>
          <button onclick="changeJourneeJoueurs(-1)" title="Précédente">◀</button>
          <select id="select-journee-joueurs" onchange="allerJourneeJoueurs(this.value)"
            style="background:var(--bg3);border:1px solid var(--bord);color:var(--txt);
                   border-radius:var(--radius-s);padding:4px 8px;font-size:.88rem;
                   font-weight:700;cursor:pointer;outline:none">
          </select>
          <button onclick="changeJourneeJoueurs(1)" title="Suivante">▶</button>
          <button onclick="changeJourneeJoueurs(999)" title="Dernière journée">⏭</button>
        </div>
      </div>
      <div id="joueurs-journee-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <div id="sub-evolution" class="hidden">
      <div id="evolution-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

    <div id="sub-stats" class="hidden">
      <div id="stats-parieurs-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>
    </div>

  </div><!-- fin page-joueurs -->

  <!-- ══════════════ PAGE : QUIZZ ══════════════ -->
  <div id="page-quizz" class="hidden">
    <div class="quizz-boutons-row" style="padding:6px 0;margin-bottom:28px">
      <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" style="font-size:.78rem;padding:6px 12px" onclick="afficherHistoriqueQuizz()">📜 Mon historique</button>
        <button class="btn btn-secondary" style="font-size:.78rem;padding:6px 12px" onclick="allerAuClassementQuizz()">📊 Aller au classement</button>
      </div>
      <div style="display:flex;justify-content:flex-start;margin-top:28px">
        <div class="mini-tampon-bonus" style="text-align:center" title="Bonus sans-faute : réponds juste à toutes les questions de la semaine">🎯 Bonus sans-faute<br><span id="tampon-bonus-pct">+50%</span></div>
      </div>
    </div>
    <div id="quizz-contenu">
      <div class="loading"><div class="spinner"></div> Chargement…</div>
    </div>

    <div id="quizz-classement-section" style="margin-top:20px">
      <div class="section-title">🏆 Classement quizz</div>
      <div id="quizz-podium-contenu" style="margin-bottom:12px"></div>
      <div id="quizz-classement-contenu">
        <div class="loading"><div class="spinner"></div> Chargement…</div>
      </div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-weight:600;font-size:.9rem">📊 Détail par type de quizz</summary>
        <div id="quizz-classement-detaille-contenu" style="margin-top:10px">
          <div class="loading"><div class="spinner"></div> Chargement…</div>
        </div>
      </details>
    </div>
  </div><!-- fin page-quizz -->

  <!-- ══════════════ PAGE : FAQ ══════════════ -->
  <div id="page-faq" class="hidden">
    <div class="section-title">❓ Aide & règles</div>
    <div class="bonus-toggle-wrap" style="margin-bottom:14px">
      <button class="filtre-btn active" id="btn-faq-courte" onclick="toggleVueFaq(false)">❓ FAQ courte</button>
      <button class="filtre-btn" id="btn-faq-guide" onclick="toggleVueFaq(true)">📖 Guide complet</button>
    </div>

    <div id="faq-accordion" style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px"></div>
    <div id="guide-complet-contenu" class="hidden" style="margin-bottom:20px"></div>

    <div class="section-title mt16">📄 Documents à télécharger</div>
    <p class="txt2" style="font-size:.84rem;margin-bottom:12px">Pour une version complète, hors-ligne ou imprimable.</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <a href="docs/guide_prono_l1.docx" download class="admin-card" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <span style="font-size:1.5rem">📘</span>
        <div style="flex:1">
          <div style="font-weight:600">Guide du joueur complet</div>
          <div class="txt2" style="font-size:.78rem">Toutes les règles en détail — format Word (.docx)</div>
        </div>
        <span class="txt2">⬇️</span>
      </a>
      <a href="docs/faq_prono_l1.pdf" download class="admin-card" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <span style="font-size:1.5rem">📕</span>
        <div style="flex:1">
          <div style="font-weight:600">FAQ courte</div>
          <div class="txt2" style="font-size:.78rem">Les mêmes questions ci-dessus, à imprimer — format PDF</div>
        </div>
        <span class="txt2">⬇️</span>
      </a>
      <a href="docs/guide_prono_l1.md" download class="admin-card" style="display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit">
        <span style="font-size:1.5rem">📝</span>
        <div style="flex:1">
          <div style="font-weight:600">Guide du joueur — version texte</div>
          <div class="txt2" style="font-size:.78rem">Le même contenu, format texte brut (.md)</div>
        </div>
        <span class="txt2">⬇️</span>
      </a>
    </div>
  </div><!-- fin page-faq -->

  <!-- ══════════════ PAGE : ADMIN ══════════════ -->
  <div id="page-admin" class="hidden">
    <div class="section-title">⚙️ Administration</div>

    <div class="admin-grid">
      <div class="admin-card">
        <div class="admin-card-title">🔄 Synchroniser les matchs</div>
        <p>Importe tous les matchs de la saison depuis API-Football.</p>
        <button class="btn btn-primary btn-full" onclick="adminSyncMatchs()">Synchroniser</button>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📅 Sync une journée</div>
        <p>Met à jour les scores d'une journée précise.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input type="number" id="admin-journee-input" class="input-field" min="1" max="34" placeholder="N° journée" style="width:120px">
          <button class="btn btn-primary" onclick="adminSyncJournee()">Sync</button>
        </div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🧮 Calculer les points</div>
        <p>Recalcule les points de tous les pronostics et reconstruit le classement des équipes.</p>
        <button class="btn btn-or btn-full" onclick="adminCalculerPoints()">Calculer</button>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📊 Sync stats</div>
        <p>Reconstruit les buteurs/passeurs/pénalties à partir des compositions match par match.</p>
        <button class="btn btn-secondary btn-full" onclick="adminSyncStats()">Synchroniser stats</button>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🔄 Resync stats d'une journée</div>
        <p>Force la resynchro des stats de match (buts, cartons, stats agrégées) pour tous les matchs terminés d'une journée en une fois, sans attendre que chaque joueur ouvre l'onglet Analyse de chaque match un par un. Les Tendances n'ont rien à resynchroniser : elles sont toujours calculées en direct.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input type="number" id="admin-journee-stats-input" class="input-field" min="1" max="34" placeholder="N° journée" style="width:120px">
          <button class="btn btn-primary" onclick="adminSyncJourneeStats()">Resynchroniser</button>
        </div>
        <div id="admin-journee-stats-resultat"></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🌍 Synchroniser les clubs</div>
        <p>Importe/actualise les 18 clubs de la saison sélectionnée depuis l'API-Football (noms, logos).</p>
        <button class="btn btn-secondary btn-full" onclick="adminSyncClubs()">Synchroniser les clubs</button>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">👕 Actualiser les effectifs</div>
        <p>Force une resynchro même si déjà en cache — utile pour suivre le mercato. Détecte et détaille les arrivées/départs.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <select id="admin-club-effectif-select" class="input-field" style="flex:1">
            <option value="">Tous les clubs</option>
          </select>
          <button class="btn btn-secondary" onclick="adminSyncEffectifs()">Actualiser</button>
        </div>
        <div id="admin-effectifs-resultat"></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🔧 Corriger un effectif manuellement</div>
        <p>À utiliser quand API-Football n'a pas encore mis à jour un transfert (mercato). Un joueur ajouté ou masqué ici n'est jamais écrasé par "Actualiser les effectifs" ci-dessus.</p>
        <select id="admin-correction-club-select" class="input-field" style="margin-bottom:8px" onchange="adminCorrectionClubChange()">
          <option value="">— Choisir un club —</option>
        </select>
        <div id="admin-correction-liste" style="margin-bottom:12px"></div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:8px">
            <input id="admin-correction-nom" class="input-field" placeholder="Nom" style="flex:2">
            <input id="admin-correction-prenom" class="input-field" placeholder="Prénom" style="flex:2">
          </div>
          <div style="display:flex;gap:8px">
            <select id="admin-correction-poste" class="input-field" style="flex:2">
              <option value="Gardien">Gardien</option>
              <option value="Défenseur">Défenseur</option>
              <option value="Milieu">Milieu</option>
              <option value="Attaquant">Attaquant</option>
            </select>
            <input id="admin-correction-numero" class="input-field" placeholder="N° (optionnel)" style="flex:1">
            <button class="btn btn-secondary" onclick="adminAjouterJoueurManuel()">Ajouter</button>
          </div>
        </div>
        <div id="admin-correction-msg" style="margin-top:6px"></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🔁 Synchroniser environnements</div>
        <p>Copie les tables de contenu (clubs, matchs, effectifs, pronostics…) d'un environnement vers l'autre. La table <strong>users</strong> n'est jamais touchée. Une sauvegarde horodatée de chaque table écrasée est conservée automatiquement.</p>
        <button class="btn btn-secondary btn-full" style="margin-bottom:8px" onclick="adminCopierProdVersTest()">Copier PROD → TEST</button>
        <button class="btn btn-full" style="background:var(--rouge);color:#fff" onclick="adminCopierTestVersProd()">⚠️ Copier TEST → PROD</button>
        <div id="admin-copie-resultat" style="margin-top:8px"></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🔍 Vérifier schéma TEST/PROD</div>
        <p>Compare les tables et colonnes des 2 bases (peu importe l'environnement d'où c'est lancé) et signale tout écart — utile après un déploiement pour vérifier qu'aucune migration SQL n'a été oubliée d'un côté.</p>
        <button class="btn btn-secondary btn-full" onclick="adminVerifierSchema()">Comparer les schémas</button>
        <div id="admin-schema-resultat" style="margin-top:8px"></div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🎓 Mode entraînement</div>
        <p>Ouvre quelques journées de la saison 2026-27 en avant-première pour que les joueurs se familiarisent avec l'appli, sans toucher à la vraie saison (clubs et matchs clonés sur une saison à part, avec de faux scores simulables à volonté).</p>
        <div id="admin-entrainement-contenu">Chargement…</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">🎯 Quizz hebdomadaire</div>
        <p>Génère automatiquement les questions pronostic de la prochaine journée sans quizz, à partir des matchs et statistiques déjà en base. Relis avant de publier.</p>
        <div id="admin-quizz-contenu">Chargement…</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-title">📢 Envoyer une annonce</div>
        <p>Un message libre (1-2 phrases) envoyé à tous les joueurs sur les canaux cochés — seuls les joueurs ayant eux-mêmes activé ce canal le reçoivent.</p>
        <textarea id="admin-annonce-texte" class="input-field" rows="3" placeholder="Ton message…" style="width:100%;resize:vertical;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-size:.86rem"><input type="checkbox" id="admin-annonce-push" checked> 🔔 Push</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:.86rem"><input type="checkbox" id="admin-annonce-email" checked> ✉️ Email</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:.86rem"><input type="checkbox" id="admin-annonce-telegram" checked> 📨 Telegram</label>
        </div>
        <button class="btn btn-primary btn-full" onclick="adminEnvoyerAnnonce()">Envoyer</button>
        <div id="admin-annonce-msg" style="margin-top:8px"></div>
        <div class="section-title" style="font-size:.9rem;margin-top:16px">Dernières annonces</div>
        <div id="admin-annonces-historique">Chargement…</div>
      </div>
    </div>

    <div id="admin-msg" style="margin-top:12px"></div>

    <div class="section-title">👥 Gestion des joueurs</div>
    <div id="admin-users-contenu">
      <div class="loading"><div class="spinner"></div> Chargement…</div>
    </div>

    <div class="section-title mt16">🏆 Valider les bonus de saison</div>
    <div id="admin-bonus-contenu">
      <div class="loading"><div class="spinner"></div> Chargement…</div>
    </div>

    
  </div><!-- fin page-admin -->

</main><!-- fin main -->

<!-- ============================================================
     PAGE LOGIN (affichée si non connecté)
     ============================================================ -->
<div id="page-login" class="login-overlay" style="display:none">
  <div class="login-card">

    <!-- Formulaire connexion -->
    <div id="form-connexion">
      <div class="login-header">
        <div class="login-logo-badge"><img src="logo-header-icone.png" alt="" class="login-logo-icone"><img src="logo-header-texte.png" alt="Prono L1" class="login-logo"></div>
        <div class="login-subtitle">Groupe privé entre amis</div>
      </div>
      <div class="form-group">
        <input type="email" id="login-email" class="login-input" placeholder="Votre email" autocomplete="email">
      </div>
      <div class="form-group" style="position:relative">
        <input type="password" id="login-mdp" class="login-input" placeholder="Votre mot de passe" autocomplete="current-password" style="padding-right:44px">
        <button type="button" onclick="toggleMdpVision('login-mdp', this)"
          style="position:absolute;right:12px;top:50%;transform:translateY(-60%);
                 background:none;border:none;cursor:pointer;color:#aab;font-size:1.1rem;
                 padding:4px;line-height:1">👁</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;font-size:.84rem;color:#555">
        <input type="checkbox" id="remember-me" checked
          style="width:16px;height:16px;cursor:pointer;accent-color:#0d6efd">
        <label for="remember-me" style="cursor:pointer;color:#444">Se souvenir de moi</label>
      </div>
      <button class="login-btn" onclick="connexion()">Se connecter</button>
      <div class="login-lien" style="margin-top:14px">
        <a href="#" onclick="showForm('oublie'); return false;" style="color:#666">Mot de passe oublié ?</a>
      </div>
      <div class="login-lien">
        Pas encore de compte ?
        <a href="#" onclick="showForm('inscription'); return false;">S'inscrire</a>
      </div>
      <div id="login-erreur" style="margin-top:10px"></div>
    </div>

    <!-- Formulaire inscription -->
    <div id="form-inscription" style="display:none">
      <div class="login-header">
        <div class="login-logo-badge"><img src="logo-header-icone.png" alt="" class="login-logo-icone"><img src="logo-header-texte.png" alt="Prono L1" class="login-logo"></div>
        <div class="login-subtitle">Créer un compte</div>
      </div>
      <div class="form-group">
        <input type="text" id="inscr-nom" class="login-input" placeholder="Votre nom complet">
      </div>
      <div class="form-group">
        <input type="email" id="inscr-email" class="login-input" placeholder="Votre email">
      </div>
      <div class="form-group">
        <div style="position:relative">
          <input type="password" id="inscr-mdp" class="login-input" placeholder="Mot de passe (6 car. min.)" style="padding-right:44px">
          <button type="button" onclick="toggleMdpVision('inscr-mdp', this)"
            style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                   background:none;border:none;cursor:pointer;color:#aab;font-size:1.1rem;
                   padding:4px;line-height:1">👁</button>
        </div>
      </div>
      <div class="form-group">
        <select id="inscr-equipe-coeur" class="login-input">
          <option value="">⭐ Équipe de cœur (optionnel)</option>
        </select>
      </div>
      <button class="login-btn" onclick="inscription()">Créer mon compte</button>
      <div style="text-align:center;margin-top:12px;font-size:.84rem">
        <a href="#" onclick="showForm('connexion'); return false;">← Retour connexion</a>
      </div>
      <div id="inscr-erreur" style="margin-top:10px"></div>
    </div>

    <!-- Formulaire mot de passe oublié -->
    <div id="form-oublie" style="display:none">
      <div class="login-header">
        <div class="login-logo-badge"><img src="logo-header-icone.png" alt="" class="login-logo-icone"><img src="logo-header-texte.png" alt="Prono L1" class="login-logo"></div>
        <div class="login-subtitle">Mot de passe oublié</div>
      </div>
      <p style="font-size:.84rem;color:#666;margin-bottom:14px;text-align:center">
        Entrez votre email — vous recevrez un lien valable 1 heure.
      </p>
      <div class="form-group">
        <input type="email" id="oublie-email" class="login-input" placeholder="Votre email">
      </div>
      <button class="login-btn" onclick="mdpOublie()">Envoyer le lien</button>
      <div style="text-align:center;margin-top:12px;font-size:.84rem">
        <a href="#" onclick="showForm('connexion'); return false;">← Retour connexion</a>
      </div>
      <div id="oublie-msg" style="margin-top:10px"></div>
    </div>

  </div>
</div>

<!-- ============================================================
     MODALS PROFIL
     ============================================================ -->

<!-- Modal changer pseudo -->
<!-- Modal règlement -->
<div class="modal-overlay hidden" id="modal-stats-header">
  <div class="modal">
    <div class="modal-title" id="hdr-stats-header">📊 Mes stats</div>
    <button class="modal-close" onclick="fermerModal('modal-stats-header')">✕</button>
    <div class="header-stats" id="header-stats">
      <div class="hstat" title="Ma position"><div class="hstat-val" id="stat-position">–</div><div class="hstat-lbl"><span class="hstat-icon">📍</span></div></div>
      <div class="hstat" title="Mes points"><div class="hstat-val" id="stat-points">–</div><div class="hstat-lbl"><span class="hstat-icon">⭐</span></div></div>
      <div class="hstat" title="Exacts"><div class="hstat-val" id="stat-exacts">–</div><div class="hstat-lbl"><span class="hstat-icon">🎯</span></div></div>
      <div class="hstat" title="Bons"><div class="hstat-val" id="stat-bons">–</div><div class="hstat-lbl"><span class="hstat-icon">✅</span></div></div>
      <div class="hstat" title="Écart"><div class="hstat-val" id="stat-ecart">–</div><div class="hstat-lbl"><span class="hstat-icon">↔️</span></div></div>
      <div class="hstat" title="Buts D"><div class="hstat-val" id="stat-buts-dom">–</div><div class="hstat-lbl"><span class="hstat-icon hstat-icon-combo"><span>🏠</span><span>⚽</span></span></div></div>
      <div class="hstat" title="Buts E"><div class="hstat-val" id="stat-buts-ext">–</div><div class="hstat-lbl"><span class="hstat-icon hstat-icon-combo"><span>✈️</span><span>⚽</span></span></div></div>
      <div class="hstat" title="Journées de champion"><div class="hstat-val" id="stat-champion">–</div><div class="hstat-lbl"><span class="hstat-icon">🏆</span></div></div>
      <div class="hstat" title="Pronos + Bonus"><div class="hstat-val" id="stat-pronos">–</div><div class="hstat-lbl"><span class="hstat-icon hstat-icon-combo"><span>📋</span><span>🎁</span></span></div></div>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="modal-reglement">
  <div class="modal">
    <div class="modal-title" id="hdr-reglement">📖 Règlement</div>
    <button class="modal-close" onclick="fermerModal('modal-reglement')">✕</button>
    <div class="reglement-contenu">
      <h4>⚽ Points par pronostic de match</h4>
      <ul id="reglement-bareme-contenu">
        <li>Chargement…</li>
      </ul>
      <h4>🏆 Pronostics bonus (saisonniers)</h4>
      <ul>
        <li><strong>Barème à définir</strong> — champion, meilleur buteur, meilleur passeur, meilleure attaque, meilleure défense, équipes reléguées, équipe de barrage, places européennes</li>
      </ul>
      <p class="txt2" style="font-size:.75rem;margin-top:-8px">Le barème définitif des bonus sera communiqué en cours de saison.</p>
      <h4>🎯 Quizz</h4>
      <ul id="reglement-quizz-contenu">
        <li>Chargement…</li>
      </ul>
      <div class="reglement-contact">
        <div style="margin-bottom:6px">📧 Contacter l'admin</div>
        <div class="contact-email-row">
          <code id="contact-email-texte">docdadi@free.fr</code>
          <button class="btn btn-secondary btn-sm" onclick="copierEmailAdmin()" id="btn-copier-email">Copier</button>
        </div>
        <a href="mailto:docdadi@free.fr?subject=Prono-L1%20-%20Contact" style="font-size:.78rem;display:inline-block;margin-top:6px">ou ouvrir directement mon appli mail</a>
      </div>
    </div>
  </div>
</div>

<div class="modal-overlay hidden" id="modal-pseudo">
  <div class="modal">
    <div class="modal-title" id="hdr-pseudo">✏️ Changer mon pseudo</div>
    <button class="modal-close" onclick="fermerModal('modal-pseudo')">✕</button>
    <div class="form-group">
      <label class="form-label">Nouveau pseudo</label>
      <input type="text" id="pseudo-nom" class="input-field" placeholder="Mon pseudo">
    </div>
    <div class="form-group">
      <label class="form-label">Initiales avatar (1-2 car.) — laisser vide pour auto</label>
      <input type="text" id="pseudo-initiales" class="input-field" placeholder="Ex: DD" maxlength="2" style="width:80px;text-transform:uppercase">
    </div>
    <button class="btn btn-primary btn-full" onclick="changerPseudo()">Enregistrer</button>
    <div id="pseudo-msg"></div>
    <div class="modal-profil-liens">
      <a href="#" onclick="fermerModal('modal-pseudo'); ouvrirModalEquipeCoeur(); return false;">⭐ Mon équipe de cœur</a>
      <a href="#" onclick="fermerModal('modal-pseudo'); ouvrirReglement(); return false;">ℹ️ Règles</a>
      <a href="#" onclick="fermerModal('modal-pseudo'); ouvrirModalMdp(); return false;">🔒 Changer mon mot de passe</a>
      <a href="#" onclick="fermerModal('modal-pseudo'); ouvrirModalNotifs(); return false;">🔔 Notifications</a>
      <a href="#" onclick="deconnexion(); return false;" class="txt-rouge">🚪 Déconnexion</a>
    </div>
  </div>
</div>

<!-- Modal légende des icônes (classement joueurs) -->
<div class="modal-overlay hidden" id="modal-legende-icones">
  <div class="modal">
    <div class="modal-title" id="hdr-legende-icones">ℹ️ Légende des icônes</div>
    <button class="modal-close" onclick="fermerModal('modal-legende-icones')">✕</button>
    <div class="legende-icones-liste">
      <div class="legende-icones-item"><span class="legende-icones-ico">📋</span> Pronostics joués</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">🎯</span> Scores exacts</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">✅</span> Bons résultats</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">↔️</span> Bonus : écart de buts juste</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">🏠⚽</span> Bonus : buts de l'équipe à domicile juste</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">✈️⚽</span> Bonus : buts de l'équipe à l'extérieur juste</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">🏆</span> Champion de la journée</div>
      <div class="legende-icones-item"><span class="legende-icones-ico">🎁</span> Total des points bonus</div>
    </div>
  </div>
</div>

<!-- Modal changer mot de passe -->
<div class="modal-overlay hidden" id="modal-mdp">
  <div class="modal">
    <div class="modal-title" id="hdr-mdp">🔒 Changer mon mot de passe</div>
    <button class="modal-close" onclick="fermerModal('modal-mdp')">✕</button>
    <div class="form-group">
      <label class="form-label">Ancien mot de passe</label>
      <div style="position:relative">
        <input type="password" id="mdp-ancien" class="input-field" placeholder="••••••••" style="padding-right:44px">
        <button type="button" onclick="toggleMdpVision('mdp-ancien', this)"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                 background:none;border:none;cursor:pointer;color:#aab;font-size:1.1rem;
                 padding:4px;line-height:1">👁</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nouveau mot de passe</label>
      <div style="position:relative">
        <input type="password" id="mdp-nouveau" class="input-field" placeholder="••••••••" style="padding-right:44px">
        <button type="button" onclick="toggleMdpVision('mdp-nouveau', this)"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                 background:none;border:none;cursor:pointer;color:#aab;font-size:1.1rem;
                 padding:4px;line-height:1">👁</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Confirmer</label>
      <div style="position:relative">
        <input type="password" id="mdp-confirm" class="input-field" placeholder="••••••••" style="padding-right:44px">
        <button type="button" onclick="toggleMdpVision('mdp-confirm', this)"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                 background:none;border:none;cursor:pointer;color:#aab;font-size:1.1rem;
                 padding:4px;line-height:1">👁</button>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="changerMdp()">Changer</button>
    <div id="mdp-msg"></div>
  </div>
</div>

<!-- Modal notifications -->
<div class="modal-overlay hidden" id="modal-notifs">
  <div class="modal">
    <div class="modal-title" id="hdr-notifs">🔔 Mes notifications</div>
    <button class="modal-close" onclick="fermerModal('modal-notifs')">✕</button>
    <div id="notifs-contenu">
      <div class="loading"><div class="spinner"></div></div>
    </div>
  </div>
</div>

<!-- Modal équipe de cœur -->
<div class="modal-overlay hidden" id="modal-equipe-coeur">
  <div class="modal">
    <div class="modal-title" id="hdr-coeur">⭐ Mon équipe de cœur</div>
    <button class="modal-close" onclick="fermerModal('modal-equipe-coeur')">✕</button>
    <div class="form-group">
      <label class="form-label">Choisir un club (facultatif)</label>
      <select id="coeur-club" class="input-field">
        <option value="">Aucune préférence</option>
      </select>
    </div>
    <button class="btn btn-primary btn-full" onclick="changerEquipeCoeur()">Enregistrer</button>
    <div id="coeur-msg"></div>
  </div>
</div>

<!-- Modal classement (depuis une carte match) -->
<div class="modal-overlay hidden" id="modal-classement-match">
  <div class="modal">
    <div class="modal-title" id="hdr-classement-match">🏆 Classement</div>
    <button class="modal-close" onclick="fermerModal('modal-classement-match')">✕</button>
    <div id="modal-classement-match-contenu">
      <div class="loading"><div class="spinner"></div></div>
    </div>
  </div>
</div>

<!-- Modal composition d'équipe (11 titulaires + remplaçants) -->
<div class="modal-overlay hidden" id="modal-composition">
  <div class="modal modal-composition-box">
    <div class="modal-title" id="hdr-composition"><svg width="1em" height="1em" viewBox="0 0 64 64" style="vertical-align:-0.15em" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="20" r="8" fill="#93C5FD"/><path d="M3 52 Q3 35 14 35 Q25 35 25 52 Z" fill="#93C5FD"/><circle cx="50" cy="20" r="8" fill="#93C5FD"/><path d="M39 52 Q39 35 50 35 Q61 35 61 52 Z" fill="#93C5FD"/><circle cx="32" cy="15" r="10" fill="#1a4a8a"/><path d="M17 54 Q17 31 32 31 Q47 31 47 54 Z" fill="#1a4a8a"/></svg> Composition</div>
    <button class="modal-close" id="btn-effectif-compo" style="left:16px;right:auto;top:16px;font-size:1.05rem" title="Voir l'effectif complet" onclick="ouvrirEffectifDepuisComposition()">👥</button>
    <button class="modal-close" onclick="fermerModal('modal-composition')">✕</button>
    <div id="modal-composition-contenu">
      <div class="loading"><div class="spinner"></div></div>
    </div>
  </div>
</div>

<!-- Modal fiche club -->
<div class="modal-overlay hidden" id="modal-club">
  <div class="modal" style="max-width:600px">
    <button class="modal-close" onclick="fermerModal('modal-club')">✕</button>
    <div id="modal-club-contenu">
      <div class="loading"><div class="spinner"></div></div>
    </div>
  </div>
</div>

<!-- ============================================================
     SCRIPT PRINCIPAL
     ============================================================ -->
<!-- Changer la lettre du ?v= de la ligne juste en dessous quand on modifie app.js -->
<script src="app.js?v=20260826a"></script>

</body>
</html>
