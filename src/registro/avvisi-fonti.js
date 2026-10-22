// Avvisi delle fonti dai lavori del mattino che non scrivono una giornata (registro della taratura, storico
// delle coppe ed Elo europeo) [correzione C5]. Girano prima del giro: le righe si salvano in
// data/registro/<data>-avvisi.json (data di calendario a Roma) e il giro le mette in erroriGiro, quindi
// sulla pagina e su Telegram. Senza questo un blocco di ESPN (HTTP 403) resterebbe solo nel log dell'Action.
import fs from 'node:fs';
import path from 'node:path';
import { partiRoma } from '../bankroll/settimana.js';

export const fileAvvisiFonti = (dirData, data) => path.join(dirData, 'registro', `${data}-avvisi.json`);

// Data di calendario a Roma (AAAA-MM-GG).
export function dataCalendarioRoma(adesso) {
  const r = partiRoma(adesso);
  return new Date(Date.UTC(r.anno, r.mese - 1, r.giorno)).toISOString().slice(0, 10);
}

export function leggiAvvisiFonti(dirData, data) {
  try {
    const j = JSON.parse(fs.readFileSync(fileAvvisiFonti(dirData, data), 'utf8'));
    return Array.isArray(j?.righe) ? j.righe.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Aggiunge le righe nuove (le uguali una volta sola). Restituisce true se il file cambia.
export function segnalaAvvisiFonti(dirData, data, righe) {
  const prima = leggiAvvisiFonti(dirData, data);
  const nuove = [...new Set(righe)].filter((r) => typeof r === 'string' && !prima.includes(r));
  if (!nuove.length) return false;
  const file = fileAvvisiFonti(dirData, data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ data, righe: [...prima, ...nuove] }, null, 2)}\n`);
  return true;
}
