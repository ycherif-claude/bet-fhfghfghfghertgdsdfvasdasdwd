import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiRaccolte, SPORT_RACCOLTA } from '../../src/giro/raccolte.js';
import { raccoltaNba, celticsKnicks, partitaNba, mNba } from './nba-prova.js';

const OGGI = '2026-10-20';
const CALCIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'giro', 'raccolta-calcio-2026-10-20.json');
const calcio = () => JSON.parse(fs.readFileSync(CALCIO, 'utf8'));

function dir(file = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-raccolte-'));
  fs.mkdirSync(path.join(d, 'raccolta'));
  for (const [nome, contenuto] of Object.entries(file)) {
    fs.writeFileSync(path.join(d, 'raccolta', nome), typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto));
  }
  return d;
}

test('sport noti: per ora solo l\'NBA', () => {
  assert.deepEqual(SPORT_RACCOLTA, ['nba']);
});

test('solo calcio: raccolta unita identica a quella letta prima (deepEqual)', () => {
  // Senza file NBA: l'oggetto è quello del calcio, più l'errore della raccolta NBA mancante.
  const senza = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio() }), OGGI);
  assert.deepEqual(senza.raccolta, calcio());
  assert.deepEqual(senza.errori, ['Raccolta NBA di oggi mancante: data/raccolta/2026-10-20-nba.json']);
  // Con la raccolta NBA vuota: stesso oggetto, nessun errore.
  const vuota = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: raccoltaNba([]) }), OGGI);
  assert.deepEqual(vuota.raccolta, calcio());
  assert.deepEqual(vuota.errori, []);
});

test('calcio + nba: partite, competizioni non coperte ed errori uniti, il calcio prima', () => {
  const c = calcio();
  c.competizioniNonCoperte = ['Serie B: crediti insufficienti'];
  c.erroriGiro = ['football-data.co.uk I2 alle 07:35: HTTP 503'];
  const n = raccoltaNba([celticsKnicks()]);
  n.erroriGiro = ['balldontlie stagione 2025 alle 07:40: HTTP 500'];
  const r = leggiRaccolte(dir({ [`${OGGI}.json`]: c, [`${OGGI}-nba.json`]: n }), OGGI);
  assert.deepEqual(r.errori, []);
  assert.equal(r.raccolta.data, OGGI);
  assert.deepEqual(r.raccolta.partite, [...c.partite, ...n.partite]);
  assert.deepEqual(r.raccolta.competizioniNonCoperte, ['Serie B: crediti insufficienti']);
  assert.deepEqual(r.raccolta.erroriGiro, ['football-data.co.uk I2 alle 07:35: HTTP 503', 'balldontlie stagione 2025 alle 07:40: HTTP 500']);
});

test('raccolta calcio mancante, nba presente: partite NBA ed errore del calcio', () => {
  const r = leggiRaccolte(dir({ [`${OGGI}-nba.json`]: raccoltaNba() }), OGGI);
  assert.deepEqual(r.errori, ['Raccolta di oggi mancante: data/raccolta/2026-10-20.json']);
  assert.equal(r.raccolta.data, OGGI);
  assert.deepEqual(r.raccolta.partite, [celticsKnicks()]);
  assert.deepEqual(r.raccolta.competizioniNonCoperte, []);
  assert.deepEqual(r.raccolta.erroriGiro, []);
});

test('nessuna raccolta: raccolta null e un errore per ciascuna', () => {
  const r = leggiRaccolte(dir(), OGGI);
  assert.equal(r.raccolta, null);
  assert.deepEqual(r.errori, [
    'Raccolta di oggi mancante: data/raccolta/2026-10-20.json',
    'Raccolta NBA di oggi mancante: data/raccolta/2026-10-20-nba.json',
  ]);
});

test('raccolta NBA illeggibile o di un altro giorno: errore NBA, il calcio resta', () => {
  const rotta = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: '{ rotto' }), OGGI);
  assert.deepEqual(rotta.raccolta, calcio());
  assert.equal(rotta.errori.length, 1);
  assert.match(rotta.errori[0], /^Raccolta NBA di oggi illeggibile: data\/raccolta\/2026-10-20-nba\.json \(/);
  const senzaPartite = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: { data: OGGI } }), OGGI);
  assert.deepEqual(senzaPartite.errori, ["Raccolta NBA di oggi illeggibile: data/raccolta/2026-10-20-nba.json (manca l'elenco delle partite)"]);
  const ieri = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: raccoltaNba(undefined, '2026-10-19') }), OGGI);
  assert.deepEqual(ieri.raccolta, calcio());
  assert.deepEqual(ieri.errori, ['Raccolta NBA di oggi mancante: data/raccolta/2026-10-20-nba.json (il file è del 2026-10-19)']);
});

test('file -notizie, -serale-nba e suffissi sconosciuti non letti come raccolte', () => {
  const estranea = raccoltaNba([partitaNba('Miami Heat', 'Orlando Magic', [mNba('Vincente', 'Miami Heat', 0.6, 0.6, 1.9)])]);
  const r = leggiRaccolte(dir({
    [`${OGGI}.json`]: calcio(),
    [`${OGGI}-nba.json`]: raccoltaNba(),
    [`${OGGI}-notizie.json`]: estranea,
    [`${OGGI}-serale-nba.json`]: estranea,
    [`${OGGI}-tennis-prova.json`]: estranea,
    [`${OGGI}-pallavolo.json`]: estranea,
  }), OGGI);
  assert.deepEqual(r.errori, []);
  assert.deepEqual(r.raccolta.partite, [...calcio().partite, celticsKnicks()]);
});
