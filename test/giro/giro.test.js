import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eseguiGiro, puoScrivere } from '../../src/giro/giro.js';
import { costruisciDati } from '../../src/build/costruisci-sito.js';
import { giornataDi } from '../../src/bankroll/settimana.js';
import { isoRoma } from '../../src/calcio/testo.js';
import { raccoltaNba, partitaNba, mNba, NBA1 } from './nba-prova.js';
import { raccoltaBasket, madridBarcellona, BASKET1 } from './basket-prova.js';
import { raccoltaTennis, partitaTennis, mTennis, TENNIS1 } from './tennis-prova.js';

const GIRO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'giro', 'giro.js');
const P1 = 'calcio-2026-10-20-inter-lecce';
const P2 = 'calcio-2026-10-20-milan-roma';
const ADESSO = new Date('2026-10-20T06:10:00Z'); // 08:10 a Roma
const ORA = '2026-10-20T07:35:40+02:00';
const FONTE = 'mediana di 9 bookmaker (The Odds API)';
const m = (mercato, selezione, probModello, probPinnacle, quota, frequenzaCampionato = null) => ({
  mercato, selezione, probModello, probPinnacle, quota,
  fonteQuota: quota === null ? null : FONTE, oraQuota: quota === null ? null : ORA, frequenzaCampionato,
});

function raccolta(data = '2026-10-20') {
  const id = (s) => s.replace('2026-10-20', data);
  return {
    data, generataAlle: ORA, crediti: { usati: 8, rimasti: 412 },
    competizioniNonCoperte: ['Serie B: crediti insufficienti'], erroriGiro: ['football-data.co.uk I2 alle 07:35: HTTP 503'],
    partite: [
      {
        idPartita: id(P1), competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce',
        inizio: `${data}T20:45:00+02:00`, modello: 'dixon-coles', lambda: { casa: 1.9, trasferta: 0.8 },
        ragionamentoBase: ['Gol attesi: Inter 1,9 – Lecce 0,8 (gol e xG, ultime 2 stagioni)'],
        mercati: [
          m('1X2', '1', 0.60, 0.56, 1.95), m('1X2', 'X', 0.24, 0.26, 3.8), m('1X2', '2', 0.16, 0.18, 5.0),
          m('Under/Over 2.5', 'Over 2.5', 0.58, 0.54, 1.80), m('Under/Over 2.5', 'Under 2.5', 0.42, 0.46, 2.20),
          m('Risultato esatto', '2-1', 0.10, null, null),
          m('Angoli Under/Over 9.5', 'Over 9.5', 0.55, null, null, 0.40),
        ],
      },
      {
        idPartita: id(P2), competizione: 'Serie A', partita: 'Milan - Roma', casa: 'Milan', trasferta: 'Roma',
        inizio: `${data}T18:00:00+02:00`, modello: 'dixon-coles', lambda: { casa: 1.5, trasferta: 1.2 }, ragionamentoBase: [],
        mercati: [m('1X2', '1', 0.50, 0.46, 2.30), m('1X2', 'X', 0.27, 0.28, 3.4), m('1X2', '2', 0.23, 0.26, 3.3)],
      },
    ],
  };
}
const notizie = (correzioni = [], esclusioni = []) => ({
  controllateAlle: '2026-10-20T08:15:00+02:00', partiteControllate: [P1, P2], esclusioni, correzioni,
});

// `nba`: raccolta NBA del giorno; per default è presente ma vuota, così i test del solo calcio
// non ricevono la riga "Raccolta NBA di oggi mancante" (`nba: null` per ometterla).
function dirTemp({ racc = raccolta(), noti = notizie(), nba = raccoltaNba([]), tennis = raccoltaTennis([]), basket = raccoltaBasket([]), giornate = [], segnature = [] } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-giro-'));
  for (const sotto of ['raccolta', 'giornate', 'segnature']) fs.mkdirSync(path.join(d, sotto));
  if (racc) fs.writeFileSync(path.join(d, 'raccolta', `${racc.data}.json`), JSON.stringify(racc));
  if (noti) fs.writeFileSync(path.join(d, 'raccolta', '2026-10-20-notizie.json'), JSON.stringify(noti));
  if (nba) fs.writeFileSync(path.join(d, 'raccolta', `${nba.data}-nba.json`), JSON.stringify(nba));
  for (const g of giornate) fs.writeFileSync(path.join(d, 'giornate', `${g.data}.json`), JSON.stringify(g, null, 2));
  if (tennis) fs.writeFileSync(path.join(d, 'raccolta', `${tennis.data}-tennis.json`), JSON.stringify(tennis));
  if (basket) fs.writeFileSync(path.join(d, 'raccolta', `${basket.data}-basket.json`), JSON.stringify(basket));
  for (const s of segnature) scriviSegnatura(d, s);
  return d;
}
const scriviSegnatura = (d, s) => fs.writeFileSync(path.join(d, 'segnature', `${s.idGiocata}.json`), JSON.stringify(s));
const leggi = (d, data = '2026-10-20') => JSON.parse(fs.readFileSync(path.join(d, 'giornate', `${data}.json`), 'utf8'));
const testo = (d, data = '2026-10-20') => fs.readFileSync(path.join(d, 'giornate', `${data}.json`), 'utf8');
const corr = (idPartita, mercato, selezione, delta) => ({ idPartita, mercato, selezione, delta, motivo: 'assente Lautaro', fonte: 'Gazzetta' });

