import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  phi, stimaForzeNba, puntiAttesi, backToBack, mercatiNba, pesoModelloPartita, formattaLinea,
} from '../../src/nba/modello.js';
import { CONFIG } from '../../src/config.js';

const vicino = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} atteso ${b} ± ${tol}, ottenuto ${a}`);
const forzeFisse = (sdMargine = 12.5, sdTotale = 18) => ({ sdMargine, sdTotale });
const NOMI = { casa: 'Boston Celtics', trasferta: 'New York Knicks' };
const trova = (righe, mercato, selezione) => {
  const r = righe.find((x) => x.mercato === mercato && x.selezione === selezione);
  assert.ok(r, `manca ${mercato} | ${selezione}`);
  return r.probModello;
};

// Generatore pseudo-casuale con seme (mulberry32) e normale di Box-Muller.
function casuale(seme) {
  let a = seme >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { u, n: () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u()) };
}
const piuGiorni = (data, n) => new Date(Date.parse(`${data}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Campionato sintetico: ogni giorno metà delle squadre gioca, ciclando su tutte le coppie ordinate
// (ogni squadra incontra tutte le altre sia in casa sia in trasferta).
function campionato({ squadre, giorni, inizio, stagione, att, dif, casa = 1.02, media = 112, rumore = 0, seme = 1 }) {
  const r = casuale(seme);
  const coppie = [];
  for (let i = 0; i < squadre.length; i++) for (let j = 0; j < squadre.length; j++) if (i !== j) coppie.push([i, j]);
  const out = [];
  let id = 0;
  for (let g = 0; g < giorni; g++) {
    const data = piuGiorni(inizio, g);
    for (let k = 0; k < squadre.length / 2; k++) {
      const [ic, it] = coppie[id % coppie.length];
      const lc = media * att[ic] * dif[it] * casa;
      const lt = media * att[it] * dif[ic];
      let pc = Math.round(lc + rumore * r.n());
      const pt = Math.round(lt + rumore * r.n());
      if (pc === pt) pc += 1;
      out.push({
        id: id++, dataUsa: data, inizio: null, casa: squadre[ic], trasferta: squadre[it],
        puntiCasa: pc, puntiTrasferta: pt, finita: true, stagione, postseason: false,
      });
    }
  }
  return out;
}
const SQ4 = ['Boston Celtics', 'New York Knicks', 'Miami Heat', 'Chicago Bulls'];

test('Φ: valori noti', () => {
  vicino(phi(0), 0.5, 1e-7);
  vicino(phi(1.96), 0.9750021, 1e-6);
  vicino(phi(-1), 0.1586553, 1e-6);
  vicino(phi(1) + phi(-1), 1, 1e-9);
  vicino(phi(8), 1, 1e-9);
  vicino(phi(-8), 0, 1e-9);
});

test('Φ: Vincente casa + Vincente trasferta = 1', () => {
  for (const [c, t] of [[110, 110], [118, 109], [101, 115.5]]) {
    const r = mercatiNba({ casa: c, trasferta: t }, { handicap: [], totale: [] }, forzeFisse(), NOMI);
    vicino(trova(r, 'Vincente', 'Boston Celtics') + trova(r, 'Vincente', 'New York Knicks'), 1, 1e-9);
  }
});

test('μ margine 0: Handicap 0 casa ≈ 0.5, Vincente casa ≈ 0.5', () => {
  const r = mercatiNba({ casa: 112, trasferta: 112 }, { handicap: [0], totale: [] }, forzeFisse(), NOMI);
  vicino(trova(r, 'Handicap 0', 'casa'), 0.5, 1e-6);
  vicino(trova(r, 'Handicap 0', 'trasferta'), 0.5, 1e-6);
  vicino(trova(r, 'Vincente', 'Boston Celtics'), 0.5, 1e-6);
});

test('μ margine +6, σ 12.5: Handicap -4.5 casa ≈ 0.53 ± 0.02', () => {
  const r = mercatiNba({ casa: 116, trasferta: 110 }, { handicap: [-4.5], totale: [] }, forzeFisse(), NOMI);
  const p = trova(r, 'Handicap -4.5', 'casa');
  vicino(p, 0.53, 0.02);
  vicino(p + trova(r, 'Handicap -4.5', 'trasferta'), 1, 1e-9);
});

