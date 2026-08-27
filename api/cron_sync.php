<?php
// ============================================================
//  PRONO-L1 — Synchronisation automatique (tâche planifiée)
//  Fichier : api/cron_sync.php
//
//  À exécuter toutes les 15 minutes via le planificateur Synology
//  Commande : php /volume1/web/prono-l1/api/cron_sync.php
//
//  Logique :
//  1. Vérifie s'il y a des matchs terminés non encore synchronisés
//     (fenêtre : au-delà de 105 min après le coup d'envoi, sans limite
//     haute) — retry cURL immédiat (jusqu'à 3x) sur échec réseau transitoire
//  1bis. Filet de sécurité : retente l'envoi de notification (sans
//     rappel API) pour tout match déjà "termine" mais resté à
//     notif_envoyee=0 (ex: panne SMTP lors d'un passage précédent),
//     jusqu'à 24h après le coup d'envoi
//  2. Si oui → sync score depuis API-Football
//  3. Calcul des points + envoi notifications
//  4. Toutes les heures → sync buteurs/passeurs (désormais aussi
//     API-Football, /players/topscorers)
//  5. 1x/jour → veille des matchs reportés ; ~4x/jour (toutes les 6h)
//     → veille mercato et veille des changements de programmation
//     (un match "à venir" dans les 21 prochains jours dont l'horaire
//     a bougé, OU dont le domicile/extérieur a été inversé par la LFP
//     (ex: pelouse impraticable), est détecté et corrigé automatiquement
//     en base, avec email récapitulatif aux admins — en cas d'inversion,
//     les pronostics/cotes déjà enregistrés sur ce match ne sont PAS
//     corrigés automatiquement, l'email en indique le nombre à vérifier)
// ============================================================

// Pas de headers HTTP (script CLI)
define('RUNNING_AS_CRON', true);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/notifications.php';

$db       = getDB();
$now      = time();

// Le cron réel (tâche planifiée, ligne de commande) ne traite toujours
// que la saison en_cours. Pour les tests manuels via navigateur UNIQUEMENT
// (jamais quand RUNNING_AS_CRON vient du planificateur), on permet de
// forcer une saison précise avec ?saison_id=X — pratique pour valider la
// veille calendrier TV sur la saison 2026-27 avant qu'elle passe en_cours.
$saisonForcee = (php_sapi_name() !== 'cli' && isset($_GET['saison_id'])) ? (int)$_GET['saison_id'] : null;
$saisonId     = $saisonForcee ?? saisonDemandee($db); // le cron ne traite toujours que la saison en_cours

// Dossier de log (api/logs/) — un fichier par jour, nettoyé automatiquement
define('CRON_LOG_DIR', __DIR__ . '/logs');
$GLOBALS['_cronErreurs'] = [];

_nettoyerVieuxLogs();
_log("=== Cron Prono-L1 démarré — " . date('Y-m-d H:i:s') . " ===");
if ($saisonForcee) {
    _log("⚠️ TEST MANUEL : saison forcée à id={$saisonForcee} via ?saison_id= (le vrai cron ignore ce paramètre)");
}

