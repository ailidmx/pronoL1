<?php
// ============================================================
//  PRONO-L1 — Envoi des notifications
//  Fichier : api/notifications.php
//  Adapté de CDM 2026
//
//  Appelé par : classement.php après calcul des points
//               cron_sync.php après chaque match terminé
//
//  Fonction principale : envoyerNotificationsGroupees($db, $saisonId)
//  (regroupe par date locale — voir plus bas). L'ancienne fonction
//  match par match, envoyerNotificationsMatch(), est conservée
//  ci-dessous mais n'est plus appelée par le flux normal.
// ============================================================

require_once 'config.php';
require_once __DIR__ . '/smtp_mailer.php';
require_once __DIR__ . '/webpush.php';

// ============================================================
//  Configuration notifications
// ============================================================
define('NOTIF_FROM_EMAIL',  'prono-l1@free.fr');
define('NOTIF_FROM_NAME',   'Prono-L1');
// TELEGRAM_BOT_TOKEN est désormais défini dans config.php (avec les autres identifiants d'API)

// ============================================================
//  FONCTION PRINCIPALE
//  Envoie les notifications pour un match donné
//  à tous les joueurs ayant pronostiqué ce match
// ============================================================
function envoyerNotificationsMatch(PDO $db, int $match_id): void {
    // Récupérer les infos du match
    $stmt = $db->prepare('
        SELECT
            m.journee, m.score_dom, m.score_ext,
            c1.nom AS nom_dom, c1.nom_court AS court_dom,
            c2.nom AS nom_ext, c2.nom_court AS court_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.id = ?
    ');
    $stmt->execute([$match_id]);
    $match = $stmt->fetch();

    if (!$match || $match['score_dom'] === null) return;

    // Récupérer les pronostics + infos joueurs
    $stmt = $db->prepare('
        SELECT
            p.score_dom_pred, p.score_ext_pred, p.resultat, p.points,
            u.id AS user_id, u.nom, u.email,
            u.notif_email, u.notif_telegram, u.telegram_chat_id,
            u.notif_push
        FROM pronostics p
        JOIN users u ON u.id = p.user_id
        WHERE p.match_id = ?
        AND p.resultat IS NOT NULL
    ');
    $stmt->execute([$match_id]);
    $pronos = $stmt->fetchAll();

    if (empty($pronos)) return;

    // Récupérer le classement général pour chaque joueur
    $classement = _getClassementRapide($db);

    foreach ($pronos as $p) {
        $rang = $classement[$p['email']]['rang']  ?? '—';
        $pts  = $classement[$p['email']]['total'] ?? 0;

        // Badge résultat
        $badge = match($p['resultat']) {
            'exact'   => '✅ Score exact',
            'bon'     => '🟡 Bon résultat',
            'mauvais' => '❌ Raté',
            default   => '—',
        };

        // Corps du message
        $msg = _construireMessage(
            $match, $p, $badge, $rang, $pts
        );

        // Envoi selon préférences
        if ($p['notif_email'] && $p['email']) {
            _envoyerEmail($p['email'], $p['nom'], $match, $msg);
        }
        if ($p['notif_telegram'] && $p['telegram_chat_id']) {
            _envoyerTelegram($p['telegram_chat_id'], $msg['telegram']);
        }
        if ($p['notif_push']) {
            $titre = "⚽ {$match['court_dom']} {$match['score_dom']}-{$match['score_ext']} {$match['court_ext']}";
            foreach (_abonnementsPushDe($db, (int)$p['user_id']) as $sub) {
                envoyerPush($sub['subscription_json'], $titre, $msg['push'], 'https://prono-l1.docdadi.synology.me');
            }
        }
    }
}

// ============================================================
//  Construction du message
// ============================================================
function _construireMessage(array $match, array $prono, string $badge, $rang, int $pts): array {
    $score_reel  = "{$match['score_dom']}-{$match['score_ext']}";
    $score_pred  = "{$prono['score_dom_pred']}-{$prono['score_ext_pred']}";
    $pts_gagnes  = $prono['points'];
    $journee     = $match['journee'];
    $dom         = $match['court_dom'];
    $ext         = $match['court_ext'];

    // Version Telegram (Markdown)
    $telegram  = "🏆 *Prono-L1 — J{$journee}*\n\n";
    $telegram .= "⚽ *{$dom} {$score_reel} {$ext}*\n\n";
    $telegram .= "Ton prono : {$score_pred} → {$badge} → *+{$pts_gagnes} pts*\n";
    $telegram .= "━━━━━━━━━━━━━━━━\n";
    $telegram .= "📊 Classement : *{$rang}e* ({$pts} pts au total)\n\n";
    $telegram .= "👉 [Voir le classement](https://prono-l1.docdadi.synology.me)";

    // Version Email (texte brut)
    $email  = "Bonjour {$prono['nom']},\n\n";
    $email .= "⚽ {$dom} {$score_reel} {$ext} — Journée {$journee}\n\n";
    $email .= "Ton pronostic : {$score_pred}\n";
    $email .= "Résultat : {$badge} → +{$pts_gagnes} points\n\n";
    $email .= "━━━━━━━━━━━━━━━━━━━━\n";
    $email .= "Ton classement : {$rang}e ({$pts} pts au total)\n\n";
    $email .= "👉 Voir le classement complet :\n";
    $email .= "https://prono-l1.docdadi.synology.me\n\n";
    $email .= "— L'équipe Prono-L1";

    // Version push (courte — les notifs système affichent peu de texte)
    $push = "Ton prono {$score_pred} → {$badge} → +{$pts_gagnes} pts · {$rang}e ({$pts} pts)";

    return ['telegram' => $telegram, 'email' => $email, 'push' => $push];
}

// ============================================================
//  Envoi Email via le relais Gmail (smtp_mailer.php) — mail() natif
//  ne fonctionnait pas sur ce NAS (aucun serveur mail local), c'est
//  précisément pour ça que le relais SMTP Gmail a été mis en place
//  ailleurs dans l'appli (mercato, alertes cron, inscription...).
//  Cette fonction utilisait encore l'ancienne méthode par erreur.
// ============================================================
function _envoyerEmail(string $email, string $nom, array $match, array $msg): void {
    $sujet = "Prono-L1 — {$match['court_dom']} {$match['score_dom']}-{$match['score_ext']} {$match['court_ext']} · J{$match['journee']}";
    envoyerEmailSMTP($email, $sujet, $msg['email']);
}

// ============================================================
//  Envoi Telegram via Bot API
// ============================================================
function _envoyerTelegram(string $chat_id, string $texte): void {
    if (!TELEGRAM_BOT_TOKEN) return;

    $url  = "https://api.telegram.org/bot" . TELEGRAM_BOT_TOKEN . "/sendMessage";
    $data = [
        'chat_id'    => $chat_id,
        'text'       => $texte,
        'parse_mode' => 'Markdown',
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($data),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

// ============================================================
//  Notification de test — envoyée à un seul joueur, immédiatement,
//  sans dépendre d'un vrai résultat de match (bouton Admin)
// ============================================================
function envoyerNotificationTestPush(PDO $db, int $userId): array {
    $stmt = $db->prepare('SELECT nom FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    if (!$u) return ['statut' => 'erreur', 'erreur' => 'Utilisateur introuvable'];

    $abonnements = _abonnementsPushDe($db, $userId);
    if (empty($abonnements)) {
        return ['statut' => 'erreur', 'erreur' => 'Aucun abonnement push enregistré pour ce compte'];
    }

    $reussis = 0;
    foreach ($abonnements as $sub) {
        $ok = envoyerPush(
            $sub['subscription_json'],
            '🔔 Prono-L1',
            "Salut {$u['nom']} ! Si tu vois ce message, les notifications push fonctionnent 🎉",
            'https://prono-l1.docdadi.synology.me'
        );
        if ($ok) $reussis++;
        else _purgerAbonnementSiExpire($db, $sub['id']);
    }

    return $reussis > 0
        ? ['statut' => 'OK', 'message' => "Notification envoyée ($reussis/" . count($abonnements) . " appareil(s))"]
        : ['statut' => 'erreur', 'erreur' => 'Échec de l\'envoi sur tous les appareils — voir api/logs/webpush.log'];
}

// Tous les abonnements actifs d'un joueur (potentiellement plusieurs
// appareils : mobile, PC...)
function _abonnementsPushDe(PDO $db, int $userId): array {
    $stmt = $db->prepare('SELECT id, subscription_json FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

// Si l'envoi échoue de façon définitive (abonnement révoqué/expiré côté
// navigateur), on nettoie la ligne pour ne pas retenter indéfiniment.
// webpush.php ne distingue pas encore précisément le type d'échec — pour
// l'instant on ne purge PAS automatiquement (mieux vaut un log à relire
// qu'un abonnement supprimé par erreur suite à un souci réseau ponctuel).
function _purgerAbonnementSiExpire(PDO $db, int $subscriptionId): void {
    // Volontairement inactif pour l'instant — voir commentaire ci-dessus
}

// ============================================================
//  Notification de test Telegram — envoyée directement au Chat ID
//  fourni, sans dépendre de ce qui est déjà enregistré en base (utile
//  pour vérifier le Chat ID avant même de cliquer sur Enregistrer)
// ============================================================
function envoyerTelegramTest(string $chatId): array {
    if (!TELEGRAM_BOT_TOKEN) {
        return ['statut' => 'erreur', 'erreur' => 'Bot Telegram non configuré côté serveur'];
    }
    if (!$chatId) {
        return ['statut' => 'erreur', 'erreur' => 'Chat ID manquant'];
    }

    $url  = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
    $data = [
        'chat_id' => $chatId,
        'text'    => "🔔 Prono-L1\n\nSi tu vois ce message, les notifications Telegram fonctionnent 🎉",
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($data),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $reponse = curl_exec($ch);
    $code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 200) {
        return ['statut' => 'OK', 'message' => 'Notification Telegram envoyée'];
    }

    // Telegram renvoie un JSON avec 'description' expliquant l'erreur
    // (ex: "chat not found" si le Chat ID est incorrect ou si le joueur
    // n'a jamais écrit au bot au préalable)
    $detail = json_decode($reponse, true)['description'] ?? 'Erreur inconnue';
    return ['statut' => 'erreur', 'erreur' => "Échec Telegram : $detail"];
}

// ============================================================
//  Rappel push "1h avant l'heure limite" — pour les joueurs qui
//  n'ont pas encore pronostiqué un match dont le coup d'envoi
//  approche. Groupé en une seule notif si plusieurs matchs du
//  même joueur tombent dans la même fenêtre horaire.
//  À appeler à chaque passage du cron (toutes les 15 min) — la
//  fenêtre de détection est volontairement plus large que 15 min
//  pour ne rater aucun match malgré d'éventuels retards du cron,
//  tandis que push_rappels_envoyes empêche tout double envoi.
// ============================================================
function verifierRappelsAvantMatch(PDO $db, int $saisonId): array {
    // Matchs dont le coup d'envoi tombe entre 50 et 70 minutes à partir
    // de maintenant — fenêtre de 20 min, centrée sur "1h avant"
    $stmt = $db->prepare("
        SELECT m.id, m.date, m.journee,
               c1.nom_court AS court_dom, c2.nom_court AS court_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ?
        AND m.statut = 'a_venir'
        AND m.date BETWEEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 50 MINUTE)
                        AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 70 MINUTE)
    ");
    $stmt->execute([$saisonId]);
    $matchs = $stmt->fetchAll();
    if (empty($matchs)) return ['matchs_verifies' => 0, 'notifs_envoyees' => 0];

    $matchIds = array_column($matchs, 'id');
    $in = implode(',', array_fill(0, count($matchIds), '?'));

    // Pour chaque match candidat, les joueurs abonnés au push qui n'ont
    // PAS encore pronostiqué ET n'ont pas déjà reçu de rappel pour ce match
    $stmt = $db->prepare("
        SELECT u.id AS user_id, m.id AS match_id
        FROM users u
        CROSS JOIN matches m
        WHERE u.notif_push = 1
        AND m.id IN ($in)
        AND NOT EXISTS (SELECT 1 FROM pronostics p WHERE p.user_id = u.id AND p.match_id = m.id)
        AND NOT EXISTS (SELECT 1 FROM push_rappels_envoyes r WHERE r.user_id = u.id AND r.match_id = m.id)
    ");
    $stmt->execute($matchIds);
    $aRappeler = $stmt->fetchAll();
    if (empty($aRappeler)) return ['matchs_verifies' => count($matchs), 'notifs_envoyees' => 0];

    // Regrouper par joueur : un joueur peut avoir plusieurs matchs à rappeler
    $parJoueur = [];
    foreach ($aRappeler as $r) {
        $parJoueur[$r['user_id']][] = $r['match_id'];
    }
    $matchsParId = array_column($matchs, null, 'id');

    $notifsEnvoyees = 0;
    $insertRappel = $db->prepare('INSERT IGNORE INTO push_rappels_envoyes (user_id, match_id) VALUES (?, ?)');

    foreach ($parJoueur as $userId => $idsMatchsJoueur) {
        $labels = array_map(function($id) use ($matchsParId) {
            $m = $matchsParId[$id];
            return "{$m['court_dom']}-{$m['court_ext']}";
        }, $idsMatchsJoueur);

        $titre = '⏰ Plus qu\'1h pour pronostiquer !';
        $corps = count($labels) === 1
            ? $labels[0] . ' commence bientôt'
            : count($labels) . ' matchs démarrent bientôt : ' . implode(', ', $labels);

        $abonnements = _abonnementsPushDe($db, (int)$userId);
        $auMoinsUnEnvoiReussi = false;
        foreach ($abonnements as $sub) {
            if (envoyerPush($sub['subscription_json'], $titre, $corps, 'https://prono-l1.docdadi.synology.me')) {
                $auMoinsUnEnvoiReussi = true;
            }
        }

        // On marque "rappel envoyé" dès qu'on a essayé (que ça ait
        // réussi ou non sur chaque appareil) pour ne jamais spammer en
        // boucle un joueur dont l'envoi échouerait systématiquement
        foreach ($idsMatchsJoueur as $matchId) {
            $insertRappel->execute([$userId, $matchId]);
        }
        if ($auMoinsUnEnvoiReussi) $notifsEnvoyees++;
    }

    return ['matchs_verifies' => count($matchs), 'notifs_envoyees' => $notifsEnvoyees, 'joueurs_concernes' => count($parJoueur)];
}

// ============================================================
//  Notifications groupées par date — un seul envoi (par joueur) pour
//  tous les matchs terminés un même jour et pas encore notifiés, même
//  si plusieurs journées de championnat sont concernées (ex: un match
//  reporté de J2 qui se rejoue le même jour qu'une partie de J5 — les
//  2 matchs partent dans la même notification, chacun étiqueté avec
//  sa propre journée).
//  Remplace l'envoi immédiat match par match (envoyerNotificationsMatch
//  ci-dessus, conservée telle quelle mais plus appelée par le flux
//  normal — cron_sync.php et envoyerNotificationsEnAttente appellent
//  désormais cette fonction).
// ============================================================
function envoyerNotificationsGroupees(PDO $db, int $saisonId): array {
    $stmt = $db->prepare("
        SELECT id, date, journee, score_dom, score_ext
        FROM matches
        WHERE saison_id = ? AND statut = 'termine' AND notif_envoyee = 0
        AND score_dom IS NOT NULL
        AND date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY date ASC
    ");
    $stmt->execute([$saisonId]);
    $matchs = $stmt->fetchAll();
    if (empty($matchs)) return ['dates_traitees' => 0, 'matchs_notifies' => 0];

    // Regroupement par date LOCALE (Europe/Paris), pas la date UTC brute
    // — un match tard le soir en heure d'hiver pourrait sinon basculer
    // sur le jour suivant/précédent selon l'heure exacte de comparaison.
    $groupes = []; // 'YYYY-MM-DD' => [match, match, ...]
    foreach ($matchs as $m) {
        $dt = new DateTime($m['date'], new DateTimeZone('UTC'));
        $dt->setTimezone(new DateTimeZone('Europe/Paris'));
        $groupes[$dt->format('Y-m-d')][] = $m;
    }
    ksort($groupes); // dates les plus anciennes en premier

    $datesTraitees  = 0;
    $matchsNotifies = 0;
    foreach ($groupes as $dateLocale => $matchsDuJour) {
        $matchIds = array_column($matchsDuJour, 'id');
        try {
            _envoyerNotificationsPourDate($db, $saisonId, $dateLocale, $matchIds);
            $placeholders = implode(',', array_fill(0, count($matchIds), '?'));
            $db->prepare("UPDATE matches SET notif_envoyee = 1 WHERE id IN ($placeholders)")
               ->execute($matchIds);
            $datesTraitees++;
            $matchsNotifies += count($matchIds);
        } catch (Exception $e) {
            // On ne marque PAS notif_envoyee=1 pour ce groupe : le prochain
            // passage (cron ou bouton admin "Recalculer les points")
            // retentera automatiquement l'envoi de tout le groupe.
            _logErreur("Notifications groupées du $dateLocale : échec — " . $e->getMessage());
        }
    }

    return ['dates_traitees' => $datesTraitees, 'matchs_notifies' => $matchsNotifies];
}

// ============================================================
//  Construit et envoie, pour UNE date locale donnée, un message
//  consolidé par joueur couvrant tous les matchs de ce jour-là.
// ============================================================
function _envoyerNotificationsPourDate(PDO $db, int $saisonId, string $dateLocale, array $matchIds): void {
    $placeholders = implode(',', array_fill(0, count($matchIds), '?'));

    $stmt = $db->prepare("
        SELECT m.id, m.journee, m.score_dom, m.score_ext, m.date,
               c1.nom_court AS court_dom, c2.nom_court AS court_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.id IN ($placeholders)
        ORDER BY m.journee ASC, m.date ASC
    ");
    $stmt->execute($matchIds);
    $matchsParId = array_column($stmt->fetchAll(), null, 'id');

    // Barème (une fois, identique pour toute la saison)
    $bareme = chargerBareme($db, $saisonId);

    // Tous les pronostics des joueurs sur les matchs de ce jour
    $stmt = $db->prepare("
        SELECT
            p.match_id, p.score_dom_pred, p.score_ext_pred, p.resultat, p.points,
            u.id AS user_id, u.nom, u.email,
            u.notif_email, u.notif_telegram, u.telegram_chat_id, u.notif_push
        FROM pronostics p
        JOIN users u ON u.id = p.user_id
        WHERE p.match_id IN ($placeholders)
        AND p.resultat IS NOT NULL
    ");
    $stmt->execute($matchIds);
    $pronos = $stmt->fetchAll();
    if (empty($pronos)) return;

    // Groupement par joueur — un joueur peut avoir pronostiqué plusieurs
    // matchs de la même date
    $parJoueur = [];
    foreach ($pronos as $p) {
        $parJoueur[$p['user_id']][] = $p;
    }

    // Classement "à ce moment-là" : ne compte que les matchs joués jusqu'à
    // la date de ce groupe (inclus) — pour qu'un rattrapage groupé (ex:
    // plusieurs dates notifiées d'un coup via "Recalculer les points")
    // affiche une progression cohérente plutôt que le même total final
    // partout. En usage normal (notifs envoyées au jour le jour), ça
    // revient exactement au même que le total courant.
    $dateLimite = max(array_column($matchsParId, 'date'));
    $classement = _getClassementRapideJusquA($db, $saisonId, $dateLimite);

    foreach ($parJoueur as $userId => $pronosJoueur) {
        $premier = $pronosJoueur[0]; // même user_id/email/préférences sur toutes les lignes
        $rang = $classement[$premier['email']]['rang']  ?? '—';
        $pts  = $classement[$premier['email']]['total'] ?? 0;

        $msg = _construireMessageGroupe($dateLocale, $matchsParId, $pronosJoueur, $bareme, $premier['nom'], $rang, $pts);

        if ($premier['notif_email'] && $premier['email']) {
            $sujet = "Prono-L1 — Résultats du " . (new DateTime($dateLocale))->format('d/m/Y');
            envoyerEmailSMTP($premier['email'], $sujet, $msg['email']);
        }
        if ($premier['notif_telegram'] && $premier['telegram_chat_id']) {
            _envoyerTelegram($premier['telegram_chat_id'], $msg['telegram']);
        }
        if ($premier['notif_push']) {
            foreach (_abonnementsPushDe($db, (int)$userId) as $sub) {
                envoyerPush($sub['subscription_json'], $msg['titre_push'], $msg['push'], 'https://prono-l1.docdadi.synology.me');
            }
        }
    }
}

// ============================================================
//  Construction du message groupé (plusieurs matchs d'une même date
//  locale, potentiellement de journées de championnat différentes en
//  cas de report). Chaque ligne de match précise sa propre journée
//  ("J1", "J2"...) pour rester lisible même en cas de mélange.
// ============================================================
function _construireMessageGroupe(string $dateLocale, array $matchsParId, array $pronosJoueur, array $bareme, string $nomJoueur, $rang, int $pts): array {
    $dateAffichee = (new DateTime($dateLocale))->format('d/m/y');

    $lignesTelegram = [];
    $lignesEmail    = [];
    $lignesPush     = [];

    foreach ($pronosJoueur as $prono) {
        $match     = $matchsParId[$prono['match_id']];
        $scoreReel = "{$match['score_dom']}-{$match['score_ext']}";
        $scorePred = "{$prono['score_dom_pred']}-{$prono['score_ext_pred']}";
        $ptsMatch  = (int)$prono['points'];
        $unite     = in_array($ptsMatch, [0, 1], true) ? 'pt' : 'pts';

        $badge = match ($prono['resultat']) {
            'exact'   => '✅ Score exact',
            'bon'     => '🟡 Bon résultat',
            'mauvais' => '❌ Raté',
            default   => '—',
        };

        $d = decomposerPoints(
            $bareme,
            (int)$prono['score_dom_pred'], (int)$prono['score_ext_pred'],
            (int)$match['score_dom'], (int)$match['score_ext']
        );
        $decomposition = "{$d['exact']}+{$d['bon_resultat']}+{$d['bonus_ecart']}+{$d['bonus_buts_dom']}+{$d['bonus_buts_ext']}";

        $lignesTelegram[] = "⚽ *J{$match['journee']} {$match['court_dom']} {$scoreReel} {$match['court_ext']}*\n"
            . "Ton prono {$scorePred} → {$badge} → *+{$ptsMatch} {$unite}* ({$decomposition})";

        $lignesEmail[] = "⚽ J{$match['journee']} {$match['court_dom']} {$scoreReel} {$match['court_ext']}\n"
            . "Ton prono {$scorePred} → {$badge} → +{$ptsMatch} {$unite} ({$decomposition})";

        $lignesPush[] = "J{$match['journee']} {$match['court_dom']} {$scoreReel} {$match['court_ext']} : {$scorePred} → {$badge} → +{$ptsMatch} {$unite} ({$decomposition})";
    }

    $uniteTotal = in_array($pts, [0, 1], true) ? 'pt' : 'pts';

    $telegram  = "🏆 *Prono-L1 — {$dateAffichee}*\n\n";
    $telegram .= implode("\n\n", $lignesTelegram);
    $telegram .= "\n━━━━━━━━━━━━━━━━\n";
    $telegram .= "📊 Classement : *{$rang}e* ({$pts} {$uniteTotal} au total)\n\n";
    $telegram .= "👉 [Voir le classement](https://prono-l1.docdadi.synology.me)";

    $email  = "Bonjour {$nomJoueur},\n\n";
    $email .= "📅 Résultats du {$dateAffichee}\n\n";
    $email .= implode("\n\n", $lignesEmail);
    $email .= "\n\n━━━━━━━━━━━━━━━━━━━━\n";
    $email .= "Ton classement : {$rang}e ({$pts} {$uniteTotal} au total)\n\n";
    $email .= "👉 Voir le classement complet :\n";
    $email .= "https://prono-l1.docdadi.synology.me\n\n";
    $email .= "— L'équipe Prono-L1";

    $push = implode("\n\n", $lignesPush) . "\n\nClassement {$rang}e ({$pts} {$uniteTotal})";

    return [
        'telegram'   => $telegram,
        'email'      => $email,
        'push'       => $push,
        'titre_push' => "📅 {$dateAffichee} — Résultats Prono-L1",
    ];
}

// ============================================================
//  Annonce libre admin — message composé librement par l'admin (1-2
//  phrases en général), diffusé à TOUS les joueurs sur les canaux
//  choisis à l'envoi (indépendant du contexte d'un match). N'envoie
//  à un joueur sur un canal donné que si ce canal est coché à l'envoi
//  ET que le joueur a lui-même activé ce canal dans ses préférences.
//  Une trace est conservée dans annonces_admin (nécessite la table —
//  voir migration SQL fournie séparément).
// ============================================================
function envoyerNotificationLibre(PDO $db, string $texte, array $canaux, int $adminId): array {
    $texte = trim($texte);
    if ($texte === '') {
        return ['statut' => 'erreur', 'erreur' => 'Message vide'];
    }

    $canauxValides = array_values(array_intersect($canaux, ['push', 'email', 'telegram']));
    if (empty($canauxValides)) {
        return ['statut' => 'erreur', 'erreur' => 'Aucun canal sélectionné'];
    }

    $stmt  = $db->query('SELECT id, nom, email, notif_email, notif_telegram, telegram_chat_id, notif_push FROM users');
    $users = $stmt->fetchAll();

    $nbDestinataires = 0;

    foreach ($users as $u) {
        $envoyeAuMoinsUneFois = false;

        if (in_array('email', $canauxValides, true) && $u['notif_email'] && $u['email']) {
            $corps = "Bonjour {$u['nom']},\n\n{$texte}\n\n— L'équipe Prono-L1";
            envoyerEmailSMTP($u['email'], 'Prono-L1 — Annonce', $corps);
            $envoyeAuMoinsUneFois = true;
        }
        if (in_array('telegram', $canauxValides, true) && $u['notif_telegram'] && $u['telegram_chat_id']) {
            _envoyerTelegram($u['telegram_chat_id'], "📢 *Prono-L1*\n\n{$texte}");
            $envoyeAuMoinsUneFois = true;
        }
        if (in_array('push', $canauxValides, true) && $u['notif_push']) {
            foreach (_abonnementsPushDe($db, (int)$u['id']) as $sub) {
                envoyerPush($sub['subscription_json'], '📢 Prono-L1', $texte, 'https://prono-l1.docdadi.synology.me');
            }
            $envoyeAuMoinsUneFois = true;
        }

        if ($envoyeAuMoinsUneFois) $nbDestinataires++;
    }

    $db->prepare('INSERT INTO annonces_admin (texte, canaux, admin_id, nb_destinataires) VALUES (?, ?, ?, ?)')
       ->execute([$texte, implode(',', $canauxValides), $adminId, $nbDestinataires]);

    return ['statut' => 'OK', 'nb_destinataires' => $nbDestinataires];
}

// ============================================================
//  Historique des annonces libres admin (les 20 dernières)
// ============================================================
function listerAnnoncesAdmin(PDO $db): array {
    $stmt = $db->query('
        SELECT a.id, a.texte, a.canaux, a.nb_destinataires, a.created_at, u.nom AS admin_nom
        FROM annonces_admin a
        JOIN users u ON u.id = a.admin_id
        ORDER BY a.created_at DESC
        LIMIT 20
    ');
    return $stmt->fetchAll();
}

// ============================================================
//  Classement rapide pour afficher le rang dans la notif
// ============================================================
function _getClassementRapide(PDO $db): array {
    $saisonId = saisonDemandee($db); // notifications = toujours la saison en cours
    $stmt = $db->prepare('
        SELECT
            u.email,
            COALESCE(SUM(p.points), 0) +
            COALESCE((
                SELECT SUM(pb.points)
                FROM pronostics_bonus pb
                WHERE pb.user_id = u.id AND pb.saison_id = ?
            ), 0) AS total
        FROM users u
        LEFT JOIN pronostics p ON p.user_id = u.id
            AND p.match_id IN (SELECT id FROM matches WHERE saison_id = ?)
        GROUP BY u.id, u.email
        ORDER BY total DESC
    ');
    $stmt->execute([$saisonId, $saisonId]);
    $rows = $stmt->fetchAll();

    $classement = [];
    // Rang partagé en cas d'égalité (1, 1, 3, 3, 5...) — même logique que
    // classement.php, pour que le rang annoncé dans les notifs corresponde
    // toujours à celui affiché dans l'appli (sinon un joueur ex-aequo se
    // voit annoncé à une position différente selon l'ordre de tri SQL).
    $rangCourant  = 0;
    $ptsPrecedent = null;
    foreach ($rows as $i => $row) {
        $total = (int)$row['total'];
        if ($total !== $ptsPrecedent) {
            $rangCourant  = $i + 1;
            $ptsPrecedent = $total;
        }
        $classement[$row['email']] = [
            'rang'  => $rangCourant,
            'total' => $total,
        ];
    }
    return $classement;
}

// ============================================================
//  Variante de _getClassementRapide() bornée dans le temps : ne compte
//  que les points des matchs joués jusqu'à $dateLimiteUtc (inclus).
//  Utilisée par les notifications groupées pour afficher une
//  progression cohérente même en cas de rattrapage groupé (plusieurs
//  dates envoyées d'un coup). Les bonus de saison (pronostics_bonus —
//  champion de journée, etc.) ne sont pas datés individuellement et
//  restent donc comptés en totalité, comme dans _getClassementRapide().
// ============================================================
function _getClassementRapideJusquA(PDO $db, int $saisonId, string $dateLimiteUtc): array {
    $stmt = $db->prepare('
        SELECT
            u.email,
            COALESCE(SUM(p.points), 0) +
            COALESCE((
                SELECT SUM(pb.points)
                FROM pronostics_bonus pb
                WHERE pb.user_id = u.id AND pb.saison_id = ?
            ), 0) AS total
        FROM users u
        LEFT JOIN pronostics p ON p.user_id = u.id
            AND p.match_id IN (SELECT id FROM matches WHERE saison_id = ? AND date <= ?)
        GROUP BY u.id, u.email
        ORDER BY total DESC
    ');
    $stmt->execute([$saisonId, $saisonId, $dateLimiteUtc]);
    $rows = $stmt->fetchAll();

    $classement = [];
    // Rang partagé en cas d'égalité — voir commentaire dans _getClassementRapide()
    $rangCourant  = 0;
    $ptsPrecedent = null;
    foreach ($rows as $i => $row) {
        $total = (int)$row['total'];
        if ($total !== $ptsPrecedent) {
            $rangCourant  = $i + 1;
            $ptsPrecedent = $total;
        }
        $classement[$row['email']] = [
            'rang'  => $rangCourant,
            'total' => $total,
        ];
    }
    return $classement;
}
