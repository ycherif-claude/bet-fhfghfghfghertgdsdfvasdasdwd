// Notifiche Telegram: giocate del giorno, cambi di stato (giro serale e controlli prima delle partite),
// esiti delle giocate fatte ed errori.
// Si confronta la giornata di oggi (e gli errori nuovi di quella prima) con quello che è già stato mandato (data/stato/telegram.json):
// ogni messaggio ha una chiave e parte una volta sola. Gli esiti si mandano solo per le giocate
// segnate come fatte sul sito, con quota e puntata reali [utente].
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { giornataDi, partiRoma } from '../bankroll/settimana.js';
import { oraRoma } from '../calcio/testo.js';
import { leggiJson, erroreSegnatura } from '../build/costruisci-sito.js';
import { statoBankroll } from '../bankroll/bankroll.js';

const GIORNI_STATO = 14;
const SIMBOLO = { calcio: '⚽', tennis: '🎾', nba: '🏀', basket: '🏀', pallavolo: '🏐' };
const STATO_SERALE = { in_revisione: 'IN REVISIONE', confermata: 'CONFERMATA', modificata: 'MODIFICATA', annullata: 'ANNULLATA' };
// Righe informative di erroriGiro che non sono guasti: non si notificano.
const INFORMATIVI = [/già iniziat/, /TheSportsDB.*HTTP 429/];

