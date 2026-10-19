import { CONFIG } from '../../config.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Toglie la chiave API da qualunque testo che finisca in un messaggio d'errore.
export function senzaChiave(testo) {
  return String(testo).replace(/(api[_-]?key=)[^&\s"']*/gi, '$1***');
}

function host(url) {
  try { return new URL(url).host; } catch { return 'indirizzo non valido'; }
}

// Scarica un indirizzo riprovando su errore di rete e su status 5xx/429.
export async function scarica(url, { fetch = globalThis.fetch, attesaMs = 2000, headers = {}, timeoutMs = 30000 } = {}) {
  const nome = host(url);
  const tentativi = CONFIG.calcio.ripetizioni + 1;
  let motivo = 'errore sconosciuto';
  for (let i = 0; i < tentativi; i++) {
    if (i > 0) await pausa(attesaMs);
    let r;
    try {
      r = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      motivo = `errore di rete (${senzaChiave(e?.message ?? e)})`;
      continue;
    }
    if (r.status >= 500 || r.status === 429) { motivo = `HTTP ${r.status}`; continue; }
    if (!r.ok) throw new Error(`${nome}: HTTP ${r.status}`);
    return { status: r.status, headers: r.headers, testo: await r.text() };
  }
  throw new Error(`${nome}: ${motivo}`);
}