test('Totale 220.5 con μ 230: Over > 0.69', () => {
  const r = mercatiNba({ casa: 116, trasferta: 114 }, { handicap: [], totale: [220.5] }, forzeFisse(), NOMI);
  const over = trova(r, 'Totale punti 220.5', 'Over 220.5');
  assert.ok(over > 0.69, `Over ${over}`);
  vicino(over + trova(r, 'Totale punti 220.5', 'Under 220.5'), 1, 1e-9);
});

test('linea intera 221: probabilità condizionata, Over + Under = 1', () => {
  const att = { casa: 112, trasferta: 109 };
  const r = mercatiNba(att, { handicap: [+3, -3], totale: [221] }, forzeFisse(), NOMI);
  const over = trova(r, 'Totale punti 221', 'Over 221');
  vicino(over + trova(r, 'Totale punti 221', 'Under 221'), 1, 1e-9);
  // μ = 221 esatto: per simmetria Over = 0.5 anche con il rimborso.
  vicino(trova(mercatiNba({ casa: 111, trasferta: 110 }, { handicap: [], totale: [221] }, forzeFisse(), NOMI),
    'Totale punti 221', 'Over 221'), 0.5, 1e-6);
  // Condizionata: P(>221) / (1 − P(=221)), più grande della semplice P(>221).
  const sopra = 1 - phi((221.5 - 221) / 18);
  const pari = phi((221.5 - 221) / 18) - phi((220.5 - 221) / 18);
  vicino(over, sopra / (1 - pari), 1e-9);
  vicino(trova(r, 'Handicap +3', 'casa') + trova(r, 'Handicap +3', 'trasferta'), 1, 1e-9);
  vicino(trova(r, 'Handicap -3', 'casa') + trova(r, 'Handicap -3', 'trasferta'), 1, 1e-9);
  // μ margine 3 con handicap -3: simmetria → 0.5.
  vicino(trova(r, 'Handicap -3', 'casa'), 0.5, 1e-6);
});

test('nomi dei mercati e formato delle linee', () => {
  assert.equal(formattaLinea(-4.5), '-4.5');
  assert.equal(formattaLinea(3), '+3');
  assert.equal(formattaLinea(0), '0');
  assert.equal(formattaLinea(-0), '0');
  const r = mercatiNba({ casa: 115, trasferta: 108 }, { handicap: [-4.5, 3, 0], totale: [221.5, 221] }, forzeFisse(), NOMI);
  assert.deepEqual(r.map((x) => `${x.mercato}|${x.selezione}`), [
    'Vincente|Boston Celtics', 'Vincente|New York Knicks',
    'Handicap -4.5|casa', 'Handicap -4.5|trasferta',
    'Handicap +3|casa', 'Handicap +3|trasferta',
    'Handicap 0|casa', 'Handicap 0|trasferta',
    'Totale punti 221.5|Over 221.5', 'Totale punti 221.5|Under 221.5',
    'Totale punti 221|Over 221', 'Totale punti 221|Under 221',
  ]);
  assert.throws(() => mercatiNba({ casa: 1, trasferta: 1 }, { handicap: [], totale: [] }, forzeFisse()), /nomi/);
});

test('probabilità limitate a [1e-6, 1 − 1e-6]', () => {
  const r = mercatiNba({ casa: 160, trasferta: 80 }, { handicap: [-0.5], totale: [100.5] }, forzeFisse(), NOMI);
  assert.equal(trova(r, 'Vincente', 'New York Knicks'), 1e-6);
  assert.equal(trova(r, 'Vincente', 'Boston Celtics'), 1 - 1e-6);
  assert.equal(trova(r, 'Totale punti 100.5', 'Under 100.5'), 1e-6);
});

