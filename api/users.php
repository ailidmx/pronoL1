<?php
// ============================================================
//  PRONO-L1 — Gestion des utilisateurs
//  Fichier : api/users.php
//  Adapté de CDM 2026
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=profil — infos du joueur connecté
// ============================================================
if ($method === 'GET' && $action === 'profil') {
    $user = verifierToken($db);

    // Code du club de cœur (indépendant de la saison — sert à retrouver
    // le club équivalent quelle que soit la saison consultée)
    $equipe_coeur_code = null;
    if ($user['equipe_coeur_id']) {
        $stmt = $db->prepare('SELECT code FROM clubs WHERE id = ?');
        $stmt->execute([$user['equipe_coeur_id']]);
        $equipe_coeur_code = $stmt->fetchColumn() ?: null;
    }

    echo json_encode([
        'statut' => 'OK',
        'user'   => [
            'id'                => $user['id'],
            'nom'               => $user['nom'],
            'email'             => $user['email'],
            'initiales'         => $user['avatar_initiales'],
            'is_admin'          => (bool)$user['is_admin'],
            'equipe_coeur_id'   => $user['equipe_coeur_id'] ? (int)$user['equipe_coeur_id'] : null,
            'equipe_coeur_code' => $equipe_coeur_code,
        ]
    ]);
    exit();
}

// ============================================================
//  GET ?action=liste — liste tous les joueurs (admin)
// ============================================================
elseif ($method === 'GET' && $action === 'liste') {
    $user = verifierToken($db);
    if (!$user['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $stmt = $db->query('SELECT id, nom, email, avatar_initiales, is_admin, email_confirme, created_at FROM users ORDER BY nom');
    echo json_encode(['statut' => 'OK', 'users' => $stmt->fetchAll()]);
    exit();
}

// ============================================================
//  GET ?action=preferences_notif — préférences notifications
// ============================================================
elseif ($method === 'GET' && $action === 'preferences_notif') {
    $user = verifierToken($db);

    $stmt = $db->prepare('
        SELECT notif_email, notif_push, notif_telegram, telegram_chat_id
        FROM users WHERE id = ?
    ');
    $stmt->execute([$user['id']]);
    $prefs = $stmt->fetch();

    echo json_encode(['statut' => 'OK', 'preferences' => $prefs]);
    exit();
}

// ============================================================
//  POST ?action=preferences_notif — sauver préférences notif
// ============================================================
elseif ($method === 'POST' && $action === 'preferences_notif') {
    $user = verifierToken($db);
    $data = json_decode(file_get_contents('php://input'), true);

    $fields = [];
    $values = [];

    if (isset($data['notif_email'])) {
        $fields[] = 'notif_email = ?';
        $values[] = $data['notif_email'] ? 1 : 0;
    }
    if (isset($data['notif_push'])) {
        $fields[] = 'notif_push = ?';
        $values[] = $data['notif_push'] ? 1 : 0;
    }
    if (isset($data['notif_telegram'])) {
        $fields[] = 'notif_telegram = ?';
        $values[] = $data['notif_telegram'] ? 1 : 0;
    }
    if (isset($data['telegram_chat_id'])) {
        $fields[] = 'telegram_chat_id = ?';
        $values[] = trim($data['telegram_chat_id']) ?: null;
    }

    if (empty($fields)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Aucune donnée à mettre à jour']);
        exit();
    }

    $values[] = $user['id'];
    $db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')
       ->execute($values);

    echo json_encode(['statut' => 'OK', 'message' => 'Préférences sauvegardées']);
    exit();
}

// ============================================================
//  POST ?action=push_subscribe — enregistre l'abonnement de CE
//  navigateur (endpoint + clés) — un joueur peut avoir plusieurs
//  abonnements actifs à la fois (mobile + PC...), chacun sa ligne
// ============================================================
elseif ($method === 'POST' && $action === 'push_subscribe') {
    try {
        $user = verifierToken($db);
        $data = json_decode(file_get_contents('php://input'), true);

        if (empty($data['subscription']['endpoint'])) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Abonnement manquant']);
            exit();
        }

        $endpoint = $data['subscription']['endpoint'];
        $hash     = hash('sha256', $endpoint);

        $db->prepare('
            INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, subscription_json)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                user_id           = VALUES(user_id),
                subscription_json = VALUES(subscription_json)
        ')->execute([$user['id'], $endpoint, $hash, json_encode($data['subscription'])]);

        $db->prepare('UPDATE users SET notif_push = 1 WHERE id = ?')->execute([$user['id']]);

        echo json_encode(['statut' => 'OK', 'message' => 'Abonnement enregistré']);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['erreur' => 'push_subscribe: ' . $e->getMessage()]);
    }
    exit();
}

// ============================================================
//  POST ?action=push_unsubscribe — désinscrit CE navigateur
//  uniquement (les autres appareils du joueur restent abonnés)
// ============================================================
elseif ($method === 'POST' && $action === 'push_unsubscribe') {
    try {
        $user = verifierToken($db);
        $data = json_decode(file_get_contents('php://input'), true);
        $endpoint = $data['endpoint'] ?? null;

        if ($endpoint) {
            $db->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?')
               ->execute([$user['id'], hash('sha256', $endpoint)]);
        }

        // notif_push repassé à 0 seulement s'il ne reste plus aucun appareil abonné
        $stmt = $db->prepare('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        if ((int)$stmt->fetchColumn() === 0) {
            $db->prepare('UPDATE users SET notif_push = 0 WHERE id = ?')->execute([$user['id']]);
        }

        echo json_encode(['statut' => 'OK', 'message' => 'Désabonné']);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['erreur' => 'push_unsubscribe: ' . $e->getMessage()]);
    }
    exit();
}

// ============================================================
//  GET ?action=push_statut — indique si LE NAVIGATEUR ACTUEL
//  (identifié par son endpoint) est déjà connu du serveur —
//  utilisé pour cocher la case correctement à l'ouverture du modal
// ============================================================
elseif ($method === 'GET' && $action === 'push_statut') {
    try {
        $user = verifierToken($db);
        $endpoint = $_GET['endpoint'] ?? '';

        if (!$endpoint) {
            echo json_encode(['statut' => 'OK', 'abonne' => false]);
            exit();
        }

        $stmt = $db->prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?');
        $stmt->execute([$user['id'], hash('sha256', $endpoint)]);

        echo json_encode(['statut' => 'OK', 'abonne' => (bool)$stmt->fetchColumn()]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['erreur' => 'push_statut: ' . $e->getMessage()]);
    }
    exit();
}

// ============================================================
//  POST ?action=push_test — envoie une notif de test au joueur
//  connecté, sur TOUS ses appareils abonnés (pas besoin d'être
//  admin — pratique pour que chacun vérifie chez lui)
// ============================================================
// ============================================================
//  POST ?action=telegram_test — envoie une notif de test au Chat ID
//  fourni (pas besoin d'avoir déjà enregistré ses préférences —
//  pratique pour vérifier le Chat ID avant de valider)
// ============================================================
elseif ($method === 'POST' && $action === 'telegram_test') {
    try {
        verifierToken($db); // juste s'assurer que le joueur est bien connecté
        $data   = json_decode(file_get_contents('php://input'), true);
        $chatId = trim($data['chat_id'] ?? '');

        require_once 'notifications.php';
        $resultat = envoyerTelegramTest($chatId);
        if ($resultat['statut'] !== 'OK') {
            http_response_code(400);
        }
        echo json_encode($resultat);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['erreur' => 'telegram_test: ' . $e->getMessage()]);
    }
    exit();
}

elseif ($method === 'POST' && $action === 'push_test') {
    try {
        $user = verifierToken($db);
        require_once 'notifications.php';

        $resultat = envoyerNotificationTestPush($db, $user['id']);
        if ($resultat['statut'] !== 'OK') {
            http_response_code(400);
        }
        echo json_encode($resultat);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['erreur' => 'push_test: ' . $e->getMessage()]);
    }
    exit();
}