const html = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const virgola = (q) => q.toFixed(2).replace('.', ',');
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const giornoMese = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
// Hash breve e stabile di un testo (per le chiavi degli errori).
function hash(testo) {
  let h = 5381;
  for (const c of String(testo)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

// "2,40 €": due decimali con la virgola, come il bankroll.
const importo = (n) => `${virgola(n)} €`;
// Puntata ridotta dal tetto giornaliero o dallo stop settimanale: ", ridotta da 5,00 €, tetto giornaliero".
const ridotta = (p) => (p.ridotta && num(p.ridotta.da) && typeof p.ridotta.motivo === 'string'
  ? `, ridotta da ${importo(p.ridotta.da)}, ${html(p.ridotta.motivo)}` : '');

function rigaQuota(g) {
  const minima = num(g.quotaMinima) ? `minima ${virgola(g.quotaMinima)}` : null;
  const quota = num(g.quota) ? `quota ${virgola(g.quota)}` : 'quota da verificare su bet365';
  const puntata = g.puntata && num(g.puntata.euro) ? `puntata ${importo(g.puntata.euro)} (${String(g.puntata.percentuale).replace('.', ',')}%${ridotta(g.puntata)})` : null;
  return [quota, minima, puntata].filter(Boolean).join(' · ');
}

// Testo di una giocata: singola su tre righe, multipla con le gambe.
export function testoGiocata(g, i) {
  const ora = Number.isFinite(Date.parse(g.inizio)) ? oraRoma(new Date(g.inizio)) : '';
  if (Array.isArray(g.gambe) && g.gambe.length) {
    const gambe = g.gambe.map((x) => `   ${SIMBOLO[x.sport] ?? '•'} ${html(x.partita)}: ${html(x.mercato)} → ${html(x.selezione)}`);
    return [`${i}. <b>${g.tipo === 'builder' ? 'Builder' : 'Multipla'} (${g.gambe.length} gambe)</b>`, ...gambe, `   ${rigaQuota(g)}`].join('\n');
  }
  return [
    `${i}. ${SIMBOLO[g.sport] ?? '•'} <b>${html(g.partita)}</b>${ora ? ` · ${ora}` : ''}`,
    `   ${html(g.mercato)} → <b>${html(g.selezione)}</b>`,
    `   ${rigaQuota(g)}`,
  ].join('\n');
}

const valide = (giornata) => (Array.isArray(giornata?.giocate) ? giornata.giocate.filter((g) => g && g.id) : []);

// Messaggi da mandare ora: [{ chiave, testo }]. `inviate`: Set delle chiavi già mandate.
// `run`: Action finita male da segnalare ({ id, nome, url, conclusione }) oppure null. `sito`: indirizzo del sito o null.
export function messaggi({ giornata, oggi, adesso, inviate, run = null, sito = null }) {
  const out = [];
  const aggiungi = (chiave, testo) => { if (!inviate.has(chiave)) out.push({ chiave, testo }); };
  const piede = sito ? `\n\n${sito}` : '';

  if (run) {
    const come = run.conclusione === 'cancelled' ? 'è stata annullata' : 'è fallita';
    aggiungi(`${oggi}|run|${run.id}`, `⚠️ L'Action «${html(run.nome)}» ${come}.\n${run.url}`);
  }

  const delGiorno = giornata && giornata.data === oggi ? giornata : null;
  if (!delGiorno) {
    // Dopo le 12:00 la giornata di oggi dovrebbe esserci (giro di Claude o riserva delle 09:45 UTC).
    if (partiRoma(adesso).ora >= 12) aggiungi(`${oggi}|mancante`, `⚠️ La giornata del ${giornoMese(oggi)} non è stata scritta: né il giro del mattino né la riserva.`);
    return out;
  }
  const giocate = valide(delGiorno);

  // 1. Giocate del giorno: un messaggio la prima volta, poi solo le giocate nuove (per esempio il tennis della sera).
  const annunciate = new Set([...inviate].filter((k) => k.startsWith(`${oggi}|giocata|`)).map((k) => k.slice(`${oggi}|giocata|`.length)));
  const primo = !inviate.has(`${oggi}|giornata`);
  if (primo) {
    const testo = giocate.length
      ? [`🎯 <b>Giocate di oggi, ${giornoMese(oggi)}</b>`, ...giocate.map((g, i) => testoGiocata(g, i + 1))].join('\n\n')
      : `🎯 <b>Oggi, ${giornoMese(oggi)}, nessuna giocata</b>: nessun mercato ha value sufficiente.`;
    out.push({ chiave: `${oggi}|giornata`, testo: testo + piede, segna: giocate.map((g) => `${oggi}|giocata|${g.id}`) });
  } else {
    const nuove = giocate.filter((g) => !annunciate.has(g.id) && g.stato !== 'annullata');
    if (nuove.length) {
      out.push({
        chiave: `${oggi}|nuove|${hash(nuove.map((g) => g.id).join(','))}`,
        testo: [`🌙 <b>${nuove.length === 1 ? 'Nuova giocata' : 'Nuove giocate'} di oggi</b>`, ...nuove.map((g, i) => testoGiocata(g, i + 1))].join('\n\n') + piede,
        segna: nuove.map((g) => `${oggi}|giocata|${g.id}`),
      });
    }
  }

  // 2. Cambi di stato (giro serale e controlli prima delle partite), una volta per stato e controllo.
  for (const g of giocate) {
    const etichetta = STATO_SERALE[g.stato];
    if (!etichetta) continue;
    const motivo = g.motivoStato ? `\n${html(g.motivoStato)}` : '';
    const nuovaQuota = g.stato === 'modificata' ? `\n${rigaQuota(g)}` : '';
    aggiungi(`${oggi}|stato|${g.id}|${g.stato}|${g.oraUltimoControllo ?? ''}`,
      `🔎 ${SIMBOLO[g.sport] ?? '•'} <b>${html(g.partita)}</b>\n${html(g.mercato)} → ${html(g.selezione)}: <b>${etichetta}</b>${motivo}${nuovaQuota}`);
  }

  // 3. Errori del sistema: le righe nuove di erroriGiro, senza quelle solo informative.
  out.push(...messaggioErrori(delGiorno, oggi, inviate));
  return out;
}

// Righe nuove di erroriGiro di una giornata (chiavi `<data>|errore|<hash>`), in un messaggio solo.
function messaggioErrori(giornata, data, inviate) {
  const errori = (Array.isArray(giornata?.erroriGiro) ? giornata.erroriGiro : [])
    .filter((e) => typeof e === 'string' && !INFORMATIVI.some((r) => r.test(e)))
    .filter((e) => !inviate.has(`${data}|errore|${hash(e)}`));
  if (!errori.length) return [];
  return [{
    chiave: `${data}|errori|${hash(errori.join('\n'))}`,
    testo: [`⚠️ <b>${errori.length === 1 ? 'Errore' : 'Errori'} della giornata ${giornoMese(data)}</b>`, ...errori.map((e) => `• ${html(e)}`)].join('\n'),
    segna: errori.map((e) => `${data}|errore|${hash(e)}`),
  }];
}

// Errori scritti nella giornata precedente dopo il suo ultimo invio: i controlli e gli esiti rapidi,
// prima del giro del mattino, scrivono nell'ultima giornata salvata. Ogni riga parte una volta sola
// (stesse chiavi di quando quella giornata era "oggi": le già mandate non si ripetono).
export function messaggiErroriPrecedenti({ giornate, oggi, inviate }) {
  const precedente = giornate.filter((x) => typeof x?.data === 'string' && x.data < oggi).sort((a, b) => a.data.localeCompare(b.data)).at(-1);
  return precedente ? messaggioErrori(precedente, precedente.data, inviate) : [];
}

const ESITO = { vinta: '✅ <b>VINTA</b>', persa: '❌ <b>PERSA</b>', rimborsata: '↩️ <b>RIMBORSATA</b>' };
const euro = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2).replace('.', ',')} €`;

// Esiti delle giocate fatte (ultima segnatura con fatta: true), una volta per giocata ed esito.
// `giornate`: [{ data, giocate }] degli ultimi giorni; `segnature`: tutte, anche le annullate dopo.
// `tutteGiornate`: tutte le giornate salvate, per il bankroll (che conta tutto lo storico).
export function messaggiEsiti({ giornate, segnature, inviate, adesso, tutteGiornate = giornate }) {
  const ultima = new Map();
  for (const sg of segnature) {
    const prec = ultima.get(sg.idGiocata);
    if (!prec || Date.parse(sg.ora) >= Date.parse(prec.ora)) ultima.set(sg.idGiocata, sg);
  }
  const tutte = tutteGiornate.flatMap((x) => valide(x));
  const out = [];
  for (const x of giornate) {
    for (const g of valide(x)) {
      const sg = ultima.get(g.id);
      if (!ESITO[g.esito] || !sg?.fatta) continue;
      const chiave = `${x.data}|esito|${g.id}|${g.esito}`;
      if (inviate.has(chiave)) continue;
      const profitto = g.esito === 'vinta' ? sg.puntataReale * (sg.quotaReale - 1) : g.esito === 'persa' ? -sg.puntataReale : 0;
      const gambaRimborsata = g.esito === 'vinta' && Array.isArray(g.gambe) && g.gambe.some((y) => y.esito === 'rimborsata');
      const titolo = Array.isArray(g.gambe) && g.gambe.length
        ? `<b>${g.tipo === 'builder' ? 'Builder' : 'Multipla'} (${g.gambe.length} gambe)</b>: ${g.gambe.map((y) => html(y.partita)).join(' + ')}`
        : `${SIMBOLO[g.sport] ?? '•'} <b>${html(g.partita)}</b>\n${html(g.mercato)} → ${html(g.selezione)}`;
      out.push({ chiave, giocata: g, testo: [
        `${ESITO[g.esito]} · ${titolo}`,
        `quota ${virgola(sg.quotaReale)} · puntata ${importo(sg.puntataReale)} → <b>${euro(profitto)}</b>${gambaRimborsata ? ' (una gamba rimborsata: l\'importo reale è più basso, controllalo)' : ''}`,
      ].join('\n') });
    }
  }
  if (out.length) {
    // Bankroll dopo questi esiti, con le stesse regole del sito.
    const b = statoBankroll(tutte, segnature, adesso);
    out.at(-1).testo += `\n\nBankroll: <b>${b.bankroll.toFixed(2).replace('.', ',')} €</b> · settimana ${euro(b.risultatoSettimana)}`;
  }
  return out;
}

// Esiti provvisori di cartellini e angoli (dagli esiti rapidi, numeri di ESPN): un messaggio per giocata
// fatta, una volta per gamba; niente se la giocata ha già l'esito definitivo (lo scrive il mattino).
export function messaggiProvvisori({ giornate, segnature, inviate }) {
  const ultima = new Map();
  for (const sg of segnature) {
    const prec = ultima.get(sg.idGiocata);
    if (!prec || Date.parse(sg.ora) >= Date.parse(prec.ora)) ultima.set(sg.idGiocata, sg);
  }
  const out = [];
  for (const x of giornate) {
    for (const g of valide(x)) {
      if (g.esito != null || !ultima.get(g.id)?.fatta) continue;
      const multipla = Array.isArray(g.gambe) && g.gambe.length > 0;
      const gambe = (multipla ? g.gambe : [g])
        .map((y, i) => ({ y, chiave: `${x.data}|provvisorio|${g.id}|${i}` }))
        .filter(({ y, chiave }) => y && y.esito == null && y.esitoProvvisorio?.esito && !inviate.has(chiave));
      if (!gambe.length) continue;
      const righe = gambe.map(({ y }) => {
        const p = y.esitoProvvisorio;
        const tipo = String(y.mercato).split(' ')[0];
        return `${multipla ? '   ' : ''}${SIMBOLO[y.sport ?? g.sport] ?? '•'} <b>${html(y.partita)}</b>, ${html(tipo)} ${html(String(y.selezione).replace('.', ','))}: probabilmente <b>${html(p.esito)}</b> (${html(p.dettaglio ?? '')})`;
      });
      const testa = multipla ? [`⏳ <b>${g.tipo === 'builder' ? 'Builder' : 'Multipla'} (${g.gambe.length} gambe)</b>, esito provvisorio:`] : [];
      out.push({
        chiave: gambe[0].chiave,
        segna: gambe.slice(1).map((z) => z.chiave),
        testo: [...testa, ...righe.map((r) => (multipla ? r : `⏳ ${r}`)), 'Esito definitivo con il giro del mattino.'].join('\n'),
      });
    }
  }
  return out;
}

// Giornate degli ultimi `giorni` giorni (file data/giornate/AAAA-MM-GG.json), le illeggibili saltate.
function leggiGiornateRecenti(dirData, oggi, giorni) {
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - giorni * 86400000).toISOString().slice(0, 10);
  const cartella = join(dirData, 'giornate');
  if (!existsSync(cartella)) return [];
  const out = [];
  for (const nome of readdirSync(cartella).sort()) {
    const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(nome);
    if (!m || m[1] < limite || m[1] > oggi) continue;
    try {
      const j = JSON.parse(readFileSync(join(cartella, nome), 'utf8'));
      out.push({ ...j, data: j.data ?? m[1] });
    } catch {
      // Un file rotto lo segnala già la pagina.
    }
  }
  return out;
}

// Stato: chiavi già mandate degli ultimi 14 giorni.
export function leggiInviate(file) {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return new Set(Array.isArray(j?.inviate) ? j.inviate : []);
  } catch {
    return new Set();
  }
}

export function scriviInviate(file, inviate, oggi) {
  const limite = new Date(Date.parse(`${oggi}T00:00:00Z`) - GIORNI_STATO * 86400000).toISOString().slice(0, 10);
  const tenute = [...inviate].filter((k) => k.slice(0, 10) >= limite).sort();
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ inviate: tenute }, null, 2)}\n`);
}

