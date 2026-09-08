# Intégration JSTiming UEC — `uec-index.json` + onglet « 🇪🇺 UEC »

**Date :** 2026-09-03 — **Statut :** ✅ Implémenté (2026-09-07, addendum en fin de document)

## 1. Contexte et objectif

L'app `sqorz_stats` couvre aujourd'hui **3 niveaux** (📊 Global / 📍 Régional / 🇫🇷 National / 🌍 UCI) alimentés par l'API publique Sqorz (`pilots-index.json` + `uci-index.json`). Les compétitions **UEC** (Coupe d'Europe BMX, Championnats d'Europe) ne sont pas dans Sqorz : elles sont publiées sur **JSTiming** (`results.jstiming.com`), un site de chronométrage distinct qui expose les résultats par manche **avec chronos transpondeur** (Start / Split 1 / Finish) — un niveau de détail supérieur à Sqorz.

**Objectif :** intégrer les données UEC comme **4ᵉ niveau** de l'app :
- un nouvel index pré-calculé `uec-index.json` (format aligné sur l'existant, clés courtes + `expandIndex()`),
- un onglet **« 🇪🇺 UEC »** au même niveau que Régional/National/UCI,
- l'agrégation UEC incluse dans l'onglet **📊 Global**.

Aucune modification des index existants (`pilots-index.json`, `uci-index.json`).

## 2. Constats sur la source JSTiming (vérifiés le 2026-09-03)

### 2.1 Plateforme

- App **Laravel + Inertia.js** (SPA Vue) : chaque page embarque ses données en JSON dans un attribut `data-payload` du HTML — **aucune API JSON dédiée, aucun parsing de PDF** nécessaire (les PDFs listés sont des exports, pas la source).
- **Pas de CORS** → aucun fetch navigateur possible : le crawl se fait **côté script Node** (`build-uec.js`), comme le build actuel.
- `robots.txt` : `User-agent: *` / `Disallow:` → rien d'interdit.
- Requêtes avec `User-Agent` navigateur : 200 OK, pas de rate-limit observé (DELAY_MS=150 recommandé, identique à `build-index.js`).

### 2.2 Endpoints découverts

| Endpoint | Rôle |
|---|---|
| `GET /` | Liste des organisateurs (`organizer.index`) : **UEC** (`99bf5559-…`), UCI, 3-Nations… |
| `GET /{orgUuid}` | Événements de l'organisateur (`organizer.show`) : à venir (`events`) + passés paginés (`pastEvents`, `?page=N`, 15/page, **126 événements UEC au total = 9 pages**) |
| `GET /event/{evUuid}` | Événement, round par défaut (`event.show`) |
| `GET /event/{evUuid}/{roundSlug}` | Événement à un round donné (`round-1`, `lcq`, `116-finals`, `18-finals`, `14-finals`, `12-finals`, `finals`, `overall`, …) |

### 2.3 Structure des données

**Payload Inertia** (attribut `data-payload`, HTML-unescape + `JSON.parse`) :

```json
{ "view": { "component": "event.show", "properties": {
  "event": { "uuid": "…", "name": "UEC BMX European Championships", "start_date": "27-06-2026", "city": "Sarrians", "ioc_code": "fra",
             "rounds": [ { "file": "…", "name": "Round 1", "slug": "round-1", "is_live": "" }, … ] },
  "classOptions": [ { "class_code": "ME", "name": "Men Elite", "subtitle": "24 to 1/4 Finals" }, … ],
  "activeRoundSlug": "round-1",
  "heats": [
    { "id": "11001", "name": "Race 1 Girls 15 year", "class_code": "G15",
      "column_name_rank": "P", "column_name_result": "Time",
      "additional_columns": { "c11_cname": "Start", "c12_cname": "Split 1", "c14_cname": "Finish" },
      "riders": [
        { "id": "  10076737690G", "name": "Paula PALMISTE", "plate": "3", "ioc_code": "est",
          "rank": "1", "result": " 38.822", "qualified": "Q",
          "additional_columns": { "c11": "  2.778", "c12": "  9.197", "c14": " 38.822" }, "team": "" }
      ] }
  ]
}}}
```

**Points critiques :**
- `start_date` au format **`DD-MM-YYYY`** (attention : pas ISO !) → normaliser en `YYYY-MM-DD` pour l'app.
- Les **IDs pilotes sont stables** (`"10076737690G"`) et communs à tous les rounds d'un événement → jointure fiable round↔round.
- Chaque `heat` = une course d'une classe ; le `class_code` identifie la classe (`G15`, `B15`, `MJ`, `MU`, `ME`, `WJ`, `WU`, `WE`…).
- Le round **`overall`** contient un heat par classe avec le **classement final** de l'événement (rank + positions par manche dans `additional_columns.c11/c16/c17/…`).
- Les rounds de course (`moto-1`…`finals`) contiennent un heat par course : `rank` = position dans la course, `result` = **temps d'arrivée**, `c11` = Start (réaction), `c12` = Split 1, `c14` = Finish.
- `button_text_view` distingue le type d'événement : `Results` (courses), `Gate times` (pratique chrono), `Entries` (sans résultats).
- **Aucun endpoint série/classement général multi-manches** (pas de `series`/`standings`) : la sous-vue Championnats de la partie UEC sera vide en v1.

### 2.4 Volume mesuré (1 événement, Championnats d'Europe Sarrians)

| Round | Payload JSON | Heats | Riders |
|---|---|---|---|
| `round-1` | 394 KB | 78 | 582 |
| `finals` | 59 KB | 10 | 80 |
| `overall` | 353 KB | 10 | 582 |

- Brut par événement ≈ **0,8–1,5 Mo** (selon le nombre de rounds avec résultats).
- 126 événements ≈ **100–150 Mo bruts** ; en format slim (clés courtes, sans noms de colonnes répétés) ≈ **estimé 15–40 Mo** — **à mesurer par un build de test avant d'implémenter le reste (D10)**.

## 3. Décisions (entretien du 2026-09-03)

| # | Question | Décision |
|---|---|---|
| D1 | Position de l'onglet UEC | **« 🇪🇺 UEC » entre National et UCI** : `📊 Global · 📍 Régional · 🇫🇷 National · 🇪🇺 UEC · 🌍 UCI` |
| D2 | Agrégation Global | **Oui, Global = tout** (Régional + National + UCI + UEC), badge = total des engagements |
| D3 | Matching pilote | **Hybride nom + ID** : clé `norm(firstName lastName)` pour relier au pilote recherché (comme l'UCI), **ID JSTiming conservé en interne** (`jid`) pour l'identité intra-UEC |
| D4 | Sous-vue Championnats UEC | **Vide en v1** — JSTiming n'expose aucune série ; afficher « aucun championnat » |
| D5 | Événements à indexer | **Courses seulement** (`button_text_view == "Results"`) — ignorer pratiques « Gate times » et pages Entries sans résultats |
| D6 | Chronos UEC | **Mapper sur les libellés existants** : Finish→`time` (« ⏱️ Chrono »), Split 1→`corner2Time` (« ⏱️ Virage 1 »), Start→`hillTime` (« ⏱️ Butte ») — réutilise tout le pipeline chrono existant |
| D7 | Pipeline de génération | **Nouveau script `build-uec.js`** (dédié JSTiming), exécuté par le même workflow GitHub hebdo |
| D8 | Indice de performance | **Oui, coef UEC = ×1,15** (même que UCI) — `PERF_LEVEL_COEFS.uec = 1.15` |
| D9 | Stratégie de crawl | **Crawl complet hebdo avec cache de contenu** (sha256 par URL : ne re-télécharge pas les pages identiques), DELAY_MS=150, retry |
| D10 | Impact taille | **Build de test d'abord** : mesurer `uec-index.json` sur un échantillon puis complet avant d'implémenter l'app (même méthode que la spec chronos) |

## 4. Modèle de données UEC → format slim

### 4.1 Mapping conceptuel

```
Événement JSTiming (ex. "UEC BMX European Cup round 9")  →  event (1 journée)
  └── Classes (class_code : G15, B15, ME…)                →  classes
        └── Riders du round overall                       →  competitors (rank = classement final, total = nb classés)
              └── Résultats par round de course           →  competitorRankDetails (phases)
```

### 4.2 Par événement

1. **Rounds de course** (`round-1`, `moto-1`, `lcq`, `116-finals`, `18-finals`, `14-finals`, `12-finals`, `finals`, …) :
   - pour chaque heat, chaque rider donne une **phase** : `phaseName` = nom du round (ex. « Round 1 », « LCQ », « 1/4 Finals »), `result` = `rank` (position dans la course, < 100 000 ; les DNF/DNS éventuels restent des positions),
   - chronos : `time` = `result` (temps d'arrivée), `corner2Time` = `c12` (Split 1), `hillTime` = `c11` (Start) — D6,
   - on garde `racePosition` si présent (non observé sur les données vues → champ optionnel).
2. **Round `overall`** : fournit le **rank final** du compétiteur dans la classe + `total` = nombre de classés. Si un rider est présent en course mais absent de l'overall (ex. DNS général), on l'inclut quand même avec `rank` = sa meilleure position ou une valeur neutre — **à trancher en implémentation sur données réelles**.

### 4.3 Format slim (`slimUecCompetitor`)

Mêmes clés courtes que `slimCompetitor` de `build-index.js` (+ `jid` nouveau) :

```js
{
  fn: "Paula", ln: "PALMISTE",
  gn: "EST",            // D3-bis : groupName = code pays (ioc_code en majuscules) — pas de club chez JSTiming
  jid: "10076737690G",  // ID stable JSTiming (trim) — identité intra-UEC
  rank: 2,              // classement final de l'événement (round overall)
  plate: "3",
  d: [                  // une entrée par round de course couru
    { n: "Round 1", r: 1, tm: "38.822", ht: "2.778", ct: "9.197" },
    { n: "1/4 Finals", r: 1, tm: "38.1xx", ht: "2.7xx", ct: "9.1xx" }
  ]
}
```

`expandIndex()` existant mappe déjà `fn/ln/gn/d/n/r/tm/ht/ct` → ajouter une ligne pour `jid` → `riderId` (nouveau champ, optionnel, sans impact sur l'existant).

### 4.4 Entrées d'index

```js
{
  generated: "2026-09-03T…Z",
  orgs: [ { accountCode: "uec", accountName: "UEC — Union Européenne de Cyclisme" } ],
  events: [ { account: { accountCode: "uec", accountName: "UEC" },
              event: { eventId: "<uuid JSTiming>", eventName: "UEC BMX European Cup round 9",
                       eventDate: "2026-09-05", eventEndDate: "2026-09-05" },
              classes: [ { className: "Girls 15 year", perpetualClassCode: "G15", total: 41,
                           competitors: [ …slimUecCompetitor ] } ] } ],
  series: []             // D4 : pas de séries en v1
}
```

- `eventId` = UUID JSTiming (stable) ; `eventDate` = `DD-MM-YYYY` → `YYYY-MM-DD` (⚠️ §2.3).
- `perpetualClassCode` = `class_code` (G15, ME…) — permet le regroupement par catégorie comme les autres niveaux.
- Aussi produire `uec-index.meta.json` (sha256, taille, generated) et `uec-index.events.ndjson` (1 événement par ligne) — **alignement total avec `pilots-index` / `uci-index`**.

## 5. Côté app (`index.html`)

### 5.1 Chargement

- Nouvelle variable `uecIndex` ; chargé **en parallèle** dans `loadPilotsIndex()` après `uciIndex`, **optionnel** (`.catch` → `{ events: [], series: [] }` comme l'UCI) :

```js
uecIndex = await loadIndexFile('./uec-index.json', 'index UEC (Europe)', 40_000_000).catch(…);
```

### 5.2 Niveaux

- `LEVELS` : insérer `{ key: 'uec', label: '🇪🇺 UEC' }` **entre `national` et `uci`** (D1).
- `levelData.uec` alimenté depuis `uecMatches` (index d'origine, comme `uciMatches`) — **ne pas passer par `levelOf()`** (qui ne connaît que les comptes FR).
- `levelData.global` : concaténation **des 4 niveaux** (D2).
- `partsAvailable` / `partPref` / mini-sélecteur de comparaison : pilotés par `LEVELS`, aucun changement de logique.

### 5.3 Recherche & matching

- `searchUec(query)` = `searchInIndex(uecIndex, query)` (helper existant, identique à `searchUci`).
- `searchSelected()` : appeler `searchUec`, stocker `lastUecMatches` (+ `lastUecSeriesMatches = []` en v1), les inclure dans le total de hits et dans le cache.
- **Désambiguïsation** : l'autocomplétion affiche déjà `groupName` entre parenthèses — pour UEC ce sera le **code pays** (ex. « EST », « FRA ») au lieu d'un club.
- **Autocomplétion** : `buildNameIndex()` ne scanne que `pilotsIndex`. Proposé : en v1, **laisser l'autocomplétion FR+UCI telle quelle** (les pilotes purement UEC se trouvent via la recherche pleine) ; l'étendre à l'index UEC est un petit ajout si besoin en recette.

### 5.4 Cache de résultats

- `saveResultsCache` / `loadResultsCache` : ajouter `uecMatches` (slim) au payload.
- **`RESULTS_CACHE_VERSION` 2 → 3** (changement de format : nouveau champ + nouvelle source de données).

### 5.5 Chronos

- Aucun changement : `CHRONO_METRICS` existant (time/corner2Time/hillTime) s'applique tel quel, les données UEC étant mappées sur ces 3 clés (D6). `chronoStatsForClass`/`chronoLinesForMatch` fonctionnent sur l'index UEC.

### 5.6 Indice de performance

- `PERF_LEVEL_COEFS` : ajouter `uec: 1.15` (D8).
- `computePerfIndices(levelData)` boucle déjà sur `LEVELS` → l'UEC est automatiquement calculé ; Global l'inclut via `levelData.global`.

### 5.7 Sous-vues de la partie UEC

- **📈 Stats** : dashboard + graphiques — fonctionnent tel quels (mêmes helpers).
- **🏆 Championnats** : vide en v1 (D4) — le panneau affichera « aucun championnat ».
- **🏁 Courses** : timeline UEC — fonctionne tel quel (phases + chronos).

### 5.8 Service worker & PWA

- `service-worker.js` : ajouter `'uec-index.json'` à `NO_CACHE` (comme `pilots-index.json`/`uci-index.json`).

## 6. Pipeline de génération (`build-uec.js`, D7)

### 6.1 Déroulement

```
1. GET /              → trouver l'orga « UEC » (uuid 99bf5559-…)
2. GET /{orgUuid}?page=1..N
   → collecter les événements passés + à venir, filtrer button_text_view == "Results" (D5)
3. Pour chaque événement :
   a. GET /event/{evUuid}        → event meta + rounds (slugs)
   b. GET /event/{evUuid}/overall → classes + classements finaux (rank, total)
   c. Pour chaque round de course (moto-1…finals) :
      GET /event/{evUuid}/{slug} → heats → phases + chronos (jointure par rider id)
   d. Assembler : competitors par classe, details par round
4. Slim + meta + ndjson → uec-index.json / uec-index.meta.json / uec-index.events.ndjson
```

### 6.2 Robustesse

- **Cache de contenu** (D9) : répertoire de cache (ex. `/tmp/uec-cache` ou `.cache/uec`) indexé par URL ; clé = sha256 du corps HTTP → ne re-télécharger que les pages modifiées. Le workflow hebdo refait un crawl complet mais saute les pages identiques.
- `DELAY_MS = 150` + retry ×3 avec backoff ; `User-Agent` navigateur ; tolérer les erreurs par événement (`continue`) comme `build-index.js`.
- Nombre de requêtes : ~126 événements × (1 overall + ~6–8 rounds) ≈ **900–1100 requêtes** ; avec cache, le delta hebdo est minime.
- **Filtre round** : ne scraper que les rounds utiles — ignorer les rounds dont tous les `file` sont des PDF d'entrées et les slugs de pratique ; ne garder que ceux avec des heats.

### 6.3 Workflow GitHub

- Étendre `.github/workflows/build-index.yml` : après `node build-index.js`, exécuter `node build-uec.js` et committer aussi `uec-index.json uec-index.meta.json uec-index.events.ndjson`.

## 7. Tests

### 7.1 Unitaires (helpers extraits, comme les specs chronos/indice)

- Parsing payload JSTiming → structure slim correcte (échantillon réel figé).
- Conversion `DD-MM-YYYY` → `YYYY-MM-DD`.
- Jointure rider par ID entre `overall` et les rounds (même `jid`, casse, trim).
- Mapping chronos c11/c12/c14 → ht/ct/tm.
- `expandIndex` : `jid` → `riderId`, non-régression des champs existants.

### 7.2 E2E navigateur (index réel)

- Pilote français avec UEC (ex. un coureur de la Coupe d'Europe) : onglet 🇪🇺 UEC visible, timeline + chronos rendus, indice 🏅 inclut l'UEC, Global = somme des 4 niveaux.
- Pilote sans UEC : aucun onglet UEC (masqué, comme l'UCI).
- Bascules d'onglets, cache V3, 0 erreur JS.

### 7.3 Non-régression

- Pilotes de référence existants (HEITZ, ANJOUBAULT, TOPENOT) : valeurs inchangées hors ajout de l'UEC dans Global/indice.
- L'app doit fonctionner si `uec-index.json` est absent (optionnel).

## 8. Recette / calibration (D10)

1. **Build de test** : scraper 2–3 événements UEC (1 Coupe, 1 Championnats d'Europe) → mesurer la taille slim par événement, extrapoler les 126 événements, valider le volume (objectif < 40 Mo).
2. Vérifier sur les données réelles : riders présents en course mais absents de l'overall (DNS général ?), positions DNF dans les heats, classes sans overall.
3. Valider l'indice 🏅 UEC sur un pilote médaillé européen (ordre intuitif, coef 1,15 vs 1,0 national).
4. Recette mobile : poids de chargement supplémentaire (index UEC téléchargé en parallèle, progress bar).

## 9. Plan d'implémentation

| # | Tâche | Fichier |
|---|---|---|
| 1 | Build de test UEC (échantillon + extrapolation) | `build-uec.js` (prototype) |
| 2 | Script complet `build-uec.js` (crawl + cache + slim + meta/ndjson) | `build-uec.js` |
| 3 | Workflow : exécuter `build-uec.js` + committer les 3 fichiers | `.github/workflows/build-index.yml` |
| 4 | `expandIndex` : mapping `jid` → `riderId` | `index.html` |
| 5 | Chargement parallèle `uecIndex` (optionnel) | `index.html` |
| 6 | `LEVELS` : insérer 🇪🇺 UEC entre national et uci | `index.html` |
| 7 | `searchUec` + `lastUecMatches` + Global 4 niveaux | `index.html` |
| 8 | Cache résultats V3 + `uecMatches` | `index.html` |
| 9 | `PERF_LEVEL_COEFS.uec = 1.15` | `index.html` |
| 10 | `NO_CACHE` : ajouter `uec-index.json` | `service-worker.js` |
| 11 | Tests unitaires + E2E + non-régression | — |
| 12 | Docs (`CLAUDE.md`, `PROJECT-CONTEXT.md`, addendum ici) | — |
---

## 10. Addendum implémentation (2026-09-07)

### 10.1 Ce qui a été livré

| # | Tâche | Statut | Notes |
|---|---|---|---|
| 1 | Build de test (échantillon + extrapolation) | ✅ | `--limit 3` : 3 événements, slim moyen **46 Ko/événement** → extrapolation **≈ 5,8 Mo** pour ~130 événements (très en dessous de l'objectif 40 Mo) |
| 2 | Script complet `build-uec.js` | ✅ | Crawl + cache de contenu `.cache/uec/` (sha256 + ETag conditionnel) + slim + meta/ndjson ; CLI `--limit N`, `--match SUBSTR`, `--no-cache` |
| 3 | Workflow GitHub | ✅ | `build-uec.js` exécuté après `build-index.js` ; 6 fichiers publiés sur R2 ; metas commitées |
| 4 | `expandIndex` : `jid` → `riderId` | ✅ | Optionnel, non-régression vérifiée |
| 5 | Chargement `uecIndex` | ✅ | `loadIndexCached` (cache client meta.json), optionnel, `estimatedSize: 8_000_000` |
| 6 | `LEVELS` + 🇪🇺 UEC | ✅ | Entre national et uci (D1) |
| 7 | `searchUec` + Global 4 niveaux | ✅ | `lastUecMatches` + `lastCompareUecMatches` ; Global = concat des 4 niveaux (D2) |
| 8 | Cache résultats V3 | ✅ | `RESULTS_CACHE_VERSION = 3`, champ `uecMatches` |
| 9 | `PERF_LEVEL_COEFS.uec = 1.15` | ✅ | D8 |
| 10 | `NO_CACHE` service worker | ✅ | `uec-index.json` ajouté |
| 11 | Tests | ✅ | `node --test tests/uec-parse.test.js` (9 tests : dates, noms, phases, colonnes chrono, temps, payload Inertia) + `node tests/e2e-uec.js` (IIFE exécuté avec index réels : recherche UEC, rendu 5 parties, chronos, 🏅, non-régression FR) |
| 12 | Docs | ✅ | `CLAUDE.md`, `PROJECT-CONTEXT.md`, présent addendum |

### 10.2 Écarts et découvertes sur les données réelles (§4.2/D10)

- **Classes 6-10 ans sans overall** : les heats overall des classes `B06`–`B10` portent `column_name_rank: "G"` et des ranks **vides** (pas de classement général publié). Décision tranchée (§4.2) : ces pilotes sont inclus avec leurs phases mais **sans `rank`** — l'indice de performance applique la pénalité graduée (`perfDeepestPhase`) et `computeStats` les compte comme non-classés. Vérifié : 18/18, 10/10… pilotes concernés sur l'événement test.
- **Slug `moto-2lcq`** : la page contient **toutes** les manches 2 de toutes les classes (44 heats, zéro heat nommé « LCQ ») — le LCQ n'est qu'une étiquette de round. On nomme donc toutes les courses de cette page « Moto 2 » (détecteur `isMotoPhase` de l'app correct).
- **Chronos** : seulement ~35 % des heats portent `c11_cname`/`c12_cname`/`c14_cname` (classes 15+, Junior, U23, Élite). Les colonnes sont suivies par **libellé** (`Start`/`Split 1`/`Finish`) et non par position, pour résister aux changements de clés.
- **`parseName`** : JSTiming met le nom de famille en capitales (« Eddy CLERTE », « Tom VAN DER BERG », « Kay WÅGBØ ») — découpage sur la suffixe tout-capitales (Unicode), fallback dernier jeton.
- **`parsePayload`** : unescape dans l'ordre `&quot;` → `&#039;` → `&lt;` → `&gt;` → `&amp;` (en dernier, pour ne pas casser les entités doubles).
- **Petite finale** : détectée par le nom du heat (« B-final », « petite finale ») avant la règle du slug → `phaseName = "Petite finale"` (non comptée comme finale par `isFinalPhase`).
- **Volume final** : ~130 événements ≈ 5,8 Mo slim (vs 15-40 Mo estimés) — les chronos et phases tiennent en clés courtes.

### 10.3 Reste à faire (v2 éventuelle)

- Autocomplétion étendue à l'index UEC (§5.3 : laissée FR-only en v1, les pilotes purement UEC se trouvent par recherche pleine).
- Sous-vue Championnats UEC : toujours vide (D4) tant que JSTiming n'expose pas de séries.
- Recette mobile sur l'index complet après la première régénération hebdo (poids de chargement réel, barre de progression).