// ============================================================
//  POST ?action=changer_mdp — changer son mot de passe
// ============================================================
elseif ($method === 'POST' && $action === 'changer_mdp') {
    $user = verifierToken($db);
    $data = json_decode(file_get_contents('php://input'), true);

    $ancien  = $data['ancien_mdp']  ?? '';
    $nouveau = $data['nouveau_mdp'] ?? '';

    if (!$ancien || !$nouveau) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Champs manquants']);
        exit();
    }
    if (strlen($nouveau) < 6) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Nouveau mot de passe trop court (6 car. min.)']);
        exit();
    }

    $stmt = $db->prepare('SELECT mot_de_passe FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row = $stmt->fetch();

    if (!password_verify($ancien, $row['mot_de_passe'])) {
        http_response_code(401);
        echo json_encode(['erreur' => 'Ancien mot de passe incorrect']);
        exit();
    }

    $db->prepare('UPDATE users SET mot_de_passe = ? WHERE id = ?')
       ->execute([password_hash($nouveau, PASSWORD_BCRYPT), $user['id']]);

    echo json_encode(['statut' => 'OK', 'message' => 'Mot de passe modifié']);
    exit();
}

// ============================================================
//  POST ?action=changer_pseudo — changer son pseudo + initiales
// ============================================================
elseif ($method === 'POST' && $action === 'changer_pseudo') {
    $user = verifierToken($db);
    $data = json_decode(file_get_contents('php://input'), true);

    $nom       = trim($data['nom']       ?? '');
    $initiales = strtoupper(trim($data['initiales'] ?? ''));

    if (strlen($nom) < 2) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Le pseudo doit faire au moins 2 caractères']);
        exit();
    }

    // Calcul automatique des initiales si non fournies
    if (!$initiales) {
        $mots      = explode(' ', $nom);
        $initiales = strtoupper(
            substr($mots[0], 0, 1) .
            (isset($mots[1]) ? substr($mots[1], 0, 1) : substr($mots[0], 1, 1))
        );
    }
    if (strlen($initiales) < 1 || strlen($initiales) > 2) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Les initiales doivent faire 1 ou 2 caractères']);
        exit();
    }

    // Unicité des initiales (sauf pour soi-même)
    $stmt = $db->prepare('SELECT id FROM users WHERE avatar_initiales = ? AND id != ?');
    $stmt->execute([$initiales, $user['id']]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['erreur' => 'Ces initiales sont déjà utilisées par un autre joueur']);
        exit();
    }

    $db->prepare('UPDATE users SET nom = ?, avatar_initiales = ? WHERE id = ?')
       ->execute([$nom, $initiales, $user['id']]);

    echo json_encode([
        'statut'    => 'OK',
        'message'   => 'Pseudo modifié',
        'nom'       => $nom,
        'initiales' => $initiales,
    ]);
    exit();
}

// ============================================================
//  POST ?action=changer_equipe_coeur — choisir/modifier l'équipe de cœur
//  club_id vide ou null => on retire la préférence (pas obligatoire)
// ============================================================
elseif ($method === 'POST' && $action === 'changer_equipe_coeur') {
    $user = verifierToken($db);
    $data = json_decode(file_get_contents('php://input'), true);

    $club_id = !empty($data['club_id']) ? (int)$data['club_id'] : null;

    // Vérifier que le club existe bien dans la saison courante (si fourni)
    if ($club_id !== null) {
        $saisonId = saisonDemandee($db);
        $stmt = $db->prepare('SELECT id FROM clubs WHERE id = ? AND saison_id = ?');
        $stmt->execute([$club_id, $saisonId]);
        if (!$stmt->fetch()) {
            http_response_code(400);
            echo json_encode(['erreur' => 'Club invalide']);
            exit();
        }
    }

    $db->prepare('UPDATE users SET equipe_coeur_id = ? WHERE id = ?')
       ->execute([$club_id, $user['id']]);

    $equipe_coeur_code = null;
    if ($club_id) {
        $stmt = $db->prepare('SELECT code FROM clubs WHERE id = ?');
        $stmt->execute([$club_id]);
        $equipe_coeur_code = $stmt->fetchColumn() ?: null;
    }

    echo json_encode([
        'statut'            => 'OK',
        'message'           => $club_id ? 'Équipe de cœur enregistrée' : 'Préférence retirée',
        'equipe_coeur_id'   => $club_id,
        'equipe_coeur_code' => $equipe_coeur_code,
    ]);
    exit();
}

