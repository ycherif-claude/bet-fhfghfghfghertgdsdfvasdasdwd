import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggiornaRegistro, righeDaRaccolta } from '../../src/registro/registro.js';
import { raccoglitorePrePartita } from '../../src/registro/chiusure.js';

const partitaEL = (extra = {}) => ({
  idPartita: 'basket-2026-10-20-real-madrid-fc-barcelona', sport: 'basket', competizione: 'Eurolega', partita: 'Real Madrid - FC Barcelona',
  inizio: '2026-10-20T20:45:00+02:00', modello: 'basket', pesoModello: 0.25,
  mercati: [
    { mercato: 'Vincente', selezione: 'Real Madrid', probModello: 0.6, probPinnacle: 0.55, quota: 1.75 },
    { mercato: 'Vincente', selezione: 'FC Barcelona', probModello: 0.4, probPinnacle: 0.45, quota: 2.15, etichettaMercato: 'Consenso bookmaker' },
  ],
  ...extra,
});
const raccolta = (data, partite, suffisso = '-basket') => ({ nome: `${data}${suffisso}.json`, contenuto: { data, generataAlle: `${data}T07:50:00+02:00`, crediti: {}, competizioniNonCoperte: [], erroriGiro: [], partite } });

function cartella(file) {
  const d = mkdtempSync(join(tmpdir(), 'bet-registro-'));
  for (const s of ['raccolta', 'storico', 'registro']) mkdirSync(join(d, s));
  for (const { nome, contenuto } of file) writeFileSync(join(d, 'raccolta', nome), JSON.stringify(contenuto));
  writeFileSync(join(d, 'storico', 'eurolega.json'), JSON.stringify({ partite: [
    { id: 'E2026_70', stagione: 2026, giornata: 7, data: '2026-10-20', casa: 'MAD', trasferta: 'BAR', puntiCasa: 80, puntiTrasferta: 84 },
  ] }));
  return d;
}

test('righe del registro: ogni mercato con probabilità del modello e del mercato, quota e riferimento', () => {
  const r = righeDaRaccolta({ partite: [partitaEL()] });
  assert.equal(r.length, 2);
  assert.deepEqual(
    { ...r[1] },
    {
      sport: 'basket', competizione: 'Eurolega', idPartita: 'basket-2026-10-20-real-madrid-fc-barcelona', partita: 'Real Madrid - FC Barcelona',
      inizio: '2026-10-20T20:45:00+02:00', modello: 'basket', pesoModello: 0.25, mercato: 'Vincente', selezione: 'FC Barcelona',
      probModello: 0.4, probMercato: 0.45, riferimento: 'Consenso bookmaker', quota: 2.15, frequenzaCampionato: null,
      quotaPrePartita: null, probPrePartita: null, minutiPrima: null, esito: null, esitoProvvisorio: false,
    },
  );
});

test('registro: esiti dallo storico, quote pre-partita unite, giornate passate fino a 3 giorni', async () => {
  const d = cartella([raccolta('2026-10-20', [partitaEL()])]);
  writeFileSync(join(d, 'registro', '2026-10-20-prepartita.json'), JSON.stringify({ quote: {
    'basket-2026-10-20-real-madrid-fc-barcelona|Vincente|Real Madrid': { quota: 1.70, prob: 0.57, alle: '2026-10-20T20:10:00+02:00', minutiPrima: 35 },
  }, copertura: { 'basket|Eurolega': { alle: '2026-10-20T20:10:00+02:00', partite: 1 } } }));
  const fonti = { espn: { partite: async () => [] }, eurolega: { giornata: async () => ({ partite: [] }) }, thesportsdb: { round: async () => ({ partite: [] }) }, opz: {} };
  const r = await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-21T05:40:00Z'), fonti });
  assert.deepEqual(r.riepilogo, [{ data: '2026-10-20', righe: 2, conEsito: 2, nuovi: 2 }]);
  const reg = JSON.parse(readFileSync(join(d, 'registro', '2026-10-20.json'), 'utf8'));
  assert.deepEqual(reg.righe.map((x) => x.esito), ['persa', 'vinta']);
  assert.equal(reg.righe[0].quotaPrePartita, 1.70);
  assert.equal(reg.righe[0].probPrePartita, 0.57);
  assert.equal(reg.righe[1].quotaPrePartita, null);
});