test('back-to-back: il margine si sposta di 1.5, il totale no', () => {
  const partite = campionato({ squadre: SQ4, giorni: 20, inizio: '2026-10-01', stagione: 2026,
    att: [1.05, 1, 0.97, 0.98], dif: [0.95, 1, 1.03, 1.02] });
  const forze = stimaForzeNba(partite, { oggi: '2026-10-21', stagioneCorrente: 2026 });
  const base = puntiAttesi(forze, SQ4[0], SQ4[1]);
  const stancaCasa = puntiAttesi(forze, SQ4[0], SQ4[1], { b2bCasa: true, b2bTrasferta: false });
  const stancaTrasf = puntiAttesi(forze, SQ4[0], SQ4[1], { b2bTrasferta: true });
  const entrambe = puntiAttesi(forze, SQ4[0], SQ4[1], { b2bCasa: true, b2bTrasferta: true });
  const m = (x) => x.casa - x.trasferta;
  const s = (x) => x.casa + x.trasferta;
  vicino(m(base) - m(stancaCasa), 1.5, 1e-9);
  vicino(m(stancaTrasf) - m(base), 1.5, 1e-9);
  vicino(s(stancaCasa), s(base), 1e-9);
  vicino(s(stancaTrasf), s(base), 1e-9);
  vicino(m(entrambe), m(base), 1e-9);
  assert.equal(puntiAttesi(forze, SQ4[0], 'Seattle SuperSonics'), null);
});

test('backToBack: partita il giorno americano precedente, anche a cavallo del mese', () => {
  const p = [
    { dataUsa: '2026-10-31', casa: 'Boston Celtics', trasferta: 'Miami Heat', finita: true },
    { dataUsa: '2026-10-29', casa: 'Chicago Bulls', trasferta: 'New York Knicks', finita: true },
  ];
  assert.equal(backToBack(p, 'Boston Celtics', '2026-11-01'), true);
  assert.equal(backToBack(p, 'Miami Heat', '2026-11-01'), true);
  assert.equal(backToBack(p, 'New York Knicks', '2026-11-01'), false);
  assert.equal(backToBack(p, 'Chicago Bulls', '2026-10-30'), true);
  assert.equal(backToBack(p, 'Boston Celtics', '2026-10-31'), false);
});

test('squadra con 2 partite in stagione: punti attesi tra 85 e 140, pesoModello 0.25', () => {
  const prec = campionato({ squadre: SQ4, giorni: 60, inizio: '2026-02-01', stagione: 2025,
    att: [1, 1, 1, 1], dif: [1, 1, 1, 1], rumore: 10, seme: 7 });
  // Stagione nuova: 2 partite estreme per i Celtics.
  const nuove = [
    { id: 1, dataUsa: '2026-10-21', casa: 'Boston Celtics', trasferta: 'Miami Heat', puntiCasa: 160, puntiTrasferta: 78, finita: true, stagione: 2026, postseason: false },
    { id: 2, dataUsa: '2026-10-23', casa: 'Chicago Bulls', trasferta: 'Boston Celtics', puntiCasa: 70, puntiTrasferta: 155, finita: true, stagione: 2026, postseason: false },
    { id: 3, dataUsa: '2026-10-25', casa: 'Boston Celtics', trasferta: 'Chicago Bulls', puntiCasa: null, puntiTrasferta: null, finita: false, stagione: 2026, postseason: false },
  ];
  const forze = stimaForzeNba([...prec, ...nuove], { oggi: '2026-10-25', stagioneCorrente: 2026 });
  assert.equal(forze.partiteStagione.get('Boston Celtics'), 2);
  assert.equal(forze.partiteStagione.get('New York Knicks'), 0);
  for (const [c, t] of [['Boston Celtics', 'Chicago Bulls'], ['Miami Heat', 'Boston Celtics'], ['Chicago Bulls', 'New York Knicks']]) {
    const a = puntiAttesi(forze, c, t);
    for (const v of [a.casa, a.trasferta]) assert.ok(v > 85 && v < 140, `${c}-${t}: ${v}`);
  }
  assert.equal(pesoModelloPartita(forze, 'Boston Celtics', 'Chicago Bulls'), 0.25);
  assert.equal(pesoModelloPartita(forze, 'Boston Celtics', 'Squadra ignota'), 0.25);
});

