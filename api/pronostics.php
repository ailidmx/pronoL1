<?php
// ============================================================
//  PRONO-L1 — Pronostics des matchs
//  Fichier : api/pronostics.php
//  Adapté de CDM 2026
//
//  Actions disponibles :
//  POST ?action=saisir            → enregistrer/modifier un prono
//  POST ?action=effacer           → effacer un prono
//  GET  ?action=mes_pronos        → historique personnel
//  GET  ?action=match&match_id=X  → pronos de tous sur un match
//  GET  ?action=journee&journee=X → résumé pronos d'une journée
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();
$user   = verifierToken($db);

// ============================================================
//  POST ?action=saisir
//  Enregistre ou modifie un pronostic avant le coup d'envoi
// ============================================================
if ($method === 'POST' && $action === 'saisir') {
    $data      = json_decode(file_get_contents('php://input'), true);
    $match_id  = intval($data['match_id']  ?? 0);
    $score_dom = isset($data['score_dom']) ? intval($data['score_dom']) : null;
    $score_ext = isset($data['score_ext']) ? intval($data['score_ext']) : null;

    if (!$match_id || $score_dom === null || $score_ext === null) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Données manquantes']);
        exit();
    }
    if ($score_dom < 0 || $score_dom > 20 || $score_ext < 0 || $score_ext > 20) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Score invalide (0-20)']);
        exit();
    }

    // Vérifier que le match existe
    $stmt = $db->prepare('SELECT * FROM matches WHERE id = ?');
    $stmt->execute([$match_id]);
    $match = $stmt->fetch();

    if (!$match) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Match introuvable']);
        exit();
    }
    if (!saisonEstModifiable($db, (int)$match['saison_id'])) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Cette saison est archivée, les pronostics sont fermés']);
        exit();
    }
    if ($match['statut'] !== 'a_venir') {
        http_response_code(403);
        echo json_encode(['erreur' => 'Ce match est déjà commencé ou terminé']);
        exit();
    }

    // Vérification côté serveur : coup d'envoi pas encore passé
    $date_match = strtotime($match['date'] . ' UTC');
    if ($date_match <= time()) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Les pronostics sont fermés pour ce match']);
        exit();
    }

    $db->prepare('
        INSERT INTO pronostics (user_id, match_id, score_dom_pred, score_ext_pred)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            score_dom_pred = VALUES(score_dom_pred),
            score_ext_pred = VALUES(score_ext_pred),
            updated_at     = NOW()
    ')->execute([$user['id'], $match_id, $score_dom, $score_ext]);

    echo json_encode(['statut' => 'OK', 'message' => 'Pronostic enregistré']);
    exit();
}

// ============================================================
//  POST ?action=effacer
//  Efface un pronostic avant le coup d'envoi
// ============================================================
elseif ($method === 'POST' && $action === 'effacer') {
    $data     = json_decode(file_get_contents('php://input'), true);
    $match_id = intval($data['match_id'] ?? 0);

    if (!$match_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Match manquant']);
        exit();
    }

    $stmt = $db->prepare('SELECT statut, date, saison_id FROM matches WHERE id = ?');
    $stmt->execute([$match_id]);
    $match = $stmt->fetch();

    if (!$match || $match['statut'] !== 'a_venir') {
        http_response_code(403);
        echo json_encode(['erreur' => 'Impossible d\'effacer après le début du match']);
        exit();
    }
    if (!saisonEstModifiable($db, (int)$match['saison_id'])) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Cette saison est archivée, les pronostics sont fermés']);
        exit();
    }

    // Vérification côté serveur : coup d'envoi pas encore passé
    // (même contrôle que "saisir" — le statut en base peut avoir jusqu'à
    // 15 minutes de retard, le cron ne tournant que toutes les 15 min)
    if (strtotime($match['date'] . ' UTC') <= time()) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Les pronostics sont fermés pour ce match']);
        exit();
    }

    $db->prepare('DELETE FROM pronostics WHERE user_id = ? AND match_id = ?')
       ->execute([$user['id'], $match_id]);

    echo json_encode(['statut' => 'OK', 'message' => 'Pronostic effacé']);
    exit();
}

// ============================================================
//  GET ?action=mes_pronos
//  Historique complet des pronostics du joueur connecté
// ============================================================
elseif ($method === 'GET' && $action === 'mes_pronos') {
    $saisonId = saisonDepuisRequete($db);
    $journee = isset($_GET['journee']) ? intval($_GET['journee']) : null;

    $sql = '
        SELECT
            p.id, p.score_dom_pred, p.score_ext_pred,
            p.resultat, p.points,
            m.id AS match_id, m.journee, m.date, m.statut,
            m.score_dom, m.score_ext,
            c1.nom_court AS nom_dom, c1.code AS code_dom, c1.logo_url AS logo_dom,
            c2.nom_court AS nom_ext, c2.code AS code_ext, c2.logo_url AS logo_ext
        FROM pronostics p
        JOIN matches m  ON m.id  = p.match_id
        JOIN clubs   c1 ON c1.id = m.club_dom_id
        JOIN clubs   c2 ON c2.id = m.club_ext_id
        WHERE p.user_id = ? AND m.saison_id = ?
    ';
    $params = [$user['id'], $saisonId];

    if ($journee) {
        $sql .= ' AND m.journee = ?';
        $params[] = $journee;
    }

    $sql .= ' ORDER BY m.date ASC';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    echo json_encode([
        'statut'     => 'OK',
        'pronostics' => $stmt->fetchAll()
    ]);
    exit();
}

