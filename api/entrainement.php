<?php
// ============================================================
//  PRONO-L1 — Mode entraînement
//  Fichier : api/entrainement.php
//
//  Permet aux joueurs de se familiariser avec l'appli sur quelques
//  journées de la saison 2026-27, sans toucher à la vraie saison
//  (verrouillée aux pronostics tant qu'elle n'est pas passée à
//  statut = 'en_cours'). Tout tourne sur une saison à part entière
//  (statut = 'entrainement'), avec ses propres clubs et matchs
//  clonés depuis la vraie saison — comme tout le reste de l'appli
//  est déjà filtré par saison_id, cette saison est totalement
//  étanche : rien de ce qui se passe ici ne touche à la vraie 2026-27.
//
//  Actions disponibles :
//  GET  ?action=etat          → la saison entraînement existe-t-elle ? état actuel
//  POST ?action=activer       → (admin) crée la saison + clone clubs/matchs
//  POST ?action=reset_pronos  → (admin) efface tous les pronostics saisis
//  POST ?action=simuler       → (admin) attribue des scores aléatoires aux matchs à venir
//  POST ?action=reset_scores  → (admin) efface les faux scores + le classement des équipes
//  POST ?action=reset_points  → (admin) remet à 0 les points des pronostics (sans toucher aux scores)
//  POST ?action=desactiver    → (admin) supprime complètement le mode entraînement
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// Retrouve la saison "entraînement" si elle existe
function _saisonEntrainementId(PDO $db): ?int {
    $stmt = $db->query("SELECT id FROM saisons WHERE statut = 'entrainement' LIMIT 1");
    $id = $stmt->fetchColumn();
    return $id ? (int)$id : null;
}

// ============================================================
//  GET ?action=etat
// ============================================================
if ($method === 'GET' && $action === 'etat') {
    $id = _saisonEntrainementId($db);
    if (!$id) {
        echo json_encode(['statut' => 'OK', 'actif' => false]);
        exit();
    }

    $stmt = $db->prepare('SELECT COUNT(*) FROM matches WHERE saison_id = ?');
    $stmt->execute([$id]);
    $nbMatchs = (int)$stmt->fetchColumn();

    $stmt = $db->prepare("SELECT COUNT(*) FROM matches WHERE saison_id = ? AND statut = 'termine'");
    $stmt->execute([$id]);
    $nbTermines = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('
        SELECT COUNT(*) FROM pronostics
        WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)
    ');
    $stmt->execute([$id]);
    $nbPronos = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('
        SELECT COUNT(DISTINCT user_id) FROM pronostics
        WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)
    ');
    $stmt->execute([$id]);
    $nbJoueurs = (int)$stmt->fetchColumn();

    echo json_encode([
        'statut'      => 'OK',
        'actif'       => true,
        'saison_id'   => $id,
        'nb_matchs'   => $nbMatchs,
        'nb_termines' => $nbTermines,
        'nb_pronos'   => $nbPronos,
        'nb_joueurs'  => $nbJoueurs,
    ]);
    exit();
}

