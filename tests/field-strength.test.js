// Tests de l'indice v2 côté build (build-field.js) + parité avec le client.
// Usage : node --test tests/field-strength.test.js
// (ne requiert pas les index sauf les tests de parité, ignorés sinon)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const BF = require(path.join(root, 'build-field.js'));
const BF_SRC = fs.readFileSync(path.join(root, 'build-field.js'), 'utf8');
const SC = new Function('window', fs.readFileSync(path.join(root, 'common.js'), 'utf8') + '\nreturn window.SqorzCommon;')({});
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function block(src, start, indent = '  ') {
  const i = src.indexOf(start);
  if (i < 0) throw new Error('marqueur introuvable : ' + start);
  const j = src.indexOf('\n' + indent + '}\n', i);
  if (j < 0) throw new Error('fin de bloc introuvable pour : ' + start);
  return src.slice(i, j + ('\n' + indent + '}\n').length);
}
function stmt(src, start) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error('marqueur introuvable : ' + start);
  return src.slice(i, src.indexOf(';', i) + 1);
}

// --- le build ne connaît aucun coef (unités raw, coefs côté client uniquement) ---
test('build sans coefs : K partagé, pas de NATIONAL/COEFS', () => {
  assert.equal(BF.PERF_FIELD_K, SC.PERF_FIELD_K);
  assert.ok(!/coefFor|NATIONAL_ACCOUNTS|COEFS/.test(BF_SRC), 'aucune logique de coef côté build');
  for (const f of ['build-index.js', 'build-uec.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(src.includes('computeFieldFiles'), `${f} appelle computeFieldFiles`);
    assert.ok(!/coefFor/.test(src), `${f} sans coefFor`);
  }
});

// --- fixture de bout en bout (unités raw, entrées [fs, n]) ---
function fixtureIndex() {
  const det = (places) => places.map(([n, r]) => ({ n, r }));
  const comp = (fn, rank, details) => ({ fn, ln: 'T', gn: 'Club', rank, d: details });
  const good = det([['Moto 1', 1], ['Moto 2', 1], ['Finale', 1]]);
  return {
    generated: '2026-01-01T00:00:00.000Z',
    events: [
      { account: { accountCode: 'ffc', accountName: 'FFC' },
        event: { eventId: 'e1', eventName: 'CDF', eventDate: '2026-05-10' },
        classes: [{ className: 'U19', perpetualClassCode: 'U19', total: 4, competitors: [
          comp('A', 1, good), comp('B', 2, good.map(d => ({ ...d, r: 2 }))),
          comp('C', 3, det([['Moto 1', 3], ['Moto 2', 3]])),
          comp('D', 4, det([['Moto 1', 4]])),
          { fn: 'E', ln: 'T', gn: 'Club', rank: 101000, d: det([['Moto 1', 101000]]) },
        ] }] },
      { account: { accountCode: 'ffc', accountName: 'FFC' },
        event: { eventId: 'e2', eventName: 'CDF2', eventDate: '2025-06-08' },
        classes: [{ className: 'U19', perpetualClassCode: 'U19', total: 2, competitors: [
          comp('F', 1, good), comp('G', 2, good.map(d => ({ ...d, r: 2 }))),
        ] }] },
    ],
    series: [],
  };
}

test('computeFieldFiles : fichiers, meta, [fs, n], DNF exclu du plateau', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'));
  const inFile = path.join(dir, 'idx.json');
  fs.writeFileSync(inFile, JSON.stringify(fixtureIndex()));
  const outFile = path.join(dir, 'field.json');
  BF.computeFieldFiles([inFile], { outFile, label: 'TEST' });
  assert.ok(fs.existsSync(outFile), 'fichier écrit');
  const meta = JSON.parse(fs.readFileSync(outFile.replace(/\.json$/, '.meta.json'), 'utf8'));
  assert.equal(meta.index.sha256, crypto.createHash('sha256').update(fs.readFileSync(outFile, 'utf8')).digest('hex'), 'sha meta OK');
  const payload = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(payload.v, 1);
  assert.deepEqual(Object.keys(payload.medFs).sort(), ['2025', '2026']);
  // e1 : R(A..D) ≈ 802/543/389/118 → fs inclusive ≈ 463 (E/DNF exclu : sinon 421), n = 4.
  assert.deepEqual(payload.classes['ffc/e1/U19'], [463, 4]);
  assert.equal(payload.medFs['2026'], 463, 'une seule classe → sa fs');
  // e2 (2025) : R(F)≈658, R(G)≈222 → fs = 440, n = 2.
  assert.deepEqual(payload.classes['ffc/e2/U19'], [440, 2]);
  const dnf = BF.scoreRaw(101000, 5, [{ n: 'Moto 1', r: 101000 }], []);
  assert.deepEqual(dnf, { raw: 250, valid: false });
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- harnais app (fonctions extraites de index.html) ---
const appHarness = [
  'const { PERF_DNF_SCORES, perfScoreRang, perfCoefConstance, perfConstance, perfDeepestPhase, perfBestTime, perfChronoScore, PERF_CHRONO_W, applyFieldScore } = __SC;',
  stmt(html, 'const perfYearOf ='),
  stmt(html, 'const fieldKeyOfEvent ='),
  block(html, 'function perfEngagement(m) {'),
  block(html, 'function perfSeriesScore(sm) {'),
].join('\n') + '\nreturn { perfEngagement, perfSeriesScore, applyFieldScore, fieldKeyOfEvent };';
const APP = new Function('__SC', 'findClassCompetitors', appHarness)(SC, () => globalThis.__finderResult);

function expandedMatch(ev, cls, c) {
  const ci = cls.competitors.indexOf(c);
  const clsCopy = JSON.parse(JSON.stringify(cls));
  const xcls = SC.expandIndex({ events: [{ account: ev.account, event: ev.event, classes: [clsCopy] }] }).events[0].classes[0];
  globalThis.__finderResult = xcls.competitors; // stub findClassCompetitors (même données)
  return {
    account: ev.account, event: ev.event,
    cls: { className: cls.className, perpetualClassCode: cls.perpetualClassCode },
    competitor: xcls.competitors[ci],
    totalParticipants: cls.total || cls.competitors.length,
  };
}
function firstSamples() {
  const out = [];
  const pilots = JSON.parse(fs.readFileSync(path.join(root, 'pilots-index.json'), 'utf8'));
  const uec = JSON.parse(fs.readFileSync(path.join(root, 'uec-index.json'), 'utf8'));
  outer1:
  for (const ev of pilots.events) {
    for (const cls of ev.classes) {
      const timed = (cls.competitors || []).filter(c => (c.d || []).some(d => typeof d.tm === 'string'));
      if (timed.length >= 3 && cls.total >= 10) { out.push({ ev, cls, c: timed[0] }); break outer1; }
    }
  }
  outer2:
  for (const ev of uec.events) {
    for (const cls of ev.classes) {
      const timed = (cls.competitors || []).filter(c => (c.d || []).some(d => typeof d.tm === 'string'));
      if (timed.length >= 3) { out.push({ ev, cls, c: timed[0] }); break outer2; }
    }
  }
  outer3:
  for (const ev of pilots.events) {
    for (const cls of ev.classes) {
      const dnf = (cls.competitors || []).find(c => typeof c.rank === 'number' && c.rank >= 100000);
      if (dnf) { out.push({ ev, cls, c: dnf }); break outer3; }
    }
  }
  let series = null;
  outer4:
  for (const sr of pilots.series || []) {
    for (const cls of sr.classes || []) {
      const cc = (cls.competitors || []).find(c => typeof c.sr === 'number' && c.sr < 100000);
      if (cc) { series = { sr, cls, c: cc }; break outer4; }
    }
  }
  if (series) out.push({ ...series, isSeries: true });
  return out;
}

test('parité build/app : même raw sur échantillons réels (FR chrono, UEC, DNF)', () => {
  let samples;
  try { samples = firstSamples(); } catch (e) { console.log('  (index absents — test ignoré)'); return; }
  for (const s of samples.filter(x => !x.isSeries)) {
    const m = expandedMatch(s.ev, s.cls, s.c);
    const app = APP.perfEngagement(m);
    const bests = [];
    for (const cp of s.cls.competitors) {
      const bt = SC.perfBestTime((cp.d || []).map(d => ({ phaseName: d.n, result: d.r, time: d.tm, hillTime: d.ht, corner2Time: d.ct })));
      if (bt != null) bests.push(bt);
    }
    const b = BF.scoreRaw(s.c.rank, s.cls.total || s.cls.competitors.length, s.c.d, bests);
    assert.ok(Math.abs(b.raw - app.raw) < 1e-9, `raw ${s.c.fn} ${s.c.ln} rank=${s.c.rank} : build=${b.raw} app=${app.raw}`);
    assert.equal(b.valid, app.nDnf === 0, 'flag DNF cohérent');
  }
});

test('parité séries + ajustement via ctx', () => {
  let samples;
  try { samples = firstSamples(); } catch (e) { console.log('  (index absents — test ignoré)'); return; }
  const s = samples.find(x => x.isSeries);
  assert.ok(s, 'échantillon série trouvé');
  const sm = {
    account: { accountCode: 'ffc', accountName: 'FFC' },
    series: { seriesId: 'sx', seriesName: 'S' },
    competitor: { firstName: s.c.fn, lastName: s.c.ln, seriesRank: s.c.sr, seriesPoints: s.c.sp, groupName: s.c.gn, seriesRankCompetitorEvents: [] },
    totalCompetitors: s.cls.total || s.cls.competitors.length,
    cls: { className: s.cls.className, perpetualClassCode: s.cls.perpetualClassCode },
    rankEvents: [{ eventDate: '2026-05-10' }],
  };
  const app = APP.perfSeriesScore(sm);
  const expected = (() => { const z = SC.zScore(s.c.sr, sm.totalCompetitors); return z == null ? 250 : Math.max(5, Math.min(1000, 500 + 500 * (z <= 0 ? z / Math.sqrt(3) : Math.pow(Math.min(1, z / Math.sqrt(3)), 2.5)))); })();
  assert.ok(Math.abs(app.raw - expected) < 1e-9, `série app.raw=${app.raw} attendu=${expected}`);
  // Ajustement : exclusion exacte de soi-même depuis la moyenne inclusive.
  const ctx = { classes: { 'ffc/evx/U19': [600, 10] }, medFs: { 2026: 430 } };
  // fs_excl = (600·10 − 800)/9 = 577.78 → 800 + 0.3·147.78… non : (577.78−430)=147.78 → +44.33
  assert.ok(Math.abs(APP.applyFieldScore(800, 1.0, 'ffc/evx/U19', '2026', ctx, false) - 844.33) < 0.05);
  assert.equal(APP.applyFieldScore(800, 1.0, 'ffc/evx/ZZZ', '2026', ctx, false), 800, 'clé absente → inchangé');
  assert.equal(APP.applyFieldScore(800, 1.0, 'ffc/evx/U19', '2026', null, false), 800, 'sans ctx → inchangé');
  assert.equal(APP.applyFieldScore(250, 1.0, 'ffc/evx/U19', '2026', ctx, true), 250, 'DNF jamais ajusté');
  assert.equal(APP.applyFieldScore(800, 1.0, 'ffc/evx/U19', '2026', { classes: { 'ffc/evx/U19': [600, 1] }, medFs: { 2026: 430 } }, false), 800, 'classe à 1 → inchangé');
});

// --- loadFieldStrength ---
test('loadFieldStrength : ok / version inconnue / pannes → null', async () => {
  const good = { v: 1, generated: 'x', medFs: { 2026: 430 }, classes: { 'a/b/c': [500, 9] } };
  const mkFetch = (meta, file) => async (url) => {
    url = String(url);
    if (url.endsWith('.meta.json')) {
      if (!meta) return new Response('nf', { status: 404 });
      return new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } });
    }
    if (!file) throw new Error('Failed to fetch');
    return new Response(typeof file === 'string' ? file : JSON.stringify(file), { headers: { 'Content-Type': 'application/json' } });
  };
  const base = { metaUrl: 'https://x/f.meta.json', url: 'https://x/f.json', cacheKey: 'k', tag: '[test]' };
  global.fetch = mkFetch({ index: { sha256: 's' } }, good);
  assert.deepEqual(await SC.loadFieldStrength(base), { classes: good.classes, medFs: good.medFs });
  global.fetch = mkFetch({ index: { sha256: 's' } }, { ...good, v: 2 });
  assert.equal(await SC.loadFieldStrength(base), null, 'v=2 ignorée');
  global.fetch = mkFetch(null, good);
  assert.deepEqual(await SC.loadFieldStrength(base), { classes: good.classes, medFs: good.medFs }, 'meta absente → fichier quand même');
  global.fetch = async () => { throw new Error('Failed to fetch'); };
  assert.equal(await SC.loadFieldStrength(base), null, 'panne → null');
  delete global.fetch;
});

// --- shrinkage ---
test('perfShrinkMean : resserre vers 500 selon n', () => {
  assert.ok(Math.abs(SC.perfShrinkMean(577, 4) - 551.33) < 0.01);
  assert.equal(SC.perfShrinkMean(500, 99), 500);
  assert.ok(SC.perfShrinkMean(844, 2) < 685 && SC.perfShrinkMean(844, 2) > 660, `n=2 : ${SC.perfShrinkMean(844, 2)}`);
});
