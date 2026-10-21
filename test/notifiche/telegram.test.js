import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eseguiNotifiche, messaggi, scriviInviate, leggiInviate } from '../../src/notifiche/telegram.js';

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
  assert.match(m.testo, /quota 1,95 · minima 1,85 · puntata 4 € \(2%\)/);
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
  assert.match(ms[0].testo, /🏀 <b>Inter - Roma<\/b>\n1X2 → 1: <b>CONFERMATA<\/b>$/);
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
