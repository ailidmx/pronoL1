<?php
// ============================================================
//  PRONO-L1 — Stats joueurs (buteurs, passeurs) + H2H
//  Fichier : api/stats.php
//
//  Actions disponibles :
//  GET ?action=buteurs            → top buteurs de la saison
//  GET ?action=passeurs           → top passeurs de la saison
//  GET ?action=h2h&dom=X&ext=Y   → historique confrontations
//  GET ?action=forme&club_id=X   → 5 derniers matchs d'un club
//  GET ?action=forme_lot&club_ids=1,2,3 → forme de plusieurs clubs en 1 appel
//  POST ?action=sync_stats        → reconstruit buteurs/passeurs (admin)
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=buteurs&limit=X
// ============================================================
if ($method === 'GET' && $action === 'buteurs') {
    $saisonId = saisonDepuisRequete($db);
    $limit = intval($_GET['limit'] ?? 20);

    $stmt = $db->prepare('
        SELECT
            sj.nom, sj.buts, sj.passes_d, sj.matchs, sj.penalites,
            c.nom_court AS club, c.logo_url AS logo_club
        FROM stats_joueurs sj
        LEFT JOIN clubs c ON c.id = sj.club_id
        WHERE sj.saison_id = ? AND sj.buts > 0
        ORDER BY sj.buts DESC, sj.passes_d DESC, sj.nom ASC
        LIMIT ?
    ');
    $stmt->execute([$saisonId, $limit]);

    echo json_encode(['statut' => 'OK', 'buteurs' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  GET ?action=passeurs&limit=X
// ============================================================
elseif ($method === 'GET' && $action === 'passeurs') {
    $saisonId = saisonDepuisRequete($db);
    $limit = intval($_GET['limit'] ?? 20);

    $stmt = $db->prepare('
        SELECT
            sj.nom, sj.passes_d, sj.buts, sj.matchs,
            c.nom_court AS club, c.logo_url AS logo_club
        FROM stats_joueurs sj
        LEFT JOIN clubs c ON c.id = sj.club_id
        WHERE sj.saison_id = ? AND sj.passes_d > 0
        ORDER BY sj.passes_d DESC, sj.buts DESC, sj.nom ASC
        LIMIT ?
    ');
    $stmt->execute([$saisonId, $limit]);

    echo json_encode(['statut' => 'OK', 'passeurs' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  GET ?action=h2h&dom=X&ext=Y
//  Historique des confrontations entre 2 clubs
//  Cherche dans le cache d'abord, sinon calcule depuis la BDD
//  puis tente l'API-Football pour l'historique plus ancien
// ============================================================
elseif ($method === 'GET' && $action === 'h2h') {
    $club_dom_id = intval($_GET['dom'] ?? 0);
    $club_ext_id = intval($_GET['ext'] ?? 0);
    $limit       = intval($_GET['limit'] ?? 5);
    // venue : 'dom' (le club actuellement affiché à domicile recevait ce
    // jour-là), 'ext' (il jouait à l'extérieur), ou vide/absent = tous
    $venue       = in_array($_GET['venue'] ?? '', ['dom', 'ext'], true) ? $_GET['venue'] : null;

    if (!$club_dom_id || !$club_ext_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Clubs manquants']);
        exit();
    }

    // Clé de cache (distincte par filtre domicile/extérieur)
    $cle_cache = "h2hv2_{$club_dom_id}_{$club_ext_id}_" . ($venue ?? 'tous');

    // Vérifier cache (valide 24h)
    try {
        $stmt = $db->prepare('SELECT valeur FROM cache_api WHERE cle = ? AND expire_at > NOW()');
        $stmt->execute([$cle_cache]);
        $cache = $stmt->fetch();
        if ($cache) {
            echo $cache['valeur'];
            exit();
        }
    } catch (Exception $e) { /* cache miss */ }

    // Récupérer les matchs en BDD (toutes saisons confondues) — la
    // condition WHERE change selon le filtre domicile/extérieur demandé :
    // sans filtre, les 2 sens de confrontation ; avec filtre, un seul sens
    // (seulement les matchs où le club de référence jouait à domicile, ou
    // à l'extérieur).
    if ($venue === 'dom') {
        $where  = 'm.club_dom_id = ? AND m.club_ext_id = ?';
        $params = [$club_dom_id, $club_ext_id];
    } elseif ($venue === 'ext') {
        $where  = 'm.club_dom_id = ? AND m.club_ext_id = ?';
        $params = [$club_ext_id, $club_dom_id];
    } else {
        $where  = '((m.club_dom_id = ? AND m.club_ext_id = ?) OR (m.club_dom_id = ? AND m.club_ext_id = ?))';
        $params = [$club_dom_id, $club_ext_id, $club_ext_id, $club_dom_id];
    }

    $stmt = $db->prepare("
        SELECT
            m.id, m.apf_fixture_id, m.date, m.score_dom, m.score_ext, m.journee,
            m.club_dom_id, m.club_ext_id,
            s.label AS saison,
            c1.nom_court AS nom_dom, c1.logo_url AS logo_dom,
            c2.nom_court AS nom_ext, c2.logo_url AS logo_ext
        FROM matches m
        JOIN saisons s  ON s.id  = m.saison_id
        JOIN clubs   c1 ON c1.id = m.club_dom_id
        JOIN clubs   c2 ON c2.id = m.club_ext_id
        WHERE m.statut = 'termine'
        AND $where
        ORDER BY m.date DESC
        LIMIT ?
    ");
    $stmt->execute([...$params, $limit]);
    $matchs_bdd = $stmt->fetchAll();

    // Si moins de résultats en BDD → compléter avec le H2H API-Football
    $h2h = $matchs_bdd;
    if (count($matchs_bdd) < $limit) {
        // Récupérer les apf_id des deux clubs
        $stmt_dom = $db->prepare('SELECT apf_id, nom_court FROM clubs WHERE id = ?');
        $stmt_dom->execute([$club_dom_id]);
        $club_dom = $stmt_dom->fetch();

        $stmt_ext = $db->prepare('SELECT apf_id, nom_court FROM clubs WHERE id = ?');
        $stmt_ext->execute([$club_ext_id]);
        $club_ext = $stmt_ext->fetch();

        if ($club_dom['apf_id'] && $club_ext['apf_id']) {
            $api_data = _fetchH2HFromAPF((int)$club_dom['apf_id'], (int)$club_ext['apf_id'], $limit, $club_dom_id, $club_ext_id, $venue, $club_dom['nom_court'], $club_ext['nom_court']);
            if (!empty($api_data)) {
                // Fusionner en évitant les doublons — dédoublonnage par DATE
                // (jour) plutôt que par apf_fixture_id : les anciennes lignes
                // en base (saisons passées, jamais retouchées par la migration
                // API-Football) n'ont pas cet identifiant renseigné, donc un
                // dédoublonnage par apf_fixture_id les laisserait passer en
                // double. Deux mêmes clubs ne se rencontrent jamais 2 fois le
                // même jour — la date seule suffit à identifier le match de
                // façon fiable, avec ou sans apf_fixture_id.
                $joursDejaVus = array_map(fn($m) => substr($m['date'], 0, 10), $matchs_bdd);
                foreach ($api_data as $m) {
                    if (!in_array(substr($m['date'], 0, 10), $joursDejaVus)) {
                        $h2h[] = $m;
                        $joursDejaVus[] = substr($m['date'], 0, 10);
                    }
                }
                // Retrier par date DESC et limiter
                usort($h2h, fn($a, $b) => strcmp($b['date'], $a['date']));
                $h2h = array_slice($h2h, 0, $limit);
            }
        }
    }

    $resultat = json_encode(['statut' => 'OK', 'h2h' => $h2h]);

    // Mettre en cache 24h
    try {
        $db->prepare('
            INSERT INTO cache_api (cle, valeur, expire_at)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
            ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), expire_at = VALUES(expire_at)
        ')->execute([$cle_cache, $resultat]);
    } catch (Exception $e) { /* cache write fail, pas grave */ }

    echo $resultat;
    exit();
}

// ============================================================
//  GET ?action=forme&club_id=X
//  5 derniers matchs d'un club (pour la page Pronostics)
//  Mis en cache 1h
// ============================================================
elseif ($method === 'GET' && $action === 'forme') {
    $club_id = intval($_GET['club_id'] ?? 0);
    if (!$club_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Club manquant']);
        exit();
    }

    $saisonId  = saisonDepuisRequete($db);
    $cle_cache = "forme_{$club_id}_{$saisonId}";

    // Vérifier cache 1h
    try {
        $stmt = $db->prepare('SELECT valeur FROM cache_api WHERE cle = ? AND expire_at > NOW()');
        $stmt->execute([$cle_cache]);
        $cache = $stmt->fetch();
        if ($cache) { echo $cache['valeur']; exit(); }
    } catch (Exception $e) {}

    $stmt = $db->prepare('
        SELECT
            m.score_dom, m.score_ext, m.date, m.club_dom_id,
            c1.nom_court AS nom_dom, c1.code AS code_dom,
            c2.nom_court AS nom_ext, c2.code AS code_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.statut = \'termine\'
        AND (m.club_dom_id = ? OR m.club_ext_id = ?)
        ORDER BY m.date DESC
        LIMIT 5
    ');
    $stmt->execute([$saisonId, $club_id, $club_id]);
    $matchs = $stmt->fetchAll();

    $forme = _construireFormeClub($matchs, $club_id);

    $resultat = json_encode(['statut' => 'OK', 'forme' => $forme]);

    try {
        $db->prepare('
            INSERT INTO cache_api (cle, valeur, expire_at)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
            ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), expire_at = VALUES(expire_at)
        ')->execute([$cle_cache, $resultat]);
    } catch (Exception $e) {}

    echo $resultat;
    exit();
}

// ============================================================
//  GET ?action=forme_lot&club_ids=1,2,3
//  Version groupée de "forme" : renvoie la forme de plusieurs clubs
//  en UN SEUL appel réseau au lieu d'un appel par club (jusqu'à 18
//  appels séparés en parallèle à chaque affichage d'une journée
//  complète de Ligue 1). Réutilise exactement le même cache 1h
//  (clé "forme_{club_id}_{saison_id}") que l'action "forme" ci-dessus
//  — les deux actions restent donc toujours cohérentes entre elles.
// ============================================================
elseif ($method === 'GET' && $action === 'forme_lot') {
    $clubIds = array_values(array_unique(array_filter(
        array_map('intval', explode(',', $_GET['club_ids'] ?? ''))
    )));
    if (empty($clubIds)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'club_ids manquant']);
        exit();
    }

    $saisonId = saisonDepuisRequete($db);
    $enCache  = [];

    // 1. Lire d'un coup tout ce qui est déjà en cache (1 requête au lieu de N)
    try {
        $cles = array_map(fn($id) => "forme_{$id}_{$saisonId}", $clubIds);
        $placeholders = implode(',', array_fill(0, count($cles), '?'));
        $stmt = $db->prepare("SELECT cle, valeur FROM cache_api WHERE cle IN ($placeholders) AND expire_at > NOW()");
        $stmt->execute($cles);
        foreach ($stmt->fetchAll() as $row) {
            // cle = "forme_{club_id}_{saison_id}" → le 2e segment est le club_id
            $segments = explode('_', $row['cle']);
            $clubIdCache = (int)($segments[1] ?? 0);
            $decode = json_decode($row['valeur'], true);
            $enCache[$clubIdCache] = $decode['forme'] ?? [];
        }
    } catch (Exception $e) { /* cache miss global, pas grave */ }

    // 2. Calculer (et mettre en cache au passage) uniquement ce qui manque
    $resultat = [];
    foreach ($clubIds as $clubId) {
        if (array_key_exists($clubId, $enCache)) {
            $resultat[$clubId] = $enCache[$clubId];
        } else {
            $calcule = precalculerFormeClub($db, $clubId, $saisonId);
            $resultat[$clubId] = $calcule['forme'] ?? [];
        }
    }

    echo json_encode(['statut' => 'OK', 'forme' => $resultat]);
    exit();
}

// ============================================================
//  GET ?action=match_stats&match_id=X — statistiques du match
//  (possession, tirs, corners, cartons, etc.), affichées sous
//  l'onglet "Stats" de la carte match. Disponible uniquement à
//  partir du coup d'envoi (rempli en direct par l'API, figé une
//  fois le match terminé). Cache permanent en base, comme les
//  compositions.
// ============================================================
elseif ($method === 'GET' && $action === 'match_stats') {
    $matchId = (int)($_GET['match_id'] ?? 0);
    if (!$matchId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'match_id requis']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT m.id, m.date, m.statut, m.apf_fixture_id,
               m.club_dom_id, m.club_ext_id,
               cd.apf_id AS apf_dom, cd.nom AS nom_dom,
               ce.apf_id AS apf_ext, ce.nom AS nom_ext
        FROM matches m
        JOIN clubs cd ON cd.id = m.club_dom_id
        JOIN clubs ce ON ce.id = m.club_ext_id
        WHERE m.id = ?
    ');
    $stmt->execute([$matchId]);
    $match = $stmt->fetch();

    if (!$match) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Match introuvable']);
        exit();
    }

    // Rien à demander à l'API avant le coup d'envoi
    if ($match['statut'] === 'a_venir') {
        echo json_encode(['statut' => 'OK', 'disponible' => false]);
        exit();
    }

    $stats = _lireMatchStatsEnCache($db, $matchId);

    // Cache pas encore "finalisé" : soit jamais synchronisé (buts/cartons
    // NULL — matchs mis en cache avant l'ajout de ces fonctionnalités),
    // soit synchronisé mais pas encore de façon définitive (finalise=0 —
    // match encore en direct au moment de la dernière synchro, ou
    // recontrôle tombé pendant un temps additionnel prolongé). Voir
    // _syncMatchStats().
    $stmtNonFinalise = $db->prepare('SELECT COUNT(*) FROM match_stats WHERE match_id = ? AND (buts IS NULL OR cartons IS NULL OR finalise = 0)');
    $stmtNonFinalise->execute([$matchId]);
    $nonFinalise = (int)$stmtNonFinalise->fetchColumn();

    // Cache incomplet, ou pas encore finalisé alors que le match est
    // maintenant terminé, ou match toujours en direct (rafraîchi à chaque
    // consultation, comme pour l'onglet Compos) → on (re)synchronise.
    if (count($stats) < 2 || $match['statut'] === 'en_cours' || ($nonFinalise > 0 && $match['statut'] === 'termine')) {
        $fixtureId = $match['apf_fixture_id'];

        if (!$fixtureId && $match['apf_dom']) {
            $fixtureId = _resoudreFixtureId($match);
            if ($fixtureId) {
                $db->prepare('UPDATE matches SET apf_fixture_id = ? WHERE id = ?')
                   ->execute([$fixtureId, $matchId]);
            }
        }

        if ($fixtureId) {
            _syncMatchStats($db, $matchId, $fixtureId, $match['club_dom_id'], $match['club_ext_id'], $match['statut'] === 'termine');
            $stats = _lireMatchStatsEnCache($db, $matchId);
        }
    }

    echo json_encode([
        'statut'     => 'OK',
        'disponible' => count($stats) === 2,
        'dom' => [
            'nom'     => $match['nom_dom'],
            'stats'   => $stats[$match['club_dom_id']]['stats'] ?? null,
            'buts'    => $stats[$match['club_dom_id']]['buts'] ?? [],
            'cartons' => $stats[$match['club_dom_id']]['cartons'] ?? [],
        ],
        'ext' => [
            'nom'     => $match['nom_ext'],
            'stats'   => $stats[$match['club_ext_id']]['stats'] ?? null,
            'buts'    => $stats[$match['club_ext_id']]['buts'] ?? [],
            'cartons' => $stats[$match['club_ext_id']]['cartons'] ?? [],
        ],
    ]);
    exit();
}

// ============================================================
//  POST ?action=sync_stats — reconstruit les stats individuelles
//  (buteurs/passeurs/pénalties) — admin
//  Ancienne version : appelait /players/topscorers (liste tronquée
//  aux ~20 meilleurs buteurs de L1, peu fiable en tout début de
//  saison et absente pour les purs passeurs — sans compter le bug de
//  pagination de cet endpoint, qui provoque une erreur silencieuse
//  au-delà de la page 1).
//  Nouvelle version : délègue à rafraichirStatsJoueurs() (utils.php),
//  qui reconstruit tout à partir des compositions enrichies match par
//  match — même mécanisme que la colonne "Pen" du classement équipes.
//  Ce bouton sert surtout de rattrapage manuel immédiat (le
//  rafraîchissement automatique se fait déjà à chaque match qui se
//  termine, via appliquerMajMatch()).
// ============================================================
elseif ($method === 'POST' && $action === 'sync_stats') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data); // ⚠️ ne PAS utiliser saisonDemandee() directement ici : retombe silencieusement sur 'en_cours' si saison_id absent (cf. saison 'futur' hors saison active)

    rafraichirStatsJoueurs($db, $saisonId);

    $stmtCount = $db->prepare('SELECT COUNT(*) FROM stats_joueurs WHERE saison_id = ?');
    $stmtCount->execute([$saisonId]);
    $nbJoueurs = (int)$stmtCount->fetchColumn();

    echo json_encode([
        'statut'  => 'OK',
        'inseres' => $nbJoueurs,
        'message' => "Stats reconstruites ($nbJoueurs joueur(s))",
    ]);
    exit();
}

// ============================================================
//  POST ?action=sync_journee_stats (admin)
//  Force la resynchro des stats de match (buts, cartons, stats
//  agrégées) pour TOUS les matchs terminés d'une journée en une
//  fois, au lieu d'attendre que chaque joueur ouvre individuellement
//  l'onglet Analyse de chaque match (seul déclencheur habituel de
//  _syncMatchStats). Les tendances (api/tendances.php) ne sont pas
//  concernées : elles sont toujours calculées en direct depuis les
//  matchs déjà en base, jamais mises en cache — rien à forcer là-bas.
// ============================================================
elseif ($method === 'POST' && $action === 'sync_journee_stats') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);
    $journee  = intval($data['journee'] ?? 0);
    if (!$journee) {
        http_response_code(400);
        echo json_encode(['erreur' => 'journee manquante']);
        exit();
    }

    $stmt = $db->prepare("
        SELECT m.id, m.apf_fixture_id, m.date, m.club_dom_id, m.club_ext_id, cd.apf_id AS apf_dom
        FROM matches m
        JOIN clubs cd ON cd.id = m.club_dom_id
        WHERE m.saison_id = ? AND m.journee = ? AND m.statut = 'termine'
    ");
    $stmt->execute([$saisonId, $journee]);
    $matchs = $stmt->fetchAll();

    if (empty($matchs)) {
        echo json_encode(['statut' => 'OK', 'nb_matchs' => 0, 'message' => "Aucun match terminé trouvé pour la journée $journee"]);
        exit();
    }

    $reussis = 0;
    $echecs  = [];
    foreach ($matchs as $m) {
        $fixtureId = $m['apf_fixture_id'] ?: _resoudreFixtureId($m);
        if (!$fixtureId) { $echecs[] = $m['id']; continue; }
        try {
            _syncMatchStats($db, (int)$m['id'], (int)$fixtureId, (int)$m['club_dom_id'], (int)$m['club_ext_id'], true);
            $reussis++;
        } catch (Exception $e) {
            $echecs[] = $m['id'];
        }
    }

    echo json_encode([
        'statut'    => 'OK',
        'journee'   => $journee,
        'nb_matchs' => count($matchs),
        'reussis'   => $reussis,
        'echecs'    => $echecs,
    ]);
    exit();
}

// ============================================================
//  GET ?action=debug_fixture&match_id=X — (admin) réponse brute
//  de l'API-Football pour un match, utile pour diagnostiquer un
//  souci de données (fixture mal résolu, événements manquants...)
// ============================================================
elseif ($method === 'GET' && $action === 'debug_fixture') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }

    $matchId = (int)($_GET['match_id'] ?? 0);
    $stmt = $db->prepare('
        SELECT m.id, m.date, m.apf_fixture_id,
               cd.nom AS nom_dom, cd.apf_id AS apf_dom,
               ce.nom AS nom_ext, ce.apf_id AS apf_ext
        FROM matches m
        JOIN clubs cd ON cd.id = m.club_dom_id
        JOIN clubs ce ON ce.id = m.club_ext_id
        WHERE m.id = ?
    ');
    $stmt->execute([$matchId]);
    $match = $stmt->fetch();
    if (!$match) { http_response_code(404); echo json_encode(['erreur' => 'Match introuvable']); exit(); }

    $fixtureId = $match['apf_fixture_id'] ?: _resoudreFixtureId($match);
    $fixtureInfo = $fixtureId ? _apiFootballCall('https://v3.football.api-sports.io/fixtures?id=' . $fixtureId) : null;
    $events      = $fixtureId ? _apiFootballCall('https://v3.football.api-sports.io/fixtures/events?fixture=' . $fixtureId) : null;

    echo json_encode([
        'statut'          => 'OK',
        'match_interne'   => $match,
        'fixture_id_utilise' => $fixtureId,
        'fixture_api'     => $fixtureInfo['response'][0] ?? null,
        'nb_events_total' => isset($events['response']) ? count($events['response']) : null,
        'events_bruts'    => $events['response'] ?? null,
    ], JSON_PRETTY_PRINT);
    exit();
}

// ============================================================
//  ACTION INCONNUE
// ============================================================
else {
    http_response_code(404);
    echo json_encode(['erreur' => 'Action inconnue']);
}

// ============================================================
//  FONCTIONS PRIVÉES — Statistiques de match (API-Football Pro)
// ============================================================

// Lit le cache DB, retourne un tableau [club_id => {stats:[...], buts:[...]}]
// _lireMatchStatsEnCache() et _syncMatchStats() ont été déplacées dans
// utils.php (déjà chargé ci-dessus) — réutilisées par cron_sync.php pour
// le recontrôle des minutes de but/carton ~90 min après le coup d'envoi
// (l'API-Football finalise parfois le temps additionnel d'un but après
// la synchro initiale faite à la fin du match).

// ============================================================
//  FONCTION PRIVÉE — H2H depuis API-Football
//  Utilise l'endpoint /fixtures/headtohead?h2h=idA-idB — appel direct
//  par apf_id des 2 clubs, plus besoin de trouver au préalable un
//  match existant entre eux (contrainte de l'ancienne implémentation
//  football-data.org, qui nécessitait un fd_id de match connu).
//  Toutes compétitions confondues (Coupe de France incluse), comme
//  le faisait déjà l'ancienne version.
// ============================================================
function _fetchH2HFromAPF(int $apf_dom, int $apf_ext, int $limit, int $club_dom_id, int $club_ext_id, ?string $venue = null, string $nomDomCourt = '', string $nomExtCourt = ''): array {
    // On demande plus de matchs bruts que $limit, car le paramètre "last"
    // de l'API compte toutes compétitions ET les deux sens confondus —
    // après filtrage Ligue 1 + éventuellement domicile/extérieur, il en
    // resterait sinon moins que $limit. Le filtre venue réduit encore le
    // vivier de moitié en moyenne, d'où un multiplicateur plus élevé.
    $data = _apiFootballCall('https://v3.football.api-sports.io/fixtures/headtohead?' . http_build_query([
        'h2h'  => "{$apf_dom}-{$apf_ext}",
        'last' => $venue ? min($limit * 6, 20) : min($limit * 3, 20),
    ]));

    if (empty($data['response'])) return [];

    $matchs = [];
    foreach ($data['response'] as $fx) {
        // Ne garder que la Ligue 1 — exclut Coupe de France, amicaux, etc.
        if ((int)($fx['league']['id'] ?? 0) !== API_FOOTBALL_LIGUE1_ID) continue;

        if (_convertirStatutApf($fx['fixture']['status']['short'] ?? '') !== 'termine') continue;

        $score_home = $fx['goals']['home'] ?? null;
        $score_away = $fx['goals']['away'] ?? null;
        if ($score_home === null || $score_away === null) continue;

        // Le club qui recevait CE jour-là n'est pas forcément celui qui
        // reçoit dans le match actuellement affiché. nom_dom/score_dom
        // reflètent TOUJOURS le véritable hôte historique du match (comme
        // pour les lignes issues de notre base) — seuls club_dom_id/
        // club_ext_id sont réorientés pour que le front puisse colorer
        // correctement les pastilles victoire/défaite du club de référence.
        //
        // On utilise NOS noms courts (nom_court, ex: "Brest", "PSG") plutôt
        // que le nom officiel brut renvoyé par l'API (ex: "Stade Brestois
        // 29", "Paris Saint Germain") — sinon les lignes venues de notre
        // base et celles complétées par l'API affichent des noms différents
        // dans la même liste, ce qui donne une incohérence visible
        // notamment quand une saison n'a pas encore de matchs en base
        // (2026-27) et que tout vient donc de l'API.
        $homeEtaitDom = (($fx['teams']['home']['id'] ?? null) == $apf_dom);

        // Filtre domicile/extérieur, du point de vue du club de référence
        // (apf_dom) : 'dom' = il recevait ce jour-là, 'ext' = il jouait
        // à l'extérieur.
        if ($venue === 'dom' && !$homeEtaitDom) continue;
        if ($venue === 'ext' && $homeEtaitDom) continue;

        $matchs[] = [
            'apf_fixture_id' => $fx['fixture']['id'],
            'date'           => !empty($fx['fixture']['date']) ? gmdate('Y-m-d H:i:s', strtotime($fx['fixture']['date'])) : null,
            'score_dom'      => $score_home,
            'score_ext'      => $score_away,
            'nom_dom'        => $homeEtaitDom ? $nomDomCourt : $nomExtCourt,
            'nom_ext'        => $homeEtaitDom ? $nomExtCourt : $nomDomCourt,
            'club_dom_id'    => $homeEtaitDom ? $club_dom_id : $club_ext_id,
            'club_ext_id'    => $homeEtaitDom ? $club_ext_id : $club_dom_id,
            'saison'         => (string)($fx['league']['season'] ?? ''),
            'source'         => 'apf',
        ];
    }

    usort($matchs, fn($a, $b) => strcmp($b['date'], $a['date']));
    return array_slice($matchs, 0, $limit);
}
