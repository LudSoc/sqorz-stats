# Spec — Indice de performance v2 : force du plateau + shrinkage

Date : 2026-09-08 · Statut : **✅ IMPLÉMENTÉ le 2026-09-08 (build + apps + tests, recette §10)**

Évolution de la spec [indice-perf du 2026-09-02](./2026-09-02-indice-perf-design.md) (dont §7.4 anti-saturation) : ne change ni les signaux existants (rang, constance, chrono, séries, DNF gradué), ni leurs poids — ajoute la **force de l'opposition** et stabilise les **petits échantillons**.

## 1. Objectif

Corriger les deux limites mesurées de l'indice actuel, par ordre de gravité :

1. **La force du plateau est ignorée** — 4ᵉ/58 en départementale ≈ 4ᵉ/58 en Coupe de France (à ×0,93 près). Un fermier de petits champs (que des victoires contre ~10 anonymes) peut dépasser un régulier national qui affronte l'élite. Le coef de niveau (±5 %) ne corrige pas ça.
2. **Petits échantillons bruyants** — 2 courses gravent un indice définitif (ex. 844 sur 2 engagements), sans régression vers la moyenne.

Contrainte forte (comme la v1) : **aucune régénération des index existants**, calculable avec les données déjà en mémoire + **un seul petit artifact** pré-calculé (forces de classes, §4.1).

## 2. Décisions tranchées (prototype 2026-09-08, à valider)