test('eseguiGiro scrive giocate e scartate, giro "claude", notizieControllate true', () => {
  const d = dirTemp({ noti: notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.02)]) });
  const r = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  assert.equal(r.scritto, true);
  const g = leggi(d);
  assert.deepEqual(Object.keys(g), ['data', 'generataAlle', 'giro', 'notizieControllate', 'competizioniNonCoperte', 'candidati', 'giocate', 'scartate', 'erroriGiro']);
  assert.equal(g.data, '2026-10-20');
  assert.equal(g.generataAlle, '2026-10-20T08:10:00+02:00');
  assert.equal(g.giro, 'claude');
  assert.equal(g.notizieControllate, true);
  assert.deepEqual(g.competizioniNonCoperte, ['Serie B: crediti insufficienti']);
  assert.deepEqual(g.erroriGiro, ['football-data.co.uk I2 alle 07:35: HTTP 503']);
  assert.ok(g.giocate.length >= 2);
  assert.ok(g.giocate.some((x) => x.id === `${P1}-1x2-1` && x.stato === 'in_attesa' && x.sport === 'calcio'));
  assert.ok(g.scartate.length >= 1);
  // Ogni candidato è giocato o scartato (le multiple si aggiungono alle singole).
  const usati = new Set([...g.giocate.map((x) => x.id), ...g.scartate.map((x) => x.idCandidato)]);
  for (const c of g.candidati) assert.ok(usati.has(c.id), c.id);
  assert.ok(testo(d).endsWith('}\n'));
  assert.match(testo(d), /^\{\n {2}"data"/);
  assert.deepEqual(r.giornata, g);
});

test('notizie non valide: errore con ogni correzione sbagliata e nessun file scritto', () => {
  const d = dirTemp({ noti: notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', 0.12), corr(P1, 'Risultato esatto', '2-1', 0.02)]) });
  assert.throws(() => eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' }), (e) => {
    assert.match(e.message, /Under\/Over 2\.5/);
    assert.match(e.message, /Risultato esatto/);
    return true;
  });
  assert.deepEqual(fs.readdirSync(path.join(d, 'giornate')), []);
});

test('modo claude senza file notizie: errore chiaro', () => {
  const d = dirTemp({ noti: null });
  assert.throws(() => eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' }), /File notizie mancante: data\/raccolta\/2026-10-20-notizie\.json/);
  assert.deepEqual(fs.readdirSync(path.join(d, 'giornate')), []);
});

test('riserva: nessuna correzione, ragionamento "Notizie non controllate", giro "riserva"', () => {
  const d = dirTemp({ noti: notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.05)], [{ idPartita: P1, motivo: 'x', fonte: 'y' }]) });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'riserva' });
  const g = leggi(d);
  assert.equal(g.giro, 'riserva');
  assert.equal(g.notizieControllate, false);
  for (const c of g.candidati) {
    assert.equal(c.correzioneNotizie, null);
    assert.equal(c.ragionamento.at(-1), 'Notizie non controllate: giro di Claude non eseguito');
  }
  assert.ok(!g.scartate.some((s) => s.motivo.startsWith('notizia:')));
  assert.ok(g.erroriGiro.includes('Giro di Claude non eseguito: notizie non controllate'));
});

test('riserva non sovrascrive un file del giro claude', () => {
  const d = dirTemp();
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const prima = leggi(d);
  const testoPrima = testo(d);
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T07:05:00Z'), modo: 'riserva' });
  assert.equal(r.scritto, false);
  // Caso normale di ogni giorno: nessuna scrittura, neppure una riga in erroriGiro.
  assert.equal(testo(d), testoPrima);
  assert.deepEqual(leggi(d), prima);
  assert.deepEqual(puoScrivere(prima, [], ADESSO, 'claude'), { ok: true });
  assert.equal(puoScrivere(prima, [], ADESSO, 'riserva').ok, false);
});

test('claude dopo riserva: il file si sostituisce se non è in uso', () => {
  const d = dirTemp();
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'riserva' });
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T06:20:00Z'), modo: 'claude' });
  assert.equal(r.scritto, true);
  assert.equal(leggi(d).giro, 'claude');
});

