<?php
// ============================================================
//  PRONO-L1 — Tendances pré-match (aide à la décision)
//  Fichier : api/tendances.php
//
//  À la différence de stats.php?action=match_stats (stats du match
//  une fois commencé, alimentées par l'API), ce fichier calcule des
//  TENDANCES statistiques à partir de l'historique des matchs déjà
//  joués en base — disponible à tout moment, y compris bien avant
//  le coup d'envoi, pour aider à choisir un pronostic.
//
//  Tout est calculé en SQL agrégé (AVG/SUM/COUNT/GROUP BY), jamais
//  en boucle PHP sur les lignes.
//
//  Un club change d'id (`clubs.id`) à chaque saison (une ligne par
//  club et par saison) — le seul identifiant stable d'un club d'une
//  saison à l'autre est `clubs.apf_id` (id API-Football). Pour agréger
//  "toutes saisons confondues", on résout donc systématiquement tous
//  les id de club partageant le même apf_id avant de filtrer les
//  matchs, plutôt que de filtrer directement sur un seul club_id.
//
//  Actions disponibles :
//  GET ?action=match&match_id=X&periode=saison|toutes
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=match&match_id=X&periode=saison|toutes
// ============================================================
if ($method === 'GET' && $action === 'match') {
    $matchId = intval($_GET['match_id'] ?? 0);
    $periode = $_GET['periode'] ?? 'saison';
    if (!in_array($periode, ['saison', 'toutes'], true)) $periode = 'saison';

    if (!$matchId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'match_id requis']);
        exit();
    }

    $stmt = $db->prepare('SELECT id, saison_id, club_dom_id, club_ext_id FROM matches WHERE id = ?');
    $stmt->execute([$matchId]);
    $match = $stmt->fetch();
    if (!$match) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Match introuvable']);
        exit();
    }

    // Périmètre des saisons à agréger — on exclut systématiquement la
    // saison "entraînement" (scores fictifs), qui fausserait les moyennes
    if ($periode === 'saison') {
        $saisonIds = [(int)$match['saison_id']];
    } else {
        $saisonIds = $db->query("SELECT id FROM saisons WHERE statut != 'entrainement'")
                         ->fetchAll(PDO::FETCH_COLUMN);
        $saisonIds = array_map('intval', $saisonIds);
        if (empty($saisonIds)) $saisonIds = [(int)$match['saison_id']];
    }

    // Résoudre apf_id des 2 clubs du match, puis tous les club_id (dans le
    // périmètre de saisons retenu) qui partagent ce même apf_id
    $stmtApf = $db->prepare('SELECT apf_id FROM clubs WHERE id = ?');
    $stmtApf->execute([$match['club_dom_id']]);
    $apfDom = $stmtApf->fetchColumn();
    $stmtApf->execute([$match['club_ext_id']]);
    $apfExt = $stmtApf->fetchColumn();

    $idsDom = _resoudreClubIds($db, $apfDom, $saisonIds, (int)$match['club_dom_id']);
    $idsExt = _resoudreClubIds($db, $apfExt, $saisonIds, (int)$match['club_ext_id']);

    echo json_encode([
        'statut'     => 'OK',
        'periode'    => $periode,
        'general'    => _blocGeneral($db, $saisonIds),
        'domicile'   => _blocClub($db, $saisonIds, 'club_dom_id', $idsDom, 'dom'),
        'exterieur'  => _blocClub($db, $saisonIds, 'club_ext_id', $idsExt, 'ext'),
        'possession' => _tendancesPossession($db, $saisonIds, $idsDom, $idsExt),
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

// ============================================================
//  FONCTIONS PRIVÉES
// ============================================================

// Tous les club_id (dans le périmètre de saisons donné) partageant le même
// apf_id qu'un club de référence — permet d'agréger un même club réel à
// travers plusieurs saisons malgré son changement d'id à chaque saison.
function _resoudreClubIds(PDO $db, $apfId, array $saisonIds, int $idParDefaut): array {
    if (!$apfId) return [$idParDefaut]; // pas d'apf_id connu → on reste sur le seul id sûr
    $inSaisons = implode(',', array_fill(0, count($saisonIds), '?'));
    $stmt = $db->prepare("SELECT id FROM clubs WHERE apf_id = ? AND saison_id IN ($inSaisons)");
    $stmt->execute(array_merge([$apfId], $saisonIds));
    $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    return $ids ?: [$idParDefaut];
}

// Bloc général championnat (tous les matchs, aucun club en particulier) —
// dom/ext ont ici un sens littéral (l'équipe qui recevait ce jour-là),
// puisqu'aucun club de référence n'est fixé.
function _blocGeneral(PDO $db, array $saisonIds): array {
    $inSaisons = implode(',', array_fill(0, count($saisonIds), '?'));

    $stmt = $db->prepare("
        SELECT
            COUNT(*) AS nb,
            AVG(score_dom + score_ext) AS buts_moy,
            SUM(CASE WHEN score_dom > score_ext THEN 1 ELSE 0 END) AS victoires_dom,
            SUM(CASE WHEN score_ext > score_dom THEN 1 ELSE 0 END) AS victoires_ext,
            SUM(CASE WHEN score_dom = score_ext THEN 1 ELSE 0 END) AS nuls,
            SUM(CASE WHEN (score_dom + score_ext) > 2 THEN 1 ELSE 0 END) AS plus_2_5,
            SUM(CASE WHEN score_dom > 0 AND score_ext > 0 THEN 1 ELSE 0 END) AS btts,
            AVG(CASE WHEN score_dom > score_ext THEN score_dom - score_ext ELSE NULL END) AS ecart_moy_dom,
            AVG(CASE WHEN score_ext > score_dom THEN score_ext - score_dom ELSE NULL END) AS ecart_moy_ext
        FROM matches
        WHERE saison_id IN ($inSaisons) AND statut = 'termine' AND score_dom IS NOT NULL
    ");
    $stmt->execute($saisonIds);
    $row = $stmt->fetch();

    $nb  = (int)($row['nb'] ?? 0);
    $pct = function($n) use ($nb) { return $nb > 0 ? round($n * 100 / $nb, 1) : 0.0; };

    $stmtScores = $db->prepare("
        SELECT score_dom, score_ext, nb FROM (
            SELECT score_dom, score_ext, COUNT(*) AS nb,
                   DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS rang
            FROM matches
            WHERE saison_id IN ($inSaisons) AND statut = 'termine' AND score_dom IS NOT NULL
            GROUP BY score_dom, score_ext
        ) t
        WHERE rang <= 5
        ORDER BY nb DESC, score_dom ASC, score_ext ASC
    ");
    $stmtScores->execute($saisonIds);

    return [
        'nb_matchs'          => $nb,
        'echantillon_reduit' => $nb < 5,
        'buts_moy'           => $nb > 0 ? round((float)$row['buts_moy'], 2) : null,
        'victoires_dom_pct'  => $pct((int)$row['victoires_dom']),
        'victoires_ext_pct'  => $pct((int)$row['victoires_ext']),
        'nuls_pct'           => $pct((int)$row['nuls']),
        'plus_2_5_pct'       => $pct((int)$row['plus_2_5']),
        'btts_pct'           => $pct((int)$row['btts']),
        'ecart_moy_victoire_dom' => $row['ecart_moy_dom'] !== null ? round((float)$row['ecart_moy_dom'], 2) : null,
        'ecart_moy_victoire_ext' => $row['ecart_moy_ext'] !== null ? round((float)$row['ecart_moy_ext'], 2) : null,
        'scores_frequents'   => $stmtScores->fetchAll(),
    ];
}

// Bloc spécifique à un club dans une configuration fixe (toujours à
// domicile, ou toujours à l'extérieur) — tous les champs sont exprimés
// du point de vue de CE club (victoires/nuls/défaites, buts marqués vs
// encaissés), jamais en dom/ext littéral, pour éviter toute ambiguïté.
// $cote = 'dom' (le club filtré est toujours l'équipe qui reçoit)
//       | 'ext' (le club filtré est toujours l'équipe qui se déplace)
function _blocClub(PDO $db, array $saisonIds, string $colFiltre, array $idsFiltre, string $cote): array {
    $inSaisons = implode(',', array_fill(0, count($saisonIds), '?'));
    $inClubs   = implode(',', array_fill(0, count($idsFiltre), '?'));
    $params    = array_merge($saisonIds, $idsFiltre);

    // Expressions SQL selon le côté du club dans ce bloc
    if ($cote === 'dom') {
        $exprButsClub = 'score_dom';
        $exprButsAdv  = 'score_ext';
        $exprVictoire = 'score_dom > score_ext';
        $exprDefaite  = 'score_ext > score_dom';
        $selectScores = 'score_dom AS score_club, score_ext AS score_adv';
    } else {
        $exprButsClub = 'score_ext';
        $exprButsAdv  = 'score_dom';
        $exprVictoire = 'score_ext > score_dom';
        $exprDefaite  = 'score_dom > score_ext';
        $selectScores = 'score_ext AS score_club, score_dom AS score_adv';
    }

    $stmt = $db->prepare("
        SELECT
            COUNT(*) AS nb,
            AVG($exprButsClub) AS buts_marques_moy,
            AVG($exprButsAdv)  AS buts_encaisses_moy,
            SUM(CASE WHEN $exprVictoire THEN 1 ELSE 0 END) AS victoires,
            SUM(CASE WHEN $exprDefaite  THEN 1 ELSE 0 END) AS defaites,
            SUM(CASE WHEN score_dom = score_ext THEN 1 ELSE 0 END) AS nuls,
            SUM(CASE WHEN (score_dom + score_ext) > 2 THEN 1 ELSE 0 END) AS plus_2_5,
            SUM(CASE WHEN score_dom > 0 AND score_ext > 0 THEN 1 ELSE 0 END) AS btts,
            SUM(CASE WHEN $exprButsAdv = 0 THEN 1 ELSE 0 END) AS clean_sheets,
            AVG(CASE WHEN $exprVictoire THEN ABS(score_dom - score_ext) ELSE NULL END) AS ecart_moy_victoire,
            AVG(CASE WHEN $exprDefaite  THEN ABS(score_dom - score_ext) ELSE NULL END) AS ecart_moy_defaite,
            SUM(CASE WHEN $exprButsClub = 0 THEN 1 ELSE 0 END) AS buts_0,
            SUM(CASE WHEN $exprButsClub = 1 THEN 1 ELSE 0 END) AS buts_1,
            SUM(CASE WHEN $exprButsClub = 2 THEN 1 ELSE 0 END) AS buts_2,
            SUM(CASE WHEN $exprButsClub = 3 THEN 1 ELSE 0 END) AS buts_3,
            SUM(CASE WHEN $exprButsClub > 3 THEN 1 ELSE 0 END) AS buts_plus3
        FROM matches
        WHERE saison_id IN ($inSaisons) AND statut = 'termine' AND score_dom IS NOT NULL
        AND $colFiltre IN ($inClubs)
    ");
    $stmt->execute($params);
    $row = $stmt->fetch();

    $nb  = (int)($row['nb'] ?? 0);
    $pct = function($n) use ($nb) { return $nb > 0 ? round($n * 100 / $nb, 1) : 0.0; };

    $stmtScores = $db->prepare("
        SELECT score_club, score_adv, nb FROM (
            SELECT $selectScores, COUNT(*) AS nb,
                   DENSE_RANK() OVER (ORDER BY COUNT(*) DESC) AS rang
            FROM matches
            WHERE saison_id IN ($inSaisons) AND statut = 'termine' AND score_dom IS NOT NULL
            AND $colFiltre IN ($inClubs)
            GROUP BY score_club, score_adv
        ) t
        WHERE rang <= 5
        ORDER BY nb DESC, score_club DESC, score_adv ASC
    ");
    $stmtScores->execute($params);

    return [
        'nb_matchs'           => $nb,
        'echantillon_reduit'  => $nb < 5,
        'buts_marques_moy'    => $nb > 0 ? round((float)$row['buts_marques_moy'], 2) : null,
        'buts_encaisses_moy'  => $nb > 0 ? round((float)$row['buts_encaisses_moy'], 2) : null,
        'victoires_pct'       => $pct((int)$row['victoires']),
        'nuls_pct'            => $pct((int)$row['nuls']),
        'defaites_pct'        => $pct((int)$row['defaites']),
        'plus_2_5_pct'        => $pct((int)$row['plus_2_5']),
        'btts_pct'            => $pct((int)$row['btts']),
        'clean_sheets_pct'    => $pct((int)$row['clean_sheets']),
        'ecart_moy_victoire'  => $row['ecart_moy_victoire'] !== null ? round((float)$row['ecart_moy_victoire'], 2) : null,
        'ecart_moy_defaite'   => $row['ecart_moy_defaite']  !== null ? round((float)$row['ecart_moy_defaite'], 2)  : null,
        'buts_repartition'    => [
            'buts_0'     => $pct((int)$row['buts_0']),
            'buts_1'     => $pct((int)$row['buts_1']),
            'buts_2'     => $pct((int)$row['buts_2']),
            'buts_3'     => $pct((int)$row['buts_3']),
            'buts_plus3' => $pct((int)$row['buts_plus3']),
        ],
        'scores_frequents'    => $stmtScores->fetchAll(),
    ];
}

// Moyenne de possession de chaque club dans sa configuration du match
// (domicile pour l'un, extérieur pour l'autre), à partir du cache
// match_stats déjà alimenté par stats.php côté "Stats du match".
// Retourne null si l'échantillon est vraiment trop faible pour être
// affiché (moins de 3 matchs de chaque côté) plutôt qu'un chiffre
// trompeur.
function _tendancesPossession(PDO $db, array $saisonIds, array $idsDom, array $idsExt): ?array {
    $inSaisons = implode(',', array_fill(0, count($saisonIds), '?'));

    $lire = function(array $clubIds, string $colClubMatch) use ($db, $saisonIds, $inSaisons) {
        $inClubs = implode(',', array_fill(0, count($clubIds), '?'));
        $stmt = $db->prepare("
            SELECT ms.stats
            FROM match_stats ms
            JOIN matches m ON m.id = ms.match_id
            WHERE m.saison_id IN ($inSaisons)
              AND m.statut = 'termine'
              AND ms.club_id IN ($inClubs)
              AND m.$colClubMatch = ms.club_id
        ");
        $stmt->execute(array_merge($saisonIds, $clubIds));

        $valeurs = [];
        foreach ($stmt->fetchAll() as $r) {
            $stats = json_decode($r['stats'], true) ?: [];
            foreach ($stats as $s) {
                if (stripos($s['type'] ?? '', 'possession') !== false && $s['value'] !== null && $s['value'] !== '') {
                    $valeurs[] = (int) rtrim((string)$s['value'], '%');
                    break;
                }
            }
        }
        return $valeurs;
    };

    $valDom = $lire($idsDom, 'club_dom_id');
    $valExt = $lire($idsExt, 'club_ext_id');

    if (count($valDom) < 3 && count($valExt) < 3) return null;

    return [
        'dom_moy'            => $valDom ? round(array_sum($valDom) / count($valDom), 1) : null,
        'ext_moy'            => $valExt ? round(array_sum($valExt) / count($valExt), 1) : null,
        'nb_matchs_dom'      => count($valDom),
        'nb_matchs_ext'      => count($valExt),
        'echantillon_reduit' => count($valDom) < 5 || count($valExt) < 5,
    ];
}
