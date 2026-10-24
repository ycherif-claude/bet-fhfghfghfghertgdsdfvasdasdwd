// Download generico da odss-api.com: uno o più gruppi di mercati (ogni gruppo è il valore di `market`, anche più
// mercati separati da virgola), sport (anche più, separati da virgola), un campionato facoltativo (sottostringa del
// nome) e la finestra d'inizio. Pagine da CONFIG.odss.limite righe con offset; budget unico (src/odss/budget.js):
// una pagina in più si chiede solo lasciando una richiesta a ogni gruppo che manca. Un solo nuovo tentativo, solo per
// errore di rete o 5xx (conta anche lui nel budget). HTTP 400 su un gruppo con più valori (l'API non li accetta più):
// si rifà con una richiesta per sport e mercato, sempre nel budget. 401/403 (chiave rifiutata) e 429 (limite
// raggiunto, che ferma anche gli step successivi) fermano tutto. Nessun messaggio contiene la chiave.
// `eventId`: solo quegli eventi (CSV di event_id), di solito senza finestra. `riservaDopo`: richieste da lasciare a uno
// step successivo dello stesso sport (il completamento del calcio).
// Risultato: { righe (grezze), richieste, ok (almeno un gruppo scaricato per intero), fermo }
// con fermo = null | 'budget' | 'chiave' | 'limite'.
import { odss } from '../calcio/fonti/odss.js';
import { CONFIG } from '../config.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scaricaOdss({
  chiave, budget, sport, gruppi, finestra = null, league = null, eventId = null, fetch = globalThis.fetch, fonte = odss, attesaMs = 2000,
  errore = () => {}, suffissoBudget = '', limite = CONFIG.odss.limite, riservaDopo = 0,
}) {
  const righe = [];
  let richieste = 0;
  let completi = 0;
  const coda = gruppi.map((market) => ({ sport, market }));
  if (!budget.puo(coda.length - 1 + riservaDopo)) {
    errore(`budget insufficiente (${budget.motivo()}; ${budget.descrizione()})${suffissoBudget}`);
    return { righe, richieste, ok: false, fermo: 'budget' };
  }
  let fermo = null;
  for (let i = 0; i < coda.length && !fermo; i++) {
    const { sport: sp, market } = coda[i];
    let offset = 0;
    let pagina = 0;
    for (;;) {
      const dopo = coda.length - 1 - i + riservaDopo;
      if (!budget.puo(pagina === 0 ? riservaDopo : dopo)) {
        if (pagina > 0) { errore(`${market}: quote incomplete (le altre pagine superano il budget di oggi)`); break; }
        errore(`${budget.motivo()}: mercati non scaricati: ${coda.slice(i).map((x) => x.market).join(', ')}`);
        fermo = 'budget';
        break;
      }
      let r = null;
      let err = null;
      for (let t = 0; t < 2; t++) {
        if (t > 0) {
          if (!budget.puo(pagina === 0 ? riservaDopo : dopo)) break;
          await pausa(attesaMs);
        }
        budget.conta();
        richieste++;
        try {
          r = await fonte.quote({ chiave, sport: sp, market, league, eventId, finestra, offset, limite, fetch });
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
        if (err?.status === 400 && pagina === 0 && (market.includes(',') || sp.includes(','))) {
          const parti = sp.split(',').flatMap((s) => market.split(',').map((m) => ({ sport: s, market: m })));
          errore(`${market}: ${msg} con più valori insieme: una richiesta per sport e mercato`);
          coda.splice(i + 1, 0, ...parti);
        } else if (err?.status === 429) {
          errore(`${market}: ${msg} (limite di richieste raggiunto): niente altre richieste a odss-api fino al reset`);
          budget.ferma429();
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
