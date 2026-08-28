// ============================================================
//  PRONO-L1 — Application frontend principale
//  app.js — SPA vanilla JS
// ============================================================

// ── CONFIGURATION ──
const API = 'api';  // chemin relatif vers le dossier api/
const APP_VERSION = '20260828b'; // ⚠️ à garder synchronisé avec api/version.php et le ?v= de index.php

// Clé publique VAPID pour les notifications push (la clé privée reste
// côté serveur dans config.php — celle-ci est publique par nature,
// aucun risque à l'avoir en clair ici)
const VAPID_PUBLIC_KEY = 'BL9abjVC8saChotMw8X-TtGZNlwNJaBLgu3sf2_y3kEi0tqZP03CNvek_syXzEL3Fj6C0xDYxURcNhnrmydqVF4';

// Icône "Compos" (item 42) — petite équipe de joueurs stylisée, remplace
// l'emoji 🧩 utilisé auparavant. SVG maison (pas d'image externe à gérer),
// coloré en bleu pour rester cohérent avec la charte de l'appli.
const ICON_COMPOS = '<svg width="1em" height="1em" viewBox="0 0 64 64" style="vertical-align:-0.15em" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="14" cy="20" r="8" fill="#93C5FD"/><path d="M3 52 Q3 35 14 35 Q25 35 25 52 Z" fill="#93C5FD"/>' +
  '<circle cx="50" cy="20" r="8" fill="#93C5FD"/><path d="M39 52 Q39 35 50 35 Q61 35 61 52 Z" fill="#93C5FD"/>' +
  '<circle cx="32" cy="15" r="10" fill="#1a4a8a"/><path d="M17 54 Q17 31 32 31 Q47 31 47 54 Z" fill="#1a4a8a"/>' +
  '</svg>';

// Style des boutons +/- à côté des champs de score de pronostic (item ~45,
// ajouté pour faciliter la saisie au tactile — taper +/- est plus rapide et
// plus fiable que le clavier numérique du téléphone sur un petit champ).
// Taille pilotée par la classe CSS .score-stepper-btn (voir style.css) :
// taille normale sur PC, un peu plus grande sur mobile via media query
// (nécessite une classe plutôt qu'un style en ligne pour varier selon l'écran).

// ── ÉTAT GLOBAL ──
let token       = null;
let userInfo    = null;
let cacheClubs  = null; // liste des clubs de la saison, chargée une fois
let cacheClubsSaisonId = undefined; // saison pour laquelle cacheClubs a été rempli
let cacheRangs = null; // { club_id: rang } du classement actuel, chargé une fois
let cacheRangsSaisonId = undefined; // saison pour laquelle cacheRangs a été rempli
let journeeCourante     = 1;
let journeeResultats    = 1;
let journeeJoueurs      = 1;
let journeeMesPronos    = null; // null = "Toutes les journées" (vue historique complète par défaut)
let nbJournees          = 34;
// Passe à true une fois initialiserSaisons() terminé au démarrage — permet
// à showPage() de savoir s'il peut appeler chargerProchaineJournee() sans
// risquer un appel prématuré (saison pas encore connue, cf. initialiserApp)
let appPreteNavigation  = false;

// ── NAVIGATION — config sous-onglets ──
const SUBTABS = {
  pronostics: [
    { id: 'journee',      label: '📅 Journée' },
    { id: 'mes-pronos',   label: '📋 Mes pronos' },
    { id: 'bonus',        label: '⭐ Bonus' },
  ],
  championnat: [
    { id: 'classement',   label: '📊 Classement' },
    { id: 'programme',    label: '📅 Programme' },
    { id: 'resultats',    label: '📋 Résultats' },
    { id: 'grille',       label: '📐 Grille' },
  ],
  joueurs: [
    { id: 'classement-joueurs', label: '🏆 Classement général' },
    { id: 'par-journee',        label: '📅 Par journée' },
    { id: 'evolution',          label: '📈 Évolution' },
    { id: 'stats',              label: '🎯 Stats' },
  ],
  admin:  [],
};

// ============================================================
//  GESTION BOUTON RETOUR (Android / navigateur)
//  Principe (repris du mécanisme éprouvé de CDM 2026) : chaque clic
//  sur un onglet empile la page et crée une VRAIE entrée d'historique
//  liée à un geste utilisateur réel. Retour dépile un cran (ferme une
//  modale ouverte, sinon revient à la page précédente). Seule
//  exception : une fois à l'accueil sans plus rien à dépiler, on
//  recrée UNE SEULE entrée tampon (pas à chaque appui, pour ne pas
//  déclencher la protection anti-piège des navigateurs récents) afin
//  d'afficher "Appuyez de nouveau pour quitter" ; un 2e appui dans
//  les 2 secondes laisse l'appli se fermer normalement.
// ============================================================
const PAGE_PAR_DEFAUT = 'pronostics';
let pageActive               = PAGE_PAR_DEFAUT;
let pileNavigation           = [PAGE_PAR_DEFAUT]; // pages visitées, la dernière = page courante
let pileModalesOuvertes      = [];   // ids des modales actuellement ouvertes
let retourEnCours            = false; // évite de re-empiler pendant qu'on traite un popstate
let dernierRetourAccueil     = 0;    // horodatage du dernier appui Retour à l'accueil (debounce 2s)

function initialiserGestionRetour() {
  pileNavigation = [PAGE_PAR_DEFAUT];
  pileModalesOuvertes = [];
  history.replaceState({ marqueur: 'appli', page: PAGE_PAR_DEFAUT }, '', location.pathname);
  // Un seul cran tampon supplémentaire (pas répété à chaque appui) pour
  // intercepter le tout 1er Retour même sans navigation préalable —
  // notamment en PWA installée, où rien n'existe avant la page de départ.
  history.pushState({ marqueur: 'appli', page: PAGE_PAR_DEFAUT }, '', location.pathname);
  window.addEventListener('popstate', gererBoutonRetour);
}

// À appeler à chaque ouverture de modale (en plus de classList.remove('hidden'))
// Toujours appelée depuis un vrai clic utilisateur → entrée d'historique fiable.
function enregistrerOuvertureModale(id) {
  if (!pileModalesOuvertes.includes(id)) pileModalesOuvertes.push(id);
  if (!retourEnCours) history.pushState({ marqueur: 'appli', modale: id }, '', location.pathname);
}

// À appeler à chaque fermeture de modale, quel que soit le moyen (croix, clic dehors, retour)
function enregistrerFermetureModale(id) {
  pileModalesOuvertes = pileModalesOuvertes.filter(m => m !== id);
}

function gererBoutonRetour() {
  retourEnCours = true;

  // 1) Une modale est ouverte → on ferme la plus récente
  if (pileModalesOuvertes.length > 0) {
    const id = pileModalesOuvertes[pileModalesOuvertes.length - 1];
    if (id === 'modal-nouveautes') fermerModalNouveautes();
    else fermerModal(id);
    retourEnCours = false;
    return;
  }

  // 2) Il y a un historique de pages → on revient d'un cran
  if (pileNavigation.length > 1) {
    pileNavigation.pop();
    const page = pileNavigation[pileNavigation.length - 1];
    const btn = document.querySelector(`#main-nav button[onclick*="'${page}'"]`);
    showPage(page, btn);
    retourEnCours = false;
    return;
  }

  // 3) Page d'accueil, rien à dépiler → confirmation avant de quitter,
  //    en ne recréant l'entrée tampon qu'une seule fois (pas à chaque appui)
  const maintenant = Date.now();
  if (maintenant - dernierRetourAccueil < 2000) {
    // 2e appui rapproché → on laisse l'appli/le navigateur se fermer réellement
    retourEnCours = false;
    return;
  }
  dernierRetourAccueil = maintenant;
  history.pushState({ marqueur: 'appli', page: PAGE_PAR_DEFAUT }, '', location.pathname);
  afficherToast('Appuyez de nouveau sur Retour pour quitter');
  retourEnCours = false;
}

// ============================================================
//  INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Enregistrement du Service Worker (installabilité PWA + notifications
  // push). Manquait jusqu'ici : sw.js existait sur le serveur mais rien
  // ne demandait au navigateur de l'installer, donc navigator.serviceWorker.ready
  // ne se résolvait jamais (découvert le 23/07/2026 en testant le push).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('Échec enregistrement Service Worker :', err);
    });
  }

  // Barre de navigation (Pronos/Matchs · Podium · Championnat...) collante
  // juste sous le header. Le header n'a pas une hauteur fixe (compte à
  // rebours, badge saison entraînement, etc. peuvent apparaître/disparaître),
  // donc on mesure sa hauteur réelle en continu plutôt que de figer une
  // valeur en CSS, et on la pousse dans une variable CSS utilisée par le
  // "top" du nav en position sticky.
  const headerEl = document.querySelector('header');
  if (headerEl && window.ResizeObserver) {
    const majHauteurHeader = () => {
      // getBoundingClientRect (sous-pixel) plutôt qu'offsetHeight (arrondi
      // à l'entier) — évite un résidu de 1-2px selon la densité d'écran
      document.documentElement.style.setProperty('--header-dynamic-h', headerEl.getBoundingClientRect().height + 'px');
    };
    new ResizeObserver(majHauteurHeader).observe(headerEl);
    majHauteurHeader();
  }

  // Idem pour le menu principal : sur mobile, les boutons passent en
  // icône-au-dessus-du-texte (voir media query nav#main-nav), ce qui le
  // rend plus haut que la valeur fixe --nav-h (46px, correcte seulement
  // sur PC) — sans cette mesure réelle, la navigation de journée sticky
  // se cale sur une hauteur de menu erronée et laisse un espace vide
  // visible pendant le scroll sur mobile.
  const navEl = document.getElementById('main-nav');
  if (navEl && window.ResizeObserver) {
    const majHauteurNav = () => {
      document.documentElement.style.setProperty('--nav-dynamic-h', navEl.getBoundingClientRect().height + 'px');
    };
    new ResizeObserver(majHauteurNav).observe(navEl);
    majHauteurNav();
  }

  // Filigrane "VERSION DE TEST" — uniquement sur les domaines contenant "-test"
  if (window.location.hostname.includes('-test')) {
    const filigrane = document.createElement('div');
    filigrane.id = 'filigrane-test';
    // Grille de mentions répétées façon filigrane (10x6, largement de quoi couvrir tout écran)
    for (let i = 0; i < 60; i++) {
      const span = document.createElement('span');
      span.textContent = 'VERSION DE TEST';
      filigrane.appendChild(span);
    }
    document.body.appendChild(filigrane);
  }

  // Restaurer le thème
  const theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = theme;
  document.getElementById('btn-theme-emoji').textContent = theme === 'dark' ? '☀️' : '🌙';
  const texte = document.querySelector('#btn-theme .btn-theme-texte');
  if (texte) texte.textContent = theme === 'dark' ? ' Mode clair' : ' Mode sombre';

  // Restaurer le token
  token = localStorage.getItem('token') || sessionStorage.getItem('token');

  if (token) {
    verifierToken();
  } else {
    afficherLogin();
  }

  // Vérifier si lien de reset dans l'URL
  const hash = window.location.hash;
  if (hash.startsWith('#reset=')) {
    const resetToken = hash.replace('#reset=', '');
    afficherFormReset(resetToken);
  }
  if (hash.startsWith('#confirmer=')) {
    const confirmToken = hash.replace('#confirmer=', '');
    confirmerEmail(confirmToken);
  }

  // Préparer le select équipe de cœur du formulaire d'inscription
  // (accessible avant connexion, endpoint public)
  peuplerSelectClubs(document.getElementById('inscr-equipe-coeur'), null, true);
});

// ============================================================
//  THÈME
// ============================================================
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  document.getElementById('btn-theme-emoji').textContent = isDark ? '🌙' : '☀️';
  const texte = document.querySelector('#btn-theme .btn-theme-texte');
  if (texte) texte.textContent = isDark ? ' Mode sombre' : ' Mode clair';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// ============================================================
//  AUTHENTIFICATION
// ============================================================
function afficherLogin() {
  document.getElementById('page-login').style.display = 'flex';
}

function cacherLogin() {
  document.getElementById('page-login').style.display = 'none';
}

function showForm(nom) {
  ['connexion', 'inscription', 'oublie'].forEach(f => {
    document.getElementById('form-' + f).style.display = f === nom ? 'block' : 'none';
  });
  ['login-erreur','inscr-erreur','oublie-msg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

async function connexion() {
  const email = document.getElementById('login-email').value.trim();
  const mdp   = document.getElementById('login-mdp').value;
  const souvenir = document.getElementById('remember-me').checked;
  const errDiv = document.getElementById('login-erreur');

  if (!email || !mdp) { errDiv.innerHTML = msgErreur('Email et mot de passe requis'); return; }

  try {
    const data = await apiPost('auth.php?action=connexion', { email, mot_de_passe: mdp });
    const storage = souvenir ? localStorage : sessionStorage;
    storage.setItem('token', data.token);
    token    = data.token;
    userInfo = data.user;
    cacherLogin();
    initialiserApp();
  } catch (e) {
    errDiv.innerHTML = msgErreur(e.message);
  }
}

async function inscription() {
  const nom   = document.getElementById('inscr-nom').value.trim();
  const email = document.getElementById('inscr-email').value.trim();
  const mdp   = document.getElementById('inscr-mdp').value;
  const equipe_coeur_id = document.getElementById('inscr-equipe-coeur').value || null;
  const errDiv = document.getElementById('inscr-erreur');

  if (!nom || !email || !mdp) { errDiv.innerHTML = msgErreur('Tous les champs sont requis'); return; }

  try {
    await apiPost('auth.php?action=inscription', { nom, email, mot_de_passe: mdp, equipe_coeur_id });
    errDiv.innerHTML = msgOk('Compte créé ! Vérifiez votre boîte mail (et vos spams) et cliquez sur le lien reçu pour activer votre compte.');
    setTimeout(() => {
      showForm('connexion');
      // Éviter toute ancienne saisie / suggestion du navigateur qui ne
      // correspondrait pas au compte qui vient d'être créé
      document.getElementById('login-email').value = email;
      document.getElementById('login-mdp').value = '';
    }, 3000);
  } catch (e) {
    errDiv.innerHTML = msgErreur(e.message);
  }
}

async function mdpOublie() {
  const email  = document.getElementById('oublie-email').value.trim();
  const msgDiv = document.getElementById('oublie-msg');
  if (!email) { msgDiv.innerHTML = msgErreur('Email requis'); return; }

  try {
    await apiPost('users.php?action=mot_de_passe_oublie', { email });
    msgDiv.innerHTML = msgOk('Si cet email existe, un lien vous a été envoyé.');
  } catch (e) {
    msgDiv.innerHTML = msgErreur(e.message);
  }
}

// ── Confirmation d'email (lien reçu par mail après inscription) ──
async function confirmerEmail(confirmToken) {
  window.location.hash = ''; // nettoyer l'URL tout de suite
  try {
    const data = await apiGet(`users.php?action=confirmer_email&token=${confirmToken}`);
    afficherToast(data.message || 'Email confirmé ! Vous pouvez retourner à l\'application.');
  } catch (e) {
    afficherToast('Lien de confirmation invalide ou déjà utilisé.');
  }
}

function afficherToast(texte, icone) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:var(--vert);color:#fff;padding:14px 24px;border-radius:10px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:90%;text-align:center;font-size:.92rem;';
  toast.textContent = (icone || '✅') + ' ' + texte;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function afficherFormReset(resetToken) {
  afficherLogin();
  document.getElementById('form-connexion').innerHTML = `
    <div class="login-header">
      <img src="logo_l1.png" alt="PronoLigue 1" class="login-logo">
      <div class="login-subtitle">Nouveau mot de passe</div>
    </div>
    <div class="form-group">
      <label class="form-label">Nouveau mot de passe</label>
      <div style="position:relative">
        <input type="password" id="reset-mdp" class="input-field" placeholder="••••••••" style="padding-right:44px">
        <button type="button" onclick="toggleMdpVision('reset-mdp', this)"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                 background:none;border:none;cursor:pointer;color:#aab;font-size:1.1rem;
                 padding:4px;line-height:1">👁</button>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="reinitialiserMdp('${resetToken}')">
      Enregistrer
    </button>
    <div style="text-align:center;margin-top:12px;font-size:.84rem">
      <a href="#" id="lien-annuler-reset">← Retour connexion</a>
    </div>
    <div id="reset-msg"></div>
  `;
  // Même remarque que dans reinitialiserMdp() : le contenu de #form-connexion
  // a été remplacé, donc un vrai rechargement est nécessaire pour retrouver
  // le formulaire de connexion d'origine.
  document.getElementById('lien-annuler-reset').onclick = (e) => {
    e.preventDefault();
    window.location.hash = '';
    window.location.reload();
  };
}

async function reinitialiserMdp(resetToken) {
  const mdp    = document.getElementById('reset-mdp').value;
  const msgDiv = document.getElementById('reset-msg');
  if (!mdp) { msgDiv.innerHTML = msgErreur('Mot de passe requis'); return; }

  try {
    await apiPost('users.php?action=reinitialiser', { token: resetToken, mot_de_passe: mdp });
    // showForm('connexion') ne suffit pas ici : afficherFormReset() a remplacé
    // le contenu HTML de #form-connexion par le formulaire de reset, donc
    // "afficher le formulaire connexion" réaffichait en fait toujours ce même
    // contenu. Un vrai rechargement est nécessaire pour retrouver le
    // formulaire de connexion d'origine — au clic du joueur plutôt
    // qu'automatique, pour qu'il garde la main sur le moment.
    msgDiv.innerHTML = msgOk('Mot de passe modifié !') +
      `<div style="text-align:center;margin-top:12px;font-size:.84rem">
        <a href="#" id="lien-retour-connexion">→ Aller à la connexion</a>
      </div>`;
    document.getElementById('lien-retour-connexion').onclick = (e) => {
      e.preventDefault();
      window.location.hash = '';
      window.location.reload();
    };
  } catch (e) {
    msgDiv.innerHTML = msgErreur(e.message);
  }
}

async function verifierToken() {
  try {
    await apiGet('auth.php?action=verifier_token');
    // Récupérer les infos utilisateur
    const data = await apiGet('users.php?action=profil');
    userInfo = data.user;
    initialiserApp();
  } catch (e) {
    token = null;
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    afficherLogin();
  }
}

function deconnexion() {
  if (token) {
    // Ne bloque pas la déconnexion si ça échoue (ex: déjà hors ligne) —
    // le nettoyage local ci-dessous suffit à déconnecter l'utilisateur
    // de CE navigateur dans tous les cas
    apiPost('auth.php?action=deconnexion', {}).catch(() => {});
  }
  token    = null;
  userInfo = null;
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  afficherLogin();
  showForm('connexion');
}

// ============================================================
//  INITIALISATION APRÈS CONNEXION
// ============================================================
function initialiserApp() {
  // Mettre à jour l'avatar et le header
  const av = document.getElementById('avatar');
  av.textContent = userInfo.initiales;
  document.getElementById('avatar-wrap').style.display = 'flex';

  // Afficher Admin si admin
  if (userInfo.is_admin) {
    document.getElementById('nav-admin').style.display = 'flex';
  }

  // Initialiser les selects de journée
  initialiserSelectJournees();
  initialiserSelectJourneeMesPronos();

  // Générer le sous-menu (Journée / Mes pronos / Bonus) de la page de
  // démarrage. showPage() est normalement déclenché par un clic sur un
  // bouton du menu principal — au tout premier affichage après connexion,
  // aucun clic n'a encore eu lieu, donc <div id="subtabs"> restait vide
  // jusqu'à ce que l'utilisateur change d'onglet puis revienne sur
  // Pronos/Matchs (bug constaté sur mobile, notamment en PWA).
  const btnPageDepart = document.querySelector(`#main-nav button.active`)
    || document.querySelector(`#main-nav button[onclick*="'${PAGE_PAR_DEFAUT}'"]`);
  showPage(PAGE_PAR_DEFAUT, btnPageDepart);

  // Charger la liste des saisons AVANT les matchs (pour savoir si on est
  // en lecture seule), puis afficher la page pronostics.
  // chargerStatsHeader() doit attendre ici aussi : appelée trop tôt,
  // saisonSelectionnee vaut encore null et les stats du header ignorent
  // la saison choisie (toujours celle "en cours" par défaut).
  initialiserSaisons().then(() => {
    chargerProchaineJournee();
    chargerStatsHeader();
    appPreteNavigation = true;
  });

  // Gestion du bouton Retour (Android/navigateur) : une seule fois
  if (!window._gestionRetourDemarree) {
    window._gestionRetourDemarree = true;
    initialiserGestionRetour();
  }

  // Numéro de version dans le header + notification de nouveautés
  // (appelé ici, après confirmation de connexion, pour ne jamais
  // s'afficher par-dessus l'écran de login sur une connexion lente)
  injecterVersionHeader();
  verifierVersionServeur();
  if (!window._versionIntervalDemarre) {
    window._versionIntervalDemarre = true;
    setInterval(verifierVersionServeur, 5 * 60 * 1000);
  }

  // Bannière de rappel quizz hebdomadaire (une seule fois par quizz, sauf clic "Jouer")
  // + vérification périodique (pastille nav) pour un joueur qui reste sur un
  // onglet ouvert sans jamais recharger : sinon il ne verrait jamais qu'un
  // nouveau quizz vient d'être publié pendant qu'il navigue dans l'appli
  verifierBanniereQuizz();
  if (!window._quizzIntervalDemarre) {
    window._quizzIntervalDemarre = true;
    setInterval(verifierBanniereQuizz, 5 * 60 * 1000);
  }

  // Compte à rebours dans le header (item 35) — les stats sont chargées
  // plus haut, une fois la saison sélectionnée connue (voir initialiserSaisons)
  if (!window._compteReboursDemarre) {
    window._compteReboursDemarre = true;
    demarrerCompteRebours();
  }
}

// ============================================================
//  LIGNE DE STATS DU HEADER (item 35)
// ============================================================
async function chargerStatsHeader() {
  try {
    const data = await apiGet('classement.php?action=joueurs');
    const classement = data.classement || [];
    const moi = classement.find(j => j.id == userInfo.id);
    let nbPronos = 0;

    if (moi) {
      const groupe   = classement.filter(j => j.rang === moi.rang);
      const suffixe  = groupe.length > 1 ? 'ex' : 'e';
      nbPronos = moi.nb_pronos || 0;
      const positionTxt = moi.rang + suffixe;
      const pointsTxt   = moi.pts_total + ' pts';

      document.getElementById('stat-position').textContent = positionTxt;
      document.getElementById('stat-points').textContent   = pointsTxt;
      document.getElementById('stat-exacts').textContent   = moi.nb_exacts;
      document.getElementById('stat-bons').textContent     = moi.nb_bons;
      document.getElementById('stat-ecart').textContent    = moi.nb_ecart;
      document.getElementById('stat-buts-dom').textContent = moi.nb_buts_dom;
      document.getElementById('stat-buts-ext').textContent = moi.nb_buts_ext;
      document.getElementById('stat-champion').textContent = moi.nb_champion_journee;

      // Résumé compact affiché directement dans le header (mobile)
      document.getElementById('stat-position-mini').textContent = positionTxt;
      document.getElementById('stat-points-mini').textContent   = pointsTxt;

      // Ligne complète affichée directement dans le header (PC/desktop)
      document.getElementById('stat-position-lg').textContent = positionTxt;
      document.getElementById('stat-points-lg').textContent   = pointsTxt;
      document.getElementById('stat-exacts-lg').textContent   = moi.nb_exacts;
      document.getElementById('stat-bons-lg').textContent     = moi.nb_bons;
      document.getElementById('stat-ecart-lg').textContent    = moi.nb_ecart;
      document.getElementById('stat-buts-dom-lg').textContent = moi.nb_buts_dom;
      document.getElementById('stat-buts-ext-lg').textContent = moi.nb_buts_ext;
      document.getElementById('stat-champion-lg').textContent = moi.nb_champion_journee;
    }

    const dataBonus = await apiGet('bonus.php?action=mes_bonus');
    const nbBonus = (dataBonus.bonus || []).length;
    document.getElementById('stat-pronos').textContent = nbPronos + '+' + nbBonus;
    document.getElementById('stat-pronos-lg').textContent = nbPronos + '+' + nbBonus;
  } catch (e) {
    console.warn('Erreur stats header:', e.message);
  }
}

// Ouvre la modale de détail des stats perso, depuis le résumé compact du header
function ouvrirDetailStatsHeader() {
  document.getElementById('modal-stats-header').classList.remove('hidden');
  enregistrerOuvertureModale('modal-stats-header');
  requestAnimationFrame(() => activerDrag('modal-stats-header', 'hdr-stats-header'));
}

// ============================================================
//  COMPTE À REBOURS avant le coup d'envoi (item 35)
//  Coup d'envoi J1 Ligue 1 2026-27 : vendredi 21 août 2026, 20h45
//  heure de Paris (UTC+2 l'été) = 18h45 UTC.
//  ⚠️ Le calendrier chargé en base n'est pas encore à jour au moment
//  de cet ajout — si la date officielle change, mettre à jour la
//  constante CIBLE_COUP_ENVOI ci-dessous.
// ============================================================
function demarrerCompteRebours() {
  const cible = new Date('2026-08-21T18:45:00Z');
  const el = document.getElementById('compte-rebours');
  if (!el) return;

  function majCompte() {
    const diff = cible - new Date();
    if (diff <= 0) {
      el.innerHTML = '⚽ La Ligue 1 a commencé !';
      return;
    }
    const j = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const bloc = (v, lbl) => `<span class="cr-bloc"><span class="cr-val">${v}</span><span class="cr-lbl">${lbl}</span></span>`;
    el.innerHTML = `<span class="cr-titre">⚽ Coup d'envoi dans</span>${bloc(j, 'j')}${bloc(h, 'h')}${bloc(m, 'min')}${bloc(s, 's')}`;
  }

  majCompte();
  setInterval(majCompte, 1000);
}

// ============================================================
//  NAVIGATION PRINCIPALE
// ============================================================
function showPage(page, btnEl) {
  pageActive = page;
  if (!retourEnCours && pileNavigation[pileNavigation.length - 1] !== page) {
    pileNavigation.push(page);
    history.pushState({ marqueur: 'appli', page }, '', location.pathname);
  }

  // Activer le bon bouton nav
  document.querySelectorAll('#main-nav button').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Cacher toutes les pages
  document.querySelectorAll('main > div[id^="page-"]').forEach(d => d.classList.add('hidden'));
  document.getElementById('page-' + page).classList.remove('hidden');

  // Générer les sous-onglets
  const tabs = SUBTABS[page] || [];
  const subtabsEl = document.getElementById('subtabs');
  subtabsEl.innerHTML = '';

  if (tabs.length > 0) {
    tabs.forEach((t, i) => {
      const b = document.createElement('button');
      b.textContent = t.label;
      if (i === 0) b.classList.add('active');
      b.onclick = () => showSub(page, t.id, b);
      subtabsEl.appendChild(b);
    });
    showSub(page, tabs[0].id, subtabsEl.querySelector('button'));
  }

  // Charger les données selon la page
  switch (page) {
    // Retour sur Pronos/Matchs depuis un autre menu : on se repositionne
    // sur la prochaine journée à venir (au lieu de garder la dernière
    // journée consultée). Le drapeau appPreteNavigation évite un appel
    // prématuré lors du tout premier affichage de l'appli, avant que
    // initialiserSaisons() n'ait déterminé la saison active.
    case 'pronostics':   if (appPreteNavigation) chargerProchaineJournee(); break;
    case 'championnat':  chargerProgramme(); break;
    case 'joueurs':      chargerClassementJoueurs(); break;
    case 'admin':        chargerAdmin(); break;
    case 'quizz':        chargerQuizzJoueur(); chargerClassementQuizz(); chargerClassementDetailleQuizz(); chargerTamponBonusQuizz(); break;
    case 'faq':          chargerFaq(); break;
  }
}

function showSub(page, subId, btnEl) {
  const pageEl = document.getElementById('page-' + page);
  pageEl.querySelectorAll(':scope > div[id^="sub-"]').forEach(d => d.classList.add('hidden'));
  const el = document.getElementById('sub-' + subId);
  if (el) el.classList.remove('hidden');

  document.querySelectorAll('#subtabs button').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Charger les données du sous-onglet si pas encore chargées
  switch (subId) {
    case 'mes-pronos':        chargerMesPronos(); break;
    case 'bonus':              chargerBonus(); break;
    case 'classement':        chargerClassementEquipes('general'); break;
    case 'resultats':         chargerResultats(); break;
    case 'grille':            chargerGrille(); break;
    case 'par-journee':       chargerClassementJournee(); break;
    case 'stats':             chargerStatsParieurs(); break;
    case 'evolution':         chargerEvolution(); break;
  }
}

// ============================================================
//  PAGE PRONOSTICS — JOURNÉE
//  Même approche que CDM 2026 : cache en mémoire, affichage synchrone
// ============================================================

// Cache local de tous les matchs chargés
let cacheMatchs = {};  // { journee: [matchs] }

async function chargerProchaineJournee() {
  try {
    const data = await apiGet('matches.php?action=prochaine');
    journeeCourante = data.journee || 1;
    chargerJournee(journeeCourante);
  } catch (e) {
    chargerJournee(1);
  }
}

function initialiserSelectJournees() {
  const selects = ['select-journee', 'select-journee-resultats', 'select-journee-joueurs'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    for (let j = 1; j <= nbJournees; j++) {
      const opt = document.createElement('option');
      opt.value = j;
      opt.textContent = `Journée ${j}`;
      el.appendChild(opt);
    }
  });
}

// Sélecteur de journée de "Mes pronos" — à part de initialiserSelectJournees()
// car il a une option supplémentaire "Toutes les journées" (valeur vide) en
// tête de liste, absente des autres sélecteurs.
function initialiserSelectJourneeMesPronos() {
  const el = document.getElementById('select-journee-mes-pronos');
  if (!el) return;
  el.innerHTML = '<option value="">Toutes les journées</option>';
  for (let j = 1; j <= nbJournees; j++) {
    const opt = document.createElement('option');
    opt.value = j;
    opt.textContent = `Journée ${j}`;
    el.appendChild(opt);
  }
}

function allerJournee(j) {
  journeeCourante = parseInt(j);
  chargerJournee(journeeCourante);
}

function allerJourneeMesPronos(j) {
  journeeMesPronos = j ? parseInt(j) : null;
  chargerMesPronos();
}

// delta -999 = "Toutes les journées", 999 = dernière journée, ±1 = navigation
// pas à pas (le cran juste avant J1 est "Toutes", pas une J0 inexistante)
function changeJourneeMesPronos(delta) {
  if (delta === -999) {
    journeeMesPronos = null;
  } else if (delta === 999) {
    journeeMesPronos = nbJournees;
  } else {
    const actuelle = journeeMesPronos || 0;
    const nouvelle = Math.max(0, Math.min(nbJournees, actuelle + delta));
    journeeMesPronos = nouvelle === 0 ? null : nouvelle;
  }
  const sel = document.getElementById('select-journee-mes-pronos');
  if (sel) sel.value = journeeMesPronos || '';
  chargerMesPronos();
}

function allerJourneeResultats(j) {
  journeeResultats = parseInt(j);
  chargerResultats();
}

function allerJourneeJoueurs(j) {
  journeeJoueurs = parseInt(j);
  chargerClassementJournee();
}

function changeJournee(delta) {
  let nouvelle = journeeCourante + delta;
  nouvelle = Math.max(1, Math.min(nbJournees, nouvelle));
  if (nouvelle === journeeCourante) return;
  journeeCourante = nouvelle;
  chargerJournee(journeeCourante);
}

async function chargerJournee(j) {
  const sel = document.getElementById('select-journee');
  if (sel && sel.value != j) sel.value = j;

  document.getElementById('btn-prev-j').disabled = j <= 1;
  document.getElementById('btn-first-j').disabled = j <= 1;
  document.getElementById('btn-next-j').disabled = j >= nbJournees;
  document.getElementById('btn-last-j').disabled = j >= nbJournees;

  // Nouvelle journée = tout repart fermé par défaut
  pronosTousOuverts = false;
  const btnToggle = document.getElementById('btn-toggle-tous-pronos');
  if (btnToggle) btnToggle.textContent = '👥';

  // Si journée déjà en cache → affichage SYNCHRONE, zéro délai, zéro saut
  if (cacheMatchs[j]) {
    afficherMatchsJournee(j, cacheMatchs[j]);
    // Précharger journées adjacentes en arrière-plan
    prechargerJournee(j - 1);
    prechargerJournee(j + 1);
    return;
  }

  // Sinon : afficher un indicateur discret et charger
  document.getElementById('badge-journee').innerHTML = '<span class="badge-j">⏳</span>';
  document.getElementById('journee-dates').textContent = '';
  document.getElementById('journee-stats').textContent = '';

  try {
    const data = await apiGet(`matches.php?action=journee&journee=${j}`);
    const matchs = data.matchs || [];
    cacheMatchs[j] = matchs;  // Mettre en cache
    afficherMatchsJournee(j, matchs);
    prechargerJournee(j - 1);
    prechargerJournee(j + 1);
  } catch (e) {
    document.getElementById('matches-grid').innerHTML = msgErreur('Erreur : ' + e.message);
  }
}

// Préchargement silencieux d'une journée adjacente
async function prechargerJournee(j) {
  if (j < 1 || j > nbJournees || cacheMatchs[j]) return;
  try {
    const data = await apiGet(`matches.php?action=journee&journee=${j}`);
    cacheMatchs[j] = data.matchs || [];
  } catch (e) { /* silencieux */ }
}

// Affichage 100% synchrone — jamais de saut
function afficherMatchsJournee(j, matchs) {
  const statuts = matchs.map(m => m.statut);
  const tousTerm = statuts.every(s => s === 'termine');
  const certAVenir = statuts.some(s => s === 'a_venir');
  const enCours = statuts.some(s => s === 'en_cours');

  let badge = '<span class="badge-j" style="visibility:hidden">—</span>';
  if (enCours)                      badge = '<span class="badge-j en-cours">EN COURS</span>';
  else if (tousTerm)                badge = '<span class="badge-j terminee">TERMINÉE</span>';
  else if (certAVenir && !tousTerm) badge = '<span class="badge-j">À VENIR</span>';
  document.getElementById('badge-journee').innerHTML = badge;

  if (matchs.length > 0) {
    document.getElementById('journee-dates').textContent =
      _matchsSurUnSeulJour(matchs) ? formatDatesJournee(matchs) : '';
  } else {
    document.getElementById('journee-dates').textContent = '';
  }
  const pronos = matchs.filter(m => m.mon_prono).length;
  document.getElementById('journee-stats').textContent =
    `${matchs.length} match${matchs.length > 1 ? 's' : ''} · ${pronos} pronostiqué${pronos > 1 ? 's' : ''}`;

  const grid = document.getElementById('matches-grid');
  if (matchs.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚽</div>Aucun match pour cette journée</div>';
  } else {
    const groupesJour = _grouperMatchsParJour(matchs);
    if (groupesJour.length <= 1) {
      grid.innerHTML = matchs.map((m, i) => renderMatchCard(m, i)).join('');
    } else {
      // Journée éclatée sur plusieurs dates (vendredi/samedi/dimanche…) :
      // un badge de date centré (avec trait plein largeur en dessous)
      // au-dessus de chaque paquet de matchs, qui restent dans la même
      // grille que d'habitude (pas de centrage par jour individuel).
      let i = 0;
      grid.innerHTML = groupesJour.map(g => {
        const libelle = g.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const cartes = g.matchs.map(m => renderMatchCard(m, i++)).join('');
        return `<div class="separateur-date-journee"><span>${libelle}</span></div>${cartes}`;
      }).join('');
    }
  }

  // Charger les points de forme de toutes les équipes de la journée,
  // sans attendre que l'utilisateur ouvre une carte de match
  if (matchs.length > 0) { chargerFormeAuto(matchs); chargerRangsAuto(matchs); }
}

// Charge la forme (5 derniers matchs) de chaque club affiché dans la
// journée courante, et met à jour les points directement sur les
// cartes repliées (afficherFormeDots gère déjà ça).
// 1 seul appel réseau pour tous les clubs de la journée (jusqu'à 18),
// au lieu d'un appel séparé par club.
async function chargerFormeAuto(matchs) {
  const clubIds = new Set();
  matchs.forEach(m => { clubIds.add(m.club_dom_id); clubIds.add(m.club_ext_id); });
  if (!clubIds.size) return;

  try {
    const data = await apiGet(`stats.php?action=forme_lot&club_ids=${[...clubIds].join(',')}`);
    const parClub = data.forme || {};
    clubIds.forEach(clubId => afficherFormeDots(clubId, parClub[clubId] || []));
  } catch (e) { /* silencieux : un échec global ne doit pas casser l'affichage des cartes */ }
}

// Affiche le rang actuel de chaque club à côté de son logo sur la carte
// match — uniquement une fois que la saison a réellement commencé (sinon
// tous les clubs sont à égalité à 0 pt, un rang n'aurait aucun sens).
async function chargerRangsAuto(matchs) {
  try {
    if (!cacheRangs || cacheRangsSaisonId !== saisonSelectionnee) {
      const data = await apiGet('classement.php?action=equipes');
      const classement = data.classement || [];
      if (!classement.some(c => c.j > 0)) { cacheRangs = {}; }
      else {
        cacheRangs = {};
        classement.forEach(c => { cacheRangs[c.id] = c.rang; });
      }
      cacheRangsSaisonId = saisonSelectionnee;
    }
    if (!Object.keys(cacheRangs).length) return; // saison pas encore commencée

    const clubIds = new Set();
    matchs.forEach(m => { clubIds.add(m.club_dom_id); clubIds.add(m.club_ext_id); });
    clubIds.forEach(clubId => {
      const rang = cacheRangs[clubId];
      if (!rang) return;
      document.querySelectorAll(`[id="rang-dom-${clubId}"], [id="rang-ext-${clubId}"]`)
        .forEach(el => { el.textContent = rang; el.title = `${rang}${rang === 1 ? 'er' : 'e'} au classement`; });
    });
  } catch (e) { /* silencieux */ }
}

// Vérifie si un match a déjà commencé en temps réel, sans attendre
// que le cron (toutes les 15 min) ne mette à jour le statut en base.
function matchACommence(m) {
  return new Date(m.date.replace(' ', 'T') + 'Z') <= new Date();
}

// Génère le bloc d'une équipe (logo + nom + forme) dans la carte match.
// 2 structures HTML différentes selon le mode, pas juste du CSS, pour ne
// jamais risquer de perturber le mode résultat (structure inchangée) :
//  - normal (résultat/à venir lecture seule/en cours/reporté) : logo à
//    gauche, nom + forme empilés à droite — INCHANGÉ
//  - pronostic (score éditable) : le widget de saisie prend beaucoup de
//    largeur au centre et tronquait les noms trop longs ; nouvelle
//    structure où logo+forme et nom sont des blocs séparés, réagencés
//    différemment par le CSS selon PC/mobile (cf. .carte-prono dans
//    style.css)
function _teamBlockHtml(logoWrap, nom, nomComplet, clubId, matchId, formeId, right, prono) {
  const nomEchap = nomComplet.replace(/'/g, "\\'");
  const nameDiv = `<div class="team-name team-name-link"
       onclick="ouvrirComposition(${matchId}, ${clubId}, '${nomEchap}')"
       title="${nomComplet} — voir la composition">${nom}</div>`;
  const formeDiv = `<div class="team-forme" id="${formeId}"></div>`;
  if (prono) {
    return `<div class="team${right ? ' right' : ''}">
      <div class="team-top">${logoWrap}${formeDiv}</div>
      ${nameDiv}
    </div>`;
  }
  return `<div class="team${right ? ' right' : ''}">
    ${logoWrap}
    <div>${nameDiv}${formeDiv}</div>
  </div>`;
}

// Bloc cotes (bookmakers + joueurs), affiché sur les matchs à venir
// uniquement — version compacte "côte à côte" (1/N/2 sur une ligne
// par source). Retourne '' si aucune donnée à afficher (ni cotes API,
// ni assez de pronos pour des cotes joueurs).

function _cotesBlockHtml(m, estAVenir) {
  const c = m.cotes;
  if (!c) return '';

  const fmt = v => (v !== null && v !== undefined) ? v.toFixed(2) : '—';

  // ── Avant le coup d'envoi : cotes en direct (comme avant) ──
  if (estAVenir) {
    const api = c.api;
    const j   = c.joueurs;
    const auMoinsUneSource = api || (j && j.suffisant);
    if (!auMoinsUneSource) return '';

    const ligneApi = api
      ? `<span class="cotes-cell cotes-val">${fmt(api.dom)}</span><span class="cotes-cell cotes-val">${fmt(api.nul)}</span><span class="cotes-cell cotes-val">${fmt(api.ext)}</span>`
      : `<span class="cotes-cell cotes-attente">Cotes pas dispos</span>`;

    const ligneJoueurs = (j && j.suffisant)
      ? `<span class="cotes-cell cotes-val">${fmt(j.dom)}</span><span class="cotes-cell cotes-val">${fmt(j.nul)}</span><span class="cotes-cell cotes-val">${fmt(j.ext)}</span>`
      : `<span class="cotes-cell cotes-attente">${j ? `${j.nb_pronos}/${j.seuil} pronos` : 'pas assez de pronos'}</span>`;

    return `
    <div class="match-cotes">
      <div class="cotes-grid">
        <span class="cotes-cell"></span>
        <span class="cotes-cell cotes-val cotes-entete">1</span><span class="cotes-cell cotes-val cotes-entete">N</span><span class="cotes-cell cotes-val cotes-entete">2</span>
        <span class="cotes-cell cotes-label">📊 Books</span>${ligneApi}
        <span class="cotes-cell cotes-label">👥 Joueurs</span>${ligneJoueurs}
      </div>
    </div>`;
  }

  // ── Après le coup d'envoi : rappel des cotes figées à cet instant-là ──
  const f = c.figee;
  if (!f) return ''; // match démarré avant la mise en place du figeage, ou jamais rien eu à figer

  const api = f.api;
  const j   = f.joueurs;
  if (!api && !j) return '';

  const ligneApi = api
    ? `<span class="cotes-cell cotes-val">${fmt(api.dom)}</span><span class="cotes-cell cotes-val">${fmt(api.nul)}</span><span class="cotes-cell cotes-val">${fmt(api.ext)}</span>`
    : `<span class="cotes-cell cotes-attente">Cotes indisponibles</span>`;

  const ligneJoueurs = j
    ? `<span class="cotes-cell cotes-val">${fmt(j.dom)}</span><span class="cotes-cell cotes-val">${fmt(j.nul)}</span><span class="cotes-cell cotes-val">${fmt(j.ext)}</span>`
    : `<span class="cotes-cell cotes-attente">pas assez de pronos</span>`;

  return `
  <div class="match-cotes match-cotes-figee">
    <div class="cotes-grid">
      <span class="cotes-cell"></span>
      <span class="cotes-cell cotes-val cotes-entete">1</span><span class="cotes-cell cotes-val cotes-entete">N</span><span class="cotes-cell cotes-val cotes-entete">2</span>
      <span class="cotes-cell cotes-label">📊 Books</span>${ligneApi}
      <span class="cotes-cell cotes-label">👥 Joueurs</span>${ligneJoueurs}
    </div>
    <span class="cotes-badge-figee">Cotes au coup d'envoi</span>
  </div>`;
}

function renderMatchCard(m, index) {
  const id = `mc-${m.id}`;
  const estAVenir = m.statut === 'a_venir' && !matchACommence(m);
  const peutSaisir = estAVenir && saisonEstModifiableActuelle();
  const estTermine = m.statut === 'termine';
  const estReporte = m.statut === 'reporte';
  // Pour l'onglet Analyse par défaut (H2H avant le coup d'envoi, Stats une
  // fois le match commencé) : basé sur l'heure plutôt que sur m.statut
  // seul, qui peut rester "a_venir" en base jusqu'à 15 min après le coup
  // d'envoi (le temps que le cron passe) — voir matchACommence().
  const matchDemarreOuTermine = estTermine || matchACommence(m);

  const logoDom = m.logo_dom
    ? `<img class="team-logo" src="${m.logo_dom}" alt="${m.code_dom}" onerror="this.style.display='none'">`
    : `<div class="team-logo-placeholder">${m.code_dom}</div>`;
  const logoExt = m.logo_ext
    ? `<img class="team-logo" src="${m.logo_ext}" alt="${m.code_ext}" onerror="this.style.display='none'">`
    : `<div class="team-logo-placeholder">${m.code_ext}</div>`;
  const logoDomWrap = `<div class="team-logo-wrap">${logoDom}<span class="team-rang" id="rang-dom-${m.club_dom_id}"></span></div>`;
  const logoExtWrap = `<div class="team-logo-wrap">${logoExt}<span class="team-rang" id="rang-ext-${m.club_ext_id}"></span></div>`;

  // Zone centre — input ou score
  let centre = '';
  if (estTermine) {
    const prono = m.mon_prono;
    const badgeHtml = prono && prono.resultat
      ? `<div class="prono-result">
           <span class="badge-${prono.resultat}">${badgeLabel(prono.resultat)}</span>
           <span class="badge-pts">+${prono.points} pts</span>
         </div>
         <div class="prono-hint">Ton prono : ${prono.score_dom_pred}-${prono.score_ext_pred}</div>`
      : `<div class="prono-result invisible" aria-hidden="true">
           <span class="badge-exact">placeholder</span>
         </div>
         <div class="prono-hint">Non pronostiqué</div>`;

    centre = `
      <div class="match-score-zone">
        <div class="score-final">${m.score_dom} - ${m.score_ext}</div>
      </div>
      <div class="match-result-zone">${badgeHtml}</div>`;
  } else if (peutSaisir) {
    const prono = m.mon_prono;
    const dom_val = prono ? prono.score_dom_pred : '';
    const ext_val = prono ? prono.score_ext_pred : '';
    const hint = prono
      ? '<div class="prono-hint ok">✓ Pronostic enregistré</div>'
      : `<div class="prono-hint">Saisir avant ${formatHeure(m.date)}</div>`;

    centre = `
      <div class="match-score-zone">
        <div class="score-stepper" onclick="event.stopPropagation()">
          <button type="button" class="score-stepper-btn" onclick="ajusterScore(${m.id}, 'dom', -1)">−</button>
          <input class="prono-input${prono ? ' saisi' : ''}" type="number"
            min="0" max="20" value="${dom_val}" placeholder="—"
            id="score-dom-${m.id}"
            onchange="saisirProno(${m.id})"
            onclick="event.stopPropagation()">
          <button type="button" class="score-stepper-btn" onclick="ajusterScore(${m.id}, 'dom', 1)">+</button>
        </div>
        <span class="score-sep">:</span>
        <div class="score-stepper" onclick="event.stopPropagation()">
          <button type="button" class="score-stepper-btn" onclick="ajusterScore(${m.id}, 'ext', -1)">−</button>
          <input class="prono-input${prono ? ' saisi' : ''}" type="number"
            min="0" max="20" value="${ext_val}" placeholder="—"
            id="score-ext-${m.id}"
            onchange="saisirProno(${m.id})"
            onclick="event.stopPropagation()">
          <button type="button" class="score-stepper-btn" onclick="ajusterScore(${m.id}, 'ext', 1)">+</button>
        </div>
      </div>
      ${hint}`;
  } else if (estReporte) {
    centre = `
      <div class="match-score-zone">
        <span class="txt2" style="font-size:.82rem">Date TBD</span>
      </div>`;
  } else if (estAVenir) {
    // À venir mais saison non modifiable (lecture seule) → pas de champ de saisie
    centre = `
      <div class="match-score-zone">
        <span class="txt2" style="font-size:.82rem">— : —</span>
      </div>`;
  } else {
    // En cours
    centre = `
      <div class="match-score-zone">
        <div class="score-final">${m.score_dom ?? '?'} - ${m.score_ext ?? '?'}</div>
      </div>`;
  }

  const statutDetail = estTermine ? 'Terminé'
    : estReporte ? 'Reporté'
    : estAVenir ? 'À venir'
    : '🔴 En cours';
  const statutDetailClass = estTermine ? 'termine'
    : estReporte ? 'reporte'
    : estAVenir ? 'a-venir'
    : 'en-cours';

  return `
  <div class="match-card${estReporte ? ' reporte' : ''}${peutSaisir ? ' carte-prono' : ''}" id="${id}" data-statut="${m.statut}">
    <div class="match-header">
      <span class="match-header-date">J${m.journee} · ${formatDateCourte(m.date)}</span>
      ${m.stade ? `<span class="match-header-stade" title="${m.stade}">${m.stade}</span>` : ''}
      <span class="match-header-statut match-header-statut-${statutDetailClass}">${statutDetail}</span>
    </div>
    <div class="match-main">
      ${_teamBlockHtml(logoDomWrap, m.court_dom || m.nom_dom, m.nom_dom, m.club_dom_id, m.id, `forme-dom-${m.club_dom_id}`, false, peutSaisir)}
      <div class="match-center">${centre}</div>
      ${_teamBlockHtml(logoExtWrap, m.court_ext || m.nom_ext, m.nom_ext, m.club_ext_id, m.id, `forme-ext-${m.club_ext_id}`, true, peutSaisir)}
    </div>
    ${_cotesBlockHtml(m, estAVenir)}
    <div class="match-footer">
      <button onclick="toggleAnalyse('${id}', this)">📊 Analyse</button>
      <button onclick="ouvrirCompositionMatch(${m.id})">${ICON_COMPOS} Compos</button>
      ${!estAVenir
        ? `<button class="match-nb-pronos-badge" data-deja-compte="${m.mon_prono ? '1' : ''}" onclick="toggleInlineTab('${id}', 'pronos', this)">👥 ${m.nb_pronos ?? 0}</button>`
        : `<button class="match-nb-pronos-badge disabled" data-deja-compte="${m.mon_prono ? '1' : ''}" onclick="event.stopPropagation();afficherToast('Pronostics visibles après le coup d\\'envoi', 'ℹ️')">👥 ${m.nb_pronos ?? 0}</button>`}
    </div>
    <div class="match-detail">
      <div class="detail-body">
        <div class="detail-subtabs hidden">
          <button class="${matchDemarreOuTermine ? '' : 'active'}" data-tab="h2h" onclick="changerOngletAnalyse('${id}', 'h2h', this)">⚔️ H2H</button>
          <button data-tab="forme" onclick="changerOngletAnalyse('${id}', 'forme', this)">📈 Forme</button>
          <button class="${matchDemarreOuTermine ? 'active' : ''}" data-tab="stats" onclick="changerOngletAnalyse('${id}', 'stats', this)">📊 Stats</button>
          <button data-tab="tendances" onclick="changerOngletAnalyse('${id}', 'tendances', this)">🔮 Tendances</button>
          <button data-tab="classement" onclick="changerOngletAnalyse('${id}', 'classement', this)">🏆 Classement</button>
        </div>
        <div class="detail-panel" id="dt-h2h-${m.id}">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        <div class="detail-panel" id="dt-form-${m.id}">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        <div class="detail-panel" id="dt-stats-${m.id}">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        <div class="detail-panel" id="dt-tendances-${m.id}">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        <div class="detail-panel" id="dt-classement-${m.id}">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        ${!estAVenir ? `<div class="detail-panel" id="dt-pronos-${m.id}">
          <div class="loading"><div class="spinner"></div></div>
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

function badgeLabel(resultat) {
  return { exact: '🟢 Score exact', bon: '🟡 Bon résultat', mauvais: '🔴 Raté' }[resultat] || resultat;
}

// ── Ouvrir/fermer le panneau "Analyse" (H2H / Forme / Stats / Tendances /
// Classement, regroupés depuis 20260725) ──
function toggleAnalyse(id, btn) {
  const card = document.getElementById(id);
  if (!card) return;

  const dejaOuvert = card.classList.contains('expanded') && btn.classList.contains('active');

  if (dejaOuvert) {
    card.classList.remove('expanded');
    btn.classList.remove('active');
    return;
  }

  card.classList.add('expanded');
  card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
  card.querySelectorAll('.match-footer button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const subtabs = card.querySelector('.detail-subtabs');
  subtabs.classList.remove('hidden');

  // Rouvre sur le dernier onglet consulté sur cette carte, sinon H2H par défaut
  const ongletBtn = subtabs.querySelector('button.active') || subtabs.querySelector('button');
  changerOngletAnalyse(id, ongletBtn.dataset.tab, ongletBtn);
}

// ── Changer de sous-onglet à l'intérieur du panneau "Analyse" ──
function changerOngletAnalyse(id, tab, btn) {
  const card = document.getElementById(id);
  if (!card) return;
  const matchId = id.replace('mc-', '');
  const panelId = { h2h: 'dt-h2h-', forme: 'dt-form-', stats: 'dt-stats-', tendances: 'dt-tendances-', classement: 'dt-classement-' }[tab] + matchId;
  const panel = document.getElementById(panelId);
  if (!panel) return;

  card.querySelectorAll('.detail-subtabs button').forEach(b => b.classList.remove('active'));
  card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  panel.classList.add('active');

  if (tab === 'h2h') chargerH2H(matchId, card);
  if (tab === 'forme') chargerFormeMatch(matchId, card);
  if (tab === 'stats') chargerStatsMatch(matchId, card);
  if (tab === 'tendances') chargerTendancesMatch(matchId, card);
  if (tab === 'classement') chargerClassementMatch(matchId, card);
}

// ── Ouvrir/fermer le panneau "Pronos" replié sous une carte ──
function toggleInlineTab(id, tab, btn) {
  const card = document.getElementById(id);
  if (!card) return;
  const matchId = id.replace('mc-', '');
  const panelId = { pronos: 'dt-pronos-' }[tab] + matchId;
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const dejaOuvertSurCetOnglet = card.classList.contains('expanded') && btn.classList.contains('active');

  if (dejaOuvertSurCetOnglet) {
    // Reclic sur l'onglet déjà ouvert → on referme
    card.classList.remove('expanded');
    btn.classList.remove('active');
    return;
  }

  // Ouvrir (ou changer d'onglet si déjà ouvert sur un autre)
  card.classList.add('expanded');
  card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
  card.querySelectorAll('.match-footer button').forEach(b => b.classList.remove('active'));
  card.querySelector('.detail-subtabs')?.classList.add('hidden');
  panel.classList.add('active');
  btn.classList.add('active');

  // Charger le contenu au premier affichage
  if (tab === 'pronos') chargerPronosMatch(matchId, card);
}

// ── Ouvrir/fermer tous les pronos de la journée d'un seul coup ──
let pronosTousOuverts = false;
let h2hTousOuverts    = false;
let formeTousOuverts  = false;

// Ferme visuellement le bouton "tout ouvrir" d'un autre type (H2H/Forme),
// sans redéclencher son toggle — utilisé pour la mutuelle exclusivité :
// une carte n'affiche qu'un seul onglet Analyse à la fois, donc ouvrir
// "tout Forme" doit désactiver visuellement "tout H2H" (et inversement).
function _resetToggleTousAutre(idBtn, icone) {
  const btn = document.getElementById(idBtn);
  if (btn) { btn.textContent = icone; btn.classList.remove('active'); }
}

function toggleTousH2H(btn) {
  h2hTousOuverts = !h2hTousOuverts;
  btn.textContent = h2hTousOuverts ? '🙈' : '⚔️';
  btn.title = h2hTousOuverts ? 'Fermer tous les H2H de la journée' : 'Ouvrir tous les H2H de la journée';
  if (h2hTousOuverts) {
    formeTousOuverts = false; _resetToggleTousAutre('btn-toggle-tous-forme', '📈');
    pronosTousOuverts = false; _resetToggleTousAutre('btn-toggle-tous-pronos', '👥');
  }

  document.querySelectorAll('#matches-grid .match-card').forEach(card => {
    const matchId    = card.id.replace('mc-', '');
    const analyseBtn = card.querySelector('.match-footer button[onclick*="toggleAnalyse"]');
    const h2hBtn     = card.querySelector('.detail-subtabs button[data-tab="h2h"]');
    const panel      = document.getElementById('dt-h2h-' + matchId);
    if (!analyseBtn || !h2hBtn || !panel) return;

    if (h2hTousOuverts) {
      card.classList.add('expanded');
      card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
      card.querySelectorAll('.match-footer button').forEach(b => b.classList.remove('active'));
      card.querySelectorAll('.detail-subtabs button').forEach(b => b.classList.remove('active'));
      card.querySelector('.detail-subtabs')?.classList.remove('hidden');
      analyseBtn.classList.add('active');
      h2hBtn.classList.add('active');
      panel.classList.add('active');
      chargerH2H(matchId, card);
    } else {
      card.classList.remove('expanded');
      analyseBtn.classList.remove('active');
    }
  });
}

function toggleTousForme(btn) {
  formeTousOuverts = !formeTousOuverts;
  btn.textContent = formeTousOuverts ? '🙈' : '📈';
  btn.title = formeTousOuverts ? 'Fermer toutes les Formes de la journée' : 'Ouvrir toutes les Formes de la journée';
  if (formeTousOuverts) {
    h2hTousOuverts = false; _resetToggleTousAutre('btn-toggle-tous-h2h', '⚔️');
    pronosTousOuverts = false; _resetToggleTousAutre('btn-toggle-tous-pronos', '👥');
  }

  document.querySelectorAll('#matches-grid .match-card').forEach(card => {
    const matchId    = card.id.replace('mc-', '');
    const analyseBtn = card.querySelector('.match-footer button[onclick*="toggleAnalyse"]');
    const formeBtn   = card.querySelector('.detail-subtabs button[data-tab="forme"]');
    const panel      = document.getElementById('dt-form-' + matchId);
    if (!analyseBtn || !formeBtn || !panel) return;

    if (formeTousOuverts) {
      card.classList.add('expanded');
      card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
      card.querySelectorAll('.match-footer button').forEach(b => b.classList.remove('active'));
      card.querySelectorAll('.detail-subtabs button').forEach(b => b.classList.remove('active'));
      card.querySelector('.detail-subtabs')?.classList.remove('hidden');
      analyseBtn.classList.add('active');
      formeBtn.classList.add('active');
      panel.classList.add('active');
      chargerFormeMatch(matchId, card);
    } else {
      card.classList.remove('expanded');
      analyseBtn.classList.remove('active');
    }
  });
}

function toggleTousPronos(btn) {
  pronosTousOuverts = !pronosTousOuverts;
  btn.textContent = pronosTousOuverts ? '🙈' : '👥';
  btn.title = pronosTousOuverts ? 'Fermer tous les pronos de la journée' : 'Ouvrir tous les pronos de la journée';
  if (pronosTousOuverts) {
    h2hTousOuverts = false; _resetToggleTousAutre('btn-toggle-tous-h2h', '⚔️');
    formeTousOuverts = false; _resetToggleTousAutre('btn-toggle-tous-forme', '📈');
  }

  let auMoinsUnAVenir = false;
  document.querySelectorAll('#matches-grid .match-card').forEach(card => {
    const matchId = card.id.replace('mc-', '');
    const pronosBtn = card.querySelector('.match-footer button[onclick*="\'pronos\'"]');
    if (!pronosBtn) { auMoinsUnAVenir = true; return; } // match à venir : pas de bouton Pronos, on ignore

    const panel = document.getElementById('dt-pronos-' + matchId);
    if (!panel) return;

    if (pronosTousOuverts) {
      card.classList.add('expanded');
      card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
      card.querySelectorAll('.match-footer button').forEach(b => b.classList.remove('active'));
      card.querySelector('.detail-subtabs')?.classList.add('hidden');
      panel.classList.add('active');
      pronosBtn.classList.add('active');
      chargerPronosMatch(matchId, card);
    } else {
      card.classList.remove('expanded');
      pronosBtn.classList.remove('active');
    }
  });

  // Un seul message groupé (pas un par match à venir) pour prévenir que
  // les pronos de ces matchs-là restent cachés jusqu'au coup d'envoi.
  if (pronosTousOuverts && auMoinsUnAVenir) {
    afficherToast('Pronostics visibles après le coup d\'envoi pour les matchs à venir', 'ℹ️');
  }
}

// ── Classement (version panneau, à l'intérieur d'Analyse) ──
async function chargerClassementMatch(matchId, card) {
  const panel = card.querySelector('[id^="dt-classement-"]');
  if (!panel || panel.dataset.loaded) return;

  const clubDomId = card.querySelector('[id^="forme-dom-"]')?.id.replace('forme-dom-', '');
  const clubExtId = card.querySelector('[id^="forme-ext-"]')?.id.replace('forme-ext-', '');

  try {
    const data = await apiGet('classement.php?action=equipes');
    panel.innerHTML = renderClassementEquipes(data.classement || [], [clubDomId, clubExtId]);
    panel.dataset.loaded = '1';
    _armerScrollHint(panel);
    requestAnimationFrame(() => {
      const ligne = panel.querySelector('.match-highlight-row');
      if (ligne) ligne.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  } catch (e) {
    panel.innerHTML = msgErreur('Impossible de charger le classement');
  }
}

// ── H2H ──
async function chargerH2H(matchId, card, venue = null) {
  const panel = card.querySelector('[id^="dt-h2h-"]');
  if (!panel) return;
  // Un changement de filtre doit pouvoir recharger un panneau déjà "loaded"
  if (panel.dataset.loaded && panel.dataset.venue === (venue || 'tous')) return;

  // Jeton de requête : si l'utilisateur clique vite sur plusieurs boutons du
  // sélecteur domicile/tous/extérieur, plusieurs appels réseau partent en
  // parallèle et peuvent revenir dans le désordre — sans ce garde-fou, une
  // réponse lente peut arriver après une plus rapide et écraser le bon
  // résultat avec un ancien (effet de "sursaut" des chiffres). Seule la
  // requête la plus récente est autorisée à mettre à jour l'affichage.
  const monJeton = Symbol();
  panel.dataset.chargement = '1';
  panel._dernierJeton = monJeton;

  const clubDomId = card.querySelector('[id^="forme-dom-"]')?.id.replace('forme-dom-', '');
  const clubExtId = card.querySelector('[id^="forme-ext-"]')?.id.replace('forme-ext-', '');
  const nomDom = card.querySelector('.team:not(.right) .team-name')?.textContent.trim() || 'Domicile';
  const nomExt = card.querySelector('.team.right .team-name')?.textContent.trim() || 'Extérieur';

  if (!clubDomId || !clubExtId) { panel.innerHTML = '<div class="txt2 text-center" style="font-size:.82rem">H2H non disponible</div>'; return; }

  const selecteurHtml = `
    <div class="h2h-venue-selector">
      <button class="h2h-venue-btn ${!venue ? 'active' : ''}" onclick="chargerH2HFiltre('${matchId}', this, null)">Tous</button>
      <button class="h2h-venue-btn ${venue === 'dom' ? 'active' : ''}" onclick="chargerH2HFiltre('${matchId}', this, 'dom')">${nomDom} <span class="h2h-venue-emoji">🏠</span></button>
      <button class="h2h-venue-btn ${venue === 'ext' ? 'active' : ''}" onclick="chargerH2HFiltre('${matchId}', this, 'ext')">${nomDom} <span class="h2h-venue-emoji">✈️</span></button>
    </div>`;

  try {
    const venueParam = venue ? `&venue=${venue}` : '';
    const data = await apiGet(`stats.php?action=h2h&dom=${clubDomId}&ext=${clubExtId}&limit=10${venueParam}`);
    const h2h  = data.h2h || [];
    if (panel._dernierJeton !== monJeton) return; // une requête plus récente a pris le relais
    if (h2h.length === 0) {
      panel.innerHTML = selecteurHtml + '<div class="txt2" style="font-size:.82rem;margin-top:8px">Aucun historique disponible pour ce filtre</div>';
    } else {
      // Comptage V/N/D calculé sur les mêmes lignes que celles affichées
      // (donc automatiquement recalculé selon le filtre domicile/extérieur
      // en cours, sans appel réseau supplémentaire)
      let victGauche = 0, nuls = 0, victDroite = 0;

      const lignes = h2h.map(m => {
        const gaucheJouaitDom = String(m.club_dom_id) === String(clubDomId);
        const scoreClubGauche = gaucheJouaitDom ? m.score_dom : m.score_ext;
        const scoreClubDroite = gaucheJouaitDom ? m.score_ext : m.score_dom;
        const dotGauche = scoreClubGauche > scoreClubDroite ? 'W' : scoreClubGauche < scoreClubDroite ? 'L' : 'D';
        const dotDroite = scoreClubDroite > scoreClubGauche ? 'W' : scoreClubDroite < scoreClubGauche ? 'L' : 'D';

        if (dotGauche === 'W') victGauche++;
        else if (dotGauche === 'D') nuls++;
        else victDroite++;

        return `<div class="h2h-row">
              <div class="forme-dot forme-dot-lg ${dotGauche}"></div>
              <div class="h2h-core">
                <div class="h2h-date">${formatDateH2H(m.date)}</div>
                <div class="h2h-nom-dom">${m.nom_dom}</div>
                <div class="h2h-score">${m.score_dom}-${m.score_ext}</div>
                <div class="h2h-nom-ext">${m.nom_ext}</div>
              </div>
              <div class="forme-dot forme-dot-lg ${dotDroite}"></div>
            </div>`;
      }).join('');

      const total = h2h.length;
      const pctGauche = Math.round(victGauche / total * 100);
      const pctDroite = Math.round(victDroite / total * 100);
      const pctNuls   = 100 - pctGauche - pctDroite; // évite un total ≠ 100% par arrondi

      const resumeHtml = `
        <div class="h2h-resume-pill">
          <div class="h2h-resume-titre">Dernières confrontations (${h2h.length} match${h2h.length > 1 ? 's' : ''})</div>
          <div class="h2h-resume-ligne">
            <span class="h2h-resume-w">${victGauche} Vict. ${nomDom}</span>
            <span class="h2h-resume-sep">|</span>
            <span class="h2h-resume-d">${nuls} Nul${nuls > 1 ? 's' : ''}</span>
            <span class="h2h-resume-sep">|</span>
            <span class="h2h-resume-w">${victDroite} Vict. ${nomExt}</span>
          </div>
          <div class="h2h-resume-bar">
            ${victGauche > 0 ? `<div class="h2h-bar-seg h2h-bar-w" style="width:${victGauche / total * 100}%"></div>` : ''}
            ${nuls       > 0 ? `<div class="h2h-bar-seg h2h-bar-d" style="width:${nuls       / total * 100}%"></div>` : ''}
            ${victDroite > 0 ? `<div class="h2h-bar-seg h2h-bar-l" style="width:${victDroite / total * 100}%"></div>` : ''}
          </div>
          <div class="h2h-resume-pct">
            ${victGauche > 0 ? `<div class="h2h-pct-seg h2h-resume-w" style="width:${victGauche / total * 100}%">${pctGauche}%</div>` : ''}
            ${nuls       > 0 ? `<div class="h2h-pct-seg h2h-resume-d" style="width:${nuls       / total * 100}%">${pctNuls}%</div>` : ''}
            ${victDroite > 0 ? `<div class="h2h-pct-seg h2h-resume-l" style="width:${victDroite / total * 100}%">${pctDroite}%</div>` : ''}
          </div>
        </div>`;

      panel.innerHTML = resumeHtml + selecteurHtml + `<div class="h2h-list">${lignes}</div>`;
    }
    delete panel.dataset.chargement;
    panel.dataset.loaded = '1';
    panel.dataset.venue  = venue || 'tous';
  } catch (e) {
    if (panel._dernierJeton !== monJeton) return; // une requête plus récente a pris le relais
    delete panel.dataset.chargement;
    panel.innerHTML = selecteurHtml + '<div class="txt2" style="font-size:.82rem;margin-top:8px">Erreur chargement H2H</div>';
  }
}

// Rappelée par les boutons du sélecteur domicile/tous/extérieur — force
// le rechargement (contrairement à chargerH2H seule, qui ne recharge pas
// un panneau déjà chargé pour éviter un appel réseau superflu à l'ouverture)
function chargerH2HFiltre(matchId, btn, venue) {
  const card  = document.getElementById(`mc-${matchId}`);
  const panel = document.getElementById(`dt-h2h-${matchId}`);
  if (!card || !panel) return;
  delete panel.dataset.loaded;
  chargerH2H(matchId, card, venue);
}

// ── Forme ──
async function chargerFormeMatch(matchId, card) {
  const panel = card.querySelector('[id^="dt-form-"]');
  if (!panel || panel.dataset.loaded) return;

  const clubDomId = card.querySelector('[id^="forme-dom-"]')?.id.replace('forme-dom-', '');
  const clubExtId = card.querySelector('[id^="forme-ext-"]')?.id.replace('forme-ext-', '');
  if (!clubDomId || !clubExtId) return;

  try {
    const [dataDom, dataExt] = await Promise.all([
      apiGet(`stats.php?action=forme&club_id=${clubDomId}`),
      apiGet(`stats.php?action=forme&club_id=${clubExtId}`),
    ]);

    const formeDom = dataDom.forme || {};
    const formeExt = dataExt.forme || {};

    // Format français à une décimale (virgule) pour les moyennes BP/BC
    const fmt1 = n => (Number(n) || 0).toFixed(1).replace('.', ',');

    const labelCompetition = c => c === 'ligue1' ? 'Ligue 1 uniquement' : 'Toutes compétitions confondues';

    const renderForme = (data) => {
      const matchs = data.matchs || [];
      if (!matchs.length) return `<div class="txt2" style="font-size:.78rem;text-align:center">Aucun match</div>`;
      return `<div class="forme-detail-list">
        ${matchs.map(m => `
          <div class="forme-detail-row">
            <span class="forme-detail-date">${formatDateH2H(m.date)}</span>
            <span class="forme-detail-nom-dom">
              <span class="forme-nom-complet">${m.nom_dom}</span><span class="forme-nom-code">${m.code_dom}</span>
            </span>
            <span class="forme-score-badge forme-score-${m.resultat}">${m.score_dom}-${m.score_ext}</span>
            <span class="forme-detail-nom-ext">
              <span class="forme-nom-complet">${m.nom_ext}</span><span class="forme-nom-code">${m.code_ext}</span>
            </span>
          </div>`).join('')}
      </div>`;
    };

    const nomDom = card.querySelector('.team:not(.right) .team-name')?.textContent || '';
    const nomExt = card.querySelector('.team.right .team-name')?.textContent || '';

    const enTeteClub = (nom, data) => `
      <div style="text-align:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--bord)">
        <div style="font-weight:700;font-size:.78rem;color:var(--txt)">${nom}</div>
        <div class="forme-bpbc-badge">
          <span class="forme-bp">BP&nbsp;${fmt1(data.bp_moyenne)}</span>
          <span class="forme-bpbc-sep">/</span>
          <span class="forme-bc">BC&nbsp;${fmt1(data.bc_moyenne)}</span>
        </div>
      </div>`;

    panel.innerHTML = `
      <div class="forme-competition-label">${labelCompetition(formeDom.competition || formeExt.competition)}</div>
      <div class="forme-2col">
        <div>
          ${enTeteClub(nomDom, formeDom)}
          ${renderForme(formeDom)}
        </div>
        <div class="forme-divider"></div>
        <div>
          ${enTeteClub(nomExt, formeExt)}
          ${renderForme(formeExt)}
        </div>
      </div>`;
    panel.dataset.loaded = '1';

    // Mettre à jour les points de forme dans la carte
    afficherFormeDots(clubDomId, formeDom.matchs || []);
    afficherFormeDots(clubExtId, formeExt.matchs || []);
  } catch (e) {
    panel.innerHTML = '<div class="txt2" style="font-size:.82rem">Erreur chargement forme</div>';
  }
}

function afficherFormeDots(clubId, matchs) {
  // stats.php renvoie les matchs du plus récent au plus ancien (ORDER BY
  // date DESC) ; on les affiche du plus ancien (gauche) au plus récent
  // (droite), pour correspondre à la colonne "Forme" du classement.
  const formeChrono = [...matchs].reverse();
  document.querySelectorAll(`[id="forme-dom-${clubId}"], [id="forme-ext-${clubId}"]`)
    .forEach(el => {
      el.innerHTML = formeChrono.map(m =>
        `<div class="forme-dot ${m.resultat}" title="${m.score_dom}-${m.score_ext} vs ${m.domicile ? m.nom_ext : m.nom_dom}"></div>`
      ).join('');
    });
}

// ── Stats détaillées du match (possession, tirs, corners, etc.) ──
// Stats où une valeur plus FAIBLE est la meilleure performance (fautes,
// cartons) — inverse la logique de mise en avant par rapport aux autres
// stats (tirs, possession...) où plus haut = mieux.
const _STATS_INVERSEES = new Set(['Fouls', 'Yellow Cards', 'Red Cards', 'Offsides']);

const _LABELS_STATS_MATCH = {
  'Shots on Goal':      'Tirs cadrés',
  'Shots off Goal':     'Tirs non cadrés',
  'Total Shots':        'Tirs total',
  'Blocked Shots':      'Tirs contrés',
  'Shots insidebox':    'Tirs dans la surface',
  'Shots outsidebox':   'Tirs hors surface',
  'Fouls':               'Fautes',
  'Corner Kicks':        'Corners',
  'Offsides':            'Hors-jeu',
  'Ball Possession':     'Possession',
  'Yellow Cards':        'Cartons jaunes',
  'Red Cards':           'Cartons rouges',
  'Goalkeeper Saves':    'Arrêts du gardien',
  'Total passes':        'Passes totales',
  'Passes accurate':     'Passes réussies',
  'Passes %':            'Précision des passes',
  'expected_goals':      'Buts attendus (xG)',
  'goals_prevented':     'Buts évités',
};

// Regroupement thématique des stats (Gemini's UX review, 25/07/2026) : plutôt
// qu'une longue liste plate de 15 lignes identiques, 3 blocs avec titre
// discret, dans un ordre de lecture qui va de l'essentiel au détail.
const _GROUPES_STATS_MATCH = [
  { titre: '⭐ Stats Clés', types: ['Ball Possession', 'expected_goals', 'Shots on Goal', 'Goalkeeper Saves', 'Corner Kicks', 'Yellow Cards', 'Red Cards'] },
  { titre: '⚽ Attaque & Jeu', types: ['Total Shots', 'Shots insidebox', 'Shots outsidebox', 'Shots off Goal', 'Blocked Shots', 'Total passes', 'Passes accurate', 'Passes %'] },
  { titre: '🛡️ Discipline & Défense', types: ['Fouls', 'Offsides'] },
];

// goals_prevented ("buts évités") exclue volontairement : l'API renvoie
// fréquemment la même valeur pour les 2 équipes (constaté en test), ce qui
// rend la stat peu fiable et confuse plutôt qu'utile.
const _STATS_MASQUEES = new Set(['goals_prevented']);

async function chargerStatsMatch(matchId, card) {
  const panel = document.getElementById('dt-stats-' + matchId);
  if (panel.dataset.loaded === '1') return;

  if (card.dataset.statut === 'a_venir') {
    panel.innerHTML = `<div class="txt2" style="font-size:.82rem;text-align:center;padding:14px 0">
      📊 Statistiques disponibles dès le coup d'envoi.</div>`;
    return;
  }

  try {
    const data = await apiGet(`stats.php?action=match_stats&match_id=${matchId}`);
    if (!data.disponible || !data.dom.stats || !data.ext.stats) {
      panel.innerHTML = `<div class="txt2" style="font-size:.82rem;text-align:center;padding:14px 0">
        📊 Statistiques pas encore disponibles pour ce match.</div>`;
      return;
    }
    panel.innerHTML = _rendreButsMatch(data.dom, data.ext) + _rendreStatsMatch(data.dom, data.ext);
    panel.dataset.loaded = '1';
  } catch (e) {
    panel.innerHTML = '<div class="txt2" style="font-size:.82rem">Erreur chargement des statistiques</div>';
  }
}

// ── Tendances pré-match (aide à la décision, disponible avant le coup d'envoi) ──
const _cacheTendances = {}; // clé "matchId_periode" → réponse déjà chargée

function _selecteurPeriodeHtml(matchId, periode) {
  return `
    <div class="tendances-periode-select">
      <button class="${periode === 'saison' ? 'active' : ''}" onclick="chargerTendancesMatch(${matchId}, document.getElementById('mc-${matchId}'), 'saison')">Saison en cours</button>
      <button class="${periode === 'toutes' ? 'active' : ''}" onclick="chargerTendancesMatch(${matchId}, document.getElementById('mc-${matchId}'), 'toutes')">Toutes saisons</button>
    </div>`;
}

async function chargerTendancesMatch(matchId, card, periode) {
  periode = periode || 'saison';
  const panel = document.getElementById('dt-tendances-' + matchId);
  if (!panel) return;

  const nomDom = card.querySelectorAll('.team-name')[0]?.textContent || 'Domicile';
  const nomExt = card.querySelectorAll('.team-name')[1]?.textContent || 'Extérieur';
  const cleCache = `${matchId}_${periode}`;
  const selecteur = _selecteurPeriodeHtml(matchId, periode);

  if (_cacheTendances[cleCache]) {
    panel.innerHTML = selecteur + _rendreTendances(_cacheTendances[cleCache], nomDom, nomExt, matchId);
    requestAnimationFrame(() => _marquerSegmentsTronques(panel));
    return;
  }

  panel.innerHTML = selecteur + '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await apiGet(`tendances.php?action=match&match_id=${matchId}&periode=${periode}`);
    _cacheTendances[cleCache] = data;
    panel.innerHTML = selecteur + _rendreTendances(data, nomDom, nomExt, matchId);
    requestAnimationFrame(() => _marquerSegmentsTronques(panel));
  } catch (e) {
    panel.innerHTML = selecteur + '<div class="txt2" style="font-size:.82rem">Erreur chargement des tendances</div>';
  }
}

// Bascule entre les 3 sous-onglets (Général/Dom/Ext) — les données sont
// déjà en cache (_cacheTendances), donc pas de nouvel appel réseau, juste
// un nouveau rendu du panneau avec le sous-onglet demandé.
function changerSousOngletTendances(matchId, periode, sousOnglet) {
  const panel = document.getElementById('dt-tendances-' + matchId);
  const card  = document.getElementById('mc-' + matchId);
  const data  = _cacheTendances[`${matchId}_${periode}`];
  if (!panel || !card || !data) return;

  const nomDom = card.querySelectorAll('.team-name')[0]?.textContent || 'Domicile';
  const nomExt = card.querySelectorAll('.team-name')[1]?.textContent || 'Extérieur';
  panel.innerHTML = _selecteurPeriodeHtml(matchId, periode) + _rendreTendances(data, nomDom, nomExt, matchId, sousOnglet);
  requestAnimationFrame(() => _marquerSegmentsTronques(panel));
}

// ── Key Takeaway — phrase d'analyse automatique en haut de Tendances ──
// Algorithme à règles (pas d'IA, pas d'appel réseau) : on parcourt une
// liste de critères par ordre de "force" du signal statistique, et on
// affiche le premier qui dépasse son seuil ET s'appuie sur un échantillon
// suffisant (nb_matchs >= 5, pour éviter un "100%" trompeur sur 1-2 matchs).
function _genererKeyTakeaway(data, nomDom, nomExt) {
  const g = data.general || {}, d = data.domicile || {}, e = data.exterieur || {};
  const suffixe = data.periode === 'toutes' ? '' : ' cette saison';
  const assez = b => b && b.nb_matchs >= 5;

  const regles = [
    () => assez(e) && e.btts_pct >= 65 &&
      `Dans ${_pctFr(e.btts_pct)}% des matchs de ${nomExt} à l'extérieur${suffixe}, les deux équipes marquent.`,
    () => assez(d) && d.btts_pct >= 65 &&
      `Dans ${_pctFr(d.btts_pct)}% des matchs de ${nomDom} à domicile${suffixe}, les deux équipes marquent.`,
    () => assez(d) && d.plus_2_5_pct >= 70 &&
      `${_pctFr(d.plus_2_5_pct)}% des matchs à domicile de ${nomDom} ont compté 3 buts ou plus au total (les 2 équipes cumulées)${suffixe}.`,
    () => assez(e) && e.plus_2_5_pct >= 70 &&
      `${_pctFr(e.plus_2_5_pct)}% des matchs à l'extérieur de ${nomExt} ont compté 3 buts ou plus au total (les 2 équipes cumulées)${suffixe}.`,
    () => assez(d) && d.victoires_pct >= 65 &&
      `${nomDom} remporte ${_pctFr(d.victoires_pct)}% de ses matchs à domicile${suffixe}.`,
    () => assez(e) && e.victoires_pct >= 50 &&
      `${nomExt} garde un bilan solide à l'extérieur : ${_pctFr(e.victoires_pct)}% de victoires${suffixe}.`,
    () => assez(d) && d.buts_encaisses_moy !== null && d.buts_encaisses_moy <= 0.8 &&
      `${nomDom} encaisse très peu à domicile : ${_pctFr(d.buts_encaisses_moy)} but/match en moyenne${suffixe}.`,
    () => assez(e) && e.buts_marques_moy !== null && e.buts_marques_moy >= 2 &&
      `${nomExt} marque beaucoup à l'extérieur : ${_pctFr(e.buts_marques_moy)} buts/match en moyenne${suffixe}.`,
    () => assez(g) && g.plus_2_5_pct >= 60 &&
      `${_pctFr(g.plus_2_5_pct)}% des matchs de Ligue 1${suffixe} comptent 3 buts ou plus.`,
    () => assez(d) &&
      `${nomDom} marque en moyenne ${d.buts_marques_moy != null ? _pctFr(d.buts_marques_moy) : '—'} but(s) par match à domicile${suffixe}.`,
  ];

  for (const regle of regles) {
    const resultat = regle();
    if (resultat) return resultat;
  }
  return null; // vraiment aucune donnée exploitable (tout juste promu, etc.)
}

function _rendreTendances(data, nomDom, nomExt, matchId, sousOnglet = 'general') {
  const suffixePeriode = data.periode === 'toutes' ? 'toutes saisons confondues' : 'cette saison';
  const takeaway = _genererKeyTakeaway(data, nomDom, nomExt);

  const contenuGeneral = `
    <div class="tendances-bloc">
      <div class="tendances-titre">🏆 Championnat</div>
      ${_badgeEchantillon(data.general, suffixePeriode)}
      ${_rendreBlocGeneral(data.general)}
    </div>
    ${data.possession ? `
    <div class="tendances-bloc">
      <div class="tendances-titre">⚽ Possession moyenne</div>
      ${data.possession.echantillon_reduit ? `<div class="tendances-souscadre"><span class="tendances-badge-reduit">échantillon réduit</span></div>` : ''}
      ${_rendrePossession(data.possession, nomDom, nomExt)}
    </div>` : ''}`;

  const contenuDom = `
    <div class="tendances-bloc">
      <div class="tendances-titre">🏠 ${nomDom} à domicile</div>
      ${_badgeEchantillon(data.domicile, suffixePeriode)}
      ${_rendreBlocClub(data.domicile)}
    </div>`;

  const contenuExt = `
    <div class="tendances-bloc">
      <div class="tendances-titre">✈️ ${nomExt} à l'extérieur</div>
      ${_badgeEchantillon(data.exterieur, suffixePeriode)}
      ${_rendreBlocClub(data.exterieur)}
    </div>`;

  const contenus = { general: contenuGeneral, dom: contenuDom, ext: contenuExt };

  return `
    ${takeaway ? `
    <div class="tendances-takeaway">
      <span class="tendances-takeaway-icone">💡</span>
      <div>
        <div class="tendances-takeaway-titre">Enseignement</div>
        <div class="tendances-takeaway-texte">${takeaway}</div>
      </div>
    </div>` : ''}
    <div class="tendances-sous-onglets">
      <button class="${sousOnglet === 'general' ? 'active' : ''}" onclick="changerSousOngletTendances(${matchId}, '${data.periode}', 'general')">Général</button>
      <button class="${sousOnglet === 'dom' ? 'active' : ''}" onclick="changerSousOngletTendances(${matchId}, '${data.periode}', 'dom')">${nomDom} (Dom)</button>
      <button class="${sousOnglet === 'ext' ? 'active' : ''}" onclick="changerSousOngletTendances(${matchId}, '${data.periode}', 'ext')">${nomExt} (Ext)</button>
    </div>
    ${contenus[sousOnglet] || contenuGeneral}
    <button class="tendances-fermer" onclick="fermerPanelInline('mc-${matchId}')">✕ Fermer</button>
  `;
}

// Ferme le panneau détail ouvert d'une carte match (H2H, Forme, Stats,
// Tendances, Pronos), utilisable depuis un bouton à l'intérieur du
// panneau lui-même — évite de devoir rescroller vers le bouton du pied
// de carte quand le contenu est long (cas de Tendances notamment)
function fermerPanelInline(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.remove('expanded');
  card.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
  card.querySelectorAll('.match-footer button').forEach(b => b.classList.remove('active'));
}

function _badgeEchantillon(bloc, suffixePeriode) {
  if (!bloc || bloc.nb_matchs === 0) return `<div class="tendances-souscadre"><span class="tendances-badge-reduit">aucune donnée ${suffixePeriode}</span></div>`;
  const texte = `${bloc.nb_matchs} match${bloc.nb_matchs > 1 ? 's' : ''} joué${bloc.nb_matchs > 1 ? 's' : ''} ${suffixePeriode}`;
  return `<div class="tendances-souscadre">${bloc.echantillon_reduit
    ? `<span class="tendances-badge-reduit">échantillon réduit — ${texte}</span>`
    : `<span class="tendances-nb-matchs">${texte}</span>`}</div>`;
}

function _rendreBlocGeneral(b) {
  if (!b || b.nb_matchs === 0) return '<div class="txt2" style="font-size:.8rem;text-align:center">Pas encore de données.</div>';
  return `
    <div class="tendances-gros-chiffre"><b>${b.buts_moy != null ? _pctFr(b.buts_moy) : '—'}</b><span>buts marqués par match en moyenne</span></div>
    ${_rendreRepartition(b.victoires_dom_pct, 'V. dom.', b.nuls_pct, 'Nuls', b.victoires_ext_pct, 'V. ext.')}
    ${_rendreJauge('3 buts ou plus sur le match', '+2,5 buts', b.plus_2_5_pct)}
    ${_rendreJauge('Les 2 équipes marquent', 'BTTS', b.btts_pct)}
    ${_rendreScoresFrequents(b.scores_frequents, 'score_dom', 'score_ext')}
  `;
}

function _rendreBlocClub(b) {
  if (!b || b.nb_matchs === 0) return '<div class="txt2" style="font-size:.8rem;text-align:center">Pas encore de données.</div>';
  return `
    <div class="tendances-repartition">
      <div class="tendances-repart-item"><b>${b.buts_marques_moy != null ? _pctFr(b.buts_marques_moy) : '—'}</b><span>Buts marqués/match</span></div>
      <div class="tendances-repart-item"><b>${b.buts_encaisses_moy != null ? _pctFr(b.buts_encaisses_moy) : '—'}</b><span>Buts encaissés/match</span></div>
    </div>
    ${_rendreRepartition(b.victoires_pct, 'Victoires', b.nuls_pct, 'Nuls', b.defaites_pct, 'Défaites')}
    ${_rendreDistributionButs(b.buts_repartition)}
    ${_rendreJauge('3 buts ou plus sur le match', '+2,5 buts', b.plus_2_5_pct)}
    ${_rendreJauge('Les 2 équipes marquent', 'BTTS', b.btts_pct)}
    ${_rendreJauge('Clean sheet', 'match sans encaisser le moindre but', b.clean_sheets_pct)}
    ${b.ecart_moy_victoire !== null ? `<div class="tendances-ligne">Écart de buts moyen en cas de victoire : <b>${_pctFr(b.ecart_moy_victoire)}</b></div>` : ''}
    ${_rendreScoresFrequents(b.scores_frequents, 'score_club', 'score_adv')}
  `;
}

// Répartition du nombre de buts marqués par match (0 / 1 / 2 / 3 / 4 et +)
function _rendreDistributionButs(rep) {
  if (!rep) return '';
  const buckets = [
    { pct: rep.buts_0,     label: '0',  couleur: 'var(--bleu-fonce)' },
    { pct: rep.buts_1,     label: '1',  couleur: 'var(--bleu-vif)' },
    { pct: rep.buts_2,     label: '2',  couleur: 'var(--bleu-clair)' },
    { pct: rep.buts_3,     label: '3',  couleur: 'var(--or)' },
    { pct: rep.buts_plus3, label: '4+', couleur: 'var(--rouge)' },
  ];
  const divs = buckets.map(s => {
    const texte = `${s.label} but${(s.label === '0' || s.label === '1') ? '' : 's'} : ${_pctFr(s.pct)}%`;
    return `<div class="tendances-segment" title="${texte}" data-full="${texte}" onclick="afficherTexteSegment(this)" style="width:${s.pct}%;background:${s.couleur}"><span>${texte}</span></div>`;
  }).join('');
  return `
    <div class="tendances-jauge">
      <div class="tendances-jauge-label">Nombre de buts marqués par match</div>
      <div class="tendances-repart-barre tendances-repart-barre-fine">${divs}</div>
    </div>`;
}

// Barre empilée à 3 segments (violet/gris/orange) + légende chiffrée en dessous
// Barre empilée à N segments, texte centré dans chaque segment
// Clic sur un segment de barre Tendances (mobile principalement, le
// survol PC est déjà géré nativement par l'attribut title)
function afficherTexteSegment(el) {
  afficherToast(el.dataset.full, 'ℹ️');
}

// Après affichage des barres, on mesure lesquels de leurs textes
// débordent réellement (impossible à savoir avant que le navigateur
// n'ait fait la mise en page) et on ajoute un soulignement pointillé
// uniquement sur ceux-là, pour signaler qu'on peut cliquer dessus
function _marquerSegmentsTronques(container) {
  container.querySelectorAll('.tendances-segment').forEach(seg => {
    const span = seg.querySelector('span');
    if (span && span.scrollWidth > seg.clientWidth) {
      seg.classList.add('tendances-segment-tronque');
    }
  });
}

function _rendreBarreSegments(segments) {
  const divs = segments.map(s => {
    const texte = `${s.pct}% ${s.texte}`;
    const classeExtra = s.classe ? ' ' + s.classe : '';
    return `<div class="tendances-segment${classeExtra}" title="${texte}" data-full="${texte}" onclick="afficherTexteSegment(this)" style="width:${s.pct}%;background:${s.couleur}"><span>${texte}</span></div>`;
  }).join('');
  return `<div class="tendances-repart-barre">${divs}</div>`;
}

function _rendreRepartition(pct1, label1, pct2, label2, pct3, label3) {
  return _rendreBarreSegments([
    { pct: pct1, texte: label1, couleur: 'var(--bleu-vif)' },
    { pct: pct2, texte: label2, couleur: 'var(--txt2)', classe: 'tendances-seg-gris' },
    { pct: pct3, texte: label3, couleur: 'var(--or)', classe: 'tendances-seg-orange' },
  ]);
}

// Jauge à 2 teintes de bleu, toujours pleine sur 100% de la largeur —
// affiche le % et son complément (ex: 69,8% / 30,2%) plutôt qu'une barre
// partiellement remplie qui donnait l'impression d'être incomplète
function _rendreJauge(label, sousLabel, pct) {
  const compl = Math.round((100 - pct) * 10) / 10;
  return `
    <div class="tendances-jauge">
      <div class="tendances-jauge-label">${label} <small>(${sousLabel})</small></div>
      <div class="tendances-repart-barre">
        <div class="tendances-segment" title="${_pctFr(pct)}%" data-full="${_pctFr(pct)}%" onclick="afficherTexteSegment(this)" style="width:${pct}%;background:var(--bleu-fonce)"><span>${_pctFr(pct)}%</span></div>
        <div class="tendances-segment" title="${_pctFr(compl)}%" data-full="${_pctFr(compl)}%" onclick="afficherTexteSegment(this)" style="width:${compl}%;background:var(--bleu-clair)"><span>${_pctFr(compl)}%</span></div>
      </div>
    </div>`;
}

function _pctFr(n) { return String(n).replace('.', ','); }

function _rendreScoresFrequents(scores, cleA, cleB) {
  if (!scores || !scores.length) return '';
  const chips = scores.map(s => `<span class="tendances-chip">${s[cleA]}-${s[cleB]} <i>(${s.nb})</i></span>`).join('');
  return `<div class="tendances-scores"><span>Scores les plus fréquents</span><div class="tendances-chips">${chips}</div></div>`;
}

// Possession : 2 jauges indépendantes plutôt qu'une barre empilée, car
// possession dom et possession ext viennent de matchs différents et ne
// totalisent pas forcément 100% ensemble
function _rendrePossession(p, nomDom, nomExt) {
  return `
    ${_rendreJauge(nomDom, 'possession moyenne à domicile', p.dom_moy ?? 0)}
    ${_rendreJauge(nomExt, "possession moyenne à l'extérieur", p.ext_moy ?? 0)}
  `;
}

function _detailBut(detail) {
  if (detail === 'Penalty') return ' (pen.)';
  if (detail === 'Own Goal') return ' (csc)';
  if (detail === 'Missed Penalty') return ' (pen. manqué)';
  return '';
}

function _rendreButsMatch(dom, ext) {
  const evt = (liste, side, type) => (liste || []).map(e => ({ ...e, side, type }));

  const tous = [
    ...evt(dom.buts,    'dom', 'goal'),
    ...evt(dom.cartons, 'dom', null).map(c => ({ ...c, type: c.detail === 'Red Card' ? 'red' : 'yellow' })),
    ...evt(ext.buts,    'ext', 'goal'),
    ...evt(ext.cartons, 'ext', null).map(c => ({ ...c, type: c.detail === 'Red Card' ? 'red' : 'yellow' })),
  ].sort((a, b) => a.minute - b.minute);

  const entetes = `
    <div class="stats-match-entetes">
      <span>${dom.nom}</span>
      <span>${ext.nom}</span>
    </div>`;

  if (!tous.length) return entetes;

  const estCSC  = e => e.type === 'goal' && e.detail === 'Own Goal';
  const icone   = e => e.type === 'goal' ? (estCSC(e) ? '<span class="ballon-csc">⚽</span>' : '⚽') : e.type === 'red' ? '🟥' : '🟨';
  const classeJoueur = e => 'timeline-joueur' + (estCSC(e) ? ' timeline-csc' : '');

  // Deux ordres différents selon le côté, pour une lecture symétrique de
  // part et d'autre de la ligne centrale : le nom du buteur reste toujours
  // collé à la ligne (à droite pour dom, à gauche pour ext), l'icône ballon
  // toujours à l'extérieur, le passeur (avec une petite icône chaussure)
  // toujours en bout de chaîne.
  const assistHtml = e => e.type === 'goal' && e.assist
    ? `<span class="timeline-assist" title="Passeur : ${e.assist}">(<span class="timeline-icone-chaussure">👟</span>${e.assist})</span>`
    : '';
  const joueurHtml = e => `<span class="${classeJoueur(e)}" title="${e.joueur}">${e.joueur}${e.type === 'goal' ? _detailBut(e.detail) : ''}</span>`;
  const iconeHtml  = e => `<span class="timeline-icone">${icone(e)}</span>`;

  const contenuDom = e => `${assistHtml(e)}${joueurHtml(e)}${iconeHtml(e)}`;
  const contenuExt = e => `${iconeHtml(e)}${joueurHtml(e)}${assistHtml(e)}`;

  return `
    ${entetes}
    <div class="timeline-match">
    ${tous.map(e => `
      <div class="timeline-row">
        <div class="timeline-side timeline-side-dom">${e.side === 'dom' ? contenuDom(e) : ''}</div>
        <div class="timeline-minute">${e.minute}'</div>
        <div class="timeline-side timeline-side-ext">${e.side === 'ext' ? contenuExt(e) : ''}</div>
      </div>`).join('')}
  </div>`;
}

function _parseValeurStat(v) {
  if (v === null || v === undefined || v === '') return { num: 0, texte: '—' };
  if (typeof v === 'string' && v.includes('%')) return { num: parseFloat(v) || 0, texte: v };
  const n = parseFloat(v);
  return { num: isNaN(n) ? 0 : n, texte: String(v) };
}

function _ligneStatMatch(label, vd, ve, inverse = false) {
  const d = _parseValeurStat(vd);
  const e = _parseValeurStat(ve);
  const total = d.num + e.num;
  const egalite = d.num === e.num;
  let domGagne = !egalite && d.num > e.num;
  if (inverse) domGagne = !egalite && d.num < e.num; // fautes/cartons : le plus faible est le "gagnant"
  const pctD = total > 0 ? (d.num / total) * 100 : 50;
  const pctE = 100 - pctD;

  const classeD = egalite ? 'stat-val-egalite stat-val-dom' : (domGagne ? 'stat-val-gagnant stat-val-dom' : 'stat-val-perdant stat-val-dom');
  const classeE = egalite ? 'stat-val-egalite stat-val-ext' : (!domGagne ? 'stat-val-gagnant stat-val-ext' : 'stat-val-perdant stat-val-ext');

  const barre = egalite
    ? `<div class="stat-barre"><div class="stat-barre-neutre" style="width:100%"></div></div>`
    : `<div class="stat-barre">
         <div class="stat-barre-dom" style="width:${pctD}%"></div>
         <div class="stat-barre-ext" style="width:${pctE}%"></div>
       </div>`;

  return `
    <div class="stat-ligne">
      <div class="stat-valeurs">
        <span class="stat-match-val ${classeD}">${d.texte}</span>
        <span class="stat-label">${label}</span>
        <span class="stat-match-val ${classeE}">${e.texte}</span>
      </div>
      ${barre}
    </div>`;
}

function _rendreStatsMatch(dom, ext) {
  const mapExt = {};
  (ext.stats || []).forEach(s => { mapExt[s.type] = s.value; });
  const mapDom = {};
  (dom.stats || []).forEach(s => { mapDom[s.type] = s.value; });

  const typesConnus = new Set(_GROUPES_STATS_MATCH.flatMap(g => g.types));
  const groupes = _GROUPES_STATS_MATCH.map(g => {
    const typesPresents = g.types.filter(t => mapDom[t] !== undefined || mapExt[t] !== undefined);
    return {
      titre: g.titre,
      nb: typesPresents.length,
      lignes: typesPresents.map(t => _ligneStatMatch(_LABELS_STATS_MATCH[t] || t, mapDom[t], mapExt[t], _STATS_INVERSEES.has(t))).join('')
    };
  }).filter(g => g.lignes);

  // Toute stat renvoyée par l'API mais pas encore classée dans un groupe
  // ci-dessus (nouveau champ, etc.) : on ne la perd pas, elle atterrit
  // dans un groupe "Autres" plutôt que de disparaître silencieusement.
  const autresTypes = (dom.stats || []).filter(s => s.type && !typesConnus.has(s.type) && !_STATS_MASQUEES.has(s.type));
  if (autresTypes.length) {
    groupes.push({
      titre: '📋 Autres',
      nb: autresTypes.length,
      lignes: autresTypes.map(s => _ligneStatMatch(_LABELS_STATS_MATCH[s.type] || s.type, mapDom[s.type], mapExt[s.type], _STATS_INVERSEES.has(s.type))).join('')
    });
  }

  const rendreGroupe = g => `
    <div class="stats-groupe">
      <div class="stats-groupe-titre">${g.titre}</div>
      <div class="stats-match-lignes">${g.lignes}</div>
    </div>`;

  // "Stats clés" (1er groupe) toujours visible ; le reste replié derrière
  // un bouton, pour ne pas noyer l'essentiel dans une longue liste — voir
  // l'idée du filtre "Stats clés / Toutes les stats" évoquée par l'utilisateur.
  const [principal, ...secondaires] = groupes;
  const nbSecondaires = secondaires.reduce((s, g) => s + g.nb, 0);

  return `
    ${principal ? rendreGroupe(principal) : ''}
    ${secondaires.length ? `
      <button class="stats-toggle-btn" onclick="this.closest('.detail-panel').querySelector('.stats-secondaires').classList.toggle('hidden'); this.classList.toggle('ouvert')">
        <span class="stats-toggle-txt-ferme">📊 Voir toutes les stats (+${nbSecondaires})</span>
        <span class="stats-toggle-txt-ouvert">🔼 Réduire</span>
      </button>
      <div class="stats-secondaires hidden">${secondaires.map(rendreGroupe).join('')}</div>
    ` : ''}`;
}

// ── Pronos du match ──
async function chargerPronosMatch(matchId, card) {
  const panel = document.getElementById(`dt-pronos-${matchId}`);
  if (!panel || panel.dataset.loaded) return;

  try {
    const data = await apiGet(`pronostics.php?action=match&match_id=${matchId}`);
    if (data.masques) {
      panel.innerHTML = `<div class="txt2 text-center" style="font-size:.82rem">
        🔒 Pronostics visibles après le coup d'envoi<br>
        <span style="font-size:.75rem">${data.nb} joueur${data.nb > 1 ? 's ont' : ' a'} pronostiqué</span>
      </div>`;
    } else {
      const pronos = data.pronostics || [];
      panel.innerHTML = pronos.length === 0
        ? '<div class="txt2" style="font-size:.82rem">Aucun pronostic</div>'
        : `<div style="display:flex;flex-direction:column;gap:6px">
            ${pronos.map(p => `
              <div style="display:grid;grid-template-columns:1fr 42px 100px 36px;align-items:center;gap:8px;font-size:.82rem">
                <div style="display:flex;align-items:center;gap:8px;overflow:hidden">
                  <div class="user-av" style="width:24px;height:24px;font-size:.65rem;flex-shrink:0">${p.initiales}</div>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.nom}</span>
                </div>
                <span class="txt2" style="text-align:right">${p.score_dom_pred}-${p.score_ext_pred}</span>
                <span style="text-align:center">${p.resultat ? `<span class="badge-${p.resultat}" style="font-size:.65rem">${badgeLabel(p.resultat)}</span>` : ''}</span>
                <span style="text-align:right">${p.points !== null ? `<span class="badge-pts">+${p.points}</span>` : ''}</span>
              </div>`).join('')}
          </div>`;
    }
    panel.dataset.loaded = '1';
  } catch (e) {
    if (panel) panel.innerHTML = '';
  }
}

// Incrémente/décrémente la valeur d'un champ de score via les boutons +/-,
// puis déclenche le même enregistrement que la saisie manuelle (onchange).
function ajusterScore(matchId, cote, delta) {
  const input = document.getElementById(`score-${cote}-${matchId}`);
  if (!input) return;
  let val = parseInt(input.value, 10);
  if (isNaN(val)) val = 0;
  val = Math.min(20, Math.max(0, val + delta));
  input.value = val;

  // Si les 2 cases étaient vides, un appui sur + remplit automatiquement
  // l'autre case à 0 (gain d'un clic pour saisir par ex. un score de 2-0 :
  // il suffit alors d'appuyer 2 fois sur + à gauche, l'autre passe à 0 seule)
  const autreCote = cote === 'dom' ? 'ext' : 'dom';
  const autreInput = document.getElementById(`score-${autreCote}-${matchId}`);
  if (autreInput && autreInput.value === '') {
    autreInput.value = 0;
  }

  saisirProno(matchId);
}

// ── Saisie pronostic ──
async function saisirProno(matchId) {
  const dom = parseInt(document.getElementById(`score-dom-${matchId}`)?.value);
  const ext = parseInt(document.getElementById(`score-ext-${matchId}`)?.value);
  if (isNaN(dom) || isNaN(ext)) return;

  try {
    const data = await apiPost('pronostics.php?action=saisir', {
      match_id: matchId, score_dom: dom, score_ext: ext
    });
    // Marquer visuellement
    document.getElementById(`score-dom-${matchId}`)?.classList.add('saisi');
    document.getElementById(`score-ext-${matchId}`)?.classList.add('saisi');
    const hint = document.getElementById(`score-dom-${matchId}`)
      ?.closest('.match-center')
      ?.querySelector('.prono-hint');
    if (hint) { hint.textContent = '✓ Pronostic enregistré'; hint.className = 'prono-hint ok'; }

    // Mettre à jour le compteur "👥" de la carte et le "X pronostiqué" en
    // haut de la journée, sans attendre un rechargement complet
    // (uniquement la 1ère fois : si le prono existait déjà, les totaux ne
    // changent pas, seul son contenu est modifié)
    const badge = document.querySelector(`#mc-${matchId} .match-nb-pronos-badge`);
    const estNouveauProno = badge && !badge.dataset.dejaCompte;
    if (estNouveauProno) {
      const n = parseInt(badge.textContent.replace(/\D/g, ''), 10) || 0;
      badge.textContent = `👥 ${n + 1}`;
      badge.dataset.dejaCompte = '1';

      const stats = document.getElementById('journee-stats');
      if (stats) {
        const m = stats.textContent.match(/^(\d+) matchs? · (\d+) pronostiqué/);
        if (m) {
          const nbMatchs = m[1], nbPronos = parseInt(m[2], 10) + 1;
          stats.textContent = `${nbMatchs} match${nbMatchs > 1 ? 's' : ''} · ${nbPronos} pronostiqué${nbPronos > 1 ? 's' : ''}`;
        }
      }
    }

    // Répercuter la modification dans le cache client des journées déjà
    // visitées (cacheMatchs) — sinon, revenir sur une journée déjà en
    // cache réaffiche l'ancienne valeur du prono au lieu de la nouvelle,
    // le cache n'étant jamais requêté à nouveau une fois rempli.
    for (const j in cacheMatchs) {
      const m = cacheMatchs[j]?.find(x => x.id === matchId);
      if (m) {
        m.mon_prono = { score_dom_pred: dom, score_ext_pred: ext, resultat: null, points: 0 };
        if (estNouveauProno) m.nb_pronos = (m.nb_pronos ?? 0) + 1;
        break;
      }
    }
  } catch (e) {
    console.warn('Erreur saisie prono:', e.message);
  }
}

// ── Mes pronos ──
async function chargerMesPronos() {
  const el = document.getElementById('mes-pronos-contenu');
  const sel = document.getElementById('select-journee-mes-pronos');
  if (sel && sel.value != (journeeMesPronos || '')) sel.value = journeeMesPronos || '';
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const url = 'pronostics.php?action=mes_pronos' + (journeeMesPronos ? `&journee=${journeeMesPronos}` : '');
    const data = await apiGet(url);
    const pronos = data.pronostics || [];

    if (pronos.length === 0) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>Aucun pronostic' + (journeeMesPronos ? ' pour cette journée' : ' encore saisi') + '</div>';
      return;
    }

    const total = pronos.reduce((s, p) => s + parseInt(p.points || 0), 0);
    const exacts = pronos.filter(p => p.resultat === 'exact').length;
    const bons   = pronos.filter(p => p.resultat === 'bon').length;

    el.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
        <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:12px 20px;text-align:center">
          <div class="pts-cell" style="font-size:1.4rem">${total}</div>
          <div class="txt2" style="font-size:.75rem">pts matchs</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:12px 20px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:var(--bleu-vif)">${exacts}</div>
          <div class="txt2" style="font-size:.75rem">scores exacts</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:12px 20px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:var(--or)">${bons}</div>
          <div class="txt2" style="font-size:.75rem">bons résultats</div>
        </div>
      </div>
      <table class="joueurs-table">
        <thead>
          <tr>
            <th style="text-align:left">Match</th>
            <th>J</th>
            <th>Mon prono</th>
            <th>Score réel</th>
            <th>Résultat</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${pronos.map(p => `
            <tr>
              <td style="text-align:left">${p.nom_dom} – ${p.nom_ext}</td>
              <td>${p.journee}</td>
              <td>${p.score_dom_pred}-${p.score_ext_pred}</td>
              <td>${p.statut === 'termine' ? `${p.score_dom}-${p.score_ext}` : '—'}</td>
              <td>${p.resultat ? `<span class="badge-${p.resultat}">${badgeLabel(p.resultat)}</span>` : '—'}</td>
              <td class="${p.resultat === 'exact' ? 'txt-vert' : p.resultat === 'bon' ? 'txt-or' : p.resultat === 'mauvais' ? 'txt-rouge' : 'txt3'} fw700">
                ${p.resultat ? (p.points > 0 ? `+${p.points}` : '0') : '—'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = msgErreur('Erreur : ' + e.message);
  }
}

// ============================================================
//  PAGE CLASSEMENT ÉQUIPES
// ============================================================
async function chargerClassementEquipes(mode) {
  const ids = { general: 'classement-general-contenu', domicile: 'classement-domicile-contenu', exterieur: 'classement-exterieur-contenu' };
  const el = document.getElementById(ids[mode]);
  if (!el || el.dataset.loaded) return;

  const actions = { general: 'equipes', domicile: 'equipes_domicile', exterieur: 'equipes_exterieur' };

  try {
    const data = await apiGet(`classement.php?action=${actions[mode]}`);
    el.innerHTML = renderClassementEquipes(data.classement || []);
    el.dataset.loaded = '1';
    _armerScrollHint(el);
  } catch (e) {
    el.innerHTML = msgErreur('Erreur : ' + e.message);
  }
}

function renderClassementEquipes(classement, surlignerIds) {
  if (!classement.length) return '<div class="empty-state"><div class="empty-icon">📊</div>Aucune donnée</div>';
  surlignerIds = surlignerIds || [];

  const qualifClass = {
    ldc:       'qualif-ldc',
    ldc_prelim:'qualif-ldc-prelim',
    europa:    'qualif-europa',
    conference:'qualif-conf',
    barrage:   'barrage',
    'relégation': 'relegue'
  };

  const favCoeurId = resoudreEquipeCoeurId(classement);

  // Records à surligner dans le tableau (gèrent les égalités : tous les
  // clubs à égalité sur le record sont surlignés, pas juste le premier).
  // On ne surligne rien tant qu'aucun match n'a été joué dans la saison :
  // sinon, avec des stats toutes à 0, chaque club est artificiellement
  // "à égalité de record" sur chaque colonne (0 = 0 partout), ce qui
  // surlignait tout le tableau au lieu de rien — d'où l'impression de
  // "graphisme différent" en début de saison.
  const saisonDemarree = classement.some(c => c.j > 0);
  const maxBP = saisonDemarree ? Math.max(...classement.map(c => c.bp)) : null;
  const minBC = saisonDemarree ? Math.min(...classement.map(c => c.bc)) : null;
  const maxG  = saisonDemarree ? Math.max(...classement.map(c => c.g))  : null;
  const maxN  = saisonDemarree ? Math.max(...classement.map(c => c.n))  : null;
  const maxP  = saisonDemarree ? Math.max(...classement.map(c => c.p))  : null;

  return `<div class="classement-scroll"><table class="classement-table">
    <thead>
      <tr>
        <th>#</th><th>Club</th><th>Pts</th><th>J</th><th>G</th><th>N</th><th>P</th>
        <th>BP</th><th>BC</th><th>±</th><th>Forme</th>
        <th title="Pénaltys marqués">Pen</th>
      </tr>
    </thead>
    <tbody>
      ${classement.map(c => {
        const qc = qualifClass[c.qualification] || '';
        const logo = c.logo_url
          ? `<img class="club-logo" src="${c.logo_url}" alt="${c.code}">`
          : `<span style="font-size:.7rem;color:var(--txt2)">${c.code}</span>`;
        const diff = c.diff > 0 ? `<span class="txt-vert">+${c.diff}</span>`
                   : c.diff < 0 ? `<span class="txt-rouge">${c.diff}</span>`
                   : `<span class="txt2">0</span>`;
        const forme = (c.forme || []).map(f =>
          `<div class="forme-dot ${f}"></div>`).join('');
        const estCoeur = favCoeurId !== null && c.id === favCoeurId;
        const estMatch = surlignerIds.includes(c.id);
        const nomEchappe = (c.nom || c.nom_court || '').replace(/'/g, "\\'");
        return `<tr class="${qc}${estCoeur ? ' coeur-row' : ''}${estMatch ? ' match-highlight-row' : ''}">
          <td class="rang${c.rang <= 3 ? ' top3' : ''}">${c.rang}</td>
          <td><div class="club-cell club-cell-clic" title="Voir l'effectif de ${c.nom_court}" onclick="ouvrirEffectif(${c.id}, '${nomEchappe}')">${logo}<span class="club-nom nom-qualif"><span class="club-nom-court">${c.nom_court}</span><span class="club-code-mobile">${c.code}</span></span>${estCoeur ? '<span class="coeur-etoile" title="Mon équipe de cœur">⭐</span>' : ''}</div></td>
          <td class="pts-cell">${c.pts}</td>
          <td>${c.j}</td>
          <td class="${c.g === maxG ? 'stat-record stat-record-vert' : ''}" title="${c.g === maxG ? 'Plus grand nombre de victoires' : ''}">${c.g}</td>
          <td class="${c.n === maxN ? 'stat-record stat-record-or' : ''}" title="${c.n === maxN ? 'Plus grand nombre de nuls' : ''}">${c.n}</td>
          <td class="${c.p === maxP ? 'stat-record stat-record-rouge' : ''}" title="${c.p === maxP ? 'Plus grand nombre de défaites' : ''}">${c.p}</td>
          <td class="${c.bp === maxBP ? 'stat-record stat-record-vert' : ''}" title="${c.bp === maxBP ? 'Meilleure attaque' : ''}">${c.bp}</td>
          <td class="${c.bc === minBC ? 'stat-record stat-record-vert' : ''}" title="${c.bc === minBC ? 'Meilleure défense' : ''}">${c.bc}</td>
          <td>${diff}</td>
          <td><div class="forme-cell">${forme}</div></td>
          <td>${c.pen > 0 ? c.pen : '<span class="txt2">—</span>'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table><div class="scroll-hint">›</div></div>`;
}

// ── Buteurs ──
async function chargerButeurs() {
  const el = document.getElementById('buteurs-contenu');
  if (!el || el.dataset.loaded) return;
  try {
    const data = await apiGet('stats.php?action=buteurs&limit=20');
    el.innerHTML = renderStatsJoueurs(data.buteurs || [], 'Buts', 'buts', true);
    el.dataset.loaded = '1';
    _armerScrollHint(el);
    _forcerLargeurColJoueur(el);
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

async function chargerPasseurs() {
  const el = document.getElementById('passeurs-contenu');
  if (!el || el.dataset.loaded) return;
  try {
    const data = await apiGet('stats.php?action=passeurs&limit=20');
    el.innerHTML = renderStatsJoueurs(data.passeurs || [], 'PD', 'passes_d', false);
    el.dataset.loaded = '1';
    _armerScrollHint(el);
    _forcerLargeurColJoueur(el);
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

// Applique la largeur de la colonne Joueur (PC) directement en JS, en
// complément du CSS — sécurité qui ne coûte rien maintenant que la vraie
// cause (la grille CSS qui écrasait le tableau, voir plus bas) est corrigée.
function _forcerLargeurColJoueur(el) {
  const appliquer = () => {
    const large = window.innerWidth >= 641;
    el.querySelectorAll('.joueur-nom-txt').forEach(span => {
      span.style.width = large ? '200px' : '';
    });
    el.querySelectorAll('.col-joueur').forEach(cell => {
      cell.style.width = large ? '210px' : '';
    });
  };
  appliquer();
  window.addEventListener('resize', appliquer);
}

// Affiche une flèche "› " tant qu'il reste du contenu à découvrir en
// glissant horizontalement, la masque une fois arrivé au bout
function _armerScrollHint(el) {
  const scroll = el.querySelector('.classement-scroll');
  const hint   = el.querySelector('.scroll-hint');
  if (!scroll || !hint) return;
  const maj = () => {
    const auBout = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 10;
    const rienAScroller = scroll.scrollWidth <= scroll.clientWidth + 2;
    hint.classList.toggle('hidden', auBout || rienAScroller);
  };
  maj();
  scroll.addEventListener('scroll', maj);
  window.addEventListener('resize', maj);
}

// Abrège le prénom d'un joueur si son nom complet est trop long pour la
// colonne (ex: "Pierre-Emerick Aubameyang" → "P.E. Aubameyang",
// "Ahmadou Bamba Dieng" → "A. Bamba Dieng") — seul le tout premier "mot"
// est abrégé (un prénom composé avec tiret devient plusieurs initiales),
// le reste du nom reste intact.
function _abregerNomJoueur(nom, maxLen = 20) {
  if (!nom || nom.length <= maxLen) return nom;
  const mots = nom.trim().split(' ');
  if (mots.length < 2) return nom;
  const [prenom, ...reste] = mots;
  const initiales = prenom.split('-').map(p => p.charAt(0).toUpperCase() + '.').join('');
  return `${initiales} ${reste.join(' ')}`;
}

function renderStatsJoueurs(joueurs, col1Label, col1Key, avecPen) {
  if (!joueurs.length) return '<div class="empty-state"><div class="empty-icon">⚽</div>Aucune donnée</div>';
  return `<div class="classement-scroll"><table class="classement-table stats-joueurs-table">
    <thead>
      <tr><th class="col-rang">#</th><th class="col-joueur">Joueur</th><th class="col-club">Club</th><th class="col-principal" title="${col1Label === 'PD' ? 'Passes décisives' : col1Label}">${col1Label}</th>${avecPen ? '<th class="col-pen" title="Buts sur pénalty">Pén.</th>' : ''}<th class="col-mj" title="Matchs joués">MJ</th><th class="col-moy" title="Moyenne par match">Moy</th></tr>
    </thead>
    <tbody>
      ${joueurs.map((j, i) => {
        const moy = j.matchs > 0 ? (j[col1Key] / j.matchs).toFixed(2) : '—';
        return `
        <tr>
          <td class="rang col-rang">${i + 1}</td>
          <td class="col-joueur joueur-nom" title="${j.nom}"><span class="joueur-nom-txt">${_abregerNomJoueur(j.nom)}</span></td>
          <td class="col-club">
            <div class="club-cell-inline">
              ${j.logo_club ? `<img class="club-logo" src="${j.logo_club}" alt="${j.club}">` : ''}
              <span class="club-nom-txt" title="${j.club || ''}">${j.club || '—'}</span>
            </div>
          </td>
          <td class="pts-cell col-principal">${j[col1Key]}</td>
          ${avecPen ? `<td class="stat-fort col-pen">${j.penalites > 0 ? j.penalites : '—'}</td>` : ''}
          <td class="stat-fort col-mj">${j.matchs}</td>
          <td class="stat-moy col-moy">${moy}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table><div class="scroll-hint">›</div></div>`;
}

// ============================================================
//  PAGE CHAMPIONNAT
// ============================================================
let filtreProgramme = 'normal';

// Mini-nav interne de l'onglet Classement (2e niveau de la cascade) — affiche
// la vue demandée, masque les autres, et charge ses données une seule fois
// (elles restent en mémoire dans le DOM, contrairement au filtre Programme
// qui recharge à chaque clic).
function changerVueClassement(vue) {
  document.querySelectorAll('#sub-classement .filtre-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vue === vue);
  });
  document.querySelectorAll('#sub-classement > div[id^="vue-"]').forEach(d => d.classList.add('hidden'));
  document.getElementById('vue-' + vue).classList.remove('hidden');
  document.getElementById('classement-legende')?.classList.toggle('hidden', vue === 'buteurs');

  switch (vue) {
    case 'domicile':  chargerClassementEquipes('domicile');  break;
    case 'exterieur': chargerClassementEquipes('exterieur'); break;
    case 'attaque':   chargerClassementTrie('attaque'); break;
    case 'defense':   chargerClassementTrie('defense'); break;
    case 'buteurs':   chargerButeurs(); chargerPasseurs(); break;
    // 'general' est déjà chargé à l'ouverture de l'onglet Classement (showSub)
  }
}

// Classements "Attaque" (meilleures attaques, tri par BP décroissant) et
// "Défense" (meilleures défenses, tri par BC croissant) : pas de nouveau
// mode côté backend — on repart du classement général déjà calculé (qui
// contient déjà bp/bc pour chaque club) et on le re-trie + renumérote côté
// client. Le code couleur qualification (LDC/Europa/...) reste celui de la
// vraie position au classement général, pas de la position dans cette vue.
async function chargerClassementTrie(critere) {
  const ids = { attaque: 'classement-attaque-contenu', defense: 'classement-defense-contenu' };
  const el = document.getElementById(ids[critere]);
  if (!el || el.dataset.loaded) return;

  try {
    const data = await apiGet('classement.php?action=equipes');
    const classement = [...(data.classement || [])];
    classement.sort((a, b) => critere === 'attaque' ? b.bp - a.bp : a.bc - b.bc);
    classement.forEach((c, i) => { c.rang = i + 1; });
    el.innerHTML = renderClassementEquipes(classement);
    el.dataset.loaded = '1';
    _armerScrollHint(el);
  } catch (e) {
    el.innerHTML = msgErreur('Erreur : ' + e.message);
  }
}

function changerFiltreProgramme(filtre) {
  if (filtre === filtreProgramme) return;
  filtreProgramme = filtre;
  document.querySelectorAll('.filtre-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filtre === filtre);
  });
  const el = document.getElementById('programme-contenu');
  if (el) delete el.dataset.loaded; // force le rechargement
  chargerProgramme();
}

async function chargerProgramme() {
  const el = document.getElementById('programme-contenu');
  if (!el || el.dataset.loaded === filtreProgramme) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';
  try {
    const limite = filtreProgramme === 'retard' ? '' : '&limit=30';
    const data = await apiGet(`matches.php?action=programme&filtre=${filtreProgramme}${limite}`);
    const matchs = data.matchs || [];
    if (!matchs.length) {
      const messages = {
        normal: 'Aucun match à venir',
        retard: 'Aucun match en retard 👍',
        tout:   'Aucun match à venir ni en retard',
      };
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div>${messages[filtreProgramme]}</div>`;
      el.dataset.loaded = filtreProgramme;
      return;
    }
    // Grouper par journée (journée d'origine si le match a été reporté,
    // pour rester cohérent avec le calendrier initial)
    const parJournee = {};
    matchs.forEach(m => {
      const j = m.journee_initiale ?? m.journee;
      if (!parJournee[j]) parJournee[j] = [];
      parJournee[j].push(m);
    });
    el.innerHTML = Object.entries(parJournee).map(([j, ms]) => `
      <div class="section-title" style="margin-bottom:10px">Journée ${j}</div>
      <div class="match-liste mb16">
        ${ms.map(m => {
          const estReporte = m.statut === 'reporte';
          const logoDom = m.logo_dom ? `<img class="club-logo" src="${m.logo_dom}" alt="${m.code_dom}">` : '';
          const logoExt = m.logo_ext ? `<img class="club-logo" src="${m.logo_ext}" alt="${m.code_ext}">` : '';
          return `
          <div class="match-ligne${estReporte ? ' reporte' : ''}">
            <span class="ml-date txt2">${estReporte ? 'Date à venir' : formatJourHeure(m.date)}</span>
            <span class="ml-equipe-dom">${logoDom}<span>${m.nom_dom}</span></span>
            <span class="ml-score txt2">${estReporte ? '⚠️' : 'vs'}</span>
            <span class="ml-equipe-ext"><span>${m.nom_ext}</span>${logoExt}</span>
            <span class="ml-j txt2">${estReporte ? 'Reporté' : `J${m.journee}`}</span>
          </div>`;
        }).join('')}
      </div>`).join('');
    el.dataset.loaded = filtreProgramme;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

async function chargerResultats() {
  const el = document.getElementById('resultats-contenu');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';
  const sel = document.getElementById('select-journee-resultats');
  if (sel) sel.value = journeeResultats;
  try {
    const data = await apiGet(`matches.php?action=journee&journee=${journeeResultats}`);
    const matchs = data.matchs || [];
    el.innerHTML = `<div class="match-liste">
      ${matchs.map(m => {
        const score = m.statut === 'termine' ? `${m.score_dom}-${m.score_ext}` : 'vs';
        const logoDom = m.logo_dom ? `<img class="club-logo" src="${m.logo_dom}" alt="${m.code_dom}">` : '';
        const logoExt = m.logo_ext ? `<img class="club-logo" src="${m.logo_ext}" alt="${m.code_ext}">` : '';
        return `<div class="match-ligne">
          <span class="ml-date">${formatJourHeure(m.date)}</span>
          <span class="ml-equipe-dom">${logoDom}<span>${m.court_dom || m.nom_dom}</span></span>
          <span class="ml-score${m.statut === 'termine' ? '' : ' txt2'}">${score}</span>
          <span class="ml-equipe-ext"><span>${m.court_ext || m.nom_ext}</span>${logoExt}</span>
          <span class="ml-j txt2">J${m.journee}</span>
        </div>`;
      }).join('')}
    </div>`;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

function changeJourneeResultats(delta) {
  let nouvelle = journeeResultats + delta;
  nouvelle = Math.max(1, Math.min(nbJournees, nouvelle));
  if (nouvelle === journeeResultats) return;
  journeeResultats = nouvelle;
  const sel = document.getElementById('select-journee-resultats');
  if (sel) sel.value = nouvelle;
  chargerResultats();
}

async function chargerGrille() {
  const el = document.getElementById('grille-contenu');
  if (!el || el.dataset.loaded) return;
  try {
    const [dataGrille, dataClubs] = await Promise.all([
      apiGet('matches.php?action=grille'),
      apiGet('clubs.php?action=liste'),
    ]);
    const clubs  = dataClubs.clubs || [];
    const matchs = dataGrille.matchs || [];

    if (!clubs.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📐</div>Aucun club synchronisé pour cette saison</div>';
      return;
    }

    // Construire map des scores
    const scores = {};
    matchs.forEach(m => { scores[`${m.club_dom_id}_${m.club_ext_id}`] = m; });

    const favId = resoudreEquipeCoeurId(clubs);

    el.innerHTML = `<table class="grille-table">
      <thead>
        <tr>
          <th class="grille-th-dom">Dom ╲ Ext</th>
          ${clubs.map(c => `
            <th title="${c.nom}" class="${favId && c.id === favId ? 'coeur-col' : ''}">
              ${c.logo_url ? `<img class="grille-logo" src="${c.logo_url}" alt="${c.code}">` : ''}
              <span class="grille-code-ext">${c.code}</span>
            </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${clubs.map(dom => `
          <tr class="${favId && dom.id === favId ? 'coeur-row' : ''}">
            <th class="grille-th-dom">
              ${dom.logo_url ? `<img class="grille-logo" src="${dom.logo_url}" alt="${dom.code}">` : ''}
              <span class="grille-nom-dom">${dom.nom_court}</span>
              <span class="grille-code-dom">${dom.code}</span>
            </th>
            ${clubs.map(ext => {
              const clCoeur = favId && ext.id === favId ? ' coeur-col' : '';
              if (dom.id === ext.id) return `<td class="diag${clCoeur}"></td>`;
              const m = scores[`${dom.id}_${ext.id}`];
              if (!m) return `<td class="txt3${clCoeur}">·</td>`;
              const cls = m.score_dom > m.score_ext ? 'dom'
                        : m.score_ext > m.score_dom ? 'ext' : 'nul';
              return `<td class="${cls}${clCoeur}"><span class="grille-score-badge">${m.score_dom}-${m.score_ext}</span></td>`;
            }).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;
    el.dataset.loaded = '1';
    _armerHoverGrille(el.querySelector('.grille-table'));
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

// Survol d'une case de la grille complète : teinte toute la ligne (via
// CSS tr:hover, gratuit) ET toute la colonne (nécessite du JS, une
// colonne n'ayant pas d'équivalent DOM direct à cibler en CSS pur) —
// une classe posée sur chaque cellule de même index plutôt qu'un
// sélecteur dynamique, pour rester simple et compatible partout.
function _armerHoverGrille(table) {
  if (!table) return;
  const lignes = Array.from(table.rows);
  table.querySelectorAll('td, th').forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      const idx = cell.cellIndex;
      cell.parentElement.querySelectorAll('td, th').forEach(c => c.classList.add('grille-hover-row'));
      lignes.forEach(tr => {
        const c = tr.children[idx];
        if (c) c.classList.add('grille-hover-col');
      });
    });
    cell.addEventListener('mouseleave', () => {
      table.querySelectorAll('.grille-hover-row').forEach(c => c.classList.remove('grille-hover-row'));
      table.querySelectorAll('.grille-hover-col').forEach(c => c.classList.remove('grille-hover-col'));
    });
  });
}

// ============================================================
//  PAGE JOUEURS
// ============================================================
// ============================================================
//  PODIUM — groupes de points distincts (gère les ex-aequo).
//  Ex : si 2 joueurs sont à égalité en tête, ils partagent tous les
//  deux la marche 1 ; le rang 3 réel commence après eux, etc.
//  Logique portée de CDM.
// ============================================================
function afficherPodium(classement, elPodium) {
  const couleurOr     = '#DAA520';
  const couleurArgent = '#707070';
  const couleurBronze = '#B34700';

  if (classement.length < 2) {
    elPodium.innerHTML = '<p class="vide">Pas encore assez de joueurs</p>';
    return null;
  }

  const degradeOr     = 'linear-gradient(160deg, #FFD700 0%, #FFA500 100%)';
  const degradeArgent = 'linear-gradient(160deg, #E8E8E8 0%, #909090 100%)';
  const degradeBronze = 'linear-gradient(160deg, #E8A045 0%, #B05A10 100%)';

  // Classement déjà trié par pts_total DESC côté serveur — on regroupe
  // simplement les joueurs consécutifs qui partagent le même total.
  const groupesPoints = [];
  classement.forEach(j => {
    const pts = parseInt(j.pts_total);
    let g = groupesPoints.find(g => g.pts === pts);
    if (!g) { g = { pts, joueurs: [] }; groupesPoints.push(g); }
    g.joueurs.push(j);
  });

  const groupe1 = groupesPoints[0] ? groupesPoints[0].joueurs : [];
  const groupe2 = groupesPoints[1] ? groupesPoints[1].joueurs : [];
  const groupe3 = groupesPoints[2] ? groupesPoints[2].joueurs : [];

  const rang1 = 1;
  const rang2 = rang1 + groupe1.length;
  const rang3 = rang2 + groupe2.length;

  function fondClairPour(couleur) {
    return couleur === couleurOr ? '#FDE68A' : couleur === couleurArgent ? '#D1D5DB' : '#FDBA74';
  }

  function ligneJoueur(joueur, couleur) {
    const estMoi = userInfo && joueur.id == userInfo.id;
    const nom = joueur.nom + (estMoi ? ' ★' : '');
    return `<div style="
        background:${fondClairPour(couleur)};
        border:2px solid ${couleur};
        border-radius:20px;
        padding:3px 12px;
        margin-bottom:4px;
        font-size:12px;font-weight:700;
        color:#1a1a18;
        box-shadow:0 2px 6px rgba(0,0,0,0.15);
        white-space:nowrap;
      ">${nom}</div>`;
  }

  function colonneJoueurs(joueurs, rang, couleur, hauteur, couronne) {
    if (!joueurs.length) {
      return `<div class="pod-col">
        <div class="pod-barre" style="height:${hauteur};background:${couleur};opacity:.4;border-radius:8px 8px 0 0">
          <span class="pod-rang">${rang}</span>
        </div></div>`;
    }
    const exaequo = joueurs.length > 1;
    const pts = joueurs[0].pts_total;
    const rangLabel = rang + (exaequo ? 'ex' : '');

    const affiches  = joueurs.slice(0, 2);
    const restants   = joueurs.length - affiches.length;
    const lignes     = affiches.map(j => ligneJoueur(j, couleur)).join('');
    const suffixe    = restants > 0
      ? `<div style="font-size:11px;font-weight:700;color:#1a1a18;margin-bottom:4px;
           background:${fondClairPour(couleur)};border:2px solid ${couleur};
           border-radius:12px;padding:2px 10px;">+ ${restants} autre${restants > 1 ? 's' : ''}</div>`
      : '';

    const degrade = couleur === couleurOr ? degradeOr : couleur === couleurArgent ? degradeArgent : degradeBronze;

    return `<div class="pod-col">
        ${couronne ? '<div class="couronne">👑</div>' : ''}
        ${lignes}${suffixe}
        <div style="font-size:13px;font-weight:700;color:${couleur};margin:5px 0">${pts} pts</div>
        <div class="pod-barre" style="height:${hauteur};background:${degrade}">
          <span class="pod-rang">${rangLabel}</span>
        </div>
      </div>`;
  }

  elPodium.innerHTML = `<div class="podium-wrap">
      ${colonneJoueurs(groupe2, rang2, couleurArgent, '75px',  false)}
      ${colonneJoueurs(groupe1, rang1, couleurOr,     '110px', true)}
      ${colonneJoueurs(groupe3, rang3, couleurBronze,  '52px', false)}
    </div>`;

  // Retourné pour permettre au tableau ci-dessous de reprendre les mêmes
  // couleurs/rangs sur les lignes correspondantes (badges podium)
  return { rang1, rang2, rang3, couleurOr, couleurArgent, couleurBronze };
}

// Pour un rang donné, renvoie {couleur, fond} si ce rang fait partie du
// podium (1/2/3ᵉ marche selon groupes de points), sinon null.
function couleurPodiumPourRang(rang, podiumInfo) {
  if (!podiumInfo) return null;
  const map = {
    [podiumInfo.rang1]: { couleur: podiumInfo.couleurOr,     fond: '#FDE68A' },
    [podiumInfo.rang2]: { couleur: podiumInfo.couleurArgent, fond: '#D1D5DB' },
    [podiumInfo.rang3]: { couleur: podiumInfo.couleurBronze, fond: '#FDBA74' },
  };
  return map[rang] || null;
}

// ── Classement joueurs : avec ou sans bonus (préparation — bascule dispo,
// le backend classement.php doit gérer le paramètre avec_bonus) ──
let avecBonusJoueurs = true;

function toggleBonusJoueurs(avecBonus) {
  if (avecBonus === avecBonusJoueurs) return;
  avecBonusJoueurs = avecBonus;
  document.getElementById('btn-avec-bonus').classList.toggle('active', avecBonus);
  document.getElementById('btn-sans-bonus').classList.toggle('active', !avecBonus);
  document.getElementById('joueurs-table-contenu').dataset.loaded = '';
  chargerClassementJoueurs();
}

// ── Classement joueurs : barème classique ou "avec cotes" (points_alt —
// le résultat multiplié par la cote bookmaker figée au coup d'envoi) ──
let avecCotesJoueurs = false;

function toggleCotesJoueurs(avecCotes) {
  if (avecCotes === avecCotesJoueurs) return;
  avecCotesJoueurs = avecCotes;
  document.getElementById('btn-classique').classList.toggle('active', !avecCotes);
  document.getElementById('btn-avec-cotes').classList.toggle('active', avecCotes);
  document.getElementById('joueurs-table-contenu').dataset.loaded = '';
  chargerClassementJoueurs();
}

// Génère un <th> avec 2 versions : texte (visible PC) et icône (visible
// mobile, cf. règle CSS .joueurs-table th .th-txt/.th-icon) — pour icone,
// séparer 2 emojis par un <br> pour un empilement vertical (ex: Buts D/E)
function _thTexteIcone(texte, icone, titre) {
  const t = titre ? ` title="${titre}"` : '';
  return `<th${t}><span class="th-txt">${texte}</span><span class="th-icon">${icone}</span></th>`;
}

// Variante à 2 icônes (ex: 🏠+⚽, ✈️+⚽) — empilées verticalement sur
// mobile (colonnes étroites), côte à côte sur PC (colonnes plus larges) ;
// disposition gérée en CSS via .th-icon-combo, pas de <br> ici
function _thIconeCombo(texte, icone1, icone2, titre) {
  const t = titre ? ` title="${titre}"` : '';
  return `<th${t}><span class="th-txt">${texte}</span><span class="th-icon th-icon-combo"><span>${icone1}</span><span>${icone2}</span></span></th>`;
}

async function chargerClassementJoueurs() {
  const elPodium = document.getElementById('podium-contenu');
  const elTable  = document.getElementById('joueurs-table-contenu');
  if (elTable.dataset.loaded) return;

  try {
    const data = await apiGet(`classement.php?action=joueurs&avec_bonus=${avecBonusJoueurs ? 1 : 0}&avec_cotes=${avecCotesJoueurs ? 1 : 0}`);
    const classement = data.classement || [];
    chargerStatsHeader();

    const podiumInfo = afficherPodium(classement, elPodium);

    // Compte combien de joueurs partagent chaque rang, pour savoir s'il
    // faut afficher le suffixe "ex" (ex: "1ex" si 2 joueurs sont 1ers)
    const compteParRang = {};
    classement.forEach(j => { compteParRang[j.rang] = (compteParRang[j.rang] || 0) + 1; });

    // Tableau complet
    elTable.innerHTML = `
      <table class="joueurs-table">
        <thead>
          <tr>
            <th>#</th><th>Joueur</th><th>Pts</th>
            ${_thTexteIcone('Pronos', '📋', 'Pronostics joués')}
            ${_thTexteIcone('Exacts', '🎯', 'Scores exacts')}
            ${_thTexteIcone('Bons', '✅', 'Bons résultats')}
            ${_thTexteIcone('Écart', '↔️', 'Bonus : écart de buts juste')}
            ${_thIconeCombo('Buts D', '🏠', '⚽', "Bonus : nombre de buts de l'équipe à domicile juste")}
            ${_thIconeCombo('Buts E', '✈️', '⚽', "Bonus : nombre de buts de l'équipe à l'extérieur juste")}
            <th title="Champion de journée">🏆</th>
            ${_thTexteIcone('Bonus', '🎁', 'Total des points bonus')}
          </tr>
        </thead>
        <tbody>
          ${classement.map(j => {
            const rangLabel = j.rang + (compteParRang[j.rang] > 1 ? 'ex' : '');
            const podiumCouleur = couleurPodiumPourRang(j.rang, podiumInfo);
            const nomAffiche = podiumCouleur
              ? `<span style="background:${podiumCouleur.fond};border:2px solid ${podiumCouleur.couleur};
                   border-radius:14px;padding:2px 10px;font-weight:700;color:#1a1a18;white-space:nowrap">${j.nom}</span>`
              : j.nom;
            return `
            <tr>
              <td class="rang${j.rang <= 3 ? ' top3' : ''}">${rangLabel}</td>
              <td><div class="user-cell">
                <div class="user-av">${j.initiales}</div>
                ${nomAffiche}
              </div></td>
              <td class="pts-cell">${avecCotesJoueurs ? j.pts_total.toFixed(2) : j.pts_total}</td>
              <td>${j.nb_pronos}</td>
              <td class="txt-bleu fw700">${j.nb_exacts}</td>
              <td class="txt-or fw700">${j.nb_bons}</td>
              <td class="txt2">${j.nb_ecart}</td>
              <td class="txt2">${j.nb_buts_dom}</td>
              <td class="txt2">${j.nb_buts_ext}</td>
              <td class="txt-or fw700">${j.pts_champion_journee}</td>
              <td class="txt2">${j.pts_bonus}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    elTable.dataset.loaded = '1';
  } catch (e) {
    elTable.innerHTML = msgErreur(e.message);
  }
}

async function chargerClassementJournee() {
  const el = document.getElementById('joueurs-journee-contenu');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';
  const sel = document.getElementById('select-journee-joueurs');
  if (sel) sel.value = journeeJoueurs;
  try {
    const data = await apiGet(`classement.php?action=joueurs_journee&journee=${journeeJoueurs}`);
    const classement = data.classement || [];
    const maxPts = data.max_pts || 0;
    if (!classement.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏆</div>Aucun résultat pour cette journée</div>';
      return;
    }
    const compteParRang = {};
    classement.forEach(j => { compteParRang[j.rang] = (compteParRang[j.rang] || 0) + 1; });

    el.innerHTML = `
      <table class="joueurs-table">
        <thead>
          <tr>
            <th>#</th><th>Joueur</th><th>Pts</th>
            ${_thTexteIcone('Pronos', '📋', 'Pronostics joués')}
            ${_thTexteIcone('Exacts', '🎯', 'Scores exacts')}
            ${_thTexteIcone('Bons', '✅', 'Bons résultats')}
            ${_thTexteIcone('Écart', '↔️', 'Bonus : écart de buts juste')}
            ${_thIconeCombo('Buts D', '🏠', '⚽', "Bonus : nombre de buts de l'équipe à domicile juste")}
            ${_thIconeCombo('Buts E', '✈️', '⚽', "Bonus : nombre de buts de l'équipe à l'extérieur juste")}
            <th title="Champion de journée">🏆</th>
          </tr>
        </thead>
        <tbody>
          ${classement.map(j => {
            const estChampion = maxPts > 0 && j.pts_total === maxPts;
            const rangLabel = j.rang + (compteParRang[j.rang] > 1 ? 'ex' : '');
            return `
            <tr${estChampion ? ' class="ligne-champion"' : ''}>
              <td class="rang${j.rang <= 3 ? ' top3' : ''}">${rangLabel}</td>
              <td><div class="user-cell"><div class="user-av">${j.initiales}</div>${j.nom}${estChampion ? ' <span title="Champion de journée">👑</span>' : ''}</div></td>
              <td class="pts-cell">${j.pts_total}</td>
              <td>${j.nb_pronos}</td>
              <td class="txt-bleu fw700">${j.nb_exacts}</td>
              <td class="txt-or fw700">${j.nb_bons}</td>
              <td class="txt2">${j.nb_ecart}</td>
              <td class="txt2">${j.nb_buts_dom}</td>
              <td class="txt2">${j.nb_buts_ext}</td>
              <td class="txt-or fw700">${j.pts_champion_journee}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

function changeJourneeJoueurs(delta) {
  let nouvelle = journeeJoueurs + delta;
  nouvelle = Math.max(1, Math.min(nbJournees, nouvelle));
  if (nouvelle === journeeJoueurs) return;
  journeeJoueurs = nouvelle;
  const sel = document.getElementById('select-journee-joueurs');
  if (sel) sel.value = nouvelle;
  chargerClassementJournee();
}

// ============================================================
//  PAGE PODIUM — STATS (taux de réussite du groupe + par joueur)
// ============================================================
function _pct(val, total) {
  return total ? Math.round(100 * val / total) + '%' : '0%';
}

async function chargerStatsParieurs() {
  const el = document.getElementById('stats-parieurs-contenu');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('classement.php?action=taux_reussite');
    const t = data.totaux || {};
    const joueurs = data.joueurs || [];
    const me = data.match_plus_exact;

    let ligneMatch = '';
    if (me) {
      const exactLabel = me.nb_exacts > 1 ? 'exacts' : 'exact';
      ligneMatch = `
        <div class="stats-ligne stats-ligne-match">
          <span class="lbl">Match le plus souvent trouvé en exact</span>
          <span class="val" style="color:var(--txt)">${me.nom_dom} ${me.score_dom}-${me.score_ext} ${me.nom_ext}
            <span class="pct">(${me.nb_exacts} ${exactLabel})</span></span>
        </div>`;
    }

    const cardGroupe = `
      <div class="stats-card">
        <div class="stats-card-titre">🎯 Pronostics du groupe</div>
        <div class="stats-ligne">
          <span class="lbl">Pronostics joués</span>
          <span class="val">${t.total || 0}<span class="pct">${t.nb_joueurs || 0} participants</span></span>
        </div>
        <div class="stats-ligne">
          <span class="lbl">Scores exacts (5 pts)</span>
          <span class="val">${t.nb_exacts || 0}<span class="pct">${_pct(t.nb_exacts, t.total)}</span></span>
        </div>
        <div class="stats-ligne">
          <span class="lbl">Bon résultat (3 pts)</span>
          <span class="val">${t.nb_bons || 0}<span class="pct">${_pct(t.nb_bons, t.total)}</span></span>
        </div>
        <div class="stats-ligne">
          <span class="lbl">Pronostics manqués</span>
          <span class="val" style="color:var(--rouge)">${t.nb_faux || 0}<span class="pct">${_pct(t.nb_faux, t.total)}</span></span>
        </div>
        ${ligneMatch}
      </div>`;

    let rowsTaux;
    if (joueurs.length) {
      rowsTaux = joueurs.map((j, i) => {
        const medaille = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
        const exBons = j.nb_exacts + j.nb_bons;
        return `
          <tr>
            <td>${medaille} ${j.nom}</td>
            <td>
              <div class="stats-taux-pct" style="color:var(--bleu-vif)">${_pct(exBons, j.nb_pronos)}</div>
              <div class="stats-taux-sous">${exBons}/${j.nb_pronos}</div>
            </td>
            <td>
              <div class="stats-taux-pct" style="color:var(--bleu-vif)">${_pct(j.nb_exacts, j.nb_pronos)}</div>
              <div class="stats-taux-sous">${j.nb_exacts}/${j.nb_pronos}</div>
            </td>
            <td>
              <div class="stats-taux-pct" style="color:var(--or)">${_pct(j.nb_bons, j.nb_pronos)}</div>
              <div class="stats-taux-sous">${j.nb_bons}/${j.nb_pronos}</div>
            </td>
          </tr>`;
      }).join('');
    } else {
      rowsTaux = '<tr><td colspan="4" class="empty-state" style="padding:20px">Aucune donnée</td></tr>';
    }

    const cardTaux = `
      <div class="stats-card">
        <div class="stats-card-titre">🏆 Taux de réussite par joueur</div>
        <table class="stats-taux-table">
          <thead>
            <tr><th>Joueur</th><th>Exacts+Bons</th><th style="color:var(--bleu-vif)">Exacts</th><th style="color:var(--or)">Bons</th></tr>
          </thead>
          <tbody>${rowsTaux}</tbody>
        </table>
      </div>`;

    el.innerHTML = cardGroupe + cardTaux;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

// ============================================================
//  PAGE PODIUM — ÉVOLUTION (rangs + cumul de points par journée)
//  Graphiques SVG faits maison, échelle volontairement généreuse
//  pour rester lisible avec peu de joueurs.
// ============================================================
const PALETTE_JOUEURS = ['#00A550', '#3B82F6', '#F5A623', '#E03030', '#A855F7', '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#EAB308'];
let _evolutionData = null;   // cache journees/joueurs pour re-dessiner sans re-requêter
let _echelleCumul  = 2;      // multiplicateur d'échelle verticale du graphique de cumul (1/2/3)

async function chargerEvolution() {
  const el = document.getElementById('evolution-contenu');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('classement.php?action=evolution');
    if (!(data.journees || []).length || !(data.joueurs || []).length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div>Pas encore assez de journées jouées pour un graphique</div>';
      return;
    }
    _evolutionData = data;
    _rendreEvolution();
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

function changerEchelleCumul(val) {
  _echelleCumul = parseInt(val, 10);
  _rendreEvolution();
}

function _rendreEvolution() {
  const el = document.getElementById('evolution-contenu');
  if (!_evolutionData) return;
  const { journees, joueurs } = _evolutionData;

  el.innerHTML = `
    <div class="evolution-section">
      <div class="evolution-titre">📈 Évolution des rangs</div>
      <div class="evolution-scroll">${_svgEvolutionRangs(journees, joueurs)}</div>
    </div>
    <div class="evolution-section">
      <div class="evolution-entete">
        <div class="evolution-titre" style="margin-bottom:0">📊 Cumul de points</div>
        <div class="evolution-echelle">
          <label for="select-echelle-cumul">Échelle</label>
          <select id="select-echelle-cumul" onchange="changerEchelleCumul(this.value)">
            <option value="1" ${_echelleCumul === 1 ? 'selected' : ''}>Compacte (×1)</option>
            <option value="2" ${_echelleCumul === 2 ? 'selected' : ''}>Normale (×2)</option>
            <option value="3" ${_echelleCumul === 3 ? 'selected' : ''}>Détaillée (×3)</option>
          </select>
        </div>
      </div>
      <div class="evolution-scroll">${_svgEvolutionCumul(journees, joueurs, _echelleCumul)}</div>
    </div>
    <div class="evolution-note">Les pronostics bonus (saisonniers) ne sont pas comptés ici : ils n'ont pas de journée propre.</div>`;
}

// Trouve un pas de graduation "rond" (1/2/5 × 10^n) pour ~6 graduations
function _pasGradation(max) {
  const brut = Math.max(1, max) / 6;
  const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
  const norm = brut / puissance;
  const pas = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return Math.max(1, Math.round(pas * puissance));
}

function _svgEvolutionRangs(journees, joueurs) {
  const nbJ = journees.length, nbP = joueurs.length;
  const rowH = 54;                    // grande échelle verticale, une ligne par rang
  const margeG = 30, margeD = 132, margeH = 20, margeB = 34, colW = 56;
  const largeur = margeG + (nbJ - 1) * colW + margeD;
  const hauteur = margeH + (nbP - 1) * rowH + margeB;
  const x = i => margeG + i * colW;
  const y = rang => margeH + (rang - 1) * rowH;

  let svg = `<svg width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" xmlns="http://www.w3.org/2000/svg">`;

  for (let r = 1; r <= nbP; r++) {
    svg += `<line x1="${margeG}" y1="${y(r)}" x2="${largeur - margeD + 20}" y2="${y(r)}" stroke="var(--bord)" stroke-width="1"/>`;
    svg += `<text x="${margeG - 8}" y="${y(r) + 4}" text-anchor="end" font-size="12" fill="var(--txt2)">${r}</text>`;
  }
  for (let i = 0; i < nbJ; i++) {
    svg += `<text x="${x(i)}" y="${hauteur - margeB + 20}" text-anchor="middle" font-size="11" fill="var(--txt2)">J${journees[i]}</text>`;
  }

  joueurs.forEach((j, idx) => {
    const c = PALETTE_JOUEURS[idx % PALETTE_JOUEURS.length];
    const pts = j.rangs.map((r, i) => `${x(i)},${y(r)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    j.rangs.forEach((r, i) => { svg += `<circle cx="${x(i)}" cy="${y(r)}" r="4" fill="${c}"/>`; });
    const dernier = j.rangs[nbJ - 1];
    svg += `<text x="${x(nbJ - 1) + 12}" y="${y(dernier) + 4}" font-size="12" font-weight="700" fill="${c}">${j.nom}</text>`;
  });

  svg += '</svg>';
  return svg;
}

function _svgEvolutionCumul(journees, joueurs, echelle) {
  const nbJ = journees.length;
  const maxPts = Math.max(1, ...joueurs.map(j => Math.max(...j.points_cumules)));
  const margeG = 40, margeD = 132, margeH = 20, margeB = 34, colW = 56;
  const hautPlot = { 1: 200, 2: 340, 3: 480 }[echelle] || 340;
  const largeur = margeG + (nbJ - 1) * colW + margeD;
  const hauteur = margeH + hautPlot + margeB;
  const x = i => margeG + i * colW;
  const y = pts => margeH + hautPlot - (pts / maxPts) * hautPlot;
  const pas = _pasGradation(maxPts);

  let svg = `<svg width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" xmlns="http://www.w3.org/2000/svg">`;

  for (let v = 0; v <= maxPts; v += pas) {
    svg += `<line x1="${margeG}" y1="${y(v)}" x2="${largeur - margeD + 20}" y2="${y(v)}" stroke="var(--bord)" stroke-width="1"/>`;
    svg += `<text x="${margeG - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--txt2)">${v}</text>`;
  }
  for (let i = 0; i < nbJ; i++) {
    svg += `<text x="${x(i)}" y="${hauteur - margeB + 20}" text-anchor="middle" font-size="11" fill="var(--txt2)">J${journees[i]}</text>`;
  }

  // Étiquettes de fin, avec un léger écartement anti-collision
  const labels = joueurs.map((j, idx) => ({
    idx, nom: j.nom, pts: j.points_cumules[nbJ - 1], y: y(j.points_cumules[nbJ - 1])
  })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 16) labels[i].y = labels[i - 1].y + 16;
  }

  joueurs.forEach((j, idx) => {
    const c = PALETTE_JOUEURS[idx % PALETTE_JOUEURS.length];
    const pts = j.points_cumules.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    j.points_cumules.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${c}"/>`; });
  });
  labels.forEach(l => {
    const c = PALETTE_JOUEURS[l.idx % PALETTE_JOUEURS.length];
    svg += `<text x="${x(nbJ - 1) + 12}" y="${l.y + 4}" font-size="12" font-weight="700" fill="${c}">${l.nom} (${l.pts})</text>`;
  });

  svg += '</svg>';
  return svg;
}

// ============================================================
//  PAGE BONUS
// ============================================================
async function chargerBonus() {
  const el = document.getElementById('bonus-contenu');
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('bonus.php?action=config');
    const bonus  = data.bonus  || [];
    const clubs  = data.clubs  || [];
    const mesBon = data.mes_bonus || {};

    if (!bonus.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">⭐</div>Aucun bonus configuré</div>';
      return;
    }

    // Info délai
    const infoEl = document.getElementById('bonus-info');
    const premierBonus = bonus[0];
    if (premierBonus?.date_limite) {
      const expire = new Date(premierBonus.date_limite.replace(' ', 'T'));
      const maintenant = new Date();
      if (maintenant < expire) {
        infoEl.textContent = `⚠️ Les pronostics bonus sont ouverts jusqu'au ${formatDateLimiteLocale(premierBonus.date_limite)}`;
        infoEl.style.display = 'flex';
      } else {
        infoEl.textContent = '🔒 Les pronostics bonus sont fermés.';
        infoEl.style.display = 'flex';
      }
    }

    el.innerHTML = bonus.map(b => {
      const expire = b.date_limite && new Date() > new Date(b.date_limite.replace(' ', 'T'));
      const monProno1 = mesBon[b.id]?.[1];
      const monProno2 = mesBon[b.id]?.[2];

      let selectHtml = '';
      if (b.type === 'joueur') {
        selectHtml = `<input type="text" class="input-field${monProno1?.valeur_texte ? ' saisi' : ''}" placeholder="Nom du joueur"
          id="bonus-val-${b.id}-1" value="${monProno1?.valeur_texte || ''}"
          ${expire ? 'disabled' : ''}
          onchange="saisirBonus(${b.id}, 'joueur', 1)">`;
      } else if (b.type === 'multi_club') {
        selectHtml = `
          <select class="bonus-select${monProno1?.valeur_club_id ? ' saisi' : ''}" id="bonus-val-${b.id}-1"
            ${expire ? 'disabled' : ''}
            onchange="saisirBonus(${b.id}, 'club', 1)">
            <option value="">— Relégué 1 —</option>
            ${clubs.map(c => `<option value="${c.id}"${monProno1?.valeur_club_id == c.id ? ' selected' : ''}>${c.nom}</option>`).join('')}
          </select>
          <select class="bonus-select${monProno2?.valeur_club_id ? ' saisi' : ''}" style="margin-top:6px" id="bonus-val-${b.id}-2"
            ${expire ? 'disabled' : ''}
            onchange="saisirBonus(${b.id}, 'club', 2)">
            <option value="">— Relégué 2 —</option>
            ${clubs.map(c => `<option value="${c.id}"${monProno2?.valeur_club_id == c.id ? ' selected' : ''}>${c.nom}</option>`).join('')}
          </select>`;
      } else {
        selectHtml = `<select class="bonus-select${monProno1?.valeur_club_id ? ' saisi' : ''}" id="bonus-val-${b.id}-1"
          ${expire ? 'disabled' : ''}
          onchange="saisirBonus(${b.id}, 'club', 1)">
          <option value="">— Choisir —</option>
          ${clubs.map(c => `<option value="${c.id}"${monProno1?.valeur_club_id == c.id ? ' selected' : ''}>${c.nom}</option>`).join('')}
        </select>`;
      }

      const resultatHtml = monProno1?.resultat !== null && monProno1?.resultat !== undefined
        ? `<div class="mt8" style="font-size:.78rem">
            ${monProno1.resultat == 1
              ? `<span class="badge-exact">✓ Correct +${monProno1.points} pts</span>`
              : monProno1.resultat == 2
              ? `<span class="badge-bon">½ Presque ! +${monProno1.points} pts</span>`
              : `<span class="badge-mauvais">✗ Raté</span>`}
          </div>` : '';

      return `
        <div class="bonus-card${expire ? ' expire' : ''}${monProno1 ? ' valide' : ''}" id="bonus-card-${b.id}">
          <div class="bonus-header">
            <div class="bonus-label">${b.label}</div>
            <div class="bonus-pts">${b.points} pts</div>
          </div>
          ${selectHtml}
          ${resultatHtml}
          <div class="bonus-deadline${expire ? ' urgent' : ''}">
            ${expire ? '🔒 Fermé' : `Limite : ${formatDateLimiteLocale(b.date_limite)}`}
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    el.innerHTML = msgErreur('Erreur : ' + e.message);
  }
}

async function saisirBonus(bonusId, type, numeroChoix) {
  const el = document.getElementById(`bonus-val-${bonusId}-${numeroChoix}`);
  if (!el) return;
  const body = type === 'joueur'
    ? { bonus_id: bonusId, numero_choix: numeroChoix, joueur: el.value }
    : { bonus_id: bonusId, numero_choix: numeroChoix, club_id: parseInt(el.value) };
  if (!el.value) return;
  try {
    await apiPost('bonus.php?action=saisir', body);
    el.classList.add('saisi');
    document.getElementById(`bonus-card-${bonusId}`)?.classList.add('valide');
    afficherToast('Bonus enregistré');
  } catch (e) {
    console.warn('Erreur bonus:', e.message);
    afficherToast('Erreur : bonus non enregistré', '⚠️');
  }
}

// ============================================================
//  PAGE ADMIN
// ============================================================
async function chargerAdmin() {
  chargerAdminUsers();
  chargerAdminBonus();
  chargerAdminClubsSelect();
  chargerAdminCorrectionClubSelect();
  chargerAdminEntrainement();
  chargerAdminQuizz();
  chargerAdminAnnoncesHistorique();
}

// ============================================================
//  Annonce libre admin — message composé librement, envoyé à tous
//  les joueurs sur les canaux cochés
// ============================================================
async function adminEnvoyerAnnonce() {
  const champTexte = document.getElementById('admin-annonce-texte');
  const texte = (champTexte?.value || '').trim();
  if (!texte) {
    afficherMsgAdmin('Écris un message avant d\'envoyer', 'erreur');
    return;
  }

  const canaux = [];
  if (document.getElementById('admin-annonce-push')?.checked)     canaux.push('push');
  if (document.getElementById('admin-annonce-email')?.checked)    canaux.push('email');
  if (document.getElementById('admin-annonce-telegram')?.checked) canaux.push('telegram');

  if (!canaux.length) {
    afficherMsgAdmin('Coche au moins un canal', 'erreur');
    return;
  }

  if (!confirm(`Envoyer cette annonce à tous les joueurs (${canaux.join(', ')}) ?\n\n« ${texte} »`)) return;

  const btn = document.querySelector('button[onclick="adminEnvoyerAnnonce()"]');
  if (btn) btn.disabled = true;

  try {
    const data = await apiPost('users.php?action=annonce', { texte, canaux });
    afficherMsgAdmin(`✅ Annonce envoyée à ${data.nb_destinataires} joueur(s)`, 'ok');
    champTexte.value = '';
    chargerAdminAnnoncesHistorique();
  } catch (e) {
    afficherMsgAdmin('❌ ' + e.message, 'erreur');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function chargerAdminAnnoncesHistorique() {
  const zone = document.getElementById('admin-annonces-historique');
  if (!zone) return;
  try {
    const data = await apiGet('users.php?action=annonces_historique');
    const annonces = data.annonces || [];

    if (!annonces.length) {
      zone.innerHTML = '<div class="txt2" style="font-size:.82rem">Aucune annonce envoyée pour l\'instant.</div>';
      return;
    }

    const iconesCanaux = { push: '🔔', email: '✉️', telegram: '📨' };

    zone.innerHTML = annonces.map(a => {
      const canauxLabel = a.canaux.split(',').map(c => iconesCanaux[c] || c).join(' ');
      return `
        <div class="admin-card" style="margin-bottom:8px">
          <div style="font-size:.84rem;margin-bottom:6px">${a.texte}</div>
          <div class="txt2" style="font-size:.74rem">${canauxLabel} · ${a.nb_destinataires} destinataire(s) · ${a.admin_nom} · ${formatDateLimiteLocale(a.created_at)}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge" style="font-size:.82rem">Erreur : ${e.message}</div>`;
  }
}

async function chargerAdminClubsSelect() {
  const sel = document.getElementById('admin-club-effectif-select');
  if (!sel) return;
  const clubs = await getClubs();
  const tries = [...clubs].sort((a, b) => a.nom_court.localeCompare(b.nom_court, 'fr'));
  sel.innerHTML = '<option value="">Tous les clubs</option>'
    + tries.map(c => `<option value="${c.id}">${c.nom_court}</option>`).join('');
}

// ============================================================
//  Admin — Mode entraînement
// ============================================================
async function chargerAdminEntrainement() {
  const zone = document.getElementById('admin-entrainement-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('entrainement.php?action=etat');

    if (!data.actif) {
      zone.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <span class="txt2" style="font-size:.84rem;white-space:nowrap">Journées à ouvrir</span>
          <select id="admin-entrainement-nb-journees" class="input-field" style="max-width:80px">
            <option value="2">2</option>
            <option value="3" selected>3</option>
          </select>
        </div>
        <button class="btn btn-primary btn-full" onclick="adminActiverEntrainement()">Activer le mode entraînement</button>
      `;
      return;
    }

    zone.innerHTML = `
      <div style="font-size:.84rem;margin-bottom:12px;line-height:1.6">
        📅 ${data.nb_matchs} match(s) chargé(s), dont <strong>${data.nb_termines} simulé(s)</strong><br>
        📝 ${data.nb_pronos} pronostic(s) saisi(s) par ${data.nb_joueurs} joueur(s)
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-secondary btn-full" onclick="adminEntrainementAction('reset_pronos', 'Effacer tous les pronostics saisis par les joueurs en entraînement ?')">🗑️ Réinitialiser les pronostics</button>
        <button class="btn btn-or btn-full" onclick="adminEntrainementAction('simuler', 'Attribuer des scores aléatoires aux matchs pas encore simulés ?')">🎲 Simuler les résultats</button>
        <button class="btn btn-secondary btn-full" style="white-space:normal;line-height:1.3" onclick="adminEntrainementAction('reset_scores', 'Effacer les faux scores et remettre le classement des équipes à 0 ?')">🔄 Réinitialiser scores + classement</button>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">
          <input type="text" inputmode="numeric" autocomplete="off"
                 id="admin-entrainement-match-ids" class="input-field"
                 placeholder="ID(s) de match, ex : 412,413">
          <button class="btn btn-secondary btn-full" onclick="adminResetMatchsCibles()">🎯 Réinitialiser ces matchs</button>
        </div>
        <div class="txt2" style="font-size:.72rem;margin:-2px 0 2px">
          Pour ne réinitialiser que quelques matchs plutôt que toute la saison — l'ID se trouve dans la table
          <code>matches</code> via phpMyAdmin (repérer la ligne par journée + noms des clubs)
        </div>
        <button class="btn btn-secondary btn-full" onclick="adminEntrainementAction('reset_points', 'Remettre à 0 les points des joueurs (sans toucher aux scores) ?')">🔄 Réinitialiser les points joueurs</button>
        <button class="btn btn-full" style="background:var(--rouge);color:#fff;margin-top:6px" onclick="adminDesactiverEntrainement()">⚠️ Désactiver le mode entraînement</button>
      </div>
    `;
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

async function adminActiverEntrainement() {
  const nbJournees = parseInt(document.getElementById('admin-entrainement-nb-journees').value, 10);
  try {
    const data = await apiPost('entrainement.php?action=activer', { nb_journees: nbJournees });
    afficherMsgAdmin(`✅ Mode entraînement activé : ${data.nb_clubs} clubs, ${data.nb_matchs} matchs clonés`, 'ok');
    chargerAdminEntrainement();
    initialiserSaisons(); // le sélecteur de saison du header doit proposer "Entraînement"
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminEntrainementAction(action, confirmMsg) {
  if (!confirm(confirmMsg)) return;
  try {
    const data = await apiPost(`entrainement.php?action=${action}`, {});
    afficherMsgAdmin('✅ Fait', 'ok');
    chargerAdminEntrainement();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

// Réinitialise le score (+ pronostics + classement + cache de forme)
// d'1 ou plusieurs matchs précis plutôt que toute la saison — même
// action serveur que le bouton "Réinitialiser scores + classement",
// juste restreinte à une liste d'IDs (cf. entrainement.php?action=reset_scores)
async function adminResetMatchsCibles() {
  const champ = document.getElementById('admin-entrainement-match-ids');
  const raw = (champ?.value || '').trim();
  if (!raw) { afficherMsgAdmin('❌ Indique au moins un ID de match', 'erreur'); return; }
  if (!/^\d+(\s*,\s*\d+)*$/.test(raw)) {
    afficherMsgAdmin('❌ Format attendu : des chiffres séparés par des virgules (ex : 412,413)', 'erreur');
    return;
  }
  const matchIds = raw.split(',').map(s => parseInt(s.trim(), 10));
  if (!confirm(`Réinitialiser le score de ${matchIds.length} match(s) (ID ${matchIds.join(', ')}) ?`)) return;
  try {
    const data = await apiPost('entrainement.php?action=reset_scores', { match_ids: matchIds });
    afficherMsgAdmin(`✅ ${data.matchs_reinitialises} match(s) réinitialisé(s)`, 'ok');
    if (champ) champ.value = '';
    chargerAdminEntrainement();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminDesactiverEntrainement() {
  if (!confirm('Supprimer complètement le mode entraînement (saison, clubs, matchs et pronostics associés) ? Cette action est irréversible.')) return;
  try {
    await apiPost('entrainement.php?action=desactiver', {});
    afficherMsgAdmin('✅ Mode entraînement désactivé', 'ok');
    chargerAdminEntrainement();
    initialiserSaisons();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

// ============================================================
//  Admin — Quizz hebdomadaire
// ============================================================
const SOUS_TYPE_LABELS = {
  plus_moins_25: '⚽ +/-2,5 buts',
  btts:          '🥅 Les 2 marquent',
  buteur:        '🎯 Buteur probable',
};
const TYPE_LABELS = {
  pronostic: '⚽ Pronostic',
  histo:     '📜 Histo foot',
  actu:      '📰 Actu foot',
};
function _labelQuestionQuizz(qq) {
  if (qq.type === 'pronostic') return SOUS_TYPE_LABELS[qq.sous_type] || qq.sous_type;
  return TYPE_LABELS[qq.type] || qq.type;
}

async function chargerAdminQuizz() {
  const zone = document.getElementById('admin-quizz-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('quizz.php?action=etat_admin');
    let html = '';

    const c = data.config || {};
    html += `
      <details style="margin-bottom:12px">
        <summary style="cursor:pointer;font-weight:600;font-size:.86rem;margin-bottom:8px">⚙️ Paramètres du quizz</summary>
        <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:10px 12px;margin-top:8px">

          <div style="font-weight:600;font-size:.8rem;color:var(--bleu-accent);margin-bottom:6px">⚽ Semaine normale</div>
          <div class="admin-quizz-config-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">
            <label style="font-size:.78rem;color:var(--txt2)">
              Questions au total
              <input type="number" id="qc-nb-normale" class="input-field" min="1" max="10" value="${c.nb_questions_normale ?? 4}" style="width:100%;margin-top:2px">
            </label>
            <label style="font-size:.78rem;color:var(--txt2)">
              dont Actu foot (IA + web)
              <input type="number" id="qc-nb-actu" class="input-field" min="0" max="10" value="${c.nb_actu_normale ?? 1}" style="width:100%;margin-top:2px">
            </label>
            <label style="font-size:.78rem;color:var(--txt2);grid-column:1 / -1">
              dont Histo foot (banque)
              <input type="number" id="qc-nb-histo" class="input-field" min="0" max="10" value="${c.nb_histo_normale ?? 0}" style="width:100%;margin-top:2px">
            </label>
          </div>
          <p style="font-size:.72rem;color:var(--txt2);margin:0 0 14px">Le reste (total − actu − histo) est généré en questions pronostic, depuis les matchs de la journée.</p>

          <div style="font-weight:600;font-size:.8rem;color:var(--bleu-accent);margin-bottom:6px;padding-top:10px;border-top:1px solid var(--bord)">✨ Quizz Spécial</div>
          <div class="admin-quizz-config-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px">
            <label style="font-size:.78rem;color:var(--txt2)">
              Questions au total
              <input type="number" id="qc-nb-treve" class="input-field" min="1" max="10" value="${c.nb_questions_treve ?? 5}" style="width:100%;margin-top:2px">
            </label>
            <label style="font-size:.78rem;color:var(--txt2)">
              dont Histo foot (banque)
              <input type="number" id="qc-nb-histo-treve" class="input-field" min="0" max="10" value="${c.nb_histo_treve ?? 2}" style="width:100%;margin-top:2px">
            </label>
            <label style="font-size:.78rem;color:var(--txt2);grid-column:1 / -1">
              Durée de validité après publication (jours)
              <input type="number" id="qc-duree-validite-special" class="input-field" min="1" max="60" value="${c.duree_validite_special_jours ?? 7}" style="width:100%;margin-top:2px">
            </label>
          </div>
          <p style="font-size:.72rem;color:var(--txt2);margin:0 0 14px">Le reste (total − histo) est généré en questions Actu foot — pas de pronostic possible, il n'y a aucun match cette semaine-là.</p>

          <div style="font-weight:600;font-size:.8rem;color:var(--bleu-accent);margin-bottom:6px;padding-top:10px;border-top:1px solid var(--bord)">⚙️ Réglages communs</div>
          <div class="admin-quizz-config-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <label style="font-size:.78rem;color:var(--txt2)">
              Points par bonne réponse
              <input type="number" id="qc-pts-bonne-reponse" class="input-field" min="1" max="20" value="${c.pts_bonne_reponse ?? 2}" style="width:100%;margin-top:2px">
            </label>
            <label style="font-size:.78rem;color:var(--txt2)">
              Bonus sans-faute (%)
              <input type="number" id="qc-bonus-sans-faute" class="input-field" min="0" max="200" value="${c.bonus_sans_faute_pct ?? 50}" style="width:100%;margin-top:2px">
            </label>
            <label style="font-size:.78rem;color:var(--txt2);grid-column:1 / -1">
              Timer questions actu/histo (secondes)
              <input type="number" id="qc-timer-actu" class="input-field" min="5" max="60" value="${c.timer_secondes_actu ?? 10}" style="width:100%;margin-top:2px">
            </label>
          </div>

          <button class="btn btn-primary btn-full" onclick="adminSauvegarderConfigQuizz()">💾 Enregistrer les paramètres</button>
          <div id="admin-quizz-config-msg" style="margin-top:6px"></div>
        </div>
      </details>
    `;

    if (data.a_valider) {
      const q = data.a_valider;
      html += `
        <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:10px 12px;margin-bottom:10px">
          <div style="font-weight:600;margin-bottom:6px">📋 ${q.est_treve ? '✨ Quizz Spécial #' + q.numero_special : '⚽ Quizz J' + q.journee} — en attente de validation</div>
          <div style="font-size:.82rem;color:var(--txt2);margin-bottom:8px">
            Date limite : ${formatDateComplete(q.date_limite)}
          </div>
          <ul style="margin:0 0 10px;padding-left:18px;font-size:.84rem;line-height:1.6">
            ${q.questions.map(qq => `
              <li>
                ${_labelQuestionQuizz(qq)} — ${qq.enonce}${qq.source_url ? ` (<a href="${qq.source_url}" target="_blank" rel="noopener" style="color:var(--bleu-accent)">source</a>)` : ''}
                <a href="#" onclick="adminSupprimerQuestionQuizz(${qq.id});return false" style="color:var(--rouge);font-size:.78rem;margin-left:6px">retirer</a>
              </li>
            `).join('')}
          </ul>

          <details style="margin-bottom:10px">
            <summary style="cursor:pointer;font-size:.82rem;font-weight:600">📰 Ajouter une question actu (saisie manuelle)</summary>
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
              <input type="text" id="aqm-enonce" class="input-field" placeholder="Énoncé de la question" style="width:100%">
              <div style="display:flex;flex-direction:column;gap:4px">
                ${[0,1,2,3].map(i => `
                  <div style="display:flex;align-items:center;gap:6px">
                    <input type="radio" name="aqm-correcte" value="${i}" ${i === 0 ? 'checked' : ''}>
                    <input type="text" id="aqm-reponse-${i}" class="input-field" placeholder="Réponse ${i + 1}${i > 1 ? ' (optionnel)' : ''}" style="width:100%">
                  </div>
                `).join('')}
              </div>
              <input type="url" id="aqm-source" class="input-field" placeholder="URL de la source (obligatoire)" style="width:100%">
              <button class="btn btn-secondary btn-full" onclick="adminAjouterQuestionManuelle(${q.id})">➕ Ajouter cette question</button>
              <div id="admin-aqm-msg"></div>
            </div>
          </details>

          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-full" onclick="adminValiderQuizz(${q.id})">✅ Valider et publier</button>
            <button class="btn btn-secondary" onclick="adminSupprimerQuizzSemaine(${q.id})" title="Supprimer ce quizz (ex. doublon)">🗑️</button>
          </div>
        </div>
      `;
    }

    if (data.publie) {
      const p = data.publie;
      html += `
        <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:10px 12px;margin-bottom:10px">
          <div style="font-weight:600;margin-bottom:6px">🟢 ${p.est_treve ? '✨ Quizz Spécial #' + p.numero_special : '⚽ Quizz J' + p.journee} — publié</div>
          <div style="font-size:.82rem;color:var(--txt2)">
            ${p.nb_questions} question(s) · ${p.nb_joueurs_repondu} joueur(s) déjà répondu(s)<br>
            Date limite : ${formatDateComplete(p.date_limite)}
          </div>
        </div>
      `;
    }

    if (!data.a_valider && !data.publie) {
      html += `<p class="txt2" style="font-size:.84rem;margin-bottom:10px">Aucun quizz en attente ni publié actuellement.</p>`;
    }

    if (data.nb_a_resoudre > 0) {
      html += `
        <button class="btn btn-or btn-full" style="margin-bottom:8px;white-space:normal;line-height:1.3;padding-top:8px;padding-bottom:8px" onclick="adminResoudreQuizz()">
          🧮 Résoudre ${data.nb_a_resoudre} question(s) (match terminé)
        </button>
      `;
    }

    html += `
      <p class="txt2" style="font-size:.78rem;margin:0 0 10px">
        ${data.prochaine_journee_sans_quizz
          ? `➡️ Prochaine journée sans quizz : <strong>J${data.prochaine_journee_sans_quizz}</strong>`
          : `✅ Toutes les journées à venir ont déjà leur quizz`}
      </p>
    `;

    if (data.historique && data.historique.length) {
      const STATUT_LABEL = { brouillon: ['Brouillon', 'var(--txt2)'], a_valider: ['À valider', 'var(--or)'], publie: ['Publié', 'var(--vert)'], cloture: ['Clôturé', 'var(--txt2)'] };
      html += `
        <details style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;font-size:.86rem;margin-bottom:8px">📜 Historique des quizz (${data.historique.length})</summary>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
            ${data.historique.map(h => {
              const [label, couleur] = STATUT_LABEL[h.statut] || [h.statut, 'var(--txt2)'];
              const nomQuizz = h.est_treve == 1 ? `✨ Spécial #${h.numero_special}` : `⚽ J${h.journee}`;
              return `
                <div style="padding:8px 10px;background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);font-size:.8rem">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                    <span style="font-weight:600">${nomQuizz}</span>
                    <span style="color:${couleur};font-weight:600">${label}</span>
                  </div>
                  <div class="txt2" style="font-size:.74rem;margin-top:2px">
                    ${h.nb_questions} question(s)${h.date_publication ? ' · publié le ' + formatDateComplete(h.date_publication) : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </details>
      `;
    }

    html += `<button class="btn btn-secondary btn-full" onclick="adminGenererQuizz()" style="margin-bottom:6px">🎲 Générer le prochain quizz</button>`;
    html += `<button class="btn btn-secondary btn-full" onclick="adminGenererQuizzTreve()">✨ Générer un quizz Spécial</button>`;
    html += `<div id="admin-quizz-msg" style="margin-top:8px"></div>`;

    zone.innerHTML = html;
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

async function adminSauvegarderConfigQuizz() {
  const msg = document.getElementById('admin-quizz-config-msg');
  const config = {
    nb_questions_normale: parseInt(document.getElementById('qc-nb-normale').value, 10),
    nb_questions_treve:   parseInt(document.getElementById('qc-nb-treve').value, 10),
    nb_histo_treve:       parseInt(document.getElementById('qc-nb-histo-treve').value, 10),
    duree_validite_special_jours: parseInt(document.getElementById('qc-duree-validite-special').value, 10),
    nb_actu_normale:      parseInt(document.getElementById('qc-nb-actu').value, 10),
    nb_histo_normale:     parseInt(document.getElementById('qc-nb-histo').value, 10),
    pts_bonne_reponse:    parseInt(document.getElementById('qc-pts-bonne-reponse').value, 10),
    bonus_sans_faute_pct: parseInt(document.getElementById('qc-bonus-sans-faute').value, 10),
    timer_secondes_actu:  parseInt(document.getElementById('qc-timer-actu').value, 10),
  };

  for (const [cle, val] of Object.entries(config)) {
    if (isNaN(val) || val < 0) {
      if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.8rem">Valeur invalide pour ${cle}</div>`;
      return;
    }
  }
  if (config.nb_actu_normale + config.nb_histo_normale > config.nb_questions_normale) {
    if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.8rem">Actu + Histo ne peut pas dépasser le total de la semaine normale</div>`;
    return;
  }
  if (config.nb_histo_treve > config.nb_questions_treve) {
    if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.8rem">Histo (trêve) ne peut pas dépasser le total de la semaine de trêve</div>`;
    return;
  }

  try {
    await apiPost('quizz.php?action=config_maj', config);
    afficherMsgAdmin('✅ Paramètres du quizz enregistrés', 'ok');
    if (msg) msg.innerHTML = `<div class="txt-vert" style="font-size:.8rem">Enregistré ✓</div>`;
  } catch (e) {
    if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.8rem">Erreur : ${e.message}</div>`;
  }
}

async function adminGenererQuizz() {
  const btn = document.querySelector('button[onclick="adminGenererQuizz()"]');
  if (btn) { if (btn.disabled) return; btn.disabled = true; }
  try {
    const data = await apiPost('quizz.php?action=generer_quizz', {});
    const detail = `${data.nb_pronostic} pronostic · ${data.nb_histo} histo · ${data.nb_actu} actu`;
    let manque = '';
    if (data.manque > 0) {
      manque = ` — ⚠️ ${data.manque} question(s) manquante(s) (détail dans la Console F12)`;
      console.warn('Détail génération actu foot :', data.debug_actu);
    }
    afficherMsgAdmin(`✅ Quizz généré : journée ${data.journee}, ${data.nb_questions} question(s) (${detail})${manque}`, data.manque > 0 ? 'erreur' : 'ok');
    chargerAdminQuizz();
  } catch (e) {
    afficherMsgAdmin('❌ ' + e.message, 'erreur');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function adminGenererQuizzTreve() {
  if (!confirm('Générer un quizz Spécial (100% histo + actu, sans pronostic) ? À utiliser quand tu sais qu\'il n\'y a pas de journée L1 cette semaine-là, ou simplement pour varier.')) return;
  const btn = document.querySelector('button[onclick="adminGenererQuizzTreve()"]');
  if (btn) { if (btn.disabled) return; btn.disabled = true; }
  try {
    const data = await apiPost('quizz.php?action=generer_quizz_treve', {});
    const detail = `${data.nb_histo} histo · ${data.nb_actu} actu`;
    let manque = '';
    if (data.manque > 0) {
      manque = ` — ⚠️ ${data.manque} question(s) manquante(s) (détail dans la Console F12)`;
      console.warn('Détail génération actu foot :', data.debug_actu);
    }
    afficherMsgAdmin(`✅ Quizz Spécial #${data.numero_special} généré : ${data.nb_questions} question(s) (${detail})${manque}`, data.manque > 0 ? 'erreur' : 'ok');
    chargerAdminQuizz();
  } catch (e) {
    afficherMsgAdmin('❌ ' + e.message, 'erreur');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function adminAjouterQuestionManuelle(quizzSemaineId) {
  const msg = document.getElementById('admin-aqm-msg');
  const enonce = document.getElementById('aqm-enonce').value.trim();
  const source = document.getElementById('aqm-source').value.trim();
  const correcteIdx = parseInt(document.querySelector('input[name="aqm-correcte"]:checked')?.value ?? '-1', 10);

  const reponses = [0, 1, 2, 3].map(i => ({
    texte: document.getElementById(`aqm-reponse-${i}`).value.trim(),
    correcte: i === correcteIdx,
  }));

  if (!enonce || !source) {
    if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.78rem">Énoncé et source sont obligatoires</div>`;
    return;
  }
  const remplies = reponses.filter(r => r.texte !== '');
  if (remplies.length < 2 || !remplies.some(r => r.correcte)) {
    if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.78rem">Au moins 2 réponses, avec la bonne réponse cochée parmi celles remplies</div>`;
    return;
  }

  try {
    await apiPost('quizz.php?action=ajouter_question_manuelle', {
      quizz_semaine_id: quizzSemaineId, enonce, source_url: source, reponses,
    });
    afficherMsgAdmin('✅ Question ajoutée', 'ok');
    chargerAdminQuizz();
  } catch (e) {
    if (msg) msg.innerHTML = `<div class="txt-rouge" style="font-size:.78rem">${e.message}</div>`;
  }
}

async function adminSupprimerQuestionQuizz(questionId) {
  if (!confirm('Retirer cette question du quizz ?')) return;
  try {
    await apiPost('quizz.php?action=supprimer_question', { question_id: questionId });
    afficherMsgAdmin('✅ Question retirée', 'ok');
    chargerAdminQuizz();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminValiderQuizz(quizzSemaineId) {
  if (!confirm('Publier ce quizz ? Les joueurs le verront immédiatement.')) return;
  try {
    await apiPost('quizz.php?action=valider', { quizz_semaine_id: quizzSemaineId });
    afficherMsgAdmin('✅ Quizz publié', 'ok');
    chargerAdminQuizz();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminSupprimerQuizzSemaine(quizzSemaineId) {
  if (!confirm('Supprimer entièrement ce quizz (encore en attente de validation) ? Cette action est irréversible.')) return;
  try {
    await apiPost('quizz.php?action=supprimer_quizz_semaine', { quizz_semaine_id: quizzSemaineId });
    afficherMsgAdmin('✅ Quizz supprimé', 'ok');
    chargerAdminQuizz();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminResoudreQuizz() {
  try {
    const data = await apiPost('quizz.php?action=resoudre', {});
    afficherMsgAdmin(`✅ ${data.questions_resolues} question(s) corrigée(s), classement recalculé`, 'ok');
    chargerAdminQuizz();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function chargerAdminUsers() {
  const el = document.getElementById('admin-users-contenu');
  try {
    const data = await apiGet('users.php?action=liste');
    const users = data.users || [];
    el.innerHTML = `<table class="joueurs-table">
      <thead><tr><th>#</th><th>Nom</th><th>Email</th><th>Admin</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map((u, i) => `
          <tr>
            <td>${i + 1}</td>
            <td style="text-align:left"><div class="user-cell">
              <div class="user-av">${u.avatar_initiales}</div>${u.nom}
            </div></td>
            <td style="text-align:left;font-size:.8rem">${u.email}${u.email_confirme ? ' <span class="txt-vert" title="Email confirmé">✅</span>' : ' <span class="txt-rouge" title="Email non confirmé">⚠️</span>'}</td>
            <td>${u.is_admin ? '⭐' : '—'}</td>
            <td>
              <button class="btn btn-secondary btn-sm"
                onclick="adminResetMdp(${u.id}, '${u.nom}')">Reset mdp</button>
              ${!u.email_confirme ? `<button class="btn btn-or btn-sm"
                onclick="adminConfirmerEmail(${u.id}, '${u.nom}')">✅ Confirmer email</button>` : ''}
              ${!u.is_admin ? `<button class="btn btn-danger btn-sm"
                onclick="adminSupprimerUser(${u.id}, '${u.nom}')">Supprimer</button>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

// Convertit une date MySQL ('2026-08-20 18:00:00' ou null) vers le format
// attendu par un input datetime-local ('2026-08-20T18:00')
function versDatetimeLocal(dateMysql) {
  if (!dateMysql) return '';
  return dateMysql.replace(' ', 'T').slice(0, 16);
}

async function adminMajDateLimite(bonusId) {
  const input = document.getElementById(`admin-datelimite-${bonusId}`);
  // input.value est déjà au format 'YYYY-MM-DDTHH:MM' (ou vide) — on le
  // renvoie tel quel, MySQL accepte ce format en le complétant lui-même
  const dateLimite = input.value ? input.value.replace('T', ' ') + ':00' : '';
  try {
    await apiPost('bonus.php?action=date_limite_maj', { bonus_id: bonusId, date_limite: dateLimite });
    afficherMsgAdmin(dateLimite ? '✅ Date limite mise à jour' : '✅ Date limite supprimée (bonus toujours ouvert)', 'ok');
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminMajPoints(bonusId) {
  const input = document.getElementById(`admin-points-${bonusId}`);
  const points = parseInt(input.value, 10);
  if (isNaN(points) || points < 0) { afficherMsgAdmin('❌ Valeur invalide', 'erreur'); return; }
  try {
    const data = await apiPost('bonus.php?action=points_maj', { bonus_id: bonusId, points });
    afficherMsgAdmin(
      data.recalcules > 0
        ? `✅ Points mis à jour : ${points} pts (${data.recalcules} pronostic(s) déjà validé(s) recalculé(s))`
        : `✅ Points mis à jour : ${points} pts`,
      'ok'
    );
    if (data.recalcules > 0) {
      cacheRangs = null; cacheRangsSaisonId = undefined; // le classement a pu bouger
      document.querySelectorAll('[data-loaded]').forEach(el => delete el.dataset.loaded);
    }
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function chargerAdminBonus() {
  const el = document.getElementById('admin-bonus-contenu');
  try {
    const [data, championData, baremeData] = await Promise.all([
      apiGet('bonus.php?action=config'),
      apiGet('bonus.php?action=champion_journee_config'),
      apiGet('bonus.php?action=bareme_config'),
    ]);
    const bonus = data.bonus || [];
    const clubs = data.clubs || [];
    const b = baremeData.bareme;

    const champBareme = (id, label, valeur) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
        <span class="txt2" style="font-size:.82rem">${label}</span>
        <input type="number" min="0" class="input-field" id="${id}" value="${valeur}" style="max-width:80px;text-align:center">
      </div>`;

    const blocAutoBonus = `
      <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:14px;margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:8px">🤖 Validation automatique des bonus de classement</div>
        <div class="txt2" style="font-size:.8rem;margin-bottom:10px">
          Champion, 2e, 3e, Relégués, Barragiste, Meilleure attaque/défense, Buteur, Passeur
          sont validés automatiquement par le cron dès que TOUS les matchs de la saison sont
          joués. Ce bouton permet de forcer une vérification manuelle (pratique en test).
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%" onclick="adminVerifierBonusAuto()">Vérifier maintenant</button>
      </div>`;

    const blocBareme = `
      <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:14px;margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:8px">⚽ Barème de points par match</div>
        <div class="txt2" style="font-size:.8rem;margin-bottom:10px">
          En cas de score exact, aucun autre bonus ne s'ajoute — seul le montant "Score exact" est attribué.
        </div>
        ${champBareme('admin-bareme-exact', 'Score exact', b.pts_exact)}
        ${champBareme('admin-bareme-bon', 'Bon résultat (victoire/nul/défaite)', b.pts_bon_resultat)}
        ${champBareme('admin-bareme-ecart', '+ Bonus bon écart de buts (si bon résultat)', b.pts_bonus_ecart)}
        ${champBareme('admin-bareme-dom', '+ Bonus bon nb de buts équipe domicile', b.pts_bonus_buts_dom)}
        ${champBareme('admin-bareme-ext', '+ Bonus bon nb de buts équipe extérieur', b.pts_bonus_buts_ext)}
        <div class="txt2" style="font-size:.8rem;margin:12px 0 8px;padding-top:10px;border-top:1px solid var(--bord)">
          📊 Barème "Avec cotes" — seule la partie "score exact / bon résultat" est multipliée par la cote bookmaker du résultat pronostiqué, plafonnée à la valeur ci-dessous (les bonus restent inchangés).
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
          <span class="txt2" style="font-size:.82rem">Plafond du multiplicateur (cote max)</span>
          <input type="number" min="1" step="0.1" class="input-field" id="admin-bareme-cote-plafond" value="${b.cote_plafond}" style="max-width:80px;text-align:center">
        </div>
        <button class="btn btn-or btn-sm" style="width:100%;margin-top:4px" onclick="adminMajBareme()">Enregistrer le barème</button>
      </div>`;

    const blocChampion = `
      <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:14px;margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:8px">🏆 Champion de journée</div>
        <div class="txt2" style="font-size:.8rem;margin-bottom:10px">
          Points attribués automatiquement au(x) joueur(s) en tête du classement d'une journée
          entièrement terminée (tous les ex-aequo reçoivent le montant complet).
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" min="0" class="input-field" id="admin-champion-points"
                 value="${championData.points}" style="max-width:100px">
          <span class="txt2">points</span>
          <button class="btn btn-or btn-sm" onclick="adminMajChampionJournee()">Enregistrer</button>
        </div>
      </div>`;

    const blocBonus = bonus.map(b => `
      <div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:14px;margin-bottom:10px">
        <div style="font-weight:700;margin-bottom:8px">${b.label}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <span class="txt2" style="font-size:.78rem;white-space:nowrap">🏆 Points</span>
          <input type="number" min="0" class="input-field" id="admin-points-${b.id}"
                 value="${b.points}" style="max-width:100px">
          <button class="btn btn-secondary btn-sm" onclick="adminMajPoints(${b.id})">OK</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <span class="txt2" style="font-size:.78rem;white-space:nowrap">📅 Date limite</span>
          <input type="datetime-local" class="input-field" id="admin-datelimite-${b.id}"
                 value="${versDatetimeLocal(b.date_limite)}" style="flex:1">
          <button class="btn btn-secondary btn-sm" onclick="adminMajDateLimite(${b.id})">OK</button>
        </div>
        ${b.type === 'joueur'
          ? `<div style="display:flex;gap:8px">
               <input type="text" class="input-field" id="admin-bon-${b.id}" placeholder="Nom du joueur" style="flex:1">
               <button class="btn btn-or btn-sm" onclick="adminValiderBonus(${b.id},'joueur')">Valider</button>
             </div>`
          : b.type === 'multi_club'
          ? `<div style="display:flex;flex-direction:column;gap:8px">
               ${[1, 2].map(n => `
                 <div style="display:flex;gap:8px">
                   <select class="bonus-select" id="admin-bon-${b.id}-${n}" style="flex:1">
                     <option value="">— Relégué ${n} —</option>
                     ${clubs.map(c => `<option value="${c.id}">${c.nom}</option>`).join('')}
                   </select>
                   <button class="btn btn-or btn-sm" onclick="adminValiderBonus(${b.id},'club',${n})">Valider</button>
                 </div>`).join('')}
             </div>`
          : `<div style="display:flex;gap:8px">
               <select class="bonus-select" id="admin-bon-${b.id}" style="flex:1">
                 <option value="">— Choisir —</option>
                 ${clubs.map(c => `<option value="${c.id}">${c.nom}</option>`).join('')}
               </select>
               <button class="btn btn-or btn-sm" onclick="adminValiderBonus(${b.id},'club')">Valider</button>
             </div>`}
      </div>`).join('');

    el.innerHTML = blocAutoBonus + blocBareme + blocChampion + blocBonus;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

async function adminVerifierBonusAuto() {
  try {
    const data = await apiPost('bonus.php?action=verifier_auto', {});
    if (data.statut === 'attente') {
      afficherMsgAdmin('⏳ ' + data.message, 'info');
    } else if (!data.resultats || data.resultats.length === 0) {
      afficherMsgAdmin('ℹ️ Rien à valider pour l\'instant (déjà fait, ou saison pas terminée)', 'info');
    } else {
      afficherMsgAdmin('✅ Validés : ' + data.resultats.join(' | '), 'ok');
      chargerAdminBonus(); // rafraîchit l'écran (dates/réponses mises à jour)
    }
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminMajBareme() {
  const lire = id => parseInt(document.getElementById(id).value, 10);
  const bareme = {
    pts_exact:          lire('admin-bareme-exact'),
    pts_bon_resultat:   lire('admin-bareme-bon'),
    pts_bonus_ecart:    lire('admin-bareme-ecart'),
    pts_bonus_buts_dom: lire('admin-bareme-dom'),
    pts_bonus_buts_ext: lire('admin-bareme-ext'),
  };
  if (Object.values(bareme).some(v => isNaN(v) || v < 0)) {
    afficherMsgAdmin('❌ Valeur invalide dans le barème', 'erreur'); return;
  }
  const cotePlafond = parseFloat(document.getElementById('admin-bareme-cote-plafond').value);
  if (isNaN(cotePlafond) || cotePlafond < 1) {
    afficherMsgAdmin('❌ Plafond de cote invalide (minimum 1)', 'erreur'); return;
  }
  bareme.cote_plafond = cotePlafond;
  try {
    const data = await apiPost('bonus.php?action=bareme_maj', bareme);
    const r = data.recalcul;
    afficherMsgAdmin(`✅ Barème mis à jour — points recalculés automatiquement (${r.pronos} pronostic(s) sur ${r.matchs} match(s))`, 'ok');
    cacheRangs = null; cacheRangsSaisonId = undefined; // le classement a pu bouger
    // Même raison que adminCalculerPoints() : forcer le rechargement des
    // pages déjà visitées (Podium notamment), sinon elles restent figées.
    document.querySelectorAll('[data-loaded]').forEach(el => delete el.dataset.loaded);
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminMajChampionJournee() {
  const input = document.getElementById('admin-champion-points');
  const points = parseInt(input.value, 10);
  if (isNaN(points) || points < 0) { afficherMsgAdmin('❌ Valeur invalide', 'erreur'); return; }
  try {
    await apiPost('bonus.php?action=champion_journee_maj', { points });
    afficherMsgAdmin(`✅ Barème mis à jour : ${points} pts`, 'ok');
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminSyncMatchs() {
  const s = saisonsDisponibles.find(s => s.id === saisonSelectionnee);
  const nbJournees = s ? (s.nb_journees || 34) : 34;
  const anneeDebut = saisonActiveAnneeDebut();

  let totalInseres = 0, totalModifies = 0;
  const erreurs = [];
  const avertissements = [];

  for (let j = 1; j <= nbJournees; j++) {
    afficherMsgAdmin(`⏳ Synchronisation en cours… (journée ${j}/${nbJournees})`, 'info');
    try {
      const data = await apiPost('matches.php?action=sync_journee', { journee: j, annee_debut: anneeDebut, saison_id: saisonSelectionnee });
      totalInseres += data.inseres || 0;
      totalModifies += data.modifies || 0;
      if (data.erreurs?.length) erreurs.push(...data.erreurs);
      if (data.avertissements?.length) avertissements.push(...data.avertissements);
    } catch (e) {
      erreurs.push(`Journée ${j} : ${e.message}`);
    }
  }

  const err  = erreurs.length ? ` — ⚠️ ${erreurs.length} erreur(s) :<br>${erreurs.join('<br>')}` : '';
  const avert = avertissements.length ? ` — 🔶 ${avertissements.length} avertissement(s) :<br>${avertissements.join('<br>')}` : '';
  afficherMsgAdmin(`✅ ${totalInseres} insérés, ${totalModifies} modifiés (${nbJournees} journées)${err}${avert}`, (err || avert) ? 'erreur' : 'ok');
  // Recharger la journée courante
  document.querySelectorAll('[data-loaded]').forEach(el => delete el.dataset.loaded);
  chargerJournee(journeeCourante);
}

async function adminSyncJournee() {
  const j = parseInt(document.getElementById('admin-journee-input').value);
  if (!j) { afficherMsgAdmin('Entrez un numéro de journée', 'erreur'); return; }
  afficherMsgAdmin(`⏳ Sync journée ${j}…`, 'info');
  try {
    const data = await apiPost('matches.php?action=sync_journee', { journee: j, annee_debut: saisonActiveAnneeDebut(), saison_id: saisonSelectionnee });
    const err  = data.erreurs?.length ? ` — ⚠️ ${data.erreurs.length} erreur(s) :<br>${data.erreurs.join('<br>')}` : '';
    const avert = data.avertissements?.length ? ` — 🔶 ${data.avertissements.length} avertissement(s) :<br>${data.avertissements.join('<br>')}` : '';
    afficherMsgAdmin(`✅ Journée ${j} : ${data.inseres} inséré(s), ${data.modifies} modifié(s)${err}${avert}`, (err || avert) ? 'erreur' : 'ok');
    chargerJournee(journeeCourante);
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminCalculerPoints() {
  afficherMsgAdmin('⏳ Calcul en cours…', 'info');
  try {
    const data = await apiPost('classement.php?action=calculer', {});
    afficherMsgAdmin(`✅ ${data.pronos} pronostics recalculés sur ${data.matchs} matchs`, 'ok');
    cacheRangs = null; cacheRangsSaisonId = undefined; // le classement a pu bouger
    // Les points/classements affichés ailleurs (Podium, Classement équipes…)
    // ne se rechargent qu'une fois par session — on force leur rafraîchissement
    // au prochain passage, sinon ils resteraient figés sur l'ancienne donnée.
    document.querySelectorAll('[data-loaded]').forEach(el => delete el.dataset.loaded);
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminSyncStats() {
  afficherMsgAdmin('⏳ Sync stats…', 'info');
  try {
    const data = await apiPost('stats.php?action=sync_stats', { annee_debut: saisonActiveAnneeDebut(), saison_id: saisonSelectionnee });
    afficherMsgAdmin(`✅ ${data.message}`, 'ok');
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminSyncJourneeStats() {
  const journee = parseInt(document.getElementById('admin-journee-stats-input').value, 10);
  const zone = document.getElementById('admin-journee-stats-resultat');
  if (!journee) { afficherMsgAdmin('❌ Indique un numéro de journée', 'erreur'); return; }

  afficherMsgAdmin(`⏳ Resynchro des stats de la journée ${journee}…`, 'info');
  if (zone) zone.innerHTML = '<div class="loading"><div class="spinner"></div> Resynchronisation…</div>';
  try {
    const data = await apiPost('stats.php?action=sync_journee_stats', { journee });
    if (data.nb_matchs === 0) {
      afficherMsgAdmin(`⚠️ ${data.message}`, 'erreur');
      if (zone) zone.innerHTML = '';
      return;
    }
    const echecTxt = data.echecs.length ? ` — ⚠️ échec sur ${data.echecs.length} match(s) (id : ${data.echecs.join(', ')})` : '';
    afficherMsgAdmin(`✅ Journée ${journee} : ${data.reussis}/${data.nb_matchs} match(s) resynchronisé(s)${echecTxt}`, echecTxt ? 'erreur' : 'ok');
    if (zone) zone.innerHTML = '';
  } catch (e) {
    afficherMsgAdmin('❌ ' + e.message, 'erreur');
    if (zone) zone.innerHTML = '';
  }
}

async function adminSyncClubs() {
  afficherMsgAdmin('⏳ Synchronisation des clubs…', 'info');
  try {
    const data = await apiPost('clubs.php?action=sync_clubs', {});
    const err = data.erreurs?.length ? ` — ⚠️ ${data.erreurs.length} erreur(s) : ${data.erreurs.join(' / ')}` : '';
    afficherMsgAdmin(`✅ ${data.inseres} club(s) ajouté(s), ${data.modifies} mis à jour (${data.total} au total)${err}`, err ? 'erreur' : 'ok');
    cacheClubs = null; cacheClubsSaisonId = undefined; // vider le cache pour que les sélecteurs se rafraîchissent
    chargerAdminClubsSelect();
    chargerAdminCorrectionClubSelect();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

function _rendreResultatEffectif(r) {
  if (r.erreur) return `<div class="admin-effectif-ligne"><strong>${r.club}</strong> — <span class="txt-rouge">${r.erreur}</span></div>`;
  if (!r.arrivees.length && !r.departs.length) {
    return `<div class="admin-effectif-ligne"><strong>${r.club}</strong> — aucune arrivée/départ détecté (effectif tout de même réactualisé)</div>`;
  }
  return `
    <div class="admin-effectif-ligne">
      <strong>${r.club}</strong>
      ${r.arrivees.map(n => `<div class="txt-vert">+ ${n}</div>`).join('')}
      ${r.departs.map(n => `<div class="txt-rouge">− ${n}</div>`).join('')}
    </div>`;
}

async function adminSyncEffectifs() {
  const clubId = document.getElementById('admin-club-effectif-select').value;
  const zone = document.getElementById('admin-effectifs-resultat');
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Actualisation…</div>';

  try {
    if (clubId) {
      const r = await apiPost(`clubs.php?action=sync_effectif&club_id=${clubId}`, {});
      zone.innerHTML = _rendreResultatEffectif(r);
    } else {
      const data = await apiPost('clubs.php?action=sync_tous_effectifs', {});
      zone.innerHTML = data.resultats.map(_rendreResultatEffectif).join('');
    }
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

// ============================================================
//  Correction manuelle d'un effectif (mercato pas encore repris
//  par API-Football) — ajout d'un joueur, masquage d'un joueur
//  parti, et gestion des lignes déjà corrigées à la main.
// ============================================================

async function chargerAdminCorrectionClubSelect() {
  const sel = document.getElementById('admin-correction-club-select');
  if (!sel) return;
  const clubs = await getClubs();
  const tries = [...clubs].sort((a, b) => a.nom_court.localeCompare(b.nom_court, 'fr'));
  sel.innerHTML = '<option value="">— Choisir un club —</option>'
    + tries.map(c => `<option value="${c.id}">${c.nom_court}</option>`).join('');
}

async function adminCorrectionClubChange() {
  const clubId = document.getElementById('admin-correction-club-select').value;
  const zone = document.getElementById('admin-correction-liste');
  if (!clubId) { zone.innerHTML = ''; return; }
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';
  try {
    const data = await apiGet(`clubs.php?action=effectif&club_id=${clubId}&inclure_masques=1`);
    const effectif = data.effectif || [];
    if (!effectif.length) { zone.innerHTML = '<p>Effectif vide.</p>'; return; }
    zone.innerHTML = effectif.map(j => {
      const nom = `${j.prenom ? j.prenom + ' ' : ''}${j.nom}`;
      const tag = j.masque ? ' <span class="txt-rouge">(masqué)</span>' : (j.manuel ? ' <span class="txt-vert">(ajout manuel)</span>' : '');
      let actions = '';
      if (j.masque) {
        actions = `<button class="btn btn-secondary btn-sm" onclick="adminDemasquerJoueur(${j.id})">Réafficher</button>`;
      } else if (j.manuel) {
        actions = `<button class="btn btn-secondary btn-sm" onclick="adminSupprimerJoueurManuel(${j.id})">Supprimer</button>`;
      } else {
        actions = `<button class="btn btn-secondary btn-sm" onclick="adminMasquerJoueur(${j.id})">Masquer (parti)</button>`;
      }
      return `<div class="admin-effectif-ligne">${nom} — <span style="opacity:.7">${j.poste}</span>${tag} ${actions}</div>`;
    }).join('');
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

async function adminAjouterJoueurManuel() {
  const clubId = document.getElementById('admin-correction-club-select').value;
  const nom = document.getElementById('admin-correction-nom').value.trim();
  const prenom = document.getElementById('admin-correction-prenom').value.trim();
  const poste = document.getElementById('admin-correction-poste').value;
  const numero = document.getElementById('admin-correction-numero').value.trim();
  const msg = document.getElementById('admin-correction-msg');

  if (!clubId) { msg.innerHTML = '<span class="txt-rouge">Choisis d\'abord un club.</span>'; return; }
  if (!nom || !poste) { msg.innerHTML = '<span class="txt-rouge">Nom et poste sont obligatoires.</span>'; return; }

  msg.innerHTML = '<div class="loading"><div class="spinner"></div> Ajout…</div>';
  try {
    await apiPost('clubs.php?action=ajouter_joueur_manuel', {
      club_id: clubId, nom, prenom, poste, numero,
    });
    document.getElementById('admin-correction-nom').value = '';
    document.getElementById('admin-correction-prenom').value = '';
    document.getElementById('admin-correction-numero').value = '';
    msg.innerHTML = `<span class="txt-vert">✅ ${nom} ajouté.</span>`;
    adminCorrectionClubChange();
  } catch (e) {
    msg.innerHTML = `<span class="txt-rouge">❌ ${e.message}</span>`;
  }
}

async function adminMasquerJoueur(joueurId) {
  if (!confirm('Masquer ce joueur (il ne sera plus affiché tant qu\'API-Football n\'aura pas confirmé son départ) ?')) return;
  try {
    await apiPost('clubs.php?action=masquer_joueur', { joueur_id: joueurId });
    adminCorrectionClubChange();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function adminDemasquerJoueur(joueurId) {
  try {
    await apiPost('clubs.php?action=demasquer_joueur', { joueur_id: joueurId });
    adminCorrectionClubChange();
  } catch (e) { alert('Erreur : ' + e.message); }
}

async function adminSupprimerJoueurManuel(joueurId) {
  if (!confirm('Supprimer définitivement cette fiche ajoutée à la main ?')) return;
  try {
    await apiPost('clubs.php?action=supprimer_joueur_manuel', { joueur_id: joueurId });
    adminCorrectionClubChange();
  } catch (e) { alert('Erreur : ' + e.message); }
}

// ============================================================
//  Copie de tables entre environnements PROD et TEST
// ============================================================

function _rendreResultatCopie(r) {
  if (r.statut === 'erreur') {
    return `<div class="txt-rouge">❌ Échec : ${r.erreur}</div>` +
      (r.log?.length ? `<div style="font-size:.75rem;opacity:.7;margin-top:4px">${r.log.join('<br>')}</div>` : '');
  }
  return `<div class="txt-vert">✅ Copie terminée</div>
    <div style="font-size:.75rem;opacity:.8;margin-top:4px">${(r.log || []).join('<br>')}</div>`;
}

async function adminCopierProdVersTest() {
  if (!confirm(
    "Copier PROD → TEST ?\n\n" +
    "Toutes les tables de contenu de l'environnement TEST (clubs, matchs, effectifs, pronostics, etc.) " +
    "vont être ÉCRASÉES par une copie de la PROD. La table users n'est pas touchée.\n\n" +
    "Une sauvegarde horodatée de l'ancien contenu de TEST est conservée automatiquement."
  )) return;

  const zone = document.getElementById('admin-copie-resultat');
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Copie en cours…</div>';
  try {
    const r = await apiPost('copie_environnements.php?action=copier_prod_vers_test', {});
    zone.innerHTML = _rendreResultatCopie(r);
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

async function adminCopierTestVersProd() {
  if (!confirm(
    "⚠️ ATTENTION ⚠️\n\n" +
    "Tu es sur le point d'écraser les VRAIES données de PROD (clubs, matchs, effectifs, pronostics de tes utilisateurs) " +
    "avec le contenu de TEST.\n\n" +
    "C'est le sens INVERSE de ton usage habituel. Continue seulement si c'est vraiment voulu."
  )) return;

  const phrase = prompt(
    'Pour confirmer cette opération irréversible sur la PROD, tape exactement :\nCOPIER VERS PROD'
  );
  if (phrase !== 'COPIER VERS PROD') {
    alert('Phrase incorrecte ou annulée — rien n\'a été copié.');
    return;
  }

  const zone = document.getElementById('admin-copie-resultat');
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Copie en cours…</div>';
  try {
    const r = await apiPost('copie_environnements.php?action=copier_test_vers_prod', { confirmation: phrase });
    zone.innerHTML = _rendreResultatCopie(r);
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

function _rendreResultatSchema(r) {
  if (r.tout_identique) {
    return '<div class="txt-vert">✅ Aucun écart — les 2 bases ont exactement la même structure</div>';
  }

  let html = '<div class="txt-rouge" style="margin-bottom:8px">⚠️ Des écarts ont été détectés :</div>';

  if (r.tables_absentes_prod.length) {
    html += `<div style="margin-bottom:6px"><strong>Tables manquantes en PROD :</strong> ${r.tables_absentes_prod.join(', ')}</div>`;
  }
  if (r.tables_absentes_test.length) {
    html += `<div style="margin-bottom:6px"><strong>Tables manquantes en TEST :</strong> ${r.tables_absentes_test.join(', ')}</div>`;
  }

  r.ecarts_colonnes.forEach(e => {
    html += `<div style="background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius);padding:10px;margin-bottom:8px">
      <div style="font-weight:700;margin-bottom:4px">Table : ${e.table}</div>`;
    if (e.colonnes_absentes_prod.length) {
      html += `<div class="txt-rouge" style="font-size:.82rem">Colonnes absentes en PROD : ${e.colonnes_absentes_prod.join(', ')}</div>`;
    }
    if (e.colonnes_absentes_test.length) {
      html += `<div class="txt-rouge" style="font-size:.82rem">Colonnes absentes en TEST : ${e.colonnes_absentes_test.join(', ')}</div>`;
    }
    e.colonnes_differentes.forEach(c => {
      html += `<div class="txt2" style="font-size:.8rem">Colonne <strong>${c.colonne}</strong> différente — PROD: ${c.prod} / TEST: ${c.test}</div>`;
    });
    html += '</div>';
  });

  return html;
}

async function adminVerifierSchema() {
  const zone = document.getElementById('admin-schema-resultat');
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Comparaison en cours…</div>';
  try {
    const r = await apiGet('verifier_schema.php?action=comparer');
    zone.innerHTML = _rendreResultatSchema(r);
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

async function adminResetMdp(userId, nom) {
  if (!confirm(`Réinitialiser le mot de passe de ${nom} à "Prono2026!" ?`)) return;
  try {
    await apiPost('users.php?action=reset_mdp', { user_id: userId, nouveau_mdp: 'Prono2026!' });
    afficherMsgAdmin(`✅ Mot de passe de ${nom} réinitialisé à "Prono2026!"`, 'ok');
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminSupprimerUser(userId, nom) {
  if (!confirm(`Supprimer définitivement le compte de ${nom} ?\n\nSes pronostics seront supprimés en même temps. Cette action est irréversible.`)) return;
  try {
    await apiPost('users.php?action=supprimer', { user_id: userId });
    afficherMsgAdmin(`✅ Compte de ${nom} supprimé`, 'ok');
    chargerAdminUsers();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminConfirmerEmail(userId, nom) {
  if (!confirm(`Confirmer manuellement l'email de ${nom} (s'il n'a jamais reçu le mail) ?`)) return;
  try {
    await apiPost('users.php?action=confirmer_email_admin', { user_id: userId });
    afficherMsgAdmin(`✅ Email de ${nom} confirmé manuellement`, 'ok');
    chargerAdminUsers();
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

async function adminValiderBonus(bonusId, type, numeroChoix = 1) {
  const suffix = type === 'multi_club' ? `-${numeroChoix}` : '';
  const el = document.getElementById(`admin-bon-${bonusId}${suffix}`);
  if (!el) return;
  const body = type === 'joueur'
    ? { bonus_id: bonusId, joueur: el.value, numero_choix: numeroChoix }
    : { bonus_id: bonusId, club_id: parseInt(el.value), numero_choix: numeroChoix };
  try {
    const data = await apiPost('bonus.php?action=valider', body);
    afficherMsgAdmin(`✅ ${data.message}`, 'ok');
  } catch (e) { afficherMsgAdmin('❌ ' + e.message, 'erreur'); }
}

// Conteneur des messages Admin ("toasts") — flottant, toujours visible à
// l'écran quel que soit l'endroit où l'admin a scrollé, avec une croix de
// fermeture. Remplace l'ancien comportement qui forçait un scroll automatique
// vers un message fixe en haut de l'onglet Admin (pénible quand on enchaîne
// plusieurs actions, ex: modifier les points de plusieurs bonus à la suite).
function _conteneurToastAdmin() {
  let conteneur = document.getElementById('admin-toast-conteneur');
  if (!conteneur) {
    conteneur = document.createElement('div');
    conteneur.id = 'admin-toast-conteneur';
    conteneur.style.cssText = `
      position:fixed; top:16px; left:50%; transform:translateX(-50%);
      z-index:9999; display:flex; flex-direction:column; gap:8px;
      width:min(420px, 90vw); pointer-events:none;
    `;
    document.body.appendChild(conteneur);
  }
  return conteneur;
}

function afficherMsgAdmin(msg, type) {
  const contenu = type === 'ok' ? msgOk(msg)
               : type === 'erreur' ? msgErreur(msg)
               : `<div style="color:var(--txt2);font-size:.84rem">${msg}</div>`;

  const conteneur = _conteneurToastAdmin();

  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events:auto; background:var(--bg2); border:1px solid var(--bord);
    border-radius:var(--radius); box-shadow:0 6px 20px rgba(0,0,0,.35);
    padding:12px 38px 12px 14px; position:relative;
    opacity:0; transform:translateY(-8px); transition:opacity .2s, transform .2s;
  `;
  toast.innerHTML = contenu + `
    <button aria-label="Fermer" onclick="this.parentElement.remove()" style="
      position:absolute; top:4px; right:6px; background:none; border:none;
      color:var(--txt2); font-size:1.3rem; line-height:1; cursor:pointer; padding:6px;
    ">×</button>`;
  conteneur.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    if (!toast.isConnected) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 200);
  }, 5000);
}

// ============================================================
//  MODAL EFFECTIF
// ============================================================
async function ouvrirEffectif(clubId, nomClub) {
  const modal = document.getElementById('modal-club');
  const contenu = document.getElementById('modal-club-contenu');
  modal.classList.remove('hidden');
  enregistrerOuvertureModale('modal-club');
  contenu.innerHTML = `<div class="loading"><div class="spinner"></div> Chargement de l'effectif…</div>`;

  try {
    const data = await apiGet(`clubs.php?action=effectif&club_id=${clubId}`);
    const effectif = data.effectif || [];
    const club = data.club || {};

    if (!effectif.length) {
      contenu.innerHTML = `
        <div class="modal-title">👥 ${nomClub}</div>
        ${club.entraineur ? `<div class="txt2" style="font-size:.82rem;margin-bottom:10px">🧑‍💼 Entraîneur : ${club.entraineur}</div>` : ''}
        <div class="empty-state"><div class="empty-icon">👥</div>Effectif non disponible</div>`;
      return;
    }

    // Grouper par poste
    const postes = ['Gardien', 'Défenseur', 'Milieu', 'Attaquant', 'Inconnu'];
    const parPoste = {};
    postes.forEach(p => parPoste[p] = []);
    effectif.forEach(j => {
      const p = parPoste[j.poste] !== undefined ? j.poste : 'Inconnu';
      parPoste[p].push(j);
    });

    const logoHtml = club.logo_url
      ? `<img src="${club.logo_url}" style="width:36px;height:36px;object-fit:contain;margin-right:10px;flex-shrink:0">`
      : '';

    let html = `
      <div style="display:flex;align-items:center;margin-bottom:12px;padding-bottom:10px;
                  border-bottom:1px solid var(--bord);flex-shrink:0">
        ${logoHtml}
        <div style="flex:1;min-width:0">
          <div style="font-size:1rem;font-weight:700">${nomClub}</div>
          ${club.entraineur ? `<div class="txt2" style="font-size:.78rem;margin-top:2px">🧑‍💼 Entraîneur : ${club.entraineur}</div>` : ''}
        </div>
      </div>
      <div style="overflow-y:auto;flex:1;min-height:0;padding-right:2px">`;

    postes.forEach(poste => {
      const joueurs = parPoste[poste];
      if (!joueurs.length) return;

      const emoji = { Gardien:'🧤', Défenseur:'🛡️', Milieu:'⚙️', Attaquant:'⚽', Inconnu:'👤' };

      html += `<div style="font-size:.72rem;font-weight:700;color:var(--txt2);
                           text-transform:uppercase;letter-spacing:.5px;
                           margin:10px 0 5px">${emoji[poste]} ${poste}s</div>`;

      joueurs.forEach(j => {
        const flag = j.nationalite
          ? `<img src="https://flagcdn.com/16x12/${getNationaliteCode(j.nationalite)}.png"
                  alt="${j.nationalite}" style="width:16px;height:12px;object-fit:cover;border-radius:1px;flex-shrink:0"
                  onerror="this.style.display='none'">` : '';

        html += `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;
                      background:var(--bg3);border-radius:var(--radius-s);
                      margin-bottom:3px;font-size:.82rem">
            ${j.photo_url
              ? `<img src="${j.photo_url}" style="width:26px;height:26px;border-radius:50%;
                          object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
              : `<div style="width:26px;height:26px;border-radius:50%;background:var(--bg4);
                             display:flex;align-items:center;justify-content:center;
                             font-size:.62rem;color:var(--txt2);flex-shrink:0">${j.numero || '?'}</div>`}
            ${j.numero ? `<span style="color:var(--txt2);font-size:.72rem;width:18px;flex-shrink:0">#${j.numero}</span>` : '<span style="width:18px;flex-shrink:0"></span>'}
            <span style="flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${j.prenom ? j.prenom + ' ' : ''}${j.nom}</span>
            <span style="color:var(--txt2);font-size:.72rem;white-space:nowrap;flex-shrink:0">${j.nationalite || ''}</span>
            ${flag}
          </div>`;
      });
    });

    html += `</div>`;
    contenu.innerHTML = html;

  } catch (e) {
    contenu.innerHTML = `
      <div class="modal-title">👥 ${nomClub}</div>
      ${msgErreur('Erreur chargement effectif : ' + e.message)}`;
  }
}

// Convertir nationalité en code pays pour flagcdn.com
// Correspondance nom de pays (tel que renvoyé par API-Football,
// champ "nationality") → code pays flagcdn.com. Liste volontairement
// large (~200 entrées, quasi tous les pays existants) plutôt qu'une
// table dédiée en base : ce sont des données de référence qui ne
// bougent quasiment jamais (voir décision du 24/08/2026). Retombe sur
// 'un' (drapeau générique "inconnu") si un nom ne matche pas — le nom
// du pays reste affiché en texte dans tous les cas.
function getNationaliteCode(nationalite) {
  const codes = {
    // Europe
    'France':'fr','Spain':'es','Portugal':'pt','Germany':'de','Italy':'it',
    'England':'gb-eng','Scotland':'gb-sct','Wales':'gb-wls','Northern Ireland':'gb-nir',
    'Ireland':'ie','Netherlands':'nl','Belgium':'be','Switzerland':'ch','Austria':'at',
    'Luxembourg':'lu','Denmark':'dk','Sweden':'se','Norway':'no','Finland':'fi',
    'Iceland':'is','Poland':'pl','Czech Republic':'cz','Slovakia':'sk','Hungary':'hu',
    'Slovenia':'si','Croatia':'hr','Bosnia and Herzegovina':'ba','Serbia':'rs',
    'Montenegro':'me','North Macedonia':'mk','Albania':'al','Kosovo':'xk','Greece':'gr',
    'Bulgaria':'bg','Romania':'ro','Moldova':'md','Ukraine':'ua','Belarus':'by',
    'Russia':'ru','Estonia':'ee','Latvia':'lv','Lithuania':'lt','Malta':'mt',
    'Cyprus':'cy','Turkey':'tr','Andorra':'ad','Monaco':'mc','San Marino':'sm',
    'Liechtenstein':'li','Gibraltar':'gi','Faroe Islands':'fo','Georgia':'ge',
    'Armenia':'am','Azerbaijan':'az','Kazakhstan':'kz',
    // Afrique
    'Morocco':'ma','Algeria':'dz','Tunisia':'tn','Libya':'ly','Egypt':'eg',
    'Senegal':'sn','Mali':'ml','Guinea':'gn','Guinea-Bissau':'gw','Ivory Coast':'ci',
    "Côte d'Ivoire":'ci','Ghana':'gh','Nigeria':'ng','Niger':'ne','Burkina Faso':'bf',
    'Togo':'tg','Benin':'bj','Cameroon':'cm','Gabon':'ga','Congo':'cg','Congo DR':'cd',
    'DR Congo':'cd','Central African Republic':'cf','Chad':'td','Equatorial Guinea':'gq',
    'Sao Tome and Principe':'st','Angola':'ao','Zambia':'zm','Zimbabwe':'zw',
    'Mozambique':'mz','Malawi':'mw','Tanzania':'tz','Kenya':'ke','Uganda':'ug',
    'Rwanda':'rw','Burundi':'bi','Ethiopia':'et','Eritrea':'er','Djibouti':'dj',
    'Somalia':'so','South Sudan':'ss','Sudan':'sd','South Africa':'za','Namibia':'na',
    'Botswana':'bw','Lesotho':'ls','Eswatini':'sz','Madagascar':'mg','Mauritius':'mu',
    'Comoros':'km','Cape Verde':'cv','Gambia':'gm','Mauritania':'mr','Sierra Leone':'sl',
    'Liberia':'lr','Reunion':'re',
    // Amériques
    'United States':'us','Canada':'ca','Mexico':'mx','Brazil':'br','Argentina':'ar',
    'Uruguay':'uy','Chile':'cl','Paraguay':'py','Bolivia':'bo','Peru':'pe',
    'Ecuador':'ec','Colombia':'co','Venezuela':'ve','Guyana':'gy','Suriname':'sr',
    'Panama':'pa','Costa Rica':'cr','Nicaragua':'ni','Honduras':'hn','El Salvador':'sv',
    'Guatemala':'gt','Belize':'bz','Cuba':'cu','Jamaica':'jm','Haiti':'ht',
    'Dominican Republic':'do','Trinidad and Tobago':'tt','Bahamas':'bs',
    'Martinique':'mq','Guadeloupe':'gp','French Guiana':'gf',
    // Asie
    'Japan':'jp','South Korea':'kr','China':'cn','North Korea':'kp',
    'Saudi Arabia':'sa','Iran':'ir','Iraq':'iq','Israel':'il','Palestine':'ps',
    'Jordan':'jo','Lebanon':'lb','Syria':'sy','United Arab Emirates':'ae','Qatar':'qa',
    'Kuwait':'kw','Bahrain':'bh','Oman':'om','Yemen':'ye','India':'in','Pakistan':'pk',
    'Bangladesh':'bd','Sri Lanka':'lk','Nepal':'np','Afghanistan':'af','Uzbekistan':'uz',
    'Turkmenistan':'tm','Tajikistan':'tj','Kyrgyzstan':'kg','Mongolia':'mn',
    'Thailand':'th','Vietnam':'vn','Cambodia':'kh','Laos':'la','Myanmar':'mm',
    'Malaysia':'my','Singapore':'sg','Indonesia':'id','Philippines':'ph',
    'Brunei':'bn','Timor-Leste':'tl','Taiwan':'tw','Hong Kong':'hk','Macau':'mo',
    // Océanie
    'Australia':'au','New Zealand':'nz','Fiji':'fj','Papua New Guinea':'pg',
    'Solomon Islands':'sb','Vanuatu':'vu','New Caledonia':'nc','Tahiti':'pf',
  };
  if (!nationalite) return 'un';
  // Recherche insensible à la casse et aux espaces en trop — utile
  // notamment pour les saisies manuelles via phpMyAdmin.
  const cible = nationalite.trim().toLowerCase();
  const cle = Object.keys(codes).find(k => k.toLowerCase() === cible);
  return cle ? codes[cle] : 'un';
}
// ── Modal classement (depuis un match) ──
async function ouvrirModalClassementMatch(clubDomId, clubExtId) {
  const modal = document.getElementById('modal-classement-match');
  const contenu = document.getElementById('modal-classement-match-contenu');
  modal.classList.remove('hidden');
  enregistrerOuvertureModale('modal-classement-match');
  contenu.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await apiGet('classement.php?action=equipes');
    contenu.innerHTML = renderClassementEquipes(data.classement || [], [clubDomId, clubExtId]);
    _armerScrollHint(contenu);

    // Amener la vue sur la 1ère équipe surlignée, sans changer de page
    requestAnimationFrame(() => {
      const ligne = contenu.querySelector('.match-highlight-row');
      if (ligne) ligne.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  } catch (e) {
    contenu.innerHTML = msgErreur('Impossible de charger le classement');
  }
  requestAnimationFrame(() => activerDrag('modal-classement-match', 'hdr-classement-match'));
}

// ── Modal composition d'équipe (titulaires sur le terrain + remplaçants) ──
async function ouvrirComposition(matchId, clubId, nomClub) {
  const modal   = document.getElementById('modal-composition');
  const box     = modal.querySelector('.modal');
  const contenu = document.getElementById('modal-composition-contenu');
  const hdr     = document.getElementById('hdr-composition');
  const btnEffectif = document.getElementById('btn-effectif-compo');
  box.classList.remove('modal-composition-wide');
  modal.classList.remove('hidden');
  enregistrerOuvertureModale('modal-composition');
  hdr.innerHTML = ICON_COMPOS + ' Composition — ' + (nomClub || '');
  contenu.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement de la composition…</div>';
  if (btnEffectif) btnEffectif.style.display = 'none';

  try {
    const [data] = await Promise.all([
      apiGet(`compositions.php?action=get&match_id=${matchId}`),
      _chargerFormationLanes(),
    ]);
    const cote = (data.dom.club_id === clubId) ? data.dom : data.ext;
    hdr.innerHTML = ICON_COMPOS + ' Composition — ' + cote.nom;
    contenu.innerHTML = _renderCoteOuMessage(cote);

    // Le bouton "effectif complet" en haut à gauche ne sert que quand la
    // compo EST déjà connue (sinon le bloc "pas encore disponible" a déjà
    // son propre gros bouton, pas besoin de doublon)
    const compoConnue = !!(cote.compo && cote.compo.titulaires && cote.compo.titulaires.length);
    if (btnEffectif && compoConnue) {
      window._compoClubActuel = { id: cote.club_id, nom: cote.nom };
      btnEffectif.style.display = '';
    }
  } catch (e) {
    contenu.innerHTML = msgErreur('Impossible de charger la composition');
  }
  requestAnimationFrame(() => activerDrag('modal-composition', 'hdr-composition'));
}

function ouvrirEffectifDepuisComposition() {
  if (!window._compoClubActuel) return;
  const { id, nom } = window._compoClubActuel;
  fermerModal('modal-composition');
  ouvrirEffectif(id, nom);
}

// ── Modal composition des 2 équipes ensemble (depuis la carte match) ──
// Terrain unique en largeur, coupé en 2, bancs listés de chaque côté.
async function ouvrirCompositionMatch(matchId) {
  const modal   = document.getElementById('modal-composition');
  const box     = modal.querySelector('.modal');
  const contenu = document.getElementById('modal-composition-contenu');
  const hdr     = document.getElementById('hdr-composition');
  const btnEffectif = document.getElementById('btn-effectif-compo');
  box.classList.add('modal-composition-wide');
  modal.classList.remove('hidden');
  enregistrerOuvertureModale('modal-composition');
  hdr.innerHTML = ICON_COMPOS + ' Compositions du match';
  contenu.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement des compositions…</div>';
  if (btnEffectif) btnEffectif.style.display = 'none'; // ambigu ici : 2 clubs affichés en même temps

  try {
    const [data] = await Promise.all([
      apiGet(`compositions.php?action=get&match_id=${matchId}`),
      _chargerFormationLanes(),
    ]);
    hdr.innerHTML = `${ICON_COMPOS} ${data.dom.nom} — ${data.ext.nom}`;
    contenu.innerHTML = renderCompositionMatchHorizontal(data.dom, data.ext);
  } catch (e) {
    contenu.innerHTML = msgErreur('Impossible de charger les compositions');
  }
  requestAnimationFrame(() => activerDrag('modal-composition', 'hdr-composition'));
}

function renderCompositionMatchHorizontal(dom, ext) {
  const domOk = !!(dom.compo && dom.compo.titulaires && dom.compo.titulaires.length);
  const extOk = !!(ext.compo && ext.compo.titulaires && ext.compo.titulaires.length);

  const joueurPitchHtml = (p) => {
    const initiale = (p.nom || '?').charAt(0).toUpperCase();
    const img = p.photo_url
      ? `<img class="pitch-player-photo-h" src="${p.photo_url}" alt="" onerror="imgFallback(this, '${initiale}')">`
      : `<div class="pitch-player-photo-h photo-fallback">${initiale}</div>`;
    return `
      <div class="pitch-player pitch-player-h" style="left:${p.xPct}%; top:${p.yPct}%">
        <div class="pitch-player-photo-wrap-h">
          ${img}
          <span class="pitch-player-num pitch-player-num-h">${p.numero ?? ''}</span>
          ${_badgesJoueur(p)}
        </div>
        <div class="pitch-player-name pitch-player-name-h">${_nomAffichage(p.nom)}</div>
        ${_flecheSortie(p)}
      </div>`;
  };

  const joueursDomHtml = domOk
    ? _calculerPositionsHorizontal(dom.compo.titulaires, 'gauche', dom.compo.formation).map(joueurPitchHtml).join('')
    : '';
  const joueursExtHtml = extOk
    ? _calculerPositionsHorizontal(ext.compo.titulaires, 'droite', ext.compo.formation).map(joueurPitchHtml).join('')
    : '';

  const domNoteMoy = domOk ? _noteMoyenneEquipe(dom.compo.titulaires) : null;
  const extNoteMoy = extOk ? _noteMoyenneEquipe(ext.compo.titulaires) : null;

  const bancColonne = (cote, ok, miroir) => {
    if (!ok) {
      return `<div class="txt2" style="font-size:.76rem;text-align:center;padding:10px 0">Compo pas encore publiée</div>`;
    }
    return _rendreBancAvecSubstitutions(cote.compo.titulaires, cote.compo.remplacants, true, miroir)
      || '<div class="txt2" style="font-size:.76rem">Aucun remplaçant listé</div>';
  };

  return `
    <div class="compo-vs-header">
      <div class="compo-vs-team gauche">
        <span class="compo-vs-nom">${dom.nom}</span>
        <span class="compo-vs-formation">${(dom.compo && dom.compo.formation) || '—'}</span>
        ${domNoteMoy ? `<span class="compo-note-moyenne-h ${_classeNote(domNoteMoy)}">${_pctFr(domNoteMoy)}</span>` : ''}
      </div>
      ${userInfo.is_admin ? `<button class="btn-grille-debug" onclick="toggleGrilleDebug()" title="Afficher/masquer le quadrillage de repérage">🔲</button>` : ''}
      <div class="compo-vs-team droite">
        ${extNoteMoy ? `<span class="compo-note-moyenne-h ${_classeNote(extNoteMoy)}">${_pctFr(extNoteMoy)}</span>` : ''}
        <span class="compo-vs-formation">${(ext.compo && ext.compo.formation) || '—'}</span>
        <span class="compo-vs-nom">${ext.nom}</span>
      </div>
    </div>
    ${(dom.compo?.coach || ext.compo?.coach) ? `
    <div class="compo-vs-coachs">
      <span>${dom.compo?.coach ? `🧑‍💼 ${dom.compo.coach}` : ''}</span>
      <span>${ext.compo?.coach ? `🧑‍💼 ${ext.compo.coach}` : ''}</span>
    </div>` : ''}
    <div class="pitch-h-wrap">
      <div class="pitch-h">
        <div class="pitch-h-mid"></div>
        <div class="pitch-h-circle"></div>
        <div class="pitch-h-box-left"></div>
        <div class="pitch-h-box-right"></div>
        <div class="pitch-h-goal-left"></div>
        <div class="pitch-h-goal-right"></div>
        <div class="pitch-grid-overlay">
          ${_grilleDebugHorizontaleHtml()}
          ${_grilleDebugColonnesHtml('gauche')}
          ${_grilleDebugColonnesHtml('droite')}
        </div>
        ${joueursDomHtml}
        ${joueursExtHtml}
      </div>
    </div>

    <div class="compo-bench-cols">
      <div>
        <div class="bench-title bench-title-compact">🪑 Remplaçants</div>
        ${bancColonne(dom, domOk, false)}
      </div>
      <div>
        <div class="bench-title bench-title-compact bench-title-right">🪑 Remplaçants</div>
        ${bancColonne(ext, extOk, true)}
      </div>
    </div>`;
}

// Répartition (%) des joueurs d'une même ligne sur la largeur du terrain
// (l'axe touche-à-touche : xPct en vue verticale équipe seule, yPct en
// vue horizontale combinée — même logique dans les 2 cas). Uniforme par
// défaut (i/(n+1)×100), mais pour une ligne de 4 (défense à 4 d'un
// 4-3-1-2, milieu à 4 d'un 3-4-2-1...) l'écart uniforme resserre trop
// les ailiers/AR, qui n'atteignent jamais vraiment les couloirs — on les
// écarte davantage vers les extrémités, tout en gardant les 2 joueurs
// axiaux plus proches du centre.
function _xPositionsLigne(n, bordExtreme = 8) {
  if (n === 4) return [bordExtreme, 36, 64, 100 - bordExtreme];
  const positions = [];
  for (let i = 0; i < n; i++) positions.push(((i + 1) / (n + 1)) * 100);
  return positions;
}

// Gabarits de couloirs (%) par formation, ligne par ligne (défense →
// attaque). Chargés depuis la base (table formations/formation_positions,
// via compositions.php?action=formations) — modifiables directement en
// base sans toucher au code. Chargés une seule fois et mis en cache en
// mémoire ; en cas d'échec réseau, on retombe silencieusement sur le
// calcul générique pour toutes les formations (aucun blocage de l'UI).
let _formationLanesCache = null;
let _formationLanesPromise = null;
function _chargerFormationLanes() {
  if (_formationLanesCache) return Promise.resolve(_formationLanesCache);
  if (!_formationLanesPromise) {
    _formationLanesPromise = apiGet('compositions.php?action=formations')
      .then(data => { _formationLanesCache = data || {}; return _formationLanesCache; })
      .catch(() => { _formationLanesCache = {}; return _formationLanesCache; });
  }
  return _formationLanesPromise;
}

// Renvoie le tableau [{colonne, pct}, ...] d'une ligne pour une formation
// donnée (un élément par joueur, dans l'ordre gauche→droite). La
// formation inconnue ou un décompte de joueurs qui ne correspond pas
// (carton rouge, données API incomplètes) → null (appelant doit alors
// utiliser son propre repli générique).
function _ligneFormation(formation, indexLigne, n) {
  const gabarit = formation && _formationLanesCache && _formationLanesCache[formation];
  const ligne = gabarit && gabarit[indexLigne];
  if (ligne && ligne.length === n) return ligne;
  return null;
}
function _positionsLigneFormation(formation, indexLigne, n, bordExtreme = 8) {
  const ligne = _ligneFormation(formation, indexLigne, n);
  return ligne ? ligne.map(e => e.pct) : _xPositionsLigne(n, bordExtreme);
}

// Position de profondeur (t, 0=fond de terrain/but, 1=vers le milieu)
// d'une colonne B à H — formule PARTAGÉE entre le quadrillage de
// repérage (lignes visuelles) et le positionnement réel des joueurs :
// garantit que les photos tombent exactement sur les intersections du
// quadrillage plutôt que d'être calculées séparément.
const _LETTRES_COLONNES = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
function _profondeurColonne(colonne) {
  const idx = _LETTRES_COLONNES.indexOf(colonne);
  if (idx === -1) return null;
  const ecartBase = 1 / (_LETTRES_COLONNES.length + 1); // écart d'origine (uniforme, 1/8)
  const ecart = ecartBase * 1.37; // +37% demandé
  const centre = (_LETTRES_COLONNES.length - 1) / 2; // index du milieu (E, 3 sur 0-6)
  return 0.5 + (idx - centre) * ecart;
}

// Variante RÉSERVÉE à la vue individuelle (terrain vertical) : inclut le
// gardien comme ligne "A", calée pile sur sa vraie position (yPct 91),
// avec B à G redistribuées à équidistance entre A et H (H reprend la
// valeur de _profondeurColonne, inchangée). Ne surtout pas utiliser dans
// la vue combinée, déjà validée avec l'ancienne échelle (_profondeurColonne
// telle quelle) — les deux vues ont maintenant des échelles indépendantes.
const _YPCT_GARDIEN_VERTICAL = 91;
function _profondeurColonneVerticale(colonne) {
  const lettres8 = ['A', ..._LETTRES_COLONNES];
  const idx = lettres8.indexOf(colonne);
  if (idx === -1) return null;
  const tA = (86 - _YPCT_GARDIEN_VERTICAL) / 74; // inverse y=86-t×74
  const tH = _profondeurColonne('H');
  return tA + (tH - tA) * (idx / (lettres8.length - 1));
}

// ── Quadrillage de repérage (admin uniquement) ──
// Matérialise les 9 positions latérales (11% à 99%, pas de 11) de votre
// Excel directement sur le terrain, pour vérifier visuellement que
// chaque ligne de joueurs tombe bien à l'endroit attendu. Masqué par
// défaut, affiché/masqué via le bouton 🔲 (voir toggleGrilleDebug).
function _grilleDebugVerticaleHtml() {
  // Terrain dessiné en trapèze (perspective) : coins du polygone ci-dessus
  // (55,14)-(245,14) en haut, (14,386)-(286,386) en bas, viewBox 300x400.
  // Les lignes latérales (1-9) doivent donc converger vers un point de
  // fuite comme les côtés réels du terrain — on les calcule en interpolant
  // entre le bord haut (plus étroit) et le bord bas (plus large), au lieu
  // de tracer des verticales parallèles qui sortiraient du terrain en haut.
  const yTop = 14, yBottom = 386;
  const xTopL = 55, xTopR = 245, xBotL = 14, xBotR = 286;
  let html = '';
  for (let i = 1; i <= 9; i++) {
    const f = (i * 10) / 100;
    const xTop = xTopL + f * (xTopR - xTopL);
    const xBot = xBotL + f * (xBotR - xBotL);
    html += `<line class="pitch-grid-svg-v" x1="${xTop}" y1="${yTop}" x2="${xBot}" y2="${yBottom}"/>`;
    html += `<text class="pitch-grid-svg-label" x="${xBot}" y="${yBottom - 5}" text-anchor="middle">${i}</text>`;
  }
  // Lignes de profondeur du quadrillage — mêmes valeurs que le
  // positionnement réel des joueurs de cette vue (_profondeurColonneVerticale),
  // garantit que les photos tombent exactement sur les intersections.
  const lettres8 = ['A', ..._LETTRES_COLONNES];
  let htmlColonnes = '';
  lettres8.forEach(lettre => {
    const t = _profondeurColonneVerticale(lettre);
    const y = ((86 - t * 74) / 100) * 400;
    const s = (y - yTop) / (yBottom - yTop);
    const xLeft = xTopL + s * (xBotL - xTopL);
    const xRight = xTopR + s * (xBotR - xTopR);
    htmlColonnes += `<line class="pitch-grid-svg-h" x1="${xLeft}" y1="${y}" x2="${xRight}" y2="${y}"/>`;
    htmlColonnes += `<text class="pitch-grid-svg-label-h" x="${xLeft - 4}" y="${y + 3}" text-anchor="end">${lettre}</text>`;
  });
  return `<g class="pitch-grid-overlay">${html}${htmlColonnes}</g>`;
}
function _grilleDebugHorizontaleHtml() {
  // Vue combinée dom/ext : l'axe latéral est ici l'axe vertical de
  // l'écran (yPct) — lignes horizontales de repère.
  let html = '';
  for (let i = 1; i <= 9; i++) {
    const pct = i * 10;
    html += `<div class="pitch-grid-line-h-debug" style="top:${pct}%"><span class="pitch-grid-label">${i}</span></div>`;
  }
  return html;
}
// Lignes de colonnes (B à H, le gardien A n'étant jamais stocké dans la
// table) — purement visuel, pour vérifier que le miroir dom/ext
// fonctionne bien symétriquement.
function _grilleDebugColonnesHtml(sens) {
  let html = '';
  _LETTRES_COLONNES.forEach(lettre => {
    const t = _profondeurColonne(lettre);
    const xPct = sens === 'gauche' ? 9 + t * 34 : 91 - t * 34;
    html += `<div class="pitch-grid-line-col" style="left:${xPct}%"><span class="pitch-grid-label-col">${lettre}</span></div>`;
  });
  return html;
}
function toggleGrilleDebug() {
  document.querySelectorAll('.pitch-grid-overlay').forEach(el => el.classList.toggle('visible'));
}


function _calculerPositionsHorizontal(titulaires, sens, formation = null) {
  const parLigne = {};
  const positions = [];
  titulaires.forEach(p => {
    // Le gardien a sa propre ligne dans le grid API (toujours seul) — on
    // l'exclut du regroupement par ligne tactique (défense/milieu/attaque)
    // pour ne pas décaler l'indexation des gabarits de formation, et on le
    // positionne à part : toujours excentré au fond de son camp, centré
    // latéralement (position_index 5 de votre Excel, pct 55). Détection
    // sur 2 critères (poste ET/OU ligne 1 du grid) : un seul suffit, pour
    // ne jamais le perdre si l'un des 2 champs manque côté API.
    const estGardien = p.poste === 'G' || (p.grid && p.grid.split(':')[0] === '1');
    if (estGardien) {
      // Profondeur volontairement au-delà de la ligne de défense (qui est
      // à 9%/91%, t=0) — sinon gardien et défenseurs se superposent.
      positions.push({ ...p, xPct: sens === 'gauche' ? 4 : 96, yPct: 50 });
      return;
    }
    if (!p.grid) return;
    const [ligne, col] = p.grid.split(':').map(Number);
    if (!parLigne[ligne]) parLigne[ligne] = [];
    parLigne[ligne].push({ ...p, col });
  });
  const lignes = Object.keys(parLigne).map(Number).sort((a, b) => a - b);
  lignes.forEach((ligne, indexLigne) => {
    const joueurs = parLigne[ligne].sort((a, b) => a.col - b.col);
    const n = joueurs.length;
    // Gabarit de la ligne (une entrée {colonne, pct} par joueur, dans
    // l'ordre gauche→droite) si la formation et le nombre de joueurs
    // correspondent ; sinon repli sur le calcul générique/dynamique.
    // Pour l'ext, on retourne l'ORDRE ENTIER (colonne + pct ensemble) —
    // sinon un joueur récupérerait la largeur d'un slot et la profondeur
    // d'un autre.
    const ligneFormationBrute = _ligneFormation(formation, indexLigne, n);
    const ligneFormation = ligneFormationBrute && sens === 'droite'
      ? [...ligneFormationBrute].reverse()
      : ligneFormationBrute;
    const tDynamique = lignes.length > 1 ? (ligne - lignes[0]) / (lignes[lignes.length - 1] - lignes[0] || 1) : 0;
    const yPositionsGenerique = _xPositionsLigne(n);
    joueurs.forEach((p, i) => {
      const entree = ligneFormation && ligneFormation[i];
      const yPct = entree ? entree.pct : yPositionsGenerique[i];
      const t = entree ? _profondeurColonne(entree.colonne) : tDynamique;
      const xPct = sens === 'gauche' ? 9 + t * 34 : 91 - t * 34;
      positions.push({ ...p, xPct, yPct });
    });
  });
  return positions;
}

// Rendu du terrain + banc pour un côté (dom ou ext), ou message si indisponible
// ── Regroupement des remplaçants par poste (Gardiens/Défenseurs/Milieux/Attaquants) ──
// Utilisé à l'identique par la vue composition individuelle et la vue combinée.
const _ORDRE_POSTES  = ['G', 'D', 'M', 'F'];
const _LABELS_POSTES = { G: 'Gardiens', D: 'Défenseurs', M: 'Milieux', F: 'Attaquants' };

// Rendu du banc groupé par poste (Gardiens/Défenseurs/Milieux/Attaquants).
// Reçoit titulaires ET remplaçants : quand un remplaçant est entré, on
// retrouve le titulaire sorti à la même minute (minute_sortie ===
// minute_entree) pour afficher son nom juste au-dessus, comme sur
// Ligue1.com.
function _rendreBancAvecSubstitutions(titulaires, remplacants, compact, miroir) {
  if (!remplacants || !remplacants.length) return '';

  const classePlayer = (compact ? 'bench-player bench-player-compact' : 'bench-player') + (miroir ? ' bench-miroir' : '');
  const classeTitre   = compact ? 'bench-groupe-titre bench-groupe-titre-compact' : 'bench-groupe-titre';
  const initiale = p => (p.nom || '?').charAt(0).toUpperCase();
  const photoHtml = (p, cls) => p.photo_url
    ? `<img class="${cls}" src="${p.photo_url}" alt="" onerror="imgFallback(this, '${initiale(p)}')">`
    : `<div class="${cls} photo-fallback">${initiale(p)}</div>`;

  const groupes = {};
  remplacants.forEach(p => {
    const poste = _ORDRE_POSTES.includes(p.poste) ? p.poste : '?';
    (groupes[poste] = groupes[poste] || []).push(p);
  });
  const ordre = _ORDRE_POSTES.filter(p => groupes[p]).concat(groupes['?'] ? ['?'] : []);

  return ordre.map((poste, i) => {
    const lignes = groupes[poste].map(p => {
      const sortant = p.minute_entree != null
        ? (titulaires || []).find(t => t.minute_sortie === p.minute_entree)
        : null;
      return `
      <div class="${classePlayer}">
        <span class="bench-cell-min">${p.minute_entree != null ? `${p.minute_entree}'` : ''}</span>
        ${photoHtml(p, 'bench-player-photo')}
        <span class="bench-player-num">${p.numero ?? '—'}</span>
        <span class="bench-player-nom">${p.nom}</span>
        <span class="bench-cell-fleche">${p.minute_entree != null ? `<span class="bench-sub-fleche bench-sub-fleche-in">↑</span>` : ''}</span>
        <span class="bench-cell-note">${p.note !== null && p.note !== undefined ? `<span class="bench-player-note ${_classeNote(p.note)}">${_pctFr(p.note)}</span>` : ''}</span>
        <span class="bench-cell-carton">${_badgeCartonHtml(p.cartons)}</span>
        ${sortant ? `<span class="bench-player-sortant-nom">${sortant.nom}</span>` : ''}
        ${sortant ? `<span class="bench-sub-fleche bench-sub-fleche-out">↓</span>` : ''}
      </div>`;
    }).join('');
    return `${i > 0 ? '<div class="bench-separateur"></div>' : ''}
      <div class="${classeTitre}">${_LABELS_POSTES[poste] || 'Autres'}</div>
      ${lignes}`;
  }).join('');
}

function _renderCoteOuMessage(cote) {
  if (!cote.compo || !cote.compo.titulaires || !cote.compo.titulaires.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICON_COMPOS}</div>
        Composition pas encore disponible.<br>
        <span class="txt2" style="font-size:.78rem">Elle est généralement publiée 20 à 40 minutes avant le coup d'envoi.</span>
      </div>
      <button class="btn btn-secondary btn-full" style="margin-top:14px"
        onclick="fermerModal('modal-composition'); ouvrirEffectif(${cote.club_id}, '${(cote.nom || '').replace(/'/g, "\\'")}')">
        Voir l'effectif complet
      </button>`;
  }
  return renderCompositionEquipe(cote);
}

// Badges superposés à la photo d'un joueur (note du match + capitaine),
// réutilisés à l'identique par la vue individuelle et la vue combinée.
// Couleur de la note façon appli sportive classique : vert (bonne
// performance) → orange (moyenne) → rouge (faible).
function _classeNote(note) {
  if (note >= 7) return 'note-bonne';
  if (note >= 6) return 'note-moyenne';
  return 'note-faible';
}
function _badgesJoueur(p) {
  const badgeNote = (p.note !== undefined && p.note !== null)
    ? `<span class="pitch-player-note ${_classeNote(p.note)}">${_pctFr(p.note)}</span>` : '';
  const badgeCapitaine = p.capitaine ? `<span class="pitch-player-capitaine">C</span>` : '';
  const badgeCarton = _badgeCartonHtml(p.cartons);
  return badgeNote + badgeCapitaine + badgeCarton;
}
// Badge carton — coin bas-gauche de la photo (seul coin encore libre : le
// n° de maillot est en bas-droite, la note en haut-gauche, le capitaine en
// haut-droite). S'il y a 2 jaunes (donc 1 rouge), on affiche juste le rouge.
function _badgeCartonHtml(cartons) {
  if (!cartons || !cartons.length) return '';
  const aRouge = cartons.some(c => c.type === 'rouge') || cartons.length >= 2;
  const classe = aRouge ? 'pitch-player-carton-rouge' : 'pitch-player-carton-jaune';
  const minute = cartons[0].minute;
  const titre = aRouge ? 'Carton rouge' : `Carton jaune${minute ? ` (${minute}e minute)` : ''}`;
  return `<span class="pitch-player-carton ${classe}" title="${titre}"></span>`;
}
// Flèche de sortie — placée séparément (pas dans les badges photo), en
// flux normal après le nom, pour ne jamais chevaucher/masquer celui-ci.
function _flecheSortie(p) {
  return p.minute_sortie ? `<div class="pitch-player-sorti" title="Remplacé à la ${p.minute_sortie}e minute">↓</div>` : '';
}

function renderCompositionEquipe(cote) {
  const positions = _calculerPositionsTerrain(cote.compo.titulaires, cote.compo.formation);

  const photoImg = (p, cls) => {
    const initiale = (p.nom || '?').charAt(0).toUpperCase();
    return p.photo_url
      ? `<img class="${cls}" src="${p.photo_url}" alt=""
           onerror="imgFallback(this, '${initiale}')">`
      : `<div class="${cls} photo-fallback">${initiale}</div>`;
  };

  const joueursHtml = positions.map(p => `
    <div class="pitch-player" style="left:${p.xPct}%; top:${p.yPct}%">
      <div class="pitch-player-photo-wrap">
        ${photoImg(p, 'pitch-player-photo')}
        <span class="pitch-player-num">${p.numero ?? ''}</span>
        ${_badgesJoueur(p)}
      </div>
      <div class="pitch-player-name">${_nomAffichage(p.nom)}</div>
      ${_flecheSortie(p)}
    </div>`).join('');

  const bancHtml = _rendreBancAvecSubstitutions(cote.compo.titulaires, cote.compo.remplacants, false);
  const noteMoy = _noteMoyenneEquipe(cote.compo.titulaires);

  return `
    <div class="compo-formation">
      Formation : <strong>${cote.compo.formation || '—'}</strong>
      ${noteMoy ? `<span class="compo-note-moyenne">Note moyenne : <b class="${_classeNote(noteMoy)}">${_pctFr(noteMoy)}</b></span>` : ''}
      ${userInfo.is_admin ? `<button class="btn-grille-debug" onclick="toggleGrilleDebug()" title="Afficher/masquer le quadrillage de repérage">🔲</button>` : ''}
    </div>
    <div class="pitch-wrap">
      <div class="pitch">
        <svg class="pitch-lines-svg" viewBox="0 0 300 400">
          <polygon points="55,14 245,14 286,386 14,386" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
          <line x1="35" y1="200" x2="266" y2="200" stroke="rgba(255,255,255,.4)" stroke-width="2"/>
          <ellipse cx="150" cy="200" rx="46" ry="31" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2"/>
          <polyline points="106,14 103,76 197,76 194,14" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2"/>
          <polyline points="88,386 92,298 208,298 213,386" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2"/>
          <rect x="132" y="7" width="36" height="7" fill="rgba(255,255,255,.85)"/>
          <rect x="132" y="386" width="36" height="7" fill="rgba(255,255,255,.85)"/>
          ${_grilleDebugVerticaleHtml()}
        </svg>
        ${joueursHtml}
      </div>
    </div>
    ${cote.compo.coach ? `<div class="compo-coach">🧑‍💼 Entraîneur : ${cote.compo.coach}</div>` : ''}
    <div class="bench-title">🪑 Remplaçants</div>
    <div class="bench-list">${bancHtml || '<div class="txt2" style="font-size:.78rem">Aucun remplaçant listé</div>'}</div>`;
}

// Note moyenne des titulaires (ignore les joueurs sans note, ex: match pas
// encore commencé, ou remplacé avant d'avoir reçu de note)
function _noteMoyenneEquipe(titulaires) {
  const notes = (titulaires || []).map(p => p.note).filter(n => n !== null && n !== undefined);
  if (!notes.length) return null;
  return Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 100) / 100;
}

// Remplace une photo en échec de chargement par un rond avec l'initiale
// du joueur, en conservant exactement les mêmes dimensions/classes.
function imgFallback(img, initiale) {
  const div = document.createElement('div');
  div.className = img.className + ' photo-fallback';
  div.textContent = initiale;
  img.replaceWith(div);
}

// Calcule les positions (%) des titulaires sur le terrain à partir du
// champ "grid" renvoyé par API-Football (format "ligne:colonne").
// Gardien en bas du terrain (excentré, hors regroupement par ligne — voir
// plus bas), dernière ligne de champ (attaque) en haut.
// Corrige un pourcentage latéral "à plat" (0-100) pour tenir compte de la
// perspective du terrain en trapèze (vue individuelle uniquement — même
// géométrie que le <polygon> du fond de terrain et le quadrillage SVG :
// coins à 18,33%/81,67% en haut, 4,67%/95,33% en bas). Sans cette
// correction, un joueur à xPct=20 ne tombe pas sur la ligne "2" du
// quadrillage sauf tout en bas du terrain (là où le trapèze est presque
// aussi large que le rectangle) — l'écart grandit vers le haut.
function _appliquerPerspective(xPctPlat, yPct) {
  const s = yPct / 100; // 0 en haut (attaque), 1 en bas (fond de terrain)
  const gaucheADepth = 18.33 + s * (4.67 - 18.33);
  const droiteADepth = 81.67 + s * (95.33 - 81.67);
  return gaucheADepth + (xPctPlat / 100) * (droiteADepth - gaucheADepth);
}

function _calculerPositionsTerrain(titulaires, formation = null) {
  const parLigne = {};
  const positions = [];
  titulaires.forEach(p => {
    // Le gardien a sa propre ligne dans le grid API (toujours seul) — on
    // l'exclut du regroupement par ligne tactique pour ne pas décaler
    // l'indexation des gabarits de formation (défense/milieu/attaque),
    // et on le positionne à part : fond du terrain, centré latéralement
    // (position_index 5 de votre Excel, pct 55). Détection sur 2 critères
    // (poste ET/OU ligne 1 du grid) : un seul suffit, pour ne jamais le
    // perdre si l'un des 2 champs manque côté API.
    const estGardien = p.poste === 'G' || (p.grid && p.grid.split(':')[0] === '1');
    if (estGardien) {
      // Profondeur volontairement au-delà de la ligne de défense (qui est
      // à 92%, t=0) — sinon gardien et défenseurs se superposent.
      positions.push({ ...p, xPct: _appliquerPerspective(50, _YPCT_GARDIEN_VERTICAL), yPct: _YPCT_GARDIEN_VERTICAL });
      return;
    }
    if (!p.grid) return;
    const [ligne, col] = p.grid.split(':').map(Number);
    if (!parLigne[ligne]) parLigne[ligne] = [];
    parLigne[ligne].push({ ...p, col });
  });
  const lignes = Object.keys(parLigne).map(Number).sort((a, b) => a - b);
  lignes.forEach((ligne, indexLigne) => {
    const joueurs = parLigne[ligne].sort((a, b) => a.col - b.col);
    const n = joueurs.length;
    const ligneFormation = _ligneFormation(formation, indexLigne, n);
    const tDynamique = lignes.length > 1 ? (ligne - lignes[0]) / (lignes[lignes.length - 1] - lignes[0] || 1) : 0;
    const xPositionsGenerique = _xPositionsLigne(n, 14);
    joueurs.forEach((p, i) => {
      const entree = ligneFormation && ligneFormation[i];
      const xPctPlat = entree ? entree.pct : xPositionsGenerique[i];
      const t = entree ? _profondeurColonneVerticale(entree.colonne) : tDynamique;
      const yPct = 86 - t * 74;
      const xPct = _appliquerPerspective(xPctPlat, yPct);
      positions.push({ ...p, xPct, yPct });
    });
  });
  return positions;
}

// Nom de famille seul pour l'étiquette sous la photo (façon maillot)
function _nomAffichage(nom) {
  if (!nom) return '';
  const parts = nom.trim().split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : nom;
}

function ouvrirReglement() {
  document.getElementById('modal-reglement').classList.remove('hidden');
  enregistrerOuvertureModale('modal-reglement');
  requestAnimationFrame(() => activerDrag('modal-reglement', 'hdr-reglement'));
  chargerReglementBareme();
  chargerReglementQuizz();
}

async function chargerReglementQuizz() {
  const el = document.getElementById('reglement-quizz-contenu');
  if (!el) return;
  el.innerHTML = '<li>Chargement…</li>';
  try {
    const data = await apiGet('quizz.php?action=config_publique');
    const pct = data.bonus_sans_faute_pct ?? 50;
    el.innerHTML = `
      <li>Chaque bonne réponse rapporte des points (barème fixé par l'admin, identique pour toutes les questions d'une même semaine).</li>
      <li><strong>Bonus "sans-faute" : +${pct}%</strong> sur le total de la semaine si tu réponds juste à <strong>toutes</strong> les questions de cette semaine de quizz (Quizz J ou Quizz Spécial).</li>
      <li class="txt2" style="font-size:.78rem;margin-top:6px">Ce pourcentage peut évoluer en cours de saison — il est toujours affiché à jour ici.</li>`;
  } catch (e) {
    el.innerHTML = '<li>Impossible de charger les règles du quizz actuelles.</li>';
  }
}

async function chargerReglementBareme() {
  const el = document.getElementById('reglement-bareme-contenu');
  if (!el) return;
  el.innerHTML = '<li>Chargement…</li>';
  try {
    const data = await apiGet('bonus.php?action=bareme_config');
    const b = data.bareme;
    el.innerHTML = `
      <li><strong>${b.pts_exact} points</strong> — score exact</li>
      <li><strong>${b.pts_bon_resultat} points</strong> — bon résultat (victoire/nul/défaite) sans le score exact</li>
      <li><strong>+ ${b.pts_bonus_ecart} point</strong> bonus si l'écart de buts est également juste</li>
      <li><strong>+ ${b.pts_bonus_buts_dom} point</strong> bonus si le nombre de buts de l'équipe à domicile est juste</li>
      <li><strong>+ ${b.pts_bonus_buts_ext} point</strong> bonus si le nombre de buts de l'équipe à l'extérieur est juste</li>
      <li><strong>0 point</strong> — pronostic totalement faux (les bonus de buts ci-dessus restent possibles)</li>
      <li class="txt2" style="font-size:.78rem;margin-top:6px">En cas de score exact, aucun bonus ne s'ajoute : seul le montant "score exact" est attribué.</li>`;
  } catch (e) {
    el.innerHTML = '<li>Impossible de charger le barème actuel.</li>';
  }
}

async function copierEmailAdmin() {
  const email = document.getElementById('contact-email-texte').textContent;
  const btn = document.getElementById('btn-copier-email');
  try {
    await navigator.clipboard.writeText(email);
    const texteOriginal = btn.textContent;
    btn.textContent = '✅ Copié';
    setTimeout(() => { btn.textContent = texteOriginal; }, 1800);
  } catch (e) {
    alert('Adresse à copier manuellement : ' + email);
  }
}

function ouvrirModalPseudo() {
  document.getElementById('pseudo-nom').value = userInfo?.nom || '';
  document.getElementById('pseudo-initiales').value = userInfo?.initiales || '';
  document.getElementById('pseudo-msg').innerHTML = '';
  document.getElementById('modal-pseudo').classList.remove('hidden');
  enregistrerOuvertureModale('modal-pseudo');
  requestAnimationFrame(() => activerDrag('modal-pseudo', 'hdr-pseudo'));
}

function ouvrirModalLegende() {
  document.getElementById('modal-legende-icones').classList.remove('hidden');
  enregistrerOuvertureModale('modal-legende-icones');
  requestAnimationFrame(() => activerDrag('modal-legende-icones', 'hdr-legende-icones'));
}

// ── Équipe de cœur ──
// Charge la liste des clubs une seule fois (mise en cache) puis la sert
// à quiconque en a besoin (inscription, modale de changement, etc.)
// Retrouve l'id du club de cœur DANS la liste donnée (saison affichée),
// à partir de son code — indépendant de la saison où il a été choisi.
// Repli sur l'id brut si jamais le code n'est pas connu (compte ancien).
function resoudreEquipeCoeurId(clubs) {
  if (!userInfo) return null;
  if (userInfo.equipe_coeur_code) {
    const c = (clubs || []).find(c => c.code === userInfo.equipe_coeur_code);
    if (c) return c.id;
    return null; // le club n'existe pas dans cette saison → pas de surlignage
  }
  return userInfo.equipe_coeur_id || null;
}

async function getClubs() {
  // Le cache n'est valable que pour la saison pour laquelle il a été rempli.
  // (évite qu'un appel trop précoce, avant l'initialisation du sélecteur de
  // saison, ne fige la liste des clubs sur la mauvaise saison pour le reste
  // de la session)
  if (cacheClubs && cacheClubsSaisonId === saisonSelectionnee) return cacheClubs;
  try {
    const data = await apiGet('clubs.php?action=liste');
    cacheClubs = data.clubs || [];
    cacheClubsSaisonId = saisonSelectionnee;
  } catch (e) { cacheClubs = []; cacheClubsSaisonId = saisonSelectionnee; }
  return cacheClubs;
}

// selectEl : élément <select> à remplir
// valeurActuelle : id du club à présélectionner (ou null)
// avecOptionVide : ajoute une option "Aucune préférence" en tête
async function peuplerSelectClubs(selectEl, valeurActuelle, avecOptionVide) {
  if (!selectEl) return;
  const clubs = await getClubs();
  const clubsTries = [...clubs].sort((a, b) => a.nom_court.localeCompare(b.nom_court, 'fr'));
  const optionVide = selectEl.querySelector('option[value=""]');
  const texteVide = optionVide ? optionVide.textContent : (avecOptionVide ? 'Aucune préférence' : '');

  selectEl.innerHTML =
    (avecOptionVide ? `<option value="">${texteVide}</option>` : '') +
    clubsTries.map(c => `<option value="${c.id}">${c.nom_court}</option>`).join('');

  if (valeurActuelle) selectEl.value = valeurActuelle;
}

async function ouvrirModalEquipeCoeur() {
  document.getElementById('coeur-msg').innerHTML = '';
  document.getElementById('modal-equipe-coeur').classList.remove('hidden');
  enregistrerOuvertureModale('modal-equipe-coeur');
  const clubs = await getClubs();
  await peuplerSelectClubs(document.getElementById('coeur-club'), resoudreEquipeCoeurId(clubs), true);
  requestAnimationFrame(() => activerDrag('modal-equipe-coeur', 'hdr-coeur'));
}

async function changerEquipeCoeur() {
  const club_id = document.getElementById('coeur-club').value || null;
  const el = document.getElementById('coeur-msg');

  try {
    const data = await apiPost('users.php?action=changer_equipe_coeur', { club_id });
    userInfo.equipe_coeur_id = data.equipe_coeur_id;
    userInfo.equipe_coeur_code = data.equipe_coeur_code;
    el.innerHTML = msgOk(data.message);
    setTimeout(() => fermerModal('modal-equipe-coeur'), 1200);

    // Forcer le rafraîchissement des vues concernées si déjà chargées
    ['grille-contenu', 'classement-general-contenu', 'classement-domicile-contenu', 'classement-exterieur-contenu']
      .forEach(id => {
        const conteneur = document.getElementById(id);
        if (conteneur && conteneur.dataset.loaded) conteneur.dataset.loaded = '';
      });
    chargerGrille(); // ré-affiche immédiatement si l'onglet Grille avait déjà été ouvert
  } catch (e) {
    el.innerHTML = msgErreur(e.message);
  }
}

function ouvrirModalMdp() {
  ['mdp-ancien','mdp-nouveau','mdp-confirm'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('mdp-msg').innerHTML = '';
  document.getElementById('modal-mdp').classList.remove('hidden');
  enregistrerOuvertureModale('modal-mdp');
  requestAnimationFrame(() => activerDrag('modal-mdp', 'hdr-mdp'));
}

async function ouvrirModalNotifs() {
  document.getElementById('modal-notifs').classList.remove('hidden');
  enregistrerOuvertureModale('modal-notifs');
  requestAnimationFrame(() => activerDrag('modal-notifs', 'hdr-notifs'));
  const el = document.getElementById('notifs-contenu');
  try {
    const data = await apiGet('users.php?action=preferences_notif');
    const p = data.preferences;
    const pushSupporte = 'serviceWorker' in navigator && 'PushManager' in window;

    // L'état de la case Push reflète CE navigateur précisément (un joueur
    // peut avoir plusieurs appareils, chacun avec son propre statut) —
    // on interroge le serveur avec l'endpoint de l'abonnement local s'il existe
    let pushCocheIci = false;
    if (pushSupporte) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const sub = registration ? await registration.pushManager.getSubscription() : null;
        if (sub) {
          const statut = await apiGet('users.php?action=push_statut&endpoint=' + encodeURIComponent(sub.endpoint));
          pushCocheIci = !!statut.abonne;
        }
      } catch (e) { /* tant pis, on part de "décoché" par défaut */ }
    }

    el.innerHTML = `
      <div class="form-group" style="flex-direction:row;align-items:center;gap:12px">
        <input type="checkbox" id="notif-email" ${p.notif_email ? 'checked' : ''}>
        <label for="notif-email" style="cursor:pointer">📧 Email — ${userInfo?.email || ''}</label>
      </div>
      <div class="form-group" style="flex-direction:row;align-items:center;gap:12px">
        <input type="checkbox" id="notif-telegram" ${p.notif_telegram ? 'checked' : ''}>
        <label for="notif-telegram" style="cursor:pointer">💬 Telegram</label>
        <button type="button" onclick="toggleAideTelegram()" title="Comment obtenir mon Chat ID ?"
          style="background:none;border:none;color:var(--txt2);cursor:pointer;font-size:1rem;padding:0">ℹ️</button>
      </div>
      <div id="aide-telegram" class="txt3" style="font-size:.75rem;margin-left:28px;margin-bottom:8px;display:none;background:var(--bg2);padding:8px 10px;border-radius:8px">
        <ol style="margin:0;padding-left:18px">
          <li>Cherche <b>@PronosL1_bot</b> sur Telegram</li>
          <li>Clique sur "DÉMARRER" (ou envoie-lui un message)</li>
          <li>Il te répond avec un numéro : ton Chat ID</li>
          <li>Colle ce numéro ci-dessous</li>
        </ol>
      </div>
      <div class="form-group" style="margin-left:28px">
        <input type="text" id="notif-telegram-id" class="input-field"
          placeholder="Votre Chat ID Telegram" value="${p.telegram_chat_id || ''}">
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="envoyerTelegramTest()">Envoyer une notif test</button>
      </div>
      ${pushSupporte ? `
      <div class="form-group" style="flex-direction:row;align-items:center;gap:12px">
        <input type="checkbox" id="notif-push" ${pushCocheIci ? 'checked' : ''}>
        <label for="notif-push" style="cursor:pointer">🔔 Notifications push (ce navigateur)</label>
      </div>
      <div style="margin-left:28px;margin-bottom:8px">
        <button type="button" class="btn btn-secondary btn-sm" onclick="envoyerNotifTest()">Envoyer une notif test</button>
      </div>` : `
      <div class="txt3" style="font-size:.75rem">🔔 Notifications push non disponibles sur ce navigateur</div>`}
      <button class="btn btn-primary btn-full" onclick="sauverNotifs()">Enregistrer</button>
      <div id="notifs-msg"></div>`;
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

async function changerPseudo() {
  const nom       = document.getElementById('pseudo-nom').value.trim();
  const initiales = document.getElementById('pseudo-initiales').value.trim().toUpperCase();
  const el        = document.getElementById('pseudo-msg');

  try {
    const data = await apiPost('users.php?action=changer_pseudo', { nom, initiales });
    userInfo.nom       = data.nom;
    userInfo.initiales = data.initiales;
    document.getElementById('avatar').textContent = data.initiales;
    el.innerHTML = msgOk('Pseudo modifié !');
    setTimeout(() => fermerModal('modal-pseudo'), 1200);
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

async function changerMdp() {
  const ancien  = document.getElementById('mdp-ancien').value;
  const nouveau = document.getElementById('mdp-nouveau').value;
  const confirm = document.getElementById('mdp-confirm').value;
  const el      = document.getElementById('mdp-msg');

  if (nouveau !== confirm) { el.innerHTML = msgErreur('Les mots de passe ne correspondent pas'); return; }

  try {
    await apiPost('users.php?action=changer_mdp', { ancien_mdp: ancien, nouveau_mdp: nouveau });
    el.innerHTML = msgOk('Mot de passe modifié !');
    setTimeout(() => fermerModal('modal-mdp'), 1200);
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

async function sauverNotifs() {
  const el = document.getElementById('notifs-msg');
  const casePush = document.getElementById('notif-push');

  try {
    // Le push se gère à part (abonnement/désabonnement navigateur),
    // les autres préférences suivent le circuit habituel
    if (casePush) {
      if (casePush.checked) {
        await activerPush();
      } else {
        await desactiverPush();
      }
    }

    await apiPost('users.php?action=preferences_notif', {
      notif_email:     document.getElementById('notif-email').checked ? 1 : 0,
      notif_telegram:  document.getElementById('notif-telegram').checked ? 1 : 0,
      telegram_chat_id:document.getElementById('notif-telegram-id').value.trim(),
    });
    el.innerHTML = msgOk('Préférences enregistrées !');
  } catch (e) { el.innerHTML = msgErreur(e.message); }
}

// Convertit la clé VAPID (base64url) au format Uint8Array attendu par
// PushManager.subscribe()
function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Demande la permission navigateur, s'abonne au push, envoie
// l'abonnement au serveur pour qu'il puisse nous envoyer des notifs
async function activerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Notifications push non supportées sur ce navigateur');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission refusée — active les notifications dans les réglages de ton navigateur pour ce site');
  }

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Le Service Worker met trop de temps à démarrer — recharge la page et réessaie')), 8000)),
  ]);
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await apiPost('users.php?action=push_subscribe', { subscription: subscription.toJSON() });
}

// Désabonne ce navigateur (côté navigateur ET côté serveur)
async function desactiverPush() {
  let endpoint = null;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      endpoint = subscription.endpoint;
      await subscription.unsubscribe();
    }
  }
  await apiPost('users.php?action=push_unsubscribe', { endpoint });
}

// Déplie/replie le petit encart d'aide Telegram dans le modal Notifications
function toggleAideTelegram() {
  const el = document.getElementById('aide-telegram');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// Bouton "Envoyer une notif test" — Telegram (à côté du champ Chat ID)
async function envoyerTelegramTest() {
  const el = document.getElementById('notifs-msg');
  const chatId = document.getElementById('notif-telegram-id').value.trim();
  if (!chatId) {
    el.innerHTML = msgErreur('Renseigne d\'abord ton Chat ID Telegram');
    return;
  }
  el.innerHTML = '<div class="txt3" style="font-size:.8rem">Envoi en cours…</div>';
  try {
    const data = await apiPost('users.php?action=telegram_test', { chat_id: chatId });
    el.innerHTML = msgOk(data.message || 'Notification envoyée — regarde Telegram !');
  } catch (e) {
    el.innerHTML = msgErreur(e.message);
  }
}

// Bouton "Envoyer une notif test" dans le modal Notifications
async function envoyerNotifTest() {
  const el = document.getElementById('notifs-msg');
  el.innerHTML = '<div class="txt3" style="font-size:.8rem">Envoi en cours…</div>';
  try {
    const data = await apiPost('users.php?action=push_test', {});
    el.innerHTML = msgOk(data.message || 'Notification envoyée — regarde ton téléphone !');
  } catch (e) {
    el.innerHTML = msgErreur(e.message);
  }
}

function fermerModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('hidden');
  enregistrerFermetureModale(id);
  // Remettre la fenêtre à sa position centrée d'origine pour la prochaine ouverture
  const box = modal.querySelector('.modal');
  if (box) { box.style.position = ''; box.style.left = ''; box.style.top = ''; box.style.margin = ''; }
}

// ── Rendre une modale déplaçable en glissant son titre ──
// modalId : id de l'élément .modal-overlay
// headerId : id de l'élément (généralement .modal-title) qui sert de poignée
function activerDrag(modalId, headerId) {
  const modal  = document.getElementById(modalId);
  const header = document.getElementById(headerId);
  if (!modal || !header) return;
  const box = modal.querySelector('.modal') || modal.firstElementChild;
  if (!box || box.dataset.dragReady) return; // éviter de brancher 2 fois
  box.dataset.dragReady = '1';

  let dragging = false, startX, startY, startLeft, startTop;

  function positionDepart(e) {
    const pt = e.touches ? e.touches[0] : e;
    const rect = box.getBoundingClientRect();
    startX = pt.clientX;
    startY = pt.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    box.style.position = 'fixed';
    box.style.margin = '0';
    // Fige la largeur/hauteur en pixels AVANT de passer en position
    // fixed — sinon la largeur "élastique" (width:100% + max-width) se
    // recalcule par rapport à l'écran entier au lieu du cadre habituel,
    // et la modale s'étire visiblement vers la droite pendant le glissement.
    box.style.width  = rect.width  + 'px';
    box.style.height = rect.height + 'px';
    box.style.left = startLeft + 'px';
    box.style.top = startTop + 'px';
  }

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    box.style.left = (startLeft + pt.clientX - startX) + 'px';
    box.style.top  = (startTop  + pt.clientY - startY) + 'px';
  }

  function onUp() {
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }

  header.addEventListener('mousedown', e => {
    dragging = true;
    positionDepart(e);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  header.addEventListener('touchstart', e => {
    dragging = true;
    positionDepart(e);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }, { passive: true });
}

// Fermer modal en cliquant hors
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay') && !e.target.classList.contains('hidden')) {
    fermerModal(e.target.id);
  }
});

// ============================================================
//  UTILITAIRES API
// ============================================================
// ============================================================
//  SÉLECTEUR DE SAISON
// ============================================================
let saisonsDisponibles = [];   // liste complète {id, label, statut, ...}
let saisonSelectionnee = null; // id actuellement affiché (jamais null une fois l'appli chargée)

function saisonCouranteId() {
  const c = saisonsDisponibles.find(s => s.statut === 'en_cours');
  return c ? c.id : null;
}

function saisonEstModifiableActuelle() {
  const s = saisonsDisponibles.find(s => s.id === saisonSelectionnee);
  return s ? (s.statut === 'en_cours' || s.statut === 'entrainement') : false;
}

function saisonActiveAnneeDebut() {
  const s = saisonsDisponibles.find(s => s.id === saisonSelectionnee);
  return s ? s.annee_debut : 2025;
}

async function initialiserSaisons() {
  try {
    const data = await apiGet('matches.php?action=saisons');
    saisonsDisponibles = data.saisons || [];
    if (!saisonsDisponibles.length) return;

    const courante = saisonCouranteId();
    const memorisee = parseInt(localStorage.getItem('saison_selectionnee') || '', 10);
    saisonSelectionnee = saisonsDisponibles.some(s => s.id === memorisee) ? memorisee : courante;

    const sel = document.getElementById('select-saison-header');
    sel.innerHTML = saisonsDisponibles.map(s =>
      `<option value="${s.id}" ${s.id === saisonSelectionnee ? 'selected' : ''}>${(s.label.startsWith('Saison') || s.statut === 'entrainement') ? s.label : 'Saison ' + s.label}</option>`
    ).join('');

    const saisonChoisie = saisonsDisponibles.find(s => s.id === saisonSelectionnee);
    document.getElementById('badge-saison-archivee').classList.toggle('hidden', saisonChoisie?.statut !== 'termine' && saisonChoisie?.statut !== 'futur');
    const badgeEntrainement = document.getElementById('badge-saison-entrainement');
    if (badgeEntrainement) badgeEntrainement.classList.toggle('hidden', saisonChoisie?.statut !== 'entrainement');
  } catch (e) { /* pas bloquant si ça échoue — l'appli reste utilisable sur la saison par défaut du serveur */ }
}

function changerSaisonAffichee(id) {
  localStorage.setItem('saison_selectionnee', id);
  location.reload();
}

async function apiGet(endpoint) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = saisonSelectionnee !== null ? `${endpoint}${sep}saison_id=${saisonSelectionnee}` : endpoint;
  const res = await fetch(`${API}/${url}`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    cache: 'no-store', // toujours interroger le serveur (évite un état périmé, ex. quizz répondu sur un autre appareil)
  });
  const data = await res.json();
  if (!res.ok || data.erreur) throw new Error(data.erreur || 'Erreur serveur');
  return data;
}

async function apiPost(endpoint, body) {
  const bodyFinal = saisonSelectionnee !== null ? { ...body, saison_id: saisonSelectionnee } : body;
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(bodyFinal),
  });
  const data = await res.json();
  if (!res.ok || data.erreur) throw new Error(data.erreur || 'Erreur serveur');
  return data;
}

// ============================================================
//  UTILITAIRES FORMATAGE DATES
// ============================================================
function formatJourHeure(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatHeure(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateCourt(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : 'Z'));
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Extrait les jours civils distincts (minuit UTC) couverts par une
// liste de matchs, triés chronologiquement — utilisé à la fois pour
// le libellé compact (formatDatesJournee) et le regroupement par jour
// (_grouperMatchsParJour) plus bas.
function _joursDistinctsMatchs(matchs) {
  const joursMap = new Map(); // clé "YYYY-MM-DD" → Date (minuit UTC)
  matchs.forEach(m => {
    const d = new Date(m.date.replace(' ', 'T') + (m.date.includes('T') ? '' : 'Z'));
    const cle = d.toISOString().slice(0, 10);
    if (!joursMap.has(cle)) joursMap.set(cle, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
  });
  return [...joursMap.values()].sort((a, b) => a - b);
}

// true si tous les matchs de la journée ont lieu le même jour civil
function _matchsSurUnSeulJour(matchs) {
  return _joursDistinctsMatchs(matchs).length <= 1;
}

// Regroupe les matchs d'une journée par jour civil (clé "YYYY-MM-DD"),
// triés chronologiquement — utilisé pour afficher un repère de date
// centré entre les paquets de matchs quand la journée est éclatée sur
// plusieurs jours (vendredi/samedi/dimanche…).
function _grouperMatchsParJour(matchs) {
  const groupes = new Map();
  matchs.forEach(m => {
    const d = new Date(m.date.replace(' ', 'T') + (m.date.includes('T') ? '' : 'Z'));
    const cle = d.toISOString().slice(0, 10);
    if (!groupes.has(cle)) {
      groupes.set(cle, { date: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), matchs: [] });
    }
    groupes.get(cle).matchs.push(m);
  });
  return [...groupes.values()].sort((a, b) => a.date - b.date);
}

// Regroupe les dates des matchs d'une journée en libellé compact,
// fusionnant les jours civils consécutifs en une plage ("du 21 au 23
// août 2026") plutôt que de les lister un par un — une journée de L1
// s'étale souvent sur vendredi/samedi/dimanche(/lundi), donc ce cas est
// fréquent. Les jours non consécutifs restent séparés par " – ".
function formatDatesJournee(matchs) {
  const jours = _joursDistinctsMatchs(matchs);
  if (jours.length === 0) return '';

  const groupes = [];
  let groupeCourant = [jours[0]];
  for (let i = 1; i < jours.length; i++) {
    const ecartJours = Math.round((jours[i] - jours[i - 1]) / 86400000);
    if (ecartJours === 1) {
      groupeCourant.push(jours[i]);
    } else {
      groupes.push(groupeCourant);
      groupeCourant = [jours[i]];
    }
  }
  groupes.push(groupeCourant);

  const jourMois      = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const jourMoisAnnee = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  return groupes.map(g => {
    if (g.length === 1) return jourMoisAnnee(g[0]);
    const debut = g[0], fin = g[g.length - 1];
    const memeMois = debut.getUTCMonth() === fin.getUTCMonth() && debut.getUTCFullYear() === fin.getUTCFullYear();
    return memeMois
      ? `du ${debut.getUTCDate()} au ${jourMoisAnnee(fin)}`
      : `du ${jourMois(debut)} au ${jourMoisAnnee(fin)}`;
  }).join(' – ');
}

// Format compact pour les listes denses (H2H) : "17/01/26" — largeur
// quasi constante (jj/mm/aa) contrairement à "17 janv. 2026" dont la
// largeur varie trop selon le mois pour tenir dans une colonne fixe.
function formatDateH2H(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : 'Z'));
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDateComplete(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Version compacte de formatDateComplete(), pour le header des cartes match
// (peu de place disponible, doit cohabiter avec le nom du stade + le statut).
// Ex : "ve 21/08 - 20h45" au lieu de "vendredi 21 août à 20h45".
const JOURS_ABREGES = ['di', 'lu', 'ma', 'me', 'je', 've', 'sa']; // getDay() : 0=dimanche
function formatDateCourte(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const jour = JOURS_ABREGES[d.getDay()];
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${jour} ${jj}/${mm} - ${hh}h${min}`;
}

// Comme formatDateComplete(), mais pour des dates déjà stockées en heure
// locale française (ex: date_limite des bonus, saisie telle quelle via un
// champ Admin datetime-local) — pas de conversion UTC→local à appliquer,
// contrairement aux dates de matchs qui viennent de l'API en UTC.
function formatDateLimiteLocale(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
//  UTILITAIRES HTML
// ============================================================
function toggleMdpVision(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.style.color = '#0d6efd';
  } else {
    input.type = 'password';
    btn.style.color = '#aab';
  }
}

function msgErreur(txt) {
  return `<div class="msg-erreur">⚠️ ${txt}</div>`;
}
function msgOk(txt) {
  return `<div class="msg-ok">✅ ${txt}</div>`;
}

// ============================================================
// VERSION + NOUVEAUTÉS — repris de CDM 2026, adapté au header L1
// ============================================================
function injecterVersionHeader() {
  if (document.getElementById('app-footer-version')) return;

  const footer = document.createElement('div');
  footer.id = 'app-footer-version';
  footer.style.cssText = 'text-align:center;color:#666;font-size:12px;padding:10px 0 20px;opacity:0.85;user-select:none;';
  footer.innerHTML = '&copy; Docdadi ' + new Date().getFullYear();
  document.body.appendChild(footer);

  // Version discrète tout à droite du header, centrée sous jour/nuit + avatar
  const zoneVersion = document.querySelector('.header-right');
  if (zoneVersion && !document.getElementById('header-version')) {
    const vSpan = document.createElement('small');
    vSpan.id = 'header-version';
    vSpan.style.cssText = 'display:block;background:none;font-size:10px;color:rgba(255,255,255,.7);margin-top:4px;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;';
    vSpan.textContent = 'v' + APP_VERSION;
    vSpan.title = "Voir l'historique des nouveautés";
    vSpan.onclick = function () { ouvrirHistoriqueNouveautes(); };
    zoneVersion.appendChild(vSpan);
  }
}

window._changelogCache = null; // mémorise le dernier changelog reçu du serveur

function rechargerApp() {
  // Rechargement complet : on vide aussi le cache du Service Worker
  // s'il y en a un, puis on force une requête réseau fraîche
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.update());
    });
  }
  const base = window.location.href.split('#')[0].split('?')[0];
  window.location.replace(base + '?maj=' + Date.now());
}

function fermerModalNouveautes() {
  const m = document.getElementById('modal-nouveautes');
  if (m) m.remove();
  enregistrerFermetureModale('modal-nouveautes');
}

// entries : liste d'entrées {version, date, items[]}
// modeMaj : true => bouton "Mettre à jour maintenant" (nouvelle version dispo)
//           false => mode historique, juste un bouton "Fermer"
function afficherModalNouveautes(entries, modeMaj) {
  fermerModalNouveautes();
  if (!entries || !entries.length) return;

  const blocs = entries.map(e => {
    const lis = (e.items || []).map(t =>
      `<li style="margin:6px 0;line-height:1.5;">${t}</li>`).join('');
    return `<div style="margin-bottom:28px;">
      <div style="font-weight:700;font-size:16px;color:var(--vert);margin-bottom:2px;">Version ${e.version}</div>
      <div style="font-size:12px;color:var(--txt2);margin-bottom:10px;">${e.date || ''}</div>
      <ul style="margin:0;padding-left:20px;">${lis}</ul>
    </div>`;
  }).join('<hr style="border:none;border-top:1px solid var(--bord);margin:20px 0;">');

  const titre = modeMaj ? '🎉 Nouveautés disponibles' : '📜 Historique des nouveautés';
  const boutonAction = modeMaj
    ? `<button onclick="rechargerApp()" style="background:var(--vert);color:white;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;">Mettre à jour maintenant</button>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'modal-nouveautes';
  modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--bg2);color:var(--txt);border-radius:14px;max-width:560px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
      <div id="hdr-nouveautes" style="padding:20px 24px 14px;border-bottom:1px solid var(--bord);display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;">
        <div style="font-size:18px;font-weight:700;">${titre}</div>
        <button onclick="fermerModalNouveautes()" style="background:none;border:none;color:inherit;font-size:22px;cursor:pointer;line-height:1;opacity:0.7;">&times;</button>
      </div>
      <div style="padding:20px 24px;overflow-y:auto;flex:1;">${blocs}</div>
      <div style="padding:14px 24px 20px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--bord);">
        ${modeMaj ? boutonAction : `<button onclick="fermerModalNouveautes()" style="background:var(--vert);color:white;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;">OK</button>`}
      </div>
    </div>`;
  document.body.appendChild(modal);
  enregistrerOuvertureModale('modal-nouveautes');
  requestAnimationFrame(() => activerDrag('modal-nouveautes', 'hdr-nouveautes'));
}

// Contrôle de version serveur — indépendant du Service Worker
//  1) Onglet déjà ouvert pendant un déploiement -> code serveur plus récent -> proposer de recharger
//  2) Ouverture fraîche d'une app à jour, mais notes jamais vues -> juste informer
function verifierVersionServeur() {
  fetch(API + '/version.php?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
      if (!data || !data.version) return;
      window._changelogCache = data.changelog || [];

      if (data.version !== APP_VERSION) {
        let nouvelles = window._changelogCache.filter(e => e.version > APP_VERSION);
        if (!nouvelles.length && window._changelogCache.length) {
          nouvelles = [window._changelogCache[0]];
        }
        afficherModalNouveautes(nouvelles, true);
        return;
      }

      const derniereVue = localStorage.getItem('derniere_version_vue');
      if (derniereVue !== APP_VERSION) {
        const nouvellesInfo = window._changelogCache.filter(e =>
          !derniereVue || e.version > derniereVue);
        if (nouvellesInfo.length) {
          afficherModalNouveautes(nouvellesInfo, false);
        }
        localStorage.setItem('derniere_version_vue', APP_VERSION);
      }
    })
    .catch(err => console.warn('verifierVersionServeur a échoué :', err));
}

// Clic sur le numéro de version dans le header → historique complet
function ouvrirHistoriqueNouveautes() {
  if (window._changelogCache && window._changelogCache.length) {
    afficherModalNouveautes(window._changelogCache, false);
    return;
  }
  fetch(API + '/version.php?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
      window._changelogCache = (data && data.changelog) || [];
      afficherModalNouveautes(window._changelogCache, false);
    })
    .catch(err => console.warn('Historique indisponible :', err));
}

// ============================================================
//  QUIZZ — écran joueur
// ============================================================
function _badgeClubQuizz(reponse) {
  if (!reponse.club_id) return '';
  const bg = reponse.couleur1 || 'var(--bg3)';
  const fg = reponse.couleur2 || '#fff';
  const initiales = (reponse.club_nom || '?').slice(0, 3).toUpperCase();
  return `<span style="display:inline-flex;align-items:center;justify-content:center;
    width:26px;height:26px;border-radius:50%;background:${bg};color:${fg};
    font-size:.68rem;font-weight:700;flex-shrink:0;margin-right:8px">${initiales}</span>`;
}

async function chargerQuizzJoueur() {
  const zone = document.getElementById('quizz-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const [dataJ, dataS] = await Promise.all([
      apiGet('quizz.php?action=courant'),
      apiGet('quizz.php?action=speciaux_disponibles'),
    ]);

    const speciaux = dataS.speciaux || [];
    const specialNonTermine = speciaux.some(s => !s.termine);
    const jNonTermine = dataJ.quizz && !dataJ.quizz.questions.every(qq => qq.a_repondu);
    majPastilleQuizzNav(!!jNonTermine || specialNonTermine);

    if (!dataJ.quizz && !speciaux.length) {
      zone.innerHTML = `
        <div style="text-align:center;padding:30px 16px;color:var(--txt2)">
          <div style="font-size:2rem;margin-bottom:8px">🎯</div>
          <div style="font-weight:600;margin-bottom:4px">Aucun quizz en cours</div>
          <div style="font-size:.84rem">Reviens mercredi pour le prochain quizz hebdomadaire !</div>
        </div>
      `;
      return;
    }

    if (dataJ.quizz) {
      const q = dataJ.quizz;
      const aDesQuestionsChronometrees = q.questions.some(qq => qq.type !== 'pronostic');
      if (aDesQuestionsChronometrees) {
        afficherQuizzAccueilSequentiel(q);
      } else {
        afficherQuizzGrille(q);
      }
    } else {
      zone.innerHTML = '';
    }

    if (speciaux.length) {
      zone.innerHTML += afficherListeSpeciaux(speciaux);
    }
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

// ============================================================
//  Historique des réponses — liste des quizz déjà répondus par le
//  joueur, puis détail question par question au clic. Remplace
//  temporairement #quizz-contenu (même principe que ouvrirQuizzSpecial),
//  avec un lien retour vers l'écran quizz normal.
// ============================================================
async function afficherHistoriqueQuizz() {
  const zone = document.getElementById('quizz-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('quizz.php?action=mon_historique');
    const semaines = data.semaines || [];
    window._historiqueQuizzCache = semaines; // réutilisé par le sélecteur du détail, évite un aller-retour

    if (!semaines.length) {
      zone.innerHTML = `
        ${_lienRetourListeQuizz()}
        <div style="text-align:center;padding:30px 16px;color:var(--txt2)">
          <div style="font-size:2rem;margin-bottom:8px">📜</div>
          <div style="font-weight:600;margin-bottom:4px">Aucun historique pour l'instant</div>
          <div style="font-size:.84rem">Il apparaîtra ici dès que tu auras répondu à un quizz.</div>
        </div>
      `;
      return;
    }

    zone.innerHTML = `
      ${_lienRetourListeQuizz()}
      <div class="section-title" style="margin-bottom:10px">📜 Mon historique</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${semaines.map(s => {
          const titre = s.est_treve ? `✨ Quizz Spécial #${s.numero_special}` : `⚽ Quizz J${s.journee}`;
          const statutLabel = !s.toutes_resolues
            ? '<span style="color:var(--txt2)">⏳ en cours de résolution</span>'
            : '<span style="color:var(--txt2)">terminé</span>';
          const miniTampon = s.sans_faute
            ? `<div class="mini-tampon-bonus">✅ Bonus</div>`
            : '';
          return `
            <button onclick="ouvrirDetailHistoriqueQuizz(${s.id})" class="admin-card"
              style="text-align:left;cursor:pointer;border:1px solid var(--bord);width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg2);color:var(--txt)">
              <div>
                <div style="font-weight:600">${titre}</div>
                <div class="txt2" style="font-size:.78rem">${s.nb_repondu}/${s.nb_questions} répondu(es) · ${statutLabel}</div>
              </div>
              ${miniTampon}
              <div style="text-align:right;flex-shrink:0">
                <div style="font-weight:700;color:var(--bleu-accent)">${s.points} pt${s.points > 1 ? 's' : ''}</div>
                <span style="font-size:1.1rem">▶️</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

// Sélecteur de quizz pour naviguer d'une semaine à l'autre sans repasser
// par la liste — s'appuie sur le cache rempli par afficherHistoriqueQuizz ;
// si absent (arrivée directe sur le détail), on va le chercher une fois.
// La liste est reçue triée du plus récent au plus ancien (id DESC) ; pour
// la navigation "première/dernière", on raisonne en ordre chronologique
// (première = la plus ancienne, dernière = la plus récente), comme pour
// la barre de navigation par journée des Pronos/Matchs.
function _selecteurHistoriqueQuizz(idActuel) {
  const semaines = window._historiqueQuizzCache || [];
  if (semaines.length < 2) return '';

  const index = semaines.findIndex(s => s.id === idActuel);
  const indexPlusAncien = semaines.length - 1;
  const auDebut = index <= 0;       // le plus récent (haut de liste)
  const a_la_fin = index >= indexPlusAncien; // le plus ancien (bas de liste)

  const options = semaines.map(s => {
    const label = s.est_treve ? `✨ Spécial #${s.numero_special}` : `⚽ J${s.journee}`;
    return `<option value="${s.id}" ${s.id === idActuel ? 'selected' : ''}>${label}</option>`;
  }).join('');

  const idAt = (i) => semaines[i] ? semaines[i].id : idActuel;

  return `
    <div class="journee-nav-row" style="position:static;padding:0;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:6px">
      <button class="journee-nav-btn" title="Quizz le plus ancien" ${a_la_fin ? 'disabled' : ''} onclick="ouvrirDetailHistoriqueQuizz(${idAt(indexPlusAncien)})">⏮</button>
      <button class="journee-nav-btn" title="Quizz précédent" ${a_la_fin ? 'disabled' : ''} onclick="ouvrirDetailHistoriqueQuizz(${idAt(index + 1)})">◀</button>
      <select onchange="ouvrirDetailHistoriqueQuizz(parseInt(this.value,10))" class="journee-nav-select">
        ${options}
      </select>
      <button class="journee-nav-btn" title="Quizz suivant" ${auDebut ? 'disabled' : ''} onclick="ouvrirDetailHistoriqueQuizz(${idAt(index - 1)})">▶</button>
      <button class="journee-nav-btn" title="Quizz le plus récent" ${auDebut ? 'disabled' : ''} onclick="ouvrirDetailHistoriqueQuizz(${idAt(0)})">⏭</button>
    </div>
  `;
}

async function ouvrirDetailHistoriqueQuizz(id) {
  const zone = document.getElementById('quizz-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  if (!window._historiqueQuizzCache) {
    try { window._historiqueQuizzCache = (await apiGet('quizz.php?action=mon_historique')).semaines || []; }
    catch (e) { window._historiqueQuizzCache = []; }
  }

  try {
    const data = await apiGet(`quizz.php?action=mon_historique_detail&id=${id}`);
    if (!data.quizz) {
      zone.innerHTML = `<div class="txt-rouge">Ce quizz n'est plus disponible.</div>`;
      return;
    }
    window._historiqueQuizzActuel = data.quizz;
    _rendreDetailHistoriqueQuizz();
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

function _rendreDetailHistoriqueQuizz() {
  const zone = document.getElementById('quizz-contenu');
  const q = window._historiqueQuizzActuel;
  if (!zone || !q) return;

  const titre = q.est_treve ? `✨ Quizz Spécial #${q.numero_special}` : `⚽ Quizz J${q.journee}`;
  const mentionSansFaute = q.sans_faute
    ? `<div class="tampon-bonus-conteneur"><div class="tampon-bonus">✅ Bonus obtenu</div></div>`
    : '';

  let html = `
    <div style="text-align:center;margin-bottom:14px">
      <button onclick="afficherHistoriqueQuizz()" class="btn btn-secondary" style="font-size:.82rem;padding:6px 16px">← Retour à l'historique</button>
    </div>
    ${_selecteurHistoriqueQuizz(q.id)}
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-weight:700;font-size:1.05rem">${titre}</div>
      ${mentionSansFaute}
    </div>
    <div class="quizz-questions-grid">
  `;

  q.questions.forEach(question => {
    const resolu = question.resultat_connu === 1;
    // Un pronostic pas encore résolu reste modifiable ici, comme dans
    // l'écran quizz normal — les questions histo/actu, elles, n'admettent
    // qu'une seule tentative (verrouillé côté serveur).
    const modifiable = question.type === 'pronostic' && !resolu;

    html += `
      <div class="admin-card">
        <div style="font-size:.74rem;color:var(--txt2);margin-bottom:4px;text-align:center">
          Question ${question.ordre} · ${_labelQuestionQuizz(question)}
        </div>
        <div style="font-weight:600;margin-bottom:10px;line-height:1.4;text-align:center">${question.enonce}</div>
        <div id="histo-reponses-${question.id}" style="display:flex;flex-direction:column;gap:8px">
          ${question.reponses.map(r => {
            const estMaReponse = question.ma_reponse_id === r.id;
            const estLaBonne   = resolu && question.bonne_reponse_id === r.id;
            let bordure = '1px solid var(--bord)', fond = 'var(--bg2)', couleur = 'var(--txt)', poids = '400', badge = '';
            if (resolu) {
              if (estMaReponse && estLaBonne) {
                bordure = '2px solid var(--vert)'; fond = 'var(--vert-pale, rgba(34,197,94,.12))'; couleur = 'var(--vert)'; poids = '600'; badge = ' ✓';
              } else if (estMaReponse && !estLaBonne) {
                bordure = '2px solid var(--rouge)'; fond = 'var(--rouge-pale, rgba(224,48,48,.12))'; couleur = 'var(--rouge)'; poids = '600'; badge = ' ✗';
              } else if (estLaBonne) {
                // Bonne réponse, mais PAS votre choix (mauvaise réponse ou
                // pas de réponse du tout) — badge distinct du ✓ "vous avez
                // trouvé", pour ne pas donner l'impression d'avoir répondu
                // juste au premier coup d'œil (cf. cas timeout ci-dessous).
                bordure = '2px solid var(--vert)'; fond = 'var(--vert-pale, rgba(34,197,94,.12))'; couleur = 'var(--vert)'; poids = '600'; badge = ' (bonne réponse)';
              }
            } else if (estMaReponse) {
              bordure = '2px solid var(--bleu-accent)'; fond = 'var(--bleu-pale)'; couleur = 'var(--bleu-accent)'; poids = '600'; badge = ' ✓';
            }
            const contenu = `${_badgeClubQuizz(r)}${r.texte}${badge}`;
            return modifiable
              ? `<button onclick="repondreHistoriqueQuizz(${question.id}, ${r.id})" data-reponse-id="${r.id}"
                   style="display:flex;align-items:center;justify-content:center;text-align:center;padding:10px 14px;border-radius:var(--radius);cursor:pointer;
                          border:${bordure};background:${fond};color:${couleur};font-weight:${poids};width:100%">${contenu}</button>`
              : `<div style="display:flex;align-items:center;justify-content:center;text-align:center;padding:10px 14px;border-radius:var(--radius);
                            border:${bordure};background:${fond};color:${couleur};font-weight:${poids}">${contenu}</div>`;
          }).join('')}
        </div>
        ${(() => {
          if (question.ma_reponse_id === null) {
            return resolu
              ? `<div style="text-align:center;font-size:.8rem;font-weight:700;color:var(--rouge);margin-top:8px">✗ Pas de réponse donnée — 0 pt</div>`
              : `<div style="text-align:center;font-size:.78rem;color:var(--txt2);margin-top:8px">Pas de réponse donnée</div>`;
          }
          if (!resolu) {
            return `<div style="text-align:center;font-size:.78rem;color:var(--txt2);margin-top:8px">${modifiable ? 'Modifiable jusqu\'au coup d\'envoi' : '⏳ pas encore résolu'}</div>`;
          }
          // Résolu + une réponse a été donnée → bonne ou mauvaise
          return question.ma_reponse_id === question.bonne_reponse_id
            ? `<div style="text-align:center;font-size:.8rem;font-weight:700;color:var(--vert);margin-top:8px">✓ Bonne réponse — ${question.points} pt${question.points > 1 ? 's' : ''}</div>`
            : `<div style="text-align:center;font-size:.8rem;font-weight:700;color:var(--rouge);margin-top:8px">✗ Mauvaise réponse — 0 pt</div>`;
        })()}
      </div>
    `;
  });

  zone.innerHTML = html + '</div>';
}

// Rafraîchit le classement quizz (podium + détail par type) après une
// réponse — sans ça, "Détail par type de quizz" restait figé sur les
// chiffres du chargement initial de la page tant qu'on ne quittait/
// revenait pas sur l'onglet Quizz.
function _rafraichirClassementsQuizzApresReponse() {
  if (document.getElementById('quizz-classement-contenu')) chargerClassementQuizz();
  if (document.getElementById('quizz-classement-detaille-contenu')) chargerClassementDetailleQuizz();
}

async function repondreHistoriqueQuizz(questionId, reponseId) {
  try {
    await apiPost('quizz.php?action=repondre', { question_id: questionId, reponse_id: reponseId });
    const question = window._historiqueQuizzActuel.questions.find(qq => qq.id === questionId);
    if (question) { question.ma_reponse_id = reponseId; question.a_repondu = true; }
    _rendreDetailHistoriqueQuizz();
    _rafraichirClassementsQuizzApresReponse();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

// Liste des Quizz Spéciaux encore valides — un joueur peut en rattraper
// plusieurs même si un nouveau (J ou Spécial) a été publié depuis.
// Par défaut, seuls les Spéciaux en attente de réponse sont affichés
// (liste courte et actionnable) ; un bouton permet de déplier aussi
// ceux déjà terminés, et un autre de réduire à nouveau.
let _quizzSpeciauxData     = [];
let _quizzAfficherTermines = false;

function afficherListeSpeciaux(speciaux) {
  _quizzSpeciauxData     = speciaux;
  _quizzAfficherTermines = false;
  return _renderListeSpeciaux();
}

function _renderListeSpeciaux() {
  const tous      = _quizzSpeciauxData;
  const enAttente = tous.filter(s => !s.termine);
  const termines  = tous.filter(s => s.termine);
  const liste     = _quizzAfficherTermines ? tous : enAttente;

  const boutonToggle = termines.length ? `
    <button onclick="toggleAfficherTerminesQuizz()" class="btn btn-secondary" style="font-size:.78rem;padding:6px 14px;margin-top:10px">
      ${_quizzAfficherTermines
        ? '➖ Réduire aux quizz en attente'
        : `➕ Afficher aussi les ${termines.length} terminé${termines.length > 1 ? 's' : ''}`}
    </button>` : '';

  if (!liste.length) {
    return `
      <div id="quizz-liste-speciaux" style="margin-top:20px">
        <div class="section-title" style="font-size:.95rem">✨ Quizz Spéciaux</div>
        <p class="txt2" style="font-size:.84rem;margin-top:8px">Aucun Spécial en attente pour le moment 🎉</p>
        ${boutonToggle}
      </div>
    `;
  }

  return `
    <div id="quizz-liste-speciaux" style="margin-top:20px">
      <div class="section-title" style="font-size:.95rem">✨ Quizz Spéciaux ${_quizzAfficherTermines ? '' : 'en attente'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        ${liste.map(s => `
          <button onclick="ouvrirQuizzSpecial(${s.id})" class="admin-card${s.termine ? '' : ' quizz-carte-attente'}"
            style="text-align:left;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--txt);${s.termine ? 'border:1px solid var(--bord);background:var(--bg2)' : ''}">
            <div>
              <div style="font-weight:600">✨ Spécial #${s.numero_special} ${s.termine ? '· terminé ✅' : ''}</div>
              <div class="txt2" style="font-size:.78rem">${s.nb_repondu}/${s.nb_questions} question(s) répondue(s) · jusqu'au ${formatDateComplete(s.date_limite)}</div>
            </div>
            ${s.termine ? '' : '<span style="font-size:1.2rem;flex-shrink:0">▶️</span>'}
          </button>
        `).join('')}
      </div>
      ${boutonToggle}
    </div>
  `;
}

function toggleAfficherTerminesQuizz() {
  _quizzAfficherTermines = !_quizzAfficherTermines;
  const conteneur = document.getElementById('quizz-liste-speciaux');
  if (conteneur) conteneur.outerHTML = _renderListeSpeciaux();
}

async function ouvrirQuizzSpecial(id) {
  const zone = document.getElementById('quizz-contenu');
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';
  try {
    const data = await apiGet(`quizz.php?action=courant&id=${id}`);
    if (!data.quizz) {
      zone.innerHTML = `<div class="txt-rouge">Ce quizz n'est plus disponible (peut-être expiré entre-temps).</div>`;
      return;
    }
    afficherQuizzAccueilSequentiel(data.quizz);
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

function _lienRetourListeQuizz() {
  return `<div style="text-align:center;margin-bottom:14px">
    <button onclick="chargerQuizzJoueur()" class="btn btn-secondary" style="font-size:.82rem;padding:6px 16px">← Retour à la liste</button>
  </div>`;
}

// ============================================================
//  Grille — utilisée UNIQUEMENT quand toutes les questions sont du
//  pronostic (aucune contrainte de temps, rien n'oblige à un parcours
//  séquentiel). Dès qu'il y a au moins 1 question chronométrée
//  (histo/actu), on bascule sur le parcours séquentiel ci-dessous,
//  même en semaine normale — sinon tous les minuteurs démarraient en
//  même temps, ce qui n'a aucun sens.
// ============================================================
function afficherQuizzGrille(q) {
  const zone = document.getElementById('quizz-contenu');
  const titre = `Journée ${q.journee}`;

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:8px;flex-wrap:wrap">
      <div style="font-weight:700;font-size:1.05rem">🎯 Quizz — ${titre}</div>
      <div style="font-size:.76rem;color:var(--txt2)">⏳ jusqu'au ${formatDateComplete(q.date_limite)}</div>
    </div>
    <div class="quizz-questions-grid">
  `;

  q.questions.forEach(question => {
    html += `
      <div class="admin-card">
        <div style="font-size:.74rem;color:var(--txt2);margin-bottom:4px;text-align:center">
          Question ${question.ordre} sur ${q.questions.length} · Pronostic
        </div>
        <div style="font-weight:600;margin-bottom:10px;line-height:1.4;text-align:center">${question.enonce}</div>
        <div id="quizz-reponses-${question.id}" style="display:flex;flex-direction:column;gap:8px">
          ${question.reponses.map(r => `
            <button
              onclick="repondreQuizzJoueur(${question.id}, ${r.id})"
              data-reponse-id="${r.id}"
              style="display:flex;align-items:center;justify-content:center;text-align:center;padding:10px 14px;border-radius:var(--radius);
                     border:${question.deja_repondu === r.id ? '2px solid var(--bleu-accent)' : '1px solid var(--bord)'};
                     background:${question.deja_repondu === r.id ? 'var(--bleu-pale)' : 'var(--bg2)'};
                     color:${question.deja_repondu === r.id ? 'var(--bleu-accent)' : 'var(--txt)'};
                     font-weight:${question.deja_repondu === r.id ? '600' : '400'};
                     font-size:.9rem;cursor:pointer;width:100%">
              ${_badgeClubQuizz(r)}${r.texte}
              ${question.deja_repondu === r.id ? '<span style="margin-left:8px;font-size:.8rem">✓</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  });

  zone.innerHTML = html + '</div>';
}

window._quizzTimers = window._quizzTimers || {};

// ============================================================
//  Parcours séquentiel — dès qu'il y a au moins 1 question
//  chronométrée (histo/actu), qu'on soit en semaine normale (mélange
//  pronostic + histo/actu) ou en semaine de trêve (100% chronométré).
//  Les questions pronostic, elles, restent sans minuteur et sans
//  obligation de réponse pour avancer — seul histo/actu bloque le
//  bouton "Suivant" tant qu'on n'a pas répondu ou que le temps n'est
//  pas écoulé.
// ============================================================
window._quizzSeq = null; // { q, index }

function afficherQuizzAccueilSequentiel(q) {
  const zone = document.getElementById('quizz-contenu');
  window._quizzSeq = { q, index: q.questions.findIndex(qq => !qq.a_repondu) };
  const titre = q.est_treve ? `✨ Quizz Spécial #${q.numero_special}` : `⚽ Quizz J${q.journee}`;

  if (window._quizzSeq.index === -1) {
    zone.innerHTML = `
      ${q.est_treve ? _lienRetourListeQuizz() : ''}
      <div style="text-align:center;padding:30px 16px">
        <div style="font-size:2.2rem;margin-bottom:8px">🏆</div>
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:4px">${titre} terminé</div>
        <div style="font-size:.86rem;color:var(--txt2);margin-bottom:18px">Tu as déjà répondu aux ${q.questions.length} questions. Résultats au classement ci-dessous une fois la semaine résolue.</div>
        ${q.est_treve ? `<button class="btn btn-primary" style="padding:10px 24px" onclick="chargerQuizzJoueur()">← Retour à la liste des quizz</button>` : ''}
      </div>
    `;
    return;
  }

  const nbRepondues = q.questions.filter(qq => qq.a_repondu).length;
  zone.innerHTML = `
    ${q.est_treve ? _lienRetourListeQuizz() : ''}
    <div style="text-align:center;padding:30px 16px">
      <div style="font-weight:700;font-size:1.15rem;margin-bottom:6px">${titre}</div>
      <div style="font-size:.86rem;color:var(--txt2);margin-bottom:4px">${q.questions.length} questions</div>
      <div style="font-size:.76rem;color:var(--txt2);margin-bottom:18px">⏳ jusqu'au ${formatDateComplete(q.date_limite)}</div>
      <button class="btn btn-primary" style="padding:12px 28px;font-size:1rem" onclick="demarrerQuizzSequentiel()">
        ${nbRepondues > 0 ? `▶️ Continuer (${nbRepondues}/${q.questions.length} déjà répondu)` : '▶️ Commencer le quizz'}
      </button>
    </div>
  `;
}

function demarrerQuizzSequentiel() {
  afficherQuestionSequentielleActuelle();
}

function afficherQuestionSequentielleActuelle() {
  const zone = document.getElementById('quizz-contenu');
  const { q, index } = window._quizzSeq;
  const question = q.questions[index];
  const derniere = index === q.questions.length - 1;
  const chronometree = question.type !== 'pronostic';
  const label = question.type === 'actu' ? 'Actu foot' : question.type === 'histo' ? 'Histo foot' : 'Pronostic';

  zone.innerHTML = `
    <div style="max-width:480px;margin:0 auto">
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:.8rem;color:var(--txt2);margin-bottom:6px">
          Question ${index + 1} sur ${q.questions.length} · ${label}
          ${chronometree ? `<span id="quizz-badge-chrono" class="quizz-badge-chrono">⏱️ Chronométré</span>` : ''}
        </div>
        ${chronometree ? `
          <div id="quizz-seq-timer" style="display:inline-flex;align-items:center;justify-content:center;width:96px;height:96px;border-radius:50%;border:6px solid var(--bleu-accent);font-size:2.1rem;font-weight:800;color:var(--bleu-accent);margin:0 auto 10px">
            ${q.timer_secondes_actu}
          </div>` : ''}
      </div>
      <div id="quizz-seq-carte" class="admin-card${chronometree ? ' quizz-carte-chrono' : ''}">
        <div style="font-weight:600;margin-bottom:12px;line-height:1.4;text-align:center;font-size:1.02rem">${question.enonce}</div>
        <div id="quizz-reponses-${question.id}" style="display:flex;flex-direction:column;gap:8px">
          ${question.reponses.map(r => `
            <button
              onclick="repondreQuizzSequentiel(${question.id}, ${r.id})"
              data-reponse-id="${r.id}"
              style="display:flex;align-items:center;justify-content:center;text-align:center;padding:12px 14px;border-radius:var(--radius);
                     border:1px solid var(--bord);background:var(--bg2);color:var(--txt);
                     font-size:.95rem;cursor:pointer;width:100%">
              ${_badgeClubQuizz(r)}${r.texte}
            </button>
          `).join('')}
        </div>
      </div>
      <button id="quizz-seq-suivant" class="btn btn-primary btn-full" style="margin-top:14px;${chronometree ? 'opacity:.4;pointer-events:none' : ''}" onclick="quizzEtapeSuivante()">
        ${derniere ? '🏁 Terminer' : 'Suivant →'}
      </button>
    </div>
  `;

  if (chronometree) {
    // Vibration courte sur mobile pour attirer l'attention sur le fait que
    // la question est chronométrée (silencieux/no-op si non supporté —
    // navigateurs desktop, iOS Safari qui ne supporte pas l'API).
    if (navigator.vibrate) navigator.vibrate(200);
    demarrerTimerSequentiel(question, q.timer_secondes_actu);
  }
}

function demarrerTimerSequentiel(question, secondes) {
  let restant = secondes;
  if (window._quizzTimers[question.id]) clearInterval(window._quizzTimers[question.id]);

  const majAffichage = () => {
    const cercle = document.getElementById('quizz-seq-timer');
    const carte  = document.getElementById('quizz-seq-carte');
    const badge  = document.getElementById('quizz-badge-chrono');
    if (!cercle) return;
    cercle.textContent = restant;
    const couleur = restant <= 3 ? 'var(--rouge)' : 'var(--bleu-accent)';
    cercle.style.color = couleur;
    cercle.style.borderColor = couleur;
    if (carte) carte.classList.toggle('quizz-urgent', restant <= 3);
    if (badge) badge.classList.toggle('quizz-urgent', restant <= 3);
  };
  majAffichage();

  window._quizzTimers[question.id] = setInterval(() => {
    restant--;
    if (restant <= 0) {
      clearInterval(window._quizzTimers[question.id]);
      delete window._quizzTimers[question.id];
      restant = 0;
      majAffichage();
      repondreQuizzSequentiel(question.id, null, true);
      return;
    }
    majAffichage();
  }, 1000);
}

async function repondreQuizzSequentiel(questionId, reponseId, viaTimeout) {
  if (!viaTimeout && window._quizzTimers[questionId]) {
    clearInterval(window._quizzTimers[questionId]);
    delete window._quizzTimers[questionId];
  }

  const conteneur = document.getElementById(`quizz-reponses-${questionId}`);
  try {
    const res = await apiPost('quizz.php?action=repondre', { question_id: questionId, reponse_id: reponseId });

    if (conteneur) {
      const resolu = res.resultat_connu === 1;
      conteneur.querySelectorAll('button[data-reponse-id]').forEach(b => {
        const idBouton = parseInt(b.dataset.reponseId, 10);
        const estChoisie = idBouton === reponseId;
        const estLaBonne = resolu && res.bonne_reponse_id !== null && idBouton === res.bonne_reponse_id;

        if (resolu) {
          // Question résolue (histo/actu) → verrouillage total, plus
          // aucune réponse cliquable, et on révèle la bonne réponse
          b.style.pointerEvents = 'none';
          if (estChoisie && res.correcte) {
            b.style.border = '2px solid var(--vert)';
            b.style.background = 'var(--vert-pale, rgba(34,197,94,.12))';
            b.style.color = 'var(--vert)';
            b.style.fontWeight = '600';
            b.insertAdjacentHTML('beforeend', '<span style="margin-left:8px;font-size:.9rem">✓</span>');
          } else if (estChoisie && !res.correcte) {
            b.style.border = '2px solid var(--rouge)';
            b.style.background = 'var(--rouge-pale, rgba(224,48,48,.12))';
            b.style.color = 'var(--rouge)';
            b.style.fontWeight = '600';
            b.insertAdjacentHTML('beforeend', '<span style="margin-left:8px;font-size:.9rem">✗</span>');
          } else if (estLaBonne) {
            // Révèle la bonne réponse quand le joueur s'est trompé
            b.style.border = '2px solid var(--vert)';
            b.style.background = 'var(--vert-pale, rgba(34,197,94,.12))';
            b.style.color = 'var(--vert)';
            b.style.fontWeight = '600';
            b.insertAdjacentHTML('beforeend', '<span style="margin-left:8px;font-size:.9rem">✓</span>');
          } else {
            b.style.opacity = '.5';
          }
        } else if (estChoisie) {
          // Pronostic (résultat pas encore connu) → simple indicateur
          // neutre, reste modifiable (pas de pointerEvents:none ici)
          b.style.border = '2px solid var(--bleu-accent)';
          b.style.background = 'var(--bleu-pale)';
          b.style.color = 'var(--bleu-accent)';
          b.style.fontWeight = '600';
          b.insertAdjacentHTML('beforeend', '<span style="margin-left:8px;font-size:.8rem">✓</span>');
        } else {
          b.style.border = '1px solid var(--bord)';
          b.style.background = 'var(--bg2)';
          b.style.color = 'var(--txt)';
          b.style.fontWeight = '400';
        }
      });
    }

    window._quizzSeq.q.questions[window._quizzSeq.index].deja_repondu = reponseId;
    window._quizzSeq.q.questions[window._quizzSeq.index].a_repondu = true;
    const boutonSuivant = document.getElementById('quizz-seq-suivant');
    if (boutonSuivant) {
      boutonSuivant.style.opacity = '1';
      boutonSuivant.style.pointerEvents = 'auto';
    }
    _recalculerPastilleQuizzNav();
    _rafraichirClassementsQuizzApresReponse();
  } catch (e) {
    // Filet de sécurité : si le serveur refuse car cette question a déjà une
    // réponse enregistrée (répondu entre-temps sur un autre appareil, ou
    // double-clic), on ne doit pas laisser le joueur bloqué sans bouton
    // "Suivant" cliquable — on débloque quand même la suite du parcours.
    const dejaRepondu = typeof e.message === 'string' && e.message.includes('déjà répondu');
    if (dejaRepondu) {
      window._quizzSeq.q.questions[window._quizzSeq.index].a_repondu = true;
      const boutonSuivant = document.getElementById('quizz-seq-suivant');
      if (boutonSuivant) {
        boutonSuivant.style.opacity = '1';
        boutonSuivant.style.pointerEvents = 'auto';
      }
    } else if (!viaTimeout) {
      alert('Erreur : ' + e.message);
    }
  }
}

function quizzEtapeSuivante() {
  const { q, index } = window._quizzSeq;
  if (index >= q.questions.length - 1) {
    _recalculerPastilleQuizzNav();
    const zone = document.getElementById('quizz-contenu');
    zone.innerHTML = `
      ${q.est_treve ? _lienRetourListeQuizz() : ''}
      <div style="text-align:center;padding:30px 16px">
        <div style="font-size:2.4rem;margin-bottom:8px">🎉</div>
        <div style="font-weight:700;font-size:1.15rem;margin-bottom:4px">Quizz terminé, merci d'avoir joué !</div>
        <div style="font-size:.86rem;color:var(--txt2);margin-bottom:18px">Résultats visibles au classement une fois la semaine résolue.</div>
        ${q.est_treve ? `<button class="btn btn-primary" style="padding:10px 24px" onclick="chargerQuizzJoueur()">← Retour à la liste des quizz</button>` : ''}
      </div>
    `;
    chargerClassementQuizz();
    return;
  }
  window._quizzSeq.index++;
  afficherQuestionSequentielleActuelle();
}

async function repondreQuizzJoueur(questionId, reponseId) {
  const conteneur = document.getElementById(`quizz-reponses-${questionId}`);
  try {
    await apiPost('quizz.php?action=repondre', { question_id: questionId, reponse_id: reponseId });
    if (conteneur) {
      conteneur.querySelectorAll('button[data-reponse-id]').forEach(b => {
        const estChoisie = parseInt(b.dataset.reponseId, 10) === reponseId;
        b.style.border = estChoisie ? '2px solid var(--bleu-accent)' : '1px solid var(--bord)';
        b.style.background = estChoisie ? 'var(--bleu-pale)' : 'var(--bg2)';
        b.style.color = estChoisie ? 'var(--bleu-accent)' : 'var(--txt)';
        b.style.fontWeight = estChoisie ? '600' : '400';
        const coche = b.querySelector('.quizz-coche');
        if (coche) coche.remove();
        if (estChoisie) {
          b.insertAdjacentHTML('beforeend', '<span class="quizz-coche" style="margin-left:8px;font-size:.8rem">✓</span>');
        }
      });
    }
    verifierBanniereQuizz(); // resynchronise la pastille nav (léger, ne réaffiche pas la bannière déjà vue)
    _rafraichirClassementsQuizzApresReponse();
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

// Podium visuel du classement quizz — même langage graphique que le
// podium principal (afficherPodium), adapté aux champs du quizz
// (total_points au lieu de pts_total, pas de gestion bonus/cotes).
function afficherPodiumQuizz(classement, elPodium) {
  const couleurOr     = '#DAA520';
  const couleurArgent = '#707070';
  const couleurBronze = '#B34700';

  if (classement.length < 2) {
    elPodium.innerHTML = '';
    return null;
  }

  const degradeOr     = 'linear-gradient(160deg, #FFD700 0%, #FFA500 100%)';
  const degradeArgent = 'linear-gradient(160deg, #E8E8E8 0%, #909090 100%)';
  const degradeBronze = 'linear-gradient(160deg, #E8A045 0%, #B05A10 100%)';

  const groupesPoints = [];
  classement.forEach(j => {
    const pts = parseInt(j.total_points);
    let g = groupesPoints.find(g => g.pts === pts);
    if (!g) { g = { pts, joueurs: [] }; groupesPoints.push(g); }
    g.joueurs.push(j);
  });

  const groupe1 = groupesPoints[0] ? groupesPoints[0].joueurs : [];
  const groupe2 = groupesPoints[1] ? groupesPoints[1].joueurs : [];
  const groupe3 = groupesPoints[2] ? groupesPoints[2].joueurs : [];

  const rang1 = 1;
  const rang2 = rang1 + groupe1.length;
  const rang3 = rang2 + groupe2.length;

  function fondClairPour(couleur) {
    return couleur === couleurOr ? '#FDE68A' : couleur === couleurArgent ? '#D1D5DB' : '#FDBA74';
  }

  function ligneJoueur(joueur, couleur) {
    const estMoi = userInfo && joueur.user_id == userInfo.id;
    const nom = joueur.nom + (estMoi ? ' ★' : '');
    return `<div style="
        background:${fondClairPour(couleur)};
        border:2px solid ${couleur};
        border-radius:20px;
        padding:3px 12px;
        margin-bottom:4px;
        font-size:12px;font-weight:700;
        color:#1a1a18;
        box-shadow:0 2px 6px rgba(0,0,0,0.15);
        white-space:nowrap;
      ">${nom}</div>`;
  }

  function colonneJoueurs(joueurs, rang, couleur, hauteur, couronne) {
    if (!joueurs.length) {
      return `<div class="pod-col">
        <div class="pod-barre" style="height:${hauteur};background:${couleur};opacity:.4;border-radius:8px 8px 0 0">
          <span class="pod-rang">${rang}</span>
        </div></div>`;
    }
    const exaequo = joueurs.length > 1;
    const pts = joueurs[0].total_points;
    const rangLabel = rang + (exaequo ? 'ex' : '');

    const affiches = joueurs.slice(0, 2);
    const restants  = joueurs.length - affiches.length;
    const lignes    = affiches.map(j => ligneJoueur(j, couleur)).join('');
    const suffixe   = restants > 0
      ? `<div style="font-size:11px;font-weight:700;color:#1a1a18;margin-bottom:4px;
           background:${fondClairPour(couleur)};border:2px solid ${couleur};
           border-radius:12px;padding:2px 10px;">+ ${restants} autre${restants > 1 ? 's' : ''}</div>`
      : '';

    const degrade = couleur === couleurOr ? degradeOr : couleur === couleurArgent ? degradeArgent : degradeBronze;

    return `<div class="pod-col">
        ${couronne ? '<div class="couronne">🎯</div>' : ''}
        ${lignes}${suffixe}
        <div style="font-size:13px;font-weight:700;color:${couleur};margin:5px 0">${pts} pts</div>
        <div class="pod-barre" style="height:${hauteur};background:${degrade}">
          <span class="pod-rang">${rangLabel}</span>
        </div>
      </div>`;
  }

  elPodium.innerHTML = `<div class="podium-wrap">
      ${colonneJoueurs(groupe2, rang2, couleurArgent, '75px',  false)}
      ${colonneJoueurs(groupe1, rang1, couleurOr,     '110px', true)}
      ${colonneJoueurs(groupe3, rang3, couleurBronze,  '52px', false)}
    </div>`;

  return { rang1, rang2, rang3, couleurOr, couleurArgent, couleurBronze };
}

// ── Raccourci "Aller au classement" (bouton en haut de la page Quizz) ──
function allerAuClassementQuizz() {
  const section = document.getElementById('quizz-classement-section');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Tampon "Bonus sans-faute" en haut de la page Quizz — pourcentage
// toujours à jour avec la config admin (quizz.php?action=config_publique).
let _tamponBonusCharge = false;
async function chargerTamponBonusQuizz() {
  if (_tamponBonusCharge) return;
  const el = document.getElementById('tampon-bonus-pct');
  if (!el) return;
  try {
    const data = await apiGet('quizz.php?action=config_publique');
    el.textContent = `+${data.bonus_sans_faute_pct ?? 50}%`;
    _tamponBonusCharge = true;
  } catch (e) { /* garde la valeur par défaut affichée en dur dans le HTML */ }
}

async function chargerClassementQuizz() {
  const zone = document.getElementById('quizz-classement-contenu');
  const elPodium = document.getElementById('quizz-podium-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('quizz.php?action=classement');
    if (!data.classement || !data.classement.length) {
      if (elPodium) elPodium.innerHTML = '';
      zone.innerHTML = `<p class="txt2" style="font-size:.84rem">Pas encore de classement — aucune semaine n'a encore été résolue.</p>`;
      return;
    }

    if (elPodium) afficherPodiumQuizz(data.classement, elPodium);

    // Compte combien de joueurs partagent chaque rang, pour savoir s'il
    // faut afficher le suffixe "ex" (ex: "1ex" si plusieurs joueurs sont 1ers)
    const compteParRang = {};
    data.classement.forEach(j => { compteParRang[j.rang] = (compteParRang[j.rang] || 0) + 1; });

    zone.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${data.classement.map(j => {
          const rangLabel = j.rang + (compteParRang[j.rang] > 1 ? 'ex' : '');
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border:1px solid var(--bord);border-radius:var(--radius)">
            <div style="width:24px;text-align:center;font-weight:700;color:var(--txt2)">${rangLabel}</div>
            <div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;flex-shrink:0">${j.avatar_initiales || '?'}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600">${j.nom}</div>
              <div style="font-size:.72rem;color:var(--txt2)">
                ${j.nb_quizz_joues} quizz · ${j.nb_bonnes_reponses}/${j.nb_reponses} bonne${j.nb_bonnes_reponses > 1 ? 's' : ''} réponse${j.nb_reponses > 1 ? 's' : ''}
              </div>
            </div>
            ${j.nb_sans_faute > 0 ? `<span title="${j.nb_sans_faute} sans-faute" style="font-size:.78rem">👑 x${j.nb_sans_faute}</span>` : ''}
            <div style="font-weight:700;color:var(--or)">${j.total_points} pts</div>
          </div>
        `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

// Tableau détaillé par type de quizz (⚽ J vs ✨ S) — voir quizz.php
// action=classement_detaille pour le détail des colonnes calculées
async function chargerClassementDetailleQuizz() {
  const zone = document.getElementById('quizz-classement-detaille-contenu');
  if (!zone) return;
  zone.innerHTML = '<div class="loading"><div class="spinner"></div> Chargement…</div>';

  try {
    const data = await apiGet('quizz.php?action=classement_detaille');
    if (!data.joueurs || !data.joueurs.length) {
      zone.innerHTML = `<p class="txt2" style="font-size:.84rem">Pas encore de données — personne n'a encore répondu à un quizz cette saison.</p>`;
      return;
    }

    const g = data.global;
    const colType = (j, cle) => `
      <td style="text-align:center">${j[cle].nb_quizz_repondus}/${g[cle].nb_quizz_publies}</td>
      <td style="text-align:center">${j[cle].nb_questions_repondues}/${g[cle].nb_questions_posees}</td>
      <td style="text-align:center">${j[cle].nb_bonnes}</td>
      <td style="text-align:center;font-weight:600">${j[cle].points}</td>
    `;

    zone.innerHTML = `
      <div style="overflow-x:auto">
        <table class="classement-table" style="min-width:640px">
          <thead>
            <tr>
              <th rowspan="2" style="text-align:left !important">Joueur</th>
              <th colspan="4" style="text-align:center;border-left:2px solid var(--bord)">⚽ Quizz J</th>
              <th colspan="4" style="text-align:center;border-left:2px solid var(--bord)">✨ Quizz S</th>
              <th rowspan="2" style="text-align:center;border-left:2px solid var(--bord)">Total</th>
            </tr>
            <tr>
              <th style="text-align:center;border-left:2px solid var(--bord);font-size:.7rem" title="Quizz répondus / publiés">Quizz</th>
              <th style="text-align:center;font-size:.7rem" title="Questions répondues / posées">Questions</th>
              <th style="text-align:center;font-size:.7rem" title="Bonnes réponses">Bonnes</th>
              <th style="text-align:center;font-size:.7rem">Pts</th>
              <th style="text-align:center;border-left:2px solid var(--bord);font-size:.7rem" title="Quizz répondus / publiés">Quizz</th>
              <th style="text-align:center;font-size:.7rem" title="Questions répondues / posées">Questions</th>
              <th style="text-align:center;font-size:.7rem" title="Bonnes réponses">Bonnes</th>
              <th style="text-align:center;font-size:.7rem">Pts</th>
            </tr>
          </thead>
          <tbody>
            ${data.joueurs.map(j => `
              <tr>
                <td>${j.nom}</td>
                ${colType(j, 'J')}
                ${colType(j, 'S')}
                <td style="text-align:center;font-weight:700;color:var(--or);border-left:2px solid var(--bord)">${j.total}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="txt2" style="font-size:.7rem;margin-top:6px">"Quizz"/"Questions" = répondus par toi / total publié cette saison · "Total" = somme des points J + S, détermine le classement.</p>
    `;
  } catch (e) {
    zone.innerHTML = `<div class="txt-rouge">Erreur : ${e.message}</div>`;
  }
}

// ============================================================
//  QUIZZ — bannière de rappel hebdomadaire
//  Affichée une fois par quizz publié (flag localStorage par id),
//  sur le modèle de la bannière "Nouveautés disponibles".
// ============================================================
// Recalcule la pastille nav en tenant compte à la fois du Quizz J en
// cours ET de tous les Quizz Spéciaux encore valides — à utiliser
// partout où l'état du quizz peut avoir changé, plutôt que de calculer
// localement (risque d'éteindre la pastille à tort s'il reste un autre
// quizz non terminé que celui qu'on vient de traiter).
async function _recalculerPastilleQuizzNav() {
  try {
    const [dataJ, dataS] = await Promise.all([
      apiGet('quizz.php?action=courant'),
      apiGet('quizz.php?action=speciaux_disponibles'),
    ]);
    const jNonTermine = dataJ.quizz && !dataJ.quizz.questions.every(qq => qq.a_repondu);
    const specialNonTermine = (dataS.speciaux || []).some(s => !s.termine);
    majPastilleQuizzNav(!!jNonTermine || specialNonTermine);
  } catch (e) {
    console.warn('_recalculerPastilleQuizzNav a échoué :', e.message);
  }
}

async function verifierBanniereQuizz() {
  try {
    const data = await apiGet('quizz.php?action=courant');
    _recalculerPastilleQuizzNav(); // couvre J + Spéciaux, indépendamment de la bannière ci-dessous
    if (!data.quizz) return;

    const q = data.quizz;
    const dejaToutRepondu = q.questions.every(qq => qq.a_repondu);
    const dejaVue = localStorage.getItem('quizz_banniere_vue_' + q.id);
    if (dejaVue || dejaToutRepondu) return;

    localStorage.setItem('quizz_banniere_vue_' + q.id, '1');
    afficherBanniereQuizz(q);
  } catch (e) {
    console.warn('verifierBanniereQuizz a échoué :', e.message);
  }
}

// Pastille rouge clignotante sur l'onglet "Quizz" — contrairement à la
// bannière (affichée une seule fois puis jamais revue), elle reste
// visible tant qu'il reste au moins une question sans réponse sur le
// quizz publié en cours, quelle que soit la page où se trouve le joueur.
function majPastilleQuizzNav(visible) {
  const dot = document.getElementById('quizz-nav-dot');
  if (dot) dot.style.display = visible ? 'block' : 'none';
}

function afficherBanniereQuizz(q) {
  if (document.getElementById('banniere-quizz')) return;
  const main = document.querySelector('main');
  if (!main) return;

  const titre = q.est_treve ? `✨ Quizz Spécial #${q.numero_special}` : `⚽ Quizz J${q.journee}`;
  const banniere = document.createElement('div');
  banniere.id = 'banniere-quizz';
  banniere.style.cssText = `
    background:var(--bg2);
    border:1px solid var(--bord);border-radius:var(--radius);
    padding:14px;margin:0 0 14px;
  `;
  banniere.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px">
      <div style="font-weight:600;font-size:.9rem">Quizz de la semaine — ${titre}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--or-pale);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:.9rem">🎯</span>
        </div>
        <div style="font-size:.76rem;color:var(--txt2)">${q.questions.length} question(s) · jusqu'au ${formatDateComplete(q.date_limite)}</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:2px">
        <button class="btn btn-primary" style="white-space:nowrap" onclick="jouerDepuisBanniereQuizz()">Jouer</button>
        <button class="btn btn-secondary" style="white-space:nowrap" onclick="document.getElementById('banniere-quizz').remove()">Plus tard</button>
      </div>
    </div>
  `;
  main.prepend(banniere);
}

function jouerDepuisBanniereQuizz() {
  const b = document.getElementById('banniere-quizz');
  if (b) b.remove();
  document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
  const navBtn = document.querySelector('#main-nav button[onclick*="quizz"]');
  showPage('quizz', navBtn);
}

// ============================================================
//  FAQ — accordéon de questions fréquentes (contenu statique,
//  même texte que faq_prono_l1.pdf téléchargeable plus bas sur
//  cette page — à tenir synchronisé si l'un des deux évolue)
// ============================================================
const FAQ_CONTENU = [
  ['⚽ Comment je fais un pronostic ?',
   "Sur un match à venir, saisis le score exact que tu prévois (ex : 2-1), à tout moment avant le coup d'envoi."],
  ['🔓 Jusqu\'à quand puis-je modifier mon prono ?',
   "Jusqu'au coup d'envoi exact du match, autant de fois que tu veux. Une fois le match commencé, c'est verrouillé et les pronos de tout le monde deviennent visibles."],
  ['🧮 Comment les points sont calculés ?',
   "Score exact = le maximum de points. Bon résultat (sens deviné juste) sans le score exact = un peu moins, avec un bonus en plus si l'écart de buts est aussi juste. Des bonus indépendants existent aussi si tu devines juste le nombre de buts d'une seule des deux équipes, même si le reste est faux. Le barème précis et à jour est toujours visible dans Mon profil → Règles."],
  ['📊 C\'est quoi les cotes affichées sur les matchs ?',
   "Deux séries : les cotes des bookmakers (📊 Books) et une cote \"maison\" calculée à partir des pronostics du groupe (👥 Joueurs, à partir de 5 pronos). Elles se figent définitivement au coup d'envoi."],
  ['💰 C\'est quoi le classement "Avec cotes" ?',
   "Un barème alternatif optionnel où tes points \"sens du résultat\" sont multipliés par la cote du résultat pronostiqué — ça récompense davantage les pronostics audacieux. Accessible via Podium → Barème → Avec cotes."],
  ['🎁 C\'est quoi les bonus de saison ?',
   "Une fois par saison, tu choisis avant une date limite qui sera champion, 2e, 3e, relégué, meilleur buteur/passeur, etc. Résolus automatiquement à la fin de la saison."],
  ['🏆 C\'est quoi le bonus "champion de journée" ?',
   "Le ou les joueurs en tête du classement d'une journée précise, une fois celle-ci entièrement terminée, reçoivent automatiquement des points bonus."],
  ['🎯 C\'est quoi le Quizz ?',
   "Un jeu à part, indépendant des pronostics : des questions sur les matchs à venir, sur l'histoire du foot, et sur l'actualité récente."],
  ['🔴 Comment je sais qu\'un nouveau quizz est arrivé ?',
   "Une pastille rouge clignotante apparaît sur l'onglet Quizz tant qu'il te reste une question sans réponse. Une bannière s'affiche aussi une fois, à la publication."],
  ['⏱️ Y a-t-il un temps limite pour répondre au quizz ?',
   "Les questions \"pronostic\" n'ont pas de limite propre : elles restent ouvertes jusqu'au coup d'envoi du match concerné, comme un pronostic classique. Les questions \"histo foot\" et \"actu foot\" sont chronométrées ({{TIMER_SECONDES}} secondes par défaut) — le temps écoulé sans réponse verrouille la question à 0 point."],
  ['👑 Comment gagner le bonus "sans-faute" du quizz ?',
   "En répondant juste à toutes les questions d'une même semaine de quizz. Tu reçois alors un bonus supplémentaire (+{{BONUS_PCT}}% actuellement) sur le total de cette semaine."],
  ['🌍 C\'est quoi une "semaine de trêve" ?',
   "Une semaine sans matchs de L1 (trêve internationale...). Le quizz est alors 100% questions chronométrées, présentées une par une avec un vrai écran de démarrage."],
  ['⭐ Comment changer mon équipe de cœur ou mon pseudo ?',
   'Clique sur ton avatar en haut de l\'appli, puis "Mon équipe de cœur" ou "Changer mon pseudo".'],
  ['🔔 Comment activer les notifications ?',
   'Depuis ton avatar → Notifications : email, notification push sur ce navigateur, ou Telegram, au choix.'],
  ['❓ J\'ai un souci ou une question non couverte ici ?',
   'Le bouton "Contacter l\'admin" (dans Mon profil → Règles) permet d\'écrire directement par email.'],
];

async function chargerFaq() {
  const zone = document.getElementById('faq-accordion');
  if (!zone || zone.dataset.loaded) return;
  zone.dataset.loaded = '1';

  let bonusPct = 50;
  let timerSecondes = 10;
  try {
    const data = await apiGet('quizz.php?action=config_publique');
    if (data.bonus_sans_faute_pct != null) bonusPct = data.bonus_sans_faute_pct;
    if (data.timer_secondes_actu != null) timerSecondes = data.timer_secondes_actu;
  } catch (e) { /* on garde les valeurs par défaut si l'appel échoue */ }

  zone.innerHTML = FAQ_CONTENU.map(([q, r]) => `
    <details class="admin-card" style="padding:0">
      <summary style="cursor:pointer;padding:14px 16px;font-weight:600;list-style:none;display:flex;align-items:center;justify-content:space-between">
        <span>${q}</span>
        <span class="txt2" style="font-size:.8rem;margin-left:8px">▾</span>
      </summary>
      <div class="txt2" style="padding:0 16px 14px;font-size:.86rem;line-height:1.5">${r.replace('{{BONUS_PCT}}', bonusPct).replace('{{TIMER_SECONDES}}', timerSecondes)}</div>
    </details>
  `).join('');
}

function toggleVueFaq(afficherGuide) {
  document.getElementById('btn-faq-courte').classList.toggle('active', !afficherGuide);
  document.getElementById('btn-faq-guide').classList.toggle('active', afficherGuide);
  document.getElementById('faq-accordion').classList.toggle('hidden', afficherGuide);
  document.getElementById('guide-complet-contenu').classList.toggle('hidden', !afficherGuide);
  if (afficherGuide) chargerGuideComplet();
}

// Guide complet — même contenu que guide_prono_l1.md/.docx téléchargeables
// plus bas sur cette page, rendu directement en HTML pour une lecture
// sans téléchargement. À tenir synchronisé si l'un des trois évolue.
async function chargerGuideComplet() {
  const zone = document.getElementById('guide-complet-contenu');
  if (zone.dataset.loaded) return;
  zone.dataset.loaded = '1';

  let timerSecondes = 10;
  try {
    const data = await apiGet('quizz.php?action=config_publique');
    if (data.timer_secondes_actu != null) timerSecondes = data.timer_secondes_actu;
  } catch (e) { /* on garde 10 par défaut si l'appel échoue */ }

  const section = (titre, html) => `
    <div class="admin-card" style="margin-bottom:12px">
      <div style="font-weight:700;font-size:1rem;margin-bottom:10px">${titre}</div>
      ${html}
    </div>`;
  const table = (entetes, lignes) => `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin:8px 0">
      <thead><tr>${entetes.map(e => `<th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--bord);color:var(--txt2)">${e}</th>`).join('')}</tr></thead>
      <tbody>${lignes.map(l => `<tr>${l.map(c => `<td style="padding:6px 8px;border-bottom:1px solid var(--bord)">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  const ul = items => `<ul style="margin:6px 0;padding-left:20px;font-size:.86rem;line-height:1.6">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const p = t => `<p style="font-size:.86rem;line-height:1.55;margin:8px 0">${t}</p>`;
  const h3 = t => `<div style="font-weight:600;font-size:.9rem;margin:14px 0 4px">${t}</div>`;

  let html = `
    <p class="txt2" style="font-size:.82rem;margin-bottom:14px">
      Bienvenue ! Ce guide explique tout ce qu'il faut savoir pour jouer sans surprise : les pronostics, les cotes, les bonus, le quizz, les classements, et les réglages de ton compte.
    </p>`;

  html += section('⚽ 1. Les pronostics', `
    ${p("Chaque semaine, tu prédis le score exact de chaque match de Ligue 1 (ex : 2-1), avant le coup d'envoi.")}
    ${ul([
      "Tu peux modifier ou effacer ton pronostic autant de fois que tu veux, tant que le match n'a pas commencé.",
      "Dès le coup d'envoi, c'est fermé : plus aucune modification possible, et les pronostics de tout le monde deviennent visibles sur ce match.",
    ])}
    ${h3('Comment les points sont calculés')}
    ${table(['Cas', 'Points'], [
      ['Score exact (ex : tu dis 2-1, le score final est 2-1)', 'Barème "score exact" — le maximum'],
      ['Bon résultat (victoire/nul/défaite deviné, sans le score exact)', 'Barème "bon résultat"'],
      ["+ Bonus écart de buts juste (en plus d'un bon résultat)", 'Bonus supplémentaire'],
      ["+ Bonus nb de buts équipe domicile juste", "Bonus indépendant — s'applique même si le reste est faux"],
      ["+ Bonus nb de buts équipe extérieur juste", "Bonus indépendant — s'applique même si le reste est faux"],
    ])}
    ${p('⚠️ <strong>Un score exact ne cumule jamais avec les autres bonus</strong> — c\'est le montant "score exact" à lui seul, qui est déjà le plus généreux.')}
    ${p('Le barème précis est visible à tout moment dans Mon profil → Règles, et peut évoluer en cours de saison — il est toujours affiché à jour.')}
  `);

  html += section('📊 2. Les cotes', `
    ${p("Sur chaque match à venir, deux séries de cotes 1/N/2 sont affichées :")}
    ${ul([
      '📊 <strong>Books</strong> — la moyenne des cotes des bookmakers professionnels',
      '👥 <strong>Joueurs</strong> — une cote "maison", calculée à partir des pronostics déjà saisis par le groupe (à partir de 5 pronostics)',
    ])}
    ${p("Une troisième ligne indique aussi le score le plus pronostiqué par le groupe. Les cotes sont figées au moment exact du coup d'envoi.")}
    ${h3('Le classement "Avec cotes" (optionnel)')}
    ${p('Dans Podium → Barème → Avec cotes : la partie "score exact / bon résultat" de tes points est multipliée par la cote bookmaker du résultat pronostiqué (plafonnée à une valeur maximale). Les bonus de buts restent inchangés — ça récompense les pronostics audacieux.')}
  `);

  html += section('🎁 3. Les bonus', `
    ${h3('Bonus de saison')}
    ${p("Une seule fois par saison, avant une date limite, tu choisis : qui sera champion, 2e, 3e, relégué, meilleur buteur/passeur, meilleure attaque/défense...")}
    ${ul([
      'Résolus automatiquement à la fin de la saison.',
      "Cas particulier 2e/3e : en cas d'inversion, tu touches quand même la moitié des points.",
      'En cas d\'égalité, tout le monde ayant le bon choix touche les points en entier.',
    ])}
    ${h3('Champion de journée')}
    ${p("Le ou les joueurs en tête du classement d'une journée entièrement terminée reçoivent automatiquement un bonus. Tous les ex-aequo sont récompensés.")}
  `);

  html += section('🎯 4. Le Quizz hebdomadaire', `
    ${p('Un jeu à part, indépendant des pronostics, pour tester votre culture foot et suivre l\'actualité.')}
    ${h3("Comment savoir qu'un quizz t'attend")}
    ${ul([
      'Une <strong>pastille rouge clignotante</strong> sur l\'onglet Quizz, tant qu\'il te reste une question sans réponse.',
      'Une <strong>bannière</strong> à l\'ouverture de l\'appli, la première fois qu\'un quizz est publié.',
    ])}
    ${h3('Les types de questions')}
    ${table(['Type', 'Ce que c\'est', 'Limite de temps'], [
      ['⚽ Pronostic', 'Générée depuis les matchs de la journée', "Aucune — jusqu'au coup d'envoi du match concerné"],
      ['📜 Histo foot', 'Un fait établi, jamais changeant', `Chronométrée (${timerSecondes}s par défaut)`],
      ['📰 Actu foot', "Actualité récente, source vérifiable", `Chronométrée (${timerSecondes}s par défaut)`],
    ])}
    ${p("Le minuteur passe au rouge dans les 3 dernières secondes. Temps écoulé sans réponse = question verrouillée à 0 point.")}
    ${h3('Quizz de journée vs Quizz Spécial')}
    ${ul([
      '<strong>⚽ Quizz de journée</strong> : lié aux matchs de L1 à venir. S\'il ne contient que du pronostic, toutes les questions s\'affichent en même temps ; dès qu\'il contient au moins une question histo/actu, il passe en mode séquentiel (une question à la fois).',
      '<strong>✨ Quizz Spécial</strong> (pas de matchs L1 cette semaine-là) : 100% chronométré, présenté une question à la fois, écran de démarrage, bouton "Suivant" débloqué seulement après réponse ou temps écoulé.',
    ])}
    ${h3('Les points')}
    ${p('Chaque bonne réponse rapporte un nombre de points fixe (2 par défaut). Un sans-faute sur toute la semaine ajoute un bonus (+50% par défaut).')}
    ${h3('Le classement quizz')}
    ${p('Séparé du classement des pronostics, avec son propre podium visuel, et les stats de participation de chaque joueur (quizz joués, réponses, bonnes réponses/total publié).')}
  `);

  html += section('🏆 5. Les classements', `
    ${ul([
      '<strong>Podium</strong> — classement général, avec Avec/Sans Bonus et Classique/Avec cotes',
      '<strong>Par journée</strong> — recalculé sur une seule journée',
      '<strong>Classement équipes</strong> — le championnat lui-même',
      '<strong>Buteurs / Passeurs</strong>',
      '<strong>Classement quizz</strong>',
    ])}
    ${p('Les égalités de points sont regroupées sur le même rang (1, 1, 3...) plutôt que départagées arbitrairement.')}
  `);

  html += section('⚙️ 6. Mon compte', `
    ${p('Accessible en cliquant sur ton avatar en haut de l\'appli :')}
    ${ul([
      '✏️ Changer mon pseudo',
      '⭐ Mon équipe de cœur',
      '🔒 Changer mon mot de passe',
      '🔔 Notifications (email, push, Telegram)',
      'ℹ️ Règles — le barème à jour',
      '🚪 Déconnexion',
    ])}
  `);

  zone.innerHTML = html;
}


