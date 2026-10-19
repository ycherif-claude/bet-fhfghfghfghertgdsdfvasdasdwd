import { normalizzaNome } from './testo.js';

// NOMI DA VERIFICARE con i dati reali di The Odds API nel Task 10.
// Chiave: normalizzaNome(nome in football-data.co.uk / football-data.org).
// Valore: nome canonico, cioe quello di The Odds API.
// Le coppie risolte da sole (stesso nome normalizzato, o un solo candidato che contiene tutti i token) non sono elencate.
export const ALIAS = {
  'man-city': 'Manchester City',
  'man-united': 'Manchester United',
  'internazionale': 'Inter Milan',
  'internazionale-milano': 'Inter Milan',
  'inter': 'Inter Milan',
  'ath-bilbao': 'Athletic Bilbao',
  'athletic': 'Athletic Bilbao',
  'ath-madrid': 'Atletico Madrid',
  'atletico-madrid': 'Atletico Madrid',
  'espanol': 'Espanyol',
  'sp-gijon': 'Sporting Gijon',
  'la-coruna': 'Deportivo La Coruna',
  'brighton-hove-albion': 'Brighton and Hove Albion',
  'nott-m-forest': 'Nottingham Forest',
  'wolves': 'Wolverhampton Wanderers',
  'west-brom': 'West Bromwich Albion',
  'sheffield-weds': 'Sheffield Wednesday',
  'qpr': 'Queens Park Rangers',
  'ein-frankfurt': 'Eintracht Frankfurt',
  'm-gladbach': 'Borussia Monchengladbach',
  'borussia-m-gladbach': 'Borussia Monchengladbach',
  'hamburg': 'Hamburger SV',
  'hertha': 'Hertha Berlin',
  'karlsruhe': 'Karlsruher SC',
  'dresden': 'Dynamo Dresden',
  'preu-en-munster': 'Preussen Munster',
  'bayern-munchen': 'Bayern Munich',
  'paris-sg': 'Paris Saint Germain',
  'paris-saint-germain': 'Paris Saint Germain',
  'st-etienne': 'Saint-Etienne',
  'olympique-lyonnais': 'Lyon',
  'olympique-marseille': 'Marseille',
  'rennes': 'Stade Rennais',
  'psv': 'PSV Eindhoven',
  'for-sittard': 'Fortuna Sittard',
  'den-haag': 'ADO Den Haag',
  'sp-lisbon': 'Sporting CP',
  'sporting-clube-portugal': 'Sporting CP',
  'sporting-lisbon': 'Sporting CP',
  'sp-braga': 'SC Braga',
  'sporting-clube-braga': 'SC Braga',
  'sport-lisboa-benfica': 'Benfica',
  'vitoria': 'Vitoria Guimaraes',
};

const token = (n) => new Set(normalizzaNome(n).split('-').filter(Boolean));
const contiene = (grande, piccolo) => piccolo.size > 0 && [...piccolo].every((t) => grande.has(t));

export function nomeCanonico(nome, candidati) {
  const norm = normalizzaNome(nome);
  const target = Object.hasOwn(ALIAS, norm) ? ALIAS[norm] : null;
  if (target && candidati.includes(target)) return target;
  // Il bersaglio dell'alias puo essere scritto in modo un po' diverso nel contesto: si cerca anche quello.
  for (const n of target ? [nome, target] : [nome]) {
    const nn = normalizzaNome(n);
    const uguali = candidati.filter((c) => normalizzaNome(c) === nn);
    if (uguali.length === 1) return uguali[0];
    const t = token(n);
    const simili = candidati.filter((c) => {
      const tc = token(c);
      return contiene(tc, t) || contiene(t, tc);
    });
    if (simili.length === 1) return simili[0];
  }
  return null;
}
