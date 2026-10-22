import test from 'node:test';
import assert from 'node:assert/strict';
import { abbinaEspn } from '../../src/calcio/squadre.js';
import { ALIAS_ESPN_CSV } from '../../src/calcio/competizioni.js';
import { calendarioDaFixtures, codiceStagioneExtra, isoDaLondra, partitaExtra } from '../../src/calcio/fonti/football-data-uk.js';
import { eseguiRaccolta } from '../../src/calcio/raccolta.js';
import { CAMPIONATI_ESPN } from '../../src/controlli/espn.js';

test('nomi ESPN → CSV: alias del campionato, nome uguale, parole contenute', () => {
  const csv = ['Peterboro', 'Sheffield Weds', 'Luton', 'Milton Keynes Dons', 'Wigan'];
  assert.equal(abbinaEspn('Peterborough United', csv, ALIAS_ESPN_CSV.E2), 'Peterboro');
  assert.equal(abbinaEspn('Milton Keynes Dons', csv, ALIAS_ESPN_CSV.E2), 'Milton Keynes Dons');
  assert.equal(abbinaEspn('Luton Town', csv, ALIAS_ESPN_CSV.E2), 'Luton');
  assert.equal(abbinaEspn('Burton Albion', csv, ALIAS_ESPN_CSV.E2), null);
  // Il "Vitoria" brasiliano non diventa il Vitoria Guimaraes degli alias delle quote.
  assert.equal(abbinaEspn('Vitória', ['Vitoria', 'Vasco'], ALIAS_ESPN_CSV.BRA), 'Vitoria');
});

test('file extra: stagioni come codici, solo il risultato finale; orari di Londra in UTC', () => {
  assert.equal(codiceStagioneExtra('2026'), '2526');
  assert.equal(codiceStagioneExtra('2026/2027'), '2627');
  assert.equal(codiceStagioneExtra('x'), null);
  const p = partitaExtra({ Season: '2026', Date: '18/10/2026', Home: 'Tromso', Away: 'KFUM Oslo', HG: '1', AG: '1' });
  assert.deepEqual([p.data, p.stagione, p.gc, p.gcPT], ['2026-10-18', '2526', 1, null]);
  assert.equal(partitaExtra({ Season: '2026', Date: '25/10/2026', Home: 'A', Away: 'B', HG: '', AG: '' }), null);
  assert.equal(isoDaLondra('2026-10-22', '15:00'), '2026-10-22T14:00:00.000Z');
  assert.equal(isoDaLondra('2026-12-22', '15:00'), '2026-12-22T15:00:00.000Z');
  // Il 25/10/2026 a Londra è già ora solare.
  const c = calendarioDaFixtures(
    [{ Div: 'B1', Date: '24/10/2026', Time: '19:45', HomeTeam: 'Genk', AwayTeam: 'Gent' }],
    [{ Country: 'Switzerland', League: 'Super League', Date: '25/10/2026', Time: '15:30', Home: 'Basel', Away: 'Lugano' }],
  );
  assert.deepEqual(c, [
    { codice: 'B1', casa: 'Genk', trasferta: 'Gent', inizio: '2026-10-24T18:45:00.000Z' },
    { paese: 'Switzerland', lega: 'Super League', casa: 'Basel', trasferta: 'Lugano', inizio: '2026-10-25T15:30:00.000Z' },
  ]);
});

test('ESPN conosce i campionati senza quote che copre', () => {
  assert.equal(CAMPIONATI_ESPN['League One'], 'soccer/eng.3');
  assert.equal(CAMPIONATI_ESPN['MLS (Stati Uniti)'], 'soccer/usa.1');
  assert.equal(CAMPIONATI_ESPN['Pro League (Belgio)'], undefined);
});

test('raccolta: campionato senza quote da ESPN, modello dal file extra, partita solo per i pronostici', async () => {
  const storico = [];
  for (let i = 0; i < 40; i++) {
    const giorno = new Date(Date.UTC(2026, 3, 1) + i * 3 * 86400000).toISOString().slice(0, 10);
    storico.push({ data: giorno, casa: i % 2 ? 'Tromso' : 'Molde', trasferta: i % 2 ? 'Molde' : 'Tromso', gc: i % 3, gt: 1, gcPT: null, gtPT: null, xgC: null, xgT: null, stagione: '2526' });
  }
  const fonti = {
    oddsApi: { eventi: async () => ({ eventi: [], rimasti: 400 }), quote: async () => ({ eventi: [] }) },
    espn: { partite: async (campionato, giorno) => (campionato === 'soccer/nor.1' && giorno === '2026-10-24'
      ? [{ id: '1', casa: 'Molde', trasferta: 'Tromsø', inizio: '2026-10-24T16:00:00Z' }] : []) },
    footballDataUk: {
      partite: async () => [],
      partiteExtra: async (codice) => (codice === 'NOR' ? storico : []),
      calendario: async () => [],
    },
  };
  const r = await eseguiRaccolta({ data: '2026-10-24', adesso: new Date('2026-10-24T05:00:00Z'), fonti, chiavi: {} });
  const p = r.partite.find((x) => x.competizione === 'Eliteserien (Norvegia)');
  assert.ok(p);
  assert.equal(p.soloPronostici, true);
  assert.equal(p.partita, 'Molde - Tromsø');
  assert.ok(p.mercati.some((m) => m.mercato === '1X2' && m.probModello > 0 && m.quota === null));
  assert.deepEqual(r.erroriGiro.filter((e) => !/The Odds API/.test(e)), []);
});
