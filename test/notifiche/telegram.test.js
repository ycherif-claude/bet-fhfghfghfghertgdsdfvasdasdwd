import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dividi, eseguiNotifiche, manda, rigaChat, runDaSegnalare, messaggi, testoGiocata, messaggiEsiti, messaggiProvvisori, scriviInviate, leggiInviate } from '../../src/notifiche/telegram.js';

const OGGI = '2026-10-22';
const mattina = new Date('2026-10-22T07:30:00Z'); // 09:30 a Roma
const giocata = (id, extra = {}) => ({
  id, sport: 'calcio', competizione: 'Serie A', partita: 'Inter - Roma', idPartita: 'p', inizio: '2026-10-22T20:45:00+02:00',
  tipo: 'singola', mercato: '1X2', selezione: '1', quota: 1.95, quotaMinima: 1.85, puntata: { euro: 4, percentuale: 2 },
  stato: 'in_attesa', motivoStato: null, oraUltimoControllo: null, esito: null, ...extra,
});
const giornata = (giocate, erroriGiro = []) => ({ data: OGGI, giocate, erroriGiro });

test('giocate del giorno: un solo messaggio, poi solo le giocate nuove', () => {
  const g = giornata([giocata('a'), giocata('b', { sport: 'pallavolo', partita: 'Itas Trentino <B> - Rana Verona', mercato: 'Totale set 3.5', selezione: 'Under 3.5', quota: null })]);
  const primo = messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: new Set(), sito: 'https://x.github.io/y/' });
  assert.equal(primo.length, 1);
  const m = primo[0];
  assert.equal(m.chiave, `${OGGI}|giornata`);
  assert.match(m.testo, /Giocate di oggi, 22\/10/);
  assert.match(m.testo, /⚽ <b>Inter - Roma<\/b> · 20:45/);
  assert.match(m.testo, /quota 1,95 · minima 1,85 · puntata 4,00 € \(2%\)/);
  assert.match(m.testo, /🏐 <b>Itas Trentino &lt;B&gt; - Rana Verona<\/b>/);
  assert.match(m.testo, /quota da verificare su bet365/);
  assert.match(m.testo, /https:\/\/x\.github\.io\/y\/$/);
  const inviate = new Set([m.chiave, ...m.segna]);
  assert.deepEqual(messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate }), []);
  // La sera arriva una giocata di tennis: solo quella.
  const sera = giornata([...g.giocate, giocata('c', { sport: 'tennis', partita: 'Sinner - Alcaraz', mercato: 'Vincente incontro', selezione: 'Jannik Sinner' })]);
  const nuove = messaggi({ giornata: sera, oggi: OGGI, adesso: mattina, inviate });
  assert.equal(nuove.length, 1);
  assert.match(nuove[0].testo, /^🌙 <b>Nuova giocata di oggi<\/b>/);
  assert.match(nuove[0].testo, /Sinner - Alcaraz/);
  assert.ok(!nuove[0].testo.includes('Inter - Roma'));
});

test('nessuna giocata: una riga che lo dice; giornata mancante dopo le 12:00', () => {
  const [m] = messaggi({ giornata: giornata([]), oggi: OGGI, adesso: mattina, inviate: new Set() });
  assert.match(m.testo, /nessuna giocata/);
  assert.deepEqual(messaggi({ giornata: null, oggi: OGGI, adesso: mattina, inviate: new Set() }), []);
  const tardi = messaggi({ giornata: { ...giornata([]), data: '2026-10-21' }, oggi: OGGI, adesso: new Date('2026-10-22T10:30:00Z'), inviate: new Set() });
  assert.equal(tardi[0].chiave, `${OGGI}|mancante`);
});

