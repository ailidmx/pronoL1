<?php
// ============================================================
//  PRONO-L1 — Pronostics bonus de saison
//  Fichier : api/bonus.php
//
//  Actions disponibles :
//  GET  ?action=config            → liste des bonus disponibles
//  GET  ?action=mes_bonus         → mes pronostics bonus
//  POST ?action=saisir            → enregistrer un bonus
//  POST ?action=calculer          → calculer les points bonus (admin)
//  POST ?action=valider           → saisir la bonne réponse (admin)
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=config
//  Retourne la liste des bonus + clubs disponibles pour les selects
//  + si connecté, les pronos déjà saisis
// ============================================================
if ($method === 'GET' && $action === 'config') {
    $saisonId = saisonDepuisRequete($db);

    // Liste des bonus de la saison — on exclut la catégorie 'champion_journee' :
    // ce n'est pas un pronostic à saisir, il est calculé et attribué
    // automatiquement (voir verifierChampionsJournee() dans utils.php).
    $stmt = $db->prepare('
        SELECT id, categorie, label, points, date_limite, type, nb_choix, actif
        FROM bonus_config
        WHERE saison_id = ? AND actif = 1 AND categorie != \'champion_journee\'
        ORDER BY id ASC
    ');
    $stmt->execute([$saisonId]);
    $bonus = $stmt->fetchAll();

    // Liste des clubs pour les selects
    $stmt = $db->prepare('
        SELECT id, nom, nom_court, code, logo_url
        FROM clubs WHERE saison_id = ?
        ORDER BY nom ASC
    ');
    $stmt->execute([$saisonId]);
    $clubs = $stmt->fetchAll();

    // Pronos déjà saisis si connecté
    $mes_bonus = [];
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token   = str_replace('Bearer ', '', $auth);

    if ($token) {
        $s = $db->prepare('
            SELECT u.id FROM users u
            JOIN sessions se ON se.user_id = u.id
            WHERE se.token = ? AND se.expire > NOW()
        ');
        $s->execute([$token]);
        $u = $s->fetch();
        if ($u) {
            $s = $db->prepare('
                SELECT bonus_id, numero_choix, valeur_club_id, valeur_texte, points, resultat
                FROM pronostics_bonus
                WHERE user_id = ? AND saison_id = ?
            ');
            $s->execute([$u['id'], $saisonId]);
            foreach ($s->fetchAll() as $pb) {
                $mes_bonus[$pb['bonus_id']][$pb['numero_choix']] = $pb;
            }
        }
    }

    echo json_encode([
        'statut'    => 'OK',
        'bonus'     => $bonus,
        'clubs'     => $clubs,
        'mes_bonus' => $mes_bonus,
    ]);
    exit();
}

// ============================================================
//  GET ?action=mes_bonus
//  Détail de tous mes pronostics bonus avec résultats
// ============================================================
elseif ($method === 'GET' && $action === 'mes_bonus') {
    $user = verifierToken($db);
    $saisonId = saisonDepuisRequete($db);

    $stmt = $db->prepare('
        SELECT
            pb.id, pb.bonus_id, pb.numero_choix,
            pb.valeur_club_id, pb.valeur_texte,
            pb.resultat, pb.points,
            bc.label, bc.points AS points_max, bc.type, bc.categorie,
            c.nom AS nom_club, c.nom_court AS court_club
        FROM pronostics_bonus pb
        JOIN bonus_config bc ON bc.id = pb.bonus_id
        LEFT JOIN clubs c    ON c.id  = pb.valeur_club_id
        WHERE pb.user_id = ? AND pb.saison_id = ?
        ORDER BY bc.id ASC, pb.numero_choix ASC
    ');
    $stmt->execute([$user['id'], $saisonId]);

    echo json_encode([
        'statut' => 'OK',
        'bonus'  => $stmt->fetchAll()
    ]);
    exit();
}

// ============================================================
//  POST ?action=saisir
//  Enregistre ou modifie un pronostic bonus
//  Bloqué après la date limite
// ============================================================
elseif ($method === 'POST' && $action === 'saisir') {
    $user = verifierToken($db);
    $data = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);

    $bonus_id     = intval($data['bonus_id']      ?? 0);
    $numero_choix = intval($data['numero_choix']  ?? 1);
    $club_id      = isset($data['club_id'])   ? intval($data['club_id'])        : null;
    $valeur_texte = isset($data['joueur'])    ? trim($data['joueur'])           : null;

    if (!$bonus_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Bonus manquant']);
        exit();
    }

    // Vérifier que le bonus existe et appartient à la saison
    $stmt = $db->prepare('
        SELECT * FROM bonus_config WHERE id = ? AND saison_id = ? AND actif = 1
    ');
    $stmt->execute([$bonus_id, $saisonId]);
    $bonus = $stmt->fetch();

    if (!$bonus) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Bonus introuvable']);
        exit();
    }

    // Vérifier la date limite
    if ($bonus['date_limite'] && strtotime($bonus['date_limite']) <= time()) {
        http_response_code(403);
        echo json_encode(['erreur' => 'La date limite est dépassée']);
        exit();
    }

    // Vérifier la cohérence type / valeur
    if ($bonus['type'] === 'joueur') {
        if (!$valeur_texte) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Nom du joueur manquant']);
            exit();
        }
        $club_id = null;
    } else {
        // club ou multi_club
        if (!$club_id) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Club manquant']);
            exit();
        }
        $valeur_texte = null;

        // Vérifier que le club appartient à la saison
        $s = $db->prepare('SELECT id FROM clubs WHERE id = ? AND saison_id = ?');
        $s->execute([$club_id, $saisonId]);
        if (!$s->fetch()) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Club invalide']);
            exit();
        }

        // Pour multi_club (relégués) : vérifier que le même club
        // n'est pas sélectionné deux fois
        if ($bonus['type'] === 'multi_club' && $bonus['nb_choix'] > 1) {
            $autre_choix = $numero_choix === 1 ? 2 : 1;
            $s = $db->prepare('
                SELECT valeur_club_id FROM pronostics_bonus
                WHERE user_id = ? AND bonus_id = ? AND numero_choix = ?
            ');
            $s->execute([$user['id'], $bonus_id, $autre_choix]);
            $autre = $s->fetch();
            if ($autre && $autre['valeur_club_id'] == $club_id) {
                http_response_code(400);
                echo json_encode(['erreur' => 'Vous avez déjà sélectionné ce club']);
                exit();
            }
        }
    }

    // Vérifier que numero_choix est valide
    if ($numero_choix < 1 || $numero_choix > $bonus['nb_choix']) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Numéro de choix invalide']);
        exit();
    }

    // INSERT ou UPDATE
    $db->prepare('
        INSERT INTO pronostics_bonus
            (user_id, saison_id, bonus_id, numero_choix, valeur_club_id, valeur_texte)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            valeur_club_id = VALUES(valeur_club_id),
            valeur_texte   = VALUES(valeur_texte),
            resultat       = NULL,
            points         = 0,
            updated_at     = NOW()
    ')->execute([
        $user['id'], $saisonId, $bonus_id, $numero_choix, $club_id, $valeur_texte
    ]);

    echo json_encode(['statut' => 'OK', 'message' => 'Pronostic bonus enregistré']);
    exit();
}

