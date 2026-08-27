<?php
// ============================================================
//  PRONO-L1 — Envoi d'emails via SMTP (Gmail)
//  Fichier : api/smtp_mailer.php
//
//  Remplace la fonction mail() de PHP (souvent bloquée/filtrée par
//  Gmail quand elle vient d'un serveur personnel) par un envoi via
//  le compte Gmail lui-même, en pur PHP, sans bibliothèque à
//  installer (pas de Composer nécessaire).
//
//  Identifiants à renseigner dans config.php : SMTP_USER / SMTP_PASS
// ============================================================

/**
 * Envoie un email via le compte Gmail configuré dans config.php.
 * Retourne true si l'envoi a réussi, false sinon (et note l'erreur
 * dans le journal d'erreurs PHP du serveur pour diagnostic).
 */
function envoyerEmailSMTP(string $destinataire, string $sujet, string $corps): bool {
    if (!defined('SMTP_USER') || !defined('SMTP_PASS')
        || SMTP_USER === 'VOTRE_ADRESSE@gmail.com' || SMTP_PASS === 'xxxxxxxxxxxxxxxx') {
        error_log('SMTP: identifiants non configurés dans config.php (SMTP_USER / SMTP_PASS)');
        return false;
    }

    $host = 'smtp.gmail.com';
    $port = 587;

    $socket = @stream_socket_client("tcp://$host:$port", $errno, $errstr, 15);
    if (!$socket) {
        error_log("SMTP: connexion échouée ($errno) $errstr");
        return false;
    }
    stream_set_timeout($socket, 15);

    // Lit la réponse complète du serveur (gère les réponses multi-lignes,
    // ex: "250-xxx" suivi de "250 xxx")
    $lire = function () use ($socket) {
        $data = '';
        while (($ligne = fgets($socket, 515)) !== false) {
            $data .= $ligne;
            if (isset($ligne[3]) && $ligne[3] === ' ') break;
        }
        return $data;
    };
    $ecrire = function (string $cmd) use ($socket) { fwrite($socket, $cmd . "\r\n"); };
    $codeOk = function (string $reponse, string $code): bool {
        return strpos($reponse, $code) === 0 || strpos($reponse, "\n$code") !== false;
    };

    $lire(); // bannière d'accueil du serveur

    $ecrire('EHLO prono-l1');
    $lire();

    $ecrire('STARTTLS');
    $rep = $lire();
    if (!$codeOk($rep, '220')) { error_log("SMTP STARTTLS refusé : $rep"); fclose($socket); return false; }

    if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
        error_log('SMTP: passage en TLS impossible');
        fclose($socket);
        return false;
    }

    $ecrire('EHLO prono-l1');
    $lire();

    $ecrire('AUTH LOGIN');
    $lire();
    $ecrire(base64_encode(SMTP_USER));
    $lire();
    $ecrire(base64_encode(SMTP_PASS));
    $rep = $lire();
    if (!$codeOk($rep, '235')) {
        error_log("SMTP: authentification refusée — vérifiez SMTP_USER/SMTP_PASS dans config.php : $rep");
        fclose($socket);
        return false;
    }

    $ecrire('MAIL FROM:<' . SMTP_USER . '>');
    $lire();
    $ecrire('RCPT TO:<' . $destinataire . '>');
    $rep = $lire();
    if (!$codeOk($rep, '250')) { error_log("SMTP: destinataire refusé : $rep"); fclose($socket); return false; }

    $ecrire('DATA');
    $lire();

    $entetes  = 'From: Prono-L1 <' . SMTP_USER . ">\r\n";
    $entetes .= 'To: <' . $destinataire . ">\r\n";
    $entetes .= 'Subject: =?UTF-8?B?' . base64_encode($sujet) . "?=\r\n";
    $entetes .= "MIME-Version: 1.0\r\n";
    $entetes .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $entetes .= "Content-Transfer-Encoding: 8bit\r\n";
    $entetes .= "\r\n";

    // Règle SMTP : une ligne qui commence par un point doit être doublée
    $corpsEchappe = preg_replace('/^\./m', '..', $corps);

    $ecrire($entetes . $corpsEchappe . "\r\n.");
    $rep = $lire();

    $ecrire('QUIT');
    fclose($socket);

    if (!$codeOk($rep, '250')) {
        error_log("SMTP: envoi refusé : $rep");
        return false;
    }
    return true;
}
