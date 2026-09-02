# Spec — Chronos transpondeur (temps de course)

**Date :** 2026-09-02
**Statut :** Décisions D1–D10 intégrées. **Implémentation complète** : `build-index.js` (tm/ht/ct), `index.html` (`expandIndex` + sous-ligne « ⏱ Chronos »), tests unitaires + E2E (index patché et index réel régénéré). **Reste opérationnel** : la prochaine régénération hebdo (cron) publiera des index contenant les chronos.
**Produit :** `sqorz_stats` (`index.html`, `build-index.js`) — s'applique aussi aux outils frères qui partagent l'index (`sqorz-head2head`, `sqorz-club`…).

---

## 1. Contexte / question

> « Est-ce possible de récupérer les timings lorsque la course est faite avec un transpondeur ? »

Vérifié directement sur l'API publique Sqorz (`https://our.sqorz.com/json/event/{id}`) et la doc officielle (`docs.sqorz.com/reference/APIs-for-Information-and-Results/`) : **OUI** — les épreuves chronométrées par transpondeurs exposent des temps par phase, mais ils sont **jetés au build** de l'index pré-calculé. Cette spec documente les champs et définit la feature « chronos » retenue en entretien.

---

## 2. Décisions validées en entretien (2026-09-02)

| # | Question | Décision |
|---|---|---|
| D1 | Options d'affichage A–D | **B (chronos dans la carte d'événement)** retenue, sous la forme d'une **sous-ligne dédiée par classe** (D5). **A** (puce de phase) écartée au profit de cette sous-ligne ; **C** (stat globale « meilleur temps ») et **D** (graphique d'évolution) **non retenues**. |
| D2 | Stat « meilleur temps » globale | Refusée : *« les temps time et corner2Time n'ont pas d'intérêt en global mais plutôt par course »* → comparer **par épreuve** uniquement. |
| D3 | Métriques à afficher/classer | **Les trois** : `time`, `corner2Time`, `hillTime` — chaque « catégorie de temps » est classée et affichée. |
| D4 | Couverture partielle (classes non chronométrées) | **Rester silencieux** : pas de mention « X/Y manches chronométrées ». |
| D5 | Emplacement du rendu | **Sous-ligne « ⏱ Chronos » dédiée** sous la ligne de classe de chaque carte d'événement de la timeline (pas d'enrichissement des puces de phase). |
| D6 | Population de référence | **Par classe / épreuve uniquement** : un résumé unique par classe — meilleur temps du pilote (sur ses manches chronométrées de la classe à cette épreuve), meilleur temps de la classe, rang du pilote parmi les pilotes chronométrés de la classe. |
| D7 | Format des temps | Valeur API brute à 3 décimales + « s » : **`35.063 s`** (idem pour les splits). |
| D8 | Cache de recherche (localStorage 6 h) | **Inclure les chronos** dans le cache slim (clés courtes `tm`/`ht`/`ct`), pour que les chronos s'affichent aussi depuis le cache. |
| D9 | Unité officielle | Secondes (cohérent avec les valeurs API et les runs BMX Élite ~30-40 s) — **à confirmer** auprès de Sqorz avant mise en prod (non bloquant). |
| D10 | Impact taille | **Build de test d'abord** : mesurer l'impact de `tm`/`ht`/`ct` sur `pilots-index.json` / `uci-index.json` avant d'implémenter le reste. — **✅ Exécuté le 2026-09-02 : impact faible, feu vert** (détails §6.2). |

---

## 3. Découverte — champs de temps dans l'API

### 3.1 Champs par phase (`competitorRankDetails`)

| Champ | Type | Signification | Exemple |
|---|---|---|---|
| `time` | string | Temps de course **complet** (unités : secondes, 3 décimales) | `"35.063"` |
| `hillTime` | string | Temps intermédiaire — ligne « hill » | `"2.628"` |
| `corner2Time` | string | Temps intermédiaire — ligne « corner 2 » | `"20.468"` |

Extrait réel (Championnats de France 2026, U19 Fille — Finale) :

```json
{ "phaseCode": "1F", "phaseName": "Final", "result": 1, "racePosition": 1,
  "hillTime": "2.628", "corner2Time": "20.468", "time": "35.063", "mergedRank": 1 }
```

Les temps apparaissent sur **toutes les phases courues** (Manches, 1/4, 1/2, Finale…). Les noms de lignes (`hill`, `corner2`) dépendent de la config du circuit — les étiquettes affichées seront génériques (« complet », « virage 2 », « hill ») sauf si on étudie `phaseBlockSummaries[].races`.

### 3.2 Champs de diagnostic au niveau événement

- `eventSummary.laps` (booléen)
- `transponderSummary` : `{ transponderScoring, requiredTransponders, missingTransponders }`
- `lowBatteryTransponders[]`, `plateProblems`, `transponderProblems`
- `raceOrder[].startTime` (timestamp ms de départ de course)

