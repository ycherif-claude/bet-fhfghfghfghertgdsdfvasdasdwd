import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggiornaRegistro, righeDaRaccolta } from '../../src/registro/registro.js';
import { raccoglitoreChiusure } from '../../src/registro/chiusure.js';

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
      quotaChiusura: null, probChiusura: null, esito: null, esitoProvvisorio: false,
    },
  );
});

test('registro: esiti dallo storico, chiusure unite, giornate passate fino a 3 giorni', async () => {
  const d = cartella([raccolta('2026-10-20', [partitaEL()])]);
  writeFileSync(join(d, 'registro', '2026-10-20-chiusure.json'), JSON.stringify({
    'basket-2026-10-20-real-madrid-fc-barcelona|Vincente|Real Madrid': { quota: 1.70, prob: 0.57, alle: '2026-10-20T20:10:00+02:00' },
  }));
  const fonti = { espn: { partite: async () => [] }, eurolega: { giornata: async () => ({ partite: [] }) }, thesportsdb: { round: async () => ({ partite: [] }) }, opz: {} };
  const r = await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-21T05:40:00Z'), fonti });
  assert.deepEqual(r.riepilogo, [{ data: '2026-10-20', righe: 2, conEsito: 2, nuovi: 2 }]);
  const reg = JSON.parse(readFileSync(join(d, 'registro', '2026-10-20.json'), 'utf8'));
  assert.deepEqual(reg.righe.map((x) => x.esito), ['persa', 'vinta']);
  assert.equal(reg.righe[0].quotaChiusura, 1.70);
  assert.equal(reg.righe[0].probChiusura, 0.57);
  assert.equal(reg.righe[1].quotaChiusura, null);
});

test('chiusure: solo le partite che iniziano entro 90 minuti, tutti i mercati con quota', () => {
  const p = partitaEL({ idPartita: 'basket-2026-10-21-real-madrid-fc-barcelona', inizio: '2026-10-21T20:45:00+02:00' });
  const lontana = partitaEL({ idPartita: 'basket-2026-10-21-x-y', partita: 'Olympiacos - Panathinaikos', inizio: '2026-10-21T23:45:00+02:00' });
  const d = cartella([raccolta('2026-10-21', [p, lontana])]);
  const bk = (chiave) => ({ chiave, mercati: { vincente: { casa: 1.7, trasferta: 2.2 } } });
  const c = raccoglitoreChiusure({ dirData: d, data: '2026-10-21', adesso: new Date('2026-10-21T18:00:00Z') });
  c.registra('basket', 'Eurolega', [
    { casa: 'Real Madrid', trasferta: 'FC Barcelona', inizio: '2026-10-21T18:45:00Z', bookmaker: [bk('pinnacle'), bk('a'), bk('b')] },
    { casa: 'Olympiacos', trasferta: 'Panathinaikos', inizio: '2026-10-21T21:45:00Z', bookmaker: [bk('pinnacle'), bk('a'), bk('b')] },
  ]);
  assert.equal(c.salva(), true);
  const m = JSON.parse(readFileSync(join(d, 'registro', '2026-10-21-chiusure.json'), 'utf8'));
  assert.deepEqual(Object.keys(m).sort(), [
    'basket-2026-10-21-real-madrid-fc-barcelona|Vincente|FC Barcelona', 'basket-2026-10-21-real-madrid-fc-barcelona|Vincente|Real Madrid',
  ]);
  assert.equal(m['basket-2026-10-21-real-madrid-fc-barcelona|Vincente|Real Madrid'].quota, 1.7);
});
