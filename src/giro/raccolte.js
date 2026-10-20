// Raccolte della giornata: il calcio (data/raccolta/<oggi>.json) e ogni sport noto
// (data/raccolta/<oggi>-<sport>.json), unite in una sola raccolta per il giro.
import fs from 'node:fs';
import path from 'node:path';

// Sport con una raccolta propria. In futuro: 'basket', 'pallavolo'.
// Si leggono solo questi nomi: `-notizie`, `-serale-*` e ogni altro suffisso restano fuori.
export const SPORT_RACCOLTA = Object.freeze(['nba', 'tennis']);
const NOME_SPORT = { nba: 'NBA', tennis: 'tennis' };

const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const elenco = (x) => (Array.isArray(x) ? x : []);

// Un file di raccolta. `nome` = '' per il calcio (messaggi di sempre), 'NBA' per l'NBA, 'tennis' per il tennis.
function leggiFile(dirData, oggi, suffisso, nome) {
  const base = `${oggi}${suffisso ? `-${suffisso}` : ''}.json`;
  const rel = `data/raccolta/${base}`;
  const file = path.join(dirData, 'raccolta', base);
  const chi = nome ? `Raccolta ${nome} di oggi` : 'Raccolta di oggi';
  if (!fs.existsSync(file)) return { raccolta: null, errore: `${chi} mancante: ${rel}` };
  let r;
  try {
    r = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { raccolta: null, errore: `${chi} illeggibile: ${rel} (${e.message})` };
  }
  if (!oggetto(r) || !Array.isArray(r.partite)) return { raccolta: null, errore: `${chi} illeggibile: ${rel} (manca l'elenco delle partite)` };
  if (r.data !== oggi) return { raccolta: null, errore: `${chi} mancante: ${rel} (il file è del ${r.data})` };
  return { raccolta: r, errore: null };
}

// { raccolta, errori, lette }:
// - `raccolta`: null se nessun file è leggibile; l'oggetto del calcio così com'è se non c'è
//   altro; altrimenti il calcio (se c'è) con partite, competizioniNonCoperte ed erroriGiro
//   uniti, prima il calcio e poi gli sport nell'ordine di SPORT_RACCOLTA;
// - `errori`: una riga per ogni raccolta mancante o illeggibile (prima il calcio);
// - `lette`: { calcio: bool, partiteSport: numero di partite degli altri sport }.
export function leggiRaccolte(dirData, oggi) {
  const errori = [];
  const calcio = leggiFile(dirData, oggi, '', '');
  if (calcio.errore) errori.push(calcio.errore);
  const sport = [];
  for (const s of SPORT_RACCOLTA) {
    const r = leggiFile(dirData, oggi, s, NOME_SPORT[s] ?? s.toUpperCase());
    if (r.errore) errori.push(r.errore);
    else sport.push(r.raccolta);
  }
  const lette = { calcio: calcio.raccolta !== null, partiteSport: sport.reduce((n, r) => n + r.partite.length, 0) };
  const tutte = [...(calcio.raccolta ? [calcio.raccolta] : []), ...sport];
  if (!tutte.length) return { raccolta: null, errori, lette };
  if (!sport.length) return { raccolta: calcio.raccolta, errori, lette };
  const raccolta = {
    ...(calcio.raccolta ?? {}),
    data: oggi,
    partite: tutte.flatMap((r) => r.partite),
    competizioniNonCoperte: tutte.flatMap((r) => elenco(r.competizioniNonCoperte)),
    erroriGiro: tutte.flatMap((r) => elenco(r.erroriGiro)),
  };
  return { raccolta, errori, lette };
}
