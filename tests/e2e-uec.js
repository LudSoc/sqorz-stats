// Harness E2E hors navigateur : exécute le gros IIFE de index.html avec des stubs DOM,
// injecte les index réels (FR + UCI + UEC de test), puis vérifie la recherche UEC,
// le rendu multi-niveaux (onglet 🇪🇺 UEC, Global 4 niveaux) et l'indice de performance.
// Usage : node tests/e2e-uec.js   (uec-index.json doit exister — cf. node build-uec.js --limit 3)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const commonSrc = fs.readFileSync(path.join(root, 'common.js'), 'utf8');
const mainScript = commonSrc + '\n;\n' + blocks[2];

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

// --- Stubs DOM minimaux ---
const elems = new Map();
function makeEl(id) {
  const el = {
    id, style: {}, dataset: {}, classList: {
      _s: new Set(),
      add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); },
      toggle(c,v){ v===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c)) : (v?this._s.add(c):this._s.delete(c)); },
      contains(c){ return this._s.has(c); },
    },
    addEventListener(){}, removeEventListener(){},
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    appendChild(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, contains(){ return false; },
    scrollIntoView(){}, focus(){},
    set innerHTML(v){ this._html = v; }, get innerHTML(){ return this._html || ''; },
    set textContent(v){ this._text = v; }, get textContent(){ return this._text || ''; },
    set hidden(v){ this._hidden = v; }, get hidden(){ return this._hidden || false; },
    set disabled(v){ this._disabled = v; }, get disabled(){ return this._disabled || false; },
    set value(v){ this._value = v; }, get value(){ return this._value || ''; },
  };
  return el;
}
global.document = {
  getElementById(id){ if (!elems.has(id)) elems.set(id, makeEl(id)); return elems.get(id); },
  querySelectorAll(){ return []; },
  querySelector(){ return null; },
  addEventListener(){},
  createElement(t){ return makeEl('el-' + t); },
  createDocumentFragment(){ return makeEl('frag'); },
  body: makeEl('body'),
  documentElement: makeEl('html'),
};
global.window = { location: { protocol: 'file:', hostname: 'localhost', href: 'file:///x/index.html', search: '', pathname: '/x/index.html' }, addEventListener(){}, matchMedia(){ return { addEventListener(){}, matches: false }; } };
global.location = global.window.location;
global.localStorage = { _m: new Map(), getItem(k){ return this._m.get(k) ?? null; }, setItem(k,v){ this._m.set(k,String(v)); }, removeItem(k){ this._m.delete(k); }, clear(){ this._m.clear(); } };
global.navigator = {};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};
global.fetch = async () => { throw new Error('no network in harness'); };
global.history = { replaceState(){}, pushState(){} };
global.confirm = () => false;

function slimExpand(idx) {
  for (const ev of (idx.events || [])) {
    for (const cls of (ev.classes || [])) {
      for (const c of (cls.competitors || [])) {
        c.firstName = c.fn; c.lastName = c.ln; c.groupName = c.gn;
        if (c.jid != null) c.riderId = c.jid;
        c.competitorRankDetails = (c.d || []).map(d => ({
          phaseName: d.n, result: d.r,
          ...(d.tm != null ? { time: d.tm } : {}),
          ...(d.ht != null ? { hillTime: d.ht } : {}),
          ...(d.ct != null ? { corner2Time: d.ct } : {}),
        }));
      }
    }
  }
  return idx;
}
const indexes = {
  pilots: slimExpand(JSON.parse(fs.readFileSync(path.join(root, 'pilots-index.json'), 'utf8'))),
  uci: slimExpand(JSON.parse(fs.readFileSync(path.join(root, 'uci-index.json'), 'utf8'))),
  uec: slimExpand(JSON.parse(fs.readFileSync(path.join(root, 'uec-index.json'), 'utf8'))),
};

// Le IIFE n'expose rien : on injecte un hook de test + les index réels, et on
// retire le init() async (dont le .catch réseau réassignerait les index à vide).
const HOOK = `
;window.__test = { searchLocal, searchUci, searchUec, render, norm, computeStats, levelOf, activeSubFor,
  __setCompare: (m) => { compareActive = true; lastCompareMatches = m; },
  __setActiveSub: (part, sub) => { activeSubtabs[part] = sub; } };
`;
const initIdx = mainScript.indexOf('(async function init()');
if (initIdx < 0) { console.error('init() introuvable'); process.exit(1); }
const patched = mainScript.slice(0, initIdx) + HOOK + '})();'
  .replace ? (mainScript.slice(0, initIdx) + HOOK + '})();') : '';
const withIndexes = s => s
  .replace('let pilotsIndex = null;', 'pilotsIndex = __indexes.pilots;')
  .replace(/let uciIndex = null;[^\n]*/, 'uciIndex = __indexes.uci;')
  .replace(/let uecIndex = null;[^\n]*/, 'uecIndex = __indexes.uec;');

