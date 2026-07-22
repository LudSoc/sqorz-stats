#!/usr/bin/env node
// Génère pilots-index.json en fetchant toutes les données BMX France depuis Sqorz.
// Exécuté par GitHub Actions chaque semaine ; le fichier est commité dans le repo.

const SQORZ_BASE = 'https://our.sqorz.com';
const DELAY_MS = 150;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

const norm = s => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();


function slimCompetitor(c) {
  const out = {
    firstName: c.firstName, lastName: c.lastName,
    rank: c.rank, plate: c.plate, age: c.age, groupName: c.groupName,
  };
  const details = (c.competitorRankDetails || [])
    .filter(d => d.phaseName && d.result != null)
    .map(d => {
      const p = { phaseName: d.phaseName, result: d.result };
      if (d.racePosition  != null) p.racePosition  = d.racePosition;
      if (d.phaseCode)             p.phaseCode     = d.phaseCode;
      if (d.phaseBlockCode)        p.phaseBlockCode = d.phaseBlockCode;
      if (d.raceName != null)      p.raceName      = d.raceName;
      return p;
    });
  if (details.length) out.competitorRankDetails = details;
  return out;
}

function slimSeriesCompetitor(c) {
  return {
    firstName: c.firstName, lastName: c.lastName,
    seriesRank: c.seriesRank, seriesPoints: c.seriesPoints, groupName: c.groupName,
    seriesRankCompetitorEvents: c.seriesRankCompetitorEvents,
  };
}

async function main() {
  console.log('=== Étape 1 : région FR ===');
  const region = await fetchJson(`${SQORZ_BASE}/json/region/FR`);
  const accounts = (region.accounts || []);
  console.log(`${accounts.length} organisations trouvées`);

  const indexEvents = [];
  const indexSeries = [];
  const seriesByKey = new Map();

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    process.stdout.write(`[${i + 1}/${accounts.length}] ${acc.accountCode} … `);

    let orgData;
    try {
      orgData = await fetchJson(`${SQORZ_BASE}/json/org/${encodeURIComponent(acc.accountCode)}`);
      await sleep(DELAY_MS);
    } catch (e) {
      console.log(`ERREUR org: ${e.message}`);
      continue;
    }

    const account = {
      accountCode: acc.accountCode,
      accountName: acc.accountName || orgData.accountName || acc.accountCode,
    };

    const events = (orgData.events || []).filter(e => e.publish !== false);
    const seriesList = (orgData.series || []).filter(s => s.publish !== false && s.seriesId);
    console.log(`${events.length} events, ${seriesList.length} séries`);

    // Événements
    for (const ev of events) {
      let detail;
      try {
        detail = await fetchJson(`${SQORZ_BASE}/json/event/${encodeURIComponent(ev.eventId)}`);
        await sleep(DELAY_MS);
      } catch (e) {
        process.stdout.write(`  skip event ${ev.eventId}: ${e.message}\n`);
        continue;
      }

      const classes = (detail.classRanks || [])
        .filter(cls => (cls.competitorRankSummaries || []).length > 0)
        .map(cls => {
          const summaries = cls.competitorRankSummaries || [];
          return {
            className: cls.className || '',
            perpetualClassCode: cls.perpetualClassCode || null,
            total: summaries.length,
            competitors: summaries.map(slimCompetitor),
          };
        });

      if (classes.length === 0) continue;

      indexEvents.push({
        account,
        event: {
          eventId: ev.eventId,
          eventName: ev.eventName || ev.eventShortName || '',
          eventDate: ev.eventDate || '',
          eventEndDate: ev.eventEndDate || '',
        },
        classes,
      });
    }

    // Séries (dédupliquées par nom normalisé)
    for (const sr of seriesList) {
      let detail;
      try {
        detail = await fetchJson(`${SQORZ_BASE}/json/series/${encodeURIComponent(sr.seriesId)}`);
        await sleep(DELAY_MS);
      } catch (e) {
        process.stdout.write(`  skip series ${sr.seriesId}: ${e.message}\n`);
        continue;
      }

      const rankEvents = (detail.seriesRankEvents || []).map(e => ({
        eventId: e.eventId,
        eventName: e.eventName || e.eventShortName || '',
        eventDate: e.eventDate || '',
        eventEndDate: e.eventEndDate || '',
      }));

      const key = norm(sr.seriesName || '') || sr.seriesId;
      if (!seriesByKey.has(key)) {
        seriesByKey.set(key, { account, coOrgs: [], series: sr, detail, rankEvents });
      } else {
        const ex = seriesByKey.get(key);
        if (rankEvents.length > ex.rankEvents.length) {
          ex.coOrgs.unshift(ex.account);
          ex.account = account; ex.series = sr; ex.detail = detail; ex.rankEvents = rankEvents;
        } else {
          ex.coOrgs.push(account);
        }
      }
    }
  }

  for (const { account, coOrgs, series, detail, rankEvents } of seriesByKey.values()) {
    const classes = (detail.seriesRankClasses || [])
      .filter(cls => (cls.seriesRankCompetitors || []).length > 0)
      .map(cls => {
        const competitors = cls.seriesRankCompetitors || [];
        return {
          className: cls.className || '',
          total: competitors.length,
          competitors: competitors.map(slimSeriesCompetitor),
        };
      });

    if (classes.length === 0) continue;

    indexSeries.push({
      account,
      coOrgs: coOrgs.map(a => ({ accountCode: a.accountCode, accountName: a.accountName })),
      series: { seriesId: series.seriesId, seriesName: series.seriesName || '' },
      rankEvents,
      classes,
    });
  }

  const orgs = accounts.map(a => ({ accountCode: a.accountCode, accountName: a.accountName }));

  const index = {
    generated: new Date().toISOString(),
    orgs,
    events: indexEvents,
    series: indexSeries,
  };

  const json = JSON.stringify(index);
  const { writeFileSync } = await import('fs');
  writeFileSync('pilots-index.json', json);

  const sizeMb = (json.length / 1024 / 1024).toFixed(1);
  let totalCompetitors = 0;
  for (const ev of indexEvents) for (const cls of ev.classes) totalCompetitors += cls.competitors.length;
  let totalSeriesCompetitors = 0;
  for (const sr of indexSeries) for (const cls of sr.classes) totalSeriesCompetitors += cls.competitors.length;

  console.log('');
  console.log(`=== Terminé ===`);
  console.log(`${indexEvents.length} événements, ${totalCompetitors} entrées pilotes`);
  console.log(`${indexSeries.length} séries, ${totalSeriesCompetitors} entrées championnats`);
  console.log(`Taille : ${sizeMb} Mo (non compressé)`);
}

main().catch(e => { console.error(e); process.exit(1); });
