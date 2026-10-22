// Idea 3 [utente, 22/10/2026]: i controlli prima delle partite guardano anche le formazioni delle partite con
// un pronostico migliore (calcio). Un giocatore chiave della squadra su cui punta il pronostico non titolare →
// `avviso` sul pronostico e una notifica una volta sola. Mai Claude, mai cambi alle giocate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiControlli, latiPronostico } from '../../src/controlli/controlli.js';
import { messaggi } from '../../src/notifiche/telegram.js';

const OGGI = '2026-10-22';
const INIZIO = '2026-10-22T20:45:00+02:00';
const ID = 'calcio-2026-10-22-inter-roma';
const ore = (hhmm) => new Date(`2026-10-22T${hhmm}:00+02:00`);
const px = (mercato, selezione, testo, migliore) => ({
  mercato, selezione, testo, probModello: 0.86, prob: 0.85, limite: 0.82, n: 500, quotaMinima: 1.18, quota: null, giocabile: false, esito: null, migliore,
});
const partita = (pronostici) => ({ idPartita: ID, sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Roma', inizio: INIZIO, pronostici });
const PRONOSTICI = [partita([px('1X2', '1', 'Vince Inter', true), px('Doppia chance', '1X', 'Inter non perde (1X)', false)])];
const giocataFatta = { id: 'g1', sport: 'calcio', competizione: 'Serie A', partita: 'Milan - Lazio', idPartita: 'calcio-2026-10-22-milan-lazio', inizio: '2026-10-22T23:00:00+02:00', mercato: '1X2', selezione: '1', quotaMinima: 1.8, stato: 'in_attesa', motivoStato: null };

function cartella({ pronostici = PRONOSTICI, chiavi = { [ID]: { casa: ['Lautaro Martínez'], trasferta: ['Paulo Dybala'] } }, giocate = [giocataFatta] } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'bet-controlli-pron-'));
  for (const s of ['giornate', 'raccolta', 'segnature']) mkdirSync(join(d, s));
  writeFileSync(join(d, 'giornate', `${OGGI}.json`), JSON.stringify({ data: OGGI, prova: true, giocate, pronostici, erroriGiro: [] }));
  writeFileSync(join(d, 'raccolta', `${OGGI}-notizie.json`), JSON.stringify({ controllateAlle: '2026-10-22T09:10:00+02:00', giocatoriChiave: chiavi }));
  return d;
}
const leggi = (d) => JSON.parse(readFileSync(join(d, 'giornate', `${OGGI}.json`), 'utf8'));
const registro = (d) => JSON.parse(readFileSync(join(d, 'raccolta', `${OGGI}-controlli.json`), 'utf8'));
const titolari = (nomi) => ({ titolari: [...nomi, ...Array.from({ length: 11 - nomi.length }, (_, i) => `Riserva ${i}`)], pronta: true });

function fonti(formazioni = { casa: titolari(['Lautaro Martínez']), trasferta: titolari(['Paulo Dybala']) }) {
  const chiamate = [];
  return {
    chiamate,
    espn: {
      partite: async () => { chiamate.push('espn partite'); return [{ id: 'x1', casa: 'Internazionale', trasferta: 'AS Roma', inizio: '2026-10-22T18:45Z' }]; },
      formazioni: async () => { chiamate.push('espn formazioni'); return formazioni; },
      infortuni: async () => ({ casa: [], trasferta: [] }),
    },
    oddsApi: { eventi: async () => { chiamate.push('odds'); return { eventi: [], rimasti: 200 }; }, quote: async () => { chiamate.push('odds'); return { eventi: [] }; } },
  };
}

test('lati del pronostico: casa, trasferta o tutte e due per i mercati senza una squadra', () => {
  assert.deepEqual(latiPronostico('1X2', '1'), ['casa']);
  assert.deepEqual(latiPronostico('Doppia chance', '1X'), ['casa']);
  assert.deepEqual(latiPronostico('Under/Over casa 0.5', 'Over 0.5'), ['casa']);
  assert.deepEqual(latiPronostico('1X2', '2'), ['trasferta']);
  assert.deepEqual(latiPronostico('Doppia chance', 'X2'), ['trasferta']);
  assert.deepEqual(latiPronostico('Under/Over trasferta 0.5', 'Over 0.5'), ['trasferta']);
  assert.deepEqual(latiPronostico('Doppia chance', '12'), ['casa', 'trasferta']);
  assert.deepEqual(latiPronostico('Under/Over 1.5', 'Over 1.5'), ['casa', 'trasferta']);
});

