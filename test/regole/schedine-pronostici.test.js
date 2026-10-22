// Idea 4 [utente, 22/10/2026]: doppie e triple dai pronostici migliori di partite diverse, quota totale
// 1,50–2,00, ordinate per probabilità combinata prudente, senza gambe in comune; in prova "PROVA – non giocare",
// dopo la prova solo gambe ✅. Esito: tutte le gambe vinte (una rimborsata si toglie e si ricalcola la quota).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { costruisciSchedinePronostici, esitoSchedina } from '../../src/regole/schedine-pronostici.js';
import { fileIstantanea, righeIstantanea } from '../../src/regole/pronostici.js';
import { aggiornaRegistro } from '../../src/registro/registro.js';
import { eseguiGiro } from '../../src/giro/giro.js';
import { messaggi, messaggiSchedinePronostici } from '../../src/notifiche/telegram.js';

let n = 0;
// Partita con un pronostico migliore (quota minima `minima`, prob prudente `limite`) e uno no.
const partita = (casa, trasferta, minima, limite, extra = {}) => {
  n++;
  return {
    idPartita: `calcio-2026-10-25-${casa}-${trasferta}`.toLowerCase(), sport: 'calcio', competizione: 'Serie A', partita: `${casa} - ${trasferta}`,
    inizio: `2026-10-25T${String(12 + (n % 8)).padStart(2, '0')}:00:00+02:00`,
    pronostici: [
      { mercato: '1X2', selezione: '1', testo: `Vince ${casa}`, prob: limite + 0.03, limite, n: 500, quotaMinima: minima, quota: null, probMercato: null, giocabile: false, esito: null, migliore: true, ...extra },
      { mercato: 'Under/Over 1.5', selezione: 'Over 1.5', testo: 'Almeno 2 gol', prob: 0.9, limite: 0.88, n: 500, quotaMinima: 1.12, quota: null, giocabile: false, esito: null, migliore: false },
    ],
  };
};

test('schedine: solo migliori di partite diverse, quota 1,50–2,00, ordinate per probabilità combinata, nessuna gamba in comune', () => {
  const lista = [
    partita('A', 'B', 1.25, 0.84), partita('C', 'D', 1.24, 0.85), partita('E', 'F', 1.22, 0.86),
    partita('G', 'H', 1.30, 0.80), partita('I', 'L', 1.21, 0.86), partita('M', 'N', 1.06, 0.95),
  ];
  const s = costruisciSchedinePronostici(lista, { data: '2026-10-25', prova: true });
  assert.ok(s.length >= 1 && s.length <= 3);
  for (const x of s) {
    assert.ok(x.gambe.length >= 2 && x.gambe.length <= 3);
    assert.ok(x.quota >= 1.5 && x.quota <= 2, `quota ${x.quota}`);
    assert.equal(new Set(x.gambe.map((g) => g.idPartita)).size, x.gambe.length);
    assert.ok(x.gambe.every((g) => g.mercato === '1X2'), 'solo i migliori');
    assert.equal(x.prova, true);
    assert.equal(x.etichetta, 'PROVA – non giocare');
    assert.equal(x.tipo, x.gambe.length === 2 ? 'doppia' : 'tripla');
    // Senza quota: la minima, da verificare.
    assert.ok(x.gambe.every((g) => g.quotaDaVerificare === true));
  }
  const usate = s.flatMap((x) => x.gambe.map((g) => g.idPartita));
  assert.equal(new Set(usate).size, usate.length, 'nessuna gamba in comune');
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].probCombinata >= s[i].probCombinata);
  // La prima è la combinazione valida con la probabilità combinata più alta: 0,85 × 0,86 = 0,731 (C-D con E-F
  // o con I-L: a parità vince la quota più alta, 1,24 × 1,22 = 1,51); la tripla M-N, E-F, I-L fa solo 0,703.
  // Poi A-B con I-L (0,722); G-H e M-N insieme fanno 1,38: niente terza.
  assert.deepEqual(s.map((x) => x.gambe.map((g) => g.partita).sort()), [['C - D', 'E - F'], ['A - B', 'I - L']]);
  assert.ok(Math.abs(s[0].probCombinata - 0.85 * 0.86) < 1e-4);
  assert.equal(s[0].quota, 1.51);
});