### 3.3 Mesures de référence (vérifiées le 2026-09-02)

| Événement | Résultat |
|---|---|
| Championnat du Calvados 2025 (club, `bmx14`) | **Aucun** champ de temps (`transponderScoring: false`) |
| Championnats de France 2026 (`ffc`) | **562 / 1 061** détails de phase avec `time` — classes chronométrées : U19/U23/Élite uniquement |
| Mondiaux UCI 2026 — SAT (`ucibmxworlds`) | **2 401 / 3 829** détails de phase avec `time` |

Tendances : classes « pro »/grand circuit seules ; pas de `time` en cas de DNF/DNS ou transpondeur manquant/déchargé (d'où des totaux non pleins, p. ex. Élite H 56/92).

### 3.4 Temps réel (hors périmètre)

API **LAN** du poste de chrono (« Local Web Services », port 4343) : `getRaceDetails` (`identifyBestTimes`), `getPhaseRankDetail`, Socket.IO `/event/raceSummary`. Réseau local uniquement ; l'API internet `/json/event/{id}` est rafraîchie ~30 s. → hors scope de cette app statique.

---

## 4. Feature retenue

### 4.1 Rendu (dans la timeline Courses, partie concernée)

Chaque **carte d'événement** de la timeline affiche, sous chaque **ligne de classe** où le pilote a au moins une manche chronométrée, une **sous-ligne « ⏱ Chronos »** avec **un résumé par métrique de temps présente** (`time`, `corner2Time`, `hillTime`) :

```
Manche 1 · Final         35.063 s · ⏱ 3ᵉ/12 · meilleur 34.820 s (A. Martin)
```

Concrètement, pour chaque métrique de la classe à cette épreuve :
- **temps du pilote** : son meilleur temps sur ses phases chronométrées de la classe ;
- **rang** : position de ce temps parmi les **meilleurs temps de chaque pilote chronométré** de la classe (ex. `3ᵉ / 12`) ;
- **meilleur temps de la classe** : le meilleur temps absolu enregistré dans la classe sur l'épreuve (toutes manches), avec le nom du pilote si disponible.

Règles :
- Population = pilotes **avec au moins un temps** sur la classe/épreuve (les DNF/DNS sans lecture sont exclus du classement, jamais comptés en 0).
- Agrégation par pilote : **minimum** de ses temps sur la métrique (un pilote peut courir plusieurs manches).
- Égalités : même temps → même rang, puis saut (classement type « compétition ») — à valider en recette sur des données réelles.
- **Aucune comparaison entre épreuves ou pistes différentes** (D2) : pas de stat « meilleur temps » globale dans la carte pilote ni les dashboards.
- Classes sans chrono à l'épreuve → aucune sous-ligne (silencieux, D4).
- Parties : le mécanisme étant branché sur la timeline, il s'applique naturellement aux parties **National** et **UCI** ; Régional n'aura (presque) jamais de données — rien à afficher.

### 4.2 Format de données

1. `build-index.js` → `slimCompetitor` (FR **et** UCI) conserve les champs chrono quand présents, clés courtes :
   - `tm` → `time` · `ht` → `hillTime` · `ct` → `corner2Time`
2. `index.html` → `expandIndex()` mappe les clés courtes vers `time`/`hillTime`/`corner2Time` sur chaque détail de phase.
3. **Cache de recherche localStorage** : inclure les 3 clés dans le stockage slim des résultats (D8) ; penser à bump l'ancienne clé/version du cache au déploiement pour éviter des caches sans chronos.
4. Outils frères consommant l'index : compatibles (champs additionnels seulement).

### 4.3 Pipeline d'implémentation (ordre)

1. ~~**Build de test** (D10)~~ **✅ Fait le 2026-09-02** — mesure réelle exécutée (API Sqorz → re-slim `tm`/`ht`/`ct` sur les événements chronométrés des orgs `ffc` + `ucibmxworlds`, comparaison aux index existants) : **delta brut +1,41 Mo (FR) / +1,04 Mo (UCI), gzip estimé +0,35 Mo / +0,26 Mo — feu vert** (§6.2).
2. ~~`expandIndex()`~~ **✅ Fait le 2026-09-02** (mapping `tm`/`ht`/`ct` → `time`/`hillTime`/`corner2Time`, testé unitairement + E2E).
3. ~~Rendu de la sous-ligne « ⏱ Chronos » dans `renderTimeline`~~ **✅ Fait le 2026-09-02** (helpers `CHRONO_METRICS`/`findClassCompetitors`/`chronoStatsForClass`/`chronoLinesForMatch` + CSS `.chrono-block`/`.chrono-line` ; testé unitairement + E2E avec index patché, et non-régression sur l'index actuel).
4. ~~`build-index.js` (conserver `tm`/`ht`/`ct` dans `slimCompetitor`) + régénération FR/UCI~~ **✅ Fait le 2026-09-02** : les 3 lignes sont dans le dépôt (`build-index.js`), build complet exécuté en copie de test (76,74 Mo FR / 3,81 Mo UCI) et rendu validé E2E sur l'index réel. **Reste** : la régénération hebdo (cron) publiera les index avec chronos ; bump éventuel du cache de recherche au déploiement.

### 4.4 Précautions

- Tout champ interpolé passe par `escape()` (convention XSS).
- Un temps absent n'est jamais affiché comme `0` — rien ou `—`.
- Format d'affichage retenu : `35.063 s` (valeur brute + `s`), même règle pour les splits (D7).
- Le tri/statistiques existants (`computeStats`, percentile…) ne doivent **pas** utiliser les temps.

---

## 5. Fichiers impactés

| Fichier | Changement |
|---|---|
| `build-index.js` | Conserver `tm`/`ht`/`ct` dans `slimCompetitor` (FR + UCI) |
| `pilots-index.json` / `uci-index.json` | Régénérés — **ne jamais éditer à la main** |
| `index.html` | `expandIndex()` (clés courtes → longues) ; sous-ligne Chronos dans `renderTimeline` ; formatage ; clé de cache bumpée |
| `CLAUDE.md` / `PROJECT-CONTEXT.md` | Champs chrono déjà documentés (§ chronométrage + notes slim) — à compléter après implémentation |
| Outils frères | Aucun impact (champs additionnels) |

---

## 6. Points restants

### 6.1 À confirmer (non bloquants)

- Unité officielle de `time`/splits (seconde supposée, D9) — via l'équipe Sqorz ou un événement de référence.
- Libellés des lignes de chrono (`hill`, `corner2`) — étiquettes génériques par défaut.
- Rendu exact de la sous-ligne (une ligne par métrique vs compactée) — à ajuster en recette visuelle.

### 6.2 Mesure d'impact taille — ✅ RÉALISÉE (2026-09-02)

**Méthode** : les événements sans transpondeurs (régions/clubs) sont inchangés par l'ajout — seuls les événements chronométrés le sont (org FR `ffc`, org UCI `ucibmxworlds`). Le build de test a donc re-fetched ces événements sur l'API Sqorz et re-appliqué `slimCompetitor` **avec** `tm`/`ht`/`ct`, en comparant aux mêmes événements dans l'index actuel (sans chrono). Aucune modification du dépôt (copies + scripts dans `/tmp`).

**Couverture chrono mesurée :**

| Index | Événements chronométrés | Détails de phase avec chrono |
|---|---|---|
| FR (`pilots-index.json`) | **53 / 97** de l'org `ffc` (sur 705 au total) | **51 831 / 144 888** (35 %) |
| UCI (`uci-index.json`) | **12 / 12** | **35 227 / 35 683** (99 %) |

**Impact taille :**

| Index | Brut actuel → avec chronos | Δ brut | Gzip actuel → avec chronos | Δ gzip |
|---|---|---|---|---|
| FR | 75,10 → 76,74 Mo | **+1,63 Mo (+2,2 %)** | 9,65 → 10,03 Mo | **+0,39 Mo (+4,0 %)** mesuré |
| UCI | 2,77 → 3,81 Mo | **+1,04 Mo (+37,6 %)** | 0,35 → 0,61 Mo | **+0,26 Mo (+74 %)** mesuré |

**✅ Confirmation par le vrai build complet (2026-09-02)** : build FR + UCI exécuté en local avec `tm`/`ht`/`ct` (copie du `build-index.js` dans /tmp, dépôt intact) — **Δ gzip total +0,65 Mo** (base 10,00 Mo gzip → +6,5 % du poids réseau), proche des estimations (FR réel 0,39 vs estimé 0,35 Mo). Le rendu a été validé en E2E sur cet index réel régénéré (pilote National : 50 lignes chrono ; pilote UCI : 8 lignes — vrais temps, rangs et détenteurs).

Notes :
- Les ~79 Mo cités partout (audit, README) sont le **brut** ; le **réseau réel est ~10 Mo gzip** (pilots) + 0,35 Mo (UCI, chargé séparément).
- Le +74 % relatif UCI concerne un petit fichier optionnel — insignifiant en absolu (0,26 Mo).
- Le seuil « reconsidérer si > 2-3 % » (§6.2 originel) est dépassé en relatif (6,5 % du poids réseau total) mais le delta absolu reste modeste (~0,65 Mo gzip) pour une feature attendue — **feu vert maintenu**.
- Les autres organisations FR (608 événements) ne bougent pas : pas de champs temps dans leurs données.

---

## 7. Hors scope

- API **LAN temps réel** (Socket.IO, `getRaceDetails`/`identifyBestTimes`) — outil séparé éventuel.
- Comparaisons inter-épreuves/pistes, stats globales de temps, graphique d'évolution (D non retenue).
- Données transpondeur (n° de puce, batterie) : non exposées publiquement (diagnostics agrégés seulement).
