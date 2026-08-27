<?php
// ============================================================
//  PRONO-L1 — Quizz hebdomadaire (concours parallèle)
//  Fichier : api/quizz.php
//
//  Étape 2 du projet quizz : uniquement les questions "pronostic"
//  (générées depuis les données déjà en base — buteur probable,
//  +/-2,5 buts, les 2 équipes marquent). Les questions "actu foot"
//  (IA + recherche web) viendront dans une étape suivante.
//
//  Actions disponibles :
//  GET  ?action=config              → config quizz de la saison (public)
//  POST ?action=config_maj          → (admin) modifie la config
//  POST ?action=generer_quizz       → (admin) génère le quizz de la
//  POST ?action=generer_quizz_treve → (admin) génère un quizz de
//                                      semaine de trêve (100% histo/actu)
//                                      prochaine journée sans quizz
//  POST ?action=valider             → (admin) publie un quizz en attente
//  GET  ?action=courant             → le quizz publié en cours (joueur connecté)
//  GET  ?action=mon_historique      → liste des quizz déjà répondus par le joueur
//  GET  ?action=mon_historique_detail&id=X → détail (réponses données/
//                                      bonnes réponses) d'un quizz déjà répondu
//  POST ?action=repondre            → soumet/modifie une réponse
//  POST ?action=ajouter_question_manuelle → (admin) ajoute une question
//                                      actu saisie à la main
//  POST ?action=supprimer_question  → (admin) retire une question
//                                      d'un quizz pas encore publié
//  POST ?action=supprimer_quizz_semaine → (admin) supprime un quizz
//                                      entier pas encore publié (doublon...)
//  POST ?action=resoudre            → (admin, ou cron) corrige les
//                                      questions dont le match est terminé
//  GET  ?action=classement          → classement quizz de la saison
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=config
// ============================================================
if ($method === 'GET' && $action === 'config') {
    $saisonId = saisonDepuisRequete($db);
    echo json_encode(['statut' => 'OK', 'config' => _chargerConfigQuizz($db, $saisonId)]);
    exit();
}

