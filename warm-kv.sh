#!/usr/bin/env bash
# Peuple le KV Cloudflare avec toutes les données d'événements de France.
# À exécuter une seule fois (ou après expiration du cache).
# Chaque requête passe par le Worker proxy qui stocke automatiquement en KV.

PROXY="https://sqorz-proxy.ludovicsocie.workers.dev"
DELAY=0.15   # secondes entre requêtes (évite de surcharger Sqorz)

echo "=== Étape 1 : région ==="
curl -sf "$PROXY/json/region/FR" -o /tmp/region.json || { echo "ERREUR région"; exit 1; }
echo "OK"

echo ""
echo "=== Étape 2 : orgs ==="
ACCOUNTS=$(python3 -c "import json; d=json.load(open('/tmp/region.json')); [print(a['accountCode']) for a in d['accounts']]")
TOTAL_ORGS=$(echo "$ACCOUNTS" | wc -l)
i=0
while IFS= read -r CODE; do
  i=$((i+1))
  printf "[%d/%d] %-20s" "$i" "$TOTAL_ORGS" "$CODE"
  curl -sf "$PROXY/json/org/$CODE" -o "/tmp/org_$CODE.json"
  if [ $? -eq 0 ]; then
    NB=$(python3 -c "import json; d=json.load(open('/tmp/org_$CODE.json')); print(len([e for e in d.get('events',[]) if e.get('publish') is not False]))" 2>/dev/null || echo "?")
    echo " → $NB événements"
  else
    echo " → ERREUR"
  fi
  sleep "$DELAY"
done <<< "$ACCOUNTS"

echo ""
echo "=== Étape 3 : événements ==="
TOTAL_EV=0
while IFS= read -r CODE; do
  [ -f "/tmp/org_$CODE.json" ] || continue
  IDS=$(python3 -c "
import json
d=json.load(open('/tmp/org_$CODE.json'))
for e in d.get('events',[]):
    if e.get('publish') is not False:
        print(e['eventId'])
" 2>/dev/null)
  COUNT=$(echo "$IDS" | grep -c . || echo 0)
  TOTAL_EV=$((TOTAL_EV + COUNT))
done <<< "$ACCOUNTS"

echo "Total estimé : $TOTAL_EV événements"
echo ""

j=0
while IFS= read -r CODE; do
  [ -f "/tmp/org_$CODE.json" ] || continue
  IDS=$(python3 -c "
import json
d=json.load(open('/tmp/org_$CODE.json'))
for e in d.get('events',[]):
    if e.get('publish') is not False:
        print(e['eventId'])
" 2>/dev/null)
  while IFS= read -r EID; do
    [ -z "$EID" ] && continue
    j=$((j+1))
    printf "\r[%d/%d] event %s      " "$j" "$TOTAL_EV" "$EID"
    curl -sf "$PROXY/json/event/$EID" -o /dev/null
    sleep "$DELAY"
  done <<< "$IDS"
done <<< "$ACCOUNTS"
echo ""
echo "Événements mis en cache : $j"

echo ""
echo "=== Étape 4 : séries ==="
k=0
while IFS= read -r CODE; do
  [ -f "/tmp/org_$CODE.json" ] || continue
  IDS=$(python3 -c "
import json
d=json.load(open('/tmp/org_$CODE.json'))
for s in d.get('series',[]):
    if s.get('publish') is not False and s.get('seriesId'):
        print(s['seriesId'])
" 2>/dev/null)
  while IFS= read -r SID; do
    [ -z "$SID" ] && continue
    k=$((k+1))
    printf "\r[%d] série %s      " "$k" "$SID"
    curl -sf "$PROXY/json/series/$SID" -o /dev/null
    sleep "$DELAY"
  done <<< "$IDS"
done <<< "$ACCOUNTS"
echo ""
echo "Séries mises en cache : $k"

echo ""
echo "=== Terminé ! ==="
echo "Déclenche maintenant le cron dans Cloudflare pour construire les index de recherche."

# Nettoyage
rm -f /tmp/region.json /tmp/org_*.json
