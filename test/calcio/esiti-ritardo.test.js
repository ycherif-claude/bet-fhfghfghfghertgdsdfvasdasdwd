// Esiti in ritardo [correzioni 24/10/2026, punto 5]: le giocate della sera del 23/10 (Serie B Empoli - Vicenza,
// Ligue 2 Sochaux - Annecy, Superliga Randers - Brøndby, National League Gateshead - Tamworth, Brasile Cruzeiro -
// Remo…) erano ancora aperte dopo la raccolta del 24 mattina. Diagnosi: al mattino gli esiti venivano solo dai CSV di
// football-data.co.uk (aggiornati un paio di volte a settimana: venerdì sera ancora assenti sabato mattina), da
// football-data.org (solo 9 competizioni, e "Brest" non si abbina a "Stade Brestois 29") e da The Odds API (solo le
// competizioni senza CSV); i campionati "extra" (Danimarca, Brasile, Argentina, Messico, Giappone…) non avevano
// nessuna fonte. Ora il mattino chiede prima a ESPN (gratuito, giorno UTC della partita e quello prima) per ogni
// competizione che ESPN copre, e scarica anche i CSV "extra" per le altre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggiornaEsitiGiro } from '../../src/calcio/esiti.js';

const ADESSO = new Date('2026-10-24T05:40:00Z');
const g = (id, competizione, partita, inizio, mercato, selezione) => ({ id, sport: 'calcio', competizione, partita, idPartita: id, inizio, tipo: 'singola', mercato, selezione, quota: 1.9, stato: 'confermata', esito: null });
const GIOCATE = [
  g('empoli', 'Serie B', 'Empoli - Vicenza', '2026-10-23T20:30:00+02:00', '1X2', '1'),
  g('sochaux', 'Ligue 2', 'Sochaux - Annecy FC', '2026-10-23T20:00:00+02:00', '1X2', '2'),
  g('randers', 'Superliga (Danimarca)', 'Randers FC - Brøndby IF', '2026-10-23T19:00:00+02:00', 'Under/Over 2.5', 'Under 2.5'),
  g('gateshead', 'National League', 'Gateshead - Tamworth', '2026-10-23T20:45:00+02:00', '1X2', '1'),
  g('cruzeiro', 'Serie A (Brasile)', 'Cruzeiro - Remo', '2026-10-24T01:00:00+02:00', 'Handicap asiatico -1', 'casa'),
  g('zurigo', 'Super League (Svizzera)', 'Zürich - Basel', '2026-10-23T20:30:00+02:00', '1X2', '2'),
];
function cartella() {
  const d = mkdtempSync(join(tmpdir(), 'esiti-ritardo-'));
  mkdirSync(join(d, 'giornate'), { recursive: true });
  writeFileSync(join(d, 'giornate', '2026-10-23.json'), JSON.stringify({ data: '2026-10-23', giocate: GIOCATE }));
  return d;
}
// ESPN: scoreboard del giorno UTC (Cruzeiro - Remo delle 23:00 UTC sta nel 23), summary con i due tempi.
const ESPN = {
  'soccer/ita.2|2026-10-23': [{ id: 'e1', casa: 'Empoli', trasferta: 'Vicenza', inizio: '2026-10-23T18:30:00Z' }],
  'soccer/fra.2|2026-10-23': [{ id: 'e2', casa: 'Sochaux', trasferta: 'Annecy', inizio: '2026-10-23T18:00:00Z' }],
  'soccer/den.1|2026-10-23': [{ id: 'e3', casa: 'Randers FC', trasferta: 'Brøndby IF', inizio: '2026-10-23T17:00:00Z' }],
  'soccer/eng.5|2026-10-23': [{ id: 'e4', casa: 'Gateshead', trasferta: 'Tamworth', inizio: '2026-10-23T18:45:00Z' }],
  'soccer/bra.1|2026-10-23': [{ id: 'e5', casa: 'Cruzeiro', trasferta: 'Remo', inizio: '2026-10-23T23:00:00Z' }],
};
const PUNTEGGI = { e1: [2, 0, 1, 0], e2: [1, 1, 0, 1], e3: [0, 1, 0, 0], e4: [3, 1, 2, 0], e5: [2, 0, 1, 0] };
const summary = (id) => {
  const [gc, gt, pc, pt] = PUNTEGGI[id];
  return { header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [
    { homeAway: 'home', score: String(gc), linescores: [{ displayValue: String(pc) }] },
    { homeAway: 'away', score: String(gt), linescores: [{ displayValue: String(pt) }] },
  ] }] }, boxscore: { teams: [] } };
};
function fonti() {
  const chiamate = [];
  return {
    chiamate,
    espn: { partite: async (c, giorno) => { chiamate.push(`espn ${c} ${giorno}`); return ESPN[`${c}|${giorno}`] ?? []; } },
    opz: { fetch: async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(summary(new URL(url).searchParams.get('event'))) }) },
    // CSV della stagione: le partite del venerdì non ci sono ancora; il CSV "extra" della Svizzera sì.
    footballDataUk: {
      partite: async () => [],
      partiteExtra: async (codice) => (codice === 'SWZ' ? [{ data: '2026-10-23', casa: 'Zürich', trasferta: 'Basel', gc: 0, gt: 2, gcPT: null, gtPT: null }] : []),
    },
  };
}
const raccolta = () => ({ erroriGiro: [], crediti: { usati: 0, rimasti: 400 } });

test('esiti della sera del 23/10 chiusi il 24 mattina: ESPN per le competizioni che copre, CSV extra per le altre', async () => {
  const d = cartella();
  const f = fonti();
  const out = await aggiornaEsitiGiro({ dirData: join(d, 'giornate'), adesso: ADESSO, fonti: f, chiavi: {}, raccolta: raccolta() });
  const esiti = Object.fromEntries(JSON.parse(readFileSync(join(d, 'giornate', '2026-10-23.json'), 'utf8')).giocate.map((x) => [x.id, x.esito]));
  assert.deepEqual(esiti, { empoli: 'vinta', sochaux: 'persa', randers: 'vinta', gateshead: 'vinta', cruzeiro: 'vinta', zurigo: 'vinta' });
  assert.equal(out.aggiornate, 6);
  // Lo stesso tabellone ESPN (campionato e giorno) si chiede una volta sola.
  assert.equal(new Set(f.chiamate).size, f.chiamate.length);
});

test('esiti: ESPN e un\'altra fonte in disaccordo sui gol → nessun esito e una riga chiara', async () => {
  const d = cartella();
  const f = fonti();
  // football-data.co.uk (Serie B) dice 1-1: ESPN 2-0 → discordanti.
  f.footballDataUk.partite = async (codice) => (codice === 'I2' ? [{ data: '2026-10-23', casa: 'Empoli', trasferta: 'Vicenza', gc: 1, gt: 1, gcPT: 0, gtPT: 0 }] : []);
  const r = raccolta();
  await aggiornaEsitiGiro({ dirData: join(d, 'giornate'), adesso: ADESSO, fonti: f, chiavi: {}, raccolta: r });
  const empoli = JSON.parse(readFileSync(join(d, 'giornate', '2026-10-23.json'), 'utf8')).giocate.find((x) => x.id === 'empoli');
  assert.equal(empoli.esito, null);
  assert.ok(r.erroriGiro.some((e) => /Risultati discordanti per Empoli - Vicenza/.test(e)), r.erroriGiro.join(' | '));
});