// ============================================================
//  POST ?action=activer (admin)
//  Crée la saison entraînement (si elle n'existe pas déjà) en
//  clonant les clubs et les N premières journées de matchs de la
//  vraie saison à venir (statut = 'futur').
// ============================================================
elseif ($method === 'POST' && $action === 'activer') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    if (_saisonEntrainementId($db)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le mode entraînement est déjà actif. Désactivez-le d\'abord si vous voulez repartir de zéro.']);
        exit();
    }

    $data       = json_decode(file_get_contents('php://input'), true);
    $nbJournees = max(1, min(5, intval($data['nb_journees'] ?? 3)));

    $stmt = $db->query("SELECT id, annee_debut, annee_fin FROM saisons WHERE statut = 'futur' ORDER BY annee_debut ASC LIMIT 1");
    $saisonSource = $stmt->fetch();
    if (!$saisonSource) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Aucune saison "à venir" trouvée en base pour servir de base au clonage.']);
        exit();
    }
    $sourceId = (int)$saisonSource['id'];

    // Vérifie qu'il y a bien des matchs programmés sur ces journées
    $stmt = $db->prepare('SELECT COUNT(*) FROM matches WHERE saison_id = ? AND journee <= ?');
    $stmt->execute([$sourceId, $nbJournees]);
    if ((int)$stmt->fetchColumn() === 0) {
        http_response_code(400);
        echo json_encode(['erreur' => "Aucun match trouvé sur les $nbJournees premières journées de la saison à venir — synchronisez d'abord son calendrier."]);
        exit();
    }

    try {
        $db->beginTransaction();

        $db->prepare("
            INSERT INTO saisons (label, annee_debut, annee_fin, statut, nb_journees)
            VALUES ('🎓 Entraînement', ?, ?, 'entrainement', ?)
        ")->execute([$saisonSource['annee_debut'], $saisonSource['annee_fin'], $nbJournees]);
        $entrainementId = (int)$db->lastInsertId();

        // Clone des clubs
        $stmt = $db->prepare('SELECT * FROM clubs WHERE saison_id = ?');
        $stmt->execute([$sourceId]);
        $clubsSource = $stmt->fetchAll();

        $insertClub = $db->prepare('
            INSERT INTO clubs (saison_id, apf_id, nom, nom_court, code, logo_url, stade, ville, couleur1, couleur2)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $mappingClubs = [];
        foreach ($clubsSource as $c) {
            $insertClub->execute([
                $entrainementId, $c['apf_id'], $c['nom'], $c['nom_court'], $c['code'],
                $c['logo_url'], $c['stade'], $c['ville'], $c['couleur1'] ?? null, $c['couleur2'] ?? null,
            ]);
            $mappingClubs[(int)$c['id']] = (int)$db->lastInsertId();
        }

        // Clone des matchs des N premières journées (dates réelles conservées :
        // largement dans le futur, donc les pronostics restent ouverts dès
        // maintenant sans avoir besoin de bidouiller les dates)
        $stmt = $db->prepare('
            SELECT * FROM matches
            WHERE saison_id = ? AND journee <= ?
            ORDER BY journee ASC, date ASC
        ');
        $stmt->execute([$sourceId, $nbJournees]);
        $matchsSource = $stmt->fetchAll();

        $insertMatch = $db->prepare("
            INSERT INTO matches (saison_id, journee, journee_initiale, date, date_initiale, club_dom_id, club_ext_id, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'a_venir')
        ");
        $nbMatchs = 0;
        foreach ($matchsSource as $m) {
            $domId = $mappingClubs[(int)$m['club_dom_id']] ?? null;
            $extId = $mappingClubs[(int)$m['club_ext_id']] ?? null;
            if (!$domId || !$extId) continue; // club introuvable dans le clone, on saute ce match
            $insertMatch->execute([
                $entrainementId, $m['journee'], $m['journee'], $m['date'], $m['date'], $domId, $extId,
            ]);
            $nbMatchs++;
        }

        rafraichirClassementEquipes($db, $entrainementId);

        $db->commit();
        echo json_encode([
            'statut'    => 'OK',
            'saison_id' => $entrainementId,
            'nb_clubs'  => count($mappingClubs),
            'nb_matchs' => $nbMatchs,
        ]);
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        http_response_code(500);
        echo json_encode(['erreur' => $e->getMessage()]);
    }
    exit();
}

// ============================================================
//  POST ?action=reset_pronos (admin)
//  Efface tous les pronostics saisis sur la saison entraînement
//  (les joueurs repartent d'une page blanche, sans toucher aux
//  faux scores déjà simulés le cas échéant).
// ============================================================
elseif ($method === 'POST' && $action === 'reset_pronos') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $id = _saisonEntrainementId($db);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le mode entraînement n\'est pas actif']);
        exit();
    }

    $stmt = $db->prepare('DELETE FROM pronostics WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)');
    $stmt->execute([$id]);

    echo json_encode(['statut' => 'OK', 'supprimes' => $stmt->rowCount()]);
    exit();
}

// ============================================================
//  POST ?action=simuler (admin)
//  Attribue un score aléatoire (plausible, pas tous identiques)
//  à chaque match encore "à venir" de la saison entraînement, puis
//  calcule les points de tous les pronostics concernés.
// ============================================================
elseif ($method === 'POST' && $action === 'simuler') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $id = _saisonEntrainementId($db);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le mode entraînement n\'est pas actif']);
        exit();
    }

    $stmt = $db->prepare("SELECT id FROM matches WHERE saison_id = ? AND statut = 'a_venir'");
    $stmt->execute([$id]);
    $matchIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!$matchIds) {
        echo json_encode(['statut' => 'OK', 'nb_simules' => 0, 'message' => 'Aucun match à venir à simuler (déjà tous simulés ?)']);
        exit();
    }

    // Distribution de buts pondérée pour éviter des scores absurdes ou
    // au contraire trop uniformes : la plupart des matchs de foot se
    // jouent entre 0 et 3 buts par équipe, occasionnellement plus.
    $ponderation = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5];
    $tirerScore = function () use ($ponderation) {
        return $ponderation[array_rand($ponderation)];
    };

    $update = $db->prepare("UPDATE matches SET score_dom = ?, score_ext = ?, statut = 'termine' WHERE id = ?");
    foreach ($matchIds as $matchId) {
        $update->execute([$tirerScore(), $tirerScore(), $matchId]);
        calculerPointsMatch($db, (int)$matchId);
        // Simulation = coup d'envoi simulé : on fige les cotes comme le
        // ferait appliquerMajMatch() pour un vrai match (voir utils.php)
        figerCotesMatch($db, (int)$matchId, $id);
    }

    rafraichirClassementEquipes($db, $id);

    // La forme (5 derniers matchs) est mise en cache 1h par club, y
    // compris quand elle est vide — sans cette purge, un club dont la
    // forme avait déjà été consultée (donc mise en cache vide) AVANT
    // cette simulation continuerait à afficher "aucune forme" jusqu'à
    // expiration du cache, alors même que des matchs viennent de passer
    // à "terminé". Purge large (LIKE) plutôt que par club : plus simple,
    // et le volume de lignes cache_api concernées reste minime.
    $db->prepare("DELETE FROM cache_api WHERE cle LIKE ?")->execute(["forme_%_{$id}"]);

    echo json_encode(['statut' => 'OK', 'nb_simules' => count($matchIds)]);
    exit();
}