// ============================================================
//  ÉTAPE 1 — Cherche les matchs potentiellement terminés
//  Tout match dont le coup d'envoi remonte à plus de 105 min et qui
//  n'est pas encore marqué terminé/reporté/annulé — sans limite haute :
//  un match manqué (cron arrêté, tâche pas encore programmée, etc.)
//  reste ainsi détectable indéfiniment, au lieu de sortir d'une
//  fenêtre de 30 min et de ne plus jamais être revérifié.
// ============================================================
$stmt = $db->prepare('
    SELECT id, apf_fixture_id, date, journee
    FROM matches
    WHERE saison_id = ?
    AND statut != \'termine\'
    AND statut != \'reporte\'
    AND statut != \'annule\'
    AND date <= DATE_SUB(NOW(), INTERVAL 105 MINUTE)
');
$stmt->execute([$saisonId]);
$matchs_a_verifier = $stmt->fetchAll();

if (empty($matchs_a_verifier)) {
    _log("Aucun match à vérifier (rien au-delà de 105 min sans être marqué terminé).");
}

// ============================================================
//  ÉTAPE 2 — Sync chaque match individuellement
// ============================================================
$syncs_ok  = 0;
$termines  = 0;

foreach ($matchs_a_verifier as $match) {
    $res = _syncUnMatchDepuisApi($db, $match, $saisonId);
    if (!$res['ok']) continue;

    $syncs_ok++;

    // Si le match est terminé → calculer les points
    // (la notification n'est plus envoyée ici : voir l'appel groupé à
    // envoyerNotificationsGroupees() en fin de script, qui couvre en une
    // fois tous les matchs de la journée de cron, groupés par date)
    if ($res['termine']) {
        _log("  → Match terminé ! Calcul des points...");
        calculerPointsMatch($db, $match['id']);
        $termines++;
        _log("  → ✅ Fait.");
    }
}

// ============================================================
//  ÉTAPE 1-live — Suivi en direct des matchs en cours (entre le coup
//  d'envoi et 105 min après, donc pas encore repris par ÉTAPE 1
//  ci-dessus). Met à jour score et statut ("en_cours") en base au fil
//  du match — la seule chose qui manquait jusqu'ici pour que la carte
//  match et l'onglet Analyse affichent quelque chose pendant que le
//  match se joue (avant, la base ne bougeait qu'à 105 min, le badge
//  "en_cours" affiché à l'écran étant purement visuel/basé sur
//  l'heure, sans aucune donnée réelle derrière).
//  Même fonction de synchro que ÉTAPE 1 (_syncUnMatchDepuisApi) : le
//  calcul des points ne se déclenche que si le statut retourné est
//  bien "termine" (cas rare mais possible d'un match sans prolongation
//  du temps additionnel, terminé avant 105 min) — jamais avant.
// ============================================================
$stmt = $db->prepare('
    SELECT id, apf_fixture_id, date, journee
    FROM matches
    WHERE saison_id = ?
    AND statut != \'termine\'
    AND statut != \'reporte\'
    AND statut != \'annule\'
    AND apf_fixture_id IS NOT NULL
    AND date <= NOW()
    AND date > DATE_SUB(NOW(), INTERVAL 105 MINUTE)
');
$stmt->execute([$saisonId]);
$matchs_en_direct = $stmt->fetchAll();

if (!empty($matchs_en_direct)) {
    _log(count($matchs_en_direct) . " match(s) en direct à rafraîchir (score/statut)...");
    foreach ($matchs_en_direct as $match) {
        $res = _syncUnMatchDepuisApi($db, $match, $saisonId);
        if (!$res['ok']) continue;

        $syncs_ok++;

        if ($res['termine']) {
            _log("  → Match terminé plus tôt que prévu (avant 105 min) ! Calcul des points...");
            calculerPointsMatch($db, $match['id']);
            $termines++;
            _log("  → ✅ Fait.");
        }
    }
}

// ============================================================
//  ÉTAPE 1bis — (ancien filet de sécurité "notifs en attente")
//  Ce rattrapage match par match n'est plus nécessaire : l'appel
//  unique à envoyerNotificationsGroupees() en toute fin de script
//  couvre déjà, à chaque passage de cron, absolument tous les matchs
//  notif_envoyee=0 de la saison — qu'ils datent de ce passage-ci ou
//  d'un passage précédent resté en échec.
// ============================================================

// Vérifie si des journées viennent de se terminer entièrement, et
// attribue le bonus "champion de journée" en conséquence.
if ($termines > 0) {
    _log("Vérification des champions de journée...");
    verifierChampionsJournee($db, $saisonId);
}

// ============================================================
//  Résolution automatique des quizz — remplace le clic manuel sur
//  "Résoudre" dans l'écran Admin. Appelée à CHAQUE passage du cron
//  (pas seulement quand $termines > 0) : une question "buteur" peut
//  rester en attente si les stats du match ne sont pas encore
//  synchronisées au moment où le match passe "terminé" — elle sera
//  retentée automatiquement au prochain passage. Voir
//  resoudreQuizzSaison() dans utils.php (logique partagée avec
//  l'action admin quizz.php?action=resoudre).
// ============================================================
_log("Résolution automatique des quizz...");
$resultatQuizz = resoudreQuizzSaison($db, $saisonId);
if ($resultatQuizz['questions_resolues'] > 0) {
    _log("  → {$resultatQuizz['questions_resolues']} question(s) de quizz résolue(s), classement recalculé ({$resultatQuizz['classement_recalcule']} joueur(s)).");
} else {
    _log("  → Rien à résoudre.");
}

// ============================================================
//  ÉTAPE 1ter — Recontrôle des minutes de but/carton (une seule fois
//  par match, ~90 min après le coup d'envoi)
//  L'API-Football finalise parfois le temps additionnel (arrêts de
//  jeu) d'un but légèrement après la fin du match (ex: confirmation
//  vidéo) — notre synchro initiale (étape 2) a déjà eu lieu à ce
//  moment-là et n'est jamais rejouée, donc une minute "90" resterait
//  figée pour toujours même si l'API la corrige en "94" juste après.
//  On revérifie donc chaque match une seule fois, assez tard pour
//  laisser le temps à l'API de se stabiliser, marqué via
//  buts_recontroles_le pour ne jamais le refaire deux fois.
// ============================================================
$stmt = $db->prepare('
    SELECT id, apf_fixture_id, journee, club_dom_id, club_ext_id
    FROM matches
    WHERE saison_id = ?
    AND statut = \'termine\'
    AND buts_recontroles_le IS NULL
    AND apf_fixture_id IS NOT NULL
    AND date <= DATE_SUB(NOW(), INTERVAL 90 MINUTE)
    AND date >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
');
$stmt->execute([$saisonId]);
$matchs_a_recontroler = $stmt->fetchAll();

if (!empty($matchs_a_recontroler)) {
    _log(count($matchs_a_recontroler) . " match(s) à recontrôler (minutes de but/carton)...");
    foreach ($matchs_a_recontroler as $match) {
        try {
            // $definitif=true : la requête ci-dessus filtre déjà statut='termine'.
            _syncMatchStats($db, (int)$match['id'], (int)$match['apf_fixture_id'], (int)$match['club_dom_id'], (int)$match['club_ext_id'], true);
            _log("  → apf_fixture_id={$match['apf_fixture_id']} (J{$match['journee']}) : recontrôlé.");
        } catch (Exception $e) {
            _logErreur("Match apf_fixture_id={$match['apf_fixture_id']} (J{$match['journee']}) : échec du recontrôle — " . $e->getMessage());
        }
        // Marqué comme fait dans tous les cas (même en cas d'échec) pour ne
        // jamais retenter en boucle un match dont la synchro échoue
        // systématiquement — le prochain cron du même match n'existera
        // plus après la fenêtre de 6h de toute façon.
        $db->prepare('UPDATE matches SET buts_recontroles_le = NOW() WHERE id = ?')->execute([$match['id']]);
    }
}

// ============================================================
//  ÉTAPE 2bis — Cotes bookmakers (API-Football) — à chaque passage
//  du cron (toutes les 15 min), pour tous les matchs 'a_venir' de la
//  saison. Un seul appel groupé et paginé à /odds?league=...&season=...
//  (comme /players/topscorers), plutôt qu'un appel par match, pour
//  rester économe en requêtes API-Football.
// ============================================================
_log("Cotes bookmakers...");
_syncCotes($db, $saisonId);

// ============================================================
//  ÉTAPE 2ter — Compositions officielles (matchs imminents / en cours)
//  À chaque passage du cron (toutes les 15 min). Avant cette étape, la
//  compo n'était récupérée qu'à la demande (quand un joueur ouvrait la
//  fenêtre "Compos") : si personne ne consultait au bon moment (publiée
//  20-40 min avant le coup d'envoi), elle restait bloquée sur "pas encore
//  publiée" indéfiniment, même une fois le match commencé. Désormais le
//  cron la précharge lui-même, silencieusement, dès qu'un match approche
//  ou est en cours — voir _syncCompositionsMatchsProches().
// ============================================================
_syncCompositionsMatchsProches($db, $saisonId);

// ============================================================
//  ÉTAPE 3 — Sync buteurs/passeurs (toutes les heures)
//  On vérifie via un fichier timestamp pour éviter de
//  le faire à chaque exécution du cron
// ============================================================
$fichier_last_sync = sys_get_temp_dir() . '/prono_l1_last_stats_sync_' . DB_NAME . '.txt';
$last_sync         = file_exists($fichier_last_sync) ? (int)file_get_contents($fichier_last_sync) : 0;

if ($now - $last_sync > 3600 && $termines > 0) {
    _log("Sync buteurs/passeurs...");
    _syncStats($db, $saisonId);
    file_put_contents($fichier_last_sync, $now);
    _log("  → Stats synchronisées.");
}

_log("=== Cron terminé — syncs: $syncs_ok, matchs terminés: $termines ===\n");

// ============================================================
//  ÉTAPE 4 — Veille mercato (~4x/jour)
//  Tant qu'une saison "en_cours" et/ou "futur" existe, on revérifie
//  les effectifs de leurs clubs déjà synchronisés, et on alerte
//  l'admin par email si des arrivées/départs sont détectés — sans
//  qu'il ait besoin de cliquer. Fréquence alignée sur la veille
//  calendrier TV (6h) pour éviter qu'un mouvement ne reste plusieurs
//  heures non détecté sur un environnement selon l'heure de son
//  dernier passage.
// ============================================================
$fichier_last_mercato = sys_get_temp_dir() . '/prono_l1_last_mercato_check_' . DB_NAME . '.txt';
$last_mercato          = file_exists($fichier_last_mercato) ? (int)file_get_contents($fichier_last_mercato) : 0;

if ($now - $last_mercato > 21600) {
    _verifierMercato($db);
    file_put_contents($fichier_last_mercato, $now);
}

// ============================================================
//  ÉTAPE 4bis — Veille des matchs reportés (une fois par jour)
//  Contrairement aux matchs "à venir/en cours" (vérifiés ci-dessus
//  toutes les 15 min autour du coup d'envoi), un match déjà marqué
//  'reporte' n'est JAMAIS revérifié par l'ÉTAPE 1 (exclusion
//  volontaire, pour ne pas gaspiller d'appels API sur un match sans
//  date connue). Sans cette étape, un match reporté resterait donc
//  bloqué indéfiniment en base, même une fois rejoué et terminé.
//  On revérifie donc 1x/jour, moins urgent qu'un match imminent.
// ============================================================
$fichier_last_reportes = sys_get_temp_dir() . '/prono_l1_last_reportes_check_' . DB_NAME . '.txt';
$last_reportes          = file_exists($fichier_last_reportes) ? (int)file_get_contents($fichier_last_reportes) : 0;

if ($now - $last_reportes > 86400) {
    _verifierMatchsReportes($db, $saisonId);
    file_put_contents($fichier_last_reportes, $now);
}

// ============================================================
//  ÉTAPE 4ter — Veille des changements de programmation TV (~4x/jour)
//  La Ligue confirme les horaires définitifs au fil de l'eau selon les
//  choix des diffuseurs (ex: un match "à confirmer" un samedi devient
//  finalement le dimanche). On revérifie les matchs "à venir" dans les
//  21 prochains jours auprès d'API-Football, et on corrige
//  automatiquement la date/journée en base si elle a changé — avec un
//  email récapitulatif aux admins pour qu'ils sachent que ça a bougé
//  (contrairement à un report, ce n'est pas visible autrement : le
//  match reste au statut 'a_venir', ÉTAPE 1 ne le détecterait jamais).
//  Un seul appel API par vérification (quelle que soit la fenêtre de
//  matchs) → coût négligeable, d'où la fréquence plus élevée que le
//  mercato/reportés (1x/jour, eux, car appels API par club).
// ============================================================
$fichier_last_calendrier = sys_get_temp_dir() . '/prono_l1_last_calendrier_check_' . DB_NAME . '.txt';
$last_calendrier          = file_exists($fichier_last_calendrier) ? (int)file_get_contents($fichier_last_calendrier) : 0;

if ($saisonForcee || $now - $last_calendrier > 21600) {
    _verifierChangementsCalendrier($db, $saisonId);
    file_put_contents($fichier_last_calendrier, $now);
}

// ============================================================
//  ÉTAPE 3ter — Rappels push "1h avant l'heure limite" — à chaque
//  passage du cron (toutes les 15 min), pas de limitation quotidienne
//  comme les autres vérifications ci-dessus : celle-ci est sensible au
//  temps (fenêtre de detection de 20 min glissante), et
//  push_rappels_envoyes empêche déjà tout double envoi.
// ============================================================
require_once __DIR__ . '/notifications.php'; // déjà inclus en tête de fichier, gardé ici pour la lisibilité du bloc
$resultatRappels = verifierRappelsAvantMatch($db, $saisonId);
if (($resultatRappels['notifs_envoyees'] ?? 0) > 0) {
    _log("Rappels 1h avant : {$resultatRappels['notifs_envoyees']} notif(s) envoyée(s) à {$resultatRappels['joueurs_concernes']} joueur(s)");
}

// ============================================================
//  ÉTAPE 4ter — Validation automatique des bonus de fin de saison
//  (Champion, 2e, 3e, Relégués, Barragiste, Meilleure attaque/défense,
//  Buteur, Passeur) — ne fait rien tant que la saison n'est pas
//  entièrement terminée (voir verifierBonusAutomatiques). 1x/jour.
// ============================================================
$fichier_last_bonus_auto = sys_get_temp_dir() . '/prono_l1_last_bonus_auto_check_' . DB_NAME . '.txt';
$last_bonus_auto         = file_exists($fichier_last_bonus_auto) ? (int)file_get_contents($fichier_last_bonus_auto) : 0;

if ($now - $last_bonus_auto > 86400) {
    $r = verifierBonusAutomatiques($db, $saisonId);
    if (!empty($r['resultats'])) {
        _log("Bonus automatiques validés : " . implode(' | ', $r['resultats']));
    }
    file_put_contents($fichier_last_bonus_auto, $now);
}

// ============================================================
//  ÉTAPE 4quater — Envoi des notifications de résultats, groupées par
//  date locale — un seul passage couvrant tous les matchs 'termine'
//  pas encore notifiés de la saison, quelle que soit l'étape qui les a
//  fait passer à 'termine' plus haut (étape 1, ou veille des reportés
//  ci-dessus). Voir envoyerNotificationsGroupees() dans notifications.php.
// ============================================================
require_once __DIR__ . '/notifications.php'; // déjà inclus en tête de fichier, gardé ici pour la lisibilité du bloc
$resultatNotifs = envoyerNotificationsGroupees($db, $saisonId);
if (($resultatNotifs['dates_traitees'] ?? 0) > 0) {
    _log("Notifications de résultats : {$resultatNotifs['dates_traitees']} date(s) traitée(s), {$resultatNotifs['matchs_notifies']} match(s) notifié(s).");
}

// ============================================================
//  ÉTAPE 5 — Alerte email si des erreurs sont survenues durant
//  cette exécution (échecs API, etc.) — un seul email groupé par
//  passage de cron, envoyé aux admins, pour ne pas spammer.
// ============================================================
if (!empty($GLOBALS['_cronErreurs'])) {
    _envoyerAlerteErreursCron($db, $GLOBALS['_cronErreurs']);
}

// ============================================================
//  FONCTIONS PRIVÉES
// ============================================================

// ============================================================
//  Interroge l'API pour UN match donné (statut + score courant) et met
//  à jour la base en conséquence. Fonction commune à ÉTAPE 1 (matchs
//  probablement terminés, ≥105 min après le coup d'envoi) et ÉTAPE
//  1-live (matchs en cours, entre le coup d'envoi et 105 min) — mêmes
//  règles pour les deux : le statut "termine" ne peut ressortir que si
//  l'API le confirme réellement (ou via le filet de sécurité "match
//  ancien avec score" ci-dessous), jamais deviné. Le calcul des points
//  reste décidé par l'appelant (jamais fait ici), pour bien séparer
//  "mettre à jour l'affichage" de "attribuer des points définitifs".
// ============================================================
function _syncUnMatchDepuisApi(PDO $db, array $match, int $saisonId): array {
    _log("Vérification match apf_fixture_id={$match['apf_fixture_id']} (J{$match['journee']})...");

    $url = 'https://v3.football.api-sports.io/fixtures?id=' . $match['apf_fixture_id'];

    // Retry immédiat (jusqu'à 3 tentatives) en cas d'échec réseau transitoire
    // (timeout, coupure momentanée, erreur 5xx côté API-Football) — évite
    // d'attendre le prochain passage cron (15 min) pour un simple accident
    // ponctuel. On ne retente PAS sur une erreur définitive (401, 404...).
    $httpCode = 0;
    $response = false;
    for ($tentative = 1; $tentative <= 3; $tentative++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . API_FOOTBALL_KEY],
            CURLOPT_TIMEOUT        => 10,
        ]);
        $response  = curl_exec($ch);
        $curlErrno = curl_errno($ch);
        $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $echecTransitoire = ($curlErrno !== 0) || $httpCode === 0 || $httpCode >= 500;
        if (!$echecTransitoire) break; // succès, ou échec définitif : inutile d'insister

        if ($tentative < 3) {
            _log("  → Tentative {$tentative}/3 échouée (curl#{$curlErrno}, HTTP {$httpCode}), nouvel essai...");
            usleep(500000); // 0,5 s avant de retenter
        }
    }

    if ($httpCode !== 200) {
        _logErreur("Match apf_fixture_id={$match['apf_fixture_id']} (J{$match['journee']}) : échec API HTTP $httpCode après 3 tentative(s)");
        return ['ok' => false];
    }

    $data = json_decode($response, true);
    $fx   = $data['response'][0] ?? null;
    if (!$fx) {
        _logErreur("Match apf_fixture_id={$match['apf_fixture_id']} (J{$match['journee']}) : fixture introuvable dans la réponse API");
        return ['ok' => false];
    }

    $statut    = _convertirStatutApf($fx['fixture']['status']['short'] ?? '');
    $score_dom = $fx['goals']['home'] ?? null;
    $score_ext = $fx['goals']['away'] ?? null;
    $journee   = _extraireJourneeApf($fx['league']['round'] ?? '') ?? $match['journee'];
    $date_utc  = !empty($fx['fixture']['date']) ? gmdate('Y-m-d H:i:s', strtotime($fx['fixture']['date'])) : $match['date'];

    // Résolution des clubs domicile/extérieur TELS QUE VUS PAR L'API pour
    // ce fixture — uniquement utile si le match est verrouillé (voir
    // appliquerMajMatch() dans utils.php) : permet de détecter que l'API
    // n'a pas encore basculé, et donc de réorienter le score avant stockage.
    // Sans effet sur un match non verrouillé.
    $idDomApf     = (int)($fx['teams']['home']['id'] ?? 0);
    $idExtApf     = (int)($fx['teams']['away']['id'] ?? 0);
    $clubApiDomId = $idDomApf ? _trouverClubApf($db, $idDomApf, $fx['teams']['home']['name'] ?? '', $saisonId) : null;
    $clubApiExtId = $idExtApf ? _trouverClubApf($db, $idExtApf, $fx['teams']['away']['name'] ?? '', $saisonId) : null;

    // Filet de sécurité : si le coup d'envoi est passé depuis largement
    // plus longtemps qu'un match ne dure, et que le score final est bien
    // présent, on considère le match terminé même si le statut renvoyé
    // par l'API reste ambigu (ex: vieux match jamais basculé à FT).
    // On ne touche jamais aux statuts en_cours/reporte/annule détectés
    // correctement — seulement au cas par défaut ("a_venir").
    if ($statut === 'a_venir' && $score_dom !== null && $score_ext !== null
        && strtotime($match['date']) < strtotime('-3 hours')) {
        $statut = 'termine';
        _log("  → Statut API ambigu mais score présent et match ancien : considéré terminé.");
    }

    _log("  → Statut API : {$fx['fixture']['status']['short']} | Statut retenu : {$statut} | Score : {$score_dom}-{$score_ext}");

    // Mettre à jour le match en base (gère aussi proprement un passage
    // au statut 'reporte' : journee_initiale/date_initiale sont figées)
    appliquerMajMatch($db, (int)$match['id'], (int)$journee, $date_utc, $score_dom, $score_ext, $statut, $clubApiDomId, $clubApiExtId);

    // Plan Pro API-Football = 300 req/min, largement suffisant pour ne
    // plus avoir besoin de la pause de 7s imposée par le plan gratuit
    // football-data.org (10 req/min) — retirée.

    return [
        'ok'       => true,
        'statut'   => $statut,
        'termine'  => ($statut === 'termine' && $score_dom !== null),
    ];
}