test('giornata con una segnatura: file invariato salvo la riga in erroriGiro', () => {
  const d = dirTemp();
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const prima = leggi(d);
  const testoPrima = testo(d);
  scriviSegnatura(d, { idGiocata: prima.giocate[0].id, fatta: true, quotaReale: 1.95, puntataReale: 6, ora: '2026-10-20T08:12:00+02:00' });
  // Anche con notizie diverse il file non cambia.
  fs.writeFileSync(path.join(d, 'raccolta', '2026-10-20-notizie.json'), JSON.stringify(notizie([], [{ idPartita: P1, motivo: 'x', fonte: 'y' }])));
  const dopo = new Date('2026-10-20T06:30:00Z');
  const r = eseguiGiro({ dirData: d, adesso: dopo, modo: 'claude' });
  assert.equal(r.scritto, false);
  const riga = 'Giro claude delle 08:30 non applicato: giornata già in uso';
  assert.deepEqual(leggi(d), { ...prima, erroriGiro: [...prima.erroriGiro, riga] });
  assert.equal(testo(d), testoPrima.replace('"football-data.co.uk I2 alle 07:35: HTTP 503"', `"football-data.co.uk I2 alle 07:35: HTTP 503",\n    "${riga}"`));
  // Rifatto nello stesso minuto: la riga non si ripete.
  eseguiGiro({ dirData: d, adesso: dopo, modo: 'claude' });
  assert.equal(leggi(d).erroriGiro.filter((x) => x === riga).length, 1);
  // Anche una segnatura "non fatta" blocca.
  assert.equal(puoScrivere(prima, [{ idGiocata: prima.giocate[0].id, fatta: false, quotaReale: null, puntataReale: null, ora: '2026-10-20T08:12:00+02:00' }], ADESSO, 'claude').ok, false);
});

test('giornata con partita iniziata: file invariato', () => {
  const d = dirTemp();
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const prima = leggi(d);
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T16:05:00Z'), modo: 'claude' }); // 18:05: Milan - Roma è iniziata
  assert.equal(r.scritto, false);
  assert.deepEqual(leggi(d), { ...prima, erroriGiro: [...prima.erroriGiro, 'Giro claude delle 18:05 non applicato: giornata già in uso'] });
});

test('il file d\'esempio si sostituisce', () => {
  const esempio = { data: '2026-10-20', esempio: true, generataAlle: '2026-10-20T08:00:00+02:00', competizioniNonCoperte: [],
    candidati: [], giocate: [{ id: 'esempio-1', inizio: '2026-10-20T07:00:00+02:00', prob: 0.5, puntata: { euro: 5, percentuale: 2.5 } }],
    scartate: [], erroriGiro: [] };
  const d = dirTemp({ giornate: [esempio], segnature: [{ idGiocata: 'esempio-1', fatta: true, quotaReale: 2, puntataReale: 5, ora: '2026-10-20T07:30:00+02:00' }] });
  const r = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'riserva' });
  assert.equal(r.scritto, true);
  const g = leggi(d);
  assert.equal(g.esempio, undefined);
  assert.equal(g.giro, 'riserva');
});

test('stesso input due volte → stessi id', () => {
  const d = dirTemp();
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const a = leggi(d);
  eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T06:11:00Z'), modo: 'claude' });
  const b = leggi(d);
  assert.deepEqual(b.candidati.map((c) => c.id), a.candidati.map((c) => c.id));
  assert.deepEqual(b.giocate.map((c) => c.id), a.giocate.map((c) => c.id));
  assert.deepEqual(b.scartate, a.scartate);
});

test('raccolta mancante: giocate [] e scartate [] con errore leggibile', () => {
  for (const racc of [null, raccolta('2026-10-19')]) {
    const d = dirTemp({ racc, noti: null });
    const r = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
    assert.equal(r.scritto, true);
    const g = leggi(d);
    assert.deepEqual(g.candidati, []);
    assert.deepEqual(g.giocate, []);
    assert.deepEqual(g.scartate, []);
    assert.deepEqual(g.erroriGiro, ['Raccolta di oggi mancante: data/raccolta/2026-10-20.json']);
  }
  const d = dirTemp({ racc: null, noti: null });
  fs.writeFileSync(path.join(d, 'raccolta', '2026-10-20.json'), '{ rotto');
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'riserva' });
  assert.match(leggi(d).erroriGiro[0], /^Raccolta di oggi illeggibile/);
});