// ============================================================
//  POST ?action=config_maj (admin)
// ============================================================
elseif ($method === 'POST' && $action === 'config_maj') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);

    $champs = [
        'nb_questions_normale' => 1, 'nb_questions_treve' => 1,
        'pts_bonne_reponse'    => 0, 'bonus_sans_faute_pct' => 0,
        'timer_secondes_actu'  => 1, 'nb_actu_normale'      => 0,
        'nb_histo_normale'     => 0, 'nb_histo_treve'       => 0,
        'duree_validite_special_jours' => 1,
    ];
    $valeurs = [];
    foreach ($champs as $c => $min) {
        $v = intval($data[$c] ?? -1);
        if ($v < $min) {
            http_response_code(400);
            echo json_encode(['erreur' => "Valeur invalide pour $c"]);
            exit();
        }
        $valeurs[$c] = $v;
    }
    if ($valeurs['nb_actu_normale'] + $valeurs['nb_histo_normale'] > $valeurs['nb_questions_normale']) {
        http_response_code(400);
        echo json_encode(['erreur' => 'La somme des questions actu + histo ne peut pas dépasser le nombre total de questions par semaine']);
        exit();
    }
    if ($valeurs['nb_histo_treve'] > $valeurs['nb_questions_treve']) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le nombre de questions histo (trêve) ne peut pas dépasser le total de la semaine de trêve']);
        exit();
    }

    $stmt = $db->prepare('SELECT id FROM quizz_config WHERE saison_id = ? LIMIT 1');
    $stmt->execute([$saisonId]);
    $existant = $stmt->fetchColumn();

    if ($existant) {
        $db->prepare('
            UPDATE quizz_config
            SET nb_questions_normale = ?, nb_questions_treve = ?, pts_bonne_reponse = ?,
                bonus_sans_faute_pct = ?, timer_secondes_actu = ?, nb_actu_normale = ?,
                nb_histo_normale = ?, nb_histo_treve = ?, duree_validite_special_jours = ?
            WHERE id = ?
        ')->execute([...array_values($valeurs), $existant]);
    } else {
        $db->prepare('
            INSERT INTO quizz_config
                (saison_id, nb_questions_normale, nb_questions_treve, pts_bonne_reponse, bonus_sans_faute_pct, timer_secondes_actu, nb_actu_normale, nb_histo_normale, nb_histo_treve, duree_validite_special_jours)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ')->execute([$saisonId, ...array_values($valeurs)]);
    }

    echo json_encode(['statut' => 'OK', 'config' => $valeurs]);
    exit();
}

// ============================================================
//  POST ?action=generer_quizz (admin)
//  Génère le quizz (statut 'a_valider') de la prochaine journée qui
//  n'a pas encore de quizz : un mélange de questions "pronostic"
//  (matchs à venir), "histo" (banque de faits établis) et "actu"
//  (IA + recherche web, avec garde-fou source vérifiable), selon la
//  répartition définie dans quizz_config.
// ============================================================
elseif ($method === 'POST' && $action === 'generer_quizz') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);
    $config   = _chargerConfigQuizz($db, $saisonId);

    // Prochaine journée à venir qui n'a pas encore de ligne quizz_semaine
    $stmt = $db->prepare("
        SELECT DISTINCT journee FROM matches
        WHERE saison_id = ? AND statut = 'a_venir'
          AND journee NOT IN (
              SELECT journee FROM quizz_semaine WHERE saison_id = ? AND journee IS NOT NULL
          )
        ORDER BY journee ASC LIMIT 1
    ");
    $stmt->execute([$saisonId, $saisonId]);
    $journee = $stmt->fetchColumn();

    if ($journee === false) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Aucune journée à venir sans quizz — synchronisez le calendrier ou vérifiez qu\'il ne reste pas de journée en attente.']);
        exit();
    }
    $journee = (int)$journee;

    $stmt = $db->prepare("
        SELECT m.id, m.date, c1.nom_court AS nom_dom, c2.nom_court AS nom_ext,
               m.club_dom_id, m.club_ext_id
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.journee = ? AND m.statut = 'a_venir'
        ORDER BY m.date ASC
    ");
    $stmt->execute([$saisonId, $journee]);
    $matchsJournee = $stmt->fetchAll();

    if (empty($matchsJournee)) {
        http_response_code(400);
        echo json_encode(['erreur' => "Aucun match trouvé pour la journée $journee"]);
        exit();
    }

    $nbTotal   = $config['nb_questions_normale'];
    $nbActu    = min($config['nb_actu_normale'], $nbTotal);
    $nbHisto   = min($config['nb_histo_normale'], $nbTotal - $nbActu);
    $nbPronostic = min($nbTotal - $nbActu - $nbHisto, count($matchsJournee));

    // Tirage de N matchs distincts parmi la journée, pour varier chaque semaine
    $matchsChoisis = $matchsJournee;
    shuffle($matchsChoisis);
    $matchsChoisis = array_slice($matchsChoisis, 0, $nbPronostic);

    $templates  = ['plus_moins_25', 'btts', 'buteur'];
    // Date limite globale de la semaine = coup d'envoi du DERNIER match de
    // la journée (et non du premier) : elle ne sert qu'aux questions sans
    // match associé (histo/actu) et à l'affichage "jusqu'au ..." de
    // l'ensemble du quizz. Les questions pronostic, elles, restent
    // modifiables jusqu'au coup d'envoi de LEUR match précis, vérifié
    // séparément dans l'action "repondre" (voir $dateLimiteEffective).
    $dateLimite = max(array_column($matchsJournee, 'date'));

    // Génération "actu" AVANT la transaction : ça appelle une API
    // externe (peut prendre du temps), on ne veut pas garder une
    // transaction DB ouverte pendant ce délai
    $questionsActu = $nbActu > 0 ? _genererQuestionsActuIA($nbActu) : [];

    try {
        $db->beginTransaction();

        // Re-vérification à l'intérieur de la transaction : si deux requêtes de
        // génération partent en même temps (double-clic, requête renvoyée deux
        // fois...), la première SELECT plus haut (hors transaction) peut avoir
        // laissé passer les deux avant qu'aucune n'ait encore inséré sa ligne.
        // On revérifie donc juste avant l'insertion, verrouillée par la
        // transaction, pour éviter deux quizz_semaine sur la même journée.
        $stmtVerifDoublon = $db->prepare("SELECT id FROM quizz_semaine WHERE saison_id = ? AND journee = ? LIMIT 1 FOR UPDATE");
        $stmtVerifDoublon->execute([$saisonId, $journee]);
        if ($stmtVerifDoublon->fetchColumn()) {
            $db->rollBack();
            http_response_code(400);
            echo json_encode(['erreur' => "Un quizz existe déjà pour la journée $journee (généré entre-temps, peut-être via un double-clic) — rafraîchis la page admin."]);
            exit();
        }

        $db->prepare("
            INSERT INTO quizz_semaine (saison_id, journee, est_treve, statut, date_generation, date_limite)
            VALUES (?, ?, 0, 'a_valider', NOW(), ?)
        ")->execute([$saisonId, $journee, $dateLimite]);
        $quizzSemaineId = (int)$db->lastInsertId();

        $ordre = 1;
        $questionsGenerees = 0;
        $insertQuestion = $db->prepare("
            INSERT INTO quizz_questions (quizz_semaine_id, ordre, type, sous_type, enonce, match_id, source_url, resultat_connu)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $insertReponse = $db->prepare('
            INSERT INTO quizz_reponses_possibles (question_id, texte, club_id, est_correcte)
            VALUES (?, ?, ?, ?)
        ');

        // ── Questions pronostic (matchs) ──
        foreach ($matchsChoisis as $i => $match) {
            $sousType = $templates[$i % count($templates)];

            $candidats = [];
            if ($sousType === 'buteur') {
                $candidats = _candidatsButeurs($db, $saisonId, (int)$match['club_dom_id'], (int)$match['club_ext_id']);
                if (empty($candidats)) $sousType = 'plus_moins_25';
            }

            $enonce = "{$match['nom_dom']} - {$match['nom_ext']} : ";
            $reponses = [];

            if ($sousType === 'buteur') {
                $enonce .= "qui marquera dans ce match ?";
                $reponses = $candidats;
            } elseif ($sousType === 'btts') {
                $enonce .= "les deux équipes marqueront-elles ?";
                $reponses = [['texte' => 'Oui', 'club_id' => null], ['texte' => 'Non', 'club_id' => null]];
            } else {
                $enonce .= "plus ou moins de 2,5 buts ?";
                $reponses = [['texte' => 'Plus de 2,5 buts', 'club_id' => null], ['texte' => 'Moins de 2,5 buts', 'club_id' => null]];
            }

            $insertQuestion->execute([$quizzSemaineId, $ordre, 'pronostic', $sousType, $enonce, $match['id'], null, 0]);
            $questionId = (int)$db->lastInsertId();
            foreach ($reponses as $r) {
                $insertReponse->execute([$questionId, $r['texte'], $r['club_id'], null]);
            }
            $ordre++;
            $questionsGenerees++;
        }

        // ── Questions histo (banque, faits établis, jamais changeants) ──
        if ($nbHisto > 0) {
            $piochesHisto = _piocherQuestionsHisto($db, $nbHisto);

            $marquerUtilisee = $db->prepare('UPDATE quizz_banque_histo SET utilisee_le = NOW() WHERE id = ?');
            foreach ($piochesHisto as $h) {
                $reponsesHisto = json_decode($h['reponses'], true) ?: [];
                shuffle($reponsesHisto); // mélange l'ordre des options pour ne pas toujours mettre la bonne réponse à la même place
                $insertQuestion->execute([$quizzSemaineId, $ordre, 'histo', null, $h['enonce'], null, null, 1]);
                $questionId = (int)$db->lastInsertId();
                foreach ($reponsesHisto as $r) {
                    $insertReponse->execute([$questionId, $r['texte'], null, !empty($r['correcte']) ? 1 : 0]);
                }
                $marquerUtilisee->execute([$h['id']]);
                $ordre++;
                $questionsGenerees++;
            }
        }

        // ── Questions actu (IA + recherche web, déjà générées plus haut) ──
        foreach ($questionsActu as $qa) {
            $insertQuestion->execute([$quizzSemaineId, $ordre, 'actu', null, $qa['enonce'], null, $qa['source_url'], 1]);
            $questionId = (int)$db->lastInsertId();
            $reponsesActu = $qa['reponses'];
            shuffle($reponsesActu); // mélange l'ordre des options
            foreach ($reponsesActu as $r) {
                $insertReponse->execute([$questionId, $r['texte'], null, !empty($r['correcte']) ? 1 : 0]);
            }
            $ordre++;
            $questionsGenerees++;
        }

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        // Doublon détecté par la contrainte unique (saison_id, journee) —
        // dernier filet de sécurité si jamais le verrou FOR UPDATE ci-dessus
        // n'avait pas suffi (ex: très rare collision réseau) : message
        // clair plutôt que l'erreur SQL brute.
        $estDoublon = $e instanceof PDOException && ($e->errorInfo[1] ?? null) === 1062;
        $message    = $estDoublon
            ? "Un quizz existe déjà pour la journée $journee — rafraîchis la page admin."
            : 'Échec de la génération : ' . $e->getMessage();
        echo json_encode(['erreur' => $message]);
        exit();
    }

    $manque = $nbTotal - $questionsGenerees;

    echo json_encode([
        'statut'           => 'OK',
        'quizz_semaine_id' => $quizzSemaineId,
        'journee'          => $journee,
        'nb_questions'     => $questionsGenerees,
        'nb_pronostic'     => count($matchsChoisis),
        'nb_histo'         => $nbHisto > 0 ? min($nbHisto, $questionsGenerees) : 0,
        'nb_actu'          => count($questionsActu),
        'manque'           => max(0, $manque),
        'debug_actu'       => _recupererDebugActuIA(),
        'date_limite'      => $dateLimite,
    ]);
    exit();
}

// ============================================================
//  POST ?action=generer_quizz_treve (admin)
//  Génère un quizz "semaine de trêve" (100% histo + actu, aucune
//  question pronostic puisqu'il n'y a pas de matchs L1 cette
//  semaine-là — trêve internationale, coupure hivernale...).
//  Contrairement au quizz normal, rien n'essaie de détecter tout
//  seul qu'on est en trêve : c'est l'admin qui déclenche, au moment
//  où il sait qu'il n'y a pas de journée L1 ce week-end.
// ============================================================
elseif ($method === 'POST' && $action === 'generer_quizz_treve') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data     = json_decode(file_get_contents('php://input'), true);
    $saisonId = saisonDepuisRequete($db, $data);
    $config   = _chargerConfigQuizz($db, $saisonId);

    // Un seul quizz à la fois en attente de validation, trêve ou pas
    $stmt = $db->prepare("SELECT id FROM quizz_semaine WHERE saison_id = ? AND statut = 'a_valider' LIMIT 1");
    $stmt->execute([$saisonId]);
    if ($stmt->fetchColumn()) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Il y a déjà un quizz en attente de validation — valide-le ou retire-le avant d\'en générer un nouveau']);
        exit();
    }

    $nbTotalTreve = $config['nb_questions_treve'];
    $nbHisto      = min($config['nb_histo_treve'], $nbTotalTreve);
    $nbActu       = $nbTotalTreve - $nbHisto;
    // La date limite n'est plus fixée ici : elle sera calculée à la
    // publication (action "valider"), sur la durée paramétrable
    // duree_validite_special_jours — sinon le compte à rebours démarrait
    // avant même que les joueurs voient le quizz.
    $dateLimite   = null;

    $questionsActu = $nbActu > 0 ? _genererQuestionsActuIA($nbActu) : [];

    try {
        $db->beginTransaction();

        $db->prepare("
            INSERT INTO quizz_semaine (saison_id, journee, est_treve, statut, date_generation, date_limite)
            VALUES (?, NULL, 1, 'a_valider', NOW(), ?)
        ")->execute([$saisonId, $dateLimite]);
        $quizzSemaineId = (int)$db->lastInsertId();

        $ordre = 1;
        $questionsGenerees = 0;
        $insertQuestion = $db->prepare("
            INSERT INTO quizz_questions (quizz_semaine_id, ordre, type, sous_type, enonce, match_id, source_url, resultat_connu)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $insertReponse = $db->prepare('
            INSERT INTO quizz_reponses_possibles (question_id, texte, club_id, est_correcte)
            VALUES (?, ?, NULL, ?)
        ');

        if ($nbHisto > 0) {
            $piochesHisto = _piocherQuestionsHisto($db, $nbHisto);
            $marquerUtilisee = $db->prepare('UPDATE quizz_banque_histo SET utilisee_le = NOW() WHERE id = ?');
            foreach ($piochesHisto as $h) {
                $reponsesHisto = json_decode($h['reponses'], true) ?: [];
                shuffle($reponsesHisto); // mélange l'ordre des options pour ne pas toujours mettre la bonne réponse à la même place
                $insertQuestion->execute([$quizzSemaineId, $ordre, 'histo', null, $h['enonce'], null, null, 1]);
                $questionId = (int)$db->lastInsertId();
                foreach ($reponsesHisto as $r) {
                    $insertReponse->execute([$questionId, $r['texte'], !empty($r['correcte']) ? 1 : 0]);
                }
                $marquerUtilisee->execute([$h['id']]);
                $ordre++;
                $questionsGenerees++;
            }
        }

        foreach ($questionsActu as $qa) {
            $insertQuestion->execute([$quizzSemaineId, $ordre, 'actu', null, $qa['enonce'], null, $qa['source_url'], 1]);
            $questionId = (int)$db->lastInsertId();
            $reponsesActu = $qa['reponses'];
            shuffle($reponsesActu); // mélange l'ordre des options
            foreach ($reponsesActu as $r) {
                $insertReponse->execute([$questionId, $r['texte'], !empty($r['correcte']) ? 1 : 0]);
            }
            $ordre++;
            $questionsGenerees++;
        }

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['erreur' => 'Échec de la génération : ' . $e->getMessage()]);
        exit();
    }

    echo json_encode([
        'statut'           => 'OK',
        'quizz_semaine_id' => $quizzSemaineId,
        'numero_special'   => _numeroSpecial($db, $saisonId, $quizzSemaineId),
        'nb_questions'     => $questionsGenerees,
        'nb_histo'         => $nbHisto > 0 ? min($nbHisto, $questionsGenerees) : 0,
        'nb_actu'          => count($questionsActu),
        'manque'           => max(0, $nbTotalTreve - $questionsGenerees),
        'debug_actu'       => _recupererDebugActuIA(),
        'date_limite'      => $dateLimite,
    ]);
    exit();
}

// ============================================================
//  POST ?action=valider (admin)
//  Publie un quizz en statut 'a_valider' → 'publie'
// ============================================================
elseif ($method === 'POST' && $action === 'valider') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data           = json_decode(file_get_contents('php://input'), true);
    $quizzSemaineId = intval($data['quizz_semaine_id'] ?? 0);

    if (!$quizzSemaineId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'quizz_semaine_id manquant']);
        exit();
    }

    $stmt = $db->prepare('SELECT id, saison_id, est_treve FROM quizz_semaine WHERE id = ? AND statut = ?');
    $stmt->execute([$quizzSemaineId, 'a_valider']);
    $quizzAValider = $stmt->fetch();

    if (!$quizzAValider) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Quizz introuvable ou déjà publié']);
        exit();
    }

    if ((int)$quizzAValider['est_treve'] === 1) {
        // Quizz Spécial : la date limite se calcule à la publication (pas à
        // la génération), sur une durée paramétrable — sinon le compte à
        // rebours démarrait avant même que les joueurs voient le quizz
        $config = _chargerConfigQuizz($db, (int)$quizzAValider['saison_id']);
        $stmt = $db->prepare("
            UPDATE quizz_semaine
            SET statut = 'publie', date_publication = NOW(), valide_par_admin_le = NOW(),
                date_limite = DATE_ADD(NOW(), INTERVAL ? DAY)
            WHERE id = ? AND statut = 'a_valider'
        ");
        $stmt->execute([$config['duree_validite_special_jours'], $quizzSemaineId]);
    } else {
        $stmt = $db->prepare("UPDATE quizz_semaine SET statut = 'publie', date_publication = NOW(), valide_par_admin_le = NOW() WHERE id = ? AND statut = 'a_valider'");
        $stmt->execute([$quizzSemaineId]);
    }

    if ($stmt->rowCount() === 0) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Quizz introuvable ou déjà publié']);
        exit();
    }

    echo json_encode(['statut' => 'OK']);
    exit();
}

