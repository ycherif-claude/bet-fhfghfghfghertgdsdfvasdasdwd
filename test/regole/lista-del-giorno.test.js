import test from 'node:test';
import assert from 'node:assert/strict';
import { costruisciCoppieQuota2, costruisciLista, esitoCoppia, scegliLista } from '../../src/regole/coppie-quota2.js';
import { testoMattinoEssenziale, messaggioIeri, soloEssenziale } from '../../src/notifiche/telegram.js';
import { bigliettiGiornata } from '../../src/storico/biglietti.js';
import { confrontoSettimanale, gruppoDi, lunediDi } from '../../src/registro/confronto-settimanale.js';

const riga = (idPartita, mercato, selezione, quota, probMercato, probModello = probMercato, extra = {}) => ({
  sport: 'calcio', idPartita, partita: `${idPartita} - B`, inizio: '2026-11-04T20:45:00+01:00', mercato, selezione, quota, probMercato, probModello, ...extra,
});
const uno = (id, q, pm, m) => riga(id, '1X2', '1', q, pm, m);
const over = (id, q, pm, m) => riga(id, 'Under/Over 1.5', 'Over 1.5', q, pm, m);

test('lista: solo 1 e Over 1.5 di calcio, quota fra 1,25 e 1,70, modello e mercato d\'accordo', () => {
  const scelte = scegliLista([
    uno('dentro1', 1.5, 0.62),
    over('dentro2', 1.25, 0.75),
    over('limite', 1.7, 0.55),
    over('bassa', 1.24, 0.76),
    uno('alta', 1.71, 0.55),
    uno('disaccordo', 1.5, 0.62, 0.68),
    uno('senzaModello', 1.5, 0.62, null),
    riga('x2', 'Doppia chance', 'X2', 1.5, 0.62),
    riga('squadra', 'Under/Over casa 1.5', 'Over 1.5', 1.5, 0.62),
    { ...uno('nba', 1.5, 0.62), sport: 'nba' },
  ]);
  assert.deepEqual(scelte.map((x) => x.idPartita).sort(), ['dentro1', 'dentro2', 'limite']);
});

test('lista: una giocata per partita, la più probabile, e al massimo 20 in ordine di probabilità', () => {
  assert.equal(scegliLista([uno('a', 1.6, 0.58), over('a', 1.3, 0.72)])[0].mercato, 'Under/Over 1.5');
  const tante = Array.from({ length: 25 }, (_, i) => over(`p${i}`, 1.3, 0.5 + i / 100));
  const scelte = scegliLista(tante);
  assert.equal(scelte.length, 20);
  assert.equal(scelte[0].idPartita, 'p24');
  assert.equal(scelte[19].idPartita, 'p5');
});

test('lista: ogni giocata è una singola con id, in ordine di orario, ed esito della sua partita', () => {
  const dopo = { ...over('dopo', 1.3, 0.75), inizio: '2026-11-04T20:45:00+01:00' };
  const prima = { ...uno('prima', 1.5, 0.6), inizio: '2026-11-04T15:00:00+01:00' };
  const l = costruisciLista([dopo, prima]);
  assert.deepEqual(l.map((x) => x.id), ['L-prima', 'L-dopo']);
  assert.equal(l[0].gambe[0].idPartita, 'prima');
  assert.equal(l[0].quota, 1.5);
  assert.deepEqual(esitoCoppia({ ...l[0], gambe: [{ ...l[0].gambe[0], esito: 'vinta' }] }), { esito: 'vinta', ritorno: 1.5 });
  assert.equal(esitoCoppia({ ...l[0], gambe: [{ ...l[0].gambe[0], esito: 'persa' }] }).esito, 'persa');
  // Anche senza gambe della lista la chiave c'è: dal primo giorno il sito e Telegram mostrano solo lei.
  assert.deepEqual(costruisciCoppieQuota2([], { data: '2026-11-04' }).lista, []);
});

test('lista: si può segnare come giocata fatta, con la sua selezione', () => {
  const lista = costruisciLista([over('a', 1.3, 0.75)]);
  const b = bigliettiGiornata({ coppieQuota2: { lista } });
  assert.equal(b.length, 1);
  assert.equal(b[0].id, 'L-a');
  assert.equal(b[0].selezione, 'Over 1.5');
});

