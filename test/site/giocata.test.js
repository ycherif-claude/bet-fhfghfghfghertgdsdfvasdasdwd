import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKMAKER, costruisciSegnatura, percorsoSegnatura, salvaSegnatura, cancellaSegnatura, cancellaToken, leggiImpostazioni, salvaImpostazioni, normalizzaRepo } from '../../site/giocata.js';

test('normalizzaRepo accetta forma breve e indirizzo GitHub completo', () => {
  assert.equal(normalizzaRepo('utente/nome'), 'utente/nome');
  assert.equal(normalizzaRepo(' https://github.com/utente/nome '), 'utente/nome');
  assert.equal(normalizzaRepo('https://github.com/utente/nome.git'), 'utente/nome');
  assert.equal(normalizzaRepo('https://github.com/utente/nome/settings'), 'utente/nome');
  assert.equal(normalizzaRepo('github.com/utente/nome/'), 'utente/nome');
  assert.equal(normalizzaRepo('https://utente.github.io/nome/'), 'utente/nome');
  assert.equal(normalizzaRepo('nome'), 'nome');
});

const adesso = new Date('2026-10-19T10:00:00Z');

// fetch finto: registra le chiamate e risponde con la prima risposta utile.
function fetchFinto(risposte) {
  const chiamate = [];
  const f = async (url, opzioni = {}) => {
    chiamate.push({ url, metodo: opzioni.method ?? 'GET', headers: opzioni.headers, body: opzioni.body ? JSON.parse(opzioni.body) : undefined });
    const r = risposte.shift() ?? { status: 200, json: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json ?? {} };
  };
  f.chiamate = chiamate;
  return f;
}

const seg = { idGiocata: 'M-a+b', fatta: true, quotaReale: 2.1, puntataReale: 5, ora: adesso.toISOString() };

test('percorso sicuro per id di multipla', () =>
  assert.equal(percorsoSegnatura('M-a+b'), 'data/segnature/M-a_b.json'));

test('percorso sostituisce ogni carattere non sicuro', () =>
  assert.equal(percorsoSegnatura('x/y z.é-1_2'), 'data/segnature/x_y_z._-1_2.json'));

test('costruisciSegnatura: giocata fatta, bet365 se il bookmaker non è indicato', () => {
  assert.deepEqual(costruisciSegnatura({ idGiocata: 'a', fatta: true, quotaReale: 1.9, puntataReale: 4 }, adesso),
    { idGiocata: 'a', fatta: true, quotaReale: 1.9, puntataReale: 4, bookmaker: 'bet365', ora: '2026-10-19T10:00:00.000Z' });
});

test('costruisciSegnatura: bookmaker scelto fra quelli dell\'utente', () => {
  assert.deepEqual(BOOKMAKER, ['bet365', 'Sportium', 'Betfair', 'Snai', 'Goldbet', 'DAZN Bet']);
  assert.equal(costruisciSegnatura({ idGiocata: 'a', fatta: true, quotaReale: 2, puntataReale: 4, bookmaker: 'Snai' }, adesso).bookmaker, 'Snai');
  assert.throws(() => costruisciSegnatura({ idGiocata: 'a', fatta: true, quotaReale: 2, puntataReale: 4, bookmaker: 'Eurobet' }, adesso), /Bookmaker non valido/);
  assert.equal(costruisciSegnatura({ idGiocata: 'a', fatta: false, bookmaker: 'Snai' }, adesso).bookmaker, null);
});

test('costruisciSegnatura: saltata ha quota e puntata null', () => {
  const s = costruisciSegnatura({ idGiocata: 'a', fatta: false, quotaReale: 1.9, puntataReale: 4 }, adesso);
  assert.equal(s.quotaReale, null);
  assert.equal(s.puntataReale, null);
  assert.equal(s.fatta, false);
});

test('quota reale obbligatoria e > 1 se fatta', () => {
  for (const q of [undefined, null, NaN, Infinity, 1, 0.5, '2']) {
    assert.throws(() => costruisciSegnatura({ idGiocata: 'a', fatta: true, quotaReale: q, puntataReale: 4 }, adesso), /Quota reale non valida/);
  }
});

test('puntata reale obbligatoria e > 0 se fatta', () => {
  for (const p of [undefined, null, NaN, 0, -1, Infinity]) {
    assert.throws(() => costruisciSegnatura({ idGiocata: 'a', fatta: true, quotaReale: 2, puntataReale: p }, adesso), /Puntata reale non valida/);
  }
});