try {
  new Function('window','document','localStorage','navigator','performance','requestAnimationFrame','fetch','history','confirm','__indexes', withIndexes(patched))(
    global.window, global.document, global.localStorage, global.navigator, global.performance, global.requestAnimationFrame, global.fetch, global.history, global.confirm, indexes
  );
} catch (e) {
  console.error('ERREUR exécution IIFE:', e.message);
  console.error(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
const T = global.window.__test;
check('IIFE exécuté, hook de test exposé', !!T);

// --- 1. Recherche UEC ---
const res = T.searchUec('CLERTE');
check('searchUec trouve Eddy CLERTE', res.events.length >= 2, `${res.events.length} matches`);
const allUec = res.events.every(m => m.account.accountCode === 'uec');
check('tous les matches UEC ont accountCode=uec', allUec);
const clerte = res.events[0];
check('riderId exposé après expandIndex (jid)', typeof clerte.competitor.riderId === 'string' && clerte.competitor.riderId.length > 0, clerte.competitor.riderId);
check('groupName = code pays (2-3 lettres)', /^[A-Z]{2,3}$/.test(clerte.competitor.groupName || ''), clerte.competitor.groupName);

// --- 2. Rendu multi-niveaux ---
const resultsEl = global.document.getElementById('results');
const local = T.searchLocal('CLERTE');
const uci = T.searchUci('CLERTE');
const uec = T.searchUec('CLERTE');
global.document.getElementById('yearSel').value = '';
global.document.getElementById('sortSel').value = 'date-desc';
try {
  T.render(local.events, 'date-desc', local.series, uci.events, uci.series, uec.events);
  check('render() exécuté sans erreur avec matches UEC', true);
} catch (e) {
  check('render() exécuté sans erreur avec matches UEC', false, e.message);
}
const out = resultsEl.innerHTML || '';
check('partie 🇪🇺 UEC présente dans le rendu (data-part-btn="uec")', out.includes('data-part-btn="uec"'));
// partsAvailable ne rend que les niveaux avec données : CLERTE (test) = national + UEC
check('parties filtrées selon les données du pilote (global/national/uec, pas regional/uci)',
  out.includes('data-part-btn="global"') && out.includes('data-part-btn="national"')
  && !out.includes('data-part-btn="regional"') && !out.includes('data-part-btn="uci"'));
check('événement UEC affiché (nom JSTiming)', out.includes('European Cup'));
check('chronos UEC rendus (sous-ligne ⏱ Chronos)', out.includes('chrono-line'));

// --- 3. Stats + indice sur les matches UEC ---
const stats = T.computeStats(uec.events);
check('computeStats sur matches UEC', stats.entries === uec.events.length && stats.wins >= 1, `${stats.wins} victoire(s)`);
check('badge 🏅 (indice) présent dans le rendu', out.includes('🏅'));

// --- 4. Non-régression : pilote FR ---
const resFr = T.searchLocal('HEITZ');
check('recherche FR non régressée (HEITZ)', resFr.events.length > 0, `${resFr.events.length} matches`);

// --- 5. Comparaison 2 pilotes + indice de performance ---
const p2 = T.searchLocal('ANJOUBAULT');
T.__setCompare(p2.events);
global.document.getElementById('compareInp').value = 'ANJOUBAULT';
try {
  T.render(local.events, 'date-desc', local.series, uci.events, uci.series, uec.events);
  check('render() avec comparaison active sans erreur', true);
} catch (e) {
  check('render() avec comparaison active sans erreur', false, e.message);
}
const cmpOut = global.document.getElementById('compareResults').innerHTML || '';
check('comparaison rendue (section Comparaison)', cmpOut.includes('id="compareSection"'));
check('ligne 🏅 Indice perf présente dans la comparaison', cmpOut.includes('Indice perf'));
const perfChunk = cmpOut.split('<div class="compare-row">').slice(1).find(c => c.includes('Indice perf'));
const perfVals = perfChunk
  ? [...perfChunk.matchAll(/<div class="cv p[12][^"]*">([^<]*)<\/div>/g)].map(m => m[1])
  : [];
const perfValsOk = perfVals.length === 2 && /^\d+$/.test(perfVals[0]) && /^\d+$/.test(perfVals[1]);
check('indice perf chiffré pour les deux pilotes', perfValsOk, perfVals.length === 2 ? `p1=${perfVals[0]} p2=${perfVals[1]}` : 'ligne introuvable');

// --- 6. Sous-onglet actif persisté entre les rendus (bug Courses → Stats) ---
check('activeSubFor garde un choix valable', T.activeSubFor('global', [{ key: 'stats' }, { key: 'courses' }], 'courses') === 'courses');
check('activeSubFor replie sur le premier si choix invalide', T.activeSubFor('global', [{ key: 'stats' }, { key: 'courses' }], 'zzz') === 'stats');
check('activeSubFor sans sous-vue → null', T.activeSubFor('global', [], 'courses') === null);
function activeSubOf(html, part) {
  const sec = html.split(`<section class="tab-panel`).slice(1).find(s => s.includes(`data-part="${part}"`));
  if (!sec) return null;
  const m = sec.match(/<div class="subtab-panel active" data-subtab="([^"]+)"/);
  return m ? m[1] : null;
}
T.__setActiveSub('global', 'courses');
T.render(local.events, 'date-desc', local.series, uci.events, uci.series, uec.events);
const reOut = global.document.getElementById('results').innerHTML || '';
check('Courses reste actif après re-rendu (refresh arrière-plan)', activeSubOf(reOut, 'global') === 'courses');

console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests E2E passent.');
process.exit(failures ? 1 : 0);