test('Telegram: con la lista si manda solo lei, niente schedine né multiple', () => {
  const giornata = {
    coppieQuota2: { lista: costruisciLista([over('Arezzo', 1.3, 0.75)]), triple: [{ id: 'T', quota: 2, prob: 0.5, gambe: [] }] },
    multipleBonus: [{ id: 'MBPC5-2026-11-04', criterio: 'probabilitaConfermate', quota: 5, gambe: [{ partita: 'NON MOSTRARE', mercato: '1X2', selezione: '1', quota: 1.3 }] }],
  };
  const t = testoMattinoEssenziale(giornata, '2026-11-04');
  assert.match(t, /Giocate di oggi/);
  assert.match(t, /Arezzo - B: <b>Over 1\.5<\/b> @1,30 · mercato 75%/);
  assert.doesNotMatch(t, /NON MOSTRARE|Tripla|Multipla/);
  assert.match(testoMattinoEssenziale({ coppieQuota2: { lista: [] } }, '2026-11-04'), /nessuna giocata adatta/);
  const { manda, tacere } = soloEssenziale([{ chiave: '2026-11-04|bonus|MBPC5-2026-11-04|esito', testo: 'x' }].map((m) => ({ ...m, chiave: '2026-11-04|bonus|MBPC5-2026-11-04' })), { giornata, oggi: '2026-11-04' });
  assert.equal(manda.length, 0);
  assert.equal(tacere.length, 1);
  // Bilancio di ieri: solo la lista.
  const lista = giornata.coppieQuota2.lista.map((c) => ({ ...c, esito: 'vinta', ritorno: 1.3, gambe: [{ ...c.gambe[0], esito: 'vinta' }] }));
  const [ieri] = messaggioIeri({ giornate: [{ data: '2026-11-04', coppieQuota2: { lista }, multipleBonus: giornata.multipleBonus }], inviate: new Set(), oggi: '2026-11-05', adesso: new Date('2026-11-05T10:00:00+01:00') });
  assert.match(ieri.testo, /Giocate della lista: <b>1 vinte su 1<\/b>/);
  assert.doesNotMatch(ieri.testo, /Multipla/);
});

test('Telegram: i giorni senza lista restano come prima', () => {
  assert.match(testoMattinoEssenziale({}, '2026-11-03'), /nessuna coppia/);
});

test('confronto settimanale: gruppi per settimana contro il mercato e soglie', () => {
  assert.equal(lunediDi('2026-11-08'), '2026-11-02');
  assert.equal(lunediDi('2026-11-09'), '2026-11-09');
  assert.equal(gruppoDi(riga('a', 'Under/Over 2.5', 'Over 2.5', 2, 0.5)), 'calcio: altri Under/Over');
  assert.equal(gruppoDi({ sport: 'nba' }), 'nba');
  const giorni = [
    { data: '2026-11-08', righe: [{ ...over('a', 1.3, 0.75), esito: 'vinta' }, { ...uno('b', 1.5, 0.6), esito: 'persa' }, { ...uno('c', 2.2, 0.42), esito: 'vinta' }, { ...over('d', 1.4, 0.7), esito: null }] },
    { data: '2026-11-09', righe: [{ ...over('e', 1.3, 0.75), esito: 'persa' }] },
  ];
  const r = confrontoSettimanale(giorni);
  assert.deepEqual(r.gruppi.lista.settimane['2026-11-02'], { chiuse: 2, prese: 1, percentuale: 0.5, attesa: 0.675, guadagno: -0.7, resa: -0.35 });
  assert.equal(r.gruppi.lista.totale.chiuse, 3);
  // 1 a quota 2,20: fuori dalla lista, ma nel background.
  assert.equal(r.gruppi['calcio: 1 (tutte le quote)'].totale.chiuse, 2);
  // Disaccordo fra modello e mercato: fuori dalla lista, dentro i due gruppi di confronto, ciascuno col suo ordine.
  const disaccordo = [{ data: '2026-11-09', righe: [{ ...over('f', 1.3, 0.75, 0.6), esito: 'vinta' }, { ...uno('f', 1.5, 0.62, 0.7), esito: 'persa' }] }];
  const d = confrontoSettimanale(disaccordo).gruppi;
  assert.equal(d.lista.totale.chiuse, 0);
  assert.equal(d['lista: solo modello'].totale.prese, 0);
  assert.equal(d['lista: solo mercato'].totale.prese, 1);
  const inUso = r.soglie.find((s) => s.inUso);
  assert.deepEqual([inUso.quotaMin, inUso.quotaMax, inUso.chiuse], [1.25, 1.7, 3]);
  assert.equal(r.soglie.find((s) => s.quotaMin === 1.7).chiuse, 1);
});