test('giro serale: confermata, modificata con la quota nuova, annullata; una volta per stato', () => {
  const base = new Set([`${OGGI}|giornata`, `${OGGI}|giocata|a`, `${OGGI}|giocata|b`, `${OGGI}|giocata|c`]);
  const g = giornata([
    giocata('a', { sport: 'nba', stato: 'confermata', oraUltimoControllo: '21:05' }),
    giocata('b', { sport: 'nba', stato: 'modificata', quota: 2.1, motivoStato: 'assente il titolare', oraUltimoControllo: '21:05' }),
    giocata('c', { sport: 'nba', stato: 'annullata', motivoStato: 'quota scesa sotto la minima', oraUltimoControllo: '21:05' }),
  ]);
  const ms = messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: base });
  assert.equal(ms.length, 3);
  assert.match(ms[0].testo, /^🔎 🏀 <b>Inter - Roma<\/b>\n1X2 → 1: <b>CONFERMATA<\/b>$/);
  assert.match(ms[1].testo, /MODIFICATA<\/b>\nassente il titolare\nquota 2,10/);
  assert.match(ms[2].testo, /ANNULLATA<\/b>\nquota scesa sotto la minima/);
  const dopo = new Set([...base, ...ms.map((m) => m.chiave)]);
  assert.deepEqual(messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: dopo }), []);
});

test('errori: solo le righe nuove e non informative; Action fallita', () => {
  const base = new Set([`${OGGI}|giornata`]);
  const g = giornata([], [
    'TheSportsDB stagione 2025 giornata 11 alle 07:40: www.thesportsdb.com: HTTP 429',
    '2 partite già iniziate escluse',
    'The Odds API alle 07:35: manca ODDS_API_KEY',
  ]);
  const [m] = messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: base });
  assert.equal(m.testo, '⚠️ <b>Errore della giornata 22/10</b>\n• The Odds API alle 07:35: manca ODDS_API_KEY');
  const dopo = new Set([...base, m.chiave, ...m.segna]);
  assert.deepEqual(messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: dopo }), []);
  const run = { id: 77, nome: 'Raccolta dati calcio', url: 'https://github.com/a/b/actions/runs/77' };
  const [r] = messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: dopo, run });
  assert.equal(r.testo, "⚠️ L'Action «Raccolta dati calcio» è fallita.\nhttps://github.com/a/b/actions/runs/77");
});

test('eseguiNotifiche: manda, salva lo stato, non ripete; il token non finisce negli errori', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bet-notifiche-'));
  mkdirSync(join(dir, 'giornate'));
  writeFileSync(join(dir, 'giornate', `${OGGI}.json`), JSON.stringify(giornata([giocata('a')])));
  const inviati = [];
  const fetch = async (url, init) => { inviati.push({ url, corpo: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => '' }; };
  const r = await eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'SEGRETO', chat: '42', fetch });
  assert.equal(r.mandati, 1);
  assert.equal(inviati[0].url, 'https://api.telegram.org/botSEGRETO/sendMessage');
  assert.equal(inviati[0].corpo.chat_id, '42');
  assert.equal(inviati[0].corpo.parse_mode, 'HTML');
  assert.ok(leggiInviate(join(dir, 'stato', 'telegram.json')).has(`${OGGI}|giocata|a`));
  assert.equal((await eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'SEGRETO', chat: '42', fetch })).mandati, 0);
  writeFileSync(join(dir, 'giornate', `${OGGI}.json`), JSON.stringify(giornata([], ['errore nuovo'])));
  const rotto = async () => ({ ok: false, status: 401, text: async () => 'bot SEGRETO non valido' });
  await assert.rejects(eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'SEGRETO', chat: '42', fetch: rotto }), (e) => !e.message.includes('SEGRETO'));
});

test('stato: si tengono solo gli ultimi 14 giorni', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bet-notifiche-'));
  const file = join(dir, 'stato', 'telegram.json');
  scriviInviate(file, new Set(['2026-10-01|giornata', '2026-10-08|giornata', '2026-10-22|giornata']), OGGI);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).inviate, ['2026-10-08|giornata', '2026-10-22|giornata']);
});