// ============================================================
//  GET ?action=confirmer_email — valider le lien reçu par email
//  Non bloquant : si le lien n'est jamais cliqué, la connexion reste
//  possible quand même. Simplement informatif.
// ============================================================
elseif ($method === 'GET' && $action === 'confirmer_email') {
    $token = trim($_GET['token'] ?? '');
    if (!$token) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Lien invalide']);
        exit();
    }

    $stmt = $db->prepare('SELECT id, nom FROM users WHERE token_confirmation = ?');
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        // Lien déjà utilisé ou invalide — reste silencieux plutôt que d'afficher une erreur
        echo json_encode(['statut' => 'OK', 'deja_confirme' => true, 'message' => 'Email déjà confirmé']);
        exit();
    }

    $db->prepare('UPDATE users SET email_confirme = 1, token_confirmation = NULL WHERE id = ?')
       ->execute([$user['id']]);

    echo json_encode(['statut' => 'OK', 'message' => 'Email confirmé, ' . $user['nom'] . ' ! Vous pouvez maintenant vous connecter.']);
    exit();
}

// ============================================================
//  POST ?action=confirmer_email_admin — confirmer manuellement
//  l'email d'un joueur (admin), si le mail n'arrive jamais
// ============================================================
elseif ($method === 'POST' && $action === 'confirmer_email_admin') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data    = json_decode(file_get_contents('php://input'), true);
    $user_id = intval($data['user_id'] ?? 0);
    if (!$user_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Utilisateur manquant']);
        exit();
    }

    $db->prepare('UPDATE users SET email_confirme = 1, token_confirmation = NULL WHERE id = ?')
       ->execute([$user_id]);

    echo json_encode(['statut' => 'OK', 'message' => 'Email confirmé manuellement']);
    exit();
}

// ============================================================
//  POST ?action=mot_de_passe_oublie — envoyer lien de reset
// ============================================================
elseif ($method === 'POST' && $action === 'mot_de_passe_oublie') {
    $data  = json_decode(file_get_contents('php://input'), true);
    $email = trim($data['email'] ?? '');

    if (!$email) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Email manquant']);
        exit();
    }

    $stmt = $db->prepare('SELECT id, nom FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // On répond OK même si l'email n'existe pas (sécurité)
    if ($user) {
        $token  = bin2hex(random_bytes(32));
        $expire = date('Y-m-d H:i:s', time() + 3600); // 1 heure

        $db->prepare('UPDATE users SET reset_token = ?, reset_expire = ? WHERE id = ?')
           ->execute([$token, $expire, $user['id']]);

        // Lien de réinitialisation — adapte l'URL à ton domaine
        $host = $_SERVER['HTTP_HOST'] ?? 'prono-l1.docdadi.synology.me';
		$lien = 'https://' . $host . '/#reset=' . $token;

        $sujet  = 'Prono-L1 — Réinitialisation de votre mot de passe';
        $corps  = "Bonjour {$user['nom']},\n\n";
        $corps .= "Vous avez demandé à réinitialiser votre mot de passe.\n\n";
        $corps .= "Cliquez sur ce lien (valable 1 heure) :\n$lien\n\n";
        $corps .= "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n";
        $corps .= "— L'équipe Prono-L1";

        // mail() natif ne fonctionne pas sur ce NAS (aucun serveur mail
        // local) — même correctif que pour les notifications de match.
        require_once __DIR__ . '/smtp_mailer.php';
        $envoye = envoyerEmailSMTP($email, $sujet, $corps);
        if (!$envoye) {
            error_log("Mot de passe oublié : échec envoi email à $email");
        }
    }

    echo json_encode(['statut' => 'OK', 'message' => 'Si cet email existe, un lien a été envoyé']);
    exit();
}

