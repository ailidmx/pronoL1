<?php
// ============================================================
//  PRONO-L1 — Gestion des matchs
//  Fichier : api/matches.php
//
//  Actions disponibles :
//  GET  ?action=saisons             → liste des saisons disponibles
//  GET  ?action=journee&journee=X   → matchs d'une journée
//  GET  ?action=prochaine           → prochaine journée à jouer
//  GET  ?action=resultats           → journées terminées
//  GET  ?action=programme           → journées à venir
//  POST ?action=sync                → sync depuis API-Football (admin)
//  POST ?action=sync_journee&journee=X → sync une journée précise (admin)
//                                        (met aussi à jour club_dom_id/
//                                        club_ext_id, comme "sync" — utile
//                                        pour corriger une inversion
//                                        domicile/extérieur décidée par la
//                                        LFP sans resynchroniser les 34
//                                        journées. Si un match change de
//                                        sens, ses pronostics/cotes existants
//                                        ne sont PAS touchés automatiquement
//                                        — un avertissement est renvoyé dans
//                                        la réponse pour que l'admin les
//                                        vérifie/supprime lui-même.)
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=saisons
//  Liste des saisons disponibles (pour le sélecteur de saison)
// ============================================================
if ($method === 'GET' && $action === 'saisons') {
    $stmt = $db->query('
        SELECT id, label, annee_debut, annee_fin, statut, nb_journees
        FROM saisons
        ORDER BY annee_debut DESC
    ');
    echo json_encode(['statut' => 'OK', 'saisons' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  GET ?action=journee&journee=X
//  Retourne tous les matchs d'une journée avec infos clubs
// ============================================================
elseif ($method === 'GET' && $action === 'journee') {
    $saisonId = saisonDepuisRequete($db);
    $journee = intval($_GET['journee'] ?? 0);

    if (!$journee) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Numéro de journée manquant']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT
            m.id, m.journee, m.journee_initiale, m.date, m.date_initiale,
            m.score_dom, m.score_ext, m.statut, m.reporte,
            c1.id AS club_dom_id, c1.nom AS nom_dom, c1.nom_court AS court_dom,
            c1.code AS code_dom, c1.logo_url AS logo_dom,
            c1.couleur1 AS couleur_dom, c1.stade AS stade,
            c2.id AS club_ext_id, c2.nom AS nom_ext, c2.nom_court AS court_ext,
            c2.code AS code_ext, c2.logo_url AS logo_ext,
            c2.couleur1 AS couleur_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.journee = ?
        ORDER BY m.date ASC
    ');
    $stmt->execute([$saisonId, $journee]);
    $matchs = $stmt->fetchAll();

    // Si l'utilisateur est connecté, on ajoute son pronostic sur chaque match
    // (vérification optionnelle : un visiteur non connecté peut quand même
    // consulter la liste des matchs, simplement sans "mon_prono").
    // NB : le token vit dans la table `sessions` (voir verifierToken() dans
    // utils.php) — PAS dans users.token/token_expire, colonnes obsolètes qui
    // ne sont plus tenues à jour par la vraie connexion. Ce code utilisait
    // par erreur ces anciennes colonnes, ce qui faisait échouer silencieusement
    // la détection : mon_prono n'était jamais ajouté, même connecté.
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token   = str_replace('Bearer ', '', $auth);
    $user_id = null;

    if ($token) {
        $s = $db->prepare('
            SELECT u.id FROM users u
            JOIN sessions s ON s.user_id = u.id
            WHERE s.token = ? AND s.expire > NOW()
        ');
        $s->execute([$token]);
        $u = $s->fetch();
        if ($u) $user_id = $u['id'];
    }

    // Nombre de pronostics déjà saisis par match (tous joueurs confondus),
    // en une seule requête groupée plutôt qu'une requête par match.
    $ids = array_column($matchs, 'id');
    if ($ids) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $s = $db->prepare("
            SELECT match_id, COUNT(*) AS nb
            FROM pronostics
            WHERE match_id IN ($placeholders)
            GROUP BY match_id
        ");
        $s->execute($ids);
        $nbParMatch = [];
        foreach ($s->fetchAll() as $row) {
            $nbParMatch[$row['match_id']] = (int)$row['nb'];
        }
        foreach ($matchs as &$m) {
            $m['nb_pronos'] = $nbParMatch[$m['id']] ?? 0;
        }
        unset($m);

        // Cotes — 3 requêtes groupées (1 par source), jamais une requête
        // par match, sur le même principe que nb_pronos ci-dessus.
        $cotesParMatch = _chargerCotesPourMatchs($db, $ids);
        foreach ($matchs as &$m) {
            $m['cotes'] = $cotesParMatch[$m['id']] ?? null;
        }
        unset($m);
    }

    if ($user_id) {
        $ids = array_column($matchs, 'id');
        if ($ids) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $s = $db->prepare("
                SELECT match_id, score_dom_pred, score_ext_pred, resultat, points
                FROM pronostics
                WHERE user_id = ? AND match_id IN ($placeholders)
            ");
            $s->execute(array_merge([$user_id], $ids));
            $pronos = [];
            foreach ($s->fetchAll() as $p) {
                $pronos[$p['match_id']] = $p;
            }
            foreach ($matchs as &$m) {
                $m['mon_prono'] = $pronos[$m['id']] ?? null;
            }
            unset($m);
        }
    }

    echo json_encode([
        'statut'  => 'OK',
        'journee' => $journee,
        'matchs'  => $matchs
    ]);
    exit();
}

// ============================================================
//  GET ?action=prochaine
//  Retourne le numéro de la prochaine journée non terminée
// ============================================================
elseif ($method === 'GET' && $action === 'prochaine') {
    $saisonId = saisonDepuisRequete($db);
    // Cherche la première journée avec au moins un match à venir ou en cours
    $stmt = $db->prepare('
        SELECT MIN(journee) AS journee
        FROM matches
        WHERE saison_id = ? AND statut IN (\'a_venir\', \'en_cours\')
    ');
    $stmt->execute([$saisonId]);
    $row = $stmt->fetch();

    if (!$row['journee']) {
        // Toutes les journées sont terminées → retourner la dernière
        $stmt = $db->prepare('SELECT MAX(journee) AS journee FROM matches WHERE saison_id = ?');
        $stmt->execute([$saisonId]);
        $row = $stmt->fetch();
    }

    echo json_encode(['statut' => 'OK', 'journee' => (int)$row['journee']]);
    exit();
}

// ============================================================
//  GET ?action=resultats
//  Retourne les journées terminées (pour la page Résultats)
// ============================================================
elseif ($method === 'GET' && $action === 'resultats') {
    $saisonId = saisonDepuisRequete($db);
    $stmt = $db->prepare('
        SELECT DISTINCT journee
        FROM matches
        WHERE saison_id = ?
        AND statut = \'termine\'
        ORDER BY journee DESC
    ');
    $stmt->execute([$saisonId]);
    echo json_encode(['statut' => 'OK', 'journees' => $stmt->fetchAll(PDO::FETCH_COLUMN)]);
    exit();
}

// ============================================================
//  GET ?action=programme
//  Retourne les matchs à venir (toutes journées)
//  &filtre=normal (défaut) → seulement les matchs 'a_venir'
//  &filtre=retard           → seulement les matchs 'reporte'
//  &filtre=tout              → 'a_venir' + 'reporte'
// ============================================================
elseif ($method === 'GET' && $action === 'programme') {
    $saisonId = saisonDepuisRequete($db);
    $limit    = intval($_GET['limit'] ?? 20);
    $filtre   = $_GET['filtre'] ?? 'normal';

    $conditions = match($filtre) {
        'retard' => "m.statut = 'reporte'",
        'tout'   => "m.statut IN ('a_venir', 'reporte')",
        default  => "m.statut = 'a_venir'",
    };

    $sql = "
        SELECT
            m.id, m.journee, m.journee_initiale, m.date, m.date_initiale, m.statut,
            c1.nom_court AS nom_dom, c1.code AS code_dom, c1.logo_url AS logo_dom,
            c2.nom_court AS nom_ext, c2.code AS code_ext, c2.logo_url AS logo_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = :saison_id AND $conditions
        ORDER BY (m.date IS NULL) ASC, m.date ASC
    ";
    // Pas de LIMIT pour "retard" : en pratique très peu de matchs reportés
    // à la fois, pas besoin de tronquer la liste.
    if ($filtre !== 'retard') {
        $sql .= ' LIMIT :limite';
    }

    $stmt = $db->prepare($sql);
    $stmt->bindValue(':saison_id', $saisonId, PDO::PARAM_INT);
    if ($filtre !== 'retard') {
        $stmt->bindValue(':limite', $limit, PDO::PARAM_INT);
    }
    $stmt->execute();

    echo json_encode(['statut' => 'OK', 'matchs' => $stmt->fetchAll(), 'filtre' => $filtre]);
    exit();
}

// ============================================================
//  GET ?action=grille
//  Retourne tous les scores pour le tableau croisé 18x18
// ============================================================
elseif ($method === 'GET' && $action === 'grille') {
    $saisonId = saisonDepuisRequete($db);
    $stmt = $db->prepare('
        SELECT
            m.club_dom_id, m.club_ext_id, m.score_dom, m.score_ext, m.statut,
            c1.nom_court AS nom_dom,
            c2.nom_court AS nom_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.statut = \'termine\'
        ORDER BY m.journee ASC
    ');
    $stmt->execute([$saisonId]);
    echo json_encode(['statut' => 'OK', 'matchs' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  POST ?action=sync — synchronisation complète depuis API-Football
//  Importe tous les matchs de la saison (admin uniquement)
//  Un seul appel (plan Pro, 300 req/min — largement suffisant
//  pour les ~306 matchs de la saison en une fois)
// ============================================================
elseif ($method === 'POST' && $action === 'sync') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data     = json_decode(file_get_contents('php://input'), true);
    $saison   = intval($data['annee_debut'] ?? 2025); // ex: 2025 pour la saison 2025-26, 2026 pour 2026-27
    $saisonId = saisonDemandee($db, isset($data['saison_id']) ? intval($data['saison_id']) : null);

    // Synchro complète = beaucoup d'itérations (306 matchs) ; on s'assure
    // de ne pas être coupé par la limite de temps d'exécution PHP par
    // défaut (30s) avant la fin de la boucle. ignore_user_abort() permet
    // en plus au script de terminer correctement en base même si le
    // navigateur ou le reverse-proxy du NAS coupe la connexion avant la
    // fin (le résultat JSON ne sera alors simplement pas vu par le
    // navigateur, mais la synchro en base sera quand même complète).
    set_time_limit(120);
    ignore_user_abort(true);

    $url = 'https://v3.football.api-sports.io/fixtures?' . http_build_query([
        'league' => API_FOOTBALL_LIGUE1_ID,
        'season' => $saison,
    ]);
    $data_api = _apiFootballCall($url);

    if ($data_api === null || !isset($data_api['response'])) {
        http_response_code(502);
        echo json_encode(['erreur' => 'Erreur API-Football ou réponse inattendue']);
        exit();
    }

    $inseres  = 0;
    $modifies = 0;
    $erreurs  = [];

    // Préchargement en mémoire — au lieu d'interroger la base pour chaque
    // club et chaque match à l'intérieur de la boucle (ce qui faisait
    // ~1500-2000 petites requêtes sur 306 matchs et provoquait un timeout
    // du reverse-proxy du NAS), on charge tout en 2 requêtes groupées.
    $clubsRows = $db->prepare('SELECT id, apf_id, logo_url FROM clubs WHERE saison_id = ?');
    $clubsRows->execute([$saisonId]);
    $mapClubParApf   = []; // apf_id  → club_id
    $mapLogoManquant = []; // club_id → true si logo_url encore NULL
    foreach ($clubsRows->fetchAll() as $c) {
        if ($c['apf_id']) $mapClubParApf[(int)$c['apf_id']] = (int)$c['id'];
        if (empty($c['logo_url'])) $mapLogoManquant[(int)$c['id']] = true;
    }

    $matchsRows = $db->prepare('SELECT id, apf_fixture_id, domicile_verrouille FROM matches WHERE saison_id = ? AND apf_fixture_id IS NOT NULL');
    $matchsRows->execute([$saisonId]);
    $mapMatchParFixture = []; // apf_fixture_id → match_id
    $mapVerrouParFixture = []; // apf_fixture_id → domicile_verrouille (0/1)
    foreach ($matchsRows->fetchAll() as $mrow) {
        $mapMatchParFixture[(int)$mrow['apf_fixture_id']]  = (int)$mrow['id'];
        $mapVerrouParFixture[(int)$mrow['apf_fixture_id']] = (int)$mrow['domicile_verrouille'];
    }

    foreach ($data_api['response'] as $m) {
        try {
            $apf_fixture_id = $m['fixture']['id'] ?? null;
            $round          = $m['league']['round'] ?? '';
            $journee        = _extraireJourneeApf($round);
            $date_utc       = !empty($m['fixture']['date']) ? gmdate('Y-m-d H:i:s', strtotime($m['fixture']['date'])) : null;
            $statut         = _convertirStatutApf($m['fixture']['status']['short'] ?? '');

            // Rounds hors championnat (Coupe de France, amicaux...) ou
            // données de fixture incomplètes — filet de sécurité
            if ($journee === null || !$apf_fixture_id || !$date_utc) continue;

            $score_dom = $m['goals']['home'] ?? null;
            $score_ext = $m['goals']['away'] ?? null;

            $nom_dom = $m['teams']['home']['name'] ?? '';
            $nom_ext = $m['teams']['away']['name'] ?? '';
            $id_dom  = $m['teams']['home']['id']   ?? null;
            $id_ext  = $m['teams']['away']['id']   ?? null;

            if (!$id_dom || !$id_ext) {
                $erreurs[] = "Fixture apf_id={$apf_fixture_id} : équipe(s) manquante(s) dans la réponse API (J{$journee})";
                continue;
            }

            // Retrouver les clubs via la map préchargée (cas normal, quasi
            // toujours vrai puisque le mercato peuple déjà apf_id) — repli
            // sur _trouverClubApf() (requête DB) seulement si vraiment absent.
            $club_dom = $mapClubParApf[(int)$id_dom] ?? _trouverClubApf($db, (int)$id_dom, $nom_dom, $saisonId);
            $club_ext = $mapClubParApf[(int)$id_ext] ?? _trouverClubApf($db, (int)$id_ext, $nom_ext, $saisonId);

            if (!$club_dom || !$club_ext) {
                $erreurs[] = "Club introuvable : {$nom_dom} vs {$nom_ext} (J{$journee})";
                continue;
            }

            // Mise à jour logo si manquant (via la map préchargée, pas de
            // requête SELECT supplémentaire — juste l'UPDATE si besoin)
            if (!empty($m['teams']['home']['logo']) && !empty($mapLogoManquant[$club_dom])) {
                _mettreAJourLogo($db, $club_dom, $m['teams']['home']['logo']);
                unset($mapLogoManquant[$club_dom]);
            }
            if (!empty($m['teams']['away']['logo']) && !empty($mapLogoManquant[$club_ext])) {
                _mettreAJourLogo($db, $club_ext, $m['teams']['away']['logo']);
                unset($mapLogoManquant[$club_ext]);
            }

            // INSERT ou UPDATE — clé de correspondance : apf_fixture_id
            $matchId = $mapMatchParFixture[$apf_fixture_id] ?? null;

            if ($matchId) {
                appliquerMajMatch($db, $matchId, $journee, $date_utc, $score_dom, $score_ext, $statut, $club_dom, $club_ext);
                // Si le match est verrouillé (domicile/extérieur corrigé à
                // la main en avance sur l'API — ex: inversion LFP), on ne
                // touche surtout pas à club_dom_id/club_ext_id tant que
                // l'API n'a pas basculé à son tour (appliquerMajMatch()
                // s'est déjà chargé de réorienter le score si besoin).
                if (empty($mapVerrouParFixture[$apf_fixture_id])) {
                    $db->prepare('UPDATE matches SET club_dom_id = ?, club_ext_id = ? WHERE id = ?')
                       ->execute([$club_dom, $club_ext, $matchId]);
                }
                $modifies++;
            } else {
                $db->prepare('
                    INSERT INTO matches
                        (saison_id, apf_fixture_id, journee, date, club_dom_id, club_ext_id,
                         score_dom, score_ext, statut)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ')->execute([$saisonId, $apf_fixture_id, $journee, $date_utc, $club_dom, $club_ext,
                             $score_dom, $score_ext, $statut]);
                $inseres++;
            }

        } catch (\Throwable $e) {
            // \Throwable (et pas seulement Exception) pour aussi capter les
            // TypeError PHP 8 (ex: champ inattendu null) sans faire planter
            // toute la synchro sur un seul match problématique.
            $erreurs[] = "Match apf_fixture_id=" . ($m['fixture']['id'] ?? '?') . " : " . $e->getMessage();
        }
    }

    // Calcul des points après sync
    _calculerPoints($db, null, $saisonId);
    verifierChampionsJournee($db, $saisonId);

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
//  POST ?action=sync_journee&journee=X
//  Sync une journée précise (plus rapide, moins d'appels API)
// ============================================================
elseif ($method === 'POST' && $action === 'sync_journee') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data     = json_decode(file_get_contents('php://input'), true);
    $journee  = intval($data['journee'] ?? 0);
    $saison   = intval($data['annee_debut'] ?? 2025);
    $saisonId = saisonDemandee($db, isset($data['saison_id']) ? intval($data['saison_id']) : null);

    if (!$journee) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Numéro de journée manquant']);
        exit();
    }

    $url = 'https://v3.football.api-sports.io/fixtures?' . http_build_query([
        'league' => API_FOOTBALL_LIGUE1_ID,
        'season' => $saison,
        'round'  => "Regular Season - {$journee}",
    ]);
    $data_api = _apiFootballCall($url);

    if ($data_api === null || !isset($data_api['response'])) {
        http_response_code(502);
        echo json_encode(['erreur' => 'Erreur API-Football ou réponse inattendue']);
        exit();
    }

    $inseres       = 0;
    $modifies      = 0;
    $erreurs       = [];
    $avertissements = [];

    foreach ($data_api['response'] as $m) {
        try {
            $apf_fixture_id = $m['fixture']['id'] ?? null;
            $date_utc       = !empty($m['fixture']['date']) ? gmdate('Y-m-d H:i:s', strtotime($m['fixture']['date'])) : null;
            $statut         = _convertirStatutApf($m['fixture']['status']['short'] ?? '');
            if (!$apf_fixture_id || !$date_utc) continue;

            $score_dom = $m['goals']['home'] ?? null;
            $score_ext = $m['goals']['away'] ?? null;

            // Équipes — récupérées systématiquement (plus seulement dans le
            // cas "insertion") afin de pouvoir détecter et corriger une
            // inversion domicile/extérieur sur un match déjà connu, comme
            // le fait l'action "sync" globale.
            $nom_dom = $m['teams']['home']['name'] ?? '';
            $nom_ext = $m['teams']['away']['name'] ?? '';
            $id_dom  = $m['teams']['home']['id']   ?? null;
            $id_ext  = $m['teams']['away']['id']   ?? null;
            if (!$id_dom || !$id_ext) {
                $erreurs[] = "Fixture apf_id={$apf_fixture_id} : équipe(s) manquante(s) (J{$journee})";
                continue;
            }

            $club_dom = _trouverClubApf($db, (int)$id_dom, $nom_dom, $saisonId);
            $club_ext = _trouverClubApf($db, (int)$id_ext, $nom_ext, $saisonId);
            if (!$club_dom || !$club_ext) {
                $erreurs[] = "Club introuvable : {$nom_dom} vs {$nom_ext} (J{$journee})";
                continue;
            }

            if (!empty($m['teams']['home']['logo'])) _mettreAJourLogo($db, $club_dom, $m['teams']['home']['logo']);
            if (!empty($m['teams']['away']['logo'])) _mettreAJourLogo($db, $club_ext, $m['teams']['away']['logo']);

            $existing = $db->prepare('SELECT id, club_dom_id, club_ext_id, domicile_verrouille FROM matches WHERE apf_fixture_id = ?');
            $existing->execute([$apf_fixture_id]);
            $matchRow = $existing->fetch();

            if ($matchRow) {
                $matchId    = (int)$matchRow['id'];
                $verrouille = (int)$matchRow['domicile_verrouille'];

                // Détection d'un changement domicile/extérieur (ex : match
                // inversé par la LFP) — sans effet si le match est verrouillé
                // (domicile_verrouille = 1) : ça veut dire qu'on a déjà
                // corrigé le sens à la main, en avance sur l'API. Dans ce
                // cas on ne touche PAS club_dom_id/club_ext_id et on ne
                // prévient pas non plus (rien d'anormal, l'API n'a
                // simplement pas encore basculé). appliquerMajMatch() se
                // charge quand même de réorienter le score si le match
                // vient de se terminer pendant que c'est encore verrouillé.
                if (!$verrouille && ((int)$matchRow['club_dom_id'] !== $club_dom || (int)$matchRow['club_ext_id'] !== $club_ext)) {
                    $stmtP = $db->prepare('SELECT COUNT(*) FROM pronostics WHERE match_id = ?');
                    $stmtP->execute([$matchId]);
                    $nbPronos = (int)$stmtP->fetchColumn();

                    $stmtC = $db->prepare('SELECT COUNT(*) FROM cotes_matchs WHERE match_id = ?');
                    $stmtC->execute([$matchId]);
                    $nbCotes = (int)$stmtC->fetchColumn();

                    $avertissements[] = "Match id={$matchId} (J{$journee}, {$nom_dom} - {$nom_ext}) : "
                        . "domicile/extérieur modifié par l'API. "
                        . ($nbPronos > 0 ? "{$nbPronos} pronostic(s) existant(s) à vérifier/supprimer manuellement." : "aucun pronostic existant.")
                        . " "
                        . ($nbCotes > 0 ? "{$nbCotes} ligne(s) de cotes à vérifier/supprimer manuellement." : "aucune cote existante.");
                }

                appliquerMajMatch($db, $matchId, $journee, $date_utc, $score_dom, $score_ext, $statut, $club_dom, $club_ext);
                if (!$verrouille) {
                    $db->prepare('UPDATE matches SET club_dom_id = ?, club_ext_id = ? WHERE id = ?')
                       ->execute([$club_dom, $club_ext, $matchId]);
                }
                $modifies++;
            } else {
                // Match encore inconnu en base (1ère synchro de la saison) →
                // création complète, comme le fait l'action "sync" globale
                $db->prepare('
                    INSERT INTO matches
                        (saison_id, apf_fixture_id, journee, date, club_dom_id, club_ext_id,
                         score_dom, score_ext, statut)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ')->execute([$saisonId, $apf_fixture_id, $journee, $date_utc, $club_dom, $club_ext,
                             $score_dom, $score_ext, $statut]);
                $inseres++;
            }
        } catch (\Throwable $e) {
            $erreurs[] = "Match apf_fixture_id=" . ($m['fixture']['id'] ?? '?') . " : " . $e->getMessage();
        }
    }

    // Calcul des points pour les matchs terminés de cette journée
    _calculerPoints($db, $journee, $saisonId);
    verifierChampionsJournee($db, $saisonId);

    echo json_encode([
        'statut'         => 'OK',
        'journee'        => $journee,
        'inseres'        => $inseres,
        'modifies'       => $modifies,
        'erreurs'        => $erreurs,
        'avertissements' => $avertissements,
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
//  FONCTIONS UTILITAIRES PRIVÉES
// ============================================================

// _convertirStatut() et _trouverClub() (football-data.org) ont été
// retirées d'ici : remplacées par _convertirStatutApf() et
// _trouverClubApf() dans utils.php, désormais partagées avec
// cron_sync.php pour éviter la duplication.

// ============================================================
//  Charge les cotes (API bookmakers + "maison" joueurs + score exact
//  le plus pronostiqué) pour une liste de matchs, en 3 requêtes
//  groupées au total (jamais une requête par match) :
//   1. cotes_matchs (déjà calculées par le cron, une ligne par match)
//   2. répartition 1/N/2 des pronostics, groupée par match_id
//   3. répartition des scores exacts pronostiqués, groupée par
//      match_id + score — le "plus populaire" par match est ensuite
//      simplement dégagé en PHP (peu de lignes, pas de calcul lourd)
//  Retourne un tableau [match_id => structure cotes] prêt à attacher
//  à chaque match dans la réponse JSON.
// ============================================================
function _chargerCotesPourMatchs(PDO $db, array $matchIds): array {
    if (empty($matchIds)) return [];
    $placeholders = implode(',', array_fill(0, count($matchIds), '?'));

    // 1. Cotes bookmakers (API) — valeurs en direct (alimentées par le
    //    cron) + valeurs figées au coup d'envoi (colonnes *_figee, NULL
    //    tant que le match n'a pas encore démarré)
    $stmt = $db->prepare("
        SELECT match_id, cote_dom_api, cote_nul_api, cote_ext_api, nb_bookmakers_api,
               cote_dom_api_figee, cote_nul_api_figee, cote_ext_api_figee,
               cote_dom_joueurs_figee, cote_nul_joueurs_figee, cote_ext_joueurs_figee,
               score_exact_populaire_figee_dom, score_exact_populaire_figee_ext,
               score_exact_populaire_figee_nb, score_exact_populaire_figee_pct,
               score_exact_populaire_figee_scores,
               figee_le
        FROM cotes_matchs
        WHERE match_id IN ($placeholders)
    ");
    $stmt->execute($matchIds);
    $apiParMatch = [];
    $figeeParMatch = [];
    foreach ($stmt->fetchAll() as $row) {
        $matchId = (int)$row['match_id'];
        $apiParMatch[$matchId] = [
            'dom'           => $row['cote_dom_api']  !== null ? (float)$row['cote_dom_api']  : null,
            'nul'           => $row['cote_nul_api']  !== null ? (float)$row['cote_nul_api']  : null,
            'ext'           => $row['cote_ext_api']  !== null ? (float)$row['cote_ext_api']  : null,
            'nb_bookmakers' => (int)$row['nb_bookmakers_api'],
        ];

        if ($row['figee_le'] !== null) {
            $figeeParMatch[$matchId] = [
                'api' => ($row['cote_dom_api_figee'] !== null || $row['cote_nul_api_figee'] !== null || $row['cote_ext_api_figee'] !== null) ? [
                    'dom' => $row['cote_dom_api_figee'] !== null ? (float)$row['cote_dom_api_figee'] : null,
                    'nul' => $row['cote_nul_api_figee'] !== null ? (float)$row['cote_nul_api_figee'] : null,
                    'ext' => $row['cote_ext_api_figee'] !== null ? (float)$row['cote_ext_api_figee'] : null,
                ] : null,
                'joueurs' => ($row['cote_dom_joueurs_figee'] !== null || $row['cote_nul_joueurs_figee'] !== null || $row['cote_ext_joueurs_figee'] !== null) ? [
                    'dom' => $row['cote_dom_joueurs_figee'] !== null ? (float)$row['cote_dom_joueurs_figee'] : null,
                    'nul' => $row['cote_nul_joueurs_figee'] !== null ? (float)$row['cote_nul_joueurs_figee'] : null,
                    'ext' => $row['cote_ext_joueurs_figee'] !== null ? (float)$row['cote_ext_joueurs_figee'] : null,
                ] : null,
                'score_populaire' => $row['score_exact_populaire_figee_nb'] !== null ? [
                    'nb'      => (int)$row['score_exact_populaire_figee_nb'],
                    'pct'     => (float)$row['score_exact_populaire_figee_pct'],
                    'scores'  => $row['score_exact_populaire_figee_scores']
                        ? json_decode($row['score_exact_populaire_figee_scores'], true)
                        : [['dom' => (int)$row['score_exact_populaire_figee_dom'], 'ext' => (int)$row['score_exact_populaire_figee_ext']]],
                    'egalite' => $row['score_exact_populaire_figee_scores']
                        ? count(json_decode($row['score_exact_populaire_figee_scores'], true)) > 1
                        : false,
                ] : null,
            ];
        }
    }

    // 2. Répartition 1/N/2 des pronostics des joueurs
    $stmt = $db->prepare("
        SELECT
            match_id,
            COUNT(*) AS nb_total,
            SUM(CASE WHEN score_dom_pred > score_ext_pred THEN 1 ELSE 0 END) AS nb_dom,
            SUM(CASE WHEN score_dom_pred = score_ext_pred THEN 1 ELSE 0 END) AS nb_nul,
            SUM(CASE WHEN score_dom_pred < score_ext_pred THEN 1 ELSE 0 END) AS nb_ext
        FROM pronostics
        WHERE match_id IN ($placeholders)
        GROUP BY match_id
    ");
    $stmt->execute($matchIds);
    $SEUIL_MIN_PRONOS = 5;
    $joueursParMatch = [];
    foreach ($stmt->fetchAll() as $row) {
        $matchId = (int)$row['match_id'];
        $nbTotal = (int)$row['nb_total'];
        if ($nbTotal < $SEUIL_MIN_PRONOS) {
            $joueursParMatch[$matchId] = ['suffisant' => false, 'nb_pronos' => $nbTotal, 'seuil' => $SEUIL_MIN_PRONOS];
            continue;
        }
        $joueursParMatch[$matchId] = [
            'suffisant' => true,
            'nb_pronos' => $nbTotal,
            'dom'       => (int)$row['nb_dom'] > 0 ? round($nbTotal / (int)$row['nb_dom'], 2) : null,
            'nul'       => (int)$row['nb_nul'] > 0 ? round($nbTotal / (int)$row['nb_nul'], 2) : null,
            'ext'       => (int)$row['nb_ext'] > 0 ? round($nbTotal / (int)$row['nb_ext'], 2) : null,
        ];
    }

    // 3. Score exact le plus pronostiqué par match — une seule requête
    //    groupée (match + score), le "plus populaire" par match est
    //    dégagé ensuite en PHP (nb de lignes toujours faible : quelques
    //    dizaines de scores distincts par match tout au plus)
    $stmt = $db->prepare("
        SELECT match_id, score_dom_pred, score_ext_pred, COUNT(*) AS nb
        FROM pronostics
        WHERE match_id IN ($placeholders)
        GROUP BY match_id, score_dom_pred, score_ext_pred
    ");
    $stmt->execute($matchIds);
    // matchId => ['nb' => plus haut nombre de voix, 'scores' => [ {dom,ext}, ... ]
    //             tous les scores à égalité sur ce plus haut nombre de voix ]
    $meilleurScoreParMatch = [];
    foreach ($stmt->fetchAll() as $row) {
        $matchId = (int)$row['match_id'];
        $nb      = (int)$row['nb'];
        $score   = ['dom' => (int)$row['score_dom_pred'], 'ext' => (int)$row['score_ext_pred']];
        if (!isset($meilleurScoreParMatch[$matchId]) || $nb > $meilleurScoreParMatch[$matchId]['nb']) {
            $meilleurScoreParMatch[$matchId] = ['nb' => $nb, 'scores' => [$score]];
        } elseif ($nb === $meilleurScoreParMatch[$matchId]['nb']) {
            $meilleurScoreParMatch[$matchId]['scores'][] = $score;
        }
    }

    // Assemblage final par match
    $resultat = [];
    foreach ($matchIds as $matchId) {
        $joueurs = $joueursParMatch[$matchId] ?? null;
        $scorePop = null;
        if ($joueurs && !empty($joueurs['suffisant']) && isset($meilleurScoreParMatch[$matchId])) {
            $sp = $meilleurScoreParMatch[$matchId];
            $scorePop = [
                'scores'  => $sp['scores'],
                'nb'      => $sp['nb'],
                'pct'     => round($sp['nb'] / $joueurs['nb_pronos'] * 100, 1),
                'egalite' => count($sp['scores']) > 1,
            ];
        }
        $resultat[$matchId] = [
            'api'             => $apiParMatch[$matchId] ?? null,
            'joueurs'         => $joueurs,
            'score_populaire' => $scorePop,
            'figee'           => $figeeParMatch[$matchId] ?? null,
        ];
    }
    return $resultat;
}

function _mettreAJourLogo(PDO $db, int $club_id, string $logo_url): void {
    $db->prepare('UPDATE clubs SET logo_url = ? WHERE id = ? AND logo_url IS NULL')
       ->execute([$logo_url, $club_id]);
}

function _calculerPoints(PDO $db, ?int $journee, int $saisonId): void {
    $sql    = 'SELECT id FROM matches WHERE saison_id = ? AND statut = \'termine\' AND score_dom IS NOT NULL';
    $params = [$saisonId];
    if ($journee) {
        $sql    .= ' AND journee = ?';
        $params[] = $journee;
    }
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $match_id) {
        calculerPointsMatch($db, (int)$match_id);
    }
}
