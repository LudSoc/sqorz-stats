// Tests de l'état partagé inter-outils côté sqorz_stats (convention sqorz.*).
// Usage : node --test tests/shared-state.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('helpers partagés importés du socle', () => {
  assert.ok(src.includes('isFav, toggleFav, pushRecent') || src.includes('getFavs, isFav, toggleFav, pushRecent'),
    'destructure SqorzCommon');
});

test('fiche pilote : bouton ☆ avec état initial isFav', () => {
  assert.ok(src.includes('data-fav-pilot'), 'bouton présent');
  assert.ok(src.includes("isFav('pilots', norm(fullName))"), 'état initial');
  assert.ok(src.includes("toggleFav('pilots', btn.dataset.favPilot"), 'bascule au clic');
});

test('fiche pilote vue → récents partagés', () => {
  assert.ok(src.includes("pushRecent('pilots', norm(fullName), fullName)"), 'pushRecent au rendu');
});
