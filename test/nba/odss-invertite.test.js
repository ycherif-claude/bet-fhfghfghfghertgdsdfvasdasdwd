// NBA del 24/10/2026 [correzioni 24/10/2026, punto 3]: "nessuna quota utilizzabile" per 7 partite. Diagnosi dai dati
// (data/raccolta/2026-10-24-nba.json): le 8 partite vere avevano le quote (mediana di 83-85 bookmaker); le 7 righe
// d'errore erano eventi "fantasma" di odss con casa e trasferta invertite ("Miami Heat - Charlotte Hornets", mentre
// il calendario e ESPN dicono Charlotte in casa), con pochi bookmaker: meno di 3 → nessuna quota. Uno di questi
// ("New Orleans Pelicans - Denver Nuggets", 3 bookmaker, un'altra ora) era diventato una partita in più, con casa e
// trasferta sbagliate. Ora, con il calendario di balldontlie, si tengono solo gli eventi nel verso del calendario;
// gli altri si contano in una riga sola. Il solo vincente (moneyline) basta a dare le quote, senza handicap e totale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiRaccoltaNba, partiteNbaDaOdss } from '../../src/nba/raccolta.js';
import { eventiDaRighe } from '../../src/odss/eventi.js';
import { fetchOdss, rigaOdss, bkOdss } from '../odss/aiuti.js';

const CHIAVE = 'CHIAVE-SEGRETA-123';
const ADESSO = new Date('2026-10-24T06:02:00Z');
const AGG = '2026-10-24T05:50:00+00:00';
const SQ = ['Charlotte Hornets', 'Miami Heat', 'Denver Nuggets', 'New Orleans Pelicans'];
const bk = (k, o) => bkOdss(k, o, { last_update: AGG });
const LIBRI = ['pinnacle', 'snai', 'bwin', 'unibet', 'bet365'];

// Calendario del 24/10 (ESPN, verificato): Charlotte in casa alle 22:00Z, Denver in casa alle 01:00Z.
const CALENDARIO = [
  { casa: 'Charlotte Hornets', trasferta: 'Miami Heat', inizio: '2026-10-24T22:00:00Z' },
  { casa: 'Denver Nuggets', trasferta: 'New Orleans Pelicans', inizio: '2026-10-25T01:00:00Z' },
];
function storico() {
  const out = [];
  let k = 0;
  for (const s of [2025, 2026]) {
    SQ.forEach((a, i) => SQ.forEach((b, j) => {
      if (a === b) return;
      for (let r = 0; r < 4; r++) {
        k++;
        out.push({ id: k, dataUsa: s === 2026 ? `2026-10-${String(1 + (k % 20)).padStart(2, '0')}` : `2026-0${1 + (k % 5)}-${String(1 + (k % 27)).padStart(2, '0')}`, inizio: null, casa: a, trasferta: b, puntiCasa: 105 + ((i + k) % 12), puntiTrasferta: 100 + ((j + 2 * k) % 12), finita: true, stagione: s, postseason: false });
      }
    }));
  }
  return [...out, ...CALENDARIO.map((g, i) => ({ id: 900 + i, dataUsa: '2026-10-24', inizio: g.inizio, casa: g.casa, trasferta: g.trasferta, puntiCasa: null, puntiTrasferta: null, finita: false, stagione: 2026, postseason: false }))];
}
const conMeta = (arr) => Object.defineProperty(arr, 'nonRiconosciute', { value: [], enumerable: false });