// Telegram rifiuta i messaggi sopra i 4096 caratteri: si divide sulle righe, sotto i 4000;
// una riga da sola troppo lunga si tronca.
const MAX_TESTO = 4000;

// Tag HTML rimasti aperti in un pezzo di testo, da richiudere ("</b></i>").
function chiusure(testo) {
  const aperti = [];
  for (const [, chiuso, nome] of testo.matchAll(/<(\/?)([a-z-]+)[^>]*>/gi)) {
    if (!chiuso) aperti.push(nome.toLowerCase());
    else if (aperti.at(-1) === nome.toLowerCase()) aperti.pop();
  }
  return aperti.reverse().map((n) => `</${n}>`).join('');
}

// Riga troncata sotto `max` caratteri: mai dentro un'entità (&amp;) o un tag (<b>), tag aperti richiusi.
function tronca(riga, max) {
  let limite = max - 2;
  for (;;) {
    let pezzo = riga.slice(0, limite);
    const amp = pezzo.lastIndexOf('&');
    if (amp > pezzo.lastIndexOf(';')) pezzo = pezzo.slice(0, amp);
    const tag = pezzo.lastIndexOf('<');
    if (tag > pezzo.lastIndexOf('>')) pezzo = pezzo.slice(0, tag);
    const coda = `…${chiusure(pezzo)}`;
    if (pezzo.length + coda.length < max || limite <= 1) return pezzo + coda;
    limite -= coda.length;
  }
}