test('salvaSegnatura: file esistente → PUT con sha', async () => {
  const f = fetchFinto([{ status: 200, json: { sha: 'abc123' } }, { status: 200 }]);
  await salvaSegnatura(seg, { repo: 'utente/nome', token: 'tok', fetch: f });
  assert.equal(f.chiamate.length, 2);
  const [get, put] = f.chiamate;
  assert.equal(get.metodo, 'GET');
  assert.equal(get.url, 'https://api.github.com/repos/utente/nome/contents/data/segnature/M-a_b.json');
  assert.equal(put.metodo, 'PUT');
  assert.equal(put.url, get.url);
  assert.equal(put.body.sha, 'abc123');
  assert.equal(put.body.message, 'Segnatura M-a+b');
  assert.equal(put.headers.Authorization, 'Bearer tok');
  assert.equal(put.headers.Accept, 'application/vnd.github+json');
  assert.equal(put.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.deepEqual(JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8')), seg);
});

test('salvaSegnatura: file nuovo → PUT senza sha', async () => {
  const f = fetchFinto([{ status: 404 }, { status: 201 }]);
  await salvaSegnatura(seg, { repo: 'utente/nome', token: 'tok', fetch: f });
  assert.equal(f.chiamate[1].metodo, 'PUT');
  assert.equal('sha' in f.chiamate[1].body, false);
});

test('salvaSegnatura: contenuto UTF-8 codificato correttamente', async () => {
  const f = fetchFinto([{ status: 404 }, { status: 201 }]);
  await salvaSegnatura({ ...seg, idGiocata: 'à' }, { repo: 'u/n', token: 't', fetch: f });
  const testo = Buffer.from(f.chiamate[1].body.content, 'base64').toString('utf8');
  assert.equal(JSON.parse(testo).idGiocata, 'à');
});

test('salvaSegnatura: risposta non 2xx → errore con lo status', async () => {
  const f = fetchFinto([{ status: 404 }, { status: 403 }]);
  await assert.rejects(() => salvaSegnatura(seg, { repo: 'u/n', token: 't', fetch: f }), /403/);
});

test('cancellaSegnatura → DELETE con sha', async () => {
  const f = fetchFinto([{ status: 200, json: { sha: 'zzz' } }, { status: 200 }]);
  await cancellaSegnatura('M-a+b', { repo: 'u/n', token: 't', fetch: f });
  const del = f.chiamate[1];
  assert.equal(del.metodo, 'DELETE');
  assert.deepEqual(del.body, { message: 'Annulla segnatura M-a+b', sha: 'zzz' });
});

test('cancellaSegnatura su file inesistente → nessun errore, nessun DELETE', async () => {
  const f = fetchFinto([{ status: 404 }]);
  await cancellaSegnatura('a', { repo: 'u/n', token: 't', fetch: f });
  assert.equal(f.chiamate.length, 1);
});

test('token mancante → errore "Codice segreto non impostato"', async () => {
  const f = fetchFinto([]);
  await assert.rejects(() => salvaSegnatura(seg, { repo: 'u/n', token: '', fetch: f }), /Codice segreto non impostato/);
  await assert.rejects(() => cancellaSegnatura('a', { repo: 'u/n', token: null, fetch: f }), /Codice segreto non impostato/);
  assert.equal(f.chiamate.length, 0);
});

test('repository mancante o malformato → errore', async () => {
  const f = fetchFinto([]);
  await assert.rejects(() => salvaSegnatura(seg, { repo: 'senzaslash', token: 't', fetch: f }), /Repository non impostato/);
});

function storageFinto() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('cancellaToken: toglie solo bet.token da localStorage', () => {
  const s = storageFinto();
  globalThis.localStorage = s;
  try {
    assert.equal(salvaImpostazioni({ repo: 'utente/nome', token: 'segreto' }), true);
    assert.equal(cancellaToken(), true);
    assert.equal(s.m.has('bet.token'), false);
    assert.deepEqual(leggiImpostazioni(), { repo: 'utente/nome', token: '' });
  } finally {
    delete globalThis.localStorage;
  }
});

test('cancellaToken: storage che lancia errori → false, nessuna eccezione', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('bloccato'); } });
  try {
    assert.equal(cancellaToken(), false);
  } finally {
    delete globalThis.localStorage;
  }
});