// ============================================================
//  POST ?action=ajouter_question_manuelle (admin)
//  Ajoute une question "actu foot" saisie à la main (sans passer par
//  l'API Claude) à un quizz encore en attente de validation.
// ============================================================
elseif ($method === 'POST' && $action === 'ajouter_question_manuelle') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data           = json_decode(file_get_contents('php://input'), true);
    $quizzSemaineId = intval($data['quizz_semaine_id'] ?? 0);
    $enonce         = trim($data['enonce'] ?? '');
    $sourceUrl      = trim($data['source_url'] ?? '');
    $reponses       = $data['reponses'] ?? [];

    if (!$quizzSemaineId || !$enonce || !$sourceUrl) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Énoncé, source et quizz_semaine_id sont obligatoires']);
        exit();
    }
    if (!filter_var($sourceUrl, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'L\'URL de la source n\'est pas valide']);
        exit();
    }

    $reponsesValides = array_values(array_filter($reponses, fn($r) => trim($r['texte'] ?? '') !== ''));
    $nbCorrectes = 0;
    foreach ($reponsesValides as $r) {
        if (!empty($r['correcte'])) $nbCorrectes++;
    }
    if (count($reponsesValides) < 2 || $nbCorrectes !== 1) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Il faut au moins 2 réponses renseignées, avec exactement 1 bonne réponse cochée']);
        exit();
    }

    $stmt = $db->prepare("SELECT id FROM quizz_semaine WHERE id = ? AND statut = 'a_valider'");
    $stmt->execute([$quizzSemaineId]);
    if (!$stmt->fetchColumn()) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Ce quizz n\'existe pas ou n\'est plus en attente de validation']);
        exit();
    }

    $stmt = $db->prepare('SELECT COALESCE(MAX(ordre), 0) FROM quizz_questions WHERE quizz_semaine_id = ?');
    $stmt->execute([$quizzSemaineId]);
    $ordre = (int)$stmt->fetchColumn() + 1;

    $db->prepare("
        INSERT INTO quizz_questions (quizz_semaine_id, ordre, type, sous_type, enonce, match_id, source_url, resultat_connu)
        VALUES (?, ?, 'actu', NULL, ?, NULL, ?, 1)
    ")->execute([$quizzSemaineId, $ordre, $enonce, $sourceUrl]);
    $questionId = (int)$db->lastInsertId();

    shuffle($reponsesValides); // mélange l'ordre des options
    $insertReponse = $db->prepare('
        INSERT INTO quizz_reponses_possibles (question_id, texte, club_id, est_correcte)
        VALUES (?, ?, NULL, ?)
    ');
    foreach ($reponsesValides as $r) {
        $insertReponse->execute([$questionId, trim($r['texte']), !empty($r['correcte']) ? 1 : 0]);
    }

    echo json_encode(['statut' => 'OK', 'question_id' => $questionId]);
    exit();
}

// ============================================================
//  POST ?action=supprimer_question (admin)
//  Retire une question d'un quizz encore en attente de validation
//  (utile pour corriger une saisie manuelle ratée, ou retirer une
//  question pronostic/histo qu'on ne veut finalement pas garder).
// ============================================================
elseif ($method === 'POST' && $action === 'supprimer_question') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data       = json_decode(file_get_contents('php://input'), true);
    $questionId = intval($data['question_id'] ?? 0);

    $stmt = $db->prepare("
        SELECT q.id FROM quizz_questions q
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        WHERE q.id = ? AND s.statut = 'a_valider'
    ");
    $stmt->execute([$questionId]);
    if (!$stmt->fetchColumn()) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Question introuvable ou quizz déjà publié']);
        exit();
    }

    $db->prepare('DELETE FROM quizz_reponses_possibles WHERE question_id = ?')->execute([$questionId]);
    $db->prepare('DELETE FROM quizz_questions WHERE id = ?')->execute([$questionId]);

    echo json_encode(['statut' => 'OK']);
    exit();
}

