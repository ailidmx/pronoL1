<?php
// ============================================================
//  PRONO-L1 — Fiches clubs
//  Fichier : api/clubs.php
//
//  Actions disponibles :
//  GET  ?action=liste              → tous les clubs de la saison
//  GET  ?action=fiche&club_id=X   → fiche complète d'un club
//  GET  ?action=calendrier&club_id=X → matchs du club
//  GET  ?action=effectif&club_id=X → effectif du club
//  POST ?action=sync_clubs         → (admin) importe les clubs de la saison
//  POST ?action=sync_effectif&club_id=X → (admin) force la resynchro d'1 club
//  POST ?action=sync_tous_effectifs → (admin) force la resynchro de tous les clubs
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=liste
//  Tous les clubs de la saison avec infos de base
// ============================================================
if ($method === 'GET' && $action === 'liste') {
    $saisonId = saisonDepuisRequete($db);
    $stmt = $db->prepare('
        SELECT id, nom, nom_court, code, logo_url, stade, ville, couleur1, couleur2
        FROM clubs
        WHERE saison_id = ?
        ORDER BY nom ASC
    ');
    $stmt->execute([$saisonId]);

    echo json_encode(['statut' => 'OK', 'clubs' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  GET ?action=fiche&club_id=X
//  Fiche complète : infos + stats saison + derniers résultats
// ============================================================
elseif ($method === 'GET' && $action === 'fiche') {
    $saisonId = saisonDepuisRequete($db);
    $club_id = intval($_GET['club_id'] ?? 0);
    if (!$club_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Club manquant']);
        exit();
    }

    // Infos du club
    $stmt = $db->prepare('
        SELECT * FROM clubs WHERE id = ? AND saison_id = ?
    ');
    $stmt->execute([$club_id, $saisonId]);
    $club = $stmt->fetch();

    if (!$club) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Club introuvable']);
        exit();
    }

    // Stats saison calculées depuis les matchs
    $stmt = $db->prepare('
        SELECT
            COUNT(*) AS j,
            SUM(CASE
                WHEN club_dom_id = ? AND score_dom > score_ext THEN 1
                WHEN club_ext_id = ? AND score_ext > score_dom THEN 1
                ELSE 0 END) AS g,
            SUM(CASE
                WHEN score_dom = score_ext THEN 1
                ELSE 0 END) AS n,
            SUM(CASE
                WHEN club_dom_id = ? AND score_dom < score_ext THEN 1
                WHEN club_ext_id = ? AND score_ext < score_dom THEN 1
                ELSE 0 END) AS p,
            SUM(CASE WHEN club_dom_id = ? THEN score_dom
                     WHEN club_ext_id = ? THEN score_ext ELSE 0 END) AS bp,
            SUM(CASE WHEN club_dom_id = ? THEN score_ext
                     WHEN club_ext_id = ? THEN score_dom ELSE 0 END) AS bc
        FROM matches
        WHERE saison_id = ?
        AND statut = \'termine\'
        AND (club_dom_id = ? OR club_ext_id = ?)
    ');
    $stmt->execute([
        $club_id, $club_id, $club_id, $club_id,
        $club_id, $club_id, $club_id, $club_id,
        $saisonId, $club_id, $club_id
    ]);
    $stats = $stmt->fetch();
    $stats['diff'] = ($stats['bp'] ?? 0) - ($stats['bc'] ?? 0);
    $stats['pts']  = ($stats['g'] * 3) + $stats['n'];

    // Forme : 5 derniers matchs
    $stmt = $db->prepare('
        SELECT
            m.score_dom, m.score_ext,
            m.club_dom_id, m.club_ext_id, m.date,
            c1.nom_court AS nom_dom,
            c2.nom_court AS nom_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ?
        AND m.statut = \'termine\'
        AND (m.club_dom_id = ? OR m.club_ext_id = ?)
        ORDER BY m.date DESC
        LIMIT 5
    ');
    $stmt->execute([$saisonId, $club_id, $club_id]);
    $forme_raw = $stmt->fetchAll();

    $forme = [];
    foreach ($forme_raw as $m) {
        $est_dom = $m['club_dom_id'] == $club_id;
        $mes_buts = $est_dom ? $m['score_dom'] : $m['score_ext'];
        $adv_buts = $est_dom ? $m['score_ext'] : $m['score_dom'];
        $adversaire = $est_dom ? $m['nom_ext'] : $m['nom_dom'];

        if ($mes_buts > $adv_buts)      $resultat = 'W';
        elseif ($mes_buts < $adv_buts)  $resultat = 'L';
        else                            $resultat = 'D';

        $forme[] = [
            'resultat'   => $resultat,
            'score'      => "$mes_buts-$adv_buts",
            'adversaire' => $adversaire,
            'domicile'   => $est_dom,
            'date'       => $m['date'],
        ];
    }

    echo json_encode([
        'statut' => 'OK',
        'club'   => $club,
        'stats'  => $stats,
        'forme'  => $forme,
    ]);
    exit();
}

// ============================================================
//  GET ?action=calendrier&club_id=X
//  Tous les matchs du club (passés + à venir)
// ============================================================
elseif ($method === 'GET' && $action === 'calendrier') {
    $saisonId = saisonDepuisRequete($db);
    $club_id = intval($_GET['club_id'] ?? 0);
    if (!$club_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Club manquant']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT
            m.id, m.journee, m.date, m.statut,
            m.score_dom, m.score_ext,
            m.club_dom_id, m.club_ext_id,
            c1.nom_court AS nom_dom, c1.logo_url AS logo_dom,
            c2.nom_court AS nom_ext, c2.logo_url AS logo_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ?
        AND (m.club_dom_id = ? OR m.club_ext_id = ?)
        ORDER BY m.date ASC
    ');
    $stmt->execute([$saisonId, $club_id, $club_id]);

    echo json_encode(['statut' => 'OK', 'matchs' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  GET ?action=effectif&club_id=X
//  Effectif du club (cache API-Football)
//  Si pas en cache → appel API et stockage
// ============================================================
elseif ($method === 'GET' && $action === 'effectif') {
    $saisonId = saisonDepuisRequete($db);
    $club_id = intval($_GET['club_id'] ?? 0);
    if (!$club_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Club manquant']);
        exit();
    }

    // Vérifier que le club existe
    $stmt = $db->prepare('SELECT * FROM clubs WHERE id = ? AND saison_id = ?');
    $stmt->execute([$club_id, $saisonId]);
    $club = $stmt->fetch();
    if (!$club) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Club introuvable']);
        exit();
    }

    // Option réservée à l'admin : inclure aussi les joueurs masqués manuellement
    // (utile pour l'outil de correction manuelle, afin de pouvoir les "réafficher")
    $inclureMasques = false;
    if (!empty($_GET['inclure_masques'])) {
        $admin = verifierToken($db);
        $inclureMasques = !empty($admin['is_admin']);
    }

    // Chercher en cache base de données
    $stmt = $db->prepare('
        SELECT id, nom, prenom, poste, numero, nationalite, date_naissance, photo_url, manuel, masque
        FROM effectifs
        WHERE club_id = ? AND saison_id = ?' . ($inclureMasques ? '' : ' AND masque = 0') . '
        ORDER BY
            FIELD(poste, \'Gardien\', \'Défenseur\', \'Milieu\', \'Attaquant\'),
            numero ASC
    ');
    $stmt->execute([$club_id, $saisonId]);
    $effectif = $stmt->fetchAll();

    // Si cache vide ET que le club a un apf_id → appel API-Football
    if (empty($effectif) && $club['apf_id']) {
        $r = syncEffectifAvecDiff($db, $club, $saisonId);
        $effectif = $r['effectif'] ?: [];
    }

    // Nom de l'entraîneur : pas de champ dédié en base (l'API-Football ne
    // le donne pas via l'endpoint effectif/squads, seulement via les
    // lineups d'un match). On récupère donc le coach_nom le plus récent
    // connu pour ce club dans la table compositions (renseignée à chaque
    // sync de composition de match), toutes saisons confondues pour avoir
    // la meilleure info disponible même en tout début de saison.
    $stmtCoach = $db->prepare('
        SELECT co.coach_nom
        FROM compositions co
        JOIN matches m ON m.id = co.match_id
        WHERE co.club_id = ? AND co.coach_nom IS NOT NULL AND co.coach_nom != \'\'
        ORDER BY m.date DESC
        LIMIT 1
    ');
    $stmtCoach->execute([$club_id]);
    $entraineur = $stmtCoach->fetchColumn() ?: null;

    echo json_encode([
        'statut'  => 'OK',
        'club'    => ['id' => $club['id'], 'nom' => $club['nom'], 'logo_url' => $club['logo_url'], 'entraineur' => $entraineur],
        'effectif'=> $effectif,
    ]);
    exit();
}

// ============================================================
//  POST ?action=ajouter_joueur_manuel — (admin) ajoute un joueur
//  à la main dans l'effectif d'un club (protégé de la resynchro
//  automatique, qui ne touche jamais aux lignes "manuel = 1")
// ============================================================
elseif ($method === 'POST' && $action === 'ajouter_joueur_manuel') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDemandee($db, isset($data['saison_id']) ? intval($data['saison_id']) : null);
    $club_id  = intval($data['club_id'] ?? 0);
    $nom      = trim($data['nom'] ?? '');
    $prenom   = trim($data['prenom'] ?? '');
    $poste    = trim($data['poste'] ?? '');
    $numero   = isset($data['numero']) && $data['numero'] !== '' ? intval($data['numero']) : null;
    $nationalite = trim($data['nationalite'] ?? '') ?: null;
    $apfId    = isset($data['apf_id']) && $data['apf_id'] !== '' ? intval($data['apf_id']) : null;

    if (!$club_id || $nom === '' || !in_array($poste, ['Gardien', 'Défenseur', 'Milieu', 'Attaquant'], true)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Club, nom et poste sont obligatoires (poste invalide)']);
        exit();
    }

    $stmt = $db->prepare('SELECT id FROM clubs WHERE id = ? AND saison_id = ?');
    $stmt->execute([$club_id, $saisonId]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Club introuvable']);
        exit();
    }

    $db->prepare('
        INSERT INTO effectifs
            (saison_id, club_id, apf_id, nom, prenom, poste, numero, nationalite, manuel, masque)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
    ')->execute([$saisonId, $club_id, $apfId, $nom, $prenom ?: null, $poste, $numero, $nationalite]);

    echo json_encode(['statut' => 'OK']);
    exit();
}

// ============================================================
//  POST ?action=masquer_joueur — (admin) masque un joueur parti
//  (renvoyé par l'API mais plus dans l'effectif réel). La ligne
//  reste en base — protégée à la fois de la suppression ET de la
//  réinsertion lors de la prochaine resynchro.
//  POST ?action=demasquer_joueur — annule un masquage
//  POST ?action=supprimer_joueur_manuel — supprime définitivement
//  une ligne ajoutée à la main (manuel = 1 uniquement, sécurité)
// ============================================================
elseif ($method === 'POST' && in_array($action, ['masquer_joueur', 'demasquer_joueur', 'supprimer_joueur_manuel'], true)) {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }
    $data = json_decode(file_get_contents('php://input'), true);
    $joueurId = intval($data['joueur_id'] ?? 0);
    if (!$joueurId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Joueur manquant']);
        exit();
    }

    if ($action === 'masquer_joueur') {
        $db->prepare('UPDATE effectifs SET masque = 1 WHERE id = ?')->execute([$joueurId]);
    } elseif ($action === 'demasquer_joueur') {
        $db->prepare('UPDATE effectifs SET masque = 0 WHERE id = ?')->execute([$joueurId]);
    } else { // supprimer_joueur_manuel
        $db->prepare('DELETE FROM effectifs WHERE id = ? AND manuel = 1')->execute([$joueurId]);
    }

    echo json_encode(['statut' => 'OK']);
    exit();
}

// ============================================================
//  POST ?action=sync_effectif&club_id=X — (admin) force la
//  resynchro de l'effectif d'un club, même si déjà en cache,
//  et renvoie le détail des arrivées/départs détectés.
// ============================================================
elseif ($method === 'POST' && $action === 'sync_effectif') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDemandee($db, isset($data['saison_id']) ? intval($data['saison_id']) : null);
    $club_id  = intval($_GET['club_id'] ?? 0);

    $stmt = $db->prepare('SELECT * FROM clubs WHERE id = ? AND saison_id = ?');
    $stmt->execute([$club_id, $saisonId]);
    $club = $stmt->fetch();
    if (!$club || !$club['apf_id']) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Club introuvable ou sans identifiant API-Football']);
        exit();
    }

    $r = syncEffectifAvecDiff($db, $club, $saisonId);
    echo json_encode([
        'statut'   => $r['erreur'] ? 'ERREUR' : 'OK',
        'erreur'   => $r['erreur'],
        'club'     => $club['nom'],
        'arrivees' => $r['arrivees'],
        'departs'  => $r['departs'],
        'effectif' => $r['effectif'],
    ]);
    exit();
}

// ============================================================
//  POST ?action=sync_tous_effectifs — (admin) force la resynchro
//  de TOUS les clubs de la saison sélectionnée, d'affilée.
//  Renvoie le résumé des changements club par club.
// ============================================================
elseif ($method === 'POST' && $action === 'sync_tous_effectifs') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDemandee($db, isset($data['saison_id']) ? intval($data['saison_id']) : null);

    $stmt = $db->prepare('SELECT * FROM clubs WHERE saison_id = ? AND apf_id IS NOT NULL ORDER BY nom ASC');
    $stmt->execute([$saisonId]);
    $clubs = $stmt->fetchAll();

    $resultats = [];
    foreach ($clubs as $club) {
        $r = syncEffectifAvecDiff($db, $club, $saisonId);
        $resultats[] = [
            'club'     => $club['nom'],
            'erreur'   => $r['erreur'],
            'arrivees' => $r['arrivees'],
            'departs'  => $r['departs'],
        ];
    }

    echo json_encode(['statut' => 'OK', 'resultats' => $resultats]);
    exit();
}

// ============================================================
//  POST ?action=sync_clubs — (admin) importe/actualise la liste
//  des clubs de la saison depuis API-Football (noms, logos, codes)
// ============================================================
elseif ($method === 'POST' && $action === 'sync_clubs') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé à l\'administrateur']);
        exit();
    }

    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDemandee($db, isset($data['saison_id']) ? intval($data['saison_id']) : null);

    $stmt = $db->prepare('SELECT annee_debut FROM saisons WHERE id = ?');
    $stmt->execute([$saisonId]);
    $annee = (int)$stmt->fetchColumn();
    if (!$annee) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Saison introuvable']);
        exit();
    }

    $url = "https://v3.football.api-sports.io/teams?league=" . API_FOOTBALL_LIGUE1_ID . "&season={$annee}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . API_FOOTBALL_KEY],
        CURLOPT_TIMEOUT        => 20,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        http_response_code(502);
        echo json_encode(['erreur' => "Erreur API-Football (HTTP $httpCode)"]);
        exit();
    }

    $data_api = json_decode($response, true);
    if (empty($data_api['response'])) {
        http_response_code(502);
        echo json_encode(['erreur' => 'Réponse API vide — la liste des clubs de cette saison n\'est peut-être pas encore publiée']);
        exit();
    }

    $inseres  = 0;
    $modifies = 0;
    $erreurs  = [];

    foreach ($data_api['response'] as $t) {
        try {
            $team = $t['team'];
            $venue = $t['venue'] ?? [];

            // nom_court : on prend le nom sans suffixe (ex: "Paris Saint Germain" → tel quel,
            // à ajuster manuellement ensuite si besoin — l'API ne fournit pas de "nom court" dédié)
            $nom_court = $team['name'];
            $code_base = strtoupper(preg_replace('/[^A-Za-z]/', '', $team['code'] ?? substr($team['name'], 0, 3)));
            if (!$code_base) $code_base = 'CLB';
            $code_base = substr($code_base, 0, 4);

            // 1. Chercher un club existant par apf_id (cas normal)…
            $existe = $db->prepare('SELECT id FROM clubs WHERE saison_id = ? AND apf_id = ?');
            $existe->execute([$saisonId, $team['id']]);
            $row = $existe->fetch();

            // …sinon par code ou nom (cas d'un club déjà présent en base SANS apf_id,
            // par ex. saisi manuellement lors de la création de la saison — c'est ce
            // qui causait l'erreur de doublon précédente)
            if (!$row) {
                $existe2 = $db->prepare('SELECT id FROM clubs WHERE saison_id = ? AND (code = ? OR nom_court = ? OR nom = ?)');
                $existe2->execute([$saisonId, $code_base, $team['name'], $team['name']]);
                $row = $existe2->fetch();
            }

            // Désambiguïser si ce code est pris par un AUTRE club (id différent) de la saison
            // (ex: "Stade Rennais" et "Stade Brestois" donneraient tous les deux "STA")
            $code = $code_base;
            $suffixe = 1;
            while (true) {
                $check = $db->prepare('SELECT id FROM clubs WHERE saison_id = ? AND code = ? AND id != ?');
                $check->execute([$saisonId, $code, $row['id'] ?? 0]);
                if (!$check->fetch()) break;
                $suffixe++;
                $code = substr($code_base, 0, 3) . $suffixe;
            }

            if ($row) {
                // Club déjà existant : on ne touche jamais à nom / nom_court / code
                // (personnalisés à la main par l'admin) — seuls les champs
                // "techniques" venant d'API-Football sont maintenus à jour.
                $db->prepare('
                    UPDATE clubs SET apf_id = ?, logo_url = ?, stade = ?, ville = ?
                    WHERE id = ?
                ')->execute([$team['id'], $team['logo'] ?? null,
                             $venue['name'] ?? null, $venue['city'] ?? null, $row['id']]);
                $modifies++;
            } else {
                $db->prepare('
                    INSERT INTO clubs (saison_id, apf_id, nom, nom_court, code, logo_url, stade, ville)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ')->execute([$saisonId, $team['id'], $team['name'], $nom_court, $code,
                             $team['logo'] ?? null, $venue['name'] ?? null, $venue['city'] ?? null]);
                $inseres++;
            }
        } catch (Exception $e) {
            $erreurs[] = ($t['team']['name'] ?? '?') . ' : ' . $e->getMessage();
        }
    }

    // Le cache de classement des équipes référence les clubs par id — on le
    // régénère après toute synchro (utile notamment à l'initialisation d'une
    // nouvelle saison, pour que l'onglet Classement affiche déjà les 18
    // équipes à 0 pt au lieu d'attendre le premier match calculé).
    rafraichirClassementEquipes($db, $saisonId);

    echo json_encode([
        'statut'   => 'OK',
        'inseres'  => $inseres,
        'modifies' => $modifies,
        'erreurs'  => $erreurs,
        'total'    => count($data_api['response']),
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

// Note : _syncEffectif / _convertirPoste ont été déplacées dans
// utils.php (syncEffectifAvecDiff / _convertirPoste), partagées
// avec cron_sync.php pour la veille mercato automatique.