test('il bankroll usato esclude la giornata di oggi e conta le segnature dei giorni precedenti', () => {
  const ieri = { data: '2026-10-19', generataAlle: '2026-10-19T08:10:00+02:00', competizioniNonCoperte: [], candidati: [], scartate: [], erroriGiro: [],
    giocate: [
      { id: 'ieri-1', sport: 'calcio', tipo: 'singola', mercato: '1X2', inizio: '2026-10-19T20:45:00+02:00', prob: 0.5, quota: 2,
        puntata: { euro: 6, percentuale: 3 }, stato: 'confermata', esito: 'vinta' },
      { id: 'rotta', inizio: 'ieri', prob: 0.5, puntata: { euro: 6, percentuale: 3 }, esito: 'vinta' },
    ] };
  const d = dirTemp({ giornate: [ieri], segnature: [
    { idGiocata: 'ieri-1', fatta: true, quotaReale: 2, puntataReale: 100, ora: '2026-10-19T09:00:00+02:00' },
    { idGiocata: 'rotta', fatta: true, quotaReale: 2, puntataReale: 1000, ora: '2026-10-19T09:00:00+02:00' },
  ] });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const g = leggi(d);
  const inter = g.giocate.find((x) => x.id === `${P1}-1x2-1`);
  assert.deepEqual(inter.puntata, { euro: 9, percentuale: 3 }); // 3% di 300 €
  // Una seconda esecuzione (file di oggi non in uso) non conta le giocate di oggi.
  eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T06:15:00Z'), modo: 'claude' });
  assert.deepEqual(leggi(d).giocate.find((x) => x.id === `${P1}-1x2-1`).puntata, { euro: 9, percentuale: 3 });
});

test('anteprima: nessuna scrittura, partite in gioco più le successive per value', () => {
  const d = dirTemp({ noti: null });
  const r = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude', anteprima: true });
  assert.equal(r.scritto, false);
  assert.deepEqual(fs.readdirSync(path.join(d, 'giornate')), []);
  assert.deepEqual([...r.anteprima.partite].sort(), [P1, P2].sort());
  assert.equal(new Set(r.anteprima.partite).size, r.anteprima.partite.length);
});

test('la build legge la giornata scritta senza errori in erroriDati', () => {
  const d = dirTemp({ noti: notizie([corr(P1, 'Under/Over 2.5', 'Over 2.5', -0.02)], [{ idPartita: P2, idCandidato: `${P2}-1x2-2`, motivo: 'x', fonte: 'y' }]) });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const dati = costruisciDati(d, ADESSO);
  assert.deepEqual(dati.erroriDati, []);
  assert.equal(dati.oggi.disponibile, true);
  assert.deepEqual(dati.oggi.giornata.giocate.map((x) => x.id), leggi(d).giocate.map((x) => x.id));
});

test('CLI: notizie non valide → uscita 1, messaggio con correzione e motivo, nessun file', () => {
  const oggi = giornataDi(new Date());
  const radice = fs.mkdtempSync(path.join(os.tmpdir(), 'bet-cli-'));
  fs.mkdirSync(path.join(radice, 'data', 'raccolta'), { recursive: true });
  const r = raccolta(oggi);
  // Orologio reale: partite fra qualche ora, così nessuna risulta già iniziata.
  r.partite.forEach((p, i) => { p.inizio = isoRoma(new Date(Date.now() + (3 + i) * 3600000)); });
  fs.writeFileSync(path.join(radice, 'data', 'raccolta', `${oggi}.json`), JSON.stringify(r));
  fs.writeFileSync(path.join(radice, 'data', 'raccolta', `${oggi}-notizie.json`), JSON.stringify({
    ...notizie(), correzioni: [corr(r.partite[0].idPartita, 'Under/Over 2.5', 'Over 2.5', 0.12)],
  }));
  const p = spawnSync(process.execPath, [GIRO], { cwd: radice, encoding: 'utf8' });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /Under\/Over 2\.5/);
  assert.match(p.stderr, /0\.08/);
  assert.equal(fs.existsSync(path.join(radice, 'data', 'giornate')), false);
  const a = spawnSync(process.execPath, [GIRO, '--anteprima'], { cwd: radice, encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, new RegExp(`${r.partite[0].idPartita} · Inter - Lecce · `));
  // Accanto a ogni mercato in gara c'è l'id del candidato, da copiare in `esclusioni`.
  assert.ok(a.stdout.includes(`${r.partite[0].idPartita}-1x2-1: 1X2 | 1`), a.stdout);
});

test('riserva dopo un giro claude vuoto (raccolta mancante): il file si sostituisce', () => {
  const d = dirTemp({ racc: null, noti: null });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  assert.equal(leggi(d).giro, 'claude');
  fs.writeFileSync(path.join(d, 'raccolta', '2026-10-20.json'), JSON.stringify(raccolta()));
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T07:05:00Z'), modo: 'riserva' });
  assert.equal(r.scritto, true);
  const g = leggi(d);
  assert.equal(g.giro, 'riserva');
  assert.ok(g.candidati.length > 0);
});

