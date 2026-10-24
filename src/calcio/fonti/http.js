import { CONFIG } from '../../config.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Toglie la chiave API da qualunque testo che finisca in un messaggio d'errore.
export function senzaChiave(testo) {
  return String(testo).replace(/(api[_-]?key=)[^&\s"']*/gi, '$1***');
}

function host(url) {
  try { return new URL(url).host; } catch { return 'indirizzo non valido'; }
}

// ESPN (API pubblica senza chiave) [correzione C5]: il 22/10/2026, dopo circa 2.000 richieste veloci,
// rispondeva 403 per qualche tempo. Ci si presenta in modo onesto (niente finto browser) e si chiede poco:
// un 403 non si riprova e chi chiama smette di usare ESPN per quel giro. Le intestazioni di chi chiama
// hanno la precedenza.
export const INTESTAZIONI_ESPN = Object.freeze({
  'User-Agent': 'analisi-giocate (progetto personale)',
  Accept: 'application/json',
});
const eEspn = (nome) => /(^|\.)espn\.com$/i.test(nome);

// Vero se l'errore è un rifiuto di ESPN (HTTP 403): chi chiama smette di chiedere a ESPN per questo giro.
export const bloccoEspn = (e) => e?.espnBloccato === true;

// Scarica un indirizzo riprovando su errore di rete e su status 5xx/429. Un 403 non si riprova mai.
export async function scarica(url, { fetch = globalThis.fetch, attesaMs = 2000, headers = {}, timeoutMs = 30000, binario = false } = {}) {
  const nome = host(url);
  const espn = eEspn(nome);
  const intestazioni = espn ? { ...INTESTAZIONI_ESPN, ...headers } : headers;
  const tentativi = CONFIG.calcio.ripetizioni + 1;
  let motivo = 'errore sconosciuto';
  let status = null;
  for (let i = 0; i < tentativi; i++) {
    if (i > 0) await pausa(attesaMs);
    let r;
    try {
      r = await fetch(url, { headers: intestazioni, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      motivo = `errore di rete (${senzaChiave(e?.message ?? e)})`;
      continue;
    }
    if (r.status >= 500 || r.status === 429) { motivo = `HTTP ${r.status}`; status = r.status; continue; }
    if (espn && r.status === 403) {
      throw Object.assign(new Error(`${nome}: HTTP 403 (ESPN: accesso negato, probabile blocco per troppe richieste)`), { status: 403, espnBloccato: true });
    }
    if (!r.ok) throw Object.assign(new Error(`${nome}: HTTP ${r.status}`), { status: r.status });
    if (binario) return { status: r.status, headers: r.headers, corpo: Buffer.from(await r.arrayBuffer()) };
    return { status: r.status, headers: r.headers, testo: await r.text() };
  }
  throw Object.assign(new Error(`${nome}: ${motivo}`), status ? { status } : {});
}
