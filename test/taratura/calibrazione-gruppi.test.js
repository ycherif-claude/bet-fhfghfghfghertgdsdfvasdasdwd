// Correzioni B1 e B2: calibrazione monotona (isotonica) con soglia sul limite inferiore di Wilson,
// tabelle separate per gruppo di competizioni (principali, seconde serie, extra, coppe).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isotonica, wilsonInferiore, fasceIsotoniche } from '../../src/taratura/isotonica.js';
import { calibrazioneCalcio, storicoLega } from '../../src/taratura/calibrazione.js';
import { COMPETIZIONI, gruppoCompetizione, GRUPPI_CALIBRAZIONE } from '../../src/calcio/competizioni.js';
import { fasciaCalibrata, probCalibrata, pronosticiPartita, gruppoCalibrazione, righeIstantanea } from '../../src/regole/pronostici.js';
import { testoPronostici } from '../../src/notifiche/telegram.js';
import { CONFIG } from '../../src/config.js';

const vicino = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// ---------- B1: isotonica e Wilson ----------

test('B1 isotonica (pool adjacent violators, pesata con n): le fasce non scendono mai', () => {
  const v = isotonica([{ n: 100, vera: 0.85 }, { n: 100, vera: 0.8 }, { n: 200, vera: 0.9 }]);
  vicino(v[0], 0.825);
  vicino(v[1], 0.825);
  vicino(v[2], 0.9);
  // Due violazioni di fila: si uniscono tre fasce, pesate con n.
  const w = isotonica([{ n: 300, vera: 0.9 }, { n: 100, vera: 0.8 }, { n: 100, vera: 0.7 }, { n: 50, vera: 0.95 }]);
  vicino(w[0], (270 + 80 + 70) / 500);
  vicino(w[2], (270 + 80 + 70) / 500);
  vicino(w[3], 0.95);
  // Già monotona: non cambia.
  assert.deepEqual(isotonica([{ n: 10, vera: 0.5 }, { n: 10, vera: 0.6 }]), [0.5, 0.6]);
});

test('B1 limite inferiore di Wilson al 95%', () => {
  vicino(wilsonInferiore(0.85, 100), 0.7672, 1e-3);
  vicino(wilsonInferiore(0.9, 1000), 0.8798, 1e-3);
  assert.equal(wilsonInferiore(0.9, 0), 0);
  assert.ok(wilsonInferiore(0.82, 400) < 0.8);
  assert.ok(wilsonInferiore(0.82, 4000) > 0.8);
});

test('B1 fasceIsotoniche: solo le fasce con almeno minCampioni casi, isotonica e limite di Wilson', () => {
  const f = fasceIsotoniche([
    { da: 0.8, n: 1000, vera: 0.88 }, { da: 0.75, n: 1000, vera: 0.83 }, { da: 0.85, n: 1000, vera: 0.86 }, { da: 0.9, n: 20, vera: 0.5 },
  ], 60);
  assert.deepEqual(f.map((x) => x.da), [0.75, 0.8, 0.85]);
  vicino(f[1].isotonica, 0.87);
  vicino(f[2].isotonica, 0.87);
  vicino(f[2].limite, wilsonInferiore(0.87, 1000));
});

test('B1 fasciaCalibrata: probabilità isotonica, limite di Wilson e n della fascia', () => {
  const fasce = [{ da: 0.7, n: 500, vera: 0.74 }, { da: 0.75, n: 400, vera: 0.82 }, { da: 0.8, n: 30, vera: 0.6 }, { da: 0.85, n: 900, vera: 0.8 }];
  const monotone = fasce.slice(0, 3);
  const a = fasciaCalibrata(monotone, 0.78);
  vicino(a.prob, 0.82);
  assert.equal(a.n, 400);
  vicino(a.limite, wilsonInferiore(0.82, 400));
  vicino(probCalibrata(monotone, 0.83), 0.82); // fascia con pochi casi: si usa quella sotto
  // La fascia 0,85 (80%) è sotto la 0,75 (82%): l'isotonica le unisce.
  const unita = (0.82 * 400 + 0.8 * 900) / 1300;
  const b = fasciaCalibrata(fasce, 0.9);
  vicino(b.prob, unita);
  assert.equal(b.n, 900);
  vicino(fasciaCalibrata(fasce, 0.78).prob, unita);
  assert.equal(probCalibrata(fasce, 0.6), null);
});