test('partite già iniziate: niente candidati e una riga in erroriGiro', () => {
  const d = dirTemp();
  eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T16:05:00Z'), modo: 'claude' }); // 18:05 Roma
  const g = leggi(d);
  assert.ok(g.candidati.length > 0);
  assert.ok(g.candidati.every((c) => c.idPartita !== P2));
  assert.ok(g.erroriGiro.includes('1 partita già iniziata esclusa'));
});

test('bankroll: file e voci ignorati finiscono in erroriGiro', () => {
  const ieri = { data: '2026-10-19', candidati: [], scartate: [], erroriGiro: [],
    giocate: [{ id: 'rotta', inizio: 'ieri', prob: 0.5, puntata: { euro: 6, percentuale: 3 } }] };
  const d = dirTemp({ giornate: [ieri, { data: '2026-10-17', candidati: [] }],
    segnature: [{ idGiocata: 'x', fatta: true, quotaReale: 0.5, puntataReale: 5, ora: '2026-10-19T09:00:00+02:00' }] });
  fs.writeFileSync(path.join(d, 'giornate', '2026-10-18.json'), '{ rotto');
  fs.writeFileSync(path.join(d, 'segnature', 'rotta.json'), '[]');
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const e = leggi(d).erroriGiro;
  assert.ok(e.includes('Bankroll: giornate/2026-10-19.json ignorato (giocata rotta: inizio non valido)'), e.join(' | '));
  assert.ok(e.includes('Bankroll: giornate/2026-10-17.json ignorato (giornata senza giocate)'));
  assert.ok(e.includes('Bankroll: segnature/x.json ignorato (quota reale non valida)'));
  assert.ok(e.some((x) => x.startsWith('Bankroll: giornate/2026-10-18.json ignorato (JSON non valido')));
  assert.ok(e.includes('Bankroll: segnature/rotta.json ignorato (il file non contiene un oggetto)'));
});

test('riserva dopo un giro claude vuoto ma con la raccolta (nessun candidato): il file resta di Claude', () => {
  const vuota = { data: '2026-10-20', generataAlle: '2026-10-20T08:10:00+02:00', giro: 'claude', notizieControllate: true,
    competizioniNonCoperte: [], candidati: [], giocate: [], scartate: [], erroriGiro: ['football-data.co.uk I2 alle 07:35: HTTP 503'] };
  const d = dirTemp({ giornate: [vuota] });
  const testoPrima = testo(d);
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T07:05:00Z'), modo: 'riserva' });
  assert.equal(r.scritto, false);
  assert.equal(testo(d), testoPrima);
  assert.equal(puoScrivere(vuota, [], ADESSO, 'riserva').ok, false);
  assert.deepEqual(puoScrivere({ ...vuota, erroriGiro: ['Raccolta di oggi mancante: data/raccolta/2026-10-20.json'] }, [], ADESSO, 'riserva'), { ok: true });
});

// --- Giro multi-sport (Fase 4a) ---
const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'giro');
const RIGA_NBA = 'Raccolta NBA di oggi mancante: data/raccolta/2026-10-20-nba.json';

// Istantanea presa con il giro di prima (solo calcio), sulla raccolta reale del 2026-10-20.
function dirIstantanea(conNba) {
  const d = dirTemp({ racc: null, noti: null, nba: conNba ? raccoltaNba([]) : null });
  fs.copyFileSync(path.join(FIXTURE, 'raccolta-calcio-2026-10-20.json'), path.join(d, 'raccolta', '2026-10-20.json'));
  fs.copyFileSync(path.join(FIXTURE, 'notizie-2026-10-20.json'), path.join(d, 'raccolta', '2026-10-20-notizie.json'));
  return d;
}

test('solo calcio: giornata identica byte per byte a quella del giro di prima (raccolta NBA vuota)', () => {
  for (const modo of ['claude', 'riserva']) {
    const d = dirIstantanea(true);
    eseguiGiro({ dirData: d, adesso: ADESSO, modo });
    assert.equal(testo(d), fs.readFileSync(path.join(FIXTURE, `giornata-solo-calcio-${modo}.json`), 'utf8'), modo);
  }
  const d = dirIstantanea(true);
  const a = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude', anteprima: true });
  assert.deepEqual(a.anteprima, JSON.parse(fs.readFileSync(path.join(FIXTURE, 'anteprima-solo-calcio.json'), 'utf8')));
});

test('solo calcio senza file NBA: identica salvo la riga "Raccolta NBA di oggi mancante"', () => {
  for (const modo of ['claude', 'riserva']) {
    const d = dirIstantanea(false);
    eseguiGiro({ dirData: d, adesso: ADESSO, modo });
    const g = leggi(d);
    const prima = JSON.parse(fs.readFileSync(path.join(FIXTURE, `giornata-solo-calcio-${modo}.json`), 'utf8'));
    assert.equal(g.erroriGiro.filter((x) => x === RIGA_NBA).length, 1);
    assert.deepEqual({ ...g, erroriGiro: g.erroriGiro.filter((x) => x !== RIGA_NBA) }, prima);
  }
});