test('schedine: mai due partite della stessa squadra; quota reale se c\'è', () => {
  const lista = [partita('Inter', 'Roma', 1.25, 0.84), partita('Roma', 'Lazio', 1.25, 0.84, { quota: 1.3 }), partita('Milan', 'Lazio', 1.3, 0.8)];
  const s = costruisciSchedinePronostici(lista, { data: '2026-10-25', prova: true });
  for (const x of s) {
    const squadre = x.gambe.flatMap((g) => g.partita.split(' - '));
    assert.equal(new Set(squadre).size, squadre.length, x.gambe.map((g) => g.partita).join(' + '));
  }
  const conQuota = s.flatMap((x) => x.gambe).find((g) => g.partita === 'Roma - Lazio');
  if (conQuota) { assert.equal(conQuota.quota, 1.3); assert.equal(conQuota.quotaDaVerificare, false); }
});

test('schedine dopo la prova: solo gambe ✅, altrimenti nessuna; mai prova', () => {
  const senza = [partita('A', 'B', 1.25, 0.84), partita('C', 'D', 1.24, 0.85)];
  assert.deepEqual(costruisciSchedinePronostici(senza, { data: '2026-11-20', prova: false }), []);
  const ok = { quota: 1.3, probMercato: 0.85, giocabile: true };
  const con = [partita('A', 'B', 1.2, 0.84, ok), partita('C', 'D', 1.2, 0.85, ok), partita('E', 'F', 1.2, 0.85)];
  const s = costruisciSchedinePronostici(con, { data: '2026-11-20', prova: false });
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].gambe.map((g) => g.partita), ['A - B', 'C - D']);
  assert.ok(!('prova' in s[0]));
  assert.equal(s[0].quota, 1.69);
});

test('esito: tutte vinte; una persa; una rimborsata si toglie e la quota si ricalcola; aperta', () => {
  const s = { quota: 1.95, gambe: [{ quota: 1.25, esito: 'vinta' }, { quota: 1.2, esito: 'vinta' }, { quota: 1.3, esito: 'vinta' }] };
  assert.deepEqual(esitoSchedina(s), { esito: 'vinta', quotaFinale: 1.95 });
  assert.deepEqual(esitoSchedina({ ...s, gambe: [...s.gambe.slice(0, 2), { quota: 1.3, esito: 'persa' }] }), { esito: 'persa', quotaFinale: 0 });
  assert.deepEqual(esitoSchedina({ ...s, gambe: [...s.gambe.slice(0, 2), { quota: 1.3, esito: 'rimborsata' }] }), { esito: 'vinta', quotaFinale: 1.5 });
  assert.deepEqual(esitoSchedina({ ...s, gambe: s.gambe.map((g) => ({ ...g, esito: 'rimborsata' })) }), { esito: 'rimborsata', quotaFinale: 1 });
  assert.deepEqual(esitoSchedina({ ...s, gambe: [...s.gambe.slice(0, 2), { quota: 1.3, esito: null }] }), { esito: null, quotaFinale: null });
  // Una persa chiude anche con gambe aperte.
  assert.equal(esitoSchedina({ ...s, gambe: [{ quota: 1.2, esito: 'persa' }, { quota: 1.3, esito: null }] }).esito, 'persa');
});