test('pronostico: chiave della squadra del pronostico non titolare → avviso sul migliore, giocate intatte, mai Claude', async () => {
  const d = cartella();
  const r = await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: fonti({ casa: titolari([]), trasferta: titolari(['Paulo Dybala']) }), claudeDisponibile: true });
  assert.deepEqual(r.daMandareAClaude, []);
  const g = leggi(d);
  const [migliore, altro] = g.pronostici[0].pronostici;
  assert.match(migliore.avviso, /giocatore chiave non titolare: Lautaro Martínez/);
  assert.equal(altro.avviso, undefined);
  assert.deepEqual(g.giocate, [giocataFatta]);
  const reg = registro(d);
  assert.equal(reg.pronostici[ID].esito, 'avviso');
  assert.equal(reg.claude.avvii, 0);
});

test('pronostico: chiave fuori solo nella squadra avversaria → nessun avviso', async () => {
  const d = cartella();
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: fonti({ casa: titolari(['Lautaro Martínez']), trasferta: titolari([]) }) });
  assert.equal(leggi(d).pronostici[0].pronostici[0].avviso, undefined);
  assert.equal(registro(d).pronostici[ID].esito, 'ok');
});

test('pronostico senza una squadra (Over 1.5): conta un chiave fuori in tutte e due', async () => {
  const d = cartella({ pronostici: [partita([px('Under/Over 1.5', 'Over 1.5', 'Almeno 2 gol (Over 1.5)', true)])] });
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: fonti({ casa: titolari(['Lautaro Martínez']), trasferta: titolari([]) }) });
  assert.match(leggi(d).pronostici[0].pronostici[0].avviso, /Paulo Dybala/);
});

test('pronostico: giocatore chiave non identificabile con certezza → avviso "da verificare"', async () => {
  const d = cartella({ chiavi: { [ID]: { casa: ['L. Martínez'], trasferta: [] } } });
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: fonti({ casa: titolari(['Lautaro Martínez', 'Lisandro Martínez']), trasferta: titolari([]) }) });
  assert.match(leggi(d).pronostici[0].pronostici[0].avviso, /^da verificare: /);
});

test('pronostico senza giocatori chiave: nessun avviso, "formazione non controllata" nel registro, niente ESPN', async () => {
  const d = cartella({ chiavi: {} });
  const f = fonti();
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: f });
  assert.equal(leggi(d).pronostici[0].pronostici[0].avviso, undefined);
  const x = registro(d).pronostici[ID];
  assert.equal(x.esito, 'non-controllata');
  assert.match(x.motivo, /formazione non controllata/);
  assert.ok(!f.chiamate.includes('espn formazioni'));
});

test('pronostico: aspetta le formazioni fuori dall\'ultimo tentativo, poi una sola decisione; fuori finestra niente', async () => {
  const d = cartella();
  const nonPronte = { casa: { titolari: [], pronta: false }, trasferta: { titolari: [], pronta: false } };
  const presto = fonti();
  await eseguiControlli({ dirData: d, adesso: ore('19:00'), fonti: presto });
  assert.deepEqual(presto.chiamate, []);
  await eseguiControlli({ dirData: d, adesso: ore('19:30'), fonti: fonti(nonPronte) });
  assert.throws(() => registro(d));
  await eseguiControlli({ dirData: d, adesso: ore('20:10'), fonti: fonti(nonPronte) });
  assert.match(registro(d).pronostici[ID].motivo, /formazione non controllata/);
  // Già deciso: non si richiede più niente.
  const dopo = fonti();
  await eseguiControlli({ dirData: d, adesso: ore('20:20'), fonti: dopo });
  assert.deepEqual(dopo.chiamate.filter((c) => c.startsWith('espn')), []);
});

test('Telegram: "Attenzione pronostico" una volta sola', () => {
  const pronostici = [partita([{ ...px('1X2', '1', 'Vince Inter', true), avviso: 'giocatore chiave non titolare: Lautaro Martínez' }])];
  const giornata = { data: OGGI, prova: true, giocate: [], pronostici, erroriGiro: [] };
  const inviate = new Set([`${OGGI}|giornata`, `${OGGI}|pronostici`, `${OGGI}|pronostico|${ID}`]);
  const out = messaggi({ giornata, oggi: OGGI, adesso: ore('20:15'), inviate });
  const m = out.filter((x) => /Attenzione pronostico/.test(x.testo));
  assert.equal(m.length, 1);
  assert.match(m[0].testo, /Inter - Roma/);
  assert.match(m[0].testo, /Vince Inter/);
  assert.match(m[0].testo, /Lautaro Martínez/);
  inviate.add(m[0].chiave);
  assert.ok(!messaggi({ giornata, oggi: OGGI, adesso: ore('20:25'), inviate }).some((x) => /Attenzione pronostico/.test(x.testo)));
});