// 6 partite di calcio e 6 NBA, ciascuna con una singola di value 0,10–0,16 alternati fra gli sport.
function raccolteDoppie() {
  const calcio = raccolta();
  calcio.partite = [0, 1, 2, 3, 4, 5].map((i) => ({
    idPartita: `calcio-2026-10-20-casa${i}-ospite${i}`, competizione: 'Serie A', partita: `Casa${i} - Ospite${i}`,
    casa: `Casa${i}`, trasferta: `Ospite${i}`, inizio: '2026-10-20T20:45:00+02:00', modello: 'dixon-coles',
    lambda: { casa: 1.5, trasferta: 1.0 }, ragionamentoBase: [], mercati: [m('1X2', '1', 0.56, 0.52, 2.04 + i * 0.02)],
  }));
  const nba = raccoltaNba([0, 1, 2, 3, 4, 5].map((i) => partitaNba(`Squadra${i}`, `Rivale${i}`,
    [mNba('Vincente', `Squadra${i}`, 0.56, 0.52, 2.05 + i * 0.02)])));
  const noti = { ...notizie(), partiteControllate: [...calcio.partite, ...nba.partite].map((p) => p.idPartita) };
  return { racc: calcio, nba, noti };
}

test('calcio + nba: candidati di entrambi, una sola selezionaGiocate, tetto 10 singole comune', () => {
  const d = dirTemp(raccolteDoppie());
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const g = leggi(d);
  assert.equal(g.candidati.length, 12);
  assert.deepEqual(new Set(g.candidati.map((c) => c.sport)), new Set(['calcio', 'nba']));
  assert.ok(g.candidati.filter((c) => c.sport === 'nba').every((c) => c.competizione === 'NBA'));
  // Un solo tetto per tutti gli sport: due selezioni separate ne avrebbero tenute 12.
  const fuori = g.scartate.filter((s) => s.motivo === 'limite giornaliero singole').map((s) => s.idCandidato);
  assert.deepEqual(fuori.sort(), ['calcio-2026-10-20-casa0-ospite0-1x2-1', 'nba-2026-10-20-squadra0-rivale0-vincente-squadra0'].sort());
  // Le giocate (per value decrescente, fino al tetto giornaliero) mescolano gli sport.
  const singole = g.giocate.filter((x) => x.tipo === 'singola');
  assert.deepEqual(new Set(singole.map((x) => x.sport)), new Set(['calcio', 'nba']));
  assert.equal(singole[0].id, 'nba-2026-10-20-squadra5-rivale5-vincente-squadra5');
  assert.deepEqual(g.competizioniNonCoperte, ['Serie B: crediti insufficienti']);
  assert.deepEqual(g.erroriGiro, ['football-data.co.uk I2 alle 07:35: HTTP 503']);
});

test('raccolta calcio mancante, nba presente: giocate NBA scritte, errore calcio in erroriGiro', () => {
  const noti = { ...notizie(), partiteControllate: [NBA1] };
  const d = dirTemp({ racc: null, noti, nba: raccoltaNba() });
  const r = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  assert.equal(r.scritto, true);
  const g = leggi(d);
  assert.equal(g.notizieControllate, true);
  assert.ok(g.candidati.length > 0);
  assert.ok(g.candidati.every((c) => c.sport === 'nba'));
  assert.ok(g.giocate.some((x) => x.id === `${NBA1}-vincente-boston-celtics` && x.sport === 'nba'));
  assert.deepEqual(g.erroriGiro, ['Raccolta di oggi mancante: data/raccolta/2026-10-20.json']);
  // Con giocate NBA la riserva non sostituisce il giro di Claude.
  assert.equal(eseguiGiro({ dirData: d, adesso: new Date('2026-10-20T07:05:00Z'), modo: 'riserva' }).scritto, false);
});

