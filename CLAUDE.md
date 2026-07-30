# sqorz_stats — Documentation CLAUDE.md

## Vue d'ensemble

Application web statique (SPA) de consultation de statistiques BMX racing, alimentée par l'API publique Sqorz. Elle permet de rechercher un coureur, visualiser ses performances par événement, comparer plusieurs coureurs, et naviguer dans les classements de championnats.

Architecture : tout-en-un dans `index.html` (HTML + CSS + JS inline, ~3000 lignes). Pas de framework, pas de build step.

---

## API Sqorz

### Base URL

```
https://our.sqorz.com
```

Pas d'authentification. Tous les endpoints sont publics et accessibles en CORS.

### Endpoints

#### 1. Région → liste des organisations

```
GET /json/region/{regionCode}
```

- `regionCode` : code ISO du pays (ex. `FR`, `BE`, `NL`)
- Retourne la liste des clubs/organisations enregistrés dans la région

```json
{
  "accounts": [
    {
      "accountCode": "string",   // identifiant org (ex: "FFCycl-BMX")
      "accountName": "string"    // nom affiché (ex: "Fédération Française de Cyclisme - BMX")
    }
  ]
}
```

#### 2. Organisation → événements et séries

```
GET /json/org/{accountCode}
```

- `accountCode` : code de l'organisation (URL-encodé si nécessaire)
- Retourne tous les événements passés/futurs et les championnats de l'organisation

```json
{
  "accountCode": "string",
  "accountName": "string",
  "events": [
    {
      "eventId": "string",
      "eventName": "string",
      "eventShortName": "string",
      "eventDate": "YYYY-MM-DD",
      "eventEndDate": "YYYY-MM-DD",
      "publish": true
    }
  ],
  "series": [
    {
      "seriesId": "string",
      "seriesName": "string",
      "publish": true
    }
  ]
}
```

#### 3. Événement → résultats complets

```
GET /json/event/{eventId}
```

- Retourne les classements de toutes les catégories pour un événement donné
- Les événements passés sont immuables (données figées)

```json
{
  "eventId": "string",
  "eventName": "string",
  "eventDate": "YYYY-MM-DD",
  "classRanks": [
    {
      "className": "string",           // ex: "Élite Hommes", "7 ans"
      "perpetualClassCode": "string",  // identifiant stable de la catégorie
      "competitorRankSummaries": [
        {
          "firstName": "string",
          "lastName": "string",
          "rank": 1,                   // classement final
          "plate": "string",           // numéro de plaque (optionnel)
          "age": 25,                   // âge (optionnel)
          "groupName": "string",       // club (optionnel)
          "competitorRankDetails": [
            {
              "phaseName": "string",   // ex: "Manche 1", "1/4 de finale", "Finale"
              "result": 3,             // position dans la phase (voir codes spéciaux ci-dessous)
              "racePosition": 2,       // position de départ / gate (optionnel)
              "phaseCode": "string",
              "phaseBlockCode": "string",
              "raceName": "string"
            }
          ]
        }
      ]
    }
  ]
}
```

#### 4. Série/Championnat → classement général

```
GET /json/series/{seriesId}
```

- Retourne le classement de championnat multi-manches

```json
{
  "seriesId": "string",
  "seriesName": "string",
  "seriesRankEvents": [
    {
      "eventId": "string",
      "eventName": "string",
      "eventShortName": "string",
      "eventDate": "YYYY-MM-DD",
      "eventEndDate": "YYYY-MM-DD"
    }
  ],
  "seriesRankClasses": [
    {
      "className": "string",
      "perpetualClassCode": "string",
      "seriesRankCompetitors": [
        {
          "firstName": "string",
          "lastName": "string",
          "seriesRank": 1,             // position au championnat
          "seriesPoints": 250,         // total de points
          "groupName": "string",
          "seriesRankCompetitorEvents": [
            {
              "eventRank": 3,          // classement à cette manche (optionnel)
              "eventPoints": 40,       // points marqués à cette manche (optionnel)
              "tallied": true          // si ce résultat est compté (certains championnats permettent de "dropper" des manches)
            }
          ]
        }
      ]
    }
  ]
}
```

### Codes de résultat spéciaux

La valeur `result` dans `competitorRankDetails` peut contenir des codes > 100 000 :