const cartella = () => {
  const d = mkdtempSync(join(tmpdir(), 'bet-schedine-'));
  for (const s of ['raccolta', 'giornate', 'registro', 'segnature', 'taratura']) mkdirSync(join(d, s));
  return d;
};
const leggi = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('giro: schedinePronostici nella giornata e nell\'istantanea; registro: esito dalle gambe', async () => {
  const d = cartella();
  // Fascia larga all'81,5%: limite di Wilson ≥ 80%, quota minima 1,23 (due gambe: 1,51).
  const fasce = [{ da: 0.7, n: 100000, vera: 0.815 }];
  writeFileSync(join(d, 'taratura', 'calibrazione.json'), JSON.stringify({ calcio: { principali: { '1X2|1': fasce } } }));
  const m = (mercato, selezione, probModello) => ({ mercato, selezione, probModello, probPinnacle: null, quota: null, fonteQuota: null, oraQuota: null, frequenzaCampionato: null });
  const p = (casa, trasferta, ora) => ({
    idPartita: `calcio-2026-10-23-${casa}-${trasferta}`.toLowerCase(), competizione: 'Serie A', partita: `${casa} - ${trasferta}`, casa, trasferta,
    inizio: `2026-10-23T${ora}:00+02:00`, modello: 'dixon-coles', lambda: { casa: 2.2, trasferta: 0.6 }, ragionamentoBase: [],
    mercati: [m('1X2', '1', 0.8), m('1X2', 'X', 0.12), m('1X2', '2', 0.08)],
  });
  writeFileSync(join(d, 'raccolta', '2026-10-23.json'), JSON.stringify({
    data: '2026-10-23', generataAlle: '2026-10-23T07:35:00+02:00', crediti: {}, competizioniNonCoperte: [], erroriGiro: [],
    partite: [p('Inter', 'Lecce', '18:00'), p('Napoli', 'Como', '20:45')],
  }));
  const r = eseguiGiro({ dirData: d, adesso: new Date('2026-10-23T07:10:00Z'), modo: 'riserva' });
  const g = r.giornata;
  assert.equal(g.schedinePronostici.length, 1);
  const [s] = g.schedinePronostici;
  assert.equal(s.tipo, 'doppia');
  assert.equal(s.prova, true);
  const ist = leggi(fileIstantanea(d, '2026-10-23'));
  assert.deepEqual(ist.schedine.map((x) => x.id), [s.id]);
  assert.ok(righeIstantanea(g.pronostici).length >= 2);

  // Registro: Inter vince, Napoli vince → schedina vinta (nell'istantanea e nella giornata).
  const summary = (c, t) => ({ header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [
    { homeAway: 'home', score: String(c), linescores: [{ displayValue: String(c) }] }, { homeAway: 'away', score: String(t), linescores: [{ displayValue: String(t) }] },
  ] }] }, boxscore: { teams: [] } });
  const fonti = {
    espn: { partite: async () => [
      { id: '1', casa: 'Inter', trasferta: 'Lecce', inizio: '2026-10-23T16:00:00Z' }, { id: '2', casa: 'Napoli', trasferta: 'Como', inizio: '2026-10-23T18:45:00Z' },
    ] },
    eurolega: { giornata: async () => ({ partite: [] }) },
    thesportsdb: { round: async () => ({ partite: [] }) },
    footballDataUk: { partite: async () => [], partiteExtra: async () => [] },
    opz: { fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(summary(2, 0)) }) },
  };
  await aggiornaRegistro({ dirData: d, adesso: new Date('2026-10-24T05:40:00Z'), fonti });
  const dopo = leggi(fileIstantanea(d, '2026-10-23'));
  assert.equal(dopo.schedine[0].esito, 'vinta');
  assert.equal(dopo.schedine[0].quotaFinale, s.quota);
  const gg = leggi(join(d, 'giornate', '2026-10-23.json'));
  assert.equal(gg.schedinePronostici[0].esito, 'vinta');
});

test('Telegram: messaggio con le schedine (PROVA) una volta, poi l\'esito una volta', () => {
  const schedina = {
    id: 'sp-1', tipo: 'doppia', quota: 1.56, probCombinata: 0.72, prova: true, etichetta: 'PROVA – non giocare', esito: null, quotaFinale: null,
    gambe: [
      { idPartita: 'a', sport: 'calcio', partita: 'A - B', inizio: '2026-10-25T18:00:00Z', testo: 'Vince A', quota: 1.25, quotaDaVerificare: true, esito: null },
      { idPartita: 'c', sport: 'calcio', partita: 'C - D', inizio: '2026-10-25T20:00:00Z', testo: 'Vince C', quota: 1.25, quotaDaVerificare: true, esito: null },
    ],
  };
  const giornata = { data: '2026-10-25', prova: true, giocate: [], pronostici: [], schedinePronostici: [schedina], erroriGiro: [] };
  const inviate = new Set();
  const out = messaggi({ giornata, oggi: '2026-10-25', adesso: new Date('2026-10-25T08:00:00Z'), inviate });
  const m = out.filter((x) => /Doppie e triple/.test(x.testo));
  assert.equal(m.length, 1);
  assert.match(m[0].testo, /PROVA – non giocare/);
  assert.match(m[0].testo, /Vince A/);
  assert.match(m[0].testo, /1,56/);
  assert.match(m[0].testo, /da verificare/);
  for (const x of out) { inviate.add(x.chiave); for (const k of x.segna ?? []) inviate.add(k); }
  assert.ok(!messaggi({ giornata, oggi: '2026-10-25', adesso: new Date('2026-10-25T09:00:00Z'), inviate }).some((x) => /Doppie e triple/.test(x.testo)));
  // Esito.
  const chiusa = { ...giornata, schedinePronostici: [{ ...schedina, esito: 'vinta', quotaFinale: 1.56 }] };
  const [e] = messaggiSchedinePronostici({ giornate: [chiusa], inviate });
  assert.match(e.testo, /vinta|VINTA/);
  assert.match(e.testo, /1,56/);
  inviate.add(e.chiave);
  assert.deepEqual(messaggiSchedinePronostici({ giornate: [chiusa], inviate }), []);
});
