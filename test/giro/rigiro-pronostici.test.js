// Revisione [coordinatore, 22/10/2026]: un giro rifatto prima delle partite non perde gli avvisi delle formazioni
// e non sostituisce in silenzio le doppie/triple già pubblicate; i controlli delle formazioni sono per
// pronostico (idPartita|mercato|selezione), così un nuovo migliore dopo un giro rifatto si controlla ancora;
// una gamba senza risultato dopo 3 giorni (partita rinviata) è rimborsata.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiGiro } from '../../src/giro/giro.js';
import { eseguiControlli } from '../../src/controlli/controlli.js';
import { aggiornaEsitiSchedine } from '../../src/regole/schedine-pronostici.js';
import { scegliMigliore } from '../../src/regole/pronostici.js';
import { CONFIG } from '../../src/config.js';

const DATA = '2026-10-23';
const m = (mercato, selezione, probModello) => ({ mercato, selezione, probModello, probPinnacle: null, quota: null, fonteQuota: null, oraQuota: null, frequenzaCampionato: null });
const p = (casa, trasferta, ora) => ({
  idPartita: `calcio-${DATA}-${casa}-${trasferta}`.toLowerCase(), competizione: 'Serie A', partita: `${casa} - ${trasferta}`, casa, trasferta,
  inizio: `${DATA}T${ora}:00+02:00`, modello: 'dixon-coles', lambda: { casa: 2.2, trasferta: 0.6 }, ragionamentoBase: [],
  mercati: [m('1X2', '1', 0.8), m('1X2', 'X', 0.12), m('1X2', '2', 0.08)],
});
const leggi = (file) => JSON.parse(readFileSync(file, 'utf8'));

function cartella(partite) {
  const d = mkdtempSync(join(tmpdir(), 'bet-rigiro-'));
  for (const s of ['raccolta', 'giornate', 'registro', 'segnature', 'taratura']) mkdirSync(join(d, s));
  writeFileSync(join(d, 'taratura', 'calibrazione.json'), JSON.stringify({ calcio: { principali: { '1X2|1': [{ da: 0.7, n: 100000, vera: 0.815 }] } } }));
  raccolta(d, partite);
  return d;
}
function raccolta(d, partite) {
  writeFileSync(join(d, 'raccolta', `${DATA}.json`), JSON.stringify({ data: DATA, generataAlle: `${DATA}T07:35:00+02:00`, crediti: {}, competizioniNonCoperte: [], erroriGiro: [], partite }));
}
const giro = (d, ora = '07:10') => eseguiGiro({ dirData: d, adesso: new Date(`${DATA}T${ora}:00Z`), modo: 'riserva' });
const fileGiornata = (d) => join(d, 'giornate', `${DATA}.json`);

test('giro rifatto: l\'avviso delle formazioni resta sullo stesso pronostico (idPartita|mercato|selezione)', () => {
  const d = cartella([p('Inter', 'Lecce', '18:00'), p('Napoli', 'Como', '20:45')]);
  giro(d);
  const g = leggi(fileGiornata(d));
  g.pronostici[0].pronostici[0].avviso = 'giocatore chiave non titolare: Lautaro Martínez';
  writeFileSync(fileGiornata(d), JSON.stringify(g));
  const dopo = giro(d, '08:00').giornata;
  assert.equal(dopo.pronostici[0].pronostici[0].avviso, 'giocatore chiave non titolare: Lautaro Martínez');
  assert.equal(dopo.pronostici[1].pronostici[0].avviso, undefined);
});

