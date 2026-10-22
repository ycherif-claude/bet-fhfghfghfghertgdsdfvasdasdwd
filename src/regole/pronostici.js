// Pronostici sì/no [utente, 22/10/2026]: per ogni partita i mercati dove il modello, da solo e senza
// quote, è sopra la soglia del mercato (CONFIG.pronostici). La probabilità mostrata è quella vera della
// stessa fascia nelle stagioni passate (data/taratura/calibrazione.json); la quota minima è 1 / probabilità.
// La quota del bookmaker, se c'è, serve solo a dire se oggi conviene giocarlo.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';

const C = CONFIG.pronostici;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function leggiCalibrazione(dirData) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirData, 'taratura', 'calibrazione.json'), 'utf8'));
  } catch {
    return null;
  }
}

const chiave = (sport, mercato, selezione) => (sport === 'tennis' ? `${mercato}|*` : `${mercato}|${selezione}`);

// Frequenza vera della fascia del modello; con meno di minCampioniFascia casi si usa la fascia sotto.
export function probCalibrata(fasce, p) {
  if (!Array.isArray(fasce)) return null;
  const valide = fasce.filter((f) => f.n >= C.minCampioniFascia && f.da <= p + 1e-9).sort((a, b) => b.da - a.da);
  return valide.length ? Math.min(0.97, valide[0].vera) : null;
}

export const quotaMinima = (prob) => Math.ceil((1 / prob) * 100 - 1e-9) / 100;

// Frase semplice del pronostico (per sito e Telegram).
export function testoPronostico(partita, mercato, selezione) {
  const casa = partita.casa ?? String(partita.partita).split(' - ')[0];
  const trasferta = partita.trasferta ?? String(partita.partita).split(' - ')[1];
  const k = `${mercato}|${selezione}`;
  const testi = {
    '1X2|1': `Vince ${casa}`,
    '1X2|2': `Vince ${trasferta}`,
    'Doppia chance|1X': `${casa} non perde (1X)`,
    'Doppia chance|X2': `${trasferta} non perde (X2)`,
    'Doppia chance|12': 'Non finisce in pareggio (12)',
    'Under/Over 1.5|Over 1.5': 'Almeno 2 gol (Over 1.5)',
    'Under/Over 2.5|Over 2.5': 'Almeno 3 gol (Over 2.5)',
    'Under/Over 3.5|Under 3.5': 'Al massimo 3 gol (Under 3.5)',
    'Under/Over casa 0.5|Over 0.5': `Segna ${casa}`,
    'Under/Over trasferta 0.5|Over 0.5': `Segna ${trasferta}`,
  };
  if (testi[k]) return testi[k];
  if (/^Vincente/.test(mercato)) return `Vince ${selezione}`;
  return `${mercato}: ${selezione}`;
}

// Pronostici di una partita della raccolta: al massimo maxPerPartita, i più sicuri.
export function pronosticiPartita(partita, calibrazione) {
  const sport = partita.sport ?? 'calcio';
  const soglie = C.soglie[sport];
  if (!soglie || !calibrazione?.[sport]) return [];
  const out = [];
  for (const m of partita.mercati ?? []) {
    const k = chiave(sport, m.mercato, m.selezione);
    if (!(k in soglie) || !num(m.probModello) || m.probModello < soglie[k] - 1e-9) continue;
    const prob = probCalibrata(calibrazione[sport][k], m.probModello);
    if (!prob) continue;
    const minima = quotaMinima(prob);
    const quota = num(m.quota) && m.quota > 1 ? m.quota : null;
    out.push({
      mercato: m.mercato, selezione: m.selezione, testo: testoPronostico(partita, m.mercato, m.selezione), probModello: m.probModello, prob, quotaMinima: minima,
      quota, giocabile: quota !== null && quota >= minima, esito: null,
    });
  }
  return out.sort((a, b) => b.prob - a.prob).slice(0, C.maxPerPartita);
}

// Pronostici del giorno: le partite non iniziate con almeno un pronostico, in ordine di inizio.
export function pronosticiGiornata(raccolta, calibrazione, { adesso = null, escluse = new Set() } = {}) {
  const out = [];
  for (const p of raccolta?.partite ?? []) {
    if (!p || escluse.has(p.idPartita)) continue;
    if (adesso && Date.parse(p.inizio) <= adesso.getTime()) continue;
    const pronostici = pronosticiPartita(p, calibrazione);
    if (!pronostici.length) continue;
    out.push({ idPartita: p.idPartita, sport: p.sport ?? 'calcio', competizione: p.competizione, partita: p.partita, inizio: p.inizio, pronostici });
  }
  return out.sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio));
}