test('chat not found: errore chiaro, nessun ripiego su getUpdates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bet-notifiche-'));
  mkdirSync(join(dir, 'giornate'));
  writeFileSync(join(dir, 'giornate', `${OGGI}.json`), JSON.stringify(giornata([giocata('a')])));
  const url = [];
  const fetch = async (u) => { url.push(u); return { ok: false, status: 400, text: async () => '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}' }; };
  await assert.rejects(eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'T', chat: '123', fetch }), /TELEGRAM_CHAT_ID/);
  assert.ok(url.every((u) => u.endsWith('/sendMessage')));
  assert.equal(url.length, 1);
});

test('messaggi lunghi divisi sotto i 4000 caratteri', async () => {
  const lunga = Array.from({ length: 300 }, (_, i) => `riga ${i} ${'x'.repeat(30)}`).join('\n');
  const pezzi = dividi(lunga);
  assert.ok(pezzi.length > 1);
  assert.ok(pezzi.every((p) => p.length < 4000));
  assert.equal(pezzi.join('\n'), lunga);
  const [una] = dividi('y'.repeat(9000));
  assert.ok(una.length < 4000);
  assert.ok(una.endsWith('…'));
  const testi = [];
  const fetch = async (u, init) => { testi.push(JSON.parse(init.body).text); return { ok: true, status: 200, text: async () => '' }; };
  await manda(lunga, { token: 'T', chat: '1', fetch });
  assert.equal(testi.length, pezzi.length);
});

test('HTTP 429: aspetta retry_after (al massimo 60 s) e riprova una volta', async () => {
  const attese = [];
  let n = 0;
  const fetch = async () => (++n === 1
    ? { ok: false, status: 429, text: async () => '{"ok":false,"error_code":429,"description":"Too Many Requests: retry after 500","parameters":{"retry_after":500}}' }
    : { ok: true, status: 200, text: async () => '' });
  await manda('ciao', { token: 'T', chat: '1', fetch, attendi: async (ms) => { attese.push(ms); } });
  assert.equal(n, 2);
  assert.deepEqual(attese, [60000]);
  // Due 429 di fila: errore.
  n = 0;
  const sempre429 = async () => { n++; return { ok: false, status: 429, text: async () => '{"parameters":{"retry_after":3}}' }; };
  await assert.rejects(manda('ciao', { token: 'T', chat: '1', fetch: sempre429, attendi: async () => {} }), /429/);
  assert.equal(n, 2);
});

test('un messaggio che fallisce non blocca gli altri; alla fine errore, gli inviati restano segnati', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bet-notifiche-'));
  mkdirSync(join(dir, 'giornate'));
  writeFileSync(join(dir, 'giornate', `${OGGI}.json`), JSON.stringify(giornata([giocata('a')], ['guasto uno'])));
  const run = { id: 9, nome: 'Raccolta dati calcio', url: 'u', conclusione: 'failure' };
  const testi = [];
  const fetch = async (u, init) => {
    const t = JSON.parse(init.body).text;
    if (/Giocate di oggi/.test(t)) return { ok: false, status: 400, text: async () => "Bad Request: can't parse entities" };
    testi.push(t);
    return { ok: true, status: 200, text: async () => '' };
  };
  await assert.rejects(eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'T', chat: '42', run, fetch }), /1 messaggi/);
  assert.equal(testi.length, 2);
  const inviate = leggiInviate(join(dir, 'stato', 'telegram.json'));
  assert.ok(inviate.has(`${OGGI}|run|9`));
  assert.ok(!inviate.has(`${OGGI}|giornata`));
});