test('giro rifatto: le doppie già pubblicate con le gambe invariate restano; se una cade, il motivo è scritto', () => {
  const d = cartella([p('Inter', 'Lecce', '18:00'), p('Napoli', 'Como', '20:45')]);
  const [prima] = giro(d).giornata.schedinePronostici;
  assert.ok(prima);
  // Una partita in più non cambia la doppia già pubblicata.
  raccolta(d, [p('Inter', 'Lecce', '18:00'), p('Napoli', 'Como', '20:45'), p('Roma', 'Pisa', '15:00')]);
  const g2 = giro(d, '08:00').giornata;
  assert.equal(g2.schedinePronostici.length, 1);
  assert.equal(g2.schedinePronostici[0].id, prima.id);
  assert.deepEqual(g2.schedinePronostici[0].gambe.map((x) => x.partita), prima.gambe.map((x) => x.partita));
  assert.equal(g2.schedineTolte, undefined);
  // Napoli - Como sparisce dai pronostici: la doppia cade e la giornata dice perché.
  raccolta(d, [p('Inter', 'Lecce', '18:00'), p('Roma', 'Pisa', '15:00')]);
  const g3 = giro(d, '08:30').giornata;
  assert.ok(!g3.schedinePronostici.some((s) => s.id === prima.id));
  assert.equal(g3.schedineTolte.length, 1);
  assert.equal(g3.schedineTolte[0].id, prima.id);
  assert.match(g3.schedineTolte[0].motivo, /Napoli - Como/);
  assert.ok(g3.erroriGiro.some((x) => /Doppia di pronostici tolta dopo un nuovo giro.*Napoli - Como/.test(x)), g3.erroriGiro.join(' | '));
  // L'elenco delle tolte resta ai giri successivi.
  assert.equal(giro(d, '09:00').giornata.schedineTolte.length, 1);
});

