<?php
// ============================================================
//  PRONO-L1 — Classement équipes + classement joueurs
//  Fichier : api/classement.php
//
//  Actions disponibles :
//  GET ?action=equipes            → classement L1 temps réel
//  GET ?action=equipes_domicile   → classement à domicile
//  GET ?action=equipes_exterieur  → classement à l'extérieur
//  GET ?action=joueurs            → classement des pronostiqueurs
//  GET ?action=joueurs_journee&journee=X → classement d'une journée
//  GET ?action=taux_reussite      → stats du groupe + par joueur
//  GET ?action=evolution          → points cumulés + rangs par journée
//  POST ?action=calculer          → recalcule tous les points (admin)
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=equipes — classement général L1
// ============================================================
if ($method === 'GET' && $action === 'equipes') {
    $saisonId = saisonDepuisRequete($db);
    echo json_encode([
        'statut'    => 'OK',
        'classement'=> _calculerClassementEquipes($db, 'general', $saisonId)
    ]);
    exit();
}

// ============================================================
//  GET ?action=equipes_domicile
// ============================================================
elseif ($method === 'GET' && $action === 'equipes_domicile') {
    $saisonId = saisonDepuisRequete($db);
    echo json_encode([
        'statut'    => 'OK',
        'classement'=> _calculerClassementEquipes($db, 'domicile', $saisonId)
    ]);
    exit();
}

// ============================================================
//  GET ?action=equipes_exterieur
// ============================================================
elseif ($method === 'GET' && $action === 'equipes_exterieur') {
    $saisonId = saisonDepuisRequete($db);
    echo json_encode([
        'statut'    => 'OK',
        'classement'=> _calculerClassementEquipes($db, 'exterieur', $saisonId)
    ]);
    exit();
}