test('Action annullata segnalata come la fallita; riga della chat senza nome', () => {
  assert.equal(runDaSegnalare({ RUN_CONCLUSIONE: 'success', RUN_ID: '1' }), null);
  assert.equal(runDaSegnalare({}), null);
  const r = runDaSegnalare({ RUN_CONCLUSIONE: 'cancelled', RUN_ID: '5', RUN_NOME: 'Giro serale', RUN_URL: 'https://x/5' });
  assert.deepEqual(r, { id: '5', nome: 'Giro serale', url: 'https://x/5', conclusione: 'cancelled' });
  const [m] = messaggi({ giornata: null, oggi: OGGI, adesso: mattina, inviate: new Set(), run: r });
  assert.equal(m.testo, "⚠️ L'Action «Giro serale» è stata annullata.\nhttps://x/5");
  assert.equal(runDaSegnalare({ RUN_CONCLUSIONE: 'failure', RUN_ID: '6', RUN_NOME: 'n', RUN_URL: 'u' }).conclusione, 'failure');
  assert.equal(rigaChat({ ok: true, result: { type: 'group', title: 'Segreto' } }), 'Chat di TELEGRAM_CHAT_ID: ok');
  assert.equal(rigaChat({ ok: false, description: 'Bad Request: chat not found' }), 'Chat di TELEGRAM_CHAT_ID: non ok');
});

test('esiti: solo le giocate segnate come fatte, con quota e puntata reali e il bankroll; una volta sola', () => {
  const ieri = { data: '2026-10-21', giocate: [
    giocata('v', { esito: 'vinta', inizio: '2026-10-21T20:45:00+02:00' }),
    giocata('p', { esito: 'persa', inizio: '2026-10-21T18:00:00+02:00', partita: 'Milan - Juventus' }),
    giocata('s', { esito: 'vinta', inizio: '2026-10-21T18:00:00+02:00', partita: 'Saltata - Mai' }),
    giocata('n', { esito: null, inizio: '2026-10-21T18:00:00+02:00' }),
  ] };
  const segnature = [
    { idGiocata: 'v', fatta: true, quotaReale: 2.65, puntataReale: 2, ora: '2026-10-21T10:00:00Z' },
    { idGiocata: 'p', fatta: true, quotaReale: 1.9, puntataReale: 4, ora: '2026-10-21T10:00:00Z' },
    { idGiocata: 's', fatta: false, quotaReale: null, puntataReale: null, ora: '2026-10-21T10:00:00Z' },
    { idGiocata: 'n', fatta: true, quotaReale: 2, puntataReale: 2, ora: '2026-10-21T10:00:00Z' },
  ];
  const ms = messaggiEsiti({ giornate: [ieri], segnature, inviate: new Set(), adesso: mattina });
  assert.equal(ms.length, 2);
  assert.match(ms[0].testo, /^✅ <b>VINTA<\/b> · ⚽ <b>Inter - Roma<\/b>\n1X2 → 1\nquota 2,65 · puntata 2,00 € → <b>\+3,30 €<\/b>$/);
  assert.match(ms[1].testo, /^❌ <b>PERSA<\/b> · ⚽ <b>Milan - Juventus<\/b>/);
  assert.match(ms[1].testo, /→ <b>−4,00 €<\/b>\n\nBankroll: <b>199,30 €<\/b>/);
  assert.ok(!ms.some((m) => m.testo.includes('Saltata')));
  const inviate = new Set(ms.map((m) => m.chiave));
  assert.deepEqual(messaggiEsiti({ giornate: [ieri], segnature, inviate, adesso: mattina }), []);
});