// ============================================================
//  POST ?action=valider
//  Admin saisit la bonne réponse pour un bonus
//  Ex: champion = PSG (club_id=1), buteur = "Esteban Lepaul"
// ============================================================
elseif ($method === 'POST' && $action === 'valider') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);
    $bonus_id = intval($data['bonus_id']  ?? 0);
    $club_id  = isset($data['club_id'])  ? intval($data['club_id'])  : null;
    $joueur   = isset($data['joueur'])   ? trim($data['joueur'])     : null;
    $numero_choix = intval($data['numero_choix'] ?? 1);

    if (!$bonus_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Bonus manquant']);
        exit();
    }

    $stmt = $db->prepare('SELECT * FROM bonus_config WHERE id = ? AND saison_id = ?');
    $stmt->execute([$bonus_id, $saisonId]);
    $bonus = $stmt->fetch();
    if (!$bonus) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Bonus introuvable']);
        exit();
    }

    $clubsAcceptes = $club_id ? [(int)$club_id] : [];
    $nomsAcceptes  = $joueur  ? [mb_strtolower(trim($joueur))] : [];

    $r = validerBonus($db, $bonus, $numero_choix, $clubsAcceptes, $nomsAcceptes);

    // Mémoriser la vraie réponse de ce bonus (pour le croisement futur
    // avec son bonus jumeau 2e/3e, et pour l'historique)
    if ($bonus['type'] === 'club' && $club_id) {
        $db->prepare('UPDATE bonus_config SET reponse_club_id = ? WHERE id = ?')
           ->execute([$club_id, $bonus_id]);
    } elseif ($bonus['type'] === 'joueur' && $joueur) {
        $db->prepare('UPDATE bonus_config SET reponse_texte = ? WHERE id = ?')
           ->execute([$joueur, $bonus_id]);
    }

    echo json_encode([
        'statut'   => 'OK',
        'message'  => "Bonus validé — {$r['corrects']} pronostic(s) correct(s)"
                     . ($r['retroactifs'] > 0 ? ", {$r['retroactifs']} demi-point(s) rétroactif(s) sur le bonus jumeau" : ''),
        'corrects' => $r['corrects'],
        'total'    => $r['total'],
    ]);
    exit();
}

