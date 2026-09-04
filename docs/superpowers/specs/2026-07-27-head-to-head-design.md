# Spec — Head-to-Head (H2H)

**Date :** 2026-07-27  
**Statut :** Brouillon

---

## Objectif

Analyser les confrontations directes entre deux pilotes BMX : sur quels événements se sont-ils retrouvés dans la même catégorie, qui a gagné, combien de fois. Point de départ : un pilote connu, l'outil propose ses adversaires les plus fréquents ; l'utilisateur peut aussi saisir le deuxième pilote manuellement.

---

## Architecture

SPA statique, fichier HTML unique, même pattern que `sqorz_stats` et `category_stats`. Consomme `pilots-index.json` (cache localStorage). Aucun appel API dynamique au-delà du chargement initial de l'index.

## Thème et style

L'UI doit reprendre **exactement** le thème et le style visuel de `sqorz_stats/index.html` :

- Copier intégralement le bloc `:root` (variables CSS light + dark) tel quel — ne pas en créer un nouveau
- Même `topbar` avec dégradé (`linear-gradient(135deg, #2e4158 …)`), même `topbar-inner`, même `brand-row`
- Même bouton de bascule thème (auto / clair / sombre) avec le même script d'init en tête de `<head>`
- Même typographie : `"Inter", -apple-system, …`
- Mêmes composants : `.card`, `.btn`, `.control`, `.status`, `.empty-state` — copier les classes CSS plutôt qu'en inventer de nouvelles
- Même système de couleurs sémantiques : `--good`, `--bad`, `--warn`, `--gold`, `--silver`, `--bronze`
- Même comportement responsive (breakpoints identiques)

L'objectif est qu'un utilisateur naviguant entre les outils du catalogue perçoive une cohérence visuelle totale.

---

## Flux utilisateur

1. L'utilisateur ouvre l'outil.
2. Il cherche le **Pilote A** (champ de recherche, autocomplétion sur l'index).
3. Dès la sélection de A, l'outil calcule et affiche les **adversaires les plus fréquents** de A (ceux qui ont participé au plus grand nombre d'événements en commun dans la même catégorie).
4. L'utilisateur peut :
   - **Cliquer sur un adversaire suggéré** → le Pilote B est automatiquement rempli
   - **Saisir manuellement le Pilote B** via un second champ de recherche
5. Dès que A et B sont définis, le bilan H2H s'affiche.
6. Un bouton "Inverser" permute A et B.

---

## Données disponibles

Tout vient de `pilots-index.json`. Une "confrontation" entre A et B existe quand :
- Ils ont participé au même `eventId`
- Dans la même `perpetualClassCode` (même catégorie)
- Et ont tous les deux un `rank` final renseigné (phase finale présente)

La comparaison ne porte que sur le **classement final** dans l'événement, pas sur les phases intermédiaires (manches, quarts…). Les résultats spéciaux (DNF/DNS/DSQ, `result >= 100000`) sont exclus du calcul de victoire mais apparaissent dans le tableau.

---

## Identification unique des pilotes

Le `pilots-index.json` indexe les pilotes par nom normalisé. Un même nom peut correspondre à plusieurs personnes distinctes. Si la recherche retourne plusieurs candidats avec le même nom normalisé, l'outil les distingue par le club (`groupName`) affiché entre parenthèses.

---

## Section : Adversaires suggérés (après sélection de A)

Liste des N pilotes (N = 10 max) ayant le plus d'événements en commun avec A dans la même catégorie. Pour chaque adversaire :

- Nom complet
- Club
- Nombre d'événements communs
- Bilan préliminaire A vs adversaire (ex. "3 – 2")

Tri : nombre d'événements communs décroissant.

---

## Section : Bilan H2H (après sélection de A + B)

### En-tête comparatif

Affichage côte-à-côte des deux pilotes :

```
[ Pilote A ]   VS   [ Pilote B ]
  Club A                Club B
  X victoires           Y victoires
  sur Z confrontations communes
```

### Statistiques globales

| Stat | Description |
|------|-------------|
| Confrontations | Nombre d'événements où ils ont tous deux un résultat final valide |
| Victoires A / B | Nombre de fois où A (resp. B) a terminé devant |
| Égalités | Même rang final (rare mais possible) |
| Catégories communes | Liste des catégories où ils se sont affrontés |
| Période | Première et dernière confrontation (dates) |

### Tableau des confrontations

Une ligne par événement commun, triées par date décroissante.

| Colonne | Description |
|---------|-------------|
| Date | Date de l'événement |
| Événement | Nom de l'événement |
| Catégorie | Catégorie dans laquelle ils se sont affrontés |
| Rang A | Classement final de A (mis en vert si A < B) |
| Rang B | Classement final de B (mis en vert si B < A) |
| Vainqueur | Icône victoire côté du gagnant |

Les lignes où l'un des deux a un code spécial (DNF/DNS/DSQ) sont affichées en grisé avec le statut affiché à la place du rang.

### Filtre par catégorie

Si les deux pilotes se sont affrontés dans plusieurs catégories, un sélecteur permet de filtrer sur une catégorie spécifique. Les stats globales se recalculent en conséquence.

---

## Cas limites

| Cas | Comportement |
|-----|-------------|
| A et B n'ont jamais été dans le même événement | Message : "Aucune confrontation directe trouvée entre ces deux pilotes." |
| A et B ont des événements communs mais jamais dans la même catégorie | Message : "Ces pilotes ont participé aux mêmes événements mais jamais dans la même catégorie." |
| Un seul pilote trouvé pour le nom saisi | Sélection automatique |
| Plusieurs pilotes avec le même nom | Disambiguation : afficher nom + club dans le dropdown |
| Pilote A = Pilote B | Empêché côté UI (le pilote A est retiré des résultats d'autocomplétion du champ B) |

---

## États de l'interface

| État | Comportement |
|------|-------------|
| Chargement de l'index | Spinner, message "Chargement…" |
| Index chargé, A non sélectionné | Invitation à rechercher le premier pilote |
| A sélectionné, B non sélectionné | Adversaires suggérés visibles, champ B prêt |
| A + B sélectionnés | Bilan H2H complet |
| Aucune confrontation | Message explicatif, suggestions de pilotes proches |
| Erreur réseau | Message `humanError` |

---

## Liens sortants

- Clic sur le nom d'un pilote dans le tableau → `sqorz_stats` pré-rempli avec ce nom
- Clic sur un nom d'événement → URL Sqorz de l'événement si `accountCode` disponible dans l'index (à vérifier ; sinon pas de lien)

---

## Ce qui est hors scope

- Confrontations en phases intermédiaires (manches, quarts) — trop de bruit, peu significatif
- Comparaison à plus de deux pilotes (outil séparé si besoin)
- Données de séries/championnats (points)
- Prédiction / probabilité de résultat futur

---

## Fichiers à créer

```
sqorz_tools/head_to_head/
  index.html    ← SPA complète (HTML + CSS + JS inline, même pattern)
```

Partage du `pilots-index.json` via la même URL GitHub que les autres outils.