// ============================================================
//  POST ?action=reinitialiser — nouveau mdp via token de reset
// ============================================================
elseif ($method === 'POST' && $action === 'reinitialiser') {
    $data   = json_decode(file_get_contents('php://input'), true);
    $token  = trim($data['token']        ?? '');
    $nouveau = $data['mot_de_passe']     ?? '';

    if (!$token || !$nouveau) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Données manquantes']);
        exit();
    }
    if (strlen($nouveau) < 6) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Mot de passe trop court (6 car. min.)']);
        exit();
    }

    $stmt = $db->prepare('SELECT id FROM users WHERE reset_token = ? AND reset_expire > NOW()');
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Lien invalide ou expiré']);
        exit();
    }

    $db->prepare('UPDATE users SET mot_de_passe = ?, reset_token = NULL, reset_expire = NULL WHERE id = ?')
       ->execute([password_hash($nouveau, PASSWORD_BCRYPT), $user['id']]);

    echo json_encode(['statut' => 'OK', 'message' => 'Mot de passe réinitialisé']);
    exit();
}

// ============================================================
//  POST ?action=reset_mdp — reset mdp par l'admin
// ============================================================
elseif ($method === 'POST' && $action === 'reset_mdp') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data    = json_decode(file_get_contents('php://input'), true);
    $user_id = intval($data['user_id']    ?? 0);
    $nouveau = $data['nouveau_mdp'] ?? 'Prono2026!';  // mdp par défaut

    if (!$user_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Utilisateur manquant']);
        exit();
    }

    $db->prepare('UPDATE users SET mot_de_passe = ? WHERE id = ?')
       ->execute([password_hash($nouveau, PASSWORD_BCRYPT), $user_id]);

    echo json_encode(['statut' => 'OK', 'message' => 'Mot de passe réinitialisé à : ' . $nouveau]);
    exit();
}

// ============================================================
//  POST ?action=supprimer — supprimer un compte (admin)
// ============================================================
elseif ($method === 'POST' && $action === 'supprimer') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data    = json_decode(file_get_contents('php://input'), true);
    $user_id = intval($data['user_id'] ?? 0);

    if (!$user_id) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Utilisateur manquant']);
        exit();
    }
    if ($user_id === $admin['id']) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Impossible de supprimer votre propre compte']);
        exit();
    }

    // Les pronostics sont supprimés en cascade (FK)
    $db->prepare('DELETE FROM users WHERE id = ?')->execute([$user_id]);

    echo json_encode(['statut' => 'OK', 'message' => 'Compte supprimé']);
    exit();
}

// ============================================================
//  POST ?action=annonce — envoie une annonce libre (admin) à tous
//  les joueurs sur les canaux cochés au moment de l'envoi
// ============================================================
elseif ($method === 'POST' && $action === 'annonce') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    $data   = json_decode(file_get_contents('php://input'), true);
    $texte  = trim($data['texte'] ?? '');
    $canaux = $data['canaux'] ?? [];

    if (!$texte) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Message vide']);
        exit();
    }
    if (!is_array($canaux) || empty($canaux)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Choisis au moins un canal']);
        exit();
    }

    require_once 'notifications.php';
    $resultat = envoyerNotificationLibre($db, $texte, $canaux, $admin['id']);
    if ($resultat['statut'] !== 'OK') {
        http_response_code(400);
    }
    echo json_encode($resultat);
    exit();
}

// ============================================================
//  GET ?action=annonces_historique — les 20 dernières annonces
//  libres envoyées par l'admin (fil consultable)
// ============================================================
elseif ($method === 'GET' && $action === 'annonces_historique') {
    $admin = verifierToken($db);
    if (!$admin['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
        exit();
    }

    require_once 'notifications.php';
    echo json_encode(['statut' => 'OK', 'annonces' => listerAnnoncesAdmin($db)]);
    exit();
}

// ============================================================
//  ACTION INCONNUE
// ============================================================
else {
    http_response_code(404);
    echo json_encode(['erreur' => 'Action inconnue']);
}
