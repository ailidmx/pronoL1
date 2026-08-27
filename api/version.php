<?php
// ============================================================
// VERSION + CHANGELOG SERVEUR — Prono-L1
// IMPORTANT : à chaque déploiement de app.js et/ou style.css
//   1. Mettre à jour APP_VERSION_COURANTE ci-dessous
//   2. Ajouter une entrée en TÊTE du tableau dans changelog.json
//      (même version, même contenu que le numéro ci-dessous)
//   3. Mettre à jour APP_VERSION dans app.js (même valeur)
//   4. Mettre à jour le ?v= dans index.php (app.js et/ou style.css)
// ============================================================
header('Content-Type: application/json');

$APP_VERSION_COURANTE = '20260826a';

$changelogPath = __DIR__ . '/changelog.json';
$changelog = [];
if (file_exists($changelogPath)) {
    $contenu = file_get_contents($changelogPath);
    $decode  = json_decode($contenu, true);
    if (is_array($decode)) {
        $changelog = $decode;
    }
}

echo json_encode([
    'version'   => $APP_VERSION_COURANTE,
    'changelog' => $changelog
]);
