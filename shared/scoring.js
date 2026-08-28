/**
 * Points scoring for pronostics — faithful port of the legacy `decomposerPoints`
 * (api/utils.php). Bareme is configurable per season; these are the defaults.
 *
 * Rules:
 *  - Exact score → ptsExact, no other bonus.
 *  - Correct result (win/draw/loss) → ptsBonResultat, + ptsBonusEcart if the
 *    goal difference is also right.
 *  - Correct home goals → + ptsBonusButsDom (independent of the result).
 *  - Correct away goals → + ptsBonusButsExt (independent of the result).
 */
export const DEFAULT_BAREME = {
  ptsExact: 5,
  ptsBonResultat: 2,
  ptsBonusEcart: 1,
  ptsBonusButsDom: 1,
  ptsBonusButsExt: 1,
};

function sign(a, b) {
  return Math.sign(a - b);
}

export function decomposePoints(bareme, predDom, predExt, scoreDom, scoreExt) {
  const d = { exact: 0, bonResultat: 0, bonusEcart: 0, bonusButsDom: 0, bonusButsExt: 0 };

  if (predDom == null || predExt == null || scoreDom == null || scoreExt == null) {
    return { ...d, total: 0, resultat: "mauvais" };
  }

  const exact = predDom === scoreDom && predExt === scoreExt;
  const bonResultat = sign(predDom, predExt) === sign(scoreDom, scoreExt);

  if (exact) {
    d.exact = bareme.ptsExact;
  } else {
    if (bonResultat) {
      d.bonResultat = bareme.ptsBonResultat;
      if (predDom - predExt === scoreDom - scoreExt) {
        d.bonusEcart = bareme.ptsBonusEcart;
      }
    }
    if (predDom === scoreDom) d.bonusButsDom = bareme.ptsBonusButsDom;
    if (predExt === scoreExt) d.bonusButsExt = bareme.ptsBonusButsExt;
  }

  const total = d.exact + d.bonResultat + d.bonusEcart + d.bonusButsDom + d.bonusButsExt;
  const resultat = exact ? "exact" : bonResultat ? "bon" : "mauvais";
  return { ...d, total, resultat };
}

export function computePronosticPoints(predDom, predExt, scoreDom, scoreExt, bareme = DEFAULT_BAREME) {
  return decomposePoints(bareme, predDom, predExt, scoreDom, scoreExt).total;
}