test('B1 pronostici: la soglia probMinima vale per il limite di Wilson, non per la stima; n e limite nel pronostico', () => {
  const partita = (mercati) => ({ sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Lecce', casa: 'Inter', trasferta: 'Lecce', mercati });
  const sel = (probModello) => [{ mercato: 'Doppia chance', selezione: '1X', probModello, quota: null }];
  const pochi = { calcio: { principali: { 'Doppia chance|1X': [{ da: 0.75, n: 400, vera: 0.82 }] } } };
  assert.deepEqual(pronosticiPartita(partita(sel(0.8)), pochi), []); // 82% su 400: limite 78%
  const tanti = { calcio: { principali: { 'Doppia chance|1X': [{ da: 0.75, n: 4000, vera: 0.82 }] } } };
  const [p] = pronosticiPartita(partita(sel(0.8)), tanti);
  assert.equal(p.prob, 0.82);
  assert.equal(p.n, 4000);
  assert.ok(p.limite >= CONFIG.pronostici.probMinima && p.limite < 0.82);
  // L'istantanea li tiene.
  const [r] = righeIstantanea([{ idPartita: 'x', partita: 'Inter - Lecce', inizio: '2026-10-25T18:00:00Z', pronostici: [p] }]);
  assert.equal(r.n, 4000);
  assert.equal(r.limite, p.limite);
});

test('B1 Telegram: n della fascia accanto alla percentuale', () => {
  const g = { data: '2026-10-25', pronostici: [{ sport: 'calcio', partita: 'Inter - Lecce', inizio: '2026-10-25T18:00:00Z', pronostici: [
    { testo: 'Inter non perde (1X)', prob: 0.82, n: 4000, quotaMinima: 1.22, quota: null },
  ] }] };
  assert.match(testoPronostici(g, '2026-10-25'), /82% su 4\.000 partite/);
});

// ---------- B2: gruppi ----------

test('B2 gruppi: principali, seconde serie, i 25 campionati extra, coppe', () => {
  assert.deepEqual(GRUPPI_CALIBRAZIONE, ['principali', 'secondeSerie', 'extra', 'coppe']);
  assert.equal(gruppoCompetizione('Serie A'), 'principali');
  assert.equal(gruppoCompetizione('Premier League'), 'principali');
  assert.equal(gruppoCompetizione('Eredivisie'), 'principali');
  assert.equal(gruppoCompetizione('Championship'), 'secondeSerie');
  assert.equal(gruppoCompetizione('Serie B'), 'secondeSerie');
  assert.equal(gruppoCompetizione('League One'), 'extra');
  assert.equal(gruppoCompetizione('MLS (Stati Uniti)'), 'extra');
  assert.equal(gruppoCompetizione('Conference League'), 'coppe');
  assert.equal(gruppoCompetizione('Nations League'), null);
  assert.equal(COMPETIZIONI.filter((c) => c.gruppo === 'extra').length, 25);
  assert.equal(gruppoCalibrazione({ competizione: 'Europa League', modello: 'elo-europeo' }), 'coppe');
  assert.equal(gruppoCalibrazione({ competizione: 'Serie B', modello: 'dixon-coles' }), 'secondeSerie');
  assert.equal(gruppoCalibrazione({ competizione: 'Sconosciuta' }), null);
});

test('B2 pronostici: ogni gruppo usa la sua tabella; un gruppo senza dati sufficienti non produce pronostici', () => {
  const fasce = [{ da: 0.75, n: 4000, vera: 0.85 }];
  const cal = {
    calcio: { principali: { 'Doppia chance|1X': fasce }, secondeSerie: { 'Doppia chance|1X': [{ da: 0.75, n: 59, vera: 0.95 }] } },
    coppe: { 'Doppia chance|1X': [{ da: 0.75, n: 3000, vera: 0.9 }] },
  };
  const partita = (competizione, extra = {}) => ({ sport: 'calcio', competizione, partita: 'A - B', casa: 'A', trasferta: 'B',
    mercati: [{ mercato: 'Doppia chance', selezione: '1X', probModello: 0.8, quota: null }], ...extra });
  assert.equal(pronosticiPartita(partita('Serie A'), cal)[0].prob, 0.85);
  assert.deepEqual(pronosticiPartita(partita('Serie B'), cal), []); // n < minCampioniFascia
  assert.deepEqual(pronosticiPartita(partita('League One'), cal), []); // gruppo extra senza tabella
  assert.equal(pronosticiPartita(partita('Europa League', { modello: 'elo-europeo' }), cal)[0].prob, 0.9);
  // Vecchio formato (una tabella per tutto il calcio): nessun pronostico, non si mescolano i gruppi.
  assert.deepEqual(pronosticiPartita(partita('Serie A'), { calcio: { 'Doppia chance|1X': fasce } }), []);
});

// Storico finto: 10 squadre, andata e ritorno, gol pseudo-casuali con squadre forti e deboli.
function stagione(anno, squadre, formato) {
  let seme = anno * 7919;
  const caso = () => { seme = (seme * 16807) % 2147483647; return seme / 2147483647; };
  const poisson = (l) => { let k = 0; let p = Math.exp(-l); let s = p; const u = caso(); while (u > s && k < 10) { k++; p *= l / k; s += p; } return k; };
  const righe = [];
  let giorno = 0;
  for (const c of squadre) {
    for (const t of squadre) {
      if (c === t) continue;
      const d = new Date(Date.UTC(anno, 7, 10) + giorno * 86400000 * 1.5);
      giorno++;
      const gg = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
      const forza = (s) => 0.6 + squadre.indexOf(s) * 0.2;
      const gc = poisson(forza(c) * 1.2 / forza(t) * 1.1);
      const gt = poisson(forza(t) / forza(c) * 1.1);
      righe.push(formato === 'extra'
        ? `X,L,${anno}/${anno + 1},${gg},15:00,${c},${t},${gc},${gt},${gc > gt ? 'H' : gc < gt ? 'A' : 'D'}`
        : `E0,${gg},${c},${t},${gc},${gt},${gc > gt ? 'H' : gc < gt ? 'A' : 'D'},0,0`);
    }
  }
  return righe;
}

test('B2 calibrazioneCalcio: una tabella per gruppo; i campionati extra si leggono dal file unico <codice>.csv', () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-calibrazione-'));
  const squadre = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const stagioni = ['2021', '2122', '2223', '2324', '2425', '2526'];
  for (const s of stagioni) {
    const anno = 2000 + Number(s.slice(0, 2));
    writeFileSync(join(d, `E0_${s}.csv`), ['Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG', ...stagione(anno, squadre, 'std')].join('\n'));
  }
  const extra = ['Country,League,Season,Date,Time,Home,Away,HG,AG,Res'];
  for (const s of stagioni) extra.push(...stagione(2000 + Number(s.slice(0, 2)), squadre, 'extra'));
  writeFileSync(join(d, 'AUT.csv'), extra.join('\n'));

  const aut = storicoLega(d, COMPETIZIONI.find((c) => c.csv === 'AUT'));
  assert.deepEqual([...aut.keys()].sort(), stagioni);
  assert.equal(aut.get('2324').length, 56);

  const r = calibrazioneCalcio(d);
  assert.deepEqual(Object.keys(r).sort(), ['extra', 'principali']);
  const tot = (t) => Object.values(t).flat().reduce((a, f) => a + f.n, 0);
  assert.ok(tot(r.principali) > 0 && tot(r.extra) > 0);
  // Ogni fascia ha anche isotonica e limite (null se ha meno di minCampioniFascia casi).
  for (const f of Object.values(r.principali).flat()) {
    assert.ok('isotonica' in f && 'limite' in f);
    if (f.n < CONFIG.pronostici.minCampioniFascia) assert.equal(f.limite, null);
  }
});
