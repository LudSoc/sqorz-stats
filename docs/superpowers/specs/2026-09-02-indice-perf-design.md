# Spec — Indice de performance (par pilote, par année et carrière)

Date : 2026-09-02 · Statut : **✅ IMPLÉMENTÉ** (helpers + Stats + carte pilote + timeline, testé unitairement 22 ✅ et E2E 12 ✅ sur l'index réel)

## 1. Objectif

Calculer un **indice de performance** unique (échelle **0–1000**) par pilote, qui agrège le maximum de signaux disponibles hors-ligne dans les index :

- résultats de **chaque course** (phases) — avec **chrono transpondeur** quand présent,
- résultats d'**événements** (rang final pondéré par le nombre de participants),
- résultats de **championnats/séries** (rang final et points),
- niveau de compétition (Régional / National / UCI),

pour produire un **indice par année** et un **indice carrière** (« général »).

Contrainte forte : **tout est calculable côté client** à partir des données déjà en mémoire (`matches`, `seriesMatches`, matches UCI) — aucune nouvelle donnée ni régénération d'index.

## 2. Décisions tranchées (entretien 2026-09-02)

| # | Question | Décision |
|---|---|---|
| 1 | Forme | **Par année + carrière** (l'indice carrière agrège les années) |
| 2 | Échelle | **0–1000 points** |
| 3 | Affichage | **Pas de sous-vue dédiée** : dans l'**onglet 📈 Stats** de chaque niveau (Global compris), sur la **carte pilote** (indice carrière tous niveaux), et **valeurs par année dans la timeline** (niveau courant) |
| 4 | Pondération niveaux | **Légère** : Régional ×0,9 · National ×1,0 · UCI ×1,15 |
| 5 | Récence | **Aucune** : moyenne simple, tout à poids égal |
| 6 | Signaux | Les **4** : rang+participants (cœur), constance par phase, chrono transpondeur, séries/championnats |
| 7 | Seuil minimum | **Aucun** : toujours calculé (même 1 engagement), avec mention discrète « basé sur N course(s) » |
| 8 | Chrono | **Composant strict** (l'écart vs meilleur de classe intègre le score même s'il abaisse la valeur) |
| 9 | DNF/DNS/DSQ finaux | **Pénalité légère** (≈ 25 % du score max, cf. §4.4) |

## 3. Données utilisées (déjà disponibles)

| Signal | Source | Notes |
|---|---|---|
| Rang final de classe | `match.competitor.rank` | DNF/DNS/DSQ = codes ≥ 100 000 |
| Taille de classe | `match.totalParticipants` (ou `cls.total`) | Base de la pondération |
| Résultats de manches | `competitorRankDetails[].result` | Phases DNF/DNS/DSQ exclues de la constance |
| Chrono | `time` (et `hillTime`/`corner2Time`) | Seulement épreuves transpondeur (CdF U19/U23/Élite, Mondiaux UCI) — champ `tm/ht/ct` déjà en pipeline |
| Niveau | `levelOf(accountCode)` | regional / national / uci |
| Championnats | `seriesRank`, `seriesPoints`, `seriesRankCompetitorEvents[].tallied` | Un classement de série = un « engagement-like » de l'année |
| Année | `event.eventDate` (année) pour événements ; année de la dernière manche comptée pour les séries | |

Briques déjà présentes dans `index.html` et **réutilisées** :

- `percentile(rank, total)` — % simpliste (null si total < 10) : **pas** utilisé pour l'indice (trop restrictif sur petits champs).
- `zScore(rank, total)` — **cœur de la normalisation** : position du rang centrée-réduite sous l'hypothèse uniforme, bornée par ±√3. Utilisé tel quel.

## 4. Formule

Tous les sous-scores sont bornés **[0, 1000]** (clamp), arrondis à l'entier à l'affichage.

### 4.1 Score de rang (cœur, toujours calculé)

Avec `z = zScore(rank, total)` (rank final valide < 100 000, total ≥ 2 ; à défaut total = 2… cas dégradé sans participants → score médian) :

```
score_rang = clamp(500 + 500 · z / √3 , 5, 1000)
```

- 1ᵉʳ d'une grande classe → ≈ 990–1000 ; médiane → ≈ 500 ; dernier → ≈ 5.
- **Pondération participants intrinsèque** : un même rang dans un champ plus grand → z plus grand → score plus haut (5ᵉ/10 ≈ 600, 5ᵉ/50 ≈ 920).
- Exemple réel (CdF 2026, U19 H, 75 pilotes, HEITZ 1ᵉʳ) : z = 1,709 → score_rang ≈ **984** (993 avant le resserrement §7.4).

### 4.2 Constance par phase (multiplicateur ±)

Sur les phases **valides** (résultat < 100 000 ; DNF/DNS/DSQ de phase exclus) :

```
constance      = ½ · (% manches top 4) + ½ · (% finales atteintes)
coef_constance = 0,9 + 0,2 · constance     // ∈ [0.9, 1.1]
```

- Pilote régulier top 4 (constance ≈ 1) → +10 % ; irrégulier (≈ 0) → −10 %.
- « Finale atteinte » = une phase finale **valide** (`result < 100 000`) **ou un rang final classé** (`rank < 100 000`) — proxy nécessaire car certains événements (ex. Mondiaux UCI) ne publient pas les phases de knock-out (même logique que `computeStats.finalsReached`).

### 4.3 Chrono transpondeur (composant strict, pondéré 0,3)

Pour chaque engagement d'épreuve **chronométrée** (pilote et classe ont des `time`) :

```
bestTime(d)   = min des d.tm valables (>0, phases DNF/DNS/DSQ exclues)
piloteBest    = bestTime(phases du pilote)
allBests      = bestTime(phases) de chaque pilote chronométré de la classe   // si < 3 → pas de score chrono
z_log         = ( mean(log(allBests)) − log(piloteBest) ) / écart-type(log(allBests))
score_ch      = clamp(500 + 500 · z_log / √3, 5, 1000)                      // z log → échelle multiplicative
```

Blend (renormalisé pour rester 0–1000) :

```
score_event = ( score_rang · coef_constance + 0,3 · score_ch ) / 1,3
```

Épreuve **sans chrono** → `score_event = score_rang · coef_constance` (pas de composant chrono ; aucun pilote n'est pénalisé de son absence).

**Pourquoi z-log et pas écart linéaire vs meilleur ?** Calibré sur données réelles (18 487 pilotes chronométrés) : l'écart linéaire vs le meilleur temps se tasse dans les 1–2 % (delta moyen **+403 pts** vs score de rang, quasi tous les scores ≥ 850 → biais systématique en faveur des épreuves transpondeur). Le z-score sur log(temps) est **centré sur 500** : delta moyen mesuré **+2,4 pts**, étalement p25/p50/p75 = **−88 / −9 / +82** — un vrai différentiateur strict, sans biais.

Règle de calcul de `bestTime` : mêmes exclusions que les chronos de la timeline (`result >= 100000` et temps ≤ 0 jamais comptés).

### 4.4 Engagement DNF/DNS/DSQ (final)

`rank ≥ 100 000` (ou absent) → **pénalité légère, graduée par la phase la plus profonde atteinte** (la progression, pas le lieu de l'abandon) :

```
score_event = PERF_DNF_SCORES[phase] · coef_niveau

phase   = finale ≈ 700 · demi-finale ≈ 550 · quart ≈ 400 · manche/inconnu ≈ 250
```

- **Un DNF en manche n'est pas éliminatoire** : un pilote peut abandonner une manche et se qualifier quand même pour les phases finales. La pénalité dépend donc de la phase la plus profonde **atteinte** (jusqu'où il est allé), pas de l'endroit où il a abandonné.
- Les phases des non-classés reflètent leur **participation** (vérifié sur données réelles) : un pilote éliminé en manches n'a que ses manches (`M1|M2` — 432 cas à Machecoul), un pilote allé jusqu'en finale a la phase « Final » (`M1|M2|M3|2F|1F` — cas Bolbec). `build-index.js` conserve ces phases dans l'index pour les non-classés (elles étaient filtrées avant, car sans `result`). Si aucune phase n'est renseignée (DNS, aucune donnée) → 250, l'ancienne valeur de base.
- **Pourquoi 700 en finale ?** un pilote classé dernier d'une finale d'un gros champ marquerait ≈ 810 (rang 8/40) : 700 récompense le fait d'avoir atteint la finale tout en restant une pénalité vs un classement. Étages 250/400/550/700, pas de recalibrage global nécessaire (la médiane population reste ≈ 500).
- Non pondéré par les participants (un abandon ne profite pas de la taille du champ). Affiché à part (nb de DNF/DNS dans le dashboard existant, inchangé).

### 4.5 Niveau (coef léger)

```
coef_niveau = 0,9 (régional) · 1,0 (national) · 1,15 (UCI)
```

Appliqué au score d'engagement **avant** clamp.

### 4.6 Séries / championnats

Chaque **classement final de série** du pilote compte comme un engagement de l'année du dernier événement compté (`tallied` ou dernier de `seriesRankEvents`) :

```
score_serie = ( clamp(500 + 500 · zScore(seriesRank, S) / √3, 5, 1000) ) × coef_niveau_des_comptes_de_la_série
```

avec `S` = nombre de pilotes classés dans la classe de série. Utiliser `seriesPoints` pour départager visuellement (non inclus dans le score — corrélé au rang).

### 4.7 Agrégations

```
indice_année   = moyenne( scores des engagements : événements + séries, dont année = Y )
indice_carrière = moyenne( indice_année )          // chaque année pèse pareil (pas de récence, décision #5)
```

- Chaque score de sous-composant est clampé **[5, 1000]** (le coef niveau s'applique **avant** le clamp final — sinon UCI ×1,15 déborde au-delà de 1000).
- Row de calcul en 0 décimales pour l'affichage (comme 997).
- Mention discrète du nb d'engagements derrière chaque valeur (« sur 12 courses »), même en dessous d'aucun seuil (décision #7).
- DNF/DNS/DSQ : score pénalité `250 × coef_niveau` (cf. §4.4), incluse dans les moyennes (année et carrière) — elle tire l'indice vers le bas sans l'écraser.

### 4.8 Exemple de calcul complet (données anonymes)

Pilote fictif **« X »** — niveau **national** (`coef_niveau = 1,0`), saison 2025 avec 4 engagements (3 courses + 1 série). Toutes les valeurs sont arrondies à l'entier comme à l'affichage ; `zScore(rank, total) = (μ − rank)/σ` avec μ = (total+1)/2 et σ = √((total²−1)/12).

**Engagement 1 — course chronométrée, 5ᵉ sur 40** :

```
z = (20,5 − 5)/√133,25 ≈ +1,343
score_rang = 500 + 500 × 1,343/√3 ≈ 888
constance : 3/3 manches top 4 + finale atteinte → 1,0 → coef 0,9 + 0,2 = 1,1
chrono : meilleur temps 35,20 s → z_log = +1,2 → score_ch ≈ 846
score = (888 × 1,1 + 0,3 × 846)/1,3 ≈ (976,8 + 253,8)/1,3 ≈ 946
```

**Engagement 2 — course sans chrono, 12ᵉ sur 30** :

```
z = (15,5 − 12)/√74,92 ≈ +0,404 → score_rang ≈ 617
constance 0,75 → coef 1,05 → score ≈ 648
```

**Engagement 3 — éliminé en manches** (phases `M1|M2` seulement, DNF en manche non éliminatoire mais pas de qualification) : `score = 250 × 1,0 = 250` (pénalité de base §4.4). S'il s'était **qualifié jusqu'en finale** (phase « Final » présente), le score serait `700 × 1,0 = 700` — peu importe que l'abandon ait eu lieu en manche : seul compte jusqu'où il est allé.

**Engagement 4 — série, 4ᵉ sur 25 classés** :

```
z = (13 − 4)/√52 ≈ +1,248 → score ≈ 860
```

**Année 2025** = moyenne des engagements = (946 + 648 + 250 + 860)/4 ≈ **676**.

Même pilote en **2024** (2 courses sans chrono, constance 0,6 → coef 1,02) : 8ᵉ/25 → 714 · 20ᵉ/25 → 224 ⇒ **469**.

**Carrière** = moyenne des moyennes annuelles (§4.7) = (676 + 469)/2 ≈ **573**. Une saison chargée (4 engagements) ne pèse pas plus qu'une saison légère (2) : chaque année compte pour moitié.

## 5. Affichage

1. **Carte pilote (en-tête sticky)** : `🏅 Indice carrière : 872` (tous niveaux) — petit chip discret à côté des stats principales.
2. **Onglet 📈 Stats de chaque niveau** (Global compris) : dans le dashboard, une ligne/composant « 🏅 Indice » avec :
   - indice **carrière du niveau** (ex. National : 890),
   - mini-tableau **par année** (2026 : 940 · 2025 : 812 · …) avec nb d'engagements par année,
   - détail des composants de l'année courante (rang moyen pondéré, constance, chrono moyen, séries) pour la transparence.
3. **Timeline (🏁 Courses, niveau courant)** : badge discret à côté du séparateur d'année : `🏅 940 (12 courses)`.

Pas de nouvelle sous-vue ; pas de radar ni de graphique supplémentaire dans un premier temps (décision #3).

## 6. Implémentation — ✅ FAITE (2026-09-02)

Tout dans `index.html`, côté client, aucune API ni régénération d'index :

| Élément | Détail |
|---|---|
Implémenté dans `index.html` (une seule passe par `render()`) — noms réels :

| Élément | Détail |
|---|---|
| Helpers | `perfScoreRang`, `perfBestTime`, `perfChronoScore`, `perfConstance`/`perfCoefConstance`, `perfEngagement`, `perfSeriesScore`, `perfLevel`, `computePerfIndices` — réutilisent `zScore`, `isMotoPhase`/`isFinalPhase`, `isNotTimedPhase`, `num`, `findClassCompetitors` (mémoïsé) |
| Valeurs | `PERF_LEVEL_COEFS` (0,93/1,0/1,05), `PERF_CHRONO_W` (0,3), `PERF_DNF_SCORE` (250), clamp `perfClamp` [5, 1000], exposant rang `PERF_RANG_EXP` (2,5, §7.4) |
| Rendu | `renderPerfComponent` (onglet Stats, par niveau) ; chip `🏅` sur la carte pilote (`renderPilotCard`, 5ᵉ paramètre = carrière Global) ; badges `🏅 … · N eng.` par année dans `renderTimeline` (3ᵉ paramètre `perfByYear`) ; CSS `.pilot-index` / `.tl-index-badge` / `.perf-year-row` |
| Tests | unitaires (`unit-perf.cjs`, 22 ✅ : extrêmes 5/500/1000, pondération participants, constance, chrono z-log, DNF, coefs+clamp, séries, attribution d'année) + E2E (`e2e-perf.cjs`, 12 ✅ : HEITZ/ANJOUBAULT, chips, Stats, badges) |

Impact taille : **nul** (aucune donnée ajoutée). Impact perf : ~chéap (une passe linéaire par render ; `findClassCompetitors` déjà mémoïsé).

## 7. Calibration sur données réelles — ✅ RÉALISÉE (2026-09-02)

Prototype Node exécuté sur l'index réel complet (211 759 engagements FR valides + séries + index UCI, chronos inclus, `/tmp/sqorz-e2e/chrono-test/calib-perf.cjs`). **Tous les poids proposés ont été confirmés ; deux corrections ont été apportées** :

### 7.1 Corrections issues de la mesure

1. **Bug prototype corrigé** : la constance brute (moyenne 0,594) avait été appliquée au lieu de `0,9 + 0,2·constance` (moyenne ≈ 1,02) — la moyenne population chutait à 329. Après correction : centrée à **505**. La corrélation est saine (front runners constance 0,863 vs peloton 0,355).
2. **Formula chrono changée** : écart linéaire vs meilleur de classe → **z-score log** (cf. §4.3) — élimine un biais mesuré de +403 pts.
3. **Proxy finales** (§4.2) : `rank < 100000` ⇒ finale atteinte, sinon Mondiaux UCI (phases knock-out non publiées) seraient pénalisés.
4. **Clamp final [5, 1000] après coef niveau** (avant clamp, le p95 national débordait à 1023).

### 7.2 Poids validés (données réelles)

| Poids | Valeur | Validation mesurée |
|---|---|---|
| Normalisation rang | `500 + 500·z/√3` | moyenne brute **501** sur 211 759 engagements (0 dérive) ; p10 53 / p25 242 / p50 499 / p75 766 / p95 969 |
| Coef constance | `0,9 + 0,2·constance` | coef moyen ≈ 1,02 ; front runners 0,863 vs peloton 0,355 → multiplicateur bien dirigé |
| Coef niveau | 0,9 / 1,0 / 1,15 | moyennes : Régional **487** · National **532** (avant coef : ≈ 541 vs 532 — champs comparables, le coef reste léger) |
| Chrono | z-log, poids **0,3** | delta moyen **+2,4 pts** (vs +403 avant correction) ; étalement p25/p50/p75 = −88/−9/+82 → différentiateur ±~20 pts après blend |
| DNF/DNS/DSQ | **250 × coef_niveau** | le 250 se situe à ≈ **24ᵉ percentile** de la distribution → pénalité légère, pas d'écrasement |
| Séries | z-score sur S classés | médiane **478**, mean 483 — cohérent (coef régional dominant) |

### 7.3 Indices pilotes (sanction visuelle)

| Pilote | Par année (FR, index chronos — mesuré dans l'app) | Carrière (moyenne des moyennes annuelles, §4.7) | Niveau UCI |
|---|---|---|---|
| **Antoine HEITZ** | 2023 : 778 · 2024 : 697 · 2025 : 912 · 2026 : 930 | **829** | 961 (2 eng. Mondiaux) |
| **Kévin ANJOUBAULT** | 2023 : 843 · 2024 : 699 · 2025 : 871 · 2026 : 421 | **709** | 616 (6 eng.) |
| **Enzo TOPENOT** | (non re-mesuré dans l'app) | ≈ 712 attendu | — |

> Note : les « CARRIÈRE » du prototype de calibration (840 / 750) étaient des moyennes **par engagement** (l'année à 52 eng. pesait plus) ; la spec §4.7 et l'implémentation retiennent la **moyenne des moyennes annuelles** (chaque année pèse pareil) → 829 / 709. Les valeurs par année diffèrent de ±10–20 pts car l'app comptabilise aussi les **séries** dans l'année (ex. HEITZ 2025 : 18 eng. dont 4 sér.).

Coïncide avec le classement intuitif : Élite national HEITZ > ANJOUBAULT > TOPENOT, et Mondiaux ≈ 960–1000 (HEITZ médaillé).

### 7.4 Correctif saturation — ✅ APPLIQUÉ (2026-09-08)

**Constat (recette UEC)** : Merlin Guigo — 2 courses UEC 2026 (11ᵉ/65 éliminé en demie + 4ᵉ/58 en finale) — affichait un indice **1000**. Cause : `sr × constance(×1,1) × niveau(×1,15)` saturait au plafond dès le top ~20 % des gros champs (ex. 11ᵉ/65 : sr 838 × 1,1 × 1,15 → 1000), et le proxy « rang classé ⇒ finale atteinte » offrait le bonus finale aux éliminés en demie dont les phases KO sont publiées (UEC).

**Changements** (code + `category_stats`, même formule) :
- `perfScoreRang` : `500 + 500·(z/√3)^2,5` pour z > 0 (courbe convexe, linéaire sous la médiane) — 4ᵉ/58 ≈ 862 au lieu de 940, 11ᵉ/65 ≈ 689 au lieu de 838 ; 1ᵉʳ grand champ ≈ 984, médiane 500 et bas de tableau inchangés.
- Proxy finale : le rang classé ne vaut « finale atteinte » que **sans phases KO publiées** (`perfHasKnockout` : semi/demi/quart/quarter/1/8/1/16) — les Mondiaux UCI (pas de phases KO) gardent le proxy, les éliminés en demie UEC/FR perdent le bonus.
- `perfCoefConstance` : `0,95 + 0,1·c` ∈ [0,97, 1,05] (bonus/malus deux fois moindre).
- `PERF_LEVEL_COEFS` : 0,93 / 1,0 / **1,05** / **1,05** (bonus international +5 % au lieu de +15 %).

**Effets mesurés** (index réels, chronos inclus) : Merlin Guigo UEC 2026 : 1000 → **844** (737 + 951) ; HEITZ carrière 829 → **759** (2026 : 921 → 817) ; ANJOUBAULT 726 → **629**. Distribution brute des scores de rang (échantillon FR) : médiane **500 inchangée**, p75 750 → 589, p90 901 → 788, p99 984 → 960. Repères conservés : ~500 milieu, 800+ parmi les meilleurs, 900+ niveau mondial.

## 8. Points restants (recette visuelle, non bloquants)

- ~~Poids exacts~~ **✅ Calibrés + implémentés (2026-09-02, §7)** : chrono z-log 0,3 · constance `0,9+0,2·c` · DNF 250 · coefs 0,9/1,0/1,15. Reste : ajustement fin après recette visuelle si besoin (fourchette chrono 0,3–0,4).
- Utiliser aussi `hillTime`/`corner2Time` dans le composant chrono (moyenne des 3 z-scores) ou seulement `time` ? — proposé : `time` seul en v1.
- Format du chip carrière sur la carte pilote et emplacement exact dans le dashboard (ordre des lignes).
- Séries : année d'attribution si une série chevauche le 1ᵉʳ janvier (règle proposée : année de la dernière manche `tallied`).
- UCI : l'indice UCI du pilote (niveau `uci`) est calculé sur `uci-index.json` — vérifier en recette la fusion de la partie UCI dans l'onglet Global (aujourd'hui l'agrégation Global concatène déjà les matches UCI, donc c'est naturel).

## 9. Non-objectifs (rappel)

- Pas de pondération par récence (décidé).
- Pas de sous-vue « Indice » dédiée par niveau (décidé — vit dans l'onglet Stats).
- Pas d'interopérabilité avec les classements UCI officiels : indice maison, comparable **entre pilotes** car normalisé par champ (z-score) et par niveau (coef léger), mais pas étalonné sur une population réelle.
- Pas de changement des index ni du build.