// odss-api.com: quote prematch dei bookmaker (anche italiani). Chiave nell'intestazione `x-api-key`
// (secret ODSS_API_KEY), mai nell'indirizzo né nei messaggi d'errore: repository e log sono pubblici.
// Intestazioni oneste, niente finto browser. Parametri sconosciuti all'API danno HTTP 400: si mandano solo
// sport, market, league, content, state, commence_from, commence_to, limit e offset (documentati in openapi.json).
// `sport` e `market` accettano più valori separati da virgola; `league` è una sottostringa del nome (mai esatta);
// content=match: solo righe di partita, niente quote dei singoli giocatori.
// Risposta (secondo collaudo, 22/10/2026): { count, offset, returned, limit, state, generation, generated_at, odds,
// content, partial_sources }. Paginazione con offset += returned finché offset + returned < count.
import { CONFIG } from '../../config.js';

export const BASE_ODSS = 'https://odss-api.com/api/v1';
export const INTESTAZIONI_ODSS = Object.freeze({
  'User-Agent': 'analisi-giocate (progetto personale)',
  Accept: 'application/json',
});

// ISO UTC senza millisecondi.
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const numero = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// X-RateLimit-Reset: secondi unix (per esempio "1795282558").
function istanteReset(valore) {
  const n = numero(valore);
  return n === null ? null : new Date(n * 1000).toISOString();
}

export const limitiOdss = (headers) => ({
  rimaste: numero(headers.get('x-ratelimit-remaining')),
  limite: numero(headers.get('x-ratelimit-limit')),
  reset: istanteReset(headers.get('x-ratelimit-reset')),
});

// Toglie la chiave da un testo (per sicurezza: i messaggi d'errore non contengono mai il corpo della risposta).
const senza = (testo, chiave) => (chiave ? String(testo).replaceAll(chiave, '***') : String(testo));

export const odss = {
  // Una pagina di /odds: { righe, prossimoOffset (null se è l'ultima), limiti: { rimaste, limite, reset } }.
  // Errore HTTP: Error con `status` e `limiti` (un 429 aggiorna comunque le rimaste).
  async quote({ chiave, sport = 'calcio', market, league = null, finestra, offset = 0, fetch = globalThis.fetch, timeoutMs = 30000 }) {
    const parametri = {
      sport, market, ...(league ? { league } : {}), content: 'match',
      state: 'prematch', commence_from: iso(finestra.da), commence_to: iso(finestra.a),
      limit: String(CONFIG.odss.limite), ...(offset > 0 ? { offset: String(offset) } : {}),
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
    const righe = Array.isArray(dati?.odds) ? dati.odds : [];
    const da = numero(dati?.offset) ?? offset;
    const ricevute = numero(dati?.returned) ?? righe.length;
    const totale = numero(dati?.count);
    const prossimoOffset = totale !== null && ricevute > 0 && da + ricevute < totale ? da + ricevute : null;
    return { righe, prossimoOffset, limiti };
  },
};