// ============================================================
//  POST ?action=calculer
//  Recalcule tous les points bonus (admin)
//  Utile si on a changé une réponse
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

    // Récupère tous les bonus déjà validés (résultat non NULL)
    $stmt = $db->prepare('
        SELECT pb.*, bc.points AS points_max, bc.type, bc.nb_choix
        FROM pronostics_bonus pb
        JOIN bonus_config bc ON bc.id = pb.bonus_id
        WHERE pb.saison_id = ? AND pb.resultat IS NOT NULL
    ');
    $stmt->execute([$saisonId]);
    $pronos = $stmt->fetchAll();

    $total = 0;
    $updatePts = $db->prepare('UPDATE pronostics_bonus SET points = ? WHERE id = ?');
    foreach ($pronos as $p) {
        $pts = 0;
        if ($p['resultat'] == 1) {
            $pts = ($p['type'] === 'multi_club')
                ? intval($p['points_max'] / $p['nb_choix'])
                : $p['points_max'];
        } elseif ($p['resultat'] == 2) {
            // Demi-points (cas "2ème du championnat" / "3ème du championnat" inversés)
            $pts = intval($p['points_max'] / 2);
        }
        $updatePts->execute([$pts, $p['id']]);
        $total++;
    }

    echo json_encode([
        'statut'  => 'OK',
        'message' => "$total pronostic(s) bonus recalculé(s)"
    ]);
    exit();
}

