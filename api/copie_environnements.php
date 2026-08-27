<?php
// ============================================================
//  PRONO-L1 — Copie de tables entre PROD et TEST
//  Fichier : api/copie_environnements.php
//  ⚠️  Fichier IDENTIQUE sur prod et test (contrairement à
//      config.php) — c'est le DB_NAME réel de l'environnement qui
//      exécute le code qui décide ce qui est autorisé, pas le code.
//
//  Actions disponibles :
//  POST ?action=copier_prod_vers_test
//       → ne peut s'exécuter QUE si on tourne sur l'environnement
//         TEST (DB_NAME = prono_l1_test). Écrase test avec prod.
//  POST ?action=copier_test_vers_prod
//       → ne peut s'exécuter QUE si on tourne sur l'environnement
//         PROD (DB_NAME = prono_l1). Écrase prod avec test.
//         Exige en plus une phrase de confirmation exacte, car ce
//         sens écrase les vraies données des utilisateurs.
//
//  La table `users` n'est JAMAIS touchée par cet outil (volontaire).
//  La table `cache_api` n'est pas copiée non plus (cache technique
//  éphémère, aucun intérêt à la répliquer).
// ============================================================

require_once 'config.php';
require_once 'utils.php';

header('Content-Type: application/json; charset=utf-8');

$db    = getDB();
$admin = verifierToken($db);
if (!$admin || empty($admin['is_admin'])) {
    http_response_code(403);
    echo json_encode(['erreur' => 'Accès réservé aux administrateurs']);
    exit();
}

$action = $_GET['action'] ?? '';
$data   = json_decode(file_get_contents('php://input'), true) ?: [];

// Tables copiées intégralement (ordre indifférent, FK désactivées le temps
// de l'opération) — users et cache_api volontairement absents.
// classement_equipes_cache est également absente : c'est une table dérivée
// (comme cache_api), régénérée après coup ci-dessous plutôt que copiée.
$TABLES_A_COPIER = [
    'saisons', 'clubs', 'matches', 'effectifs', 'compositions',
    'match_stats', 'stats_joueurs', 'bonus_config',
    'pronostics', 'pronostics_bonus',
];

function copierTables(PDO $db, string $dbSource, string $dbDestination, array $tables): array {
    $log  = [];
    $date = date('Ymd_His');

    $db->setAttribute(PDO::ATTR_AUTOCOMMIT, 0);
    $db->beginTransaction();
    $db->exec('SET FOREIGN_KEY_CHECKS = 0');

    try {
        foreach ($tables as $table) {
            // -- 1. Sauvegarde de l'ancienne table de destination --
            $backup = $table . '_backup_' . $date;
            $db->exec("DROP TABLE IF EXISTS `{$dbDestination}`.`{$backup}`");
            $db->exec("CREATE TABLE `{$dbDestination}`.`{$backup}` AS SELECT * FROM `{$dbDestination}`.`{$table}`");
            $log[] = "Sauvegarde {$table} → {$backup}";

            // -- 2. Écrasement par la source --
            $db->exec("DELETE FROM `{$dbDestination}`.`{$table}`");
            $db->exec("INSERT INTO `{$dbDestination}`.`{$table}` SELECT * FROM `{$dbSource}`.`{$table}`");

            $nb = $db->query("SELECT COUNT(*) FROM `{$dbDestination}`.`{$table}`")->fetchColumn();
            $log[] = "{$table} : {$nb} ligne(s) copiée(s) depuis {$dbSource}";
        }

        // classement_equipes_cache n'est pas copiée (table dérivée) — on la
        // régénère ici pour chaque saison désormais présente en destination,
        // sinon elle resterait alignée sur l'ancien contenu (matchs d'avant
        // la copie) au lieu du contenu tout juste importé.
        $saisonsPresentes = $db->query("SELECT DISTINCT saison_id FROM `{$dbDestination}`.`matches`")
                                ->fetchAll(PDO::FETCH_COLUMN);
        foreach ($saisonsPresentes as $sId) {
            rafraichirClassementEquipes($db, (int)$sId);
        }
        $log[] = 'Cache de classement des équipes régénéré pour ' . count($saisonsPresentes) . ' saison(s)';

        $db->exec('SET FOREIGN_KEY_CHECKS = 1');
        $db->commit();
        $db->setAttribute(PDO::ATTR_AUTOCOMMIT, 1);
        return ['statut' => 'ok', 'log' => $log];

    } catch (Exception $e) {
        $db->exec('SET FOREIGN_KEY_CHECKS = 1');
        if ($db->inTransaction()) $db->rollBack();
        $db->setAttribute(PDO::ATTR_AUTOCOMMIT, 1);
        return ['statut' => 'erreur', 'erreur' => $e->getMessage(), 'log' => $log];
    }
}

// ============================================================
if ($action === 'copier_prod_vers_test') {

    if (DB_NAME !== 'prono_l1_test') {
        http_response_code(403);
        echo json_encode(['erreur' => "Cette opération ne peut s'exécuter que sur l'environnement TEST. Base actuelle : " . DB_NAME]);
        exit();
    }

    echo json_encode(copierTables($db, 'prono_l1', 'prono_l1_test', $TABLES_A_COPIER));
    exit();
}

// ============================================================
elseif ($action === 'copier_test_vers_prod') {

    if (DB_NAME !== 'prono_l1') {
        http_response_code(403);
        echo json_encode(['erreur' => "Cette opération ne peut s'exécuter que sur l'environnement PROD. Base actuelle : " . DB_NAME]);
        exit();
    }

    if (($data['confirmation'] ?? '') !== 'COPIER VERS PROD') {
        http_response_code(400);
        echo json_encode(['erreur' => 'Phrase de confirmation manquante ou incorrecte — rien n\'a été copié']);
        exit();
    }

    echo json_encode(copierTables($db, 'prono_l1_test', 'prono_l1', $TABLES_A_COPIER));
    exit();
}

else {
    http_response_code(400);
    echo json_encode(['erreur' => 'Action inconnue']);
}