// ============================================================
//  GET ?action=joueurs — classement général des pronostiqueurs
// ============================================================
elseif ($method === 'GET' && $action === 'joueurs') {
    $saisonId = saisonDepuisRequete($db);
    $avecBonus = !isset($_GET['avec_bonus']) || $_GET['avec_bonus'] !== '0';
    // Barème alternatif "avec cotes" (points_alt) — COALESCE vers points
    // classiques au cas où un pronostic n'aurait pas encore été recalculé
    // avec la logique points_alt (transition, données anciennes...)
    $avecCotes = isset($_GET['avec_cotes']) && $_GET['avec_cotes'] === '1';
    $colPoints = $avecCotes ? 'COALESCE(p.points_alt, p.points)' : 'p.points';
    $stmt = $db->prepare("
        SELECT
            u.id,
            u.nom,
            u.avatar_initiales AS initiales,
            COUNT(p.id)                                    AS nb_pronos,
            SUM(CASE WHEN p.resultat = 'exact'   THEN 1 ELSE 0 END) AS nb_exacts,
            SUM(CASE WHEN p.resultat = 'bon'     THEN 1 ELSE 0 END) AS nb_bons,
            SUM(CASE WHEN p.resultat = 'mauvais' THEN 1 ELSE 0 END) AS nb_mauvais,
            SUM(CASE WHEN p.resultat = 'bon'
                     AND (p.score_dom_pred - p.score_ext_pred) = (m.score_dom - m.score_ext)
                THEN 1 ELSE 0 END)                          AS nb_ecart,
            SUM(CASE WHEN p.resultat != 'exact' AND p.score_dom_pred = m.score_dom
                THEN 1 ELSE 0 END)                          AS nb_buts_dom,
            SUM(CASE WHEN p.resultat != 'exact' AND p.score_ext_pred = m.score_ext
                THEN 1 ELSE 0 END)                          AS nb_buts_ext,
            COALESCE(SUM($colPoints), 0)                    AS pts_matchs,
            COALESCE(
                (SELECT SUM(pb.points)
                 FROM pronostics_bonus pb
                 WHERE pb.user_id = u.id AND pb.saison_id = ?), 0
            )                                              AS pts_bonus,
            COALESCE(
                (SELECT SUM(bcj.points)
                 FROM bonus_champion_journee bcj
                 WHERE bcj.user_id = u.id AND bcj.saison_id = ?), 0
            )                                              AS pts_champion_journee,
            COALESCE(
                (SELECT COUNT(*)
                 FROM bonus_champion_journee bcj
                 WHERE bcj.user_id = u.id AND bcj.saison_id = ?), 0
            )                                              AS nb_champion_journee,
            COALESCE(SUM($colPoints), 0) +
            COALESCE(
                (SELECT SUM(pb.points)
                 FROM pronostics_bonus pb
                 WHERE pb.user_id = u.id AND pb.saison_id = ?), 0
            ) +
            COALESCE(
                (SELECT SUM(bcj.points)
                 FROM bonus_champion_journee bcj
                 WHERE bcj.user_id = u.id AND bcj.saison_id = ?), 0
            )                                              AS pts_total
        FROM users u
        LEFT JOIN pronostics p ON p.user_id = u.id
            AND p.match_id IN (SELECT id FROM matches WHERE saison_id = ?)
        LEFT JOIN matches m ON m.id = p.match_id
        GROUP BY u.id, u.nom, u.avatar_initiales
        ORDER BY pts_total DESC, nb_exacts DESC, u.nom ASC
    ");
    $stmt->execute([$saisonId, $saisonId, $saisonId, $saisonId, $saisonId, $saisonId]);
    $classement = $stmt->fetchAll();

    // Mode "sans bonus" : le tri initial (ORDER BY pts_total, qui inclut les
    // bonus) ne convient plus — on re-trie sur pts_matchs uniquement avant
    // de calculer les rangs.
    if (!$avecBonus) {
        usort($classement, function ($a, $b) {
            return ((float)$b['pts_matchs'] <=> (float)$a['pts_matchs'])
                ?: ((int)$b['nb_exacts'] <=> (int)$a['nb_exacts'])
                ?: strcmp($a['nom'], $b['nom']);
        });
    }

    // Rang partagé en cas d'égalité (1, 1, 3, 3, 5... comme le podium)
    $rangCourant  = 0;
    $ptsPrecedent = null;
    foreach ($classement as $i => &$row) {
        $ptsAffiche = $avecBonus ? (float)$row['pts_total'] : (float)$row['pts_matchs'];
        // En mode "avec cotes", les totaux sont décimaux (multiplicateur de
        // cote) — on garde 2 décimales ; en mode classique, ce sont toujours
        // des entiers, on affiche sans décimale inutile.
        $ptsAffiche = $avecCotes ? round($ptsAffiche, 2) : (int)$ptsAffiche;
        if ($ptsAffiche !== $ptsPrecedent) {
            $rangCourant  = $i + 1;
            $ptsPrecedent = $ptsAffiche;
        }
        $row['rang'] = $rangCourant;
        $row['pts_matchs'] = $avecCotes ? round((float)$row['pts_matchs'], 2) : (int)$row['pts_matchs'];
        $row['pts_bonus']  = (int)$row['pts_bonus'];
        $row['pts_champion_journee'] = (int)$row['pts_champion_journee'];
        $row['nb_champion_journee'] = (int)$row['nb_champion_journee'];
        // pts_total = ce que le front doit afficher comme "points" — selon
        // le mode choisi. avec_bonus/avec_cotes sont renvoyés pour que le
        // front sache quels modes ont réellement été appliqués.
        $row['pts_total']  = $ptsAffiche;
        $row['nb_pronos']  = (int)$row['nb_pronos'];
        $row['nb_exacts']  = (int)$row['nb_exacts'];
        $row['nb_bons']    = (int)$row['nb_bons'];
        $row['nb_mauvais'] = (int)$row['nb_mauvais'];
        $row['nb_ecart']   = (int)$row['nb_ecart'];
        $row['nb_buts_dom'] = (int)$row['nb_buts_dom'];
        $row['nb_buts_ext'] = (int)$row['nb_buts_ext'];
    }

    echo json_encode(['statut' => 'OK', 'classement' => $classement, 'avec_bonus' => $avecBonus, 'avec_cotes' => $avecCotes]);
    exit();
}

// ============================================================
//  GET ?action=joueurs_journee&journee=X
//  Classement sur une journée précise uniquement
// ============================================================
elseif ($method === 'GET' && $action === 'joueurs_journee') {
    $saisonId = saisonDepuisRequete($db);
    $journee = intval($_GET['journee'] ?? 0);
    if (!$journee) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Journée manquante']);
        exit();
    }

    $stmt = $db->prepare('
		SELECT
			u.id,
			u.nom,
			u.avatar_initiales AS initiales,
			COUNT(p.id)                                     AS nb_pronos,
			SUM(CASE WHEN p.resultat = \'exact\'   THEN 1 ELSE 0 END) AS nb_exacts,
			SUM(CASE WHEN p.resultat = \'bon\'     THEN 1 ELSE 0 END) AS nb_bons,
			SUM(CASE WHEN p.resultat = \'bon\'
			         AND (p.score_dom_pred - p.score_ext_pred) = (m.score_dom - m.score_ext)
			    THEN 1 ELSE 0 END)                          AS nb_ecart,
			SUM(CASE WHEN p.resultat != \'exact\' AND p.score_dom_pred = m.score_dom
			    THEN 1 ELSE 0 END)                          AS nb_buts_dom,
			SUM(CASE WHEN p.resultat != \'exact\' AND p.score_ext_pred = m.score_ext
			    THEN 1 ELSE 0 END)                          AS nb_buts_ext,
			COALESCE(SUM(p.points), 0)                      AS pts_matchs,
			COALESCE(
			    (SELECT SUM(bcj.points) FROM bonus_champion_journee bcj
			     WHERE bcj.user_id = u.id AND bcj.saison_id = ? AND bcj.journee = ?), 0
			)                                                AS pts_champion_journee
		FROM users u
		INNER JOIN pronostics p ON p.user_id = u.id
			AND p.match_id IN (
				SELECT id FROM matches
				WHERE saison_id = ? AND journee = ?
			)
		LEFT JOIN matches m ON m.id = p.match_id
		GROUP BY u.id, u.nom, u.avatar_initiales
		ORDER BY pts_matchs DESC, nb_exacts DESC, u.nom ASC
	');
    $stmt->execute([$saisonId, $journee, $saisonId, $journee]);
    $classement = $stmt->fetchAll();

    // pts_total = points des matchs + bonus champion de journée (calculé
    // ici plutôt qu'en SQL : MySQL interdit de combiner un alias d'agrégat
    // avec un autre alias dans la même requête)
    $rangCourant  = 0;
    $ptsPrecedent = null;
    foreach ($classement as $i => &$row) {
        $ptsTotal = (int)$row['pts_matchs'] + (int)$row['pts_champion_journee'];
        if ($ptsTotal !== $ptsPrecedent) {
            $rangCourant  = $i + 1;
            $ptsPrecedent = $ptsTotal;
        }
        $row['rang']       = $rangCourant;
        $row['pts_total']  = $ptsTotal;
        $row['nb_pronos']  = (int)$row['nb_pronos'];
        $row['nb_exacts']  = (int)$row['nb_exacts'];
        $row['nb_bons']    = (int)$row['nb_bons'];
        $row['nb_ecart']   = (int)$row['nb_ecart'];
        $row['nb_buts_dom'] = (int)$row['nb_buts_dom'];
        $row['nb_buts_ext'] = (int)$row['nb_buts_ext'];
        $row['pts_champion_journee'] = (int)$row['pts_champion_journee'];
    }

    echo json_encode([
        'statut'   => 'OK',
        'journee'  => $journee,
        'classement' => $classement,
        'max_pts'  => $classement[0]['pts_total'] ?? 0,
    ]);
    exit();
}

// ============================================================
//  GET ?action=taux_reussite — stats du groupe + par joueur
//  (page Podium > onglet Stats)
// ============================================================
elseif ($method === 'GET' && $action === 'taux_reussite') {
    $saisonId = saisonDepuisRequete($db);

    // Totaux du groupe
    $stmt = $db->prepare('
        SELECT
            COUNT(p.id)                                                AS total,
            SUM(CASE WHEN p.resultat = \'exact\'   THEN 1 ELSE 0 END)   AS nb_exacts,
            SUM(CASE WHEN p.resultat = \'bon\'     THEN 1 ELSE 0 END)   AS nb_bons,
            SUM(CASE WHEN p.resultat = \'mauvais\' THEN 1 ELSE 0 END)   AS nb_faux,
            COUNT(DISTINCT p.user_id)                                  AS nb_joueurs
        FROM pronostics p
        WHERE p.match_id IN (SELECT id FROM matches WHERE saison_id = ?)
          AND p.resultat IS NOT NULL
    ');
    $stmt->execute([$saisonId]);
    $totaux = $stmt->fetch();
    foreach (['total', 'nb_exacts', 'nb_bons', 'nb_faux', 'nb_joueurs'] as $k) {
        $totaux[$k] = (int)($totaux[$k] ?? 0);
    }

    // Le match le plus souvent trouvé en score exact
    $stmtMatch = $db->prepare('
        SELECT m.id, c1.nom_court AS nom_dom, c2.nom_court AS nom_ext,
               m.score_dom, m.score_ext, COUNT(*) AS nb_exacts
        FROM pronostics p
        JOIN matches m ON m.id = p.match_id
        JOIN clubs c1  ON c1.id = m.club_dom_id
        JOIN clubs c2  ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND p.resultat = \'exact\'
        GROUP BY m.id, c1.nom_court, c2.nom_court, m.score_dom, m.score_ext
        ORDER BY nb_exacts DESC
        LIMIT 1
    ');
    $stmtMatch->execute([$saisonId]);
    $matchPlusExact = $stmtMatch->fetch();
    if ($matchPlusExact) $matchPlusExact['nb_exacts'] = (int)$matchPlusExact['nb_exacts'];

    // Taux de réussite par joueur
    $stmtJ = $db->prepare('
        SELECT u.id, u.nom, u.avatar_initiales AS initiales,
            COUNT(p.id)                                              AS nb_pronos,
            SUM(CASE WHEN p.resultat = \'exact\' THEN 1 ELSE 0 END)   AS nb_exacts,
            SUM(CASE WHEN p.resultat = \'bon\'   THEN 1 ELSE 0 END)   AS nb_bons
        FROM users u
        INNER JOIN pronostics p ON p.user_id = u.id
            AND p.match_id IN (SELECT id FROM matches WHERE saison_id = ?)
        WHERE p.resultat IS NOT NULL
        GROUP BY u.id, u.nom, u.avatar_initiales
        HAVING nb_pronos > 0
    ');
    $stmtJ->execute([$saisonId]);
    $parJoueur = $stmtJ->fetchAll();

    foreach ($parJoueur as &$row) {
        $row['nb_pronos'] = (int)$row['nb_pronos'];
        $row['nb_exacts'] = (int)$row['nb_exacts'];
        $row['nb_bons']   = (int)$row['nb_bons'];
    }
    unset($row);

    // Tri par taux de réussite (exacts+bons)/pronos décroissant
    usort($parJoueur, function ($a, $b) {
        $ta = $a['nb_pronos'] ? ($a['nb_exacts'] + $a['nb_bons']) / $a['nb_pronos'] : 0;
        $tb = $b['nb_pronos'] ? ($b['nb_exacts'] + $b['nb_bons']) / $b['nb_pronos'] : 0;
        return $tb <=> $ta;
    });

    echo json_encode([
        'statut'           => 'OK',
        'totaux'           => $totaux,
        'match_plus_exact' => $matchPlusExact ?: null,
        'joueurs'          => $parJoueur,
    ]);
    exit();
}

// ============================================================
//  GET ?action=evolution — points cumulés + rangs par journée
//  (page Podium > onglet Évolution). Ne tient compte que des
//  points de matchs (les bonus saisonniers n'ont pas de journée).
// ============================================================
elseif ($method === 'GET' && $action === 'evolution') {
    $saisonId = saisonDepuisRequete($db);

    // 1. Toutes les journées ayant au moins un pronostic noté
    $stmtJ = $db->prepare('
        SELECT DISTINCT m.journee
        FROM matches m
        JOIN pronostics p ON p.match_id = m.id
        WHERE m.saison_id = ? AND p.points IS NOT NULL
        ORDER BY m.journee ASC
    ');
    $stmtJ->execute([$saisonId]);
    $journees = array_map('intval', array_column($stmtJ->fetchAll(), 'journee'));

    if (empty($journees)) {
        echo json_encode(['statut' => 'OK', 'journees' => [], 'joueurs' => []]);
        exit();
    }

    // 2. Points par joueur par journée
    $stmtPts = $db->prepare('
        SELECT p.user_id, m.journee, SUM(COALESCE(p.points, 0)) AS pts_journee
        FROM pronostics p
        JOIN matches m ON m.id = p.match_id
        WHERE m.saison_id = ? AND p.points IS NOT NULL
        GROUP BY p.user_id, m.journee
    ');
    $stmtPts->execute([$saisonId]);

    $parJoueur = [];
    foreach ($stmtPts->fetchAll() as $row) {
        $parJoueur[$row['user_id']][(int)$row['journee']] = (int)$row['pts_journee'];
    }

    // 3. Séries cumulées, uniquement les joueurs ayant au moins 1 prono noté
    $stmtNoms = $db->query('SELECT id, nom, avatar_initiales AS initiales FROM users ORDER BY nom ASC');
    $series = [];
    foreach ($stmtNoms->fetchAll() as $u) {
        if (!isset($parJoueur[$u['id']])) continue;
        $cumul = 0;
        $serie = [];
        foreach ($journees as $j) {
            $cumul += $parJoueur[$u['id']][$j] ?? 0;
            $serie[] = $cumul;
        }
        $series[] = [
            'id'             => (int)$u['id'],
            'nom'            => $u['nom'],
            'initiales'      => $u['initiales'],
            'points_cumules' => $serie,
        ];
    }

    // 4. Rang de chaque joueur à chaque journée (classement recalculé colonne par colonne)
    $nbCols = count($journees);
    foreach ($series as &$s) { $s['rangs'] = array_fill(0, $nbCols, null); }
    unset($s);
    for ($col = 0; $col < $nbCols; $col++) {
        $ordre = array_keys($series);
        usort($ordre, function ($a, $b) use ($series, $col) {
            return $series[$b]['points_cumules'][$col] <=> $series[$a]['points_cumules'][$col];
        });
        foreach ($ordre as $rang => $idx) {
            $series[$idx]['rangs'][$col] = $rang + 1;
        }
    }

    // 5. Tri final par total décroissant
    usort($series, function ($a, $b) {
        return end($b['points_cumules']) <=> end($a['points_cumules']);
    });

    echo json_encode([
        'statut'   => 'OK',
        'journees' => $journees,
        'joueurs'  => $series,
    ]);
    exit();
}

// ============================================================
//  POST ?action=calculer — recalcule tous les points (admin)
//  Utile si on a modifié des scores manuellement
// ============================================================
elseif ($method === 'POST' && $action === 'calculer') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);

    $r = recalculerPointsSaison($db, $saisonId);

    echo json_encode([
        'statut'   => 'OK',
        'message'  => 'Points recalculés',
        'pronos'   => $r['pronos'],
        'matchs'   => $r['matchs'],
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

// _calculerClassementEquipes(), _qualification() et _envoyerNotifications()
// (devenue envoyerNotificationsEnAttente()) ont été déplacées dans
// utils.php (pour être réutilisables par cron_sync.php et bonus.php)
