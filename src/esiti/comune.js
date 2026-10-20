// Regole comuni degli esiti di NBA e tennis (il calcio ha le sue, invariate).
// Si scrive solo `esito`; anche le annullate (l'utente può averle giocate prima del controllo);
// nelle multiple miste ogni sport scrive l'esito delle proprie gambe e la multipla si chiude
// quando tutte le gambe ne hanno uno.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoma } from '../calcio/testo.js';
import { daAvvisare } from '../calcio/esiti.js';

const GIORNO = 86400000;
const FILE_GIORNATA = /^(\d{4}-\d{2}-\d{2})\.json$/;

export const gambeDi = (g) => (Array.isArray(g.gambe) && g.gambe.length ? g.gambe : [g]);
export const inizioMs = (g) => Math.max(...gambeDi(g).map((x) => Date.parse(x.inizio)));
export const sportDi = (x, g) => x.sport ?? g.sport;
export const aperta = (g) => g.esito === null;

// Gambe di `sport` senza esito e iniziate da più di `ritardoMs`.
export const gambeDaChiudere = (g, sport, ritardoMs, adesso) => gambeDi(g).filter((x) => sportDi(x, g) === sport
  && x.esito == null && Date.parse(x.inizio) + ritardoMs < adesso.getTime());

// Regola della multipla: persa se una gamba è persa; aperta (null) se ne manca una;
// rimborsata se sono tutte rimborsate; altrimenti vinta.
export function chiusura(g) {
  const esiti = gambeDi(g).map((x) => x.esito ?? null);
  if (esiti.includes('persa')) return 'persa';
  if (esiti.includes(null)) return null;
  if (esiti.every((e) => e === 'rimborsata')) return 'rimborsata';
  return 'vinta';
}

// Giornate passate leggibili: { out: [{ percorso, dati }], errori }; i file rotti vanno in `errori`.
export function leggiGiornate(dirData, adesso) {
  const oggi = dataRoma(adesso);
  const out = [];
  const errori = [];
  let nomi = [];
  try { nomi = readdirSync(dirData).sort(); } catch { return { out, errori }; }
  for (const nome of nomi) {
    const m = FILE_GIORNATA.exec(nome);
    if (!m || m[1] >= oggi) continue;
    const percorso = join(dirData, nome);
    try {
      const dati = JSON.parse(readFileSync(percorso, 'utf8'));
      if (Array.isArray(dati?.giocate)) out.push({ percorso, dati });
    } catch (e) {
      errori.push(`${nome}: file non leggibile (${e.message})`);
    }
  }
  return { out, errori };
}

// Avviso dopo 7 giorni senza esito (per le annullate solo se segnate come giocate); null se non serve.
export function avvisoSettimana(g, segnate, adesso) {
  const giorni = Math.floor((adesso.getTime() - inizioMs(g)) / GIORNO);
  return giorni >= 7 && daAvvisare(g, segnate) ? `Giocata ${g.id} senza esito da ${giorni} giorni` : null;
}