test('esito provvisorio di cartellini e angoli: un messaggio per giocata fatta, una volta sola', () => {
  const prov = { esito: 'vinta', dettaglio: '3 cartellini secondo ESPN, conteggio da confermare' };
  const oggi = { data: OGGI, giocate: [
    giocata('c', { partita: 'Levante - Athletic Bilbao', mercato: 'Cartellini Under/Over 3.5', selezione: 'Under 3.5', esitoProvvisorio: prov }),
    giocata('s', { partita: 'Saltata - Mai', mercato: 'Angoli Under/Over 9.5', selezione: 'Over 9.5', esitoProvvisorio: { esito: 'persa', dettaglio: 'x' } }),
    giocata('d', { partita: 'Già - Chiusa', mercato: 'Angoli Under/Over 9.5', selezione: 'Over 9.5', esito: 'persa', esitoProvvisorio: { esito: 'persa', dettaglio: 'x' } }),
    giocata('m', { tipo: 'multipla', gambe: [
      { sport: 'calcio', partita: 'Levante - Athletic Bilbao', mercato: 'Angoli Under/Over 8.5', selezione: 'Over 8.5', esitoProvvisorio: { esito: 'persa', dettaglio: '8 angoli secondo ESPN, conteggio da confermare' } },
      { sport: 'calcio', partita: 'Inter - Roma', mercato: '1X2', selezione: '1' },
    ] }),
  ] };
  const segnature = ['c', 'd', 'm'].map((id) => ({ idGiocata: id, fatta: true, quotaReale: 2, puntataReale: 2, ora: '2026-10-22T10:00:00Z' }))
    .concat({ idGiocata: 's', fatta: false, quotaReale: null, puntataReale: null, ora: '2026-10-22T10:00:00Z' });
  const ms = messaggiProvvisori({ giornate: [oggi], segnature, inviate: new Set() });
  assert.equal(ms.length, 2);
  assert.match(ms[0].testo, /Levante - Athletic Bilbao<\/b>, Cartellini Under 3,5: probabilmente <b>vinta<\/b> \(3 cartellini secondo ESPN, conteggio da confermare\)/);
  assert.match(ms[1].testo, /Multipla \(2 gambe\)/);
  assert.match(ms[1].testo, /Angoli Over 8,5: probabilmente <b>persa<\/b> \(8 angoli secondo ESPN/);
  const inviate = new Set(ms.flatMap((m) => [m.chiave, ...(m.segna ?? [])]));
  assert.deepEqual(messaggiProvvisori({ giornate: [oggi], segnature, inviate }), []);
});

test('eseguiNotifiche: l\'esito provvisorio parte una volta e il definitivo del mattino resta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bet-notifiche-'));
  mkdirSync(join(dir, 'giornate'));
  mkdirSync(join(dir, 'segnature'));
  const prov = { esito: 'persa', dettaglio: '5 cartellini secondo ESPN, conteggio da confermare' };
  const scrivi = (extra) => writeFileSync(join(dir, 'giornate', `${OGGI}.json`), JSON.stringify(giornata([
    giocata('c', { partita: 'Levante - Athletic Bilbao', mercato: 'Cartellini Under/Over 3.5', selezione: 'Under 3.5', inizio: '2026-10-22T08:00:00+02:00', esitoProvvisorio: prov, ...extra }),
  ])));
  scrivi({});
  writeFileSync(join(dir, 'segnature', 'c.json'), JSON.stringify({ idGiocata: 'c', fatta: true, quotaReale: 2, puntataReale: 2, ora: '2026-10-22T05:00:00Z' }));
  const testi = [];
  const fetch = async (url, init) => { testi.push(JSON.parse(init.body).text); return { ok: true, status: 200, text: async () => '' }; };
  await eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'T', chat: '42', fetch });
  assert.equal(testi.filter((t) => /probabilmente/.test(t)).length, 1);
  await eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'T', chat: '42', fetch });
  assert.equal(testi.filter((t) => /probabilmente/.test(t)).length, 1);
  scrivi({ esito: 'vinta' });
  await eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'T', chat: '42', fetch });
  assert.equal(testi.filter((t) => /probabilmente/.test(t)).length, 1);
  assert.match(testi.at(-1), /^✅ <b>VINTA<\/b>/);
});

test('troncamento: mai dentro un\'entità o un tag HTML, tag aperti richiusi', () => {
  const max = 20;
  for (const riga of ['<b>abcdefghijklmnopqrstuvwxyz</b>', 'abcdefghijklmnop &amp; resto della riga', 'abcdefghijklmnopq<b>x</b>']) {
    const [t] = dividi(riga, max);
    assert.ok(t.length < max + 10, t);
    assert.ok(!/&[a-z]*…|&[a-z]*$/.test(t.replace(/&amp;/g, '')), t);
    assert.ok(!/<[^>]*$/.test(t), t);
    const aperti = (t.match(/<b>/g) ?? []).length;
    const chiusi = (t.match(/<\/b>/g) ?? []).length;
    assert.equal(aperti, chiusi, t);
  }
});

