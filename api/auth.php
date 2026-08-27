<?php
// ============================================================
//  PRONO-L1 — Authentification
//  Fichier : api/auth.php
//  Adapté de CDM 2026 — même logique, même structure
// ============================================================

require_once 'config.php';
require_once 'utils.php';
require_once 'smtp_mailer.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  POST ?action=inscription
// ============================================================
if ($method === 'POST' && $action === 'inscription') {
    $data  = json_decode(file_get_contents('php://input'), true);
    $nom   = trim($data['nom']          ?? '');
    $email = trim($data['email']        ?? '');
    $mdp   =      $data['mot_de_passe'] ?? '';
    $equipe_coeur_id = !empty($data['equipe_coeur_id']) ? (int)$data['equipe_coeur_id'] : null;

    if (!$nom || !$email || !$mdp) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Champs manquants']);
        exit();
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Email invalide']);
        exit();
    }
    if (strlen($mdp) < 6) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Mot de passe trop court (6 caractères min.)']);
        exit();
    }

    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['erreur' => 'Email déjà utilisé']);
        exit();
    }

    // Calcul des initiales automatiques depuis le nom
    $mots      = explode(' ', $nom);
    $initiales = strtoupper(
        substr($mots[0], 0, 1) . (isset($mots[1]) ? substr($mots[1], 0, 1) : substr($mots[0], 1, 1))
    );
    $hash  = password_hash($mdp, PASSWORD_BCRYPT);
    $token_confirmation = bin2hex(random_bytes(32));

    $stmt = $db->prepare(
        'INSERT INTO users (nom, email, mot_de_passe, avatar_initiales, equipe_coeur_id, token_confirmation)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$nom, $email, $hash, $initiales, $equipe_coeur_id, $token_confirmation]);

    // Email de confirmation — purement informatif, la connexion reste
    // possible même sans cliquer sur le lien
    $host = $_SERVER['HTTP_HOST'] ?? 'prono-l1.docdadi.synology.me';
    $lien = 'https://' . $host . '/#confirmer=' . $token_confirmation;

    $sujet  = 'Prono-L1 — Confirmez votre inscription';
    $corps  = "Bonjour {$nom},\n\n";
    $corps .= "Votre compte Prono-L1 a bien été créé !\n\n";
    $corps .= "Pour l'activer et pouvoir vous connecter, cliquez sur ce lien :\n$lien\n\n";
    $corps .= "— L'équipe Prono-L1";

    $envoye = envoyerEmailSMTP($email, $sujet, $corps);
    if (!$envoye) {
        error_log("Inscription : échec envoi email de confirmation à $email");
    }

    echo json_encode(['statut' => 'OK', 'message' => 'Compte créé ! Un email de confirmation vient de vous être envoyé.']);
    exit();
}

// ============================================================
//  POST ?action=connexion
// ============================================================
elseif ($method === 'POST' && $action === 'connexion') {
    $data  = json_decode(file_get_contents('php://input'), true);
    $email = trim($data['email']        ?? '');
    $mdp   =      $data['mot_de_passe'] ?? '';

    if (!$email || !$mdp) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Champs manquants']);
        exit();
    }

    $stmt = $db->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['erreur' => "Pas encore inscrit avec cet email ? Cliquez sur \"S'inscrire\" ci-dessous."]);
        exit();
    }

    if (!password_verify($mdp, $user['mot_de_passe'])) {
        http_response_code(401);
        echo json_encode(['erreur' => 'Mot de passe incorrect']);
        exit();
    }

    if (!$user['email_confirme'] && !$user['is_admin']) {
        http_response_code(403);
        echo json_encode(['erreur' => "Confirmez votre email avant de vous connecter — un lien vous a été envoyé à l'inscription (pensez à vérifier vos spams)."]);
        exit();
    }

    $token  = bin2hex(random_bytes(32));
    $expire = date('Y-m-d H:i:s', time() + 31536000); // 1 an

    $db->prepare('INSERT INTO sessions (user_id, token, expire) VALUES (?, ?, ?)')
       ->execute([$user['id'], $token, $expire]);

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
        'token'  => $token,
        'expire' => $expire,
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
//  POST ?action=changer_mdp
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
//  POST ?action=changer_pseudo
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
            substr($mots[0], 0, 1) . (isset($mots[1]) ? substr($mots[1], 0, 1) : substr($mots[0], 1, 1))
        );
    }
    if (strlen($initiales) < 1 || strlen($initiales) > 2) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Les initiales doivent faire 1 ou 2 caractères']);
        exit();
    }

    // Vérifier unicité des initiales (sauf pour soi-même)
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
//  GET ?action=verifier_token
// ============================================================
elseif ($method === 'GET' && $action === 'verifier_token') {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token   = str_replace('Bearer ', '', $auth);

    if (!$token) { http_response_code(401); echo json_encode(['erreur' => 'Token manquant']); exit(); }

    $stmt = $db->prepare('SELECT id FROM sessions WHERE token = ? AND expire > NOW()');
    $stmt->execute([$token]);

    if (!$stmt->fetch()) { http_response_code(401); echo json_encode(['erreur' => 'Token invalide ou expiré']); exit(); }

    echo json_encode(['statut' => 'OK']);
    exit();
}

// ============================================================
//  POST ?action=deconnexion — invalide CETTE session précisément
//  (les autres appareils/onglets connectés ne sont pas affectés)
// ============================================================
elseif ($method === 'POST' && $action === 'deconnexion') {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token   = str_replace('Bearer ', '', $auth);

    if ($token) {
        $db->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    }

    echo json_encode(['statut' => 'OK']);
    exit();
}

// ============================================================
//  ACTION INCONNUE
// ============================================================
else {
    http_response_code(404);
    echo json_encode(['erreur' => 'Action inconnue']);
}
