<?php
header('Content-Type: text/plain; charset=utf-8');
$path = __DIR__ . '/config.php';
$content = file_get_contents($path);
echo "Taille du fichier : " . strlen($content) . " octets\n\n";
echo "--- 100 premiers octets (hexadecimal) ---\n";
echo bin2hex(substr($content, 0, 100)) . "\n\n";
echo "--- 100 derniers octets (hexadecimal) ---\n";
echo bin2hex(substr($content, -100)) . "\n";