// TheSportsDB e l'HTTP 429 [correzioni 24/10/2026, punto 7]: il 23/10 (Serie A1 femminile stagione 2025 giornata
// 22, Bundesliga stagione 2026 giornata 1) e il 24/10 (PlusLiga stagione 2026 giornata 2) lo storico della pallavolo
// è finito in "HTTP 429": fino a 12 giornate per campionato per 5 campionati (60 richieste) con 6,5 s di pausa, dopo
// le richieste NBL del basket. Ora: pausa più lunga, al massimo CONFIG.pallavolo.maxGiornateEsecuzione giornate per
// esecuzione fra tutti i campionati (prima le stagioni in corso, poi le precedenti), e dopo un 429 nessun'altra
// richiesta: lo storico riprende dalla raccolta del giorno dopo (dall'ultima giornata salvata).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from '../../src/config.js';
import { eseguiRaccoltaPallavolo } from '../../src/pallavolo/raccolta.js';

const P = CONFIG.pallavolo;
const DATA = '2026-10-24';
const ADESSO = new Date('2026-10-24T06:08:00Z');

// Ogni giornata ha una partita finita (lo storico non finisce mai): conta le chiamate.
function fonteInfinita({ errore429Dopo = Infinity } = {}) {
  const chiamate = [];
  return {
    chiamate,
    round: async (stagione, giornata, opz, lega) => {
      chiamate.push(`${lega}/${stagione}/${giornata}`);
      if (chiamate.length > errore429Dopo) throw Object.assign(new Error('www.thesportsdb.com: HTTP 429'), { status: 429 });
      return { partite: [{ id: `${lega}-${stagione}-${giornata}`, stagione, giornata, idCasa: '1', idTrasferta: '2', inizio: '2026-10-01T18:00:00.000Z', casa: 'A', trasferta: 'B', puntiCasa: 3, puntiTrasferta: 1, finita: true }], scartate: 0 };
    },
  };
}
const lancia = (thesportsdb) => eseguiRaccoltaPallavolo({ data: DATA, adesso: ADESSO, fonti: { thesportsdb }, chiavi: {}, dirData: mkdtempSync(join(tmpdir(), 'tsdb-')), pausaMs: 0 });

test('TheSportsDB: pausa più lunga e al massimo N giornate per esecuzione, prima le stagioni in corso di tutti i campionati', async () => {
  assert.ok(P.pausaTheSportsDbMs >= 10000);
  assert.equal(P.maxGiornateEsecuzione, 15);
  const f = fonteInfinita();
  await lancia(f);
  assert.equal(f.chiamate.length, P.maxGiornateEsecuzione);
  // Tutti e 5 i campionati con lo storico hanno la stagione in corso prima di qualunque stagione precedente.
  const leghe = new Set(f.chiamate.map((c) => c.split('/')[0]));
  assert.equal(leghe.size, 5);
  const primaPrecedente = f.chiamate.findIndex((c) => c.split('/')[1] === '2025');
  const ultimaCorrente = f.chiamate.map((c) => c.split('/')[1]).lastIndexOf('2026');
  assert.ok(primaPrecedente === -1 || primaPrecedente > ultimaCorrente, f.chiamate.join(' '));
});

test('TheSportsDB: dopo un HTTP 429 nessun\'altra richiesta, una riga chiara, ripresa il giorno dopo', async () => {
  const f = fonteInfinita({ errore429Dopo: 2 });
  const r = await lancia(f);
  assert.equal(f.chiamate.length, 3);
  assert.ok(r.erroriGiro.some((e) => /TheSportsDB.*HTTP 429.*storico della pallavolo ripreso alla prossima raccolta/.test(e)), r.erroriGiro.join(' | '));
  assert.equal(r.erroriGiro.filter((e) => /HTTP 429/.test(e)).length, 2, r.erroriGiro.join(' | '));
});