// ============================================================
//  GET ?action=champion_journee_config
//  Retourne le barème actuel du bonus "champion de journée"
//  (visible par tous, comme les autres points de bonus)
// ============================================================
elseif ($method === 'GET' && $action === 'champion_journee_config') {
    $saisonId = saisonDepuisRequete($db);
    $stmt = $db->prepare("
        SELECT points FROM bonus_config
        WHERE saison_id = ? AND categorie = 'champion_journee' AND actif = 1
        LIMIT 1
    ");
    $stmt->execute([$saisonId]);
    $points = $stmt->fetchColumn();

    echo json_encode(['statut' => 'OK', 'points' => $points !== false ? (int)$points : 2]);
    exit();
}

// ============================================================
//  POST ?action=champion_journee_maj (admin)
//  Modifie le barème du bonus "champion de journée" pour la saison
//  Crée la ligne de config si elle n'existe pas encore
// ============================================================
elseif ($method === 'POST' && $action === 'champion_journee_maj') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);
    $points   = intval($data['points'] ?? 0);

    if ($points < 0) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Valeur invalide']);
        exit();
    }

    $stmt = $db->prepare("
        SELECT id FROM bonus_config
        WHERE saison_id = ? AND categorie = 'champion_journee'
        LIMIT 1
    ");
    $stmt->execute([$saisonId]);
    $existant = $stmt->fetchColumn();

    if ($existant) {
        $db->prepare('UPDATE bonus_config SET points = ? WHERE id = ?')
           ->execute([$points, $existant]);
    } else {
        $db->prepare("
            INSERT INTO bonus_config (saison_id, categorie, label, points, type, nb_choix, actif)
            VALUES (?, 'champion_journee', 'Champion de journée', ?, 'club', 1, 1)
        ")->execute([$saisonId, $points]);
    }

    echo json_encode(['statut' => 'OK', 'points' => $points]);
    exit();
}

// ============================================================
//  GET ?action=bareme_config
//  Retourne le barème de points actuel (visible par tous — sert
//  aussi à afficher le règlement à jour dans l'appli)
// ============================================================
elseif ($method === 'GET' && $action === 'bareme_config') {
    $saisonId = saisonDepuisRequete($db);
    echo json_encode(['statut' => 'OK', 'bareme' => chargerBareme($db, $saisonId)]);
    exit();
}

// ============================================================
//  POST ?action=bareme_maj (admin)
//  Modifie le barème de points pour la saison. Crée la ligne de
//  config si elle n'existe pas encore.
// ============================================================
elseif ($method === 'POST' && $action === 'bareme_maj') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);

    $champs = ['pts_exact', 'pts_bon_resultat', 'pts_bonus_ecart', 'pts_bonus_buts_dom', 'pts_bonus_buts_ext'];
    $valeurs = [];
    foreach ($champs as $c) {
        $v = intval($data[$c] ?? -1);
        if ($v < 0) {
            http_response_code(400);
            echo json_encode(['erreur' => "Valeur invalide pour $c"]);
            exit();
        }
        $valeurs[$c] = $v;
    }

    // cote_plafond est décimale (ex: 4.50) et validée à part — un plafond
    // inférieur à 1 n'aurait pas de sens (le multiplicateur ne doit jamais
    // réduire les points, seulement les augmenter ou les laisser identiques)
    $cotePlafond = floatval($data['cote_plafond'] ?? -1);
    if ($cotePlafond < 1) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Valeur invalide pour cote_plafond (minimum 1)']);
        exit();
    }
    $valeurs['cote_plafond'] = round($cotePlafond, 2);

    $stmt = $db->prepare('SELECT id FROM bareme_points WHERE saison_id = ? LIMIT 1');
    $stmt->execute([$saisonId]);
    $existant = $stmt->fetchColumn();

    if ($existant) {
        $db->prepare('
            UPDATE bareme_points
            SET pts_exact = ?, pts_bon_resultat = ?, pts_bonus_ecart = ?,
                pts_bonus_buts_dom = ?, pts_bonus_buts_ext = ?, cote_plafond = ?
            WHERE id = ?
        ')->execute([...array_values($valeurs), $existant]);
    } else {
        $db->prepare('
            INSERT INTO bareme_points
                (saison_id, pts_exact, pts_bon_resultat, pts_bonus_ecart, pts_bonus_buts_dom, pts_bonus_buts_ext, cote_plafond)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ')->execute([$saisonId, ...array_values($valeurs)]);
    }

    // Un barème modifié doit immédiatement se répercuter sur les points déjà
    // attribués — sinon l'admin doit penser à cliquer un 2e bouton ailleurs
    // (Classement → Recalculer), ce qui a déjà causé une incohérence.
    $recalcul = recalculerPointsSaison($db, $saisonId);

    echo json_encode([
        'statut'   => 'OK',
        'bareme'   => $valeurs,
        'recalcul' => $recalcul,
    ]);
    exit();
}

// ============================================================
//  POST ?action=date_limite_maj (admin)
//  Modifie la date limite d'un bonus de saison précis (indépendante
//  d'un bonus à l'autre — ex: Champion L1, Buteur, Relégués...)
// ============================================================
elseif ($method === 'POST' && $action === 'date_limite_maj') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data      = json_decode(file_get_contents('php://input'), true);
    $bonusId   = intval($data['bonus_id'] ?? 0);
    $dateLimite = trim($data['date_limite'] ?? '');

    if (!$bonusId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'bonus_id manquant']);
        exit();
    }

    // Chaîne vide = pas de date limite (bonus toujours ouvert)
    $valeur = $dateLimite !== '' ? $dateLimite : null;

    if ($valeur !== null && strtotime($valeur) === false) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Date invalide']);
        exit();
    }

    $db->prepare('UPDATE bonus_config SET date_limite = ? WHERE id = ?')
       ->execute([$valeur, $bonusId]);

    echo json_encode(['statut' => 'OK', 'bonus_id' => $bonusId, 'date_limite' => $valeur]);
    exit();
}

