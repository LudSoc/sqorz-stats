# Spec — Club Stats

**Date :** 2026-07-27  
**Statut :** Brouillon

---

## Objectif

Fiche d'un club BMX : afficher les pilotes actifs du club, leurs performances agrégées, et les forces collectives du club (catégories dominantes, palmarès global). Cas d'usage principal : un dirigeant de club ou un entraîneur qui veut avoir une vue synthétique de son effectif.

---

## Architecture

Même pattern que `category_stats` : SPA statique, fichier HTML unique, pas de serveur, pas de framework. Consomme `pilots-index.json` (déjà hébergé sur GitHub, ~79 Mo, rechargé une fois par session avec cache localStorage).

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
2. Un champ de recherche lui permet de taper le nom d'un club (`groupName` dans l'index).
3. L'autocomplétion propose les clubs correspondants (recherche tolérante à la casse et aux accents).
4. Il sélectionne un club → le tableau des pilotes s'affiche.
5. Il peut filtrer par année et par catégorie.
6. Il peut cliquer sur un pilote pour ouvrir sa fiche dans `sqorz_stats`.

---

## Données disponibles

Tout vient de `pilots-index.json`. Chaque pilote dans l'index expose :
- `firstName`, `lastName`
- `groupName` → le club (critère de filtrage)
- Par événement : catégorie (`perpetualClassCode`), classement final (`rank`), détails de phase

`groupName` peut varier légèrement pour le même club (casse, accents) → nécessite une normalisation à l'indexation.

---

## Sections de la fiche club

### En-tête

- Nom du club (tel que dans les données)
- Statistiques globales du club (calculées sur tous les pilotes, tous événements confondus) :
  - Nombre de pilotes actifs (au moins 1 résultat dans la période sélectionnée)
  - Total de victoires
  - Total de podiums
  - Taux de podiums moyen (podiums / participations)
  - Nombre d'événements couverts (événements distincts où au moins un pilote du club était présent)

### Barre de filtres

- Filtre année (multi-sélection : Toutes / 2024 / 2023 / …)
- Filtre catégorie (dropdown des catégories présentes dans le club)

### Tableau des pilotes

Une ligne par pilote actif dans le club. Colonnes :

| Colonne | Description |
|---------|-------------|
| Nom | `firstName lastName` — cliquable → ouvre sqorz_stats |
| Catégorie | Catégorie dominante (celle où il a le plus de participations) |
| Participations | Nombre d'événements dans la période |
| Victoires | Nombre de 1re places en finale |
| Podiums | 1re + 2e + 3e places en finale |
| % Podium | podiums / participations |
| Meilleur résultat | Meilleur rang obtenu en finale |

Tri par défaut : victoires décroissantes. Toutes les colonnes triables.

### Catégories fortes

Encart "Les catégories du club" : pour chaque catégorie présente, affiche le nombre de pilotes, le nombre de victoires cumulées, le taux de podiums agrégé. Permet d'identifier les catégories d'excellence du club.

---

## Logique de calcul

Identique à `category_stats` (réutiliser `computeStats` tel quel) :
- Une **victoire** = `rank === 1` en phase finale (`isFinalPhase`)
- Un **podium** = `rank <= 3` en phase finale
- Une **participation** = au moins une phase renseignée dans l'événement

Normalisation des noms de clubs : `groupName.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')` → clé de regroupement, affichage du nom original le plus fréquent.

---

## Recherche de clubs

- Autocomplétion sur les `groupName` distincts présents dans l'index
- Tolérance casse + accents (normalisation identique à ci-dessus)
- Si zéro résultat : message "Aucun club trouvé pour « … »"
- Pas de recherche réseau : tout dans l'index local

---

## États de l'interface

| État | Comportement |
|------|-------------|
| Chargement de l'index | Spinner, message "Chargement de l'index…" |
| Index chargé, aucun club sélectionné | Champ de recherche vide, invitation à chercher |
| Club sélectionné, résultats | Tableau affiché |
| Club sélectionné, aucun résultat dans la période | Message "Aucun résultat pour ce club en [année]" |
| Erreur réseau | Message d'erreur clair (même `humanError` que les autres outils) |

---

## Liens sortants

- Clic sur un pilote → `https://ludsoc.github.io/sqorz-stats/?q={firstName}+{lastName}` (ou équivalent local dev)
- Pas de lien direct vers Sqorz depuis cet outil (les URLs Sqorz nécessitent `accountCode` qui n'est pas dans l'index)

---

## Ce qui est hors scope

- Comparaison inter-clubs (outil séparé si besoin)
- Affichage de la progression temporelle par pilote (couvert par `sqorz_stats`)
- Données de séries/championnats (l'index ne contient pas les points de série)

---

## Fichiers à créer

```
sqorz_tools/club_stats/
  index.html    ← SPA complète (HTML + CSS + JS inline, même pattern)
```

Partage du `pilots-index.json` via la même URL GitHub que les autres outils.
