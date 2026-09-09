// Tests du theme.css partagé : tout var(--x) utilisé par les 5 apps y est défini.
// Usage : node --test tests/theme.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const theme = fs.readFileSync(path.join(__dirname, '..', 'theme.css'), 'utf8');
const defined = new Set([...theme.matchAll(/--([a-z0-9-]+)\s*:/gi)].map(m => m[1]));
// Les custom props posées inline (style="--x:...") sont locales par construction.
const apps = ['sqorz_stats', 'club_stats', 'h2h_stats', 'category_stats', 'sqorz_hub'];

for (const app of apps) {
  test(`${app} : var(--x) sans fallback définis (theme.css ou CSS local)`, () => {
    const src = fs.readFileSync(path.join(root, app, 'index.html'), 'utf8');
    // `var(--x, fallback)` = repli explicite volontaire (ex. couleurs pilotes) : OK sans définition.
    const strict = new Set([...src.matchAll(/var\(\s*--([a-z0-9-]+)\s*\)/gi)].map(m => m[1]));
    const local = new Set([...src.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1]));
    const missing = [...strict].filter(v => !defined.has(v) && !local.has(v));
    assert.deepEqual(missing, [], `tokens manquants : ${missing.join(', ')}`);
  });
}

test('theme.css : clair + sombre + a11y', () => {
  assert.ok(theme.includes(':root{') || theme.includes(':root {'), 'bloc clair');
  assert.ok(theme.includes(':root.dark'), 'bloc sombre');
  assert.ok(theme.includes('prefers-reduced-motion'), 'reduced-motion');
  assert.ok(theme.includes(':focus-visible'), 'focus visible');
});
