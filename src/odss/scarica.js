// Download generico da odss-api.com per uno sport: uno o più gruppi di mercati (ogni gruppo è il valore di `market`,
// anche più mercati separati da virgola), un campionato facoltativo (sottostringa del nome) e la finestra d'inizio.
// Paginazione con offset; budget unico (src/odss/budget.js): una pagina in più si chiede solo lasciando una richiesta
// a ogni gruppo che manca. Un solo nuovo tentativo, solo per errore di rete o 5xx (conta anche lui nel budget).
// 401/403 (chiave rifiutata) e 429 (limite raggiunto) fermano tutto. Nessun messaggio contiene la chiave.
// Risultato: { righe (grezze), richieste, ok (almeno un gruppo scaricato per intero), fermo }
// con fermo = null | 'budget' | 'chiave' | 'limite'.
import { odss } from '../calcio/fonti/odss.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scaricaOdss({
  chiave, budget, sport, gruppi, finestra, league = null, fetch = globalThis.fetch, fonte = odss, attesaMs = 2000,
  errore = () => {}, suffissoBudget = '',
}) {
  const righe = [];
  let richieste = 0;
  let completi = 0;
  if (!budget.puo(gruppi.length - 1)) {
    errore(`budget insufficiente (${budget.descrizione()})${suffissoBudget}`);
    return { righe, richieste, ok: false, fermo: 'budget' };
  }
  let fermo = null;
  for (let i = 0; i < gruppi.length && !fermo; i++) {
    const market = gruppi[i];
    const dopo = gruppi.length - 1 - i;
    let offset = 0;
    let pagina = 0;
    for (;;) {
      if (!budget.puo(pagina === 0 ? 0 : dopo)) {
        if (pagina > 0) { errore(`${market}: quote incomplete (le altre pagine superano il budget di oggi)`); break; }
        errore(`${budget.motivo()}: mercati non scaricati: ${gruppi.slice(i).join(', ')}`);
        fermo = 'budget';
        break;
      }
      let r = null;
      let err = null;
      for (let t = 0; t < 2; t++) {
        if (t > 0) {
          if (!budget.puo(pagina === 0 ? 0 : dopo)) break;
          await pausa(attesaMs);
        }
        budget.conta();
        richieste++;
        try {
          r = await fonte.quote({ chiave, sport, market, league, finestra, offset, fetch });
          budget.aggiorna(r.limiti);
          err = null;
          break;
        } catch (e) {
          err = e;
          if (e?.limiti) budget.aggiorna(e.limiti);
          if (!(e?.rete || e?.status >= 500)) break;
        }
      }
      if (err || !r) {
        const msg = String(err?.message ?? err ?? 'errore sconosciuto').replaceAll(chiave, '***');
        if (err?.status === 429) {
          errore(`${market}: ${msg} (limite di richieste raggiunto): niente altre richieste oggi`);
          fermo = 'limite';
        } else if (err?.status === 401 || err?.status === 403) {
          errore(`${market}: ${msg} (chiave rifiutata): niente quote da odss-api oggi`);
          fermo = 'chiave';
        } else {
          errore(`${market}: ${msg}${pagina > 0 ? ' (quote incomplete)' : ''}`);
        }
        break;
      }
      righe.push(...r.righe);
      if (r.prossimoOffset === null || r.prossimoOffset <= offset) { completi++; break; }
      offset = r.prossimoOffset;
      pagina++;
    }
  }
  return { righe, richieste, ok: completi > 0, fermo };
}
