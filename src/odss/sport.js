// Quote di odss-api per la raccolta di uno sport (tennis, basket, NBA, pallavolo): legge lo stato del budget unico
// (data/stato/odss.json), scarica i gruppi di mercati della finestra, salva lo stato e restituisce gli eventi a tempo
// intero. Nessuna richiesta se lo sport oggi non ha partite (`partite: 0`).
// { eventi: [...] | null (download non riuscito: lo sport torna alla fonte di prima), errori: [righe per erroriGiro],
//   richieste, esito: 'ok' | 'senza partite' | 'senza chiave' | 'budget' | 'chiave' | 'limite' | 'errore', diagnostica }.
import { oraRoma } from '../calcio/testo.js';
import { creaBudgetOdss, leggiStatoOdss, scriviStatoOdss } from './budget.js';
import { scaricaOdss } from './scarica.js';
import { eventiDaRighe } from './eventi.js';

export async function eventiOdssSport({
  dirData, data, adesso, chiave, sport, budgetSport = sport, gruppi, league = null, finestra, fetch = globalThis.fetch,
  attesaMs = 2000, partite = null, nome = sport,
}) {
  const errori = [];
  const errore = (m) => errori.push(`odss-api (${nome}) alle ${oraRoma(adesso)}: ${m}`);
  if (partite === 0) return { eventi: [], errori, richieste: 0, esito: 'senza partite' };
  if (!chiave) {
    errore(`manca il secret ODSS_API_KEY: quote di ${nome} dalla fonte di prima`);
    return { eventi: null, errori, richieste: 0, esito: 'senza chiave' };
  }
  const budget = creaBudgetOdss({ stato: leggiStatoOdss(dirData), data, adesso, sport: budgetSport });
  const r = await scaricaOdss({
    chiave, budget, sport, gruppi, finestra, league, fetch, attesaMs, errore, suffissoBudget: `: quote di ${nome} dalla fonte di prima`,
  });
  if (r.richieste) scriviStatoOdss(dirData, budget.stato());
  const esito = r.fermo ?? (r.ok ? 'ok' : 'errore');
  if (!r.ok && !r.righe.length) return { eventi: null, errori, richieste: r.richieste, esito };
  const eventi = eventiDaRighe(r.righe, { adesso });
  return { eventi, errori, richieste: r.richieste, esito, diagnostica: eventi.diagnostica };
}
