# Spec — Séparation Régional / National / UCI

**Date :** 2026-09-02
**Statut :** Brouillon — validé en entretien (décisions D1–D12 ci-dessous)
**Produit :** `sqorz_stats` (`index.html`)
**Périmètre :** vue pilote (résultats d'une recherche), structure de navigation, partition des données. Aucun changement de données/index (`pilots-index.json`, `uci-index.json` intouchés).

---

## 1. Problème

Aujourd'hui, la fiche pilote est organisée en 4 onglets :

- **📈 Stats** — dashboard + graphiques sur **tout** le périmètre France (régional ET national mélangés) ;
- **🏆 Championnats** — toutes les séries France, mélangées ;
- **🏁 Courses** — timeline de tous les événements France, mélangés ;
- **🌍 UCI** — seul onglet déjà « par niveau », mais il empile dashboard + courses + championnats dans un seul panneau sans sous-navigation.

Un pilote Élite court en Coupe de France / Championnats de France (national) **et** en coupes régionales : ses stats, séries et timeline mélangent les deux niveaux sans possibilité de les distinguer.

**Objectif :** séparer complètement les trois niveaux — **Régional**, **National**, **UCI** — et donner à **chaque niveau ses propres catégories Stats, Championnats, Courses**.

---

## 2. Constats sur les données (vérifiés dans `pilots-index.json`, généré le 2026-08-24)

L'index FR contient **705 événements** et **108 séries**, répartis sur **34 organisations qui publient des résultats** (années 2023→2026).

La classification par **organisation organisatrice** est propre et sans ambiguïté :

| Niveau | Organisations (accountCode) | Événements | Séries |
|---|---|---|---|
| **National** | `ffc` (FÉDÉRATION FRANÇAISE DE CYCLISME) + zones `ffcbmxne`, `ffcbmxno`, `ffcbmxso`, `ffcbmxsudest` (FFC BMX NORD/SUD EST, NORD/SUD OUEST) — **5 comptes** | **185** | **35** |
| **Régional** (ligues, comités départementaux, clubs) | 29 autres comptes (COMITE HAUTS-DE-FRANCE, CRPDL BMX, COMITE OCCITANIE FFC, BMX REGION SUD, BMX NORMAND, BMX BOURGOGNE FRANCHE COMTE, comités CD28/CD37/CD45/CD61…, clubs, etc.) | **520** | **73** |

Vérifications effectuées :

- Les 4 zones (`ffcbmx*`) organisent les manches des séries **nationales** FFC (Challenge France NO/NE/SO/SE, CPP Challenge France, Club Performance, Club Jeunes…) — leurs événements alimentent uniquement des séries du compte `ffc`.
- **Aucune** série non-FFC ne référence un événement d'une org nationale (0 croisement), et inversement.
- Contenu des orgs nationales : CDF (Coupe de France), Championnats de France, TFBMX, Challenge National, rounds « Ch. Fr. » / « Challenge France BMX » / « Sud-Est »…
- Contenu des orgs régionales : « Championnat régional », « Coupe régionale / Coupe de Normandie / Coupe du Centre / CNE / TGE… », « Championnat départemental », « Challenge 37/45… », trophées de clubs.
- Index UCI (`uci-index.json`) : 1 seule orga (`ucibmxworlds`), **aucune série** (`series: []`) — uniquement des événements Mondiaux / World Challenge.

> Conclusion : la règle « compte d'organisation ∈ {5 comptes FFC} → National, sinon France → Régional » classe 100 % des données FR sans chevauchement. L'UCI est séparé par construction (index distinct).

---

## 3. Décisions validées en entretien

| # | Décision | Choix |
|---|---|---|
| D1 | Structure de navigation | **Niveaux d'abord** : onglets de parties en tête, puis sous-vue Stats / Championnats / Courses à l'intérieur de chaque partie. |
| D2 | Contenu de « Régional » | **Tout le non-FFC France** (ligues + comités départementaux + clubs) — 3 parties au total : Régional, National, UCI. |
| D3 | Règle de classification | **Liste statique de 5 codes d'orga dans l'app** (`index.html`), à l'exécution — pas de régénération d'index, pas de changement de schéma. |
| D4 | Parties sans données | **Masquées** (comportement actuel de l'onglet UCI) : un onglet de partie n'apparaît que si le pilote a des résultats à ce niveau. |
| D5 | Championnats UCI | **Masqués** quand vides (l'UCI n'a aucune série) — la sous-vue Championnats n'apparaît pas dans la partie UCI. |
| D6 | Carte pilote (en-tête) | **Globale et fixe** : compteurs/badges calculés sur toute la carrière, indépendants de la partie affichée. |
| D7 | Partie par défaut & mémoire | **Mémoriser le dernier choix** (localStorage) ; **défaut = Régional**. |
| D8 | URL partagée | **Aucun changement** : la partie ne va pas dans l'URL, elle vit en localStorage uniquement. |
| D9 | Filtres (année / tri) | **Barre globale unique** au-dessus des résultats, qui s'applique à la partie et à la sous-vue actives. |
| D10 | Comparaison 2 pilotes | **Par partie via mini-onglets** : la section comparaison suit la même logique de niveaux avec un sélecteur Régional / National / UCI. |
| D11 | Compteurs | **Badges d'engagements sur les onglets de parties** (ex. « Régional (152) »). |
| D12 | Navigation interne & pliage | **2ᵉ rangée d'onglets** (même style que la rangée principale) pour Stats / Championnats / Courses ; **suppression des boutons Masquer/Afficher** (et de leur état localStorage). |
| D13 | Libellés des onglets de parties | **🗼 Régional** (emoji « France dessinée » — tour Eiffel) · **🇫🇷 National** (drapeau) · **🌍 UCI** (globe, inchangé). Constante `LEVELS` → facile à remplacer en une ligne. |
| D14 | Mémorisation de la sous-vue | **Non** : à chaque arrivée dans une partie, on retombe sur **Stats** (comportement simple et prévisible). Seule la partie elle-même est mémorisée (D7). |
| D15 | En-tête sticky sur mobile | **Hybride responsive** : desktop = tout sticky (carte + 2 rangées, comme aujourd'hui) ; mobile = **seule la rangée 1 (parties) reste sticky**, la rangée 2 et la carte défilent. |
| D16 | Mini-sélecteur H2H | À l'ouverture de la comparaison, le mini-sélecteur **reprend la partie active de la fiche, puis devient indépendant** (re-sync à chaque nouvelle recherche de pilote). |

---

## 4. Architecture cible

### 4.1 Arborescence de la vue pilote

```
[picker d'homonymes éventuel]
[Carte pilote globale]                    ← D6, inchangée
[Rangée 1 — parties]  🗼 Régional (152) | 🇫🇷 National (28) | 🌍 UCI (4)   ← D1, D11, D13
[Rangée 2 — sous-vues de la partie active] 📈 Stats | 🏆 Championnats | 🏁 Courses
[panneau = sous-vue active de la partie active]
```

- **Rangée 1 (parties)** : `data-part-btn` / valeur `regional | national | uci`. Badge = nombre d'engagements du pilote à ce niveau (**D11**, filtres année appliqués, cf. §6.2).
- **Rangée 2 (sous-vues)** : affichée uniquement si la partie active contient plus d'une sous-vue non vide ; sinon le contenu est montré directement (ex. partie UCI = seulement Stats + Courses → pas de rangée 2 si une seule sous-vue existe).
- Ordre des sous-vues : **Stats, Championnats, Courses** (tel que listé dans la demande). Défaut à l'arrivée dans une partie : **Stats**. Non mémorisé.
- Ordre des parties : **Régional, National, UCI** (ordre de la demande).
- Libellés : **🗼 Régional · 🇫🇷 National · 🌍 UCI** (D13) — emoji distinct pour Régional (« France dessinée ») afin d'éviter deux drapeaux identiques côte à côte.

### 4.2 Sous-vues par partie

| Sous-vue | Contenu | Visible si |
|---|---|---|
| 📈 Stats | Dashboard `renderStatsDashboard(stats)` + graphiques `renderCharts(matches)` **recalculés sur les seuls matches du niveau** (avec les titres/`meta` actuels « X engagement(s) ») | le pilote a ≥ 1 engagement d'événement à ce niveau |
| 🏆 Championnats | `renderChampionships(seriesMatches)` sur les **seules séries du niveau** | le pilote a ≥ 1 classement de série à ce niveau (**D5** : jamais dans l'UCI, index sans séries) |
| 🏁 Courses | `renderTimeline(sortedEvents, pilotColor)` sur les **seuls événements du niveau**, tri selon le tri global | le pilote a ≥ 1 engagement d'événement à ce niveau |

Titres de section proposés (à décliner dans le code, l'esprit = même style qu'aujourd'hui) :
- Stats : `📈 Stats <meta>synthèse sur X engagement(s) régionaux/nationaux/internationaux</meta>`
- Courses : `🏁 Courses <meta>Y événement(s) · {libellé du tri}</meta>`
- Championnats : en-tête `🏆 Championnats <meta>Z classement(s)</meta>` avant la grille de cartes (aujourd'hui les cartes n'ont pas d'h2 parent dans l'onglet).

### 4.3 État & re-rendu

- `renderFiltered()` continue de filtrer année (`yearSel`) et appliquer le tri (`sortSel`) sur les matches/séries **avant** le découpage par niveau → les parties vides après filtre année disparaissent (cohérent avec **D4**, cf. note §6.2).
- Changer de partie ou de sous-vue = re-rendu local des panneaux (mêmes mécanismes `data-*` + classes `.active` que les onglets actuels), **sans** re-scan des index (les matches sont déjà en mémoire : `lastMatches`, `lastSeriesMatches`, `lastUciMatches`, `lastUciSeriesMatches`).
- Clé de mémorisation partie : `partPref` (`'regional' | 'national' | 'uci'`), défaut `'regional'` (**D7**). Au premier rendu, si la partie mémorisée est absente (pas de données), repli sur la première partie disponible.

---

## 5. Partition des données (cœur de l'implémentation)

### 5.1 Fonctions

```js
// D3 — les 5 comptes FFC qui organisent le niveau national (vérifié sur données 2023-2026)
const NATIONAL_ACCOUNTS = new Set(['ffc', 'ffcbmxne', 'ffcbmxno', 'ffcbmxso', 'ffcbmxsudest']);
const LEVELS = [
  { key: 'regional', label: '🗼 Régional' },    // emoji « France dessinée » (D13 — facile à changer ici)
  { key: 'national', label: '🇫🇷 National' },
  { key: 'uci',      label: '🌍 UCI' },
];
// Niveau d'un match/série FR d'après son compte organisateur.
// Les données UCI étant un index séparé, elles sont traitées à part (niveau 'uci').
function levelOf(accountCode) {
  return NATIONAL_ACCOUNTS.has(accountCode) ? 'national' : 'regional';
}
```

À chaque rendu de pilote actif (dans `render()` ou un helper `partitionByLevel(primaryMatches, primarySeriesMatches, uciMatches, uciSeriesMatches)`), produire :

```
regional:  { events: Match[], series: SeriesMatch[], stats, eventGroups, sortedEvents }
national:  { … idem … }
uci:       { events: primaryUciMatches, series: primaryUciSeriesMatches, stats, … }
```

Le `computeStats` actuel est déjà générique et réutilisé tel quel (aucune modif de logique métier : victoires, podiums, top8, DNF/DNS/DSQ par phases, finales, manches, gates, percentiles…).

### 5.2 Points d'attention

- **Ne pas classifier par `accountName`** (casse/accent/abréviations variables) mais par `accountCode` (stable). Le code est déjà présent sur chaque `m.account` et `sm.account` (événements comme séries).
- Ne pas oublier les **séries** : leur niveau est celui de `sm.account.accountCode` (les séries régionales ne référencent jamais d'org nationale, vérifié).
- Si l'API Sqorz faisait apparaître un nouveau compte national à l'avenir (nouvelle zone, nouvelle orga FFC), il faudra l'ajouter à `NATIONAL_ACCOUNTS` — à noter en commentaire dans le code + dans `PROJECT-CONTEXT.md`.
- Les données UCI restent identifiées par l'index d'origine (`lastUciMatches`), pas par `levelOf('ucibmxworlds')` (qui renverrait `regional` !).

---

## 6. Comportements & cas limites

### 6.1 Parties et sous-vues vides (**D4, D5**)

- Un onglet de partie est rendu ssi le pilote actif a **≥ 1 engagement** (événement ou série) à ce niveau sur les données filtrées.
- Dans une partie affichée, une sous-vue n'apparaît que si elle a du contenu (en particulier : **pas d'onglet Championnats dans l'UCI**, l'index n'a pas de séries). Si une seule sous-vue existe, on affiche son contenu directement.
- Pilote 100 % régional → onglets : `Régional (n)` seulement (National et UCI absents, comme aujourd'hui l'onglet UCI disparaît sans résultats UCI).
- Pilote Élite avec Mondiaux → les 3 parties apparaissent.

### 6.2 Filtre année et tri (**D9**)

- Barre `#resultsFilters` (année + tri) inchangée, unique, au-dessus des résultats.
- `renderFiltered` filtre d'abord tous les matches/séries (FR + UCI), puis `render` partitionne → les badges de parties et la visibilité des parties reflètent l'année sélectionnée (une partie vidée par le filtre disparaît ; elle réapparaît quand on revient sur « Toutes les années »). Noter que les compteurs d'onglets actuels (Courses, Championnats, UCI) ont déjà ce comportement : cohérent.
- Le tri (`sortSel`) s'applique aux sous-vues Courses de chaque partie (mécanisme existant `sortedEvents` généralisé).

### 6.3 Carte pilote globale (**D6**)

`renderPilotCard(...)` et ses compteurs restent calculés comme aujourd'hui sur l'ensemble des matches du pilote (FR, repli UCI) : l'en-tête ne bouge pas quand on change de partie.

### 6.4 Comparaison 2 pilotes par partie (**D10**)

La carte « comparer » (`#compareResults`, rendue par `renderCompareSection`) affiche en tête un **mini-sélecteur de parties** (même style que la rangée 1 : Régional / National / UCI), puis le bilan H2H restreint au niveau choisi :

- **Niveaux FR** (Régional / National) : partitionner les matches du pilote A (`primaryMatches`) et du pilote B (`lastCompareMatches`, déjà issus de `searchLocal`) avec `levelOf()`, puis appliquer la logique existante (mêmes événements, même classe, rangs finaux valides, tableaux des confrontations, filtre catégorie…).
- **Niveau UCI** : il faut les matches UCI du pilote B → `searchCompare()` doit aussi lancer `searchUci(query)` et conserver `lastCompareUciMatches` (même traitement que la recherche principale). Bilan sur l'intersection des événements UCI. **Limitation à documenter** : l'UCI n'a pas de gestion d'homonymes par club (le `groupName` UCI = code pays) — la disambiguation existante par club ne s'applique pas ; on compare par clé `norm(firstName lastName)`.
- Initialisation : le mini-sélecteur démarre sur la partie active de la fiche pilote, puis devient indépendant.
- États vides : si l'un des deux pilotes n'a aucun résultat au niveau choisi (ou aucun affrontement direct), message explicite type « Aucune confrontation à ce niveau » (reprendre les libellés actuels en les contextualisant).
- Le bouton ⚡ Comparer reste global (il n'est pas déplacé dans une partie).

### 6.5 Suppression des boutons Masquer/Afficher (**D12**)

Conséquences à intégrer au refactor :

- Retirer les boutons `section-toggle` des blocs Stats (`statsWrap`/`chartsWrap`), Championnats (`seriesWrap`, `uciSeriesWrap`) et Courses (`historyWrap`/`uciWrap`).
- Retirer `sectionState`, `applySectionVisibility()` et les clés localStorage `statsHidden`, `chartsHidden`, `seriesHidden`, `historyHidden`, `uciHidden`.
- Le passage Stats ↔ Championnats ↔ Courses se fait désormais par les onglets de la rangée 2.
- Simplifier l'option `noToggle` de `renderChampionships`.

### 6.6 Divers conservés tels quels

- Picker d'homonymes et clé pilote (`norm(firstName lastName)`) inchangés (l'identité est globale ; seuls les contenus sont partitionnés).
- Cache des résultats (localStorage 6 h), autocomplétion, thème, recherche récente, liens Sqorz/H2H/Club, `humanError`, skeleton, barre de progression : **inchangés**.
- Ligne de statut après recherche : conserver le format actuel ; **optionnel** : ventiler « X résultat(s) · dont Y régionaux, Z nationaux, W UCI » (non retenu — garder simple).

---

## 7. Implémentation pressentie (index.html uniquement)

| Zone du fichier | Changement |
|---|---|
| Helpers (~l.1300) | Ajouter `NATIONAL_ACCOUNTS`, `LEVELS`, `levelOf(accountCode)`, `partitionByLevel(...)`. |
| `renderFiltered()` (~l.1832) | Inchangé (filtre année global), puis partition dans `render()`. |
| `render()` (~l.3147) | Construire les parties → `partPanels` ; rangée 1 (parties + badges) ; rangée 2 (sous-vues de la partie active) ; panneaux imbriqués `[data-part]` / `[data-sub]` ; appliquer `partPref`. |
| Gestionnaire de clics (~l.3356) | Gérer `[data-part-btn]` (mémorise `partPref`) et `[data-subtab-btn]` ; supprimer la boucle `sectionState`. |
| `renderStatsDashboard` / `renderCharts` / `renderChampionships` / `renderTimeline` / `renderUciPanel` | Réutilisés ; `renderUciPanel` disparaît au profit du rendu générique par partie (l'UCI devient une partie comme les autres, sans sous-vue Championnats). |
| `renderPilotCard` | Inchangée (globale). |
| `renderCompareSection` / `searchCompare` | Mini-sélecteur de parties + partition (`lastCompareUciMatches` ajouté). |
| CSS | Styles de la 2ᵉ rangée d'onglets (réutiliser `.tab-btn`/`.tabs-nav`) + éventuel état compact. Sticky hybride (D15) : desktop = bloc entier sticky (comportement actuel) ; breakpoint mobile = seule la rangée 1 (parties) sticky, carte et rangée 2 défilent (media query existante ~760 px). |

Contraintes transverses (rappel des conventions du projet) :

- Un seul fichier : `index.html` (HTML/CSS/JS inline, gros IIFE). **Aucun** changement à `build-index.js`, aux index JSON, au worker, au service worker, ni aux outils frères (ils partagent le même index non modifié).
- Toute donnée interpolée passe par `escape()` ; `norm()` pour toute comparaison.
- Accessibilité : `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, `aria-controls`/`aria-labelledby` sur les **deux** rangées (le projet doit d'ailleurs compléter ces attributs — cf. audit §E1) ; ids DOM uniques pour chaque partie/sous-vue (suffixer par la partie, ex. `stats-regional`, `series-national`).
- Ne pas casser le flux streaming/parse des index ni le cache de recherche.

## 8. Scénarios de validation manuelle (après implémentation)

1. **Pilote 100 % régional** (ex. un jeune U9 d'un club) : une seule partie « Régional (n) » ; Stats/Championnats/Courses régionaux ; rien d'autre.
2. **Pilote Élite national** (CDF + Championnats de France, sans Mondiaux) : parties Régional + National ; bascule entre les deux → les stats, les séries (Coupe de France vs coupes régionales) et la timeline changent.
3. **Pilote avec Mondiaux UCI** : partie UCI avec Stats + Courses (pas de Championnats) ; carte pilote globale inchangée quand on navigue entre parties.
4. **Filtre année** : réduire à une année où le pilote n'a pas couru au niveau national → l'onglet National disparaît ; revient avec « Toutes les années ».
5. **Mémorisation** : choisir National → re-rechercher le même pilote ou en ouvrir un autre → retour sur National (si ce pilote a du national) sinon repli.
6. **Comparaison** : A et B comparés sur Régional puis sur National (résultats différents) ; comparaison UCI (pilote B non présent aux Mondiaux → état vide) ; lien H2H toujours fonctionnel.
7. **Pliage** : plus aucun bouton Masquer/Afficher ; navigation par onglets fluide.
8. **Régressions** : partage de lien (`?name=…`), recherche récente, autocomplétion, thème, homonymes, cache 6 h.

## 9. Suivi & impacts

- Mettre à jour `CLAUDE.md` / `PROJECT-CONTEXT.md` après implémentation (nouvelle navigation, `NATIONAL_ACCOUNTS`, clé `partPref`, suppression des toggles).
- Aucune régénération d'index requise ; le cron hebdo continue tel quel.

## 10. Questions ouvertes tranchées (2026-09-02)

| # | Question | Décision |
|---|---|---|
| 1 | Libellés des onglets de parties | **🗼 Régional · 🇫🇷 National · 🌍 UCI** (D13). L'emoji de Régional est une constante (`LEVELS`) : trivial à échanger en recette si le rendu déplaît. |
| 2 | Sous-vue mémorisée | **Non — toujours Stats à l'arrivée** (D14). |
| 3 | En-tête sticky sur mobile | **Hybride responsive** (D15) : tout sticky desktop ; mobile = rangée 1 seule sticky. |
| 4 | Mini-sélecteur de comparaison | **Init sur la partie active, puis indépendant** (D16) ; re-sync à chaque nouvelle recherche (pilote ou comparaison). |

Reste à valider en recette : rendu des emojis (surtout 🗼, qui est « Tokyo Tower » sur certaines plateformes — alternative ⚜️ si besoin) et hauteur sticky sur petits écrans.

## Annexe — Les 34 organisations de l'index FR et leur niveau

- **National (5)** : FEDERATION FRANCAISE DE CYCLISME (`ffc`) · FFC BMX NORD EST (`ffcbmxne`) · FFC BMX NORD OUEST (`ffcbmxno`) · FFC BMX SUD EST (`ffcbmxsudest`) · FFC BMX SUD OUEST (`ffcbmxso`).
- **Régional (29, exemples)** : COMITE HAUTS-DE-FRANCE, CRPDL BMX, COMITE OCCITANIE FFC, BMX REGION SUD, BMX BOURGOGNE FRANCHE COMTE, Épreuve BMX Auvergne, BMX NORMAND, BMX GRAND-EST, COMITE NOUVELLE AQUITAINE DE CYC, COMITE DE BRETAGNE DE CYCLISME, COMITE DE GIRONDE DE CYCLISME, CR BMX 974, Comité Iles de Guadeloupe, BMX CCVL, BMX DROME ARDECHE, BMX CD28 / CD37 / CD45 / CD61 / CD183641, BMX EURE, BMX ORGANISATION, clubs divers (CAEN BMX, BMX 14, COURNON, MARTRA…).