// ============================================================
//  GET ?action=match&match_id=X
//  Pronos de tous les joueurs sur un match
//  Masqués jusqu'au coup d'envoi, visibles après
// ============================================================
elseif ($method === 'GET' && $action === 'match') {
    $saisonId = saisonDepuisRequete($db);
    $match_id = intval($_GET['match_id'] ?? 0);
    if (!$match_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Match manquant']);
        exit();
    }

    $stmt = $db->prepare('SELECT statut, date FROM matches WHERE id = ? AND saison_id = ?');
    $stmt->execute([$match_id, $saisonId]);
    $match = $stmt->fetch();

    if (!$match) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Match introuvable']);
        exit();
    }

    // Pronos masqués tant que le match n'a pas réellement commencé.
    // On vérifie l'heure réelle en plus du statut en base, qui peut avoir
    // jusqu'à 15 minutes de retard (le cron ne tourne que toutes les 15 min).
    $aCommenceReellement = strtotime($match['date'] . ' UTC') <= time();
    if ($match['statut'] === 'a_venir' && !$aCommenceReellement) {
        // On indique juste combien de joueurs ont pronostiqué
        $stmt = $db->prepare('SELECT COUNT(*) AS nb FROM pronostics WHERE match_id = ?');
        $stmt->execute([$match_id]);
        $nb = $stmt->fetch()['nb'];

        echo json_encode([
            'statut'  => 'OK',
            'masques' => true,
            'nb'      => (int)$nb,
            'message' => 'Pronostics visibles après le coup d\'envoi'
        ]);
        exit();
    }

    // Après le coup d'envoi : on affiche tout
    $stmt = $db->prepare('
        SELECT
            p.score_dom_pred, p.score_ext_pred,
            p.resultat, p.points,
            u.nom, u.avatar_initiales AS initiales
        FROM pronostics p
        JOIN users u ON u.id = p.user_id
        WHERE p.match_id = ?
        ORDER BY p.points DESC, p.resultat ASC, u.nom ASC
    ');
    $stmt->execute([$match_id]);

    echo json_encode([
        'statut'     => 'OK',
        'masques'    => false,
        'pronostics' => $stmt->fetchAll()
    ]);
    exit();
}

// ============================================================
//  GET ?action=journee&journee=X
//  Résumé des pronos de tous les joueurs sur une journée
//  (tableau : joueur × match avec badge résultat)
//  Uniquement disponible après le début de la journée
// ============================================================
elseif ($method === 'GET' && $action === 'journee') {
    $saisonId = saisonDepuisRequete($db);
    $journee = intval($_GET['journee'] ?? 0);
    if (!$journee) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Journée manquante']);
        exit();
    }

    // Récupérer les matchs de la journée
    $stmt = $db->prepare('
        SELECT m.id, m.date, m.statut, m.score_dom, m.score_ext,
               c1.nom_court AS nom_dom, c2.nom_court AS nom_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.journee = ?
        ORDER BY m.date ASC
    ');
    $stmt->execute([$saisonId, $journee]);
    $matchs = $stmt->fetchAll();

    // Récupérer tous les pronostics de la journée (seulement matchs commencés)
    $stmt = $db->prepare('
        SELECT
            p.user_id, p.match_id,
            p.score_dom_pred, p.score_ext_pred,
            p.resultat, p.points,
            u.nom, u.avatar_initiales AS initiales
        FROM pronostics p
        JOIN users u ON u.id = p.user_id
        JOIN matches m ON m.id = p.match_id
        WHERE m.saison_id = ? AND m.journee = ?
        AND m.statut != \'a_venir\'
        ORDER BY u.nom ASC
    ');
    $stmt->execute([$saisonId, $journee]);
    $pronos = $stmt->fetchAll();

    // Organiser par user_id → match_id
    $par_joueur = [];
    foreach ($pronos as $p) {
        $par_joueur[$p['user_id']][$p['match_id']] = $p;
    }

    echo json_encode([
        'statut'     => 'OK',
        'journee'    => $journee,
        'matchs'     => $matchs,
        'pronostics' => $par_joueur,
    ]);
    exit();
}

// ============================================================
//  ACTION INCONNUE
// ============================================================
else {
    http_response_code(404);
    echo json_encode(['erreur' => 'Action inconnue']);
}