test('controlli: registro per pronostico, un nuovo migliore dopo un giro rifatto si controlla ancora', async () => {
  const ID = `calcio-${DATA}-inter-roma`;
  const d = mkdtempSync(join(tmpdir(), 'bet-rigiro-controlli-'));
  for (const s of ['giornate', 'raccolta', 'segnature']) mkdirSync(join(d, s));
  const px = (mercato, selezione, migliore) => ({ mercato, selezione, testo: `${mercato} ${selezione}`, prob: 0.85, limite: 0.82, n: 500, quotaMinima: 1.18, quota: null, giocabile: false, esito: null, migliore });
  const scrivi = (pron) => writeFileSync(join(d, 'giornate', `${DATA}.json`), JSON.stringify({ data: DATA, prova: true, giocate: [], erroriGiro: [],
    pronostici: [{ idPartita: ID, sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Roma', inizio: `${DATA}T20:45:00+02:00`, pronostici: pron }] }));
  writeFileSync(join(d, 'raccolta', `${DATA}-notizie.json`), JSON.stringify({ controllateAlle: `${DATA}T09:10:00+02:00`, giocatoriChiave: { [ID]: { casa: ['Lautaro Martínez'], trasferta: [] } } }));
  const titolari = (nomi) => ({ titolari: [...nomi, ...Array.from({ length: 11 - nomi.length }, (_, i) => `Riserva ${i}`)], pronta: true });
  const fonti = (casa) => ({
    espn: { partite: async () => [{ id: 'x1', casa: 'Internazionale', trasferta: 'AS Roma', inizio: `${DATA}T18:45Z` }], formazioni: async () => ({ casa: titolari(casa), trasferta: titolari([]) }), infortuni: async () => ({ casa: [], trasferta: [] }) },
    oddsApi: { eventi: async () => ({ eventi: [], rimasti: 200 }), quote: async () => ({ eventi: [] }) },
  });
  scrivi([px('1X2', '1', true), px('Doppia chance', '1X', false)]);
  await eseguiControlli({ dirData: d, adesso: new Date(`${DATA}T20:10:00+02:00`), fonti: fonti(['Lautaro Martínez']) });
  const reg = () => leggi(join(d, 'raccolta', `${DATA}-controlli.json`));
  assert.equal(reg().pronostici[`${ID}|1X2|1`].esito, 'ok');
  // Giro rifatto: ora il migliore è 1X. Si controlla di nuovo e l'avviso va su 1X.
  scrivi([px('1X2', '1', false), px('Doppia chance', '1X', true)]);
  await eseguiControlli({ dirData: d, adesso: new Date(`${DATA}T20:20:00+02:00`), fonti: fonti([]) });
  assert.equal(reg().pronostici[`${ID}|Doppia chance|1X`].esito, 'avviso');
  const [uno, dc] = leggi(join(d, 'giornate', `${DATA}.json`)).pronostici[0].pronostici;
  assert.equal(uno.avviso, undefined);
  assert.match(dc.avviso, /Lautaro Martínez/);
});

test(`schedine: gamba senza risultato dopo ${CONFIG.pronostici.schedine.giorniRimborso} giorni → rimborsata, quota ricalcolata`, () => {
  assert.equal(CONFIG.pronostici.schedine.giorniRimborso, 3);
  const s = () => [{ id: 's', quota: 1.56, esito: null, quotaFinale: null, gambe: [
    { idPartita: 'a', mercato: '1X2', selezione: '1', quota: 1.25, inizio: '2026-10-20T18:00:00+02:00', esito: null },
    { idPartita: 'b', mercato: '1X2', selezione: '1', quota: 1.25, inizio: '2026-10-20T20:45:00+02:00', esito: null },
  ] }];
  const esiti = new Map([['a|1X2|1', 'vinta']]);
  const presto = s();
  aggiornaEsitiSchedine(presto, esiti, new Date('2026-10-23T17:00:00+02:00'));
  assert.equal(presto[0].gambe[1].esito, null);
  assert.equal(presto[0].esito, null);
  const tardi = s();
  assert.equal(aggiornaEsitiSchedine(tardi, esiti, new Date('2026-10-23T21:00:00+02:00')), true);
  assert.equal(tardi[0].gambe[1].esito, 'rimborsata');
  assert.match(tardi[0].gambe[1].motivoEsito, /nessun risultato dopo 3 giorni/);
  assert.deepEqual([tardi[0].esito, tardi[0].quotaFinale], ['vinta', 1.25]);
  // Un risultato vero che arriva dopo il rimborso lo sostituisce (come nelle multiple bonus).
  aggiornaEsitiSchedine(tardi, new Map([['a|1X2|1', 'vinta'], ['b|1X2|1', 'persa']]), new Date('2026-10-24T09:00:00+02:00'));
  assert.equal(tardi[0].gambe[1].esito, 'persa');
  assert.equal(tardi[0].gambe[1].motivoEsito, undefined);
  assert.equal(tardi[0].esito, 'persa');
  // Senza `adesso` (chiamate vecchie): nessun rimborso.
  const senza = s();
  aggiornaEsitiSchedine(senza, esiti);
  assert.equal(senza[0].gambe[1].esito, null);
});

test('migliore: prima i pronostici con la quota dei bookmaker dell\'utente, poi quelli con la media, poi la regola senza quote', () => {
  const pr = (selezione, limite, extra = {}) => ({ mercato: 'M', selezione, prob: limite + 0.02, limite, quotaMinima: 1.2, quota: null, ...extra });
  const scelto = (lista) => scegliMigliore(lista).filter((x) => x.migliore).map((x) => x.selezione);
  // La media più alta (0,85 × 1,40 = 1,19) non batte la quota dell'utente (0,84 × 1,25 = 1,05).
  assert.deepEqual(scelto([pr('media', 0.85, { quota: 1.4, fonteQuota: 'media' }), pr('mia', 0.84, { quota: 1.25, fonteQuota: 'miei' }), pr('niente', 0.9)]), ['mia']);
  // Fra quelli dell'utente vince il massimo di prob prudente × quota.
  assert.deepEqual(scelto([pr('a', 0.84, { quota: 1.25, fonteQuota: 'miei' }), pr('b', 0.82, { quota: 1.35, fonteQuota: 'miei' })]), ['b']);
  // Nessuna quota dell'utente: fra le medie (anche dati vecchi senza fonteQuota) con la stessa formula.
  assert.deepEqual(scelto([pr('a', 0.84, { quota: 1.25, fonteQuota: 'media' }), pr('b', 0.82, { quota: 1.35 }), pr('c', 0.95)]), ['b']);
  // Nessuna quota: la regola di sempre (prob prudente più alta con quota minima ≥ 1,20).
  assert.deepEqual(scelto([pr('a', 0.84), pr('b', 0.86)]), ['b']);
});
