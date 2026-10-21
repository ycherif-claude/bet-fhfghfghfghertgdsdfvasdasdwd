// Notifiche Telegram: giocate del giorno, cambi di stato (giro serale e controlli prima delle partite) ed errori.
// Si confronta la giornata di oggi con quello che è già stato mandato (data/stato/telegram.json):
// ogni messaggio ha una chiave e parte una volta sola. Gli esiti restano sul sito (scelta dell'utente).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { giornataDi, partiRoma } from '../bankroll/settimana.js';
import { oraRoma } from '../calcio/testo.js';

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

function rigaQuota(g) {
  const minima = num(g.quotaMinima) ? `minima ${virgola(g.quotaMinima)}` : null;
  const quota = num(g.quota) ? `quota ${virgola(g.quota)}` : 'quota da verificare su bet365';
  const puntata = g.puntata && num(g.puntata.euro) ? `puntata ${String(g.puntata.euro).replace('.', ',')} € (${String(g.puntata.percentuale).replace('.', ',')}%)` : null;
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
// `run`: Action finita male da segnalare ({ id, nome, url }) oppure null. `sito`: indirizzo del sito o null.
export function messaggi({ giornata, oggi, adesso, inviate, run = null, sito = null }) {
  const out = [];
  const aggiungi = (chiave, testo) => { if (!inviate.has(chiave)) out.push({ chiave, testo }); };
  const piede = sito ? `\n\n${sito}` : '';

  if (run) aggiungi(`${oggi}|run|${run.id}`, `⚠️ L'Action «${html(run.nome)}» è fallita.\n${run.url}`);

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
  const errori = (Array.isArray(delGiorno.erroriGiro) ? delGiorno.erroriGiro : [])
    .filter((e) => typeof e === 'string' && !INFORMATIVI.some((r) => r.test(e)))
    .filter((e) => !inviate.has(`${oggi}|errore|${hash(e)}`));
  if (errori.length) {
    out.push({
      chiave: `${oggi}|errori|${hash(errori.join('\n'))}`,
      testo: [`⚠️ <b>${errori.length === 1 ? 'Errore' : 'Errori'} della giornata ${giornoMese(oggi)}</b>`, ...errori.map((e) => `• ${html(e)}`)].join('\n'),
      segna: errori.map((e) => `${oggi}|errore|${hash(e)}`),
    });
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

export async function manda(testo, { token, chat, fetch = globalThis.fetch }) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: testo, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(30000),
  });
  // Mai il token nei messaggi d'errore.
  if (!r.ok) throw new Error(`Telegram: HTTP ${r.status} ${(await r.text()).replaceAll(token, '***').slice(0, 200)}`);
}

export async function eseguiNotifiche({ dirData, adesso, token, chat, run, sito, fetch }) {
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
  let mandati = 0;
  try {
    for (const m of lista) {
      await manda(m.testo, { token, chat, fetch });
      inviate.add(m.chiave);
      for (const k of m.segna ?? []) inviate.add(k);
      mandati++;
    }
  } finally {
    // Anche se un invio fallisce, quelli già partiti restano segnati: niente doppioni la volta dopo.
    if (mandati) scriviInviate(fileStato, inviate, oggi);
  }
  return { mandati, chiavi: lista.map((m) => m.chiave) };
}

async function principale() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.log('Notifiche Telegram spente: mancano i secrets TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }
  const run = process.env.RUN_CONCLUSIONE === 'failure'
    ? { id: process.env.RUN_ID, nome: process.env.RUN_NOME, url: process.env.RUN_URL } : null;
  const [proprietario, nome] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  const sito = proprietario && nome ? `https://${proprietario.toLowerCase()}.github.io/${nome}/` : null;
  const r = await eseguiNotifiche({ dirData: 'data', adesso: new Date(), token, chat, run, sito });
  console.log(`Notifiche Telegram: ${r.mandati} messaggi${r.chiavi.length ? ` (${r.chiavi.join(', ')})` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    console.error(`Notifiche Telegram fallite: ${e?.message ?? e}`);
    process.exit(1);
  });
}