| # | Question | Décision |
|---|---|---|
| 1 | Forme de l'ajustement | **Additif** : `score = clamp(pass0 + k·(fs − medFs))`, pas multiplicatif (pas de re-saturation au plafond) |
| 2 | k | **0,3** (sensibilité mesurée §7 : monotone, ±50 max observés) |
| 3 | Itérations | **2 passes** (R→fs→scores→R→fs→scores ; \|Δ\| moyen passe1→passe2 < 3 pts, §7) |
| 4 | Centrage | Sur la **médiane annuelle des fs** (`medFs`) : un plateau typique n'ajuste rien (dérive moyenne +1,8 pt, médiane −9 pts) |
| 5 | Périmètre | **Classés seulement** (`rank < 100000`) ; DNF/DNS/DSQ inchangés (pénalité graduée §4.4 v1) |
| 6 | Définition du champ | **Tous les classés de la classe** (moyenne simple) — variante « top-half » écartée : la moyenne simple suffit aux effets mesurés |
| 7 | Portée | Événements **et séries** (plateau d'une série = ses classés, année = règle existante) |
| 8 | Artifact | **Fichier séparé** `field-strength.json` (+ `field-strength.meta.json`), R2, **optionnel** (fallback silencieux = formule v1) |
| 9 | Clé de classe | **Identique à `findClassCompetitors`** : `${accountCode}\|${eventId}\|${perpetualClassCode \|\| className}` (zéro collision FR/UEC, déjà prouvée) |
| 10 | Shrinkage | Sur les **moyennes annuelles** : `(n·mean + m·500)/(n+m)`, **m = 2** (m=1 inutile, m=4 brutal, §7) |
| 11 | Récence | **Abandonnée le 2026-09-08** : le shrinkage stabilise déjà ; pas de pondération temporelle, pas d'affichage « niveau actuel » (la carrière reste la moyenne des moyennes annuelles) |
| 12 | Homonymes | Politique `norm()` existante (même limite que les comparaisons) — documentée, non résolue ici |
| 13 | Mix Cruiser/20" UEC | Sans objet : les plateaux sont **par classe**, jamais mélangés (le regroupement B17+C17 n'existait que dans le protocole de test) |
| 14 | Unités raw côté build (pas de `coefFor`) : le coef s'applique côté client APRÈS ajustement ; double clamp identique des deux côtés (parité testée sur échantillons réels) |
| 15 | Exclusion de soi-même au moment de la lecture (`[fs, n]` + `base_soi`), pas du build — stockage O(classes), exactitude O(1) |

**Encore ouvert (trancher avant implémentation)** : placement exact du « niveau actuel » sur la carte pilote (proposé : Stats uniquement, carte inchangée) ; poids de récence `{1, 0.707, 0.5, 0.354}` (demi-vie 2 ans — valider) ; coût build mesuré à l'implémentation.

## 3. Données

### 3.1 Artifact `field-strength.json` (nouveau, généré)

Produit par `build-index.js` (`field-strength-fr.json`, depuis pilots+uci) et `build-uec.js` (`field-strength-uec.json`), commité en `field-strength-{fr,uec}.meta.json` seules (gros fichiers sur R2 comme les index, 10 fichiers publiés au total) :

```jsonc
{
  "v": 1,                                     // version de format (l'app ignore si != 1)
  "generated": "2026-09-08T03:00:00.000Z",
  "medFs": { "2026": 438, "2025": 440 },      // médiane annuelle des fs (centrage)
  "classes": {
    "ffc|<eventId>|<perpetualClassCode>": [516, 40], // [fs arrondie, n classés notés]
    "uec|<uuid>|B17": [553, 57]
  }
}
```

Unités **raw** (pré-coef — la force vient des identités, pas des coefs ; le coef niveau s'applique côté client APRÈS ajustement). Chaque script couvre sa source (pas de dépendance d'ordre) ; les clés étant namespacées par `accountCode`, le client fusionne les deux fichiers. Volume mesuré : ~13 100 classes FR + ~1 300 UEC ≈ **650 Ko + 70 Ko**. Chargés **en arrière-plan** comme l'UEC (jamais bloquants), clés de cache `https://sqorz.local/cache/field-strength-{fr,uec}.json`.

### 3.2 Algorithme de build (exact, `build-field.js`)

Par année Y (2023+), sur événements + séries, en unités **raw** (blend pré-coef — aucun coef côté build) :

```
raw(e)        = formule v1 sans coef (blend sr × constance [+ chrono], ou pénalité DNF)
base(e)       = clamp(raw)                          // unité des ratings
R0(p)         = moyenne base des engagements classés de p en Y
fs1(classe)   = moyenne des R0 des classés de la classe  (moyenne INCLUSIVE)
adj1(e)       = classé ? clamp(base(e) + 0.3 · (fs1 − medFs[Y])) : base(e)
R1(p)         = moyenne adj1 … ; fs2, adj2 : idem (2ᵉ passe, on stocke [fs2, n])
```

Notes : les ratings sont **annuels** (forme de la saison, pas carrière) ; les DNF participent à `base` mais ni comme référence de plateau (pas de rang valide) ni comme cible d'ajustement (décision 5) ; `medFs[Y]` = médiane des fs de l'année ; `n` = classés notés (pour l'exclusion exacte de soi-même côté client : `fs_excl = (fs·n − base_soi)/(n−1)`, `n = 1` → pas d'ajustement).

### 3.3 Côté client (déjà en mémoire)

- `raw` : calcul existant (`perfEngagement` / `perfSeriesScore`, pré-coef).
- `[fs, n]`, `medFs[Y]` : lus dans `field-strength-{fr,uec}.json` (fallback : pas d'ajustement).
- `n` (engagements/année) : déjà compté (badges « N eng. »).

## 4. Formule

### 4.1 Score d'engagement (classés seulement)

```
fs_excl = n > 1 ? (fs·n − base_soi) / (n − 1) : medFs[année]   // base_soi = clamp(raw)
score_event = clamp(clamp(raw × coef_niveau) + 0,3 · (fs_excl − medFs[année]))
              // fs absent / classe à 1 / DNF → clamp(raw × coef) (v1)
```

`raw` = existant (blend `sr × constance [+ chrono]`, pré-coef). Double clamp identique au build (`SqorzCommon.applyFieldScore`, parité testée). Rien d'autre ne change (DNF §4.4 v1, séries : même ajustement avec le plateau de la série, clé `compte/series:<id>/<code>`).

### 4.2 Moyennes annuelles (shrinkage, m = 2)

```
moyenne_année(Y) = (n·mean(adj) + 2·500) / (n + 2)
```

Appliqué dans `perfLevel` (sqorz_stats) et `computePerfIndex` (category) : badges timeline, Stats « par année », colonne 🏅 — partout où une moyenne annuelle s'affiche. Le `n` affiché (« N eng. ») explique la force du shrinkage. La carrière reste la moyenne des moyennes annuelles (shrinkées).

### 4.3 Exemple chiffré (prototype — Merlin Guigo, UEC 2026, cas d'origine du §7.4 v1)

| Course | Brut | Plateau | A |
|---|---|---|---|
| 11ᵉ/65 (UEC) | 737 | 607 (fort) | 791 (+54) |
| 4ᵉ/58 (UEC) | 951 | 553 | 988 (+37) |
| 3ᵉ/115 (CdF) | 955 | 516 | 981 (+26) |
| 1er/13 (régional) | 842 | 390 (faible) | 830 (−12) |

Moyenne 2026 : 844 → **863**. Les défaites honorables en plateau fort sont boostées, la victoire en plateau faible décotée — symétriquement.

## 5. Affichage

1. **Onglet 📈 Stats** (par niveau) : tableau « par année » inchangé en forme (valeurs shrinkées). Encadré « ℹ️ » : +1 puce (plateau) + renvoi spec.
2. **Carte pilote** : chip carrière inchangé.
3. **Timeline** : badges annuels = moyennes shrinkées (le « N eng. » existant justifie la mécanique).
4. **Category** : colonne 🏅 = carrière shrinkée (même helper).
5. **Comparaison sqorz_stats** : ligne 🏅 hérite du même calcul (shrinkage inclus).

## 6. Implémentation

| # | Tâche | Fichier(s) | Statut |
|---|---|---|---|
| 1 | `build-field.js` : scoring v1 sur slim (unités raw, sans coef) → R annuels → `[fs, n]` + medFs (2 passes), sorties `field-strength-{fr,uec}.json` / `.meta.json` (+ CLI sans crawl) | `build-field.js` (neuf, partagé), `build-index.js`, `build-uec.js` | ✅ |
| 2 | Workflow : publier 4 fichiers de plus sur R2 (10 au total), committer les 2 metas | `.github/workflows/build-index.yml` | ✅ |
| 3 | `SqorzCommon.loadFieldStrength()` + `fieldAdjust`/`applyFieldScore`/`perfShrinkMean` (+ `PERF_FIELD_K/SHRINK_M`) | `common.js` | ✅ |
| 4 | `applyFieldScore` dans `perfLevel` + séries (`fieldKeyOfEvent/Series`, `perfFrField`/`perfUecField`, double clamp §4.1) | `sqorz_stats/index.html`, `category_stats/index.html` | ✅ |
| 5 | Shrinkage `m = 2` dans `perfLevel` + `computePerfIndex` | idem | ✅ |
| 6 | Puces d'aide (plateau, petits échantillons) + exemple année shrinkée | `sqorz_stats/index.html` (renderPerfComponent) | ✅ |
| 7 | Tests : `tests/field-strength.test.js` (consts, fixture `[fs, n]`, parité build/app sur réels, loader, shrinkage) + recette §10 rejouée en chemin production | `sqorz_stats/tests/` | ✅ |
| 8 | Docs : `CLAUDE.md`, `PROJECT-CONTEXT.md`, addendum §10 ici | — | ✅ |

Coût build mesuré : ~1 min pour 265 k engagements (mémoïsé par classe). Coût client : 2 lookups par engagement + ~650 Ko optionnels en cache (FR ; 70 Ko UEC).

## 10. Addendum implémentation (2026-09-08) — recette rejouée en chemin production

Fonctions app extraites + vrais artifacts générés (`field-strength-fr.json` 585 Ko/13 106 classes, `-uec.json` 65 Ko/1 307 classes ; medFs FR 2026 = 438, UEC = 455 ; convergence |Δ| < 2,6 ✓). Vue Global, événements + séries, shrinkage inclus :

| Pilote | v1 carrière (2026) | v2 carrière (2026) |
|---|---|---|
| Merlin | 755 (835) | **766** (852) |
| HEITZ | 725 (775) | **736** (791) |
| POUSSIN | 622 (626) | **633** (645) |
| ROUXEL | 473 (519) | **479** (523) |
| ANJOUBAULT | 597 (364) | **608** (389) |

Fermiers 2026 (≥3 vict., champ moy. < 12) : décotés quand le score est haut et le plateau faible — Sidonie SOCIÉ 620 → 591 (−29), MORVAN 532 → 506, ROLLAND 432 → 410 ; quasi inchangés quand déjà bas ou plateaux mixtes (THIAM 745 → 746, BEGUE 751 → 756). **Médiane 2026 : 474 → 472** (stable ✓).

Écarts vs prototype §7 : normaux (périmètre production = Global + séries + medFs par source + double clamp ; le prototype était événements FR+UEC fusionnés). Direction et ordres de grandeur confirmés partout.

## 7. Calibration (prototype /tmp, index réels 2023-2026, 265 043 engagements)

- **Convergence** : \|Δ\| moyen passe1→passe2 = 1,3–2,5 pts selon l'année ✓ (2 passes suffisent).
- **Neutralité** : ajustement moyen +0,8 à +1,8 pt ; médiane 2026 : 460 → 451 (dérive −9, acceptable).
- **Plateaux mesurés** : régional ~390–460, CdF ~460–525, UEC ~510–610 — la hiérarchie attendue, invisible à la v1.
- **Ancres** (annuel 2026 actuel → A ; carrière histo → avec shrinkage `m = 2`) :
  - Merlin : 844 → 863 ; histo 793 → 775
  - HEITZ : 804 → 830 ; histo 775 → 765
  - POUSSIN : 617 → 644 (victoire régionale 902 → 895 ; 23ᵉ/40 CdF 448 → 483)
  - ROUXEL : 481 → 477 (plateaux faibles, quasi inchangé — cohérent)
  - ANJOUBAULT : histo 616 (saison 2026 faible : 382 — le shrinkage seul ne la masque pas, c'est voulu)
- **Fermiers** (≥3 victoires, champ moyen < 12) : −39 à −48 chacun (ex. 5 vict./5 eng. champ 3,2 : 668 → 620).
- **Sensibilité k** (moyenne 2026) : monotone et douce — Merlin 844/854/860/869, HEITZ 804/819/825/838 pour k = 0/0,2/0,3/0,5 → **k = 0,3**.
- **Sensibilité m** : m=1 quasi inutile, m=4 brutal sur gros n (Merlin n=16 : −73) → **m = 2** (à n=2, divise l'écart à 500 par deux).

## 8. Points restants (recette, non bloquants)

- Variante « plateau = top-half de la classe » : **écartée après mesure le 2026-09-08** (plus dispersée et parfois inversée sur petits champs : top-quart d'une classe de 5 ≈ 728 > top-quart d'un championnat à 106 ≈ 702 — bruit d'outliers ; seuils arbitraires). Rouvrir seulement si des cas limites l'exigent.
- Séries UEC : sans objet (`series: []` côté JSTiming).
- Cache résultats sqorz_stats (V3, matchs *slim*) : pas de bump nécessaire (l'indice est recalculé au rendu, pas stocké).

## 9. Non-objectifs (rappel)

- Pas de TrueSkill/heat-level (cf. maquette /tmp : surconfiance σ sur gros champs, DSQ ignorées, identité FR non fiable — conclusions en AMELIORATIONS) : la force du plateau en capte l'essentiel sans ses coûts.
- Pas de changement DNF/chrono/constance/coefs (v1 + §7.4 intacts).
- Pas de pondération temporelle ni d'affichage « niveau actuel » (abandonné le 2026-09-08 : le shrinkage suffit à stabiliser).
- Pas de recalcul des index existants (nouvel artifact à côté).