test('errori scritti prima del giro del mattino nella giornata di ieri: partono una volta sola, i vecchi no', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bet-notifiche-'));
  mkdirSync(join(dir, 'giornate'));
  const file = join(dir, 'giornate', `${OGGI}.json`);
  writeFileSync(file, JSON.stringify(giornata([], ['errore vecchio'])));
  const inviati = [];
  const fetch = async (url, init) => { inviati.push(JSON.parse(init.body).text); return { ok: true, status: 200, text: async () => '' }; };
  await eseguiNotifiche({ dirData: dir, adesso: mattina, token: 'T', chat: '42', fetch });
  assert.ok(inviati.some((t) => t.includes('errore vecchio')));
  // Il 23 alle 08:30, prima del giro del mattino: gli esiti rapidi scrivono nella giornata del 22.
  writeFileSync(file, JSON.stringify(giornata([], ['errore vecchio', 'Esiti rapidi: Inter - Roma: HTTP 500'])));
  inviati.length = 0;
  const domani = new Date('2026-10-23T06:30:00Z');
  const r = await eseguiNotifiche({ dirData: dir, adesso: domani, token: 'T', chat: '42', fetch });
  assert.equal(r.mandati, 1);
  assert.equal(inviati[0], '⚠️ <b>Errore della giornata 22/10</b>\n• Esiti rapidi: Inter - Roma: HTTP 500');
  // Non si ripete, nemmeno quando c'è la giornata del 23.
  assert.equal((await eseguiNotifiche({ dirData: dir, adesso: domani, token: 'T', chat: '42', fetch })).mandati, 0);
  writeFileSync(join(dir, 'giornate', '2026-10-23.json'), JSON.stringify({ data: '2026-10-23', giocate: [], erroriGiro: [] }));
  inviati.length = 0;
  await eseguiNotifiche({ dirData: dir, adesso: new Date('2026-10-23T07:30:00Z'), token: 'T', chat: '42', fetch });
  assert.ok(!inviati.some((t) => t.includes('Inter - Roma: HTTP 500') || t.includes('errore vecchio')));
});

test('puntata con due decimali e, se ridotta, da quanto e per quale limite; fissa a giornata piena', () => {
  const ridotta = giocata('r', { puntata: { euro: 2.4, percentuale: 1.2, ridotta: { da: 5, motivo: 'tetto giornaliero' } } });
  const fissa = giocata('f', { idPartita: 'q', puntata: { euro: 1, percentuale: 0.5, fissa: { da: 6, motivo: 'giornata piena' } } });
  const [m] = messaggi({ giornata: giornata([ridotta, fissa]), oggi: OGGI, adesso: mattina, inviate: new Set() });
  assert.match(m.testo, /puntata 2,40 € \(1,2%, ridotta da 5,00 €, tetto giornaliero\)/);
  assert.match(m.testo, /puntata 1,00 € \(puntata fissa, giornata piena\)/);
  assert.ok(!/stop/i.test(m.testo));
  assert.equal(testoGiocata(giocata('x'), 1).includes('ridotta'), false);
  assert.equal(testoGiocata(giocata('x'), 1).includes('fissa'), false);
});

test('modalità prova: pronostici al posto dell\'elenco, niente messaggi per i cambi di stato', () => {
  const g = { ...giornata([giocata('a', { stato: 'confermata', oraUltimoControllo: '20:00' })]), prova: true };
  const ms = messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: new Set() });
  assert.equal(ms.length, 1);
  assert.match(ms[0].testo, /^📋 <b>Pronostici del 22\/10<\/b>: oggi nessuna partita/);
  assert.match(ms[0].testo, /🧪 1 giocata di prova sul sito: non giocarle/);
  const dopo = new Set([ms[0].chiave, ...ms[0].segna]);
  assert.deepEqual(messaggi({ giornata: g, oggi: OGGI, adesso: mattina, inviate: dopo }), []);
});
