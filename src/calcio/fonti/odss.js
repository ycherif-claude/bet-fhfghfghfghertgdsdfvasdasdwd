// odss-api.com: quote prematch dei bookmaker (anche italiani). Chiave nell'intestazione `x-api-key`
// (secret ODSS_API_KEY), mai nell'indirizzo né nei messaggi d'errore: repository e log sono pubblici.
// Intestazioni oneste, niente finto browser. Parametri sconosciuti all'API danno HTTP 400: si mandano solo
// sport, market, state, commence_from, commence_to, limit e after.
import { CONFIG } from '../../config.js';

export const BASE_ODSS = 'https://odss-api.com/api/v1';
export const INTESTAZIONI_ODSS = Object.freeze({
  'User-Agent': 'analisi-giocate (progetto personale)',
  Accept: 'application/json',
});

// ISO UTC senza millisecondi.
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const numero = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// X-RateLimit-Reset: istante (secondi o millisecondi dall'epoca), secondi che mancano, oppure una data.
function istanteReset(valore, adesso = Date.now()) {
  if (valore === null || valore === undefined || valore === '') return null;
  const n = numero(valore);
  let t;
  if (n === null) t = Date.parse(valore);
  else if (n > 1e12) t = n;
  else if (n > 1e9) t = n * 1000;
  else t = adesso + n * 1000;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export const limitiOdss = (headers) => ({
  rimaste: numero(headers.get('x-ratelimit-remaining')),
  limite: numero(headers.get('x-ratelimit-limit')),
  reset: istanteReset(headers.get('x-ratelimit-reset')),
});

// Toglie la chiave da un testo (per sicurezza: i messaggi d'errore non contengono mai il corpo della risposta).
const senza = (testo, chiave) => (chiave ? String(testo).replaceAll(chiave, '***') : String(testo));

export const odss = {
  // Una pagina di /odds: { righe, nextAfter, limiti: { rimaste, limite, reset } }.
  // Errore HTTP: Error con `status` e `limiti` (un 429 aggiorna comunque le rimaste).
  async quote({ chiave, market, finestra, after = null, fetch = globalThis.fetch, timeoutMs = 30000 }) {
    const parametri = {
      sport: 'calcio', market, state: 'prematch', commence_from: iso(finestra.da), commence_to: iso(finestra.a),
      limit: String(CONFIG.odss.limite), ...(after ? { after } : {}),
    };
    const url = `${BASE_ODSS}/odds?${new URLSearchParams(parametri)}`;
    let r;
    try {
      r = await fetch(url, { headers: { ...INTESTAZIONI_ODSS, 'x-api-key': chiave }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw Object.assign(new Error(`odss-api.com: errore di rete (${senza(e?.message ?? e, chiave)})`), { rete: true });
    }
    const limiti = limitiOdss(r.headers);
    if (!r.ok) throw Object.assign(new Error(`odss-api.com: HTTP ${r.status}`), { status: r.status, limiti });
    let dati;
    try {
      dati = JSON.parse(await r.text());
    } catch {
      throw Object.assign(new Error('odss-api.com: risposta non valida'), { limiti });
    }
    const righe = Array.isArray(dati) ? dati : Array.isArray(dati?.odds) ? dati.odds : [];
    const nextAfter = dati?.next_after ?? dati?.meta?.next_after ?? dati?.pagination?.next_after ?? null;
    return { righe, nextAfter: nextAfter === '' ? null : nextAfter, limiti };
  },
};
