<?php
// ============================================================
//  PRONO-L1 — Vérification du token d'authentification
//  Fichier : api/utils.php
//  
// ============================================================

// ============================================================
//  Sélecteur de saison — utilisé par tous les endpoints
//  Le frontend envoie ?saison_id=X (GET) ou saison_id dans le
//  corps JSON (POST). À défaut, on retombe sur la saison dont
//  statut = 'en_cours' dans la table saisons.
// ============================================================
function saisonDemandee(PDO $db, ?int $demandee = null): int {
    static $courante = null; // mise en cache le temps de la requête

    if ($demandee !== null) {
        $stmt = $db->prepare('SELECT id FROM saisons WHERE id = ?');
        $stmt->execute([$demandee]);
        if ($stmt->fetchColumn()) return $demandee;
        // id inconnu → on ignore et on retombe sur la saison en cours
    }

    if ($courante === null) {
        $stmt = $db->query("SELECT id FROM saisons WHERE statut = 'en_cours' ORDER BY id DESC LIMIT 1");
        $courante = (int)($stmt->fetchColumn() ?: 1);
    }
    return $courante;
}

// Lit ?saison_id= (GET) ou saison_id dans le corps JSON déjà décodé (POST)
function saisonDepuisRequete(PDO $db, ?array $bodyJson = null): int {
    $brut = $_GET['saison_id'] ?? ($bodyJson['saison_id'] ?? null);
    return saisonDemandee($db, $brut !== null ? (int)$brut : null);
}

// true si la saison accepte encore de nouveaux pronostics/modifications
// (la saison "en_cours", et la saison "entraînement" qui suit les mêmes
// règles d'ouverture des pronostics — juste sur une saison isolée)
function saisonEstModifiable(PDO $db, int $saisonId): bool {
    $stmt = $db->prepare("SELECT statut FROM saisons WHERE id = ?");
    $stmt->execute([$saisonId]);
    $statut = $stmt->fetchColumn();
    return $statut === 'en_cours' || $statut === 'entrainement';
}

