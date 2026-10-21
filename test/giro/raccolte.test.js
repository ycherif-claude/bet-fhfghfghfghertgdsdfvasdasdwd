import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiRaccolte, SPORT_RACCOLTA } from '../../src/giro/raccolte.js';
import { raccoltaTennis, alcarazSinner } from './tennis-prova.js';
import { raccoltaBasket, madridBarcellona } from './basket-prova.js';
import { raccoltaNba, celticsKnicks, partitaNba, mNba } from './nba-prova.js';

const OGGI = '2026-10-20';
const CALCIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'giro', 'raccolta-calcio-2026-10-20.json');
const calcio = () => JSON.parse(fs.readFileSync(CALCIO, 'utf8'));

// Per default ci sono anche le raccolte tennis e basket vuote, così i test degli altri sport non ricevono
// le righe "Raccolta tennis/basket di oggi mancante" (`tennis: false`, `basket: false` per ometterle).
function dir(file = {}, { tennis = true, basket = true } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-raccolte-'));
  fs.mkdirSync(path.join(d, 'raccolta'));
  if (tennis && !(`${OGGI}-tennis.json` in file)) file = { ...file, [`${OGGI}-tennis.json`]: raccoltaTennis([]) };
  if (basket && !(`${OGGI}-basket.json` in file)) file = { ...file, [`${OGGI}-basket.json`]: raccoltaBasket([]) };
  for (const [nome, contenuto] of Object.entries(file)) {
    fs.writeFileSync(path.join(d, 'raccolta', nome), typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto));
  }
  return d;
}

test('sport noti: NBA, tennis e basket', () => {
  assert.deepEqual(SPORT_RACCOLTA, ['nba', 'tennis', 'basket']);
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
  const r = leggiRaccolte(dir({}, { tennis: false, basket: false }), OGGI);
  assert.equal(r.raccolta, null);
  assert.deepEqual(r.errori, [
    'Raccolta di oggi mancante: data/raccolta/2026-10-20.json',
    'Raccolta NBA di oggi mancante: data/raccolta/2026-10-20-nba.json',
    'Raccolta tennis di oggi mancante: data/raccolta/2026-10-20-tennis.json',
    'Raccolta basket di oggi mancante: data/raccolta/2026-10-20-basket.json',
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

test('calcio + nba + tennis: partite unite nell ordine degli sport, errori del tennis in coda', () => {
  const t = raccoltaTennis([alcarazSinner()]);
  t.competizioniNonCoperte = ['ATP Vienna: crediti insufficienti'];
  t.erroriGiro = ['Tennis alle 07:45: HTTP 500'];
  const r = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: raccoltaNba([celticsKnicks()]), [`${OGGI}-tennis.json`]: t }), OGGI);
  assert.deepEqual(r.errori, []);
  assert.deepEqual(r.raccolta.partite, [...calcio().partite, celticsKnicks(), alcarazSinner()]);
  assert.deepEqual(r.raccolta.competizioniNonCoperte, ['ATP Vienna: crediti insufficienti']);
  assert.deepEqual(r.raccolta.erroriGiro, ['Tennis alle 07:45: HTTP 500']);
  assert.equal(r.lette.partiteSport, 2);
});

test('raccolta tennis mancante, illeggibile o di ieri: errore tennis, il resto invariato', () => {
  const base = { [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: raccoltaNba([]) };
  const senza = leggiRaccolte(dir(base, { tennis: false }), OGGI);
  assert.deepEqual(senza.errori, ['Raccolta tennis di oggi mancante: data/raccolta/2026-10-20-tennis.json']);
  assert.deepEqual(senza.raccolta, calcio());
  const rotta = leggiRaccolte(dir({ ...base, [`${OGGI}-tennis.json`]: '{ rotto' }), OGGI);
  assert.match(rotta.errori[0], /^Raccolta tennis di oggi illeggibile: data\/raccolta\/2026-10-20-tennis\.json \(/);
  const ieri = leggiRaccolte(dir({ ...base, [`${OGGI}-tennis.json`]: raccoltaTennis(undefined, '2026-10-19') }), OGGI);
  assert.deepEqual(ieri.errori, ['Raccolta tennis di oggi mancante: data/raccolta/2026-10-20-tennis.json (il file è del 2026-10-19)']);
  assert.deepEqual(ieri.raccolta, calcio());
});

test('calcio + nba + tennis + basket: il basket in coda; file mancante → errore basket, il resto invariato', () => {
  const b = raccoltaBasket();
  b.competizioniNonCoperte = ['NBL (Australia): crediti insufficienti'];
  b.erroriGiro = ['API Eurolega stagione 2026 giornata 7 alle 07:40: HTTP 500'];
  const r = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: raccoltaNba(), [`${OGGI}-tennis.json`]: raccoltaTennis(), [`${OGGI}-basket.json`]: b }), OGGI);
  assert.deepEqual(r.errori, []);
  assert.deepEqual(r.raccolta.partite.at(-1), madridBarcellona());
  assert.deepEqual(r.raccolta.competizioniNonCoperte.at(-1), 'NBL (Australia): crediti insufficienti');
  assert.deepEqual(r.raccolta.erroriGiro.at(-1), 'API Eurolega stagione 2026 giornata 7 alle 07:40: HTTP 500');
  const senza = leggiRaccolte(dir({ [`${OGGI}.json`]: calcio(), [`${OGGI}-nba.json`]: raccoltaNba([]) }, { basket: false }), OGGI);
  assert.deepEqual(senza.errori, ['Raccolta basket di oggi mancante: data/raccolta/2026-10-20-basket.json']);
  assert.deepEqual(senza.raccolta, calcio());
});