// ============================================================
//  Compositions officielles — précharge la compo (titulaires/remplaçants,
//  via _syncCompositions() partagée dans utils.php) pour tout match :
//  - "a_venir" dont le coup d'envoi est dans moins de 50 min (fenêtre de
//    publication API-Football : 20-40 min avant, marge incluse) ;
//  - ou "en_cours" (filet de sécurité si le passage précédent n'a rien
//    trouvé, ou si personne n'a ouvert l'appli dans la fenêtre a_venir).
//  Un match déjà complet en cache (2 équipes, titulaires non vides des 2
//  côtés) est ignoré, pour ne pas re-solliciter l'API à chaque passage
//  une fois la compo obtenue. Bornée à 3h après le coup d'envoi par
//  sécurité (au-delà, ÉTAPE 1 aura de toute façon basculé le match en
//  "termine" et cette étape ne le reverra plus).
// ============================================================
function _syncCompositionsMatchsProches(PDO $db, int $saisonId): void {
    $stmt = $db->prepare("
        SELECT m.id, m.date, m.apf_fixture_id, m.club_dom_id, m.club_ext_id,
               cd.apf_id AS apf_dom, m.journee
        FROM matches m
        JOIN clubs cd ON cd.id = m.club_dom_id
        WHERE m.saison_id = ?
        AND (
            (m.statut = 'a_venir' AND m.date <= DATE_ADD(NOW(), INTERVAL 50 MINUTE))
            OR m.statut = 'en_cours'
        )
        AND m.date >= DATE_SUB(NOW(), INTERVAL 3 HOUR)
    ");
    $stmt->execute([$saisonId]);
    $matchs = $stmt->fetchAll();

    if (empty($matchs)) return;

    $nbSync = 0;
    foreach ($matchs as $match) {
        // Déjà complet en cache (2 équipes, titulaires non vides des 2 côtés) ?
        $stmtC = $db->prepare('SELECT titulaires FROM compositions WHERE match_id = ?');
        $stmtC->execute([$match['id']]);
        $lignes  = $stmtC->fetchAll();
        $complet = count($lignes) === 2;
        if ($complet) {
            foreach ($lignes as $l) {
                if (empty(json_decode($l['titulaires'], true))) { $complet = false; break; }
            }
        }
        if ($complet) continue;

        $fixtureId = $match['apf_fixture_id'];
        if (!$fixtureId && $match['apf_dom']) {
            $fixtureId = _resoudreFixtureId($match);
            if ($fixtureId) {
                $db->prepare('UPDATE matches SET apf_fixture_id = ? WHERE id = ?')
                   ->execute([$fixtureId, $match['id']]);
            }
        }
        if (!$fixtureId) continue;

        try {
            _syncCompositions($db, (int)$match['id'], (int)$fixtureId, (int)$match['club_dom_id'], (int)$match['club_ext_id']);
            $nbSync++;
        } catch (Exception $e) {
            _logErreur("Compositions J{$match['journee']} (match id={$match['id']}) : échec sync — " . $e->getMessage());
        }

        usleep(150000); // pause légère, politesse envers l'API
    }

    if ($nbSync > 0) {
        _log("Compositions : $nbSync match(s) synchronisé(s)/retenté(s).");
    }
}

// ============================================================
//  Cotes bookmakers — un seul appel groupé et paginé à /odds pour
//  toute la ligue/saison, plutôt qu'un appel par match. On ne retient
//  que les fixtures qui correspondent à un de nos matchs 'a_venir'.
//  Marché utilisé : "Match Winner" (1 / N / 2), moyenne de tous les
//  bookmakers renvoyés par l'API pour ce match.
//  Les matchs verrouillés (domicile_verrouille = 1) sont exclus : l'API
//  étiquette "domicile"/"extérieur" selon SA propre orientation du
//  fixture, qui ne correspond plus forcément à la nôtre tant qu'elle n'a
//  pas basculé à son tour — une cote enregistrée dans ce contexte serait
//  attribuée au mauvais club chez nous.
// ============================================================
function _syncCotes(PDO $db, int $saisonId): void {
    $stmt = $db->prepare("
        SELECT id, apf_fixture_id
        FROM matches
        WHERE saison_id = ? AND statut = 'a_venir' AND apf_fixture_id IS NOT NULL
        AND domicile_verrouille = 0
    ");
    $stmt->execute([$saisonId]);
    $matchsAVenir = $stmt->fetchAll();

    if (empty($matchsAVenir)) {
        _log("  → Aucun match à venir, rien à récupérer.");
        return;
    }

    $mapFixtureVersMatch = [];
    foreach ($matchsAVenir as $m) {
        $mapFixtureVersMatch[(int)$m['apf_fixture_id']] = (int)$m['id'];
    }
    $restants = $mapFixtureVersMatch; // copie, on retire au fur et à mesure des trouvailles

    $stmt = $db->prepare('SELECT annee_debut FROM saisons WHERE id = ?');
    $stmt->execute([$saisonId]);
    $annee = (int)$stmt->fetchColumn();

    // /odds est paginé — on enchaîne les pages jusqu'à avoir couvert tous
    // nos matchs à venir, ou jusqu'à un plafond de sécurité (10 pages),
    // même principe que /players/topscorers dans _syncStats().
    $page       = 1;
    $totalPages = 1;
    $traites    = 0;

    do {
        $url = 'https://v3.football.api-sports.io/odds?' . http_build_query([
            'league' => API_FOOTBALL_LIGUE1_ID,
            'season' => $annee,
            'page'   => $page,
        ]);
        $data = _apiFootballCall($url);

        if ($data === null || !isset($data['response'])) {
            _logErreur("Cotes bookmakers : échec de l'appel API-Football (page $page)");
            return;
        }

        $totalPages = (int)($data['paging']['total'] ?? 1);

        foreach ($data['response'] as $entry) {
            $fixtureId = (int)($entry['fixture']['id'] ?? 0);
            $matchId   = $mapFixtureVersMatch[$fixtureId] ?? null;
            if (!$matchId) continue; // pas un de nos matchs à venir

            [$cDom, $cNul, $cExt, $nbBookmakers] = _moyenneCotes1N2($entry);
            if ($cDom === null) continue; // marché "Match Winner" pas encore publié pour ce match

            $db->prepare('
                INSERT INTO cotes_matchs (match_id, saison_id, cote_dom_api, cote_nul_api, cote_ext_api, nb_bookmakers_api, cote_api_maj_le)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    cote_dom_api      = VALUES(cote_dom_api),
                    cote_nul_api      = VALUES(cote_nul_api),
                    cote_ext_api      = VALUES(cote_ext_api),
                    nb_bookmakers_api = VALUES(nb_bookmakers_api),
                    cote_api_maj_le   = NOW()
            ')->execute([$matchId, $saisonId, $cDom, $cNul, $cExt, $nbBookmakers]);

            unset($restants[$fixtureId]);
            $traites++;
        }

        $page++;
        if ($page <= $totalPages && !empty($restants)) usleep(200000);

    } while ($page <= $totalPages && $page <= 10 && !empty($restants));

    $enAttente = count($restants);
    _log("  → $traites match(s) mis à jour" . ($enAttente ? ", $enAttente sans cote disponible pour le moment (normal si loin du coup d'envoi)." : "."));
}

// Moyenne des cotes 1/N/2 ("Match Winner") tous bookmakers confondus,
// pour une entrée de la réponse /odds (un fixture). Retourne
// [cote_dom, cote_nul, cote_ext, nb_bookmakers] — cote_dom = null si le
// marché "Match Winner" est absent (rien à moyenner).
function _moyenneCotes1N2(array $entry): array {
    $sommeDom = 0.0; $sommeNul = 0.0; $sommeExt = 0.0; $nb = 0;

    foreach (($entry['bookmakers'] ?? []) as $bk) {
        foreach (($bk['bets'] ?? []) as $bet) {
            if (($bet['name'] ?? '') !== 'Match Winner') continue;

            $valeurs = [];
            foreach (($bet['values'] ?? []) as $v) {
                $valeurs[$v['value']] = (float)$v['odd'];
            }
            if (isset($valeurs['Home'], $valeurs['Draw'], $valeurs['Away'])) {
                $sommeDom += $valeurs['Home'];
                $sommeNul += $valeurs['Draw'];
                $sommeExt += $valeurs['Away'];
                $nb++;
            }
            break; // un seul marché "Match Winner" par bookmaker, inutile de continuer
        }
    }

    if ($nb === 0) return [null, null, null, 0];

    return [round($sommeDom / $nb, 2), round($sommeNul / $nb, 2), round($sommeExt / $nb, 2), $nb];
}

function _syncStats(PDO $db, int $saisonId): void {
    $stmt = $db->prepare('SELECT annee_debut FROM saisons WHERE id = ?');
    $stmt->execute([$saisonId]);
    $annee = (int)$stmt->fetchColumn();

    // Charger la correspondance clubs (apf_id → id) UNE SEULE FOIS,
    // au lieu d'une requête par joueur dans la boucle
    $clubs = $db->prepare('SELECT id, apf_id FROM clubs WHERE saison_id = ?');
    $clubs->execute([$saisonId]);
    $map_clubs = [];
    foreach ($clubs->fetchAll() as $c) {
        if ($c['apf_id']) $map_clubs[(int)$c['apf_id']] = (int)$c['id'];
    }

    $stmt = $db->prepare('
        INSERT INTO stats_joueurs (saison_id, club_id, apf_id, nom, buts, passes_d, matchs, penalites)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            club_id   = VALUES(club_id),
            nom       = VALUES(nom),
            buts      = VALUES(buts),
            passes_d  = VALUES(passes_d),
            matchs    = VALUES(matchs),
            penalites = VALUES(penalites)
    ');

    // ⚠️ /players/topscorers ne supporte PAS de pagination : le paramètre
    // "page" fait échouer la requête avec une erreur API ("The Page field
    // do not exist"), ce qui provoquait un échec silencieux à CHAQUE appel
    // (0 joueur synchronisé, quelle que soit la saison ou le nombre de buts
    // déjà marqués). Un seul appel suffit, l'endpoint renvoie directement
    // son classement (~20 joueurs, plafond fixé par l'API elle-même).
    $nbJoueurs = 0;
    $url = 'https://v3.football.api-sports.io/players/topscorers?' . http_build_query([
        'league' => API_FOOTBALL_LIGUE1_ID,
        'season' => $annee,
    ]);
    $data = _apiFootballCall($url);

    if ($data === null || !isset($data['response'])) {
        _logErreur("Sync buteurs/passeurs : échec API");
    } else {
        foreach ($data['response'] as $entry) {
            $joueur = $entry['player'] ?? null;
            $stats  = $entry['statistics'][0] ?? null;
            if (!$joueur || !$stats) continue;

            $apfTeamId = (int)($stats['team']['id'] ?? 0);
            $club_id   = $map_clubs[$apfTeamId] ?? null;

            $stmt->execute([
                $saisonId, $club_id,
                $joueur['id']                       ?? null,
                $joueur['name']                     ?? 'Inconnu',
                $stats['goals']['total']            ?? 0,
                $stats['goals']['assists']          ?? 0,
                $stats['games']['appearences']      ?? 0,
                $stats['penalty']['scored']         ?? 0,
            ]);
            $nbJoueurs++;
        }
    }

    _log("  → $nbJoueurs joueur(s) synchronisé(s) (buteurs/passeurs).");
}

// _convertirStatut() (football-data.org) a été retirée d'ici : remplacée
// par _convertirStatutApf() dans utils.php, partagée avec matches.php.

function _log(string $msg): void {
    $ligne = date('[H:i:s]') . " $msg\n";
    echo $ligne;

    if (!is_dir(CRON_LOG_DIR)) {
        @mkdir(CRON_LOG_DIR, 0755, true);
    }
    $fichier = CRON_LOG_DIR . '/cron_' . date('Y-m-d') . '.log';
    @file_put_contents($fichier, $ligne, FILE_APPEND);
}

// Comme _log(), mais garde aussi le message en mémoire pour l'email
// d'alerte envoyé en fin de script s'il y a eu au moins une erreur.
function _logErreur(string $msg): void {
    _log("⚠️ $msg");
    $GLOBALS['_cronErreurs'][] = $msg;
}

// Supprime les fichiers de log de plus de 30 jours, pour ne pas
// accumuler indéfiniment des fichiers sur le NAS.
function _nettoyerVieuxLogs(int $joursConserves = 30): void {
    if (!is_dir(CRON_LOG_DIR)) return;
    foreach (glob(CRON_LOG_DIR . '/cron_*.log') ?: [] as $f) {
        if (filemtime($f) < strtotime("-{$joursConserves} days")) {
            @unlink($f);
        }
    }
}

// Envoie un seul email groupé aux admins listant les erreurs
// rencontrées pendant ce passage de cron (même principe que
// l'alerte mercato ci-dessous).
function _envoyerAlerteErreursCron(PDO $db, array $erreurs): void {
    $sujet = 'Prono-L1 — Erreur(s) dans la synchro automatique';
    $corps = "Le cron de synchronisation a rencontré " . count($erreurs) . " erreur(s) le " . date('d/m/Y à H:i') . " :\n\n"
           . implode("\n", array_map(fn($e) => "▸ $e", $erreurs))
           . "\n\nDétail complet dans le fichier de log du jour (api/logs/cron_" . date('Y-m-d') . ".log).";

    require_once __DIR__ . '/smtp_mailer.php';

    $admins = $db->query("SELECT email FROM users WHERE is_admin = 1 AND email IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($admins as $email) {
        $ok = envoyerEmailSMTP($email, $sujet, $corps);
        _log("  → Email d'alerte erreur envoyé à $email : " . ($ok ? 'OK' : 'ÉCHEC'));
    }
}

// ============================================================
//  Veille des matchs reportés — revérifie 1x/jour chaque match au
//  statut 'reporte' pour voir si API-Football a publié une nouvelle
//  date (ou un résultat, si le match a déjà eu lieu entre-temps).
//  Sans ça, ces matchs restent bloqués en base pour toujours (voir
//  ÉTAPE 1, qui les exclut volontairement).
// ============================================================
function _verifierMatchsReportes(PDO $db, int $saisonId): void {
    $stmt = $db->prepare("SELECT id, apf_fixture_id, journee FROM matches WHERE saison_id = ? AND statut = 'reporte'");
    $stmt->execute([$saisonId]);
    $reportes = $stmt->fetchAll();

    if (empty($reportes)) {
        _log("Veille matchs reportés : aucun match reporté en base, rien à faire.");
        return;
    }

    _log("Veille matchs reportés : vérification de " . count($reportes) . " match(s)...");
    $changes = 0;

    foreach ($reportes as $match) {
        if (!$match['apf_fixture_id']) {
            _logErreur("Veille reportés : match id={$match['id']} (J{$match['journee']}) sans apf_fixture_id, ignoré");
            continue;
        }

        $data = _apiFootballCall('https://v3.football.api-sports.io/fixtures?id=' . $match['apf_fixture_id']);
        $fx   = $data['response'][0] ?? null;

        if (!$fx) {
            _logErreur("Veille reportés : apf_fixture_id={$match['apf_fixture_id']} (J{$match['journee']}) : échec API ou fixture introuvable");
            usleep(300000);
            continue;
        }

        $statut    = _convertirStatutApf($fx['fixture']['status']['short'] ?? '');
        $score_dom = $fx['goals']['home'] ?? null;
        $score_ext = $fx['goals']['away'] ?? null;
        $journee   = _extraireJourneeApf($fx['league']['round'] ?? '') ?? $match['journee'];
        $date_utc  = !empty($fx['fixture']['date']) ? gmdate('Y-m-d H:i:s', strtotime($fx['fixture']['date'])) : null;

        if ($statut !== 'reporte' && $date_utc) {
            _log("  → Match apf_fixture_id={$match['apf_fixture_id']} : nouveau statut '$statut' détecté (nouvelle date : $date_utc).");
            appliquerMajMatch($db, (int)$match['id'], (int)$journee, $date_utc, $score_dom, $score_ext, $statut);
            $changes++;

            if ($statut === 'termine' && $score_dom !== null) {
                calculerPointsMatch($db, (int)$match['id']);
                // Notification : voir l'appel groupé envoyerNotificationsGroupees()
                // en fin de script, qui couvrira ce match comme tous les autres.
            }
        }

        usleep(300000); // pause légère, politesse envers l'API
    }

    _log("Veille matchs reportés : $changes changement(s) appliqué(s).");

    if ($changes > 0) {
        verifierChampionsJournee($db, $saisonId);
    }
}

// ============================================================
//  Veille des changements de programmation TV — revérifie 1x/jour
//  tous les matchs 'a_venir' dont le coup d'envoi est dans les 21
//  prochains jours (fenêtre où la Ligue confirme/ajuste les horaires
//  selon les diffuseurs). Si la date renvoyée par API-Football diffère
//  de celle en base, on corrige automatiquement et on envoie un email
//  récapitulatif aux admins — le statut reste 'a_venir' (ce n'est PAS
//  un report), donc sans cette veille le changement passerait inaperçu.
// ============================================================
function _verifierChangementsCalendrier(PDO $db, int $saisonId): void {
    $stmt = $db->prepare('SELECT annee_debut FROM saisons WHERE id = ?');
    $stmt->execute([$saisonId]);
    $saison = (int)$stmt->fetchColumn();

    $depuis  = date('Y-m-d');
    $jusqua  = date('Y-m-d', strtotime('+21 days'));

    $url = 'https://v3.football.api-sports.io/fixtures?' . http_build_query([
        'league' => API_FOOTBALL_LIGUE1_ID,
        'season' => $saison,
        'from'   => $depuis,
        'to'     => $jusqua,
    ]);
    $data = _apiFootballCall($url);

    if ($data === null || !isset($data['response'])) {
        _logErreur("Veille calendrier TV : échec de l'appel API-Football");
        return;
    }

    if (empty($data['response'])) {
        _log("Veille calendrier TV : aucun match à venir dans les 21 prochains jours côté API.");
        return;
    }

    // Charge en une fois les matchs 'a_venir' de la fenêtre concernée,
    // avec noms des clubs pour l'email récapitulatif.
    $stmt = $db->prepare("
        SELECT m.id, m.apf_fixture_id, m.journee, m.date,
               m.club_dom_id, m.club_ext_id, m.domicile_verrouille,
               cd.nom_court AS nom_dom, ce.nom_court AS nom_ext
        FROM matches m
        JOIN clubs cd ON cd.id = m.club_dom_id
        JOIN clubs ce ON ce.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.statut = 'a_venir'
        AND m.apf_fixture_id IS NOT NULL
    ");
    $stmt->execute([$saisonId]);
    $mapMatchs = [];
    foreach ($stmt->fetchAll() as $m) {
        $mapMatchs[(int)$m['apf_fixture_id']] = $m;
    }

    $changements = [];

    foreach ($data['response'] as $fx) {
        $apfId = (int)($fx['fixture']['id'] ?? 0);
        if (!$apfId || !isset($mapMatchs[$apfId])) continue;

        $match = $mapMatchs[$apfId];

        // Changement d'horaire (cas déjà géré auparavant)
        $nouvelleDate = !empty($fx['fixture']['date']) ? gmdate('Y-m-d H:i:s', strtotime($fx['fixture']['date'])) : null;
        $dateChangee  = $nouvelleDate && $nouvelleDate !== $match['date'];

        // Changement domicile/extérieur (ex : inversion décidée par la LFP,
        // pelouse impraticable...) — indépendant d'un changement d'horaire :
        // la date/heure peut rester identique, seul le sens du match change.
        // Un match verrouillé (domicile_verrouille = 1, correction manuelle
        // faite en avance sur l'API) n'est JAMAIS ré-inversé automatiquement
        // tant que l'API reste dans l'autre sens (vécu en prod le
        // 21/08/2026 avec PSG-Rennes : le cron avait annulé une correction
        // manuelle, redevenue incohérente avec des pronostics déjà saisis).
        // En revanche, si l'API a fini par confirmer le MÊME sens que notre
        // verrou, celui-ci n'a plus lieu d'être : on le lève automatiquement
        // (sinon les cotes bookmakers resteraient bloquées indéfiniment,
        // _syncCotes excluant tout match verrouillé).
        $idDomApf = (int)($fx['teams']['home']['id'] ?? 0);
        $idExtApf = (int)($fx['teams']['away']['id'] ?? 0);
        $clubsInverses  = false;
        $verrouLeve     = false;
        $nouveauClubDom = null;
        $nouveauClubExt = null;
        if ($idDomApf && $idExtApf) {
            $nouveauClubDom = _trouverClubApf($db, $idDomApf, $fx['teams']['home']['name'] ?? '', $saisonId);
            $nouveauClubExt = _trouverClubApf($db, $idExtApf, $fx['teams']['away']['name'] ?? '', $saisonId);
            $memeSens = $nouveauClubDom && $nouveauClubExt
                && (int)$match['club_dom_id'] === $nouveauClubDom && (int)$match['club_ext_id'] === $nouveauClubExt;

            if ((int)$match['domicile_verrouille']) {
                if ($memeSens) {
                    $db->prepare('UPDATE matches SET domicile_verrouille = 0 WHERE id = ?')->execute([(int)$match['id']]);
                    $verrouLeve = true;
                    _log("  → Verrou domicile/extérieur levé automatiquement J{$match['journee']} {$match['nom_dom']}-{$match['nom_ext']} (match id={$match['id']}) — l'API confirme désormais le même sens, cotes bookmakers de nouveau synchronisées.");
                }
                // Sinon : toujours verrouillé et toujours en désaccord avec
                // l'API → on ne touche à rien, comme avant.
            } elseif ($nouveauClubDom && $nouveauClubExt && !$memeSens) {
                $clubsInverses = true;
            }
        }

        if (!$dateChangee && !$clubsInverses && !$verrouLeve) continue; // rien à faire pour ce match

        $journee = _extraireJourneeApf($fx['league']['round'] ?? '') ?? (int)$match['journee'];
        $statut  = _convertirStatutApf($fx['fixture']['status']['short'] ?? 'NS'); // reste normalement 'a_venir'

        appliquerMajMatch($db, (int)$match['id'], (int)$journee, $dateChangee ? $nouvelleDate : $match['date'], null, null, $statut);

        $detail = [
            'journee' => $match['journee'],
            'clubs'   => "{$match['nom_dom']} - {$match['nom_ext']}",
        ];

        if ($dateChangee) {
            $detail['horaire'] = [
                'ancienne' => date('d/m/Y H:i', strtotime($match['date'])),
                'nouvelle' => date('d/m/Y H:i', strtotime($nouvelleDate)),
            ];
            _log("  → Changement d'horaire J{$match['journee']} {$match['nom_dom']}-{$match['nom_ext']} : {$match['date']} → {$nouvelleDate}");
        }

        if ($verrouLeve) {
            $detail['verrou_leve'] = true;
        }

        if ($clubsInverses) {
            // On corrige tout de suite domicile/extérieur en base — mais on
            // NE touche PAS aux pronostics/cotes déjà enregistrés sur ce
            // match, qui référencent l'ancien sens : on se contente de
            // compter combien il y en a pour que l'admin les vérifie/
            // supprime lui-même (voir email ci-dessous).
            $db->prepare('UPDATE matches SET club_dom_id = ?, club_ext_id = ? WHERE id = ?')
               ->execute([$nouveauClubDom, $nouveauClubExt, (int)$match['id']]);

            $stmtP = $db->prepare('SELECT COUNT(*) FROM pronostics WHERE match_id = ?');
            $stmtP->execute([(int)$match['id']]);
            $nbPronos = (int)$stmtP->fetchColumn();

            $stmtC = $db->prepare('SELECT COUNT(*) FROM cotes_matchs WHERE match_id = ?');
            $stmtC->execute([(int)$match['id']]);
            $nbCotes = (int)$stmtC->fetchColumn();

            $detail['inversion'] = ['nb_pronos' => $nbPronos, 'nb_cotes' => $nbCotes];

            _log("  → Inversion domicile/extérieur J{$match['journee']} {$match['nom_dom']}-{$match['nom_ext']} (match id={$match['id']}) — {$nbPronos} pronostic(s), {$nbCotes} cote(s) à vérifier");
        }

        $changements[] = $detail;

        usleep(100000); // pause légère, politesse envers l'API (pas d'appel ici, juste par cohérence entre itérations)
    }

    if (empty($changements)) {
        _log("Veille calendrier TV : aucun changement de programmation détecté.");
        return;
    }

    _log("Veille calendrier TV : " . count($changements) . " changement(s) détecté(s) et appliqué(s).");
    _envoyerAlerteCalendrier($db, $changements);
}

function _envoyerAlerteCalendrier(PDO $db, array $changements): void {
    $inversionPresente = false;

    $lignes = array_map(function ($c) use (&$inversionPresente) {
        $l = "▸ J{$c['journee']} — {$c['clubs']}";

        if (!empty($c['horaire'])) {
            $l .= " : {$c['horaire']['ancienne']} → {$c['horaire']['nouvelle']} (heure française à ajuster selon fuseau)";
        }

        if (!empty($c['inversion'])) {
            $inversionPresente = true;
            $nbPronos = $c['inversion']['nb_pronos'];
            $nbCotes  = $c['inversion']['nb_cotes'];
            $l .= ($l !== "▸ J{$c['journee']} — {$c['clubs']}" ? ' | ' : ' : ')
                . "⚠️ DOMICILE/EXTÉRIEUR INVERSÉ (corrigé automatiquement en base). "
                . ($nbPronos > 0 ? "{$nbPronos} pronostic(s) existant(s)" : "aucun pronostic existant")
                . " et "
                . ($nbCotes > 0 ? "{$nbCotes} ligne(s) de cotes existante(s)" : "aucune cote existante")
                . " à vérifier/supprimer manuellement.";
        }

        if (!empty($c['verrou_leve'])) {
            $l .= ($l !== "▸ J{$c['journee']} — {$c['clubs']}" ? ' | ' : ' : ')
                . "🔓 Verrou domicile/extérieur levé automatiquement — l'API confirme désormais le même sens que la correction manuelle. Les cotes bookmakers vont se remettre à jour normalement, rien à faire.";
        }

        return $l;
    }, $changements);

    $sujet = $inversionPresente
        ? 'Prono-L1 — Inversion et/ou changement de programmation détecté(s) — action requise'
        : 'Prono-L1 — Changement(s) de programmation TV détecté(s)';

    $corps = "La Ligue 1 a modifié la programmation de " . count($changements) . " match(s) :\n\n"
           . implode("\n", $lignes)
           . "\n\nLes horaires et le sens domicile/extérieur sont déjà à jour en base, aucune action nécessaire pour ça."
           . ($inversionPresente
                ? "\n\nEn revanche, pour le(s) match(s) marqué(s) \"DOMICILE/EXTÉRIEUR INVERSÉ\" ci-dessus, vérifiez et supprimez si besoin les pronostics et/ou cotes déjà enregistrés sur ces matchs (ils référencent encore l'ancien sens domicile/extérieur)."
                : '');

    require_once __DIR__ . '/smtp_mailer.php';

    $admins = $db->query("SELECT email FROM users WHERE is_admin = 1 AND email IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($admins as $email) {
        $ok = envoyerEmailSMTP($email, $sujet, $corps);
        _log("  → Email calendrier TV envoyé à $email : " . ($ok ? 'OK' : 'ÉCHEC'));
    }
}

// ============================================================
//  Veille mercato — vérifie les effectifs des clubs d'une saison
//  "futur" (avant-saison) ET la saison "en_cours" (mercato hivernal,
//  arrivées de dernière minute en cours de saison), et alerte l'admin
//  par email en cas de changement. Ne fait rien pour une saison donnée
//  si ses clubs n'ont pas encore été synchronisés une 1ère fois (pas
//  d'apf_id → rien à comparer).
// ============================================================
function _verifierMercato(PDO $db): void {
    // 'en_cours' avant 'futur' : c'est la saison la plus susceptible
    // d'avoir des changements pertinents pour l'app (compositions,
    // effectifs affichés aux joueurs dès maintenant).
    $stmt = $db->query("SELECT id, label FROM saisons WHERE statut IN ('en_cours', 'futur') ORDER BY FIELD(statut, 'en_cours', 'futur')");
    $saisonsACheckerMercato = $stmt->fetchAll();

    if (empty($saisonsACheckerMercato)) {
        _log("Veille mercato : aucune saison 'en_cours' ou 'futur' enregistrée, rien à faire.");
        return;
    }

    foreach ($saisonsACheckerMercato as $saison) {
        _verifierMercatoPourSaison($db, $saison);
    }
}

function _verifierMercatoPourSaison(PDO $db, array $saison): void {
    $stmt = $db->prepare('SELECT * FROM clubs WHERE saison_id = ? AND apf_id IS NOT NULL ORDER BY nom ASC');
    $stmt->execute([$saison['id']]);
    $clubs = $stmt->fetchAll();

    if (empty($clubs)) {
        _log("Veille mercato : saison '{$saison['label']}' pas encore peuplée (clubs non synchronisés), rien à faire.");
        return;
    }

    _log("Veille mercato : vérification de " . count($clubs) . " club(s) pour la saison '{$saison['label']}'...");

    $changements = [];
    foreach ($clubs as $club) {
        $r = syncEffectifAvecDiff($db, $club, $saison['id']);
        if ($r['erreur']) {
            _log("  → {$club['nom']} : erreur ({$r['erreur']})");
            continue;
        }
        if ($r['arrivees'] || $r['departs']) {
            $changements[$club['nom']] = $r;
            _log("  → {$club['nom']} : " . count($r['arrivees']) . " arrivée(s), " . count($r['departs']) . " départ(s)");
        }
        // Pause légère pour rester raisonnable vis-à-vis du quota API (18 clubs max)
        usleep(300000);
    }

    if (empty($changements)) {
        _log("Veille mercato : aucun changement détecté pour '{$saison['label']}'.");
        return;
    }

    _envoyerAlerteMercato($db, $saison['label'], $changements);
}

function _envoyerAlerteMercato(PDO $db, string $labelSaison, array $changements): void {
    $lignes = [];
    foreach ($changements as $nomClub => $r) {
        $lignes[] = "▸ $nomClub";
        foreach ($r['arrivees'] as $nom) $lignes[] = "    + Arrivée : $nom";
        foreach ($r['departs']  as $nom) $lignes[] = "    − Départ  : $nom";
    }

    $sujet = "Prono-L1 — Mouvements mercato détectés ($labelSaison)";
    $corps = "Des changements d'effectif ont été détectés pour la saison $labelSaison :\n\n"
           . implode("\n", $lignes)
           . "\n\nCes effectifs ont été mis à jour automatiquement dans la base.";

    require_once __DIR__ . '/smtp_mailer.php';

    $admins = $db->query("SELECT email FROM users WHERE is_admin = 1 AND email IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($admins as $email) {
        $ok = envoyerEmailSMTP($email, $sujet, $corps);
        _log("  → Email mercato envoyé à $email : " . ($ok ? 'OK' : 'ÉCHEC'));
    }
}