// ============================================================
//  Applique une mise à jour de match (journée, date, score, statut)
//  en gérant proprement le cas d'un report :
//  - La 1ère fois qu'un match passe au statut 'reporte', on fige
//    journee_initiale/date_initiale avec les valeurs juste avant le
//    report, pour garder une trace de la programmation d'origine.
//  - Le flag `reporte` (colonne booléenne) passe à 1 dès qu'un report
//    est détecté et n'est JAMAIS remis à 0, même une fois le match
//    rejoué et terminé — utile pour un badge "rejoué après report"
//    dans les résultats.
//  Utilisée par matches.php (sync complet + sync_journee) ET
//  cron_sync.php (vérif matchs terminés + veille des reportés).
//
//  $clubApiDomId/$clubApiExtId (optionnels) : les clubs domicile/extérieur
//  TELS QUE RENVOYÉS PAR L'API pour ce fixture (déjà résolus en id de
//  clubs chez nous). Servent uniquement si le match est verrouillé
//  (domicile_verrouille = 1, ex: inversion LFP corrigée à la main avant
//  que l'API ne la prenne en compte) : si le domicile qu'on a verrouillé
//  ne correspond pas au domicile renvoyé par l'API, ça veut dire que
//  l'API n'a pas encore basculé — le score qu'elle fournit est donc
//  encore orienté à l'ancienne, et on l'inverse avant stockage pour
//  qu'il corresponde à NOTRE sens verrouillé. Omis (ou match non
//  verrouillé) → comportement inchangé, aucune inversion.
// ============================================================
function appliquerMajMatch(PDO $db, int $matchId, int $journee, string $date, ?int $scoreDom, ?int $scoreExt, string $statut, ?int $clubApiDomId = null, ?int $clubApiExtId = null): void {
    $stmt = $db->prepare('SELECT saison_id, journee, date, journee_initiale, date_initiale, reporte, statut, club_dom_id, domicile_verrouille FROM matches WHERE id = ?');
    $stmt->execute([$matchId]);
    $actuel = $stmt->fetch();
    if (!$actuel) return;

    $journeeInitiale = $actuel['journee_initiale'];
    $dateInitiale    = $actuel['date_initiale'];
    $reporteFlag     = (int)$actuel['reporte'];
    $ancienStatut    = $actuel['statut'];

    if ((int)$actuel['domicile_verrouille'] === 1 && $clubApiDomId !== null && $clubApiExtId !== null
        && $scoreDom !== null && $scoreExt !== null
        && (int)$actuel['club_dom_id'] !== $clubApiDomId) {
        [$scoreDom, $scoreExt] = [$scoreExt, $scoreDom];
    }

    if ($statut === 'reporte' && $journeeInitiale === null) {
        $journeeInitiale = $actuel['journee'];
        $dateInitiale    = $actuel['date'];
    }
    if ($statut === 'reporte') {
        $reporteFlag = 1;
    }

    $db->prepare('
        UPDATE matches
        SET journee = ?, date = ?, score_dom = ?, score_ext = ?, statut = ?,
            journee_initiale = ?, date_initiale = ?, reporte = ?
        WHERE id = ?
    ')->execute([$journee, $date, $scoreDom, $scoreExt, $statut, $journeeInitiale, $dateInitiale, $reporteFlag, $matchId]);

    // Coup d'envoi détecté (transition hors de 'a_venir') → on fige les
    // cotes (API + joueurs + score populaire) telles qu'elles sont à cet
    // instant, dans des colonnes à part qui ne bougeront plus jamais —
    // sert à la fois pour le rappel visuel post-match et pour un futur
    // calcul de points pondéré par les cotes.
    if ($ancienStatut === 'a_venir' && $statut !== 'a_venir') {
        figerCotesMatch($db, $matchId, (int)$actuel['saison_id']);
    }

    // Le classement des équipes dépend des scores/statuts de matchs — on le
    // régénère ici, au point d'écriture unique, plutôt qu'à chaque lecture
    // (classement.php, badges de rang sur les cartes match, cron bonus).
    rafraichirClassementEquipes($db, (int)$actuel['saison_id']);

    // Idem pour les stats individuelles (buteurs/passeurs/pénalties) —
    // reconstruites à partir des compositions enrichies match par match
    // (voir rafraichirStatsJoueurs() dans ce même fichier).
    rafraichirStatsJoueurs($db, (int)$actuel['saison_id']);
}

// ============================================================
//  Fige les cotes (API bookmakers + "maison" joueurs + score exact le
//  plus pronostiqué) d'un match dans cotes_matchs, colonnes *_figee —
//  appelée une seule fois, au moment où le match quitte le statut
//  'a_venir' (voir appliquerMajMatch ci-dessus). Idempotente : un
//  second appel (cas rare de re-report puis re-départ) écrase juste
//  avec les valeurs les plus à jour, sans casser quoi que ce soit.
// ============================================================
function figerCotesMatch(PDO $db, int $matchId, int $saisonId): void {
    // Valeurs API actuelles (peuvent être NULL si jamais synchronisées —
    // ex: match dont le coup d'envoi arrive avant que l'API n'ait publié
    // ses cotes, ça reste possible pour des raisons hors de notre contrôle)
    $stmt = $db->prepare('SELECT cote_dom_api, cote_nul_api, cote_ext_api FROM cotes_matchs WHERE match_id = ?');
    $stmt->execute([$matchId]);
    $api = $stmt->fetch() ?: ['cote_dom_api' => null, 'cote_nul_api' => null, 'cote_ext_api' => null];

    // Répartition des pronostics joueurs à cet instant précis
    $stmt = $db->prepare('
        SELECT
            COUNT(*) AS nb_total,
            SUM(CASE WHEN score_dom_pred > score_ext_pred THEN 1 ELSE 0 END) AS nb_dom,
            SUM(CASE WHEN score_dom_pred = score_ext_pred THEN 1 ELSE 0 END) AS nb_nul,
            SUM(CASE WHEN score_dom_pred < score_ext_pred THEN 1 ELSE 0 END) AS nb_ext
        FROM pronostics
        WHERE match_id = ?
    ');
    $stmt->execute([$matchId]);
    $rep = $stmt->fetch();
    $nbTotal = (int)$rep['nb_total'];

    $SEUIL_MIN_PRONOS = 5; // même seuil que le calcul en direct (cotes.php / matches.php)
    $coteDomJ = $coteNulJ = $coteExtJ = null;
    if ($nbTotal >= $SEUIL_MIN_PRONOS) {
        $coteDomJ = (int)$rep['nb_dom'] > 0 ? round($nbTotal / (int)$rep['nb_dom'], 2) : null;
        $coteNulJ = (int)$rep['nb_nul'] > 0 ? round($nbTotal / (int)$rep['nb_nul'], 2) : null;
        $coteExtJ = (int)$rep['nb_ext'] > 0 ? round($nbTotal / (int)$rep['nb_ext'], 2) : null;
    }

    // Score(s) exact(s) le(s) plus pronostiqué(s) à cet instant précis —
    // peut y avoir plusieurs scores ex-aequo (ex: 3 pronos, 3 scores
    // différents = chacun à 1 voix). On garde tous les scores à égalité,
    // pas juste le premier départagé arbitrairement par l'ORDER BY.
    $stmt = $db->prepare('
        SELECT score_dom_pred, score_ext_pred, COUNT(*) AS nb
        FROM pronostics
        WHERE match_id = ?
        GROUP BY score_dom_pred, score_ext_pred
        ORDER BY nb DESC, score_dom_pred ASC, score_ext_pred ASC
    ');
    $stmt->execute([$matchId]);
    $tousScores = $stmt->fetchAll();

    $popDom = $popExt = $popNb = $popPct = null;
    $popScoresJson = null;
    if ($tousScores) {
        $popNb   = (int)$tousScores[0]['nb'];
        $exAequo = array_values(array_filter($tousScores, fn($r) => (int)$r['nb'] === $popNb));
        // dom/ext gardés pour compat (1er de la liste ex-aequo) — c'est
        // le champ "scores" ci-dessous qui fait foi côté affichage
        $popDom = (int)$exAequo[0]['score_dom_pred'];
        $popExt = (int)$exAequo[0]['score_ext_pred'];
        $popPct = $nbTotal > 0 ? round($popNb / $nbTotal * 100, 1) : null;
        $popScoresJson = json_encode(array_map(
            fn($r) => ['dom' => (int)$r['score_dom_pred'], 'ext' => (int)$r['score_ext_pred']],
            $exAequo
        ));
    }

    $db->prepare('
        INSERT INTO cotes_matchs (
            match_id, saison_id,
            cote_dom_api_figee, cote_nul_api_figee, cote_ext_api_figee,
            cote_dom_joueurs_figee, cote_nul_joueurs_figee, cote_ext_joueurs_figee,
            score_exact_populaire_figee_dom, score_exact_populaire_figee_ext,
            score_exact_populaire_figee_nb, score_exact_populaire_figee_pct,
            score_exact_populaire_figee_scores,
            figee_le
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
            cote_dom_api_figee                  = VALUES(cote_dom_api_figee),
            cote_nul_api_figee                  = VALUES(cote_nul_api_figee),
            cote_ext_api_figee                  = VALUES(cote_ext_api_figee),
            cote_dom_joueurs_figee              = VALUES(cote_dom_joueurs_figee),
            cote_nul_joueurs_figee              = VALUES(cote_nul_joueurs_figee),
            cote_ext_joueurs_figee              = VALUES(cote_ext_joueurs_figee),
            score_exact_populaire_figee_dom     = VALUES(score_exact_populaire_figee_dom),
            score_exact_populaire_figee_ext     = VALUES(score_exact_populaire_figee_ext),
            score_exact_populaire_figee_nb      = VALUES(score_exact_populaire_figee_nb),
            score_exact_populaire_figee_pct     = VALUES(score_exact_populaire_figee_pct),
            score_exact_populaire_figee_scores  = VALUES(score_exact_populaire_figee_scores),
            figee_le                            = NOW()
    ')->execute([
        $matchId, $saisonId,
        $api['cote_dom_api'], $api['cote_nul_api'], $api['cote_ext_api'],
        $coteDomJ, $coteNulJ, $coteExtJ,
        $popDom, $popExt, $popNb, $popPct, $popScoresJson,
    ]);
}

// ============================================================
//  Bonus "Champion de journée" — attribue automatiquement 2 pts
//  (montant configurable dans bonus_config, catégorie
//  'champion_journee') au(x) joueur(s) qui a/ont le plus de points
//  sur une journée entièrement terminée. En cas d'égalité, TOUS les
//  joueurs à égalité en tête reçoivent le bonus complet.
//
//  Idempotent et sans dépendance à un point d'appel précis : on
//  supprime puis on réattribue à chaque passage pour la/les journées
//  concernées, ce qui permet à une correction de score après coup de
//  se répercuter automatiquement au prochain calcul de points.
//  Appelée après chaque recalcul de points (matches.php + cron_sync.php).
// ============================================================
function verifierChampionsJournee(PDO $db, int $saisonId): void {
    // Journées entièrement terminées (aucun match encore a_venir/en_cours/reporte)
    // et comportant au moins un match réellement joué (exclut les journées
    // 100% annulées, qui n'ont pas de sens à récompenser).
    $stmt = $db->prepare("
        SELECT journee
        FROM matches
        WHERE saison_id = ?
        GROUP BY journee
        HAVING SUM(CASE WHEN statut NOT IN ('termine','annule') THEN 1 ELSE 0 END) = 0
           AND SUM(CASE WHEN statut = 'termine' THEN 1 ELSE 0 END) > 0
    ");
    $stmt->execute([$saisonId]);
    $journeesTerminees = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($journeesTerminees)) return;

    // Montant configuré (bonus_config, catégorie champion_journee) — 2 pts par défaut
    $stmt = $db->prepare("
        SELECT points FROM bonus_config
        WHERE saison_id = ? AND categorie = 'champion_journee' AND actif = 1
        LIMIT 1
    ");
    $stmt->execute([$saisonId]);
    $points = (int)($stmt->fetchColumn() ?: 2);

    foreach ($journeesTerminees as $journee) {
        $stmt = $db->prepare('
            SELECT u.id, COALESCE(SUM(p.points), 0) AS pts
            FROM users u
            INNER JOIN pronostics p ON p.user_id = u.id
                AND p.match_id IN (SELECT id FROM matches WHERE saison_id = ? AND journee = ?)
            GROUP BY u.id
            HAVING pts > 0
            ORDER BY pts DESC
        ');
        $stmt->execute([$saisonId, $journee]);
        $classementJournee = $stmt->fetchAll();

        // On repart de zéro pour cette journée (gère les corrections de score)
        $db->prepare('DELETE FROM bonus_champion_journee WHERE saison_id = ? AND journee = ?')
           ->execute([$saisonId, $journee]);

        if (empty($classementJournee)) continue; // personne n'a marqué de point cette journée

        $meilleur  = (int)$classementJournee[0]['pts'];
        $gagnants  = array_filter($classementJournee, fn($r) => (int)$r['pts'] === $meilleur);

        $insert = $db->prepare('
            INSERT INTO bonus_champion_journee (saison_id, journee, user_id, points)
            VALUES (?, ?, ?, ?)
        ');
        foreach ($gagnants as $g) {
            $insert->execute([$saisonId, $journee, $g['id'], $points]);
        }
    }
}

// ============================================================
//  Synchronise l'effectif d'un club depuis API-Football et calcule
//  le diff (arrivées/départs) par rapport à ce qui était en cache.
//  Utilisée par clubs.php (bouton admin) ET cron_sync.php (veille
//  automatique quotidienne pendant le mercato).
// ============================================================
function syncEffectifAvecDiff(PDO $db, array $club, int $saisonId): array {
    // 1. Effectif actuellement en cache (avant écrasement), joueurs masqués inclus
    //    (on a besoin de connaître les apf_id déjà masqués pour ne pas les
    //    réinsérer automatiquement plus bas)
    $stmt = $db->prepare('SELECT apf_id, nom, prenom, masque, manuel FROM effectifs WHERE club_id = ? AND saison_id = ?');
    $stmt->execute([$club['id'], $saisonId]);
    $ancien = [];
    // IMPORTANT : ne PAS confondre "déjà connu avant la resynchro" et "a
    // survécu au DELETE plus bas". Le DELETE supprime tous les joueurs
    // manuel = 0 ET masque = 0 (les joueurs "normaux" issus de l'API).
    // Seuls les joueurs manuel = 1 OU masque = 1 survivent au DELETE — ce
    // sont les SEULS qu'il ne faut pas réinsérer (pour éviter les doublons
    // et respecter le masquage). Un joueur normal (manuel=0, masque=0) doit
    // TOUJOURS être réinséré s'il revient dans la réponse API, puisque sa
    // ligne vient d'être supprimée.
    $apfIdsSurvivants = [];
    foreach ($stmt->fetchAll() as $j) {
        if ($j['apf_id']) {
            if ($j['manuel'] || $j['masque']) $apfIdsSurvivants[$j['apf_id']] = true;
            if (!$j['masque']) $ancien[$j['apf_id']] = trim($j['prenom'] . ' ' . $j['nom']);
        }
    }

    // 2. Appel API-Football
    $url = "https://v3.football.api-sports.io/players/squads?team={$club['apf_id']}";
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . API_FOOTBALL_KEY],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return ['effectif' => null, 'arrivees' => [], 'departs' => [], 'erreur' => "HTTP $httpCode"];
    }

    $data = json_decode($response, true);
    if (empty($data['response'][0]['players'])) {
        return ['effectif' => null, 'arrivees' => [], 'departs' => [], 'erreur' => 'Réponse API vide'];
    }

    $joueurs  = $data['response'][0]['players'];
    $nouveau  = [];

    // Garde-fou : si l'API renvoie une liste anormalement plus courte que
    // l'effectif déjà connu, c'est très probablement une réponse partielle
    // côté API-Football (déjà rencontré : parfois seuls quelques joueurs
    // sont renvoyés au lieu de l'effectif complet) plutôt qu'un vrai effectif
    // réduit à ce point. Plutôt que d'écraser un effectif correct par une
    // poignée de joueurs, on annule la resynchro et on remonte une erreur
    // claire — la base reste inchangée. Seuil : en dessous de 10 joueurs
    // renvoyés OU moins de la moitié de ce qui était déjà connu (à partir de
    // 15 joueurs déjà en base, en dessous ça peut être un effectif tout
    // juste initialisé, pas la peine de bloquer).
    $nbNouveaux = count($joueurs);
    $nbAnciens  = count($ancien);
    if ($nbNouveaux < 10 || ($nbAnciens >= 15 && $nbNouveaux < (int)($nbAnciens * 0.5))) {
        return [
            'effectif' => null, 'arrivees' => [], 'departs' => [],
            'erreur'   => "Réponse API suspecte : $nbNouveaux joueur(s) renvoyé(s) contre $nbAnciens déjà connus — synchro annulée par sécurité, effectif inchangé",
        ];
    }

    // On ne supprime QUE les joueurs venant de l'API (manuel = 0 ET masque = 0).
    // Les ajouts manuels et les joueurs masqués à la main survivent à la resynchro.
    $db->prepare('DELETE FROM effectifs WHERE club_id = ? AND saison_id = ? AND manuel = 0 AND masque = 0')
       ->execute([$club['id'], $saisonId]);

    // Nationalités — récupérées via un endpoint séparé (/players), celui
    // utilisé ci-dessus (/players/squads) ne les fournissant pas. Un seul
    // aller-retour (paginé) pour tout le club, réutilisé pour chaque joueur
    // ci-dessous. Non bloquant en cas d'échec — voir _recupererNationalitesClub().
    $stmtAnnee = $db->prepare('SELECT annee_debut FROM saisons WHERE id = ?');
    $stmtAnnee->execute([$saisonId]);
    $annee = (int)$stmtAnnee->fetchColumn();
    $nationalites = ($annee && $club['apf_id']) ? _recupererNationalitesClub((int)$club['apf_id'], $annee) : [];

    foreach ($joueurs as $j) {
        $apfId = $j['id'] ?? null;

        // Si ce joueur a survécu au DELETE (ajout manuel réconcilié avec
        // l'API, ou joueur masqué à la main), on ne le réinsère pas — ça
        // évite les doublons et respecte le masquage. Tous les autres
        // joueurs "normaux" (dont la ligne vient d'être supprimée) doivent
        // être réinsérés inconditionnellement, même s'ils étaient déjà
        // connus avant la resynchro.
        if ($apfId && isset($apfIdsSurvivants[$apfId])) {
            if (!empty($ancien[$apfId])) $nouveau[$apfId] = $ancien[$apfId]; // reste "présent" pour le diff
            continue;
        }

        $poste = _convertirPoste($j['position'] ?? '');
        [$prenomApi, $nomApi] = _decouperNomApiFootball($j['name'] ?? '');
        $db->prepare('
            INSERT INTO effectifs
                (saison_id, club_id, apf_id, nom, prenom, poste, numero,
                 nationalite, photo_url, manuel, masque)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        ')->execute([
            $saisonId, $club['id'],
            $apfId,
            $nomApi,
            $prenomApi,
            $poste,
            $j['number'] ?? null,
            $nationalites[$apfId] ?? ($j['nationality'] ?? null),
            $j['photo']  ?? null,
        ]);

        if ($apfId) $nouveau[$apfId] = trim($prenomApi . ' ' . $nomApi);
    }

    // 3. Diff — uniquement pertinent si on avait déjà un effectif en cache avant
    $arrivees = $ancien ? array_values(array_diff_key($nouveau, $ancien)) : [];
    $departs  = $ancien ? array_values(array_diff_key($ancien, $nouveau)) : [];

    // 4. Effectif final tel qu'il sera affiché (API + ajouts manuels, hors masqués)
    $stmt = $db->prepare('
        SELECT nom, prenom, poste, numero, nationalite, photo_url
        FROM effectifs
        WHERE club_id = ? AND saison_id = ? AND masque = 0
        ORDER BY FIELD(poste, \'Gardien\', \'Défenseur\', \'Milieu\', \'Attaquant\'), numero ASC
    ');
    $stmt->execute([$club['id'], $saisonId]);
    $effectif = $stmt->fetchAll();

    return ['effectif' => $effectif, 'arrivees' => $arrivees, 'departs' => $departs, 'erreur' => null];
}

// API-Football ne fournit pas nom/prénom séparément sur l'endpoint squads,
// juste un champ "name" compact — le plus souvent "X. Nomdefamille" (initiale
// + point), parfois "Prénom Nom" en entier, parfois un seul mot (mononyme,
// ex. "Endrick"). On sépare sur le premier espace : le premier mot part dans
// prénom, le reste dans nom. S'il n'y a pas d'espace, tout va dans nom.
function _decouperNomApiFootball(string $nomBrut): array {
    $nomBrut = trim($nomBrut);
    if ($nomBrut === '') return [null, ''];
    $pos = strpos($nomBrut, ' ');
    if ($pos === false) return [null, $nomBrut];
    return [substr($nomBrut, 0, $pos), substr($nomBrut, $pos + 1)];
}

function _convertirPoste(string $poste): string {
    return match ($poste) {
        'Goalkeeper' => 'Gardien',
        'Defender'   => 'Défenseur',
        'Midfielder' => 'Milieu',
        'Attacker'   => 'Attaquant',
        default      => 'Inconnu',
    };
}

// ============================================================
//  Fonctions partagées d'accès à l'API-Football (plan Pro)
//  Utilisées par compositions.php, stats.php, matches.php et
//  cron_sync.php — centralisées ici pour éviter la duplication
//  qui existait entre matches.php et cron_sync.php du temps de
//  football-data.org (2 copies de _convertirStatut()).
// ============================================================

// Mapping des statuts courts API-Football (fixture.status.short) vers
// les statuts internes de l'appli. Remplace l'ancien _convertirStatut()
// basé sur les codes football-data.org (FINISHED, IN_PLAY...).
function _convertirStatutApf(string $statutCourt): string {
    return match ($statutCourt) {
        'FT', 'AET', 'PEN'                    => 'termine',
        '1H', 'HT', '2H', 'ET', 'BT', 'P',
        'LIVE', 'SUSP', 'INT'                 => 'en_cours',
        'PST'                                  => 'reporte',
        'CANC', 'ABD', 'AWD', 'WO'             => 'annule',
        default                                => 'a_venir', // NS, TBD...
    };
}

// Extrait le numéro de journée depuis le libellé de round API-Football
// (ex: "Regular Season - 34" → 34). Retourne null si non trouvé
// (rounds hors championnat : Coupe de France, amicaux...).
function _extraireJourneeApf(string $round): ?int {
    if (preg_match('/(\d+)\s*$/', $round, $m)) {
        return (int)$m[1];
    }
    return null;
}

// Retrouve l'id interne d'un club à partir de son id API-Football,
// avec repli sur le nom si le club n'a pas encore d'apf_id enregistré
// (première synchro d'une saison neuve, avant tout passage mercato).
function _trouverClubApf(PDO $db, int $apfId, string $nom, int $saisonId): ?int {
    // 1. Cherche par apf_id (cas normal, club déjà lié via mercato ou sync précédente)
    $s = $db->prepare('SELECT id FROM clubs WHERE saison_id = ? AND apf_id = ?');
    $s->execute([$saisonId, $apfId]);
    $r = $s->fetch();
    if ($r) return $r['id'];

    // 2. Repli par nom approximatif (dans les 2 sens), puis on enregistre
    //    l'apf_id pour les prochaines fois — sans jamais toucher à nom/
    //    nom_court/code, réservés aux modifications manuelles de Docdadi.
    $s = $db->prepare('
        SELECT id FROM clubs
        WHERE saison_id = ?
        AND (nom_court LIKE ? OR ? LIKE CONCAT(\'%\', nom_court, \'%\') OR nom LIKE ?)
    ');
    $s->execute([$saisonId, '%' . $nom . '%', $nom, '%' . $nom . '%']);
    $r = $s->fetch();
    if ($r) {
        $db->prepare('UPDATE clubs SET apf_id = ? WHERE id = ? AND apf_id IS NULL')
           ->execute([$apfId, $r['id']]);
        return $r['id'];
    }

    return null;
}

// ============================================================
//  Fonctions partagées d'accès à l'API-Football (plan Pro)
//  Utilisées par compositions.php et stats.php
// ============================================================

// Retrouve l'id de fixture API-Football correspondant à un match interne,
// en croisant date + équipe domicile. Ne coûte qu'1 appel, à mettre en
// cache ensuite dans matches.apf_fixture_id pour ne plus jamais le refaire.
function _resoudreFixtureId(array $match): ?int {
    $date   = substr($match['date'], 0, 10); // YYYY-MM-DD (UTC)
    $season = _saisonApiFootball($date);

    $url = 'https://v3.football.api-sports.io/fixtures?'
         . http_build_query([
               'league' => API_FOOTBALL_LIGUE1_ID,
               'season' => $season,
               'team'   => $match['apf_dom'],
               'date'   => $date,
           ]);

    $data = _apiFootballCall($url);
    if (!empty($data['response'][0]['fixture']['id'])) {
        return (int)$data['response'][0]['fixture']['id'];
    }
    return null;
}

// Récupère la composition des 2 équipes pour une fixture donnée et
// l'enregistre en cache DB (une ligne par équipe). Ne fait rien si l'API
// n'a pas encore publié la compo (réponse vide — normal avant J-40min).
// Partagée entre compositions.php (à la demande) et cron_sync.php
// (proactif, matchs imminents/en cours — voir _syncCompositionsMatchsProches).
function _syncCompositions(PDO $db, int $matchId, int $fixtureId, int $clubDomId, int $clubExtId): void {
    $url  = 'https://v3.football.api-sports.io/fixtures/lineups?fixture=' . $fixtureId;
    $data = _apiFootballCall($url);
    if (empty($data['response'])) return; // pas encore publiée — normal avant J-40min

    $stmt = $db->prepare('SELECT id, apf_id FROM clubs WHERE id IN (?, ?)');
    $stmt->execute([$clubDomId, $clubExtId]);
    $mapApfVersClub = [];
    foreach ($stmt->fetchAll() as $c) {
        $mapApfVersClub[$c['apf_id']] = $c['id'];
    }

    foreach ($data['response'] as $teamLineup) {
        $apfTeamId = $teamLineup['team']['id'] ?? null;
        $clubId    = $mapApfVersClub[$apfTeamId] ?? null;
        if (!$clubId) continue;

        $titulaires  = array_map('_formatJoueurLineup', $teamLineup['startXI'] ?? []);
        $remplacants = array_map('_formatJoueurLineup', $teamLineup['substitutes'] ?? []);

        $db->prepare('
            INSERT INTO compositions
                (match_id, club_id, formation, coach_nom, titulaires, remplacants, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                formation   = VALUES(formation),
                coach_nom   = VALUES(coach_nom),
                titulaires  = VALUES(titulaires),
                remplacants = VALUES(remplacants),
                synced_at   = NOW()
        ')->execute([
            $matchId,
            $clubId,
            $teamLineup['formation'] ?? null,
            $teamLineup['coach']['name'] ?? null,
            json_encode($titulaires),
            json_encode($remplacants),
        ]);
    }
}

function _formatJoueurLineup(array $p): array {
    $j = $p['player'] ?? $p;
    return [
        'apf_id'    => $j['id'] ?? null,
        'nom'       => $j['name'] ?? '',
        'numero'    => $j['number'] ?? null,
        'poste'     => $j['pos'] ?? null,     // G, D, M, F
        'grid'      => $j['grid'] ?? null,    // "ligne:colonne", null pour un remplaçant
        'photo_url' => !empty($j['id'])
            ? "https://media.api-sports.io/football/players/{$j['id']}.png"
            : null,
    ];
}

// ============================================================
//  Enrichit les titulaires/remplaçants déjà en cache (table
//  compositions) avec la note du match, le statut capitaine, la
//  minute d'entrée des remplaçants, les cartons — ET, depuis cette
//  version, les stats individuelles officielles du match (buts,
//  passes décisives, pénalty marqué, minutes jouées), lues dans le
//  même appel /fixtures/players (elles y étaient déjà présentes,
//  simplement pas encore exploitées).
//
//  Déplacée depuis compositions.php (elle y était appelée à la
//  demande, quand un joueur ouvrait l'onglet Compos) pour être
//  réutilisable par rafraichirStatsJoueurs() / _completerCompositions-
//  Manquantes() ci-dessous, qui la déclenchent désormais aussi
//  automatiquement — but : construire le classement des buteurs/
//  passeurs/pénalties à partir de ces stats match par match, plutôt
//  que du classement des buteurs de L1 (/players/topscorers, une
//  liste tronquée aux ~20 meilleurs, peu fiable en tout début de
//  saison — même limite que celle déjà corrigée pour la colonne
//  "Pen" du classement équipes).
//
//  Paramètre $definitif : true seulement quand cette fonction est
//  appelée alors que le match est confirmé "terminé". Sert à poser
//  un marqueur 'stats_finales' sur chaque joueur, DISTINCT du simple
//  fait d'avoir déjà des données — un enrichissement fait en plein
//  match (ex: joueur qui ouvre Compos en direct à la 12e) capture un
//  instantané incomplet ; sans ce marqueur, ce cliché partiel serait
//  pris pour définitif après coup et les événements suivants du match
//  (ex: un 2e pénalty à la 88e) ne seraient jamais recomptés.
// ============================================================
function _enrichirNotesEtCapitaine(PDO $db, int $matchId, int $fixtureId, int $clubDomId, int $clubExtId, bool $definitif = false): void {
    $dataPlayers = _apiFootballCall('https://v3.football.api-sports.io/fixtures/players?fixture=' . $fixtureId);
    if (empty($dataPlayers['response'])) return;

    $stmt = $db->prepare('SELECT id, apf_id FROM clubs WHERE id IN (?, ?)');
    $stmt->execute([$clubDomId, $clubExtId]);
    $mapApfVersClub = [];
    foreach ($stmt->fetchAll() as $c) {
        $mapApfVersClub[$c['apf_id']] = $c['id'];
    }

    // Minute d'entrée de chaque remplaçant, via les événements de type
    // "subst" (le joueur qui ENTRE est dans 'player', celui qui SORT dans
    // 'assist' — convention un peu trompeuse d'API-Football sur cet event).
    // Cartons (jaune/rouge/2e jaune) via les événements de type "Card".
    $dataEvents    = _apiFootballCall('https://v3.football.api-sports.io/fixtures/events?fixture=' . $fixtureId);
    $minutesEntree = []; // apf_id du joueur entrant => minute
    $minutesSortie = []; // apf_id du joueur sortant => minute
    $cartonsParJoueur = []; // apf_id => [ ['type'=>'jaune'|'rouge', 'minute'=>int], ... ]
    if (!empty($dataEvents['response'])) {
        foreach ($dataEvents['response'] as $ev) {
            $type   = $ev['type'] ?? '';
            $minute = ($ev['time']['elapsed'] ?? 0) + ($ev['time']['extra'] ?? 0);

            if ($type === 'subst') {
                // ⚠️ Nommage trompeur d'API-Football sur cet event précis :
                // 'player' est le joueur qui SORT, 'assist' celui qui ENTRE
                // (inverse de la convention habituelle pour un but)
                $apfIdSortant = $ev['player']['id'] ?? null;
                $apfIdEntrant = $ev['assist']['id'] ?? null;
                if ($apfIdEntrant) $minutesEntree[$apfIdEntrant] = $minute;
                if ($apfIdSortant) $minutesSortie[$apfIdSortant] = $minute;
            } elseif ($type === 'Card') {
                $apfId  = $ev['player']['id'] ?? null;
                $detail = $ev['detail'] ?? '';
                if (!$apfId) continue;
                $typeCarton = (stripos($detail, 'red') !== false || stripos($detail, 'rouge') !== false)
                    ? 'rouge' : 'jaune';
                $cartonsParJoueur[$apfId] = $cartonsParJoueur[$apfId] ?? [];
                $cartonsParJoueur[$apfId][] = ['type' => $typeCarton, 'minute' => $minute];
            }
        }
    }

    // Regrouper note/capitaine/stats par club_id puis apf_id joueur
    $infosParClub = [$clubDomId => [], $clubExtId => []];
    foreach ($dataPlayers['response'] as $teamPlayers) {
        $clubId = $mapApfVersClub[$teamPlayers['team']['id'] ?? null] ?? null;
        if (!$clubId || !isset($infosParClub[$clubId])) continue;

        foreach ($teamPlayers['players'] ?? [] as $p) {
            $apfId = $p['player']['id'] ?? null;
            $stats = $p['statistics'][0] ?? null;
            if (!$apfId || !$stats) continue;

            $note = $stats['games']['rating'] ?? null;
            // Repli si l'événement carton n'a pas été retrouvé (rare) mais
            // que les statistiques du joueur indiquent bien un carton : on
            // l'affiche quand même, juste sans minute précise.
            $cartons = $cartonsParJoueur[$apfId] ?? [];
            if (!$cartons) {
                $nbJaunes = (int)($stats['cards']['yellow'] ?? 0);
                $nbRouges = (int)($stats['cards']['red'] ?? 0);
                if ($nbRouges > 0) $cartons[] = ['type' => 'rouge', 'minute' => null];
                elseif ($nbJaunes > 0) $cartons[] = ['type' => 'jaune', 'minute' => null];
            }
            $infosParClub[$clubId][$apfId] = [
                'note'          => $note !== null ? round((float)$note, 1) : null,
                'capitaine'     => (bool)($stats['games']['captain'] ?? false),
                'minute_entree' => $minutesEntree[$apfId] ?? null,
                'minute_sortie' => $minutesSortie[$apfId] ?? null,
                'cartons'       => $cartons,
                // Stats officielles du match — servent à rafraichirStatsJoueurs()
                // pour construire les classements buteurs/passeurs/pénalties.
                'buts'          => (int)($stats['goals']['total']    ?? 0),
                'passes_d'      => (int)($stats['goals']['assists']  ?? 0),
                'penalites'     => (int)($stats['penalty']['scored'] ?? 0),
                'minutes'       => (int)($stats['games']['minutes']  ?? 0),
                'stats_finales' => $definitif,
            ];
        }
    }

    // Fusionner dans les titulaires/remplaçants déjà en cache (sans jamais
    // toucher formation/coach/grid, déjà corrects depuis _syncCompositions)
    $stmt = $db->prepare('SELECT club_id, titulaires, remplacants FROM compositions WHERE match_id = ?');
    $stmt->execute([$matchId]);

    $fusionner = function(array $liste, array $infos): array {
        foreach ($liste as &$j) {
            $extra = $infos[$j['apf_id']] ?? null;
            if ($extra) {
                $j['note']          = $extra['note'];
                $j['capitaine']     = $extra['capitaine'];
                $j['minute_entree'] = $extra['minute_entree'];
                $j['minute_sortie'] = $extra['minute_sortie'];
                $j['cartons']       = $extra['cartons'];
                $j['buts']          = $extra['buts'];
                $j['passes_d']      = $extra['passes_d'];
                $j['penalites']     = $extra['penalites'];
                $j['minutes']       = $extra['minutes'];
                $j['stats_finales'] = $extra['stats_finales'];
            }
        }
        unset($j);
        return $liste;
    };

    foreach ($stmt->fetchAll() as $row) {
        $clubId = (int)$row['club_id'];
        $infos  = $infosParClub[$clubId] ?? [];
        if (!$infos) continue;

        $titulaires  = $fusionner(json_decode($row['titulaires'], true) ?: [], $infos);
        $remplacants = $fusionner(json_decode($row['remplacants'], true) ?: [], $infos);

        $db->prepare('UPDATE compositions SET titulaires = ?, remplacants = ? WHERE match_id = ? AND club_id = ?')
           ->execute([json_encode($titulaires), json_encode($remplacants), $matchId, $clubId]);
    }
}

// ============================================================
//  Filet de sécurité pour compositions (note/cartons/buts/passes/
//  minutes par joueur) : repère les matchs terminés dont la
//  composition n'a pas encore été enrichie (ou même pas encore
//  récupérée du tout, cas rare), et va chercher ce qui manque —
//  seulement pour ceux-là, jamais pour un match déjà enrichi (pas de
//  doublon d'appel API). Même principe que _completerMatchStatsManquants()
//  pour la colonne "Pen" du classement équipes.
// ============================================================
function _completerCompositionsManquantes(PDO $db, int $saisonId): void {
    $stmt = $db->prepare('
        SELECT m.id, m.apf_fixture_id, m.club_dom_id, m.club_ext_id, c.titulaires
        FROM matches m
        LEFT JOIN compositions c ON c.match_id = m.id AND c.club_id = m.club_dom_id
        WHERE m.saison_id = ? AND m.statut = \'termine\' AND m.apf_fixture_id IS NOT NULL
    ');
    $stmt->execute([$saisonId]);

    foreach ($stmt->fetchAll() as $m) {
        $matchId   = (int)$m['id'];
        $fixtureId = (int)$m['apf_fixture_id'];
        $domId     = (int)$m['club_dom_id'];
        $extId     = (int)$m['club_ext_id'];

        try {
            $titulaires = $m['titulaires'] !== null ? (json_decode($m['titulaires'], true) ?: []) : [];

            // Cas rare : la compo elle-même n'a jamais été récupérée pour
            // ce match (aucune ligne compositions) — on la va chercher
            // d'abord, l'enrichissement juste après ne pourra rien fusionner
            // sinon.
            if (empty($titulaires)) {
                _syncCompositions($db, $matchId, $fixtureId, $domId, $extId);
                $titulaires = []; // forcer l'enrichissement dans tous les cas
            }

            $premier     = $titulaires[0] ?? null;
            // 'stats_finales' (pas simplement 'minutes') : un enrichissement
            // fait pendant que le match était encore en_cours ne compte pas
            // comme définitif, même s'il a déjà rempli 'minutes'/'buts' —
            // voir le commentaire sur _enrichirNotesEtCapitaine().
            $dejaEnrichi = $premier && !empty($premier['stats_finales']);

            if (!$dejaEnrichi) {
                _enrichirNotesEtCapitaine($db, $matchId, $fixtureId, $domId, $extId, true);
            }
        } catch (Exception $e) {
            // Non bloquant : on retentera au prochain rafraîchissement.
            error_log('Prono-L1 _completerCompositionsManquantes : échec match id=' . $matchId . ' — ' . $e->getMessage());
        }
    }
}

// ============================================================
//  Reconstruit stats_joueurs (buts, passes décisives, pénalties,
//  matchs joués) par cumul sur toute la saison, à partir des stats
//  match par match stockées dans compositions.titulaires/remplacants
//  (voir _enrichirNotesEtCapitaine) — remplace l'ancienne source
//  /players/topscorers (liste tronquée aux ~20 meilleurs buteurs de
//  L1, peu fiable en tout début de saison et absente pour les purs
//  passeurs). Rattachement par apf_id (identifiant API-Football du
//  joueur), jamais par nom, pour éviter tout souci d'homonymie.
//
//  "Matchs joués" = minutes > 0 sur ce match précis (fiable, ne
//  dépend pas de deviner via les remplacements qui a réellement
//  joué). Un joueur listé dans une compo mais jamais enrichi (clé
//  'minutes' absente) est ignoré pour ce match — ses stats seront
//  prises en compte au prochain rafraîchissement, une fois
//  _completerCompositionsManquantes() passée dessus.
// ============================================================
function rafraichirStatsJoueurs(PDO $db, int $saisonId): void {
    _completerCompositionsManquantes($db, $saisonId);

    $stmt = $db->prepare('
        SELECT c.club_id, c.titulaires, c.remplacants
        FROM compositions c
        JOIN matches m ON m.id = c.match_id
        WHERE m.saison_id = ? AND m.statut = \'termine\'
    ');
    $stmt->execute([$saisonId]);

    $agg = []; // apf_id => ['nom'=>, 'club_id'=>, 'buts'=>, 'passes_d'=>, 'penalites'=>, 'matchs'=>]
    foreach ($stmt->fetchAll() as $row) {
        $clubId  = (int)$row['club_id'];
        $joueurs = array_merge(
            json_decode($row['titulaires'], true) ?: [],
            json_decode($row['remplacants'], true) ?: []
        );

        foreach ($joueurs as $j) {
            $apfId = $j['apf_id'] ?? null;
            // On n'agrège que les stats confirmées définitives (voir
            // _enrichirNotesEtCapitaine) — jamais un instantané pris en
            // plein match, qui sous-compterait les buts/pénalties/passes
            // survenus après cette consultation en direct. Le match sera
            // recompté correctement dès que _completerCompositionsManquantes()
            // l'aura récupéré une bonne fois pour toutes, une fois terminé.
            if (!$apfId || empty($j['stats_finales'])) continue;

            if (!isset($agg[$apfId])) {
                $agg[$apfId] = [
                    'nom' => $j['nom'] ?? 'Inconnu', 'club_id' => $clubId,
                    'buts' => 0, 'passes_d' => 0, 'penalites' => 0, 'matchs' => 0,
                ];
            }
            $agg[$apfId]['club_id']    = $clubId; // dernier club connu (transferts en cours de saison)
            $agg[$apfId]['buts']      += (int)($j['buts']      ?? 0);
            $agg[$apfId]['passes_d']  += (int)($j['passes_d']  ?? 0);
            $agg[$apfId]['penalites'] += (int)($j['penalites'] ?? 0);
            $agg[$apfId]['matchs']    += ((int)$j['minutes'] > 0) ? 1 : 0;
        }
    }

    $db->prepare('DELETE FROM stats_joueurs WHERE saison_id = ?')->execute([$saisonId]);

    $insert = $db->prepare('
        INSERT INTO stats_joueurs (saison_id, club_id, apf_id, nom, buts, passes_d, matchs, penalites)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ');
    foreach ($agg as $apfId => $s) {
        $insert->execute([$saisonId, $s['club_id'], $apfId, $s['nom'], $s['buts'], $s['passes_d'], $s['matchs'], $s['penalites']]);
    }
}

// Saison API-Football = année de début (ex: saison 2025-26 → 2025)
function _saisonApiFootball(string $dateStr): int {
    $y = (int)substr($dateStr, 0, 4);
    $m = (int)substr($dateStr, 5, 2);
    return $m >= 7 ? $y : $y - 1;
}

// ============================================================
//  Quizz — génération de questions "actu foot" via l'API Claude
//  (recherche web en direct), avec garde-fou : toute question sans
//  URL de source vérifiable est rejetée avant même d'être proposée
//  à l'admin. Nécessite ANTHROPIC_API_KEY dans config.php.
// ============================================================
function _debugActuIA(string $msg): void {
    // Accumulé en mémoire pour être renvoyé dans la réponse JSON (visible
    // dans la Console du navigateur) — le plus fiable, ne dépend d'aucun
    // droit d'écriture particulier.
    if (!isset($GLOBALS['_debug_actu_ia'])) $GLOBALS['_debug_actu_ia'] = [];
    $GLOBALS['_debug_actu_ia'][] = $msg;

    // Écriture fichier en plus, dans api/logs/ (même dossier déjà utilisé
    // et writable par cron_sync.php — la racine de api/ ne l'est pas
    // forcément, contrairement à ce sous-dossier dédié)
    $dossierLogs = __DIR__ . '/logs';
    if (!is_dir($dossierLogs)) {
        @mkdir($dossierLogs, 0755, true);
    }
    @file_put_contents(
        $dossierLogs . '/debug_actu.log',
        '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n",
        FILE_APPEND
    );
}

function _recupererDebugActuIA(): array {
    return $GLOBALS['_debug_actu_ia'] ?? [];
}

function _genererQuestionsActuIA(int $nb): array {
    if (!defined('ANTHROPIC_API_KEY') || !ANTHROPIC_API_KEY) {
        _debugActuIA('Pas de clé ANTHROPIC_API_KEY définie dans config.php');
        return [];
    }

    $prompt = <<<PROMPT
Tu génères des questions de quizz "actu foot" pour une application de pronostics Ligue 1 entre amis.

Utilise l'outil de recherche web pour trouver $nb actualités football RÉCENTES et VÉRIFIABLES
(transferts officialisés, résultats de matchs récents, déclarations d'entraîneurs, blessures,
records battus cette semaine...). Priorité à l'actualité de la Ligue 1 française, mais tu peux
aussi couvrir l'actu foot européenne/internationale si besoin pour compléter.

Pour CHAQUE question :
- Base-toi UNIQUEMENT sur une information trouvée via la recherche web, avec une source précise
- L'énoncé doit être court et clair (une question fermée)
- Propose exactement 4 réponses possibles, une seule correcte
- Indique l'URL exacte de la page qui confirme la bonne réponse

Une fois tes recherches terminées, réponds UNIQUEMENT avec un tableau JSON (aucun texte avant/après,
aucun bloc markdown, juste le JSON brut), au format exact suivant :
[
  {
    "enonce": "...",
    "reponses": [
      {"texte": "...", "correcte": true},
      {"texte": "...", "correcte": false},
      {"texte": "...", "correcte": false},
      {"texte": "...", "correcte": false}
    ],
    "source_url": "https://..."
  }
]

Si tu ne trouves pas assez d'actualités suffisamment fiables et sourcées pour atteindre $nb questions,
renvoie un tableau plus court plutôt que d'inventer quoi que ce soit. N'invente jamais une URL.
PROMPT;

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_TIMEOUT        => 90,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-api-key: ' . ANTHROPIC_API_KEY,
            'anthropic-version: 2023-06-01',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'model'      => 'claude-sonnet-5',
            'max_tokens' => 4096,
            'messages'   => [['role' => 'user', 'content' => $prompt]],
            'tools'      => [['type' => 'web_search_20250305', 'name' => 'web_search', 'max_uses' => 8]],
        ]),
    ]);
    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErreur = curl_error($ch);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) {
        _debugActuIA("Échec appel API — HTTP $httpCode — erreur cURL : $curlErreur — réponse brute : " . substr((string)$response, 0, 500));
        return [];
    }

    $data = json_decode($response, true);
    if (!$data || empty($data['content'])) {
        _debugActuIA('Réponse API vide ou invalide — brute : ' . substr($response, 0, 500));
        return [];
    }

    // Concatène tous les blocs de texte de la réponse (le modèle peut
    // avoir intercalé des blocs "tool_use"/"tool_result" avant le JSON final)
    $texte = '';
    foreach ($data['content'] as $bloc) {
        if (($bloc['type'] ?? '') === 'text') {
            $texte .= $bloc['text'];
        }
    }
    $texte = trim(preg_replace('/^```json|```$/m', '', trim($texte)));

    // Le modèle respecte presque toujours la consigne "JSON pur, sans texte
    // autour", mais ajoute parfois une phrase d'intro avant le tableau
    // (ex: "J'ai trouvé une info fiable. Voici la question : [...]").
    // On isole donc le tableau JSON (du premier '[' au dernier ']') plutôt
    // que d'exiger que TOUT le texte reçu soit du JSON pur — sinon une
    // simple phrase de politesse fait rejeter une question par ailleurs
    // parfaitement valide.
    $debut = strpos($texte, '[');
    $fin   = strrpos($texte, ']');
    if ($debut !== false && $fin !== false && $fin > $debut) {
        $texte = substr($texte, $debut, $fin - $debut + 1);
    }

    $questions = json_decode($texte, true);
    if (!is_array($questions)) {
        _debugActuIA('JSON final illisible — texte reçu : ' . substr($texte, 0, 800));
        return [];
    }

    _debugActuIA(count($questions) . ' question(s) reçue(s) du modèle, avant filtrage garde-fou');

    // Garde-fou : on ne garde que les questions complètes, avec
    // exactement 1 bonne réponse et une source_url non vide
    $valides = [];
    foreach ($questions as $i => $q) {
        if (empty($q['enonce']) || empty($q['source_url']) || empty($q['reponses']) || count($q['reponses']) < 2) {
            _debugActuIA("Question #$i rejetée (champ manquant) : " . json_encode($q));
            continue;
        }
        $nbCorrectes = 0;
        foreach ($q['reponses'] as $r) {
            if (!empty($r['correcte'])) $nbCorrectes++;
        }
        if ($nbCorrectes !== 1) {
            _debugActuIA("Question #$i rejetée ($nbCorrectes bonne(s) réponse(s) au lieu de 1) : " . json_encode($q));
            continue;
        }

        $valides[] = $q;
        if (count($valides) >= $nb) break;
    }

    return $valides;
}

function _apiFootballCall(string $url): ?array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['x-apisports-key: ' . API_FOOTBALL_KEY],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) return null;
    return json_decode($response, true);
}

// ============================================================
//  Récupère la nationalité de tous les joueurs d'un club, via
//  l'endpoint /players (profil complet). Nécessaire car /players/squads
//  (utilisé par syncEffectifAvecDiff() pour le reste de l'effectif — nom,
//  poste, numéro, photo) ne fournit PAS ce champ, contrairement à ce que
//  laissait penser le code d'origine.
//  Paginé (~20 joueurs/page) — un effectif de 25-30 joueurs tient sur
//  2 pages. Non bloquant : en cas d'échec (rate limit, erreur réseau,
//  saison introuvable côté API...), retourne un tableau vide — la
//  synchro de l'effectif continue normalement, simplement sans
//  nationalité pour cette fois ; sera retentée à la prochaine synchro
//  (déclenchée à chaque mouvement mercato détecté).
// ============================================================
function _recupererNationalitesClub(int $apfTeamId, int $annee): array {
    $nationalites = [];
    $page = 1;
    $totalPages = 1;
    do {
        $data = _apiFootballCall("https://v3.football.api-sports.io/players?team={$apfTeamId}&season={$annee}&page={$page}");
        if (empty($data['response'])) break;

        foreach ($data['response'] as $entree) {
            $apfId = $entree['player']['id']          ?? null;
            $nat   = $entree['player']['nationality'] ?? null;
            if ($apfId && $nat) $nationalites[$apfId] = $nat;
        }

        $totalPages = (int)($data['paging']['total'] ?? 1);
        $page++;
    } while ($page <= $totalPages && $page <= 5); // garde-fou : jamais plus de 5 pages

    return $nationalites;
}

// Déplacées depuis stats.php pour être réutilisables par cron_sync.php
// (recontrôle des minutes de but/carton ~90 min après le coup d'envoi)
function _lireMatchStatsEnCache(PDO $db, int $matchId): array {
    $stmt = $db->prepare('SELECT * FROM match_stats WHERE match_id = ?');
    $stmt->execute([$matchId]);
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $out[$r['club_id']] = [
            'stats'    => json_decode($r['stats'], true) ?: [],
            'buts'     => json_decode($r['buts'], true) ?: [],
            'cartons'  => json_decode($r['cartons'] ?? '', true) ?: [],
            'finalise' => (bool)($r['finalise'] ?? false),
        ];
    }
    return $out;
}

// Récupère les stats des 2 équipes pour une fixture donnée (endpoint
// /fixtures/statistics) ainsi que les buts marqués (endpoint
// /fixtures/events) et les met en cache DB (une ligne par équipe).
// Appelée à la fois par stats.php (à la demande, quand un joueur ouvre
// l'onglet Analyse) et par cron_sync.php (recontrôle automatique).
//
// Paramètre $definitif : true seulement quand cette fonction est appelée
// alors que le match est confirmé "terminé" — pose le marqueur DB
// 'finalise', DISTINCT du simple fait d'avoir déjà des buts/cartons
// enregistrés. Un appel fait en plein match (consultation live de
// l'onglet Analyse), ou même le recontrôle cron s'il tombe pile pendant
// un temps additionnel prolongé, capture un instantané qui peut être
// incomplet — sans ce marqueur, ce cliché serait pris pour définitif et
// un but tardif (ex: 2e pénalty en fin de match) ne serait jamais
// recompté. Voir _completerMatchStatsManquants().
function _syncMatchStats(PDO $db, int $matchId, int $fixtureId, int $clubDomId, int $clubExtId, bool $definitif = false): void {
    $stmt = $db->prepare('SELECT id, apf_id FROM clubs WHERE id IN (?, ?)');
    $stmt->execute([$clubDomId, $clubExtId]);
    $mapApfVersClub = [];
    foreach ($stmt->fetchAll() as $c) {
        $mapApfVersClub[$c['apf_id']] = $c['id'];
    }

    // ── Statistiques agrégées ──
    $dataStats = _apiFootballCall('https://v3.football.api-sports.io/fixtures/statistics?fixture=' . $fixtureId);
    $statsParClub = [];
    if (!empty($dataStats['response'])) {
        foreach ($dataStats['response'] as $teamStats) {
            $clubId = $mapApfVersClub[$teamStats['team']['id'] ?? null] ?? null;
            if (!$clubId) continue;
            $formatted = [];
            foreach (($teamStats['statistics'] ?? []) as $s) {
                $formatted[] = ['type' => $s['type'] ?? '', 'value' => $s['value'] ?? null];
            }
            $statsParClub[$clubId] = $formatted;
        }
    }
    if (empty($statsParClub)) return; // rien avant le coup d'envoi — normal

    // ── Buts marqués ET cartons (qui, quand, détail) — même appel /events ──
    $dataEvents = _apiFootballCall('https://v3.football.api-sports.io/fixtures/events?fixture=' . $fixtureId);
    $appelEvenementsReussi = ($dataEvents !== null); // distinct d'une liste vide légitime (ex: 0-0)
    $butsParClub    = [$clubDomId => [], $clubExtId => []];
    $cartonsParClub = [$clubDomId => [], $clubExtId => []];
    if ($appelEvenementsReussi && !empty($dataEvents['response'])) {
        foreach ($dataEvents['response'] as $ev) {
            $type = $ev['type'] ?? '';
            if ($type !== 'Goal' && $type !== 'Card') continue;

            $clubId = $mapApfVersClub[$ev['team']['id'] ?? null] ?? null;
            if (!$clubId) continue;

            if ($type === 'Goal' && isset($butsParClub[$clubId])) {
                $butsParClub[$clubId][] = [
                    'minute'  => ($ev['time']['elapsed'] ?? 0) + ($ev['time']['extra'] ?? 0),
                    'joueur'  => $ev['player']['name'] ?? '?',
                    'assist'  => $ev['assist']['name'] ?? null,
                    'detail'  => $ev['detail'] ?? '', // "Normal Goal" / "Penalty" / "Own Goal" / "Missed Penalty"
                ];
            } elseif ($type === 'Card' && isset($cartonsParClub[$clubId])) {
                $cartonsParClub[$clubId][] = [
                    'minute'  => ($ev['time']['elapsed'] ?? 0) + ($ev['time']['extra'] ?? 0),
                    'joueur'  => $ev['player']['name'] ?? '?',
                    'detail'  => $ev['detail'] ?? '', // "Yellow Card" / "Red Card"
                ];
            }
        }
        foreach ($butsParClub as &$liste) {
            usort($liste, fn($a, $b) => $a['minute'] <=> $b['minute']);
        }
        unset($liste);
        foreach ($cartonsParClub as &$liste) {
            usort($liste, fn($a, $b) => $a['minute'] <=> $b['minute']);
        }
        unset($liste);
    }

    foreach ([$clubDomId, $clubExtId] as $clubId) {
        if (!isset($statsParClub[$clubId])) continue;

        if ($appelEvenementsReussi) {
            // Appel événements OK (même si 0 but/carton) → on écrit stats + buts + cartons
            $db->prepare('
                INSERT INTO match_stats (match_id, club_id, stats, buts, cartons, finalise, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE stats = VALUES(stats), buts = VALUES(buts), cartons = VALUES(cartons), finalise = VALUES(finalise), synced_at = NOW()
            ')->execute([$matchId, $clubId, json_encode($statsParClub[$clubId]), json_encode($butsParClub[$clubId]), json_encode($cartonsParClub[$clubId]), $definitif ? 1 : 0]);
        } else {
            // Appel événements en échec → on écrit seulement les stats, et on
            // laisse "buts"/"cartons" tels quels (NULL si jamais remplis) pour
            // réessayer automatiquement au prochain affichage de ce match.
            // "finalise" n'est jamais posé à 1 ici : un échec ne doit jamais
            // être pris pour une donnée définitive.
            $db->prepare('
                INSERT INTO match_stats (match_id, club_id, stats, synced_at)
                VALUES (?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE stats = VALUES(stats), synced_at = NOW()
            ')->execute([$matchId, $clubId, json_encode($statsParClub[$clubId])]);
        }
    }
}

function verifierToken($db) {
    $headers = getallheaders();
    $auth    = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    $token   = str_replace('Bearer ', '', $auth);

    if (!$token) {
        http_response_code(401);
        echo json_encode(['erreur' => 'Token manquant']);
        exit();
    }

    $stmt = $db->prepare('
        SELECT u.* FROM users u
        JOIN sessions s ON s.user_id = u.id
        WHERE s.token = ? AND s.expire > NOW()
    ');
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['erreur' => 'Token invalide ou expiré']);
        exit();
    }

    return $user;
}

// ============================================================
//  Charge le barème de points actif pour une saison (configurable
//  via Admin, table bareme_points). Valeurs par défaut si la saison
//  n'a pas encore de ligne de config (ne devrait pas arriver en
//  pratique, une ligne est créée à l'initialisation de chaque saison,
//  mais on reste robuste au cas où).
// ============================================================
// ============================================================
//  Calcule le classement des équipes (général/domicile/extérieur)
//  à partir des matchs terminés — calcul BRUT, coûteux (boucle sur
//  tous les matchs de la saison). Ne jamais appeler directement en
//  dehors de rafraichirClassementEquipes() : partout ailleurs, passer
//  par _calculerClassementEquipes() qui lit le cache en base.
// ============================================================
function _construireClassementEquipes(PDO $db, string $mode, int $saisonId): array {
    $stmt = $db->prepare('SELECT id, nom, nom_court, code, logo_url FROM clubs WHERE saison_id = ?');
    $stmt->execute([$saisonId]);
    $clubs = $stmt->fetchAll();

    // Pénalties marquées par club — comptées match par match à partir de
    // match_stats.buts (detail="Penalty"), et non plus depuis stats_joueurs
    // (alimentée par /players/topscorers, une liste tronquée aux ~20
    // meilleurs buteurs de L1 : peu fiable en tout début de saison, quand
    // beaucoup de joueurs sont à égalité et n'entrent pas dans la liste).
    // match_stats est complétée à la volée juste avant, dans
    // rafraichirClassementEquipes() → _completerMatchStatsManquants().
    // On ne retient que les lignes "finalise=1" : un instantané pris en
    // plein match (ou par un recontrôle tombé pile en fin de match encore
    // en temps additionnel) peut sous-compter les buts/pénalties les plus
    // tardifs — voir _syncMatchStats(). Le match sera recompté correctement
    // dès qu'il aura été récupéré une bonne fois pour toutes, une fois
    // vraiment terminé.
    // Filtré selon le mode ($mode='domicile'/'exterieur') : sans ce filtre,
    // les 3 modes recevaient exactement le même total (domicile + extérieur
    // confondus), ce qui affichait par erreur le même nombre de pénaltys
    // dans les 3 onglets au lieu d'une répartition propre par lieu.
    $condModePen = '';
    if ($mode === 'domicile')       $condModePen = ' AND ms.club_id = m.club_dom_id';
    elseif ($mode === 'exterieur')  $condModePen = ' AND ms.club_id = m.club_ext_id';

    $stmt = $db->prepare('
        SELECT ms.club_id, ms.buts
        FROM match_stats ms
        JOIN matches m ON m.id = ms.match_id
        WHERE m.saison_id = ? AND m.statut = \'termine\' AND ms.finalise = 1' . $condModePen . '
    ');
    $stmt->execute([$saisonId]);
    $map_pen = [];
    foreach ($stmt->fetchAll() as $row) {
        $buts = json_decode($row['buts'] ?? '', true) ?: [];
        $nbPen = 0;
        foreach ($buts as $b) {
            if (($b['detail'] ?? '') === 'Penalty') $nbPen++;
        }
        $map_pen[$row['club_id']] = ($map_pen[$row['club_id']] ?? 0) + $nbPen;
    }

    $stmt = $db->prepare('
        SELECT club_dom_id, club_ext_id, score_dom, score_ext
        FROM matches
        WHERE saison_id = ? AND statut = \'termine\'
        AND score_dom IS NOT NULL AND score_ext IS NOT NULL
        ORDER BY date ASC, id ASC
    ');
    $stmt->execute([$saisonId]);
    $matchs = $stmt->fetchAll();

    $stats = [];
    foreach ($clubs as $c) {
        $stats[$c['id']] = [
            'id'       => $c['id'],
            'nom'      => $c['nom'],
            'nom_court'=> $c['nom_court'],
            'code'     => $c['code'],
            'logo_url' => $c['logo_url'],
            'j'  => 0, 'g'  => 0, 'n'  => 0, 'p'  => 0,
            'bp' => 0, 'bc' => 0, 'diff' => 0, 'pts' => 0,
            'forme' => [],
            'pen' => $map_pen[$c['id']] ?? 0,
        ];
    }

    foreach ($matchs as $m) {
        $dom = $m['club_dom_id'];
        $ext = $m['club_ext_id'];
        $sd  = $m['score_dom'];
        $se  = $m['score_ext'];

        if (!isset($stats[$dom]) || !isset($stats[$ext])) continue;

        if ($mode === 'domicile') {
            $stats[$dom]['j']++;
            $stats[$dom]['bp'] += $sd;
            $stats[$dom]['bc'] += $se;
            if ($sd > $se)      { $stats[$dom]['g']++; $stats[$dom]['pts'] += 3; $stats[$dom]['forme'][] = 'W'; }
            elseif ($sd === $se){ $stats[$dom]['n']++; $stats[$dom]['pts'] += 1; $stats[$dom]['forme'][] = 'D'; }
            else                { $stats[$dom]['p']++;                           $stats[$dom]['forme'][] = 'L'; }

        } elseif ($mode === 'exterieur') {
            $stats[$ext]['j']++;
            $stats[$ext]['bp'] += $se;
            $stats[$ext]['bc'] += $sd;
            if ($se > $sd)      { $stats[$ext]['g']++; $stats[$ext]['pts'] += 3; $stats[$ext]['forme'][] = 'W'; }
            elseif ($sd === $se){ $stats[$ext]['n']++; $stats[$ext]['pts'] += 1; $stats[$ext]['forme'][] = 'D'; }
            else                { $stats[$ext]['p']++;                           $stats[$ext]['forme'][] = 'L'; }

        } else {
            $stats[$dom]['j']++; $stats[$ext]['j']++;
            $stats[$dom]['bp'] += $sd; $stats[$dom]['bc'] += $se;
            $stats[$ext]['bp'] += $se; $stats[$ext]['bc'] += $sd;

            if ($sd > $se) {
                $stats[$dom]['g']++; $stats[$dom]['pts'] += 3;
                $stats[$ext]['p']++;
                $stats[$dom]['forme'][] = 'W'; $stats[$ext]['forme'][] = 'L';
            } elseif ($sd === $se) {
                $stats[$dom]['n']++; $stats[$dom]['pts'] += 1;
                $stats[$ext]['n']++; $stats[$ext]['pts'] += 1;
                $stats[$dom]['forme'][] = 'D'; $stats[$ext]['forme'][] = 'D';
            } else {
                $stats[$ext]['g']++; $stats[$ext]['pts'] += 3;
                $stats[$dom]['p']++;
                $stats[$ext]['forme'][] = 'W'; $stats[$dom]['forme'][] = 'L';
            }
        }
    }

    foreach ($stats as &$s) {
        $s['diff'] = $s['bp'] - $s['bc'];
        $s['forme'] = array_slice($s['forme'], -5);
    }

    usort($stats, function($a, $b) {
        if ($b['pts']  !== $a['pts'])  return $b['pts']  - $a['pts'];
        if ($b['diff'] !== $a['diff']) return $b['diff'] - $a['diff'];
        if ($b['bp']   !== $a['bp'])   return $b['bp']   - $a['bp'];
        return strcmp($a['nom'], $b['nom']);
    });

    $classement = array_values($stats);
    $nb = count($classement);
    foreach ($classement as $i => &$c) {
        $c['rang'] = $i + 1;
        $c['qualification'] = _qualification($i + 1, $nb);
    }

    return $classement;
}

function _qualification(int $rang, int $nb_equipes): string {
    if ($rang <= 3)             return 'ldc';
    if ($rang === 4)            return 'ldc_prelim';
    if ($rang <= 6)             return 'europa';
    if ($rang === 7)            return 'conference';
    if ($rang === $nb_equipes - 2) return 'barrage';
    if ($rang >= $nb_equipes - 1)  return 'relégation';
    return '';
}

// ============================================================
//  Recalcule le classement des équipes (3 modes) et réécrit le
//  cache en base (table classement_equipes_cache). C'est la SEULE
//  fonction qui doit relancer le calcul brut _construireClassementEquipes()
//  — appelée uniquement en ÉCRITURE (après un score de match, une
//  synchro de clubs, un recalcul admin), jamais en lecture.
//  Peu coûteuse : 18 clubs / ~306 matchs, appelée rarement (à chaque
//  écriture, pas à chaque affichage).
// ============================================================

// ============================================================
//  Filet de sécurité pour match_stats (buts détaillés dont pénalties) :
//  repère les matchs terminés qui n'ont pas encore leurs 2 lignes
//  match_stats.buts remplies, et va les chercher — seulement pour ceux-là,
//  jamais pour un match déjà synchronisé (pas de doublon d'appel API).
//
//  Sert de rattrapage aux 2 déclencheurs existants de _syncMatchStats() :
//  - consultation de l'onglet "Analyse" d'un match par un joueur,
//  - recontrôle cron des minutes de but/carton (fenêtre 90 min → 6h après
//    le coup d'envoi, une seule fois par match, verrou buts_recontroles_le).
//  Si cette fenêtre de 6h est ratée (NAS/cron arrêté) et qu'aucun joueur
//  n'a consulté l'Analyse entre-temps, match_stats resterait sinon
//  définitivement incomplet pour ce match. Comme rafraichirClassementEquipes()
//  est appelée à chaque mise à jour de match (donc très souvent), ce
//  rattrapage n'a normalement pas de fenêtre de temps à rater.
// ============================================================
function _completerMatchStatsManquants(PDO $db, int $saisonId): void {
    $stmt = $db->prepare('
        SELECT m.id, m.apf_fixture_id, m.club_dom_id, m.club_ext_id,
               COUNT(ms.match_id) AS nb_lignes_ok
        FROM matches m
        LEFT JOIN match_stats ms ON ms.match_id = m.id AND ms.buts IS NOT NULL AND ms.finalise = 1
        WHERE m.saison_id = ? AND m.statut = \'termine\'
          AND m.score_dom IS NOT NULL AND m.score_ext IS NOT NULL
          AND m.apf_fixture_id IS NOT NULL
        GROUP BY m.id, m.apf_fixture_id, m.club_dom_id, m.club_ext_id
        HAVING nb_lignes_ok < 2
    ');
    $stmt->execute([$saisonId]);
    $manquants = $stmt->fetchAll();

    foreach ($manquants as $m) {
        try {
            // $definitif=true : ces matchs sont filtrés statut='termine' plus
            // haut, donc toute resynchro faite ici peut être marquée comme
            // définitive sans risque.
            _syncMatchStats($db, (int)$m['id'], (int)$m['apf_fixture_id'], (int)$m['club_dom_id'], (int)$m['club_ext_id'], true);
        } catch (Exception $e) {
            // Non bloquant : le classement se calcule quand même avec les
            // données disponibles, on retentera au prochain rafraîchissement.
            error_log('Prono-L1 _completerMatchStatsManquants : échec match id=' . $m['id'] . ' — ' . $e->getMessage());
        }
    }
}

function rafraichirClassementEquipes(PDO $db, int $saisonId): void {
    // Filet de sécurité : complète match_stats pour tout match terminé qui
    // n'a pas encore ses buts détaillés (dont les pénalties) en base, AVANT
    // de recalculer le classement — voir _completerMatchStatsManquants().
    // Appelé une seule fois ici (pas dans _construireClassementEquipes, qui
    // tourne 3 fois de suite pour general/domicile/exterieur) pour ne
    // jamais déclencher 3 tentatives de synchro pour le même match manquant.
    _completerMatchStatsManquants($db, $saisonId);

    foreach (['general', 'domicile', 'exterieur'] as $mode) {
        $classement = _construireClassementEquipes($db, $mode, $saisonId);

        $db->prepare('DELETE FROM classement_equipes_cache WHERE saison_id = ? AND mode = ?')
           ->execute([$saisonId, $mode]);

        $insert = $db->prepare('
            INSERT INTO classement_equipes_cache
                (saison_id, mode, club_id, rang, j, g, n, p, bp, bc, diff, pts, pen, forme, qualification)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        foreach ($classement as $c) {
            $insert->execute([
                $saisonId, $mode, $c['id'], $c['rang'],
                $c['j'], $c['g'], $c['n'], $c['p'], $c['bp'], $c['bc'], $c['diff'], $c['pts'], $c['pen'],
                json_encode($c['forme']), $c['qualification'],
            ]);
        }
    }
}

// ============================================================
//  Lecture du classement des équipes — LIT LE CACHE, ne recalcule
//  jamais rien elle-même. Utilisée par classement.php (3 onglets),
//  chargerRangsAuto (app.js, via classement.php?action=equipes) et
//  la validation auto des bonus de fin de saison (cron).
//  Auto-réparation : si le cache n'a jamais été alimenté pour cette
//  saison (cas rare — nouvelle saison jamais rafraîchie), on le
//  construit à la volée une seule fois plutôt que de renvoyer vide.
// ============================================================
function _calculerClassementEquipes(PDO $db, string $mode, int $saisonId): array {
    $stmt = $db->prepare('SELECT COUNT(*) FROM classement_equipes_cache WHERE saison_id = ? AND mode = ?');
    $stmt->execute([$saisonId, $mode]);
    if ((int)$stmt->fetchColumn() === 0) {
        rafraichirClassementEquipes($db, $saisonId);
    }

    $stmt = $db->prepare('
        SELECT cec.club_id AS id, cl.nom, cl.nom_court, cl.code, cl.logo_url,
               cec.rang, cec.j, cec.g, cec.n, cec.p, cec.bp, cec.bc, cec.diff, cec.pts,
               cec.pen, cec.forme, cec.qualification
        FROM classement_equipes_cache cec
        JOIN clubs cl ON cl.id = cec.club_id
        WHERE cec.saison_id = ? AND cec.mode = ?
        ORDER BY cec.rang ASC
    ');
    $stmt->execute([$saisonId, $mode]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$r) {
        $r['id']   = (int)$r['id'];
        $r['rang'] = (int)$r['rang'];
        $r['j']    = (int)$r['j'];
        $r['g']    = (int)$r['g'];
        $r['n']    = (int)$r['n'];
        $r['p']    = (int)$r['p'];
        $r['bp']   = (int)$r['bp'];
        $r['bc']   = (int)$r['bc'];
        $r['diff'] = (int)$r['diff'];
        $r['pts']  = (int)$r['pts'];
        $r['pen']  = (int)$r['pen'];
        $r['forme'] = $r['forme'] !== null ? json_decode($r['forme'], true) : [];
    }
    unset($r);

    return $rows;
}

// ============================================================
//  Envoie les notifications des matchs terminés pas encore notifiés
//  d'une saison, groupées par date (voir envoyerNotificationsGroupees
//  dans notifications.php). Déplacé depuis classement.php (était
//  privée, local à ce fichier) pour être réutilisable par
//  recalculerPointsSaison() ci-dessous, appelée aussi bien depuis
//  classement.php (bouton "Recalculer les points") que depuis
//  bonus.php (changement de barème). Idempotent : ne renvoie jamais
//  2 fois la même notif (marquage notif_envoyee géré à l'intérieur).
// ============================================================
function envoyerNotificationsEnAttente(PDO $db, int $saisonId): void {
    if (file_exists(__DIR__ . '/notifications.php')) {
        require_once __DIR__ . '/notifications.php';
        envoyerNotificationsGroupees($db, $saisonId);
    }
}

// ============================================================
//  Recalcule TOUS les points de pronostics d'une saison à partir du
//  barème actuellement configuré (bareme_points), et régénère le
//  cache de classement des équipes en conséquence.
//  Fonction PARTAGÉE, appelée par :
//   - classement.php POST ?action=calculer (bouton admin manuel)
//   - bonus.php POST ?action=bareme_maj (automatiquement après tout
//     changement de barème — évite d'avoir à cliquer 2 boutons, et
//     surtout évite qu'un barème modifié reste silencieusement en
//     décalage avec les points déjà attribués)
// ============================================================
function recalculerPointsSaison(PDO $db, int $saisonId): array {
    // Remet tous les pronostics de la saison à NULL pour recalculer
    $db->prepare('
        UPDATE pronostics SET resultat = NULL, points = 0
        WHERE match_id IN (SELECT id FROM matches WHERE saison_id = ?)
    ')->execute([$saisonId]);

    // Recalcule sur tout match ayant un score complet, que le statut soit
    // déjà "termine" ou resté bloqué à autre chose (score = preuve fiable
    // qu'un match est joué, contrairement au mot exact du statut)
    $stmt = $db->prepare('
        SELECT id, score_dom, score_ext
        FROM matches
        WHERE saison_id = ?
        AND score_dom IS NOT NULL AND score_ext IS NOT NULL
        AND statut != \'reporte\' AND statut != \'annule\'
    ');
    $stmt->execute([$saisonId]);
    $matchs = $stmt->fetchAll();

    // Remettre le statut à "termine" pour tout match ayant un score complet
    // mais resté bloqué sur un autre statut (cohérence avec le reste de l'appli)
    $db->prepare('
        UPDATE matches
        SET statut = \'termine\'
        WHERE saison_id = ? AND statut != \'termine\' AND statut != \'reporte\' AND statut != \'annule\'
        AND score_dom IS NOT NULL AND score_ext IS NOT NULL
    ')->execute([$saisonId]);

    $bareme = chargerBareme($db, $saisonId);

    $total_calcules = 0;
    foreach ($matchs as $match) {
        $total_calcules += calculerPointsMatch(
            $db, $match['id'], (int)$match['score_dom'], (int)$match['score_ext'], $bareme
        );
    }

    envoyerNotificationsEnAttente($db, $saisonId);
    rafraichirClassementEquipes($db, $saisonId);

    return ['pronos' => $total_calcules, 'matchs' => count($matchs)];
}


//  à une LISTE de réponses acceptées (plusieurs en cas d'égalité —
//  ex: 2 buteurs à égalité, n'importe lequel des deux compte comme
//  correct). Gère aussi le croisement "2e/3e du championnat" : si le
//  club désigné a fini à l'AUTRE place, demi-points.
//  Utilisée à la fois par la validation manuelle (Admin) et la
//  validation automatique de fin de saison.
//
//  @param clubsAcceptes  IDs de clubs corrects (vide si bonus joueur)
//  @param nomsAcceptes   Noms de joueurs corrects, déjà en minuscule/trim
// ============================================================
function validerBonus(PDO $db, array $bonus, int $numeroChoix, array $clubsAcceptes, array $nomsAcceptes): array {
    $stmt = $db->prepare('SELECT * FROM pronostics_bonus WHERE bonus_id = ? AND numero_choix = ?');
    $stmt->execute([$bonus['id'], $numeroChoix]);
    $pronos = $stmt->fetchAll();

    // Croisement 2e/3e du championnat : demi-points si inversion
    $labelsCroises  = ['2e du championnat', '3e du championnat'];
    $estBonusCroise = $bonus['type'] === 'club' && in_array($bonus['label'], $labelsCroises, true);
    $bonusSibling   = null;
    if ($estBonusCroise) {
        $labelSibling = $bonus['label'] === $labelsCroises[0] ? $labelsCroises[1] : $labelsCroises[0];
        $stmtSib = $db->prepare('SELECT id, points, reponse_club_id FROM bonus_config WHERE saison_id = ? AND label = ? LIMIT 1');
        $stmtSib->execute([$bonus['saison_id'], $labelSibling]);
        $bonusSibling = $stmtSib->fetch();
    }
    $clubSibling = $bonusSibling['reponse_club_id'] ?? null;

    $corrects = 0;
    foreach ($pronos as $p) {
        $correct = false;
        if (!empty($nomsAcceptes)) {
            $val = mb_strtolower(trim($p['valeur_texte'] ?? ''));
            $correct = in_array($val, $nomsAcceptes, true);
        } elseif (!empty($clubsAcceptes)) {
            $correct = in_array((int)$p['valeur_club_id'], $clubsAcceptes, true);
        }

        if ($correct) {
            $resultat = 1;
            $pts = ($bonus['type'] === 'multi_club')
                ? intval($bonus['points'] / $bonus['nb_choix'])
                : $bonus['points'];
            $corrects++;
        } elseif ($estBonusCroise && $clubSibling && (int)$p['valeur_club_id'] === (int)$clubSibling) {
            $resultat = 2; // demi-points (inversion 2e/3e)
            $pts = intval($bonus['points'] / 2);
        } else {
            $resultat = 0;
            $pts = 0;
        }

        $db->prepare('UPDATE pronostics_bonus SET resultat = ?, points = ? WHERE id = ?')
           ->execute([$resultat, $pts, $p['id']]);
    }

    // Rétroactif sur le bonus jumeau (2e/3e), au cas où il a déjà été
    // validé avant qu'on connaisse cette réponse-ci
    $retroactifs = 0;
    if ($estBonusCroise && $bonusSibling && !empty($clubsAcceptes)) {
        $clubValide = $clubsAcceptes[0];
        $stmtRetro = $db->prepare('SELECT id, valeur_club_id FROM pronostics_bonus WHERE bonus_id = ? AND resultat = 0');
        $stmtRetro->execute([$bonusSibling['id']]);
        $ptsDemi = intval($bonusSibling['points'] / 2);
        foreach ($stmtRetro->fetchAll() as $pr) {
            if ((int)$pr['valeur_club_id'] === (int)$clubValide) {
                $db->prepare('UPDATE pronostics_bonus SET resultat = 2, points = ? WHERE id = ?')
                   ->execute([$ptsDemi, $pr['id']]);
                $retroactifs++;
            }
        }
    }

    return ['corrects' => $corrects, 'total' => count($pronos), 'retroactifs' => $retroactifs];
}

// ============================================================
//  Validation automatique des bonus de fin de saison basés sur le
//  classement final (champion, 2e, 3e, relégués, barragiste,
//  meilleure attaque/défense) ou les stats individuelles (buteur,
//  passeur) — dès que TOUS les matchs de la saison sont joués.
//  Idempotente : un bonus déjà résolu (reponse_club_id ou
//  reponse_texte déjà renseigné) n'est jamais retraité.
//  En cas d'égalité, TOUS les ex-aequo comptent comme corrects.
// ============================================================
function verifierBonusAutomatiques(PDO $db, int $saisonId): array {
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM matches
        WHERE saison_id = ? AND statut NOT IN ('termine', 'annule')
    ");
    $stmt->execute([$saisonId]);
    if ((int)$stmt->fetchColumn() > 0) {
        return ['statut' => 'attente', 'message' => 'Saison pas encore entièrement terminée'];
    }

    $stmt = $db->prepare("
        SELECT * FROM bonus_config
        WHERE saison_id = ? AND critere_auto IS NOT NULL
        AND reponse_club_id IS NULL AND reponse_texte IS NULL
    ");
    $stmt->execute([$saisonId]);
    $bonusAvalider = $stmt->fetchAll();

    if (empty($bonusAvalider)) {
        return ['statut' => 'ok', 'resultats' => []];
    }

    $classementEquipes = null;
    $resultats = [];

    foreach ($bonusAvalider as $bonus) {
        $critere = $bonus['critere_auto'];

        if (strpos($critere, 'rang_') === 0) {
            if ($classementEquipes === null) {
                $classementEquipes = _calculerClassementEquipes($db, 'general', $saisonId);
            }
            $rangs = array_map('intval', explode('_', substr($critere, 5))); // 'rang_2'→[2] / 'rang_17_18'→[17,18]

            if ($bonus['type'] === 'multi_club' && count($rangs) > 1) {
                foreach ($rangs as $idx => $rangCible) {
                    $club = null;
                    foreach ($classementEquipes as $c) { if ($c['rang'] === $rangCible) { $club = $c; break; } }
                    if (!$club) continue;
                    validerBonus($db, $bonus, $idx + 1, [(int)$club['id']], []);
                    $db->prepare('UPDATE bonus_config SET reponse_club_id = ? WHERE id = ?')
                       ->execute([$club['id'], $bonus['id']]);
                    $resultats[] = "{$bonus['label']} (choix " . ($idx + 1) . ") → {$club['nom']}";
                }
            } else {
                $club = null;
                foreach ($classementEquipes as $c) { if ($c['rang'] === $rangs[0]) { $club = $c; break; } }
                if (!$club) continue;
                validerBonus($db, $bonus, 1, [(int)$club['id']], []);
                $db->prepare('UPDATE bonus_config SET reponse_club_id = ? WHERE id = ?')
                   ->execute([$club['id'], $bonus['id']]);
                $resultats[] = "{$bonus['label']} → {$club['nom']}";
            }

        } elseif (in_array($critere, ['attaque', 'defense'], true)) {
            if ($classementEquipes === null) {
                $classementEquipes = _calculerClassementEquipes($db, 'general', $saisonId);
            }
            $champ = $critere === 'attaque' ? 'bp' : 'bc';
            $valeurs = array_column($classementEquipes, $champ);
            $valeurCible = $critere === 'attaque' ? max($valeurs) : min($valeurs);
            $gagnants = array_filter($classementEquipes, fn($c) => $c[$champ] === $valeurCible);
            $idsGagnants = array_map(fn($c) => (int)$c['id'], array_values($gagnants));

            validerBonus($db, $bonus, 1, $idsGagnants, []);
            $db->prepare('UPDATE bonus_config SET reponse_club_id = ? WHERE id = ?')
               ->execute([$idsGagnants[0], $bonus['id']]);
            $resultats[] = "{$bonus['label']} → " . implode(', ', array_map(fn($c) => $c['nom'], $gagnants));

        } elseif (in_array($critere, ['buteur', 'passeur'], true)) {
            $champ = $critere === 'buteur' ? 'buts' : 'passes_d';
            $stmt = $db->prepare("SELECT MAX($champ) FROM stats_joueurs WHERE saison_id = ?");
            $stmt->execute([$saisonId]);
            $maxVal = $stmt->fetchColumn();
            if ($maxVal === null || (int)$maxVal <= 0) continue;

            $stmt = $db->prepare("SELECT nom FROM stats_joueurs WHERE saison_id = ? AND $champ = ?");
            $stmt->execute([$saisonId, $maxVal]);
            $nomsGagnants = array_column($stmt->fetchAll(), 'nom');
            $nomsAcceptes = array_map(fn($n) => mb_strtolower(trim($n)), $nomsGagnants);

            validerBonus($db, $bonus, 1, [], $nomsAcceptes);
            $db->prepare('UPDATE bonus_config SET reponse_texte = ? WHERE id = ?')
               ->execute([$nomsGagnants[0], $bonus['id']]);
            $resultats[] = "{$bonus['label']} → " . implode(', ', $nomsGagnants);
        }
    }

    return ['statut' => 'ok', 'resultats' => $resultats];
}

function chargerBareme(PDO $db, int $saisonId): array {
    $defaut = [
        'pts_exact'          => 5,
        'pts_bon_resultat'   => 2,
        'pts_bonus_ecart'    => 1,
        'pts_bonus_buts_dom' => 1,
        'pts_bonus_buts_ext' => 1,
        'cote_plafond'       => 5.00,
    ];
    $stmt = $db->prepare('
        SELECT pts_exact, pts_bon_resultat, pts_bonus_ecart, pts_bonus_buts_dom, pts_bonus_buts_ext, cote_plafond
        FROM bareme_points WHERE saison_id = ? LIMIT 1
    ');
    $stmt->execute([$saisonId]);
    $row = $stmt->fetch();
    return $row ?: $defaut;
}

// ============================================================
//  Calcule points + résultat ('exact'/'bon'/'mauvais') de chaque
//  pronostic non encore noté sur un match terminé, selon le barème
//  configurable de la saison :
//   - Score exact           → pts_exact, AUCUN autre bonus ne s'ajoute
//   - Bon résultat (sens)    → pts_bon_resultat
//       + bon écart de buts  → + pts_bonus_ecart (seulement si bon résultat)
//   - Bon nb de buts dom     → + pts_bonus_buts_dom (indépendant du
//                               résultat global — peut s'appliquer même
//                               sur un pronostic par ailleurs "mauvais")
//   - Bon nb de buts ext     → + pts_bonus_buts_ext (idem)
//  Le champ `resultat` reste une simple catégorisation exact/bon/mauvais
//  du SENS du résultat, indépendante des bonus partiels ci-dessus.
// ============================================================
function calculerPointsMatch(PDO $db, int $match_id, ?int $scoreDomConnu = null, ?int $scoreExtConnu = null, ?array $baremeConnu = null): int {
    if ($scoreDomConnu !== null && $scoreExtConnu !== null && $baremeConnu !== null) {
        // Valeurs déjà connues de l'appelant (cas recalculerPointsSaison, qui
        // les a déjà en main pour TOUS les matchs de la saison) — on évite
        // ainsi 2 requêtes redondantes (re-fetch du match + re-fetch du
        // barème, identique pour toute la saison) à chaque match recalculé
        $scoreDom = $scoreDomConnu;
        $scoreExt = $scoreExtConnu;
        $bareme   = $baremeConnu;
    } else {
        $stmt = $db->prepare('SELECT saison_id, score_dom, score_ext FROM matches WHERE id = ?');
        $stmt->execute([$match_id]);
        $match = $stmt->fetch();
        if (!$match || $match['score_dom'] === null) return 0;

        $bareme   = chargerBareme($db, (int)$match['saison_id']);
        $scoreDom = (int)$match['score_dom'];
        $scoreExt = (int)$match['score_ext'];
    }

    // Cotes API figées au coup d'envoi de ce match — une seule fois, pas
    // par pronostic. Servent au barème alternatif "avec cotes" ci-dessous.
    // NULL si jamais synchronisées (le multiplicateur retombe alors à 1,
    // points_alt = points classiques, sans bonus ni malus).
    $stmt = $db->prepare('SELECT cote_dom_api_figee, cote_nul_api_figee, cote_ext_api_figee FROM cotes_matchs WHERE match_id = ?');
    $stmt->execute([$match_id]);
    $cotesFigees = $stmt->fetch() ?: ['cote_dom_api_figee' => null, 'cote_nul_api_figee' => null, 'cote_ext_api_figee' => null];
    $cotePlafond = (float)($bareme['cote_plafond'] ?? 5.00);

    $stmt = $db->prepare('
        SELECT id, score_dom_pred, score_ext_pred
        FROM pronostics
        WHERE match_id = ? AND resultat IS NULL
    ');
    $stmt->execute([$match_id]);
    $rows = $stmt->fetchAll();
    if (empty($rows)) return 0;

    $update = $db->prepare('UPDATE pronostics SET resultat = ?, points = ?, points_alt = ? WHERE id = ?');

    foreach ($rows as $r) {
        $pDom = (int)$r['score_dom_pred'];
        $pExt = (int)$r['score_ext_pred'];

        $exact       = ($pDom === $scoreDom && $pExt === $scoreExt);
        $bonResultat = (($pDom <=> $pExt) === ($scoreDom <=> $scoreExt));
        $resultat    = $exact ? 'exact' : ($bonResultat ? 'bon' : 'mauvais');

        $d      = decomposerPoints($bareme, $pDom, $pExt, $scoreDom, $scoreExt);
        $points = array_sum($d);

        // ── Barème alternatif "avec cotes" ──
        // Seule la partie "sens" (score exact ou bon résultat) est
        // multipliée par la cote du résultat pronostiqué (plafonnée à
        // cote_plafond) — les bonus (écart, buts dom, buts ext) restent
        // inchangés, ajoutés tels quels après coup : la cote mesure la
        // probabilité du SENS du résultat, pas celle de deviner le
        // nombre exact de buts d'une équipe.
        $sensPoints = $d['exact'] + $d['bon_resultat'];
        $bonusFlat  = $d['bonus_ecart'] + $d['bonus_buts_dom'] + $d['bonus_buts_ext'];

        $sens        = $pDom <=> $pExt; // 1 = dom, -1 = ext, 0 = nul
        $coteChoisie = match (true) {
            $sens > 0 => $cotesFigees['cote_dom_api_figee'],
            $sens < 0 => $cotesFigees['cote_ext_api_figee'],
            default   => $cotesFigees['cote_nul_api_figee'],
        };
        $multiplicateur = $coteChoisie !== null ? min((float)$coteChoisie, $cotePlafond) : 1.0;
        $pointsAlt      = round($sensPoints * $multiplicateur + $bonusFlat, 2);

        $update->execute([$resultat, $points, $pointsAlt, $r['id']]);
    }

    return count($rows);
}

// ============================================================
//  Décompose le nombre de points d'un pronostic en ses composantes du
//  barème (exact / bon résultat / bonus écart / bonus buts dom / bonus
//  buts ext) — même logique que calculerPointsMatch() ci-dessus, mais
//  retournée en détail plutôt qu'en simple total. Sert aux
//  notifications groupées (notifications.php), qui affichent cette
//  décomposition à côté du total pour chaque match.
// ============================================================
function decomposerPoints(array $bareme, int $pDom, int $pExt, int $scoreDom, int $scoreExt): array {
    $d = ['exact' => 0, 'bon_resultat' => 0, 'bonus_ecart' => 0, 'bonus_buts_dom' => 0, 'bonus_buts_ext' => 0];

    $exact       = ($pDom === $scoreDom && $pExt === $scoreExt);
    $bonResultat = (($pDom <=> $pExt) === ($scoreDom <=> $scoreExt));

    if ($exact) {
        $d['exact'] = (int)$bareme['pts_exact'];
    } else {
        if ($bonResultat) {
            $d['bon_resultat'] = (int)$bareme['pts_bon_resultat'];
            if (($pDom - $pExt) === ($scoreDom - $scoreExt)) {
                $d['bonus_ecart'] = (int)$bareme['pts_bonus_ecart'];
            }
        }
        if ($pDom === $scoreDom) $d['bonus_buts_dom'] = (int)$bareme['pts_bonus_buts_dom'];
        if ($pExt === $scoreExt) $d['bonus_buts_ext'] = (int)$bareme['pts_bonus_buts_ext'];
    }
    return $d;
}
//  d'un club. Utilisée :
//  - par stats.php (action=forme), en cas d'absence de cache
//  - par cron_sync.php, juste après qu'un match soit synchronisé
//    comme "terminé", pour que le cache soit déjà à jour avant
//    même qu'un joueur ne consulte la page (zéro calcul à la demande)
// ============================================================
// ============================================================
//  Construction de la structure "forme" à partir d'une liste de
//  matchs terminés d'un club (déjà triés date DESC, LIMIT appliqué
//  en amont). Partagée entre l'action GET ?action=forme de stats.php
//  et precalculerFormeClub() ci-dessous, pour ne pas dupliquer la
//  logique à deux endroits.
//  Contenu : date + noms domicile/extérieur + score complet (pas
//  seulement du point de vue du club), + moyennes buts pour/contre
//  sur l'échantillon retourné. Toujours Ligue 1 uniquement pour
//  l'instant (seule compétition présente dans la table matches).
// ============================================================
function _construireFormeClub(array $matchs, int $club_id): array {
    $forme = [];
    $totalBP = 0;
    $totalBC = 0;

    foreach ($matchs as $m) {
        $est_dom  = $m['club_dom_id'] == $club_id;
        $mes_buts = $est_dom ? $m['score_dom'] : $m['score_ext'];
        $adv_buts = $est_dom ? $m['score_ext'] : $m['score_dom'];

        if ($mes_buts > $adv_buts)     $r = 'W';
        elseif ($mes_buts < $adv_buts) $r = 'L';
        else                           $r = 'D';

        $totalBP += $mes_buts;
        $totalBC += $adv_buts;

        $forme[] = [
            'resultat'   => $r,
            'date'       => $m['date'],
            'nom_dom'    => $m['nom_dom'],
            'nom_ext'    => $m['nom_ext'],
            'code_dom'   => $m['code_dom'] ?? '',
            'code_ext'   => $m['code_ext'] ?? '',
            'score_dom'  => (int)$m['score_dom'],
            'score_ext'  => (int)$m['score_ext'],
            'domicile'   => $est_dom,
            // Conservés pour compatibilité ascendante (anciens clients
            // en cache éventuellement pas encore rafraîchis)
            'score'      => "$mes_buts-$adv_buts",
            'adversaire' => $est_dom ? $m['nom_ext'] : $m['nom_dom'],
        ];
    }

    $nb = count($matchs);

    return [
        'matchs'      => $forme,
        'bp_moyenne'  => $nb ? round($totalBP / $nb, 1) : 0,
        'bc_moyenne'  => $nb ? round($totalBC / $nb, 1) : 0,
        'competition' => 'ligue1', // seule source actuelle — à ajuster si un jour on mélange les compétitions
    ];
}

function precalculerFormeClub(PDO $db, int $club_id, int $saisonId): array {
    $stmt = $db->prepare('
        SELECT
            m.score_dom, m.score_ext, m.date, m.club_dom_id,
            c1.nom_court AS nom_dom, c1.code AS code_dom,
            c2.nom_court AS nom_ext, c2.code AS code_ext
        FROM matches m
        JOIN clubs c1 ON c1.id = m.club_dom_id
        JOIN clubs c2 ON c2.id = m.club_ext_id
        WHERE m.saison_id = ? AND m.statut = \'termine\'
        AND (m.club_dom_id = ? OR m.club_ext_id = ?)
        ORDER BY m.date DESC
        LIMIT 5
    ');
    $stmt->execute([$saisonId, $club_id, $club_id]);
    $matchs = $stmt->fetchAll();

    $forme     = _construireFormeClub($matchs, $club_id);
    $resultat  = ['statut' => 'OK', 'forme' => $forme];
    $cle_cache = "forme_{$club_id}_{$saisonId}";

    try {
        $db->prepare('
            INSERT INTO cache_api (cle, valeur, expire_at)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
            ON DUPLICATE KEY UPDATE valeur = VALUES(valeur), expire_at = VALUES(expire_at)
        ')->execute([$cle_cache, json_encode($resultat)]);
    } catch (Exception $e) {}

    return $resultat;
}

// ============================================================
//  QUIZZ — config, résolution automatique, classement
//  Regroupées ici (plutôt que dans quizz.php) pour être appelables
//  à la fois depuis l'API (action=resoudre, déclenchée par le bouton
//  Admin) ET depuis cron_sync.php (résolution automatique dès qu'un
//  match passe à "terminé"), sans dupliquer la logique.
// ============================================================

function _chargerConfigQuizz(PDO $db, int $saisonId): array {
    $defaut = [
        'nb_questions_normale' => 4,
        'nb_questions_treve'   => 5,
        'pts_bonne_reponse'    => 2,
        'bonus_sans_faute_pct' => 50,
        'timer_secondes_actu'  => 10,
        'nb_actu_normale'      => 1,
        'nb_histo_normale'     => 0,
        'nb_histo_treve'       => 2,
        'duree_validite_special_jours' => 7,
    ];
    $stmt = $db->prepare('
        SELECT nb_questions_normale, nb_questions_treve, pts_bonne_reponse, bonus_sans_faute_pct,
               timer_secondes_actu, nb_actu_normale, nb_histo_normale, nb_histo_treve,
               duree_validite_special_jours
        FROM quizz_config WHERE saison_id = ? LIMIT 1
    ');
    $stmt->execute([$saisonId]);
    $row = $stmt->fetch();
    return $row ? array_map('intval', $row) : $defaut;
}

// Régénère intégralement quizz_classement_cache pour la saison, à
// partir des points déjà attribués question par question — même
// principe que classement_equipes_cache : une seule source de
// vérité, recalculée après chaque résolution plutôt qu'à la volée.
function _recalculerClassementQuizz(PDO $db, int $saisonId, array $config): int {
    // Semaines entièrement résolues (toutes leurs questions ont un résultat connu)
    $stmt = $db->prepare("
        SELECT s.id, COUNT(q.id) AS nb_questions
        FROM quizz_semaine s
        JOIN quizz_questions q ON q.quizz_semaine_id = s.id
        WHERE s.saison_id = ? AND s.statut = 'publie'
        GROUP BY s.id
        HAVING SUM(q.resultat_connu = 0) = 0
    ");
    $stmt->execute([$saisonId]);
    $semainesResolues = $stmt->fetchAll();

    $totaux = []; // user_id => ['points' => x, 'sans_faute' => n]

    foreach ($semainesResolues as $sem) {
        $stmt2 = $db->prepare('
            SELECT rj.user_id, rj.points, rj.reponse_id
            FROM quizz_reponses_joueurs rj
            JOIN quizz_questions q ON q.id = rj.question_id
            WHERE q.quizz_semaine_id = ?
        ');
        $stmt2->execute([$sem['id']]);
        $reponses = $stmt2->fetchAll();

        $parJoueur = [];
        foreach ($reponses as $r) {
            $parJoueur[$r['user_id']]['points'] = ($parJoueur[$r['user_id']]['points'] ?? 0) + (int)$r['points'];
            $parJoueur[$r['user_id']]['nb']     = ($parJoueur[$r['user_id']]['nb'] ?? 0) + 1;
        }

        $maxPossible = (int)$sem['nb_questions'] * $config['pts_bonne_reponse'];

        foreach ($parJoueur as $userId => $donnees) {
            if (!isset($totaux[$userId])) $totaux[$userId] = ['points' => 0, 'sans_faute' => 0];

            $pts = $donnees['points'];
            // Sans-faute = a répondu à toutes les questions de la semaine ET
            // a obtenu le maximum de points possible
            if ($donnees['nb'] === (int)$sem['nb_questions'] && $pts === $maxPossible && $maxPossible > 0) {
                $pts += (int)round($maxPossible * $config['bonus_sans_faute_pct'] / 100);
                $totaux[$userId]['sans_faute']++;
            }
            $totaux[$userId]['points'] += $pts;
        }
    }

    // Tri par points décroissants pour attribuer les rangs
    uasort($totaux, fn($a, $b) => $b['points'] <=> $a['points']);

    $db->prepare('DELETE FROM quizz_classement_cache WHERE saison_id = ?')->execute([$saisonId]);
    $insert = $db->prepare('
        INSERT INTO quizz_classement_cache (saison_id, user_id, total_points, nb_sans_faute, rang)
        VALUES (?, ?, ?, ?, ?)
    ');
    $rang = 1;
    foreach ($totaux as $userId => $d) {
        $insert->execute([$saisonId, $userId, $d['points'], $d['sans_faute'], $rang]);
        $rang++;
    }

    return count($totaux);
}

// Corrige toutes les questions de quizz dont le match est terminé et
// dont le résultat n'est pas encore connu, attribue les points, puis
// régénère le classement quizz. Idempotente et sans effet si rien à
// résoudre — peut donc être appelée à chaque passage du cron sans
// précaution particulière. Les questions "buteur" dont les stats du
// match ne sont pas encore synchronisées sont simplement laissées de
// côté (resultat_connu reste à 0) : elles seront retentées toutes
// seules au prochain passage, une fois les données disponibles.
function resoudreQuizzSaison(PDO $db, int $saisonId): array {
    $config = _chargerConfigQuizz($db, $saisonId);

    $stmt = $db->prepare("
        SELECT q.*, m.statut AS match_statut, m.score_dom, m.score_ext, m.club_dom_id, m.club_ext_id
        FROM quizz_questions q
        JOIN quizz_semaine s ON s.id = q.quizz_semaine_id
        JOIN matches m ON m.id = q.match_id
        WHERE s.saison_id = ? AND q.resultat_connu = 0
    ");
    $stmt->execute([$saisonId]);
    $questions = $stmt->fetchAll();

    $questionsResolues = 0;
    foreach ($questions as $q) {
        if ($q['match_statut'] !== 'termine' || $q['score_dom'] === null) continue;

        $reponsesCorrectes = null; // tableau de textes considérés corrects, ou null = pas résolu

        if ($q['sous_type'] === 'plus_moins_25') {
            $total = (int)$q['score_dom'] + (int)$q['score_ext'];
            $reponsesCorrectes = [$total > 2 ? 'Plus de 2,5 buts' : 'Moins de 2,5 buts'];
        } elseif ($q['sous_type'] === 'btts') {
            $reponsesCorrectes = [((int)$q['score_dom'] > 0 && (int)$q['score_ext'] > 0) ? 'Oui' : 'Non'];
        } elseif ($q['sous_type'] === 'buteur') {
            $stmt2 = $db->prepare('SELECT buts FROM match_stats WHERE match_id = ? AND club_id IN (?, ?) AND buts IS NOT NULL');
            $stmt2->execute([$q['match_id'], $q['club_dom_id'], $q['club_ext_id']]);
            $lignes = $stmt2->fetchAll();
            if (empty($lignes)) continue; // events pas encore synchronisés — on retentera au prochain passage

            $buteurs = [];
            foreach ($lignes as $l) {
                foreach ((json_decode($l['buts'], true) ?: []) as $but) {
                    if (($but['detail'] ?? '') === 'Missed Penalty') continue;
                    $buteurs[] = mb_strtolower(trim($but['joueur'] ?? ''));
                }
            }
            $reponsesCorrectes = $buteurs; // liste de noms normalisés
        }

        if ($reponsesCorrectes === null) continue;

        // Normalisation de casse : $reponsesCorrectes contient des libellés
        // fixes ("Plus de 2,5 buts", "Oui"...) qui gardent leur majuscule
        // initiale, alors que $texteNorm ci-dessous est mis en minuscules
        // avant comparaison. Sans cette ligne, in_array(..., true) (mode
        // strict) ne matche jamais et TOUTES les réponses sont marquées
        // fausses, quel que soit le résultat réel du match. Les buteurs
        // sont déjà en minuscules donc cette normalisation est sans effet
        // pour eux (idempotente).
        $reponsesCorrectes = array_map(fn($r) => mb_strtolower(trim($r)), $reponsesCorrectes);

        $stmt3 = $db->prepare('SELECT id, texte FROM quizz_reponses_possibles WHERE question_id = ?');
        $stmt3->execute([$q['id']]);
        $reponsesPossibles = $stmt3->fetchAll();

        $updateReponse = $db->prepare('UPDATE quizz_reponses_possibles SET est_correcte = ? WHERE id = ?');
        foreach ($reponsesPossibles as $rp) {
            $texteNorm = mb_strtolower(trim($rp['texte']));
            $correcte  = in_array($texteNorm, $reponsesCorrectes, true) ? 1 : 0;
            $updateReponse->execute([$correcte, $rp['id']]);
        }

        $db->prepare('UPDATE quizz_questions SET resultat_connu = 1 WHERE id = ?')->execute([$q['id']]);

        // Attribution des points aux joueurs ayant répondu
        $stmt4 = $db->prepare('
            SELECT rj.id, rp.est_correcte
            FROM quizz_reponses_joueurs rj
            LEFT JOIN quizz_reponses_possibles rp ON rp.id = rj.reponse_id
            WHERE rj.question_id = ?
        ');
        $stmt4->execute([$q['id']]);
        $updatePts = $db->prepare('UPDATE quizz_reponses_joueurs SET points = ? WHERE id = ?');
        foreach ($stmt4->fetchAll() as $rj) {
            $pts = !empty($rj['est_correcte']) ? $config['pts_bonne_reponse'] : 0;
            $updatePts->execute([$pts, $rj['id']]);
        }

        $questionsResolues++;
    }

    $recalcul = _recalculerClassementQuizz($db, $saisonId, $config);

    return [
        'questions_resolues'   => $questionsResolues,
        'classement_recalcule' => $recalcul,
    ];
}
