<?php
// ============================================================
//  PRONO-L1 — Compositions officielles des matchs
//  Fichier : api/compositions.php
//
//  Source des données : API-Football (plan Pro), endpoint
//  /fixtures/lineups. Les compositions ne sont publiées par
//  l'API que 20 à 40 min avant le coup d'envoi (avant ça,
//  la réponse est vide — c'est normal, pas une erreur).
//
//  Actions disponibles :
//  GET ?action=get&match_id=X  → compositions des 2 équipes (cache DB)
//  GET ?action=formations      → gabarits de positionnement par formation
// ============================================================

require_once 'config.php';
require_once 'utils.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = getDB();

// ============================================================
//  GET ?action=get&match_id=X
// ============================================================
if ($method === 'GET' && $action === 'get') {
    $matchId = (int)($_GET['match_id'] ?? 0);
    if (!$matchId) {
        http_response_code(400);
        echo json_encode(['erreur' => 'match_id requis']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT m.id, m.date, m.statut, m.apf_fixture_id,
               m.club_dom_id, m.club_ext_id,
               cd.apf_id AS apf_dom, ce.apf_id AS apf_ext,
               cd.nom AS nom_dom, ce.nom AS nom_ext,
               cd.logo_url AS logo_dom, ce.logo_url AS logo_ext
        FROM matches m
        JOIN clubs cd ON cd.id = m.club_dom_id
        JOIN clubs ce ON ce.id = m.club_ext_id
        WHERE m.id = ?
    ');
    $stmt->execute([$matchId]);
    $match = $stmt->fetch();

    if (!$match) {
        http_response_code(404);
        echo json_encode(['erreur' => 'Match introuvable']);
        exit();
    }

    $compos = _lireCompositionsEnCache($db, $matchId);

    // Cache incomplet : soit une équipe entière manque, soit les 2 équipes
    // sont présentes mais sans AUCUN remplaçant recensé pour aucune des 2 —
    // signe probable d'une réponse API-Football incomplète figée en cache
    // à l'époque du premier sync (plutôt qu'un vrai banc vide, très rare
    // en pratique). Un vrai banc vide alors que l'autre équipe en a un
    // n'est PAS retenté (cas légitime possible). Le retry sur banc vide
    // est limité à 1x/heure (via synced_at) pour ne pas re-solliciter
    // l'API à chaque affichage si elle ne fournit vraiment jamais ce banc.
    $syncedAt   = $compos[$match['club_dom_id']]['synced_at'] ?? null;
    $bancsVides = count($compos) === 2
        && empty($compos[$match['club_dom_id']]['remplacants'])
        && empty($compos[$match['club_ext_id']]['remplacants'])
        && (!$syncedAt || strtotime($syncedAt) < strtotime('-1 hour'));

    if (count($compos) < 2 || $bancsVides) {
        $fixtureId = $match['apf_fixture_id'];

        if (!$fixtureId && $match['apf_dom']) {
            $fixtureId = _resoudreFixtureId($match);
            if ($fixtureId) {
                $db->prepare('UPDATE matches SET apf_fixture_id = ? WHERE id = ?')
                   ->execute([$fixtureId, $matchId]);
            }
        }

        if ($fixtureId) {
            _syncCompositions($db, $matchId, $fixtureId, $match['club_dom_id'], $match['club_ext_id']);
            $compos = _lireCompositionsEnCache($db, $matchId);
        }
    }

    // Notes, capitaine, minute d'entrée des remplaçants, stats du match
    // (buts/passes/pénalty/minutes) : uniquement disponibles une fois le
    // match commencé. Pour un match "en_cours", on réenrichit à chaque
    // consultation (les notes/stats évoluent en direct — normal, pas
    // "définitif" pour autant). Pour un match "termine", on ne réenrichit
    // qu'une fois — détecté via le marqueur 'stats_finales' (voir
    // _enrichirNotesEtCapitaine), qui n'est posé que lorsque l'enrichissement
    // a lieu APRÈS que le match soit passé à "terminé" ; un enrichissement
    // fait en plein match ne compte jamais comme définitif, même s'il a
    // déjà rempli les champs — sinon un but tardif (ex: 2e pénalty en fin
    // de match) ne serait jamais recompté.
    if (in_array($match['statut'], ['en_cours', 'termine'], true) && count($compos) === 2) {
        $premierTitulaire = $compos[$match['club_dom_id']]['titulaires'][0] ?? null;
        $dejaEnrichi = $premierTitulaire && !empty($premierTitulaire['stats_finales']);

        if ($match['statut'] === 'en_cours' || !$dejaEnrichi) {
            $fixtureId = $match['apf_fixture_id'];
            if ($fixtureId) {
                _enrichirNotesEtCapitaine($db, $matchId, $fixtureId, $match['club_dom_id'], $match['club_ext_id'], $match['statut'] === 'termine');
                $compos = _lireCompositionsEnCache($db, $matchId);
            }
        }
    }

    echo json_encode([
        'statut' => 'OK',
        'dom' => [
            'club_id'  => (int)$match['club_dom_id'],
            'nom'      => $match['nom_dom'],
            'logo_url' => $match['logo_dom'],
            'compo'    => $compos[$match['club_dom_id']] ?? null,
        ],
        'ext' => [
            'club_id'  => (int)$match['club_ext_id'],
            'nom'      => $match['nom_ext'],
            'logo_url' => $match['logo_ext'],
            'compo'    => $compos[$match['club_ext_id']] ?? null,
        ],
    ]);
    exit();
}

// ============================================================
//  GET ?action=formations → gabarits de positionnement des joueurs
//  (table formation_positions), servis en une seule fois et mis
//  en cache côté navigateur (voir app.js). Modifiable directement
//  dans phpMyAdmin, sans toucher au code : "ligne_index" (0,1,2...)
//  = ligne tactique défense→attaque, "position_index" (1 à 9) =
//  rang gauche→droite dans cette ligne, "colonne" (A à H) = la
//  profondeur DE CE JOUEUR précis (peut désormais varier au sein
//  d'une même ligne — ex: 2 défenseurs axiaux plus avancés que les
//  2 latéraux).
// ============================================================
else if ($method === 'GET' && $action === 'formations') {
    $stmt = $db->query('
        SELECT formation, ligne_index, colonne, position_index, pct
        FROM formation_positions
        ORDER BY formation, ligne_index, position_index
    ');
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[$r['formation']][(int)$r['ligne_index']][(int)$r['position_index']] = [
            'colonne' => $r['colonne'],
            'pct'     => (float)$r['pct'],
        ];
    }
    // Chaque formation : on trie ses lignes (0, 1, 2...) puis on aplatit
    // chaque ligne en tableau séquentiel de {colonne, pct} (indexé 0, 1,
    // 2... dans l'ordre gauche→droite de la ligne).
    foreach ($out as $formation => $lignes) {
        ksort($lignes);
        $out[$formation] = array_values(array_map(function($positions) {
            ksort($positions);
            return array_values($positions); // [{colonne, pct}, {colonne, pct}, ...]
        }, $lignes));
    }
    echo json_encode($out);
    exit();
}

// ============================================================
//  ACTION INCONNUE
// ============================================================
else {
    http_response_code(404);
    echo json_encode(['erreur' => 'Action inconnue']);
}

// ============================================================
//  FONCTIONS PRIVÉES
// ============================================================

// Lit le cache DB, retourne un tableau [club_id => compo formatée]
function _lireCompositionsEnCache(PDO $db, int $matchId): array {
    $stmt = $db->prepare('SELECT * FROM compositions WHERE match_id = ?');
    $stmt->execute([$matchId]);
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[$r['club_id']] = [
            'formation'   => $r['formation'],
            'coach'       => $r['coach_nom'],
            'titulaires'  => json_decode($r['titulaires'], true) ?: [],
            'remplacants' => json_decode($r['remplacants'], true) ?: [],
            'synced_at'   => $r['synced_at'],
        ];
    }
    return $out;
}

// Retrouve l'id de fixture API-Football correspondant au match interne,
// en croisant date + équipe domicile. Ne coûte qu'1 appel, mis en cache
// ensuite dans matches.apf_fixture_id pour ne plus jamais le refaire.
// (fonctions _resoudreFixtureId / _saisonApiFootball / _apiFootballCall /
// _syncCompositions / _formatJoueurLineup / _enrichirNotesEtCapitaine
// désormais partagées dans utils.php — utilisées aussi par stats.php,
// cron_sync.php, et rafraichirStatsJoueurs() pour les classements
// buteurs/passeurs/pénalties)
