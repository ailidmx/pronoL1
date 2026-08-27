<?php
// ============================================================
//  PRONO-L1 — Webhook Telegram
//  Fichier : api/telegram_webhook.php
//
//  Appelé automatiquement par Telegram à chaque message envoyé au
//  bot. Ne fait qu'une seule chose : répondre avec le Chat ID de
//  l'expéditeur, que le joueur colle ensuite dans Prono-L1 (Profil
//  > Notifications). Aucune écriture en base — pas besoin de savoir
//  qui est le joueur côté appli, juste lui donner son identifiant.
//
//  Mise en place (une seule fois, après déploiement) : ouvrir dans
//  un navigateur (remplacer <DOMAINE> par le domaine de prod) :
//  https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAINE>/api/telegram_webhook.php
// ============================================================

require_once 'config.php';

$update = json_decode(file_get_contents('php://input'), true);

if (!empty($update['message']['chat']['id'])) {
    $chatId = $update['message']['chat']['id'];
    $prenom = $update['message']['from']['first_name'] ?? '';

    $texte  = "Bonjour {$prenom} 👋\n\n";
    $texte .= "Voici ton identifiant Telegram (Chat ID) à coller dans Prono-L1 :\n\n";
    $texte .= "`{$chatId}`\n\n";
    $texte .= "Dans l'appli : Profil > 🔔 Notifications, colle-le dans le champ \"Chat ID Telegram\", coche la case Telegram, puis Enregistrer.";

    _telegramEnvoyerBrut($chatId, $texte);
}

// Toujours répondre 200 à Telegram, même si le message reçu n'avait
// pas le format attendu — sinon Telegram retente indéfiniment
http_response_code(200);
echo 'OK';

function _telegramEnvoyerBrut($chatId, string $texte): void {
    $url  = 'https://api.telegram.org/bot' . TELEGRAM_BOT_TOKEN . '/sendMessage';
    $data = ['chat_id' => $chatId, 'text' => $texte, 'parse_mode' => 'Markdown'];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($data),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    curl_exec($ch);
    curl_close($ch);
}