export function dividi(testo, max = MAX_TESTO) {
  const pezzi = [];
  let corrente = null;
  for (let riga of String(testo).split('\n')) {
    if (riga.length >= max) riga = tronca(riga, max);
    if (corrente !== null && corrente.length + 1 + riga.length < max) { corrente += `\n${riga}`; continue; }
    if (corrente !== null) pezzi.push(corrente);
    corrente = riga;
  }
  if (corrente !== null) pezzi.push(corrente);
  return pezzi;
}

const ATTESA_MAX_MS = 60000;
const aspetta = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function mandaPezzo(testo, { token, chat, fetch, attendi }) {
  for (let tentativo = 1; ; tentativo++) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: testo, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) return;
    // Mai il token nei messaggi d'errore.
    const corpo = (await r.text()).replaceAll(token, '***');
    if (/chat not found/i.test(corpo)) {
      throw new Error('Telegram risponde «chat not found»: il secret TELEGRAM_CHAT_ID è sbagliato. Mettici il numero della tua chat con il bot (dopo avergli scritto almeno un messaggio)');
    }
    if (r.status === 429 && tentativo === 1) {
      let secondi = 1;
      try { secondi = Number(JSON.parse(corpo)?.parameters?.retry_after) || 1; } catch { /* corpo non JSON */ }
      await attendi(Math.min(secondi * 1000, ATTESA_MAX_MS));
      continue;
    }
    throw new Error(`Telegram: HTTP ${r.status} ${corpo.slice(0, 200)}`);
  }
}