// ============================================================
//  POST ?action=reset_scores (admin)
//  Efface les faux scores (retour à "à venir") et régénère le
//  classement des équipes en conséquence. Les pronostics saisis par
//  les joueurs sont conservés (seul leur résultat/points est remis à
//  zéro, puisqu'un score qui n'existe plus ne peut plus être noté).
//  Body JSON optionnel { "match_ids": [12, 34] } pour ne cibler que
//  certains matchs plutôt que toute la saison (toujours restreint à
//  la saison entraînement par sécurité, même avec des IDs fournis).
// ============================================================
elseif ($method === 'POST' && $action === 'reset_scores') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $id = _saisonEntrainementId($db);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le mode entraînement n\'est pas actif']);
        exit();
    }

    $data     = json_decode(file_get_contents('php://input'), true);
    $matchIds = array_values(array_filter(array_map('intval', $data['match_ids'] ?? [])));
    $cible    = !empty($matchIds);

    if ($cible) {
        // Vérifie que les IDs fournis appartiennent bien à la saison
        // entraînement (jamais à la vraie saison, même par erreur)
        $placeholders = implode(',', array_fill(0, count($matchIds), '?'));
        $stmt = $db->prepare("SELECT id FROM matches WHERE saison_id = ? AND id IN ($placeholders)");
        $stmt->execute([$id, ...$matchIds]);
        $matchIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        if (!$matchIds) {
            http_response_code(400);
            echo json_encode(['erreur' => "Aucun de ces matchs n'appartient à la saison entraînement"]);
            exit();
        }
        $placeholders = implode(',', array_fill(0, count($matchIds), '?'));

        $db->prepare("UPDATE pronostics SET resultat = NULL, points = 0 WHERE match_id IN ($placeholders)")
           ->execute($matchIds);

        $stmt = $db->prepare("UPDATE matches SET score_dom = NULL, score_ext = NULL, statut = 'a_venir' WHERE id IN ($placeholders)");
        $stmt->execute($matchIds);
    } else {
        $db->prepare("
            UPDATE pronostics SET resultat = NULL, points = 0
            WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)
        ")->execute([$id]);

        $stmt = $db->prepare("
            UPDATE matches SET score_dom = NULL, score_ext = NULL, statut = 'a_venir'
            WHERE saison_id = ?
        ");
        $stmt->execute([$id]);
    }

    // Le classement est toujours recalculé depuis zéro à partir des
    // matchs encore "terminé" (pas un delta) : sûr de rappeler même
    // pour la réinitialisation d'un seul match.
    rafraichirClassementEquipes($db, $id);

    // Même raison que dans l'action "simuler" : la forme mise en cache
    // doit être purgée dès que des matchs changent de statut, sinon un
    // ancien résultat (avec forme) resterait affiché jusqu'à 1h après
    // la réinitialisation.
    $db->prepare("DELETE FROM cache_api WHERE cle LIKE ?")->execute(["forme_%_{$id}"]);

    echo json_encode(['statut' => 'OK', 'matchs_reinitialises' => $stmt->rowCount()]);
    exit();
}

// ============================================================
//  POST ?action=reset_points (admin)
//  Remet à 0 les points/résultats des pronostics de la saison
//  entraînement, sans toucher aux scores des matchs ni aux
//  pronostics saisis (utile pour rejouer juste le calcul de points,
//  par exemple après un ajustement).
// ============================================================
elseif ($method === 'POST' && $action === 'reset_points') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $id = _saisonEntrainementId($db);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le mode entraînement n\'est pas actif']);
        exit();
    }

    $stmt = $db->prepare("
        UPDATE pronostics SET resultat = NULL, points = 0
        WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)
    ");
    $stmt->execute([$id]);

    echo json_encode(['statut' => 'OK', 'reinitialises' => $stmt->rowCount()]);
    exit();
}

// ============================================================
//  POST ?action=desactiver (admin)
//  Supprime complètement le mode entraînement (saison, clubs,
//  matchs, pronostics associés) — à utiliser avant le vrai coup
//  d'envoi pour ne pas laisser traîner de données de test.
// ============================================================
elseif ($method === 'POST' && $action === 'desactiver') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $id = _saisonEntrainementId($db);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le mode entraînement n\'est pas actif']);
        exit();
    }

    try {
        $db->beginTransaction();
        $db->prepare('DELETE FROM pronostics WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)')->execute([$id]);
        $db->prepare('DELETE FROM classement_equipes_cache WHERE saison_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM matches WHERE saison_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM clubs WHERE saison_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM saisons WHERE id = ?')->execute([$id]);
        $db->commit();
        echo json_encode(['statut' => 'OK']);
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        http_response_code(500);
        echo json_encode(['erreur' => $e->getMessage()]);
    }
    exit();
}

else {
    http_response_code(400);
    echo json_encode(['erreur' => 'Action inconnue']);
}