test('pesoModelloPartita: 0.5 se entrambe hanno almeno 10 partite', () => {
  const partite = campionato({ squadre: SQ4, giorni: 30, inizio: '2026-10-21', stagione: 2026,
    att: [1, 1, 1, 1], dif: [1, 1, 1, 1], rumore: 10 });
  const forze = stimaForzeNba(partite, { oggi: '2026-11-20', stagioneCorrente: 2026 });
  assert.ok(forze.partiteStagione.get(SQ4[0]) >= CONFIG.nba.minPartiteStagione);
  assert.equal(pesoModelloPartita(forze, SQ4[0], SQ4[1]), CONFIG.nba.pesoModello);
  const poche = { partiteStagione: new Map([[SQ4[0], 30], [SQ4[1], 9]]) };
  assert.equal(pesoModelloPartita(poche, SQ4[0], SQ4[1]), CONFIG.nba.pesoModelloInizio);
});

test('regressione di stagione: una squadra forte l\'anno scorso parte con attacco più vicino a 1', () => {
  const att = [1.15, 1, 0.93, 0.92];
  const dif = [0.88, 1, 1.06, 1.06];
  const prec = campionato({ squadre: SQ4, giorni: 80, inizio: '2026-01-20', stagione: 2025, att, dif });
  // Nessuna partita della stagione corrente: le forze sono quelle riportate verso 1.
  const forze = stimaForzeNba(prec, { oggi: '2026-10-20', stagioneCorrente: 2026 });
  const a = forze.attacco.get('Boston Celtics');
  const d = forze.difesa.get('Boston Celtics');
  // Media 1 sulle quattro squadre: il vero attacco relativo è 1.15/1 → 1.15.
  vicino(a, 1 + (att[0] - 1) * (1 - CONFIG.nba.regressioneStagione), 0.01, 'attacco');
  vicino(d, 1 + (dif[0] - 1) * (1 - CONFIG.nba.regressioneStagione), 0.01, 'difesa');
  assert.ok(a > 1 && a < att[0] - 0.02);
  // Senza la stagione precedente come tale, la stessa squadra è stimata quasi al valore vero.
  const comeCorrente = stimaForzeNba(prec, { oggi: '2026-04-10', stagioneCorrente: 2025 });
  assert.ok(comeCorrente.attacco.get('Boston Celtics') > a);
  // Stagioni più vecchie della precedente non si usano.
  const vecchia = stimaForzeNba(prec, { oggi: '2027-10-20', stagioneCorrente: 2027 });
  assert.equal(vecchia.attacco.size, 0);
});

test('sdMargine e sdTotale: valori iniziali sotto le 100 partite, dai residui sopra', () => {
  const poche = campionato({ squadre: SQ4, giorni: 20, inizio: '2026-10-21', stagione: 2026,
    att: [1, 1, 1, 1], dif: [1, 1, 1, 1], rumore: 3 });
  assert.ok(poche.length < 100);
  const f1 = stimaForzeNba(poche, { oggi: '2026-11-10', stagioneCorrente: 2026 });
  assert.equal(f1.sdMargine, CONFIG.nba.sdMargine);
  assert.equal(f1.sdTotale, CONFIG.nba.sdTotale);
  // Rumore 10 su ciascun punteggio: sd del margine e del totale ≈ 10·√2 ≈ 14.1.
  const molte = campionato({ squadre: [...SQ4, 'Miami Heat 2', 'X', 'Y', 'Z'], giorni: 150, inizio: '2026-10-21',
    stagione: 2026, att: [1.05, 1, 0.95, 1, 1.02, 0.98, 1, 1], dif: [0.95, 1, 1.05, 1, 0.98, 1.02, 1, 1], rumore: 10, seme: 3 });
  const f2 = stimaForzeNba(molte, { oggi: '2027-03-20', stagioneCorrente: 2026 });
  vicino(f2.sdMargine, 14.1, 1.2, 'sdMargine');
  vicino(f2.sdTotale, 14.1, 1.2, 'sdTotale');
  vicino(f2.mediaPunti, 112, 3, 'mediaPunti');
  vicino(f2.casa, 1.02, 0.01, 'casa');
});

test('nessuna partita: forze vuote e valori iniziali', () => {
  const f = stimaForzeNba([], { oggi: '2026-10-20', stagioneCorrente: 2026 });
  assert.equal(f.attacco.size, 0);
  assert.equal(f.sdMargine, CONFIG.nba.sdMargine);
  assert.equal(puntiAttesi(f, 'Boston Celtics', 'Miami Heat'), null);
});