test("notizie: richieste se c'è una raccolta NBA con partite, validate su tutti gli sport", () => {
  assert.throws(() => eseguiGiro({ dirData: dirTemp({ racc: null, noti: null, nba: raccoltaNba() }), adesso: ADESSO, modo: 'claude' }),
    /File notizie mancante: data\/raccolta\/2026-10-20-notizie\.json/);
  // Nessuna raccolta: giornata vuota con i due errori, senza notizie.
  const vuota = dirTemp({ racc: null, noti: null, nba: null });
  eseguiGiro({ dirData: vuota, adesso: ADESSO, modo: 'claude' });
  assert.deepEqual(leggi(vuota).erroriGiro, ['Raccolta di oggi mancante: data/raccolta/2026-10-20.json', RIGA_NBA]);
  // Correzione NBA oltre il massimo: errore, nessun file.
  const sbagliata = dirTemp({ nba: raccoltaNba(), noti: notizie([corr(NBA1, 'Vincente', 'Boston Celtics', 0.12)]) });
  assert.throws(() => eseguiGiro({ dirData: sbagliata, adesso: ADESSO, modo: 'claude' }), /Vincente/);
  assert.deepEqual(fs.readdirSync(path.join(sbagliata, 'giornate')), []);
  // Correzioni calcio e NBA insieme: applicate entrambe.
  const buona = dirTemp({ nba: raccoltaNba(), noti: { ...notizie([corr(P1, '1X2', '1', 0.02),
    corr(NBA1, 'Vincente', 'Boston Celtics', 0.03)]), partiteControllate: [P1, P2, NBA1] } });
  eseguiGiro({ dirData: buona, adesso: ADESSO, modo: 'claude' });
  const cand = leggi(buona).candidati;
  const c = cand.find((x) => x.id === `${NBA1}-vincente-boston-celtics`);
  assert.ok(Math.abs(c.correzioneNotizie.delta - 0.03) < 1e-9);
  assert.ok(Math.abs(c.prob - (0.5 * 0.65 + 0.5 * 0.60)) < 1e-9);
  assert.equal(c.ragionamento.at(-1), 'Vincente: vince se Boston Celtics vince la partita, supplementari compresi. Gioca solo con quota almeno la minima.');
  assert.ok(Math.abs(cand.find((x) => x.id === `${P1}-1x2-1`).correzioneNotizie.delta - 0.02) < 1e-9);
});

test('anteprima: elenca anche le partite NBA, nello stesso formato', () => {
  const d = dirTemp({ noti: null, nba: raccoltaNba() });
  const r = eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude', anteprima: true });
  assert.ok(r.anteprima.partite.includes(NBA1));
  assert.ok(r.anteprima.partite.includes(P1));
  const riga = r.anteprima.righe.find((x) => x.idPartita === NBA1);
  assert.equal(riga.partita, 'Boston Celtics - New York Knicks');
  assert.equal(riga.inizio, '2026-10-21T01:30:00+02:00');
  assert.ok(riga.mercati.includes(`${NBA1}-vincente-boston-celtics: Vincente | Boston Celtics`), riga.mercati.join(', '));
});

// --- Tennis (Fase 4b) ---
const RIGA_TENNIS = 'Raccolta tennis di oggi mancante: data/raccolta/2026-10-20-tennis.json';

test('calcio + nba + tennis: una sola selezionaGiocate, tetto 10 singole comune', () => {
  const doppie = raccolteDoppie();
  const tennis = raccoltaTennis([0, 1, 2, 3].map((i) => partitaTennis(`Giocatore${i}`, `Avversario${i}`,
    [mTennis(`Giocatore${i}`, 0.56, 0.52, 2.20 + i * 0.02)])));
  const noti = { ...doppie.noti, partiteControllate: [...doppie.noti.partiteControllate, ...tennis.partite.map((p) => p.idPartita)] };
  const d = dirTemp({ ...doppie, noti, tennis });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const g = leggi(d);
  assert.equal(g.candidati.length, 16);
  assert.deepEqual(new Set(g.candidati.map((c) => c.sport)), new Set(['calcio', 'nba', 'tennis']));
  const t = g.candidati.find((c) => c.sport === 'tennis');
  assert.equal(t.competizione, 'ATP Masters 1000 Parigi');
  assert.equal(t.mercato, 'Vincente incontro');
  assert.match(t.ragionamento.at(-1), /^Vincente incontro: vince se /);
  assert.equal(g.scartate.filter((s) => s.motivo === 'limite giornaliero singole').length, 6);
  const singole = g.giocate.filter((x) => x.tipo === 'singola');
  assert.ok(singole.length <= 10);
  assert.ok(singole.some((x) => x.sport === 'tennis'));
});

test('tennis: correzione su Vincente incontro con complementare automatica', () => {
  const tennis = raccoltaTennis([alcarazSinnerProva()]);
  const noti = { ...notizie([corr(TENNIS1, 'Vincente incontro', 'Carlos Alcaraz', 0.03)]), partiteControllate: [P1, P2, TENNIS1] };
  const d = dirTemp({ tennis, noti });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const cand = leggi(d).candidati;
  const alc = cand.find((x) => x.id === `${TENNIS1}-vincente-incontro-carlos-alcaraz`);
  const sin = cand.find((x) => x.id === `${TENNIS1}-vincente-incontro-jannik-sinner`);
  assert.ok(Math.abs(alc.correzioneNotizie.delta - 0.03) < 1e-9);
  assert.ok(Math.abs(alc.prob - (0.5 * 0.51 + 0.5 * 0.48)) < 1e-9);
  assert.ok(Math.abs(sin.correzioneNotizie.delta + 0.03) < 1e-9);
  assert.equal(alc.sport, 'tennis');
});

