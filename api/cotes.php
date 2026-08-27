<?php
// ============================================================
//  PRONO-L1 — Cotes (bookmakers + joueurs)
//  Fichier : api/cotes.php
//
//  Actions disponibles :
//  GET ?action=debug&match_id=X  → (admin) réponse brute de l'API-Football
//                                   pour les cotes d'un match précis, utile
//                                   pour vérifier si l'API a déjà des cotes
//                                   en stock avant même que le cron les
//                                   remonte (ex: match encore loin dans le
//                                   temps)
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=debug&match_id=X — (admin) réponse brute de l'API-Football
//  pour les cotes d'un match, interrogée directement par fixture (donc
//  sans passer par la pagination league/season utilisée par le cron —
//  ça permet de savoir si l'API a QUOI QUE CE SOIT pour ce match, même
//  très en amont du coup d'envoi).
// ============================================================
if ($method === 'GET' && $action === 'debug') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }

    $matchId = (int)($_GET['match_id'] ?? 0);
    $stmt = $db->prepare('
        SELECT m.id, m.date, m.statut, m.apf_fixture_id,
               cd.nom AS nom_dom, ce.nom AS nom_ext
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
    if (!$match['apf_fixture_id']) {
        echo json_encode(['statut' => 'OK', 'match_interne' => $match, 'message' => 'Ce match n\'a pas d\'apf_fixture_id — jamais synchronisé depuis API-Football']);
        exit();
    }

    $oddsParFixture = _apiFootballCall('https://v3.football.api-sports.io/odds?fixture=' . $match['apf_fixture_id']);

    // Contenu actuellement en base (résultat du cron, potentiellement vide)
    $stmt = $db->prepare('SELECT * FROM cotes_matchs WHERE match_id = ?');
    $stmt->execute([$matchId]);
    $enBase = $stmt->fetch();

    echo json_encode([
        'statut'              => 'OK',
        'match_interne'       => $match,
        'reponse_brute_odds'  => $oddsParFixture,
        'nb_resultats'        => count($oddsParFixture['response'] ?? []),
        'deja_en_base'        => $enBase ?: null,
    ]);
    exit();
}

// ============================================================
//  GET ?action=match&match_id=X — cotes "maison", calculées à la
//  volée à partir de la répartition des pronostics des joueurs sur
//  CE match (résultat 1/N/2 + score exact le plus pronostiqué).
//  Pas de restriction d'accès : ce sont des chiffres agrégés, jamais
//  les pronos individuels de qui que ce soit — même logique que le
//  compteur "nb_pronos" déjà visible avant le coup d'envoi.
// ============================================================
elseif ($method === 'GET' && $action === 'match') {
    $matchId = (int)($_GET['match_id'] ?? 0);
    if (!$matchId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'match_id requis']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT
            COUNT(*) AS nb_total,
            SUM(CASE WHEN score_dom_pred > score_ext_pred THEN 1 ELSE 0 END) AS nb_dom,
            SUM(CASE WHEN score_dom_pred = score_ext_pred THEN 1 ELSE 0 END) AS nb_nul,
            SUM(CASE WHEN score_dom_pred < score_ext_pred THEN 1 ELSE 0 END) AS nb_ext
        FROM pronostics
        WHERE match_id = ?
    ');
    $stmt->execute([$matchId]);
    $rep = $stmt->fetch();
    $nbTotal = (int)$rep['nb_total'];

    // En dessous de ce seuil, la répartition n'est pas assez fournie pour
    // qu'une "cote" veuille dire grand-chose (ex: 1 seul prono = cote à
    // l'infini sur les 2 issues non choisies) — on affiche un état
    // d'attente plutôt qu'un chiffre trompeur.
    $SEUIL_MIN_PRONOS = 5;

    if ($nbTotal < $SEUIL_MIN_PRONOS) {
        echo json_encode([
            'statut'    => 'OK',
            'suffisant' => false,
            'nb_pronos' => $nbTotal,
            'seuil'     => $SEUIL_MIN_PRONOS,
        ]);
        exit();
    }

    // cote = nb_total / nb_ayant_choisi_cette_issue (implicite, sans
    // marge bookmaker — ce sont "nos" cotes, pas celles d'un book)
    $coteDom = (int)$rep['nb_dom'] > 0 ? round($nbTotal / (int)$rep['nb_dom'], 2) : null;
    $coteNul = (int)$rep['nb_nul'] > 0 ? round($nbTotal / (int)$rep['nb_nul'], 2) : null;
    $coteExt = (int)$rep['nb_ext'] > 0 ? round($nbTotal / (int)$rep['nb_ext'], 2) : null;

    $stmt = $db->prepare('
        SELECT score_dom_pred, score_ext_pred, COUNT(*) AS nb
        FROM pronostics
        WHERE match_id = ?
        GROUP BY score_dom_pred, score_ext_pred
        ORDER BY nb DESC, score_dom_pred ASC, score_ext_pred ASC
    ');
    $stmt->execute([$matchId]);
    $tousScores = $stmt->fetchAll();

    $scorePopulaire = null;
    if ($tousScores) {
        $maxNb   = (int)$tousScores[0]['nb'];
        $exAequo = array_values(array_filter($tousScores, fn($r) => (int)$r['nb'] === $maxNb));
        $scorePopulaire = [
            'scores'  => array_map(fn($r) => ['dom' => (int)$r['score_dom_pred'], 'ext' => (int)$r['score_ext_pred']], $exAequo),
            'nb'      => $maxNb,
            'pct'     => round($maxNb / $nbTotal * 100, 1),
            'egalite' => count($exAequo) > 1,
        ];
    }

    echo json_encode([
        'statut'    => 'OK',
        'suffisant' => true,
        'nb_pronos' => $nbTotal,
        'cotes'     => ['dom' => $coteDom, 'nul' => $coteNul, 'ext' => $coteExt],
        'score_populaire' => $scorePopulaire,
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