const riga = (id, casa, trasferta, inizio, market, outcomes, libri = LIBRI, line = null) => rigaOdss({
  event_id: id, sport: 'basket', league: 'NBA', home_team: casa, away_team: trasferta, event: `${casa} - ${trasferta}`, commence_time: inizio, market, line,
  bookmakers: libri.map((k) => bk(k, outcomes)),
});
// Come il feed del 24/10: le partite vere con molti bookmaker, i fantasmi invertiti con pochi.
const RIGHE = [
  riga('v1', 'Charlotte Hornets', 'Miami Heat', '2026-10-24T22:00:00Z', 'moneyline', { HOME: 2.3, AWAY: 1.65 }),
  riga('v1', 'Charlotte Hornets', 'Miami Heat', '2026-10-24T22:00:00Z', 'ah', { HOME: 1.9, AWAY: 1.9 }, LIBRI, 3.5),
  riga('v1', 'Charlotte Hornets', 'Miami Heat', '2026-10-24T22:00:00Z', 'ou', { OVER: 1.9, UNDER: 1.9 }, LIBRI, 230.5),
  riga('f1', 'Miami Heat', 'Charlotte Hornets', '2026-10-24T22:00:00Z', 'moneyline', { HOME: 1.6, AWAY: 2.4 }, ['snai', 'bwin']),
  // Denver - New Orleans: solo il vincente (niente handicap né totale), deve bastare.
  riga('v2', 'Denver Nuggets', 'New Orleans Pelicans', '2026-10-25T01:00:00Z', 'moneyline', { HOME: 1.5, AWAY: 2.7 }),
  riga('f2', 'New Orleans Pelicans', 'Denver Nuggets', '2026-10-24T23:59:00Z', 'moneyline', { HOME: 2.6, AWAY: 1.55 }, ['snai', 'bwin', 'unibet']),
];

test('NBA 24/10: eventi invertiti rispetto al calendario ignorati (una riga), nessuna partita fantasma, il vincente basta', async () => {
  const fonti = {
    fetchOdss: fetchOdss({ 'basket|moneyline,ah,ou': [RIGHE] }),
    balldontlie: { partite: async (x) => conMeta(storico().filter((p) => p.stagione === x.stagioni[0])) },
    sportsgameodds: { eventi: async () => { throw new Error('non deve servire'); } },
  };
  const r = await eseguiRaccoltaNba({ data: '2026-10-24', adesso: ADESSO, fonti, chiavi: { balldontlie: 'B', sportsgameodds: 'S', odss: CHIAVE }, dirData: mkdtempSync(join(tmpdir(), 'nba-inv-')) });
  assert.deepEqual(r.partite.map((p) => p.partita).sort(), ['Charlotte Hornets - Miami Heat', 'Denver Nuggets - New Orleans Pelicans']);
  assert.ok(!r.erroriGiro.some((e) => /nessuna quota utilizzabile/.test(e)), r.erroriGiro.join(' | '));
  assert.ok(r.erroriGiro.some((e) => /2 eventi NBA con casa e trasferta invertite rispetto al calendario, ignorati: Miami Heat - Charlotte Hornets, New Orleans Pelicans - Denver Nuggets/.test(e)), r.erroriGiro.join(' | '));
  const den = r.partite.find((p) => p.casa === 'Denver Nuggets');
  assert.deepEqual(den.mercati.map((m) => m.mercato), ['Vincente', 'Vincente']);
  assert.equal(den.mercati.find((m) => m.selezione === 'Denver Nuggets').quota, 1.5);
  const cha = r.partite.find((p) => p.casa === 'Charlotte Hornets');
  assert.equal(cha.mercati.find((m) => m.selezione === 'Charlotte Hornets').quota, 2.3);
  // event_id di odss per i controlli (punto 4): solo quello vero, mai il fantasma.
  assert.deepEqual(cha.idOdss, ['v1']);
});

test('NBA: senza calendario (balldontlie giù) gli eventi restano come prima; con il calendario conta il verso', () => {
  const eventi = eventiDaRighe(RIGHE);
  assert.equal(partiteNbaDaOdss(eventi).eventi.length, 4);
  const p = partiteNbaDaOdss(eventi, { calendario: CALENDARIO });
  assert.deepEqual(p.eventi.map((e) => `${e.casa} - ${e.trasferta}`), ['Charlotte Hornets - Miami Heat', 'Denver Nuggets - New Orleans Pelicans']);
  assert.deepEqual(p.invertiti, ['Miami Heat - Charlotte Hornets', 'New Orleans Pelicans - Denver Nuggets']);
});