test('pre-partita: solo le partite che iniziano entro 90 minuti, tutti i mercati con quota', () => {
  const p = partitaEL({ idPartita: 'basket-2026-10-21-real-madrid-fc-barcelona', inizio: '2026-10-21T20:45:00+02:00' });
  const lontana = partitaEL({ idPartita: 'basket-2026-10-21-x-y', partita: 'Olympiacos - Panathinaikos', inizio: '2026-10-21T23:45:00+02:00' });
  const d = cartella([raccolta('2026-10-21', [p, lontana])]);
  const bk = (chiave) => ({ chiave, mercati: { vincente: { casa: 1.7, trasferta: 2.2 } } });
  const c = raccoglitorePrePartita({ dirData: d, data: '2026-10-21', adesso: new Date('2026-10-21T18:00:00Z') });
  c.registra('basket', 'Eurolega', [
    { casa: 'Real Madrid', trasferta: 'FC Barcelona', inizio: '2026-10-21T18:45:00Z', bookmaker: [bk('pinnacle'), bk('a'), bk('b')] },
    { casa: 'Olympiacos', trasferta: 'Panathinaikos', inizio: '2026-10-21T21:45:00Z', bookmaker: [bk('pinnacle'), bk('a'), bk('b')] },
  ]);
  assert.equal(c.salva(), true);
  const m = JSON.parse(readFileSync(join(d, 'registro', '2026-10-21-prepartita.json'), 'utf8')).quote;
  assert.deepEqual(Object.keys(m).sort(), [
    'basket-2026-10-21-real-madrid-fc-barcelona|Vincente|FC Barcelona', 'basket-2026-10-21-real-madrid-fc-barcelona|Vincente|Real Madrid',
  ]);
  assert.equal(m['basket-2026-10-21-real-madrid-fc-barcelona|Vincente|Real Madrid'].quota, 1.7);
});

test('recupero: giocata aperta da 2 giorni prende l\'esito definitivo dal registro (anche nelle multiple)', async () => {
  const { esitiDalRegistro } = await import('../../src/registro/registro.js');
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const d = mkdtempSync(join(tmpdir(), 'bet-rec-'));
  mkdirSync(join(d, 'giornate'));
  const t = (id, inizio) => ({ idPartita: id, sport: 'tennis', mercato: 'Vincente incontro', selezione: `${id}1`, inizio, esito: null });
  const singola = { id: 's', ...t('a', '2026-10-26T17:30:00+01:00') };
  const multipla = { id: 'm', esito: null, gambe: [t('a', '2026-10-26T17:30:00+01:00'), t('b', '2026-10-26T19:00:00+01:00')] };
  const recente = { id: 'r', ...t('c', '2026-10-29T17:30:00+01:00') };
  writeFileSync(join(d, 'giornate', '2026-10-26.json'), JSON.stringify({ data: '2026-10-26', giocate: [singola, multipla, recente] }));
  const reg = { righe: [
    { idPartita: 'a', mercato: 'Vincente incontro', selezione: 'a1', esito: 'rimborsata', esitoProvvisorio: false },
    { idPartita: 'b', mercato: 'Vincente incontro', selezione: 'b1', esito: 'vinta', esitoProvvisorio: true },
    { idPartita: 'c', mercato: 'Vincente incontro', selezione: 'c1', esito: 'vinta', esitoProvvisorio: false },
  ] };
  assert.equal(esitiDalRegistro(d, '2026-10-26', reg, new Date('2026-10-30T08:00:00+01:00')), 2);
  const g = JSON.parse(readFileSync(join(d, 'giornate', '2026-10-26.json'), 'utf8'));
  assert.equal(g.giocate[0].esito, 'rimborsata');
  // Multipla: una gamba ancora aperta (registro solo provvisorio) → resta aperta.
  assert.deepEqual(g.giocate[1].gambe.map((x) => x.esito), ['rimborsata', null]);
  assert.equal(g.giocate[1].esito, null);
  // Meno di 2 giorni: si aspetta la fonte dello sport.
  assert.equal(g.giocate[2].esito, null);
});