// Manda un messaggio (diviso se è lungo). Su HTTP 429 aspetta retry_after (al massimo 60 s) e riprova una volta.
export async function manda(testo, { token, chat, fetch = globalThis.fetch, attendi = aspetta }) {
  for (const pezzo of dividi(testo)) await mandaPezzo(pezzo, { token, chat, fetch, attendi });
}

export async function eseguiNotifiche({ dirData, adesso, token, chat, run, sito, fetch, attendi }) {
  const oggi = giornataDi(adesso);
  const fileStato = join(dirData, 'stato', 'telegram.json');
  const inviate = leggiInviate(fileStato);
  const fileGiornata = join(dirData, 'giornate', `${oggi}.json`);
  let giornata = null;
  if (existsSync(fileGiornata)) {
    try {
      giornata = JSON.parse(readFileSync(fileGiornata, 'utf8'));
    } catch (e) {
      giornata = { data: oggi, giocate: [], erroriGiro: [`File della giornata illeggibile: ${e.message}`] };
    }
  }
  const lista = messaggi({ giornata, oggi, adesso, inviate, run, sito });
  // Esiti: le giornate fino a 13 giorni fa (le chiavi restano 14 giorni, niente doppioni).
  const segnature = leggiJson(dirData, 'segnature', []).map((x) => x.contenuto).filter((x) => x && !erroreSegnatura(x));
  const recenti = leggiGiornateRecenti(dirData, oggi, GIORNI_STATO - 1);
  lista.push(...messaggiErroriPrecedenti({ giornate: recenti, oggi, inviate }));
  lista.push(...messaggiProvvisori({ giornate: recenti, segnature, inviate }));
  lista.push(...messaggiEsiti({
    giornate: recenti, tutteGiornate: leggiGiornateRecenti(dirData, oggi, 100000), segnature, inviate, adesso,
  }));
  let mandati = 0;
  const falliti = [];
  try {
    for (const m of lista) {
      // Un messaggio che non parte non blocca gli altri; "chat not found" invece ferma tutto.
      try {
        await manda(m.testo, { token, chat, fetch, attendi });
      } catch (e) {
        if (/chat not found/i.test(e.message)) throw e;
        falliti.push(`${m.chiave}: ${e.message}`);
        continue;
      }
      inviate.add(m.chiave);
      for (const k of m.segna ?? []) inviate.add(k);
      mandati++;
    }
  } finally {
    // Anche se un invio fallisce, quelli già partiti restano segnati: niente doppioni la volta dopo.
    if (mandati) scriviInviate(fileStato, inviate, oggi);
  }
  // Alla fine l'errore, perché l'Action risulti fallita: i non mandati si riprovano la volta dopo.
  if (falliti.length) throw new Error(`${falliti.length} messaggi su ${lista.length} non mandati (${mandati} mandati): ${falliti.join(' | ')}`);
  return { mandati, chiavi: lista.map((m) => m.chiave) };
}

// Action da segnalare (dal workflow_run): fallita o annullata; null altrimenti.
export function runDaSegnalare(env) {
  const conclusione = env.RUN_CONCLUSIONE;
  if (conclusione !== 'failure' && conclusione !== 'cancelled') return null;
  return { id: env.RUN_ID, nome: env.RUN_NOME, url: env.RUN_URL, conclusione };
}

// Riga di log sulla chat dei secrets: solo se Telegram la trova, mai il nome né il numero.
export const rigaChat = (risposta) => `Chat di TELEGRAM_CHAT_ID: ${risposta?.ok ? 'ok' : 'non ok'}`;

async function principale() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.log('Notifiche Telegram spente: mancano i secrets TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }
  const run = runDaSegnalare(process.env);
  const [proprietario, nome] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  const sito = proprietario && nome ? `https://${proprietario.toLowerCase()}.github.io/${nome}/` : null;
  try {
    const c = await (await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`, { signal: AbortSignal.timeout(30000) })).json();
    console.log(rigaChat(c));
  } catch {
    console.log('Chat di TELEGRAM_CHAT_ID: non verificata');
  }
  const r = await eseguiNotifiche({ dirData: 'data', adesso: new Date(), token, chat, run, sito });
  console.log(`Notifiche Telegram: ${r.mandati} messaggi${r.chiavi.length ? ` (${r.chiavi.join(', ')})` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Notifiche Telegram fallite: ${e?.message ?? e}`);
    process.exit(1);
  });
}