test('tennis: correzione oltre il massimo → errore, nessun file', () => {
  const noti = { ...notizie([corr(TENNIS1, 'Vincente incontro', 'Carlos Alcaraz', 0.12)]), partiteControllate: [P1, P2, TENNIS1] };
  const d = dirTemp({ tennis: raccoltaTennis([alcarazSinnerProva()]), noti });
  assert.throws(() => eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' }), /Vincente incontro/);
  assert.deepEqual(fs.readdirSync(path.join(d, 'giornate')), []);
});

test('raccolta tennis mancante: errore in erroriGiro, calcio invariato', () => {
  const d = dirTemp({ tennis: null });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const g = leggi(d);
  assert.equal(g.erroriGiro.filter((x) => x === RIGA_TENNIS).length, 1);
  assert.ok(g.candidati.length > 0);
  assert.ok(g.candidati.every((c) => c.sport === 'calcio'));
  const d2 = dirTemp({});
  eseguiGiro({ dirData: d2, adesso: ADESSO, modo: 'claude' });
  assert.deepEqual({ ...g, erroriGiro: g.erroriGiro.filter((x) => x !== RIGA_TENNIS) }, leggi(d2));
});

test('tennis solo Pinnacle (pesoModello e probModello nulli): probabilità = Pinnacle, nessun errore', () => {
  const p = partitaTennis('Jannik Sinner', 'Carlos Alcaraz', [
    mTennis('Jannik Sinner', null, 0.52, 2.05), mTennis('Carlos Alcaraz', null, 0.48, 1.85)],
  { pesoModello: null, elo: null, superficie: null, bestOf: null, ragionamentoBase: ['Elo non disponibile: solo Pinnacle'] });
  const noti = { ...notizie(), partiteControllate: [P1, P2, p.idPartita] };
  const d = dirTemp({ tennis: raccoltaTennis([p]), noti });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const c = leggi(d).candidati.find((x) => x.id === `${p.idPartita}-vincente-incontro-jannik-sinner`);
  assert.ok(Math.abs(c.prob - 0.52) < 1e-12);
  assert.equal(c.ragionamento[1], 'Solo Pinnacle, probabilità usata 52%');
});

function alcarazSinnerProva() {
  return partitaTennis('Jannik Sinner', 'Carlos Alcaraz', [
    mTennis('Jannik Sinner', 0.52, 0.52, 2.05), mTennis('Carlos Alcaraz', 0.48, 0.48, 2.10)]);
}

// --- Basket (Fase 4c) ---
test('basket: candidati con sport "basket", correzione su Vincente con complementare automatica', () => {
  const basket = raccoltaBasket();
  const noti = { ...notizie([corr(BASKET1, 'Vincente', 'Real Madrid', -0.04)]), partiteControllate: [P1, P2, BASKET1] };
  const d = dirTemp({ basket, noti });
  eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' });
  const g = leggi(d);
  const c = g.candidati.filter((x) => x.sport === 'basket');
  assert.ok(c.length > 0);
  assert.equal(c[0].competizione, 'Eurolega');
  const madrid = c.find((x) => x.selezione === 'Real Madrid');
  assert.ok(Math.abs(madrid.probModello - 0.64) < 1e-9);
  const barca = c.find((x) => x.selezione === 'FC Barcelona');
  if (barca) assert.ok(Math.abs(barca.probModello - 0.36) < 1e-9);
});

test('basket solo mercato: non si corregge, si può escludere', () => {
  const p = madridBarcellona({ modello: 'solo-pinnacle', pesoModello: null });
  p.mercati = p.mercati.map((m) => ({ ...m, probModello: null }));
  const basket = raccoltaBasket([p]);
  const noti = { ...notizie([corr(BASKET1, 'Vincente', 'Real Madrid', -0.04)]), partiteControllate: [P1, P2, BASKET1] };
  const d = dirTemp({ basket, noti });
  assert.throws(() => eseguiGiro({ dirData: d, adesso: ADESSO, modo: 'claude' }), /solo Pinnacle/);
  const escl = { ...notizie([], [{ idPartita: BASKET1, motivo: 'titolare fuori', fonte: 'sito del club, 08:10' }]), partiteControllate: [P1, P2, BASKET1] };
  const d2 = dirTemp({ basket, noti: escl });
  eseguiGiro({ dirData: d2, adesso: ADESSO, modo: 'claude' });
  assert.ok(!leggi(d2).giocate.some((x) => x.sport === 'basket'));
});
