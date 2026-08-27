<?php
// ============================================================
//  PRONO-L1 — Envoi de notifications Web Push (PHP pur)
//  Fichier : api/webpush.php
//
//  Implémente le protocole Web Push sans aucune dépendance externe
//  (pas de Composer/vendor — impossible à installer sur ce NAS) :
//    - RFC 8291 : chiffrement du contenu (aes128gcm)
//    - RFC 8292 : authentification VAPID (JWT signé ES256)
//  Repose uniquement sur l'extension PHP "openssl" (déjà activée
//  pour l'envoi des emails SMTP).
//
//  Usage :
//    envoyerPush($subscriptionJson, 'Titre', 'Corps du message', 'https://...')
//    → true si le serveur du navigateur (Google/Mozilla/etc.) a
//      accepté le message (ne garantit pas l'affichage effectif,
//      juste la remise), false sinon.
// ============================================================

// ⚠️ Sujet obligatoire pour VAPID (contact en cas d'abus signalé par
// le service push) — email admin de l'appli
define('VAPID_SUBJECT', 'mailto:docdadi@free.fr');

// ============================================================
//  FONCTION PRINCIPALE
// ============================================================
function envoyerPush(string $subscriptionJson, string $titre, string $corps, string $url = ''): bool {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY_PEM) {
        _webpushLog('Clés VAPID non configurées');
        return false;
    }

    $sub = json_decode($subscriptionJson, true);
    if (!$sub || empty($sub['endpoint']) || empty($sub['keys']['p256dh']) || empty($sub['keys']['auth'])) {
        _webpushLog('Abonnement invalide (JSON incomplet)');
        return false;
    }

    $payload = json_encode([
        'titre' => $titre,
        'corps' => $corps,
        'url'   => $url ?: 'https://prono-l1.docdadi.synology.me',
    ]);

    try {
        $chiffre = _webpushChiffrer($payload, $sub['keys']['p256dh'], $sub['keys']['auth']);
        $jwt     = _webpushCreerJWT($sub['endpoint']);
    } catch (Throwable $e) {
        _webpushLog('Erreur préparation : ' . $e->getMessage());
        return false;
    }

    $ch = curl_init($sub['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $chiffre,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: 3600',
            'Authorization: vapid t=' . $jwt . ', k=' . VAPID_PUBLIC_KEY,
        ],
    ]);
    $reponse = curl_exec($ch);
    $code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $erreurCurl = curl_error($ch);
    curl_close($ch);

    // 201 = accepté. 404/410 = abonnement expiré/révoqué (l'appelant
    // devrait alors effacer push_subscription en base pour ce joueur).
    if ($code >= 200 && $code < 300) return true;

    _webpushLog("Échec envoi (HTTP $code) : " . ($erreurCurl ?: $reponse));
    return false;
}

// ============================================================
//  Chiffrement du contenu — RFC 8291 (aes128gcm)
// ============================================================
function _webpushChiffrer(string $payload, string $p256dhB64, string $authB64): string {
    $clientPublicRaw = _b64urlDecode($p256dhB64);   // 65 octets (0x04 || X || Y)
    $authSecret      = _b64urlDecode($authB64);      // 16 octets

    // Clé éphémère serveur (une nouvelle paire à chaque message)
    $ephemere = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$ephemere) throw new Exception('Impossible de générer la clé éphémère');
    $details = openssl_pkey_get_details($ephemere);
    $serverPublicRaw = "\x04" . $details['ec']['x'] . $details['ec']['y'];

    // Secret partagé ECDH entre notre clé éphémère et la clé publique du navigateur
    $clientPubPem = _webpushSpkiVersPem($clientPublicRaw);
    $clientPubKey = openssl_pkey_get_public($clientPubPem);
    if (!$clientPubKey) throw new Exception('Clé publique client invalide');
    $secretPartage = openssl_pkey_derive($clientPubKey, $ephemere, 32);
    if (!$secretPartage) throw new Exception('Échec dérivation ECDH');

    // IKM = HKDF(salt=authSecret, ikm=secretPartagé, info="WebPush: info"...)
    $infoIkm = "WebPush: info\x00" . $clientPublicRaw . $serverPublicRaw;
    $ikm     = _hkdf($authSecret, $secretPartage, $infoIkm, 32);

    // Salt aléatoire à 16 octets pour ce message (obligatoire, jamais réutilisé)
    $salt = random_bytes(16);

    // Dérivation directe du CEK et du nonce depuis (salt, IKM) — RFC 8188.
    // ⚠️ Une version précédente ajoutait une étape "PRK" intermédiaire
    // (dérivée puis réutilisée comme nouvel IKM avec un salt vide), ce qui
    // donnait un résultat auto-cohérent mais incompatible avec un vrai
    // navigateur — détecté le 23/07/2026 en comparant à la librairie de
    // référence pywebpush, corrigé ici.
    $cek   = _hkdf($salt, $ikm, "Content-Encoding: aes128gcm\x00", 16);
    $nonce = _hkdf($salt, $ikm, "Content-Encoding: nonce\x00", 12);

    // Un seul enregistrement : octet de séparation 0x02 après le texte clair
    $plaintext = $payload . "\x02";

    $tag = '';
    $chiffre = openssl_encrypt($plaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($chiffre === false) throw new Exception('Échec chiffrement AES-GCM');

    // En-tête RFC 8188 : salt(16) + taille d'enregistrement(4, uint32 BE) + idlen(1) + clé publique serveur(65)
    $entete = $salt . pack('N', 4096) . chr(strlen($serverPublicRaw)) . $serverPublicRaw;

    return $entete . $chiffre . $tag;
}