| Plage | Signification |
|-------|--------------|
| `< 100 000` | Position normale (1 = 1er, 2 = 2e, etc.) |
| `100 000 – 100 999` | DNF — Did Not Finish (abandon) |
| `101 000 – 102 999` | DSQ — Disqualified (disqualifié) |
| `≥ 103 000` | DNS — Did Not Start (non partant) |

---

## URLs web Sqorz (navigation)

À partir des données API, on peut construire des URLs de navigation vers le site Sqorz :

```
Événement :       https://our.sqorz.com/org/{accountCode}/event/{eventId}
Classe d'event :  https://our.sqorz.com/org/{accountCode}/event/{eventId}/class/{perpetualClassCode}
Course/Race :     https://our.sqorz.com/org/{accountCode}/event/{eventId}/race/{raceName}%{phaseCode}?perpetualClassCode={perpetualClassCode}
Phase :           https://our.sqorz.com/org/{accountCode}/event/{eventId}/phase/{phaseBlockCode}
Série :           https://our.sqorz.com/org/{accountCode}/series/{seriesId}/classes
Classe de série : https://our.sqorz.com/org/{accountCode}/series/{seriesId}/class/{perpetualClassCode}
```

---

## Stratégie de cache

### Cache proxy Cloudflare (`worker.js`)

Toutes les requêtes API passent par un worker Cloudflare qui met en cache les réponses dans Cloudflare KV :

- TTL **7 jours** pour `/json/region/` (données quasi-statiques)
- TTL **4 heures** pour tous les autres endpoints

### Cache navigateur (`localStorage`)

L'application cache aussi localement les réponses dans `localStorage` avec une politique LRU (max 250 entrées) :

| Endpoint | TTL |
|----------|-----|
| `/json/region/` | 24 heures |
| `/json/org/` | 1 heure |
| `/json/series/` | 1 heure |
| `/json/event/` (événement passé) | 30 jours |
| `/json/event/` (événement futur) | 1 heure |

Le cache compresse automatiquement les clés JSON pour économiser de l'espace :

| Champ original | Clé compressée |
|----------------|----------------|
| `firstName` | `fn` |
| `lastName` | `ln` |
| `groupName` | `gn` |
| `competitorRankDetails` | `d` |
| `seriesRank` | `sr` |
| `seriesPoints` | `sp` |
| `racePosition` | `rp` |
| `phaseCode` | `pc` |
| `phaseBlockCode` | `pbc` |
| `raceName` | `rn` |

---

## Index des pilotes (`pilots-index.json`)

Fichier pré-construit (≈79 Mo) généré par `build-index.js` et régénéré hebdomadairement. Il agrège tous les pilotes de toutes les organisations de la région FR et permet la recherche côté client sans requête API.

Structure interne : tableau de pilotes avec leurs participations à des événements, indexé par nom normalisé.

Pour regénérer : `node build-index.js` (fait toutes les requêtes API région → orgs → events).

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `index.html` | Application complète (HTML/CSS/JS inline, ~3000 lignes) |
| `build-index.js` | Script de génération de `pilots-index.json` |
| `worker.js` | Cloudflare Worker — proxy de cache API |
| `service-worker.js` | Service Worker — cache des assets statiques (PWA) |
| `pilots-index.json` | Index pré-calculé de tous les pilotes (ne pas éditer à la main) |
| `manifest.json` | Manifest PWA |
| `warm-kv.sh` | Script shell pour pré-chauffer le cache Cloudflare KV |

---

## Modèle de données métier (BMX)

```
Région (ex: FR)
  └── Organisation (ex: club local, fédération nationale)
        ├── Événement (compétition sur 1-2 jours)
        │     └── Catégorie / Classe (ex: "Élite Hommes", "7 ans garçons")
        │           └── Coureur
        │                 └── Détails par phase (Manche 1, 2, 3, 1/4, 1/2, Finale)
        └── Série (championnat multi-manches)
              └── Catégorie
                    └── Coureur (classement + points par manche)
```

Une **phase** = une course. Les phases typiques en BMX :
- Manches qualificatives (Manche 1, 2, 3)
- Quarts de finale, Demi-finales
- Finale (petite finale, grande finale)

Un **perpetualClassCode** identifie une catégorie de façon stable à travers différents événements et organisations, permettant de comparer les résultats d'un même coureur dans la même catégorie sur plusieurs compétitions.
