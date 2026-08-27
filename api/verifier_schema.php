<?php
// ============================================================
//  PRONO-L1 — Vérification de cohérence de schéma TEST / PROD
//  Fichier : api/verifier_schema.php
//  ⚠️  Fichier IDENTIQUE sur prod et test (comme copie_environnements.php)
//      — compare toujours les 2 bases entre elles, peu importe sur
//      quel environnement la requête est lancée.
//
//  But : repérer automatiquement les décalages de structure entre
//  prono_l1 et prono_l1_test (table ou colonne existant d'un côté
//  mais pas de l'autre) — ce qui a causé plusieurs bugs "Unexpected
//  end of JSON input" quand une migration SQL n'avait été rejouée
//  que sur un seul des deux environnements.
//
//  Action disponible :
//  GET ?action=comparer (admin) → renvoie la liste des écarts
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

if ($action !== 'comparer') {
    http_response_code(400);
    echo json_encode(['erreur' => 'Action inconnue']);
    exit();
}

const DB_A = 'prono_l1';
const DB_B = 'prono_l1_test';

// ------------------------------------------------------------
//  Charge la structure complète (tables + colonnes) d'une base
//  via information_schema, accessible depuis la même connexion
//  MySQL puisque les 2 bases sont sur le même serveur/utilisateur.
// ------------------------------------------------------------
function chargerStructure(PDO $db, string $schema): array {
    $stmt = $db->prepare('
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    ');
    $stmt->execute([$schema]);

    $structure = [];
    foreach ($stmt->fetchAll() as $row) {
        $structure[$row['TABLE_NAME']][$row['COLUMN_NAME']] = [
            'type'     => $row['COLUMN_TYPE'],
            'nullable' => $row['IS_NULLABLE'],
        ];
    }
    return $structure;
}

$structA = chargerStructure($db, DB_A);
$structB = chargerStructure($db, DB_B);

$tablesA = array_keys($structA);
$tablesB = array_keys($structB);

// Tables backup (produites par l'outil "Synchroniser environnements")
// et le cache technique volatile ne sont pas comparés : ils sont
// éphémères/asymétriques par nature, pas des oublis de migration.
$estIgnoree = fn($nom) => str_contains($nom, '_backup_') || $nom === 'cache_api';

$tablesA = array_values(array_filter($tablesA, fn($t) => !$estIgnoree($t)));
$tablesB = array_values(array_filter($tablesB, fn($t) => !$estIgnoree($t)));

$presenteProdSeulement = array_values(array_diff($tablesA, $tablesB)); // dans prod, absente de test
$presenteTestSeulement = array_values(array_diff($tablesB, $tablesA)); // dans test, absente de prod

$tablesCommunes = array_values(array_intersect($tablesA, $tablesB));

$ecartsColonnes = [];
foreach ($tablesCommunes as $table) {
    $colsA = $structA[$table];
    $colsB = $structB[$table];

    $colsPresentesProdSeulement = array_values(array_diff(array_keys($colsA), array_keys($colsB)));
    $colsPresentesTestSeulement = array_values(array_diff(array_keys($colsB), array_keys($colsA)));

    $colsDifferentes = [];
    foreach (array_intersect(array_keys($colsA), array_keys($colsB)) as $col) {
        if ($colsA[$col] !== $colsB[$col]) {
            $colsDifferentes[] = [
                'colonne'   => $col,
                'prod'      => $colsA[$col]['type'] . ($colsA[$col]['nullable'] === 'YES' ? ' (NULL ok)' : ''),
                'test'      => $colsB[$col]['type'] . ($colsB[$col]['nullable'] === 'YES' ? ' (NULL ok)' : ''),
            ];
        }
    }

    if ($colsPresentesProdSeulement || $colsPresentesTestSeulement || $colsDifferentes) {
        $ecartsColonnes[] = [
            'table'                  => $table,
            'colonnes_absentes_test' => $colsPresentesProdSeulement, // présentes en prod, absentes en test
            'colonnes_absentes_prod' => $colsPresentesTestSeulement, // présentes en test, absentes en prod
            'colonnes_differentes'   => $colsDifferentes,
        ];
    }
}

$toutIdentique = empty($presenteProdSeulement) && empty($presenteTestSeulement) && empty($ecartsColonnes);

echo json_encode([
    'statut'               => 'OK',
    'tout_identique'       => $toutIdentique,
    'tables_absentes_prod' => $presenteTestSeulement, // présentes en test, absentes en prod → à créer sur prod
    'tables_absentes_test' => $presenteProdSeulement, // présentes en prod, absentes en test → à créer sur test
    'ecarts_colonnes'      => $ecartsColonnes,
]);
exit();
