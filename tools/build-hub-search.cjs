// Construit le mini-index de recherche du hub : top pilotes + clubs.
// Usage : node tools/build-hub-search.cjs [--top 1500]
// Entrées : ../pilots-index.json (80 Mo, R2/release) + ../../club_stats/clubs.json (canonique).
// Sortie : ../hub-search.json, à ventiler vers sqorz_hub/ (copie versionnée).
const fs = require('fs');
const path = require('path');

const TOP = Math.max(100, parseInt((process.argv.find(a => a.startsWith('--top=')) || '--top=1500').split('=')[1], 10) || 1500);
const DIR = __dirname;
const idx = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'pilots-index.json'), 'utf8'));
const clubs = JSON.parse(fs.readFileSync(path.join(DIR, '..', '..', 'club_stats', 'clubs.json'), 'utf8'));

const freq = new Map(); // normKey -> { n, c, e }
const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ');
let total = 0;
for (const ev of (idx.events || [])) {
  for (const cls of (ev.classes || [])) {
    for (const c of (cls.competitors || [])) {
      const name = `${c.fn || ''} ${c.ln || ''}`.trim();
      if (!name) continue;
      total++;
      const key = norm(name);
      const e = freq.get(key);
      if (e) { e.e++; if (c.gn && (!e.c || c.gn === e.c)) e.c = c.gn; }
      else freq.set(key, { n: name, c: c.gn || '', e: 1 });
    }
  }
}
// Club dominant par pilote (dernier vu le plus fréquent) : simple passe majoritaire.
const clubVotes = new Map();
for (const ev of (idx.events || [])) {
  for (const cls of (ev.classes || [])) {
    for (const c of (cls.competitors || [])) {
      const name = `${c.fn || ''} ${c.ln || ''}`.trim();
      if (!name || !c.gn) continue;
      const key = norm(name);
      if (!freq.has(key)) continue;
      let v = clubVotes.get(key);
      if (!v) { v = new Map(); clubVotes.set(key, v); }
      v.set(c.gn, (v.get(c.gn) || 0) + 1);
    }
  }
}
for (const [key, e] of freq) {
  const v = clubVotes.get(key);
  if (v) e.c = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const pilots = [...freq.values()].sort((a, b) => b.e - a.e).slice(0, TOP);
const cov = pilots.reduce((s, p) => s + p.e, 0);
const out = {
  _meta: {
    generated: new Date().toISOString().slice(0, 10),
    source: 'pilots-index.json (top ' + TOP + ' par engagements) + club_stats/clubs.json',
    pilots: pilots.length,
    coverage: Math.round(1000 * cov / total) / 10,
  },
  pilots,
  clubs: clubs.mapping || {},
};
const outPath = path.join(DIR, '..', 'hub-search.json');
fs.writeFileSync(outPath, JSON.stringify(out) + '\n');
console.log(`pilotes: ${pilots.length}, couverture: ${out._meta.coverage}% engagements, taille: ${(fs.statSync(outPath).size / 1024).toFixed(0)} Ko`);