// ============================================================
//  POST ?action=points_maj (admin)
//  Modifie le nombre de points d'un bonus de saison précis (Champion
//  L1, 2e, 3e, Buteur, Passeur, Relégués, Meilleure attaque/défense...
//  — pas "champion de journée", qui a son propre écran dédié plus
//  haut). Si le bonus a déjà été validé (résultat connu pour au moins
//  un pronostic), les points déjà attribués sont recalculés
//  immédiatement avec la nouvelle valeur — même logique que pour le
//  barème de points par match (bareme_maj), pour éviter toute
//  incohérence entre la config affichée et les points réellement
//  comptés dans le classement.
// ============================================================
elseif ($method === 'POST' && $action === 'points_maj') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data    = json_decode(file_get_contents('php://input'), true);
    $bonusId = intval($data['bonus_id'] ?? 0);
    $points  = intval($data['points']   ?? -1);

    if (!$bonusId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'bonus_id manquant']);
        exit();
    }
    if ($points < 0) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Valeur invalide']);
        exit();
    }

    $stmt = $db->prepare('SELECT * FROM bonus_config WHERE id = ?');
    $stmt->execute([$bonusId]);
    $bonus = $stmt->fetch();
    if (!$bonus) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Bonus introuvable']);
        exit();
    }

    $db->prepare('UPDATE bonus_config SET points = ? WHERE id = ?')
       ->execute([$points, $bonusId]);

    // Recalcul immédiat des pronostics déjà résolus pour ce bonus
    $stmt = $db->prepare('
        SELECT id, resultat
        FROM pronostics_bonus
        WHERE bonus_id = ? AND resultat IS NOT NULL
    ');
    $stmt->execute([$bonusId]);
    $pronos = $stmt->fetchAll();

    $recalcules = 0;
    $updatePts  = $db->prepare('UPDATE pronostics_bonus SET points = ? WHERE id = ?');
    foreach ($pronos as $p) {
        $pts = 0;
        if ($p['resultat'] == 1) {
            $pts = ($bonus['type'] === 'multi_club')
                ? intval($points / $bonus['nb_choix'])
                : $points;
        } elseif ($p['resultat'] == 2) {
            // Demi-points (cas "2ème du championnat" / "3ème du championnat" inversés)
            $pts = intval($points / 2);
        }
        $updatePts->execute([$pts, $p['id']]);
        $recalcules++;
    }

    echo json_encode([
        'statut'     => 'OK',
        'points'     => $points,
        'recalcules' => $recalcules,
    ]);
    exit();
}

// ============================================================
//  POST ?action=verifier_auto (admin)
//  Déclenche manuellement la validation automatique des bonus de fin
//  de saison (normalement faite par le cron une fois la saison finie)
//  — pratique pour tester sans attendre.
// ============================================================
elseif ($method === 'POST' && $action === 'verifier_auto') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);

    $r = verifierBonusAutomatiques($db, $saisonId);
    echo json_encode(['statut' => 'OK'] + $r);
    exit();
}

// ============================================================
//  ACTION INCONNUE
// ============================================================
else {
    http_response_code(404);
    echo json_encode(['erreur' => 'Action inconnue']);
}
