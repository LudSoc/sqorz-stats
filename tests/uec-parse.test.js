// Tests unitaires des helpers de parsing de build-uec.js (spec UEC §7.1).
// Usage : node --test tests/
const { test } = require('node:test');
const assert = require('node:assert');
const {
  parsePayload, jdToIso, parseName, phaseNameFor, chronoColsFor, cleanTime, parseIntRank, classNameFor, norm,
} = require('../build-uec.js');

test('jdToIso : DD-MM-YYYY → YYYY-MM-DD (⚠️ format JSTiming, pas ISO)', () => {
  assert.strictEqual(jdToIso('06-09-2026'), '2026-09-06');
  assert.strictEqual(jdToIso('27-06-2026'), '2026-06-27');
  assert.strictEqual(jdToIso(''), '');
  assert.strictEqual(jdToIso(null), '');
  assert.strictEqual(jdToIso('2026-09-06'), ''); // format inattendu → vide
});

test('parseName : nom de famille en capitales, y compris composés', () => {
  assert.deepStrictEqual(parseName('Paula PALMISTE'), { firstName: 'Paula', lastName: 'PALMISTE' });
  assert.deepStrictEqual(parseName('Tom VAN DER BERG'), { firstName: 'Tom', lastName: 'VAN DER BERG' });
  assert.deepStrictEqual(parseName('Leon KLEMETSEN-TJENSVOLL'), { firstName: 'Leon', lastName: 'KLEMETSEN-TJENSVOLL' });
  assert.deepStrictEqual(parseName('Kay WÅGBØ'), { firstName: 'Kay', lastName: 'WÅGBØ' });
  assert.deepStrictEqual(parseName('Eddy CLERTE'), { firstName: 'Eddy', lastName: 'CLERTE' });
  // Tout en capitales (pas d'info de casse) → dernier jeton = nom
  assert.deepStrictEqual(parseName('JEAN DUPONT'), { firstName: 'JEAN', lastName: 'DUPONT' });
  assert.deepStrictEqual(parseName(''), { firstName: '', lastName: '' });
});

test('phaseNameFor : mapping slug → libellés détectables par l app', () => {
  const r = slug => phaseNameFor({ slug, name: slug }, '');
  // Manches : préfixe Moto → isMotoPhase() de l'app
  assert.strictEqual(r('moto-1round-1'), 'Moto 1');
  assert.strictEqual(r('moto-2lcq'), 'Moto 2');
  assert.strictEqual(r('moto-3'), 'Moto 3');
  assert.strictEqual(r('round-1'), 'Moto 1'); // anciens événements
  // Knock-out : profondeur quarter/semi détectée, finale sans exclusion
  assert.strictEqual(r('14-finals'), 'Quarter Finals');
  assert.strictEqual(r('12-finals'), 'Semi Finals');
  assert.strictEqual(r('116-finals'), '1/16 Finals');
  assert.strictEqual(r('18-finals'), '1/8 Finals');
  assert.strictEqual(r('finals'), 'Finale');
  assert.strictEqual(r('lcq'), 'LCQ');
  // Petite finale avant la règle du slug
  assert.strictEqual(phaseNameFor({ slug: 'finals', name: 'Finals' }, 'Race 21 B-final'), 'Petite finale');
  // Slug inconnu → nom du round
  assert.strictEqual(phaseNameFor({ slug: 'truc', name: 'Round of 32' }, ''), 'Round of 32');
});

test('chronoColsFor : suit les libellés *_cname (Start/Split 1/Finish)', () => {
  assert.deepStrictEqual(
    chronoColsFor({ additional_columns: { c11_cname: 'Start', c12_cname: 'Split 1', c14_cname: 'Finish' } }),
    { ht: 'c11', ct: 'c12', tm: 'c14' }
  );
  // Colonnes manquantes → mapping partiel accepté
  assert.deepStrictEqual(
    chronoColsFor({ additional_columns: { c14_cname: 'Finish' } }),
    { tm: 'c14' }
  );
  // Pas de colonnes chrono (array vide, positions manches)
  assert.strictEqual(chronoColsFor({ additional_columns: [] }), null);
  assert.strictEqual(chronoColsFor({ additional_columns: { c11_cname: 'M1', c12_cname: 'M2' } }), null);
  assert.strictEqual(chronoColsFor({}), null);
  // Variantes de libellés éventuelles
  assert.deepStrictEqual(
    chronoColsFor({ additional_columns: { c10_cname: 'Gate start', c13_cname: 'Split 2', c15_cname: 'Finish time' } }),
    { ht: 'c10', ct: 'c13', tm: 'c15' }
  );
});

test('cleanTime : chaîne décimale > 0 uniquement', () => {
  assert.strictEqual(cleanTime(' 41.892'), '41.892');
  assert.strictEqual(cleanTime('2.778'), '2.778');
  assert.strictEqual(cleanTime('0.000'), null);   // temps ≤ 0 jamais compté
  assert.strictEqual(cleanTime(''), null);
  assert.strictEqual(cleanTime('  '), null);
  assert.strictEqual(cleanTime('DNF'), null);
  assert.strictEqual(cleanTime('12,5'), null);    // virgule non gérée
});

test('parseIntRank : entier 1..99999', () => {
  assert.strictEqual(parseIntRank('1'), 1);
  assert.strictEqual(parseIntRank(' 23 '), 23);
  assert.strictEqual(parseIntRank(''), null);
  assert.strictEqual(parseIntRank('0'), null);
  assert.strictEqual(parseIntRank('100000'), null); // plage DNF/DNS/DSQ Sqorz — hors JSTiming
});

test('classNameFor : classOptions dabord, sinon nettoyage du nom du heat', () => {
  const opts = new Map([['ME', 'Men Elite'], ['G15', 'Girls 15/16']]);
  assert.strictEqual(classNameFor('ME', 'Race 20 Men Elite', opts), 'Men Elite');
  assert.strictEqual(classNameFor('XX', 'Race 34 Girls 15/16', opts), 'Girls 15/16');
  assert.strictEqual(classNameFor('B11', 'Boys 11: 19 entries', opts), 'Boys 11');
  assert.strictEqual(classNameFor('B06', ' 6&7 (only national): 18 entries ', opts), '6&7 (only national)');
  assert.strictEqual(classNameFor('ZZ', '', opts), 'ZZ'); // fallback code
});

test('parsePayload : attribut data-payload HTML-unescape + JSON.parse', () => {
  const html = '<div data-payload="{&quot;view&quot;:{&quot;component&quot;:&quot;x&quot;,&quot;properties&quot;:{&quot;a&quot;:1,&quot;s&quot;:&quot;l&#039;équipe&quot;}}}"></div>';
  const props = parsePayload(html);
  assert.deepStrictEqual(props, { a: 1, s: "l'équipe" });
  // &amp; en dernier : &amp;quot; → "&quot;" (pas '"')
  const html2 = '<div data-payload="{&quot;view&quot;:{&quot;properties&quot;:{&quot;s&quot;:&quot;a &amp;quot; b&quot;}}}"></div>';
  assert.strictEqual(parsePayload(html2).s, 'a &quot; b');
});

test('norm : alignée sur norm() de l app (accents, casse, ponctuation)', () => {
  assert.strictEqual(norm('Éèç À'), 'eec a');
  assert.strictEqual(norm('  A  B  '), 'a b');
  assert.strictEqual(norm("Jean-Pierre D'ARGENT"), 'jean pierre d argent');
});
