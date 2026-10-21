// API pubblica della Eurolega (XML, senza chiave): risultati di una giornata di una stagione.
// Non è documentata come servizio per terzi: poche richieste, una pausa fra l'una e l'altra.
import { scarica } from '../../calcio/fonti/http.js';

const BASE = 'https://api-live.euroleague.net/v1/results';
const AGENTE = 'analisi-giocate (progetto personale)';
const MESI = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const campo = (xml, nome) => {
  const m = new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml);
  return m ? m[1].replace(/&amp;/g, '&').trim() : null;
};
const intero = (v) => (v !== null && /^\d+$/.test(v) ? Number(v) : null);

// "Sep 24, 2026" → "2026-09-24"; null se il formato è diverso.
export function dataEurolega(testo) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(testo ?? '');
  if (!m || !MESI[m[1]]) return null;
  return `${m[3]}-${String(MESI[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// Partite giocate di una risposta XML. Le righe senza squadre, data o punteggio si contano in `scartate`.
export function leggiRisultati(xml, stagione) {
  // Una giornata ancora da giocare è un <results> vuoto; qualunque altra cosa è un formato cambiato.
  if (!/<results[\s>/]/.test(String(xml))) throw new Error('api-live.euroleague.net: risposta non riconosciuta (formato cambiato?)');
  const partite = [];
  let scartate = 0;
  for (const [, g] of String(xml).matchAll(/<game>([\s\S]*?)<\/game>/g)) {
    if (campo(g, 'played') !== 'true') continue;
    const p = {
      id: campo(g, 'gamecode'),
      stagione,
      giornata: intero(campo(g, 'gameday')),
      data: dataEurolega(campo(g, 'date')),
      casa: campo(g, 'homecode'),
      trasferta: campo(g, 'awaycode'),
      puntiCasa: intero(campo(g, 'homescore')),
      puntiTrasferta: intero(campo(g, 'awayscore')),
      // RS = stagione regolare; PI (play-in), PO (playoff) e FF (final four) sono postseason.
      postseason: campo(g, 'round') !== 'RS',
    };
    if (!p.id || !p.data || !p.casa || !p.trasferta || p.puntiCasa === null || p.puntiTrasferta === null) { scartate++; continue; }
    partite.push(p);
  }
  return { partite, scartate };
}

export const eurolega = {
  async giornata(stagione, giornata, opz = {}) {
    const r = await scarica(`${BASE}?seasonCode=E${stagione}&gameNumber=${giornata}`, { headers: { 'User-Agent': AGENTE }, ...opz });
    return leggiRisultati(r.testo, stagione);
  },
};