// ============================================================
//  JWT VAPID — RFC 8292 (signature ES256)
// ============================================================
function _webpushCreerJWT(string $endpoint): string {
    $origine = parse_url($endpoint, PHP_URL_SCHEME) . '://' . parse_url($endpoint, PHP_URL_HOST);

    $entete  = _b64urlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $charge  = _b64urlEncode(json_encode([
        'aud' => $origine,
        'exp' => time() + 12 * 3600,
        'sub' => VAPID_SUBJECT,
    ]));
    $aSigner = $entete . '.' . $charge;

    $clePrivee = openssl_pkey_get_private(VAPID_PRIVATE_KEY_PEM);
    if (!$clePrivee) throw new Exception('Clé privée VAPID invalide');

    $signatureDER = '';
    openssl_sign($aSigner, $signatureDER, $clePrivee, OPENSSL_ALGO_SHA256);

    // JOSE exige une signature "raw" r||s (64 octets), pas le DER produit par openssl
    $signatureRaw = _derVersRawEcdsa($signatureDER);

    return $aSigner . '.' . _b64urlEncode($signatureRaw);
}

// ============================================================
//  Utilitaires bas niveau
// ============================================================
function _hkdf(string $salt, string $ikm, string $info, int $longueur): string {
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $t   = '';
    $okm = '';
    $i   = 1;
    while (strlen($okm) < $longueur) {
        $t   = hash_hmac('sha256', $t . $info . chr($i), $prk, true);
        $okm .= $t;
        $i++;
    }
    return substr($okm, 0, $longueur);
}

function _b64urlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function _b64urlDecode(string $data): string {
    $data = strtr($data, '-_', '+/');
    $reste = strlen($data) % 4;
    if ($reste) $data .= str_repeat('=', 4 - $reste);
    return base64_decode($data);
}

// Enveloppe une clé publique EC P-256 brute (65 octets non compressés)
// dans le format SubjectPublicKeyInfo (DER) puis PEM, seul format que
// openssl_pkey_get_public sait charger directement
function _webpushSpkiVersPem(string $pointBrut): string {
    // Préfixe DER fixe pour une SubjectPublicKeyInfo EC P-256 non compressée
    // (vérifié en générant une vraie clé et en inspectant le DER produit)
    $prefixe = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
    $der = $prefixe . $pointBrut;
    $b64 = chunk_split(base64_encode($der), 64, "\n");
    return "-----BEGIN PUBLIC KEY-----\n{$b64}-----END PUBLIC KEY-----\n";
}

// Convertit une signature ECDSA DER (SEQUENCE de 2 INTEGER r,s) en
// concaténation brute r||s de 32+32 octets, exigée par le format JWS
function _derVersRawEcdsa(string $der): string {
    $offset = 2; // saute SEQUENCE + longueur totale
    $extraireEntier = function() use ($der, &$offset): string {
        $offset++; // saute le tag 0x02 (INTEGER)
        $len = ord($der[$offset]); $offset++;
        $val = substr($der, $offset, $len);
        $offset += $len;
        // Retirer un éventuel octet de padding 0x00 en tête (nombre "négatif" en DER)
        $val = ltrim($val, "\x00");
        // Remettre à 32 octets exactement (complément de zéros si trop court)
        return str_pad($val, 32, "\x00", STR_PAD_LEFT);
    };
    $r = $extraireEntier();
    $s = $extraireEntier();
    return $r . $s;
}

function _webpushLog(string $msg): void {
    $fichier = __DIR__ . '/logs/webpush.log';
    if (!is_dir(dirname($fichier))) @mkdir(dirname($fichier), 0755, true);
    @file_put_contents($fichier, date('Y-m-d H:i:s') . ' — ' . $msg . "\n", FILE_APPEND);
}