// ============================================================
//  POST ?action=supprimer_quizz_semaine (admin)
//  Supprime intégralement un quizz encore en attente de validation
//  (statut 'a_valider' uniquement — jamais un quizz déjà publié, pour
//  ne pas effacer les réponses déjà données par les joueurs). Utile
//  notamment pour nettoyer un doublon créé par erreur (ex. double-clic
//  sur "Générer le prochain quizz").
// ============================================================
elseif ($method === 'POST' && $action === 'supprimer_quizz_semaine') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $data           = json_decode(file_get_contents('php://input'), true);
    $quizzSemaineId = intval($data['quizz_semaine_id'] ?? 0);

    $stmt = $db->prepare("SELECT id FROM quizz_semaine WHERE id = ? AND statut = 'a_valider'");
    $stmt->execute([$quizzSemaineId]);
    if (!$stmt->fetchColumn()) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Quizz introuvable ou déjà publié — seul un quizz en attente de validation peut être supprimé']);
        exit();
    }

    $db->beginTransaction();
    $stmtQuestions = $db->prepare('SELECT id FROM quizz_questions WHERE quizz_semaine_id = ?');
    $stmtQuestions->execute([$quizzSemaineId]);
    $questionIds = $stmtQuestions->fetchAll(PDO::FETCH_COLUMN);

    if ($questionIds) {
        $in = implode(',', array_fill(0, count($questionIds), '?'));
        $db->prepare("DELETE FROM quizz_reponses_possibles WHERE question_id IN ($in)")->execute($questionIds);
        $db->prepare("DELETE FROM quizz_questions WHERE id IN ($in)")->execute($questionIds);
    }
    $db->prepare('DELETE FROM quizz_semaine WHERE id = ?')->execute([$quizzSemaineId]);
    $db->commit();

    echo json_encode(['statut' => 'OK']);
    exit();
}
// ============================================================
//  GET ?action=courant [&id=X]
//  Sans id : le Quizz J (lié à une journée) publié le plus récent et
//  encore ouvert. Les Quizz Spéciaux ne sont PLUS renvoyés ici (voir
//  action=speciaux_disponibles) — auparavant, un seul quizz "le plus
//  récent tous types confondus" était renvoyé, ce qui pouvait masquer
//  un Quizz J encore actif dès qu'un Spécial était publié après lui
//  (ou l'inverse), sans aucun moyen de rattraper l'autre.
//  Avec id : un quizz précis (n'importe quel type), pour ouvrir un
//  Spécial choisi dans la liste — toujours vérifié comme publié et
//  appartenant à la bonne saison avant d'être renvoyé.
// ============================================================
elseif ($method === 'GET' && $action === 'courant') {
    $joueur   = verifierToken($db);
    $saisonId = saisonDepuisRequete($db);
    $idDemande = isset($_GET['id']) ? intval($_GET['id']) : null;

    if ($idDemande) {
        $stmt = $db->prepare("
            SELECT * FROM quizz_semaine
            WHERE id = ? AND saison_id = ? AND statut = 'publie'
              AND (date_limite IS NULL OR date_limite > NOW())
        ");
        $stmt->execute([$idDemande, $saisonId]);
    } else {
        $stmt = $db->prepare("
            SELECT * FROM quizz_semaine
            WHERE saison_id = ? AND statut = 'publie' AND est_treve = 0
              AND (date_limite IS NULL OR date_limite > NOW())
            ORDER BY id DESC LIMIT 1
        ");
        $stmt->execute([$saisonId]);
    }
    $semaine = $stmt->fetch();

    if (!$semaine) {
        echo json_encode(['statut' => 'OK', 'quizz' => null]);
        exit();
    }

    $stmt = $db->prepare('SELECT id, ordre, type, sous_type, enonce, source_url FROM quizz_questions WHERE quizz_semaine_id = ? ORDER BY ordre ASC');
    $stmt->execute([$semaine['id']]);
    $questions = $stmt->fetchAll();

    $stmtReponses = $db->prepare('
        SELECT rp.id, rp.texte, rp.club_id, c.nom_court AS club_nom, c.couleur1, c.couleur2
        FROM quizz_reponses_possibles rp
        LEFT JOIN clubs c ON c.id = rp.club_id
        WHERE rp.question_id = ?
    ');
    $stmtDejaRepondu = $db->prepare('SELECT reponse_id FROM quizz_reponses_joueurs WHERE question_id = ? AND user_id = ?');

    foreach ($questions as &$q) {
        $stmtReponses->execute([$q['id']]);
        $q['reponses'] = $stmtReponses->fetchAll();

        // a_repondu = une ligne existe déjà en base pour ce joueur/cette question,
        // MÊME si reponse_id est NULL (cas d'un timeout sur une question
        // chronométrée sans clic). deja_repondu reste l'id de la réponse choisie
        // (null si timeout, pour ne surligner aucun bouton côté front).
        // Distinction essentielle : fetchColumn() renvoie NULL (pas false) quand
        // la ligne existe mais que reponse_id est NULL — l'ancien code castait
        // ça en 0, ce qui faisait croire au front que la question était encore
        // à répondre alors que le serveur la considère déjà répondue.
        $stmtDejaRepondu->execute([$q['id'], $joueur['id']]);
        $ligneReponse = $stmtDejaRepondu->fetch();
        $q['a_repondu']    = $ligneReponse !== false;
        $q['deja_repondu'] = ($ligneReponse !== false && $ligneReponse['reponse_id'] !== null) ? (int)$ligneReponse['reponse_id'] : null;
    }
    unset($q);

    $config = _chargerConfigQuizz($db, $saisonId);

    echo json_encode([
        'statut' => 'OK',
        'quizz'  => [
            'id'                  => (int)$semaine['id'],
            'journee'             => $semaine['journee'],
            'est_treve'           => (bool)$semaine['est_treve'],
            'numero_special'      => $semaine['est_treve'] ? _numeroSpecial($db, $saisonId, (int)$semaine['id']) : null,
            'date_limite'         => $semaine['date_limite'],
            'timer_secondes_actu' => $config['timer_secondes_actu'],
            'questions'           => $questions,
        ],
    ]);
    exit();
}

// ============================================================
//  GET ?action=mon_historique
//  Liste, pour le joueur connecté, tous les quizz publiés de la
//  saison auxquels il a répondu à au moins une question — avec le
//  nombre de questions répondues, les points obtenus (0 tant qu'un
//  pronostic n'est pas résolu) et si la semaine est entièrement
//  résolue (donc les points affichés sont définitifs).
// ============================================================
elseif ($method === 'GET' && $action === 'mon_historique') {
    $joueur   = verifierToken($db);
    $saisonId = saisonDepuisRequete($db);
    $config   = _chargerConfigQuizz($db, $saisonId);

    $stmt = $db->prepare("
        SELECT s.id, s.journee, s.est_treve, s.date_publication, s.date_limite,
               (SELECT COUNT(*) FROM quizz_semaine s2 WHERE s2.saison_id = s.saison_id AND s2.est_treve = 1 AND s2.id <= s.id) AS numero_special,
               COUNT(q.id) AS nb_questions,
               SUM(CASE WHEN rj.id IS NOT NULL THEN 1 ELSE 0 END) AS nb_repondu,
               SUM(CASE WHEN q.resultat_connu = 0 THEN 1 ELSE 0 END) AS nb_non_resolues,
               COALESCE(SUM(rj.points), 0) AS points
        FROM quizz_semaine s
        JOIN quizz_questions q ON q.quizz_semaine_id = s.id
        LEFT JOIN quizz_reponses_joueurs rj ON rj.question_id = q.id AND rj.user_id = ?
        WHERE s.saison_id = ? AND s.statut = 'publie'
        GROUP BY s.id
        HAVING nb_repondu > 0
        ORDER BY s.id DESC
    ");
    $stmt->execute([$joueur['id'], $saisonId]);
    $semaines = $stmt->fetchAll();

    $resultat = array_map(function ($s) use ($config) {
        $toutesResolues = (int)$s['nb_non_resolues'] === 0;
        $toutRepondu    = (int)$s['nb_repondu'] === (int)$s['nb_questions'];
        $maxPossible    = (int)$s['nb_questions'] * $config['pts_bonne_reponse'];
        $points         = (int)$s['points'];
        $sansFaute      = $toutesResolues && $toutRepondu && $maxPossible > 0 && $points === $maxPossible;
        if ($sansFaute) $points += (int)round($maxPossible * $config['bonus_sans_faute_pct'] / 100);

        return [
            'id'              => (int)$s['id'],
            'journee'         => $s['journee'],
            'est_treve'       => (bool)$s['est_treve'],
            'numero_special'  => $s['est_treve'] ? (int)$s['numero_special'] : null,
            'date_publication'=> $s['date_publication'],
            'date_limite'     => $s['date_limite'],
            'nb_questions'    => (int)$s['nb_questions'],
            'nb_repondu'      => (int)$s['nb_repondu'],
            'toutes_resolues' => $toutesResolues,
            'sans_faute'      => $sansFaute,
            'points'          => $points,
        ];
    }, $semaines);

    echo json_encode(['statut' => 'OK', 'semaines' => $resultat]);
    exit();
}

// ============================================================
//  GET ?action=mon_historique_detail&id=X
//  Détail question par question d'un quizz publié (peu importe s'il
//  est encore ouvert ou déjà clôturé — contrairement à "courant", pas
//  de contrainte de date_limite ici puisque c'est justement pour
//  revoir un quizz terminé). Renvoie aussi, pour chaque question déjà
//  résolue, l'id de la bonne réponse et les points obtenus.
// ============================================================
elseif ($method === 'GET' && $action === 'mon_historique_detail') {
    $joueur   = verifierToken($db);
    $saisonId = saisonDepuisRequete($db);
    $id       = intval($_GET['id'] ?? 0);

    $stmt = $db->prepare("SELECT * FROM quizz_semaine WHERE id = ? AND saison_id = ? AND statut = 'publie'");
    $stmt->execute([$id, $saisonId]);
    $semaine = $stmt->fetch();
    if (!$semaine) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Quizz introuvable']);
        exit();
    }

    $stmt = $db->prepare('SELECT id, ordre, type, sous_type, enonce, source_url, resultat_connu FROM quizz_questions WHERE quizz_semaine_id = ? ORDER BY ordre ASC');
    $stmt->execute([$semaine['id']]);
    $questions = $stmt->fetchAll();

    $stmtReponses = $db->prepare('
        SELECT rp.id, rp.texte, rp.club_id, rp.est_correcte, c.nom_court AS club_nom, c.couleur1, c.couleur2
        FROM quizz_reponses_possibles rp
        LEFT JOIN clubs c ON c.id = rp.club_id
        WHERE rp.question_id = ?
    ');
    $stmtMaReponse = $db->prepare('SELECT reponse_id, points FROM quizz_reponses_joueurs WHERE question_id = ? AND user_id = ?');

    foreach ($questions as &$q) {
        $stmtReponses->execute([$q['id']]);
        $q['reponses'] = $stmtReponses->fetchAll();

        $stmtMaReponse->execute([$q['id'], $joueur['id']]);
        $ligne = $stmtMaReponse->fetch();
        $q['ma_reponse_id'] = ($ligne && $ligne['reponse_id'] !== null) ? (int)$ligne['reponse_id'] : null;
        $q['a_repondu']     = $ligne !== false;
        $q['points']        = $ligne ? (int)$ligne['points'] : 0;
        $q['resultat_connu']= (int)$q['resultat_connu'];

        // La bonne réponse n'est révélée que si le résultat est déjà connu
        // (jamais pour un pronostic dont le match n'a pas encore eu lieu)
        $q['bonne_reponse_id'] = null;
        if ($q['resultat_connu'] === 1) {
            foreach ($q['reponses'] as $r) {
                if (!empty($r['est_correcte'])) { $q['bonne_reponse_id'] = (int)$r['id']; break; }
            }
        }
    }
    unset($q);

    echo json_encode([
        'statut' => 'OK',
        'quizz'  => [
            'id'             => (int)$semaine['id'],
            'journee'        => $semaine['journee'],
            'est_treve'      => (bool)$semaine['est_treve'],
            'numero_special' => $semaine['est_treve'] ? _numeroSpecial($db, $saisonId, (int)$semaine['id']) : null,
            'date_limite'    => $semaine['date_limite'],
            'questions'      => $questions,
        ],
    ]);
    exit();
}

// ============================================================
//  GET ?action=speciaux_disponibles
//  Liste de tous les Quizz Spéciaux encore valides (date limite pas
//  passée) et publiés — pour permettre à un joueur de rattraper un
//  Spécial même si un autre (J ou Spécial) a été publié depuis.
// ============================================================
elseif ($method === 'GET' && $action === 'speciaux_disponibles') {
    $joueur   = verifierToken($db);
    $saisonId = saisonDepuisRequete($db);

    $stmt = $db->prepare("
        SELECT s.id, s.date_limite,
               (SELECT COUNT(*) FROM quizz_semaine s2 WHERE s2.saison_id = s.saison_id AND s2.est_treve = 1 AND s2.id <= s.id) AS numero_special,
               (SELECT COUNT(*) FROM quizz_questions WHERE quizz_semaine_id = s.id) AS nb_questions,
               (SELECT COUNT(*) FROM quizz_reponses_joueurs rj JOIN quizz_questions q ON q.id = rj.question_id WHERE q.quizz_semaine_id = s.id AND rj.user_id = ?) AS nb_repondu
        FROM quizz_semaine s
        WHERE s.saison_id = ? AND s.est_treve = 1 AND s.statut = 'publie'
          AND (s.date_limite IS NULL OR s.date_limite > NOW())
        ORDER BY s.id DESC
    ");
    $stmt->execute([$joueur['id'], $saisonId]);
    $liste = array_map(function ($row) {
        $row['id']             = (int)$row['id'];
        $row['numero_special'] = (int)$row['numero_special'];
        $row['nb_questions']   = (int)$row['nb_questions'];
        $row['nb_repondu']     = (int)$row['nb_repondu'];
        $row['termine']        = $row['nb_repondu'] >= $row['nb_questions'];
        return $row;
    }, $stmt->fetchAll());

    echo json_encode(['statut' => 'OK', 'speciaux' => $liste]);
    exit();
}

// ============================================================
//  GET ?action=config_publique
//  Expose au joueur les éléments de config utiles à l'affichage
//  (FAQ, Règlement, bandeau) sans exposer toute la config admin.
// ============================================================
elseif ($method === 'GET' && $action === 'config_publique') {
    $joueur   = verifierToken($db);
    $saisonId = saisonDepuisRequete($db);
    $config   = _chargerConfigQuizz($db, $saisonId);
    echo json_encode([
        'statut'               => 'OK',
        'bonus_sans_faute_pct' => $config['bonus_sans_faute_pct'],
        'timer_secondes_actu'  => $config['timer_secondes_actu'],
    ]);
    exit();
}

// ============================================================
//  POST ?action=repondre
// ============================================================
elseif ($method === 'POST' && $action === 'repondre') {
    $joueur     = verifierToken($db);
    $data       = json_decode(file_get_contents('php://input'), true);
    $questionId = intval($data['question_id'] ?? 0);
    $reponseId  = isset($data['reponse_id']) && $data['reponse_id'] !== null ? intval($data['reponse_id']) : null;
    $tempsMs    = isset($data['temps_reponse_ms']) ? intval($data['temps_reponse_ms']) : null;

    if (!$questionId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'question_id manquant']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT q.id, q.type, q.resultat_connu, s.statut, s.date_limite, s.saison_id, m.date AS date_match
        FROM quizz_questions q
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        LEFT JOIN matches m ON m.id = q.match_id
        WHERE q.id = ?
    ');
    $stmt->execute([$questionId]);
    $question = $stmt->fetch();

    if (!$question) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Question introuvable']);
        exit();
    }

    // Date limite effective de CETTE question : pour un pronostic lié à un
    // match précis, c'est le coup d'envoi de ce match (modifiable librement
    // jusque-là, même si d'autres matchs de la journée ont déjà commencé) —
    // pas la date limite globale de la semaine, qui correspond au dernier
    // match de la journée et ne concerne que les questions histo/actu
    // (sans match associé).
    $dateLimiteEffective = ($question['type'] === 'pronostic' && $question['date_match'] !== null)
        ? $question['date_match']
        : $question['date_limite'];

    if ($question['statut'] !== 'publie' || ($dateLimiteEffective !== null && strtotime($dateLimiteEffective) <= time())) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Ce quizz est clôturé']);
        exit();
    }

    // Pour une question déjà résolue (histo/actu), une seule tentative
    // est autorisée — contrairement au pronostic, modifiable librement
    // jusqu'au coup d'envoi. Vérifié côté serveur (pas seulement dans
    // l'interface) pour qu'il soit impossible de cliquer plusieurs
    // réponses jusqu'à tomber sur la bonne.
    if ((int)$question['resultat_connu'] === 1) {
        $stmtDeja = $db->prepare('SELECT id FROM quizz_reponses_joueurs WHERE question_id = ? AND user_id = ?');
        $stmtDeja->execute([$questionId, $joueur['id']]);
        if ($stmtDeja->fetchColumn()) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Tu as déjà répondu à cette question']);
            exit();
        }
    }

    $estCorrecte = 0;
    if ($reponseId !== null) {
        $stmt = $db->prepare('SELECT id, est_correcte FROM quizz_reponses_possibles WHERE id = ? AND question_id = ?');
        $stmt->execute([$reponseId, $questionId]);
        $reponse = $stmt->fetch();
        if (!$reponse) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Réponse invalide pour cette question']);
            exit();
        }
        $estCorrecte = !empty($reponse['est_correcte']) ? 1 : 0;
    }

    // Pour les questions déjà résolues à la création (histo/actu — la
    // bonne réponse est connue dès le départ, contrairement à un
    // pronostic qui attend le résultat du match), on attribue les
    // points immédiatement plutôt que d'attendre l'action "resoudre"
    $points = 0;
    if ((int)$question['resultat_connu'] === 1 && $estCorrecte) {
        $config = _chargerConfigQuizz($db, (int)$question['saison_id']);
        $points = $config['pts_bonne_reponse'];
    }

    $db->prepare('
        INSERT INTO quizz_reponses_joueurs (question_id, user_id, reponse_id, temps_reponse_ms, points, repondu_le)
        VALUES (?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE reponse_id = VALUES(reponse_id), temps_reponse_ms = VALUES(temps_reponse_ms), points = VALUES(points), repondu_le = NOW()
    ')->execute([$questionId, $joueur['id'], $reponseId, $tempsMs, $points]);

    if ((int)$question['resultat_connu'] === 1) {
        $config = $config ?? _chargerConfigQuizz($db, (int)$question['saison_id']);
        _recalculerClassementQuizz($db, (int)$question['saison_id'], $config);
    }

    // Renvoie l'id de la bonne réponse (uniquement si le résultat est déjà
    // connu) pour que le front puisse la révéler quand le joueur s'est trompé
    $bonneReponseId = null;
    if ((int)$question['resultat_connu'] === 1) {
        $stmtBonne = $db->prepare('SELECT id FROM quizz_reponses_possibles WHERE question_id = ? AND est_correcte = 1 LIMIT 1');
        $stmtBonne->execute([$questionId]);
        $bonneReponseId = $stmtBonne->fetchColumn() ?: null;
        if ($bonneReponseId !== null) $bonneReponseId = (int)$bonneReponseId;
    }

    echo json_encode([
        'statut'          => 'OK',
        'resultat_connu'  => (int)$question['resultat_connu'],
        'correcte'        => (int)$question['resultat_connu'] === 1 ? (bool)$estCorrecte : null,
        'bonne_reponse_id'=> $bonneReponseId,
    ]);
    exit();
}

// ============================================================
//  POST ?action=resoudre (admin ou cron)
//  Corrige toutes les questions dont le match est terminé et dont
//  le résultat n'est pas encore connu, attribue les points, puis
//  régénère le classement quizz.
// ============================================================
elseif ($method === 'POST' && $action === 'resoudre') {
    if (!defined('RUNNING_AS_CRON')) {
        $admin = verifierToken($db);
        if (!$admin['is_admin']) {
            http_response_code(403);
            echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
            exit();
        }
    }
    $data     = json_decode(file_get_contents('php://input'), true) ?: [];
    $saisonId = saisonDepuisRequete($db, $data);

    // Logique commune avec la résolution automatique du cron — voir
    // resoudreQuizzSaison() dans utils.php.
    $resultat = resoudreQuizzSaison($db, $saisonId);

    echo json_encode([
        'statut'               => 'OK',
        'questions_resolues'   => $resultat['questions_resolues'],
        'classement_recalcule' => $resultat['classement_recalcule'],
    ]);
    exit();
}

// ============================================================
//  GET ?action=etat_admin (admin)
//  Vue d'ensemble pour l'écran admin : quizz en attente de
//  validation (avec le détail de ses questions) + quizz publié
//  actuellement ouvert, s'il y en a un.
// ============================================================
elseif ($method === 'GET' && $action === 'etat_admin') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }
    $saisonId = saisonDepuisRequete($db);

    $stmt = $db->prepare("SELECT * FROM quizz_semaine WHERE saison_id = ? AND statut = 'a_valider' ORDER BY id DESC LIMIT 1");
    $stmt->execute([$saisonId]);
    $aValider = $stmt->fetch();
    if ($aValider) {
        $stmt = $db->prepare('SELECT id, ordre, type, sous_type, enonce, source_url FROM quizz_questions WHERE quizz_semaine_id = ? ORDER BY ordre ASC');
        $stmt->execute([$aValider['id']]);
        $aValider['questions'] = $stmt->fetchAll();
        $aValider['numero_special'] = $aValider['est_treve'] ? _numeroSpecial($db, $saisonId, (int)$aValider['id']) : null;
    }

    $stmt = $db->prepare("
        SELECT * FROM quizz_semaine
        WHERE saison_id = ? AND statut = 'publie' AND (date_limite IS NULL OR date_limite > NOW())
        ORDER BY id DESC LIMIT 1
    ");
    $stmt->execute([$saisonId]);
    $publie = $stmt->fetch();
    if ($publie) {
        $stmt = $db->prepare('SELECT COUNT(*) FROM quizz_questions WHERE quizz_semaine_id = ?');
        $stmt->execute([$publie['id']]);
        $publie['nb_questions'] = (int)$stmt->fetchColumn();
        $stmt = $db->prepare('SELECT COUNT(DISTINCT user_id) FROM quizz_reponses_joueurs rj JOIN quizz_questions q ON q.id = rj.question_id WHERE q.quizz_semaine_id = ?');
        $stmt->execute([$publie['id']]);
        $publie['nb_joueurs_repondu'] = (int)$stmt->fetchColumn();
        $publie['numero_special'] = $publie['est_treve'] ? _numeroSpecial($db, $saisonId, (int)$publie['id']) : null;
    }

    // Questions en attente de résolution (match terminé mais pas encore corrigé)
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM quizz_questions q
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        JOIN matches m ON m.id = q.match_id
        WHERE s.saison_id = ? AND q.resultat_connu = 0 AND m.statut = 'termine'
    ");
    $stmt->execute([$saisonId]);
    $nbAResoudre = (int)$stmt->fetchColumn();

    // Historique complet des quizz déjà créés cette saison — répond à
    // "ai-je déjà généré/publié la journée X ?" sans avoir à s'en souvenir.
    // numero_special = rang parmi les quizz "spéciaux" (ex-trêve) de la
    // saison, pour un identifiant stable façon "Spécial #1", "#2"...
    $stmt = $db->prepare("
        SELECT s.id, s.journee, s.est_treve, s.statut, s.date_publication, s.date_limite,
               COUNT(q.id) AS nb_questions,
               (SELECT COUNT(*) FROM quizz_semaine s2 WHERE s2.saison_id = s.saison_id AND s2.est_treve = 1 AND s2.id <= s.id) AS numero_special
        FROM quizz_semaine s
        LEFT JOIN quizz_questions q ON q.quizz_semaine_id = s.id
        WHERE s.saison_id = ?
        GROUP BY s.id
        ORDER BY s.id DESC
    ");
    $stmt->execute([$saisonId]);
    $historique = $stmt->fetchAll();

    // Prochaine journée à venir qui n'a encore aucun quizz (même logique
    // que la génération elle-même) — évite de cliquer "Générer" pour le
    // découvrir
    $stmt = $db->prepare("
        SELECT MIN(journee) FROM matches
        WHERE saison_id = ? AND statut = 'a_venir'
          AND journee NOT IN (
              SELECT journee FROM quizz_semaine WHERE saison_id = ? AND journee IS NOT NULL
          )
    ");
    $stmt->execute([$saisonId, $saisonId]);
    $prochaineJourneeSansQuizz = $stmt->fetchColumn();

    echo json_encode([
        'statut'                    => 'OK',
        'a_valider'                 => $aValider ?: null,
        'publie'                    => $publie ?: null,
        'nb_a_resoudre'             => $nbAResoudre,
        'config'                    => _chargerConfigQuizz($db, $saisonId),
        'historique'                => $historique,
        'prochaine_journee_sans_quizz' => $prochaineJourneeSansQuizz !== false ? (int)$prochaineJourneeSansQuizz : null,
    ]);
    exit();
}

// ============================================================
//  GET ?action=classement
// ============================================================
elseif ($method === 'GET' && $action === 'classement') {
    $saisonId = saisonDepuisRequete($db);

    // Total global de questions publiées cette saison (même dénominateur
    // pour tous les joueurs, sert de référence "X/Y questions")
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM quizz_questions q
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        WHERE s.saison_id = ? AND s.statut = 'publie'
    ");
    $stmt->execute([$saisonId]);
    $nbQuestionsPubliees = (int)$stmt->fetchColumn();

    $stmt = $db->prepare('
        SELECT qc.rang, qc.total_points, qc.nb_sans_faute, u.id AS user_id, u.nom, u.avatar_initiales,
            (SELECT COUNT(DISTINCT q.quizz_semaine_id)
               FROM quizz_reponses_joueurs rj
               JOIN quizz_questions q ON q.id = rj.question_id
               JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
              WHERE rj.user_id = qc.user_id AND s.saison_id = qc.saison_id) AS nb_quizz_joues,
            (SELECT COUNT(*)
               FROM quizz_reponses_joueurs rj
               JOIN quizz_questions q ON q.id = rj.question_id
               JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
              WHERE rj.user_id = qc.user_id AND s.saison_id = qc.saison_id) AS nb_reponses,
            (SELECT COUNT(*)
               FROM quizz_reponses_joueurs rj
               JOIN quizz_questions q ON q.id = rj.question_id
               JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
              WHERE rj.user_id = qc.user_id AND s.saison_id = qc.saison_id AND rj.points > 0) AS nb_bonnes_reponses
        FROM quizz_classement_cache qc
        JOIN users u ON u.id = qc.user_id
        WHERE qc.saison_id = ?
        ORDER BY qc.rang ASC
    ');
    $stmt->execute([$saisonId]);
    echo json_encode([
        'statut'               => 'OK',
        'nb_questions_publiees' => $nbQuestionsPubliees,
        'classement'            => $stmt->fetchAll(),
    ]);
    exit();
}

// ============================================================
//  GET ?action=classement_detaille
//  Tableau détaillé par type de quizz (⚽ J = lié à une journée,
//  ✨ S = Spécial), avec pour chaque joueur : quizz publiés/répondus,
//  questions posées/répondues/bonnes, points — et un total qui
//  additionne les points J + S (c'est ce total qui détermine le rang,
//  identique à celui de quizz_classement_cache).
// ============================================================
elseif ($method === 'GET' && $action === 'classement_detaille') {
    $saisonId = saisonDepuisRequete($db);
    $config   = _chargerConfigQuizz($db, $saisonId);

    // Stats globales par type (mêmes pour tous les joueurs) : nb quizz
    // publiés + nb questions posées au total cette saison
    $stmt = $db->prepare("
        SELECT s.est_treve, COUNT(DISTINCT s.id) AS nb_quizz, COUNT(q.id) AS nb_questions
        FROM quizz_semaine s
        LEFT JOIN quizz_questions q ON q.quizz_semaine_id = s.id
        WHERE s.saison_id = ? AND s.statut = 'publie'
        GROUP BY s.est_treve
    ");
    $stmt->execute([$saisonId]);
    $global = [
        'J' => ['nb_quizz_publies' => 0, 'nb_questions_posees' => 0],
        'S' => ['nb_quizz_publies' => 0, 'nb_questions_posees' => 0],
    ];
    foreach ($stmt->fetchAll() as $row) {
        $cle = $row['est_treve'] ? 'S' : 'J';
        $global[$cle] = ['nb_quizz_publies' => (int)$row['nb_quizz'], 'nb_questions_posees' => (int)$row['nb_questions']];
    }

    // Tous les joueurs ayant répondu à au moins une question cette saison
    $stmt = $db->prepare("
        SELECT DISTINCT u.id, u.nom, u.avatar_initiales
        FROM quizz_reponses_joueurs rj
        JOIN quizz_questions q ON q.id = rj.question_id
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        JOIN users u ON u.id = rj.user_id
        WHERE s.saison_id = ?
    ");
    $stmt->execute([$saisonId]);
    $parJoueur = [];
    foreach ($stmt->fetchAll() as $j) {
        $parJoueur[(int)$j['id']] = [
            'user_id' => (int)$j['id'], 'nom' => $j['nom'], 'avatar_initiales' => $j['avatar_initiales'],
            'J' => ['nb_quizz_repondus' => 0, 'nb_questions_repondues' => 0, 'nb_bonnes' => 0, 'points' => 0],
            'S' => ['nb_quizz_repondus' => 0, 'nb_questions_repondues' => 0, 'nb_bonnes' => 0, 'points' => 0],
        ];
    }

    // Participation (toutes réponses données, résolues ou pas) par type
    $stmt = $db->prepare("
        SELECT rj.user_id, s.est_treve, s.id AS sid,
               COUNT(*) AS nb_questions_repondues,
               SUM(rj.points > 0) AS nb_bonnes
        FROM quizz_reponses_joueurs rj
        JOIN quizz_questions q ON q.id = rj.question_id
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        WHERE s.saison_id = ?
        GROUP BY rj.user_id, s.id
    ");
    $stmt->execute([$saisonId]);
    foreach ($stmt->fetchAll() as $row) {
        $uid = (int)$row['user_id'];
        if (!isset($parJoueur[$uid])) continue;
        $cle = $row['est_treve'] ? 'S' : 'J';
        $parJoueur[$uid][$cle]['nb_quizz_repondus']++;
        $parJoueur[$uid][$cle]['nb_questions_repondues'] += (int)$row['nb_questions_repondues'];
        $parJoueur[$uid][$cle]['nb_bonnes'] += (int)$row['nb_bonnes'];
    }

    // Points (avec bonus sans-faute), ventilés par type — même logique que
    // _recalculerClassementQuizz, uniquement sur les semaines entièrement
    // résolues, pour que J + S retombe exactement sur le total du classement
    $stmt = $db->prepare("
        SELECT s.id, s.est_treve, COUNT(q.id) AS nb_questions
        FROM quizz_semaine s
        JOIN quizz_questions q ON q.quizz_semaine_id = s.id
        WHERE s.saison_id = ? AND s.statut = 'publie'
        GROUP BY s.id
        HAVING SUM(q.resultat_connu = 0) = 0
    ");
    $stmt->execute([$saisonId]);
    foreach ($stmt->fetchAll() as $sem) {
        $cle = $sem['est_treve'] ? 'S' : 'J';
        $stmt2 = $db->prepare('
            SELECT rj.user_id, rj.points
            FROM quizz_reponses_joueurs rj
            JOIN quizz_questions q ON q.id = rj.question_id
            WHERE q.quizz_semaine_id = ?
        ');
        $stmt2->execute([$sem['id']]);
        $parJoueurSemaine = [];
        foreach ($stmt2->fetchAll() as $r) {
            $uid = (int)$r['user_id'];
            $parJoueurSemaine[$uid]['points'] = ($parJoueurSemaine[$uid]['points'] ?? 0) + (int)$r['points'];
            $parJoueurSemaine[$uid]['nb']     = ($parJoueurSemaine[$uid]['nb'] ?? 0) + 1;
        }
        $maxPossible = (int)$sem['nb_questions'] * $config['pts_bonne_reponse'];
        foreach ($parJoueurSemaine as $uid => $d) {
            if (!isset($parJoueur[$uid])) continue;
            $pts = $d['points'];
            if ($d['nb'] === (int)$sem['nb_questions'] && $pts === $maxPossible && $maxPossible > 0) {
                $pts += (int)round($maxPossible * $config['bonus_sans_faute_pct'] / 100);
            }
            $parJoueur[$uid][$cle]['points'] += $pts;
        }
    }

    $resultat = array_values($parJoueur);
    foreach ($resultat as &$j) {
        $j['total'] = $j['J']['points'] + $j['S']['points'];
    }
    unset($j);
    usort($resultat, fn($a, $b) => $b['total'] <=> $a['total']);
    $rang = 1;
    foreach ($resultat as &$j) { $j['rang'] = $rang++; }
    unset($j);

    echo json_encode([
        'statut'  => 'OK',
        'global'  => $global,
        'joueurs' => $resultat,
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

// Numéro d'ordre d'un quizz "spécial" (ex-trêve) au sein de sa saison,
// pour un identifiant stable côté affichage ("Spécial #1", "#2"...),
// indépendant du numéro de journée puisqu'il n'y en a pas.
// ============================================================
//  Tirage des questions "histo" avec diversité de catégorie.
//  La banque est alimentée par lots (ex: 50 lignes d'un coup pour
//  une même catégorie), donc un tirage LRU + RAND() brut peut faire
//  ressortir plusieurs questions de la même catégorie d'affilée.
//  Règle : pas plus de 2 questions de la même catégorie pour un
//  quizz de 4 questions histo ou plus ; jamais 2 questions de la
//  même catégorie pour un quizz de 1 à 3 questions histo.
//  Priorité conservée : jamais-utilisées d'abord, puis les moins
//  récemment utilisées, RAND() ne départageant que les égalités.
// ============================================================
function _piocherQuestionsHisto(PDO $db, int $nbHisto): array {
    if ($nbHisto <= 0) return [];

    $maxParCategorie = $nbHisto >= 4 ? 2 : 1;

    $pool = $db->query('
        SELECT id, enonce, reponses, categorie FROM quizz_banque_histo
        ORDER BY (utilisee_le IS NULL) DESC, utilisee_le ASC, RAND()
    ')->fetchAll();

    $choisies     = [];
    $parCategorie = [];
    foreach ($pool as $q) {
        if (count($choisies) >= $nbHisto) break;
        $cat = $q['categorie'] ?? '';
        if (($parCategorie[$cat] ?? 0) >= $maxParCategorie) continue;
        $choisies[]          = $q;
        $parCategorie[$cat]  = ($parCategorie[$cat] ?? 0) + 1;
    }

    // Filet de sécurité : si la contrainte de diversité empêche
    // d'atteindre le nombre demandé (catégorie insuffisamment
    // fournie), on complète malgré tout plutôt que de livrer un
    // quizz incomplet.
    if (count($choisies) < $nbHisto) {
        $idsChoisis = array_column($choisies, 'id');
        foreach ($pool as $q) {
            if (count($choisies) >= $nbHisto) break;
            if (in_array($q['id'], $idsChoisis, true)) continue;
            $choisies[]   = $q;
            $idsChoisis[] = $q['id'];
        }
    }

    return $choisies;
}

function _numeroSpecial(PDO $db, int $saisonId, int $quizzSemaineId): int {
    $stmt = $db->prepare('
        SELECT COUNT(*) FROM quizz_semaine
        WHERE saison_id = ? AND est_treve = 1 AND id <= ?
    ');
    $stmt->execute([$saisonId, $quizzSemaineId]);
    return (int)$stmt->fetchColumn();
}

// Jusqu'à 4 candidats buteurs (2 par club), pris parmi les meilleurs
// buteurs déjà connus de la saison pour chacun des 2 clubs du match.
// Retourne [] si aucun des 2 clubs n'a de buteur connu (trop tôt
// dans la saison) — le générateur retombe alors sur un autre type
// de question, toujours calculable.
function _candidatsButeurs(PDO $db, int $saisonId, int $clubDomId, int $clubExtId): array {
    $stmt = $db->prepare('
        SELECT nom, club_id FROM stats_joueurs
        WHERE saison_id = ? AND club_id IN (?, ?) AND buts > 0
        ORDER BY buts DESC LIMIT 4
    ');
    $stmt->execute([$saisonId, $clubDomId, $clubExtId]);
    $rows = $stmt->fetchAll();
    if (empty($rows)) return [];

    return array_map(fn($r) => ['texte' => $r['nom'], 'club_id' => (int)$r['club_id']], $rows);
}

