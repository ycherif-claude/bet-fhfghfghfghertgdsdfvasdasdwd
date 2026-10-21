// TheSportsDB, piano gratuito (chiave pubblica "123"): partite NBL di una giornata (round) di una stagione.
// Il piano gratuito ha un limite di richieste al minuto (in pratica una decina): una pausa fra l'una
// e l'altra e, dopo un 429 (troppe richieste), 30 secondi prima di riprovare.
import { scarica } from '../../calcio/fonti/http.js';

const BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const LEGA_NBL = 4434;
const AGENTE = 'analisi-giocate (progetto personale)';

const intero = (v) => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

// Stagione TheSportsDB ("2026-2027") dall'anno d'inizio.
export const stagioneTheSportsDb = (anno) => `${anno}-${anno + 1}`;

// Partite di una risposta: finite (FT o AOT, con punteggio) e in programma (con orario).
export function leggiRound(testo, stagione, round) {
  let dati;
  try { dati = JSON.parse(testo); } catch { throw new Error('thesportsdb.com: risposta non valida'); }
  const partite = [];
  let scartate = 0;
  for (const e of dati?.events ?? []) {
    const inizio = e.strTimestamp ? `${String(e.strTimestamp).replace(/Z$/, '')}Z` : null;
    const pc = intero(e.intHomeScore);
    const pt = intero(e.intAwayScore);
    const finita = /^(FT|AOT|AET)$/.test(e.strStatus ?? '') && pc !== null && pt !== null;
    const p = {
      id: e.idEvent ? String(e.idEvent) : null,
      stagione,
      giornata: round,
      // Identificativi fissi delle squadre: lo stesso club può comparire con nomi diversi.
      idCasa: e.idHomeTeam ? String(e.idHomeTeam) : null,
      idTrasferta: e.idAwayTeam ? String(e.idAwayTeam) : null,
      inizio: inizio && Number.isFinite(Date.parse(inizio)) ? new Date(inizio).toISOString() : null,
      casa: e.strHomeTeam ?? null,
      trasferta: e.strAwayTeam ?? null,
      puntiCasa: finita ? pc : null,
      puntiTrasferta: finita ? pt : null,
      finita,
      postseason: round > 100,
    };
    if (!p.id || !p.inizio || !p.casa || !p.trasferta) { scartate++; continue; }
    partite.push(p);
  }
  return { partite, scartate };
}

export const thesportsdb = {
  // Una giornata di un campionato qualunque (`lega` = id TheSportsDB, per default l'NBL).
  async round(stagione, round, opz = {}, lega = LEGA_NBL) {
    const s = stagioneTheSportsDb(stagione);
    const r = await scarica(`${BASE}/eventsround.php?id=${lega}&r=${round}&s=${s}`, { headers: { 'User-Agent': AGENTE }, attesaMs: 30000, ...opz });
    return leggiRound(r.testo, stagione, round);
  },
};
