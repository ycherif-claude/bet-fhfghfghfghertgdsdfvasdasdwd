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
  'brighton': 'Brighton and Hove Albion',
  'preston': 'Preston North End',
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
// Squadre giovanili o di riserva: non si abbinano mai alla prima squadra.
const MARCATORI = ['b', 'ii', 'iii', '2', 'u17', 'u19', 'u21', 'u23', 'castilla', 'jong', 'reserves', 'amateure', 'youth', 'primavera'];
const marcatori = (t) => MARCATORI.filter((m) => t.has(m)).join();
const NOMI_CANONICI = new Set(Object.values(ALIAS).map(normalizzaNome));

// Contenimento dei token: il nome piu corto deve coprire almeno meta di quello piu lungo,
// e i marcatori di riserva/giovanili devono coincidere.
function simile(a, b) {
  const [corto, lungo] = a.size <= b.size ? [a, b] : [b, a];
  if (corto.size === 0 || corto.size * 2 < lungo.size) return false;
  if (![...corto].every((t) => lungo.has(t))) return false;
  return marcatori(a) === marcatori(b);
}

export function nomeCanonico(nome, candidati) {
  const norm = normalizzaNome(nome);
  const target = Object.hasOwn(ALIAS, norm) ? ALIAS[norm] : null;
  if (target) {
    if (candidati.includes(target)) return target;
    // Il bersaglio dell'alias, se non e tra i candidati, conta solo con nome normalizzato uguale.
    const uguali = candidati.filter((c) => normalizzaNome(c) === normalizzaNome(target));
    return uguali.length === 1 ? uguali[0] : null;
  }
  const uguali = candidati.filter((c) => normalizzaNome(c) === norm);
  if (uguali.length === 1) return uguali[0];
  if (uguali.length > 1) return null;
  // Un nome canonico noto ma assente dai candidati non va agganciato a un'altra squadra.
  if (NOMI_CANONICI.has(norm)) return null;
  const t = token(nome);
  const simili = candidati.filter((c) => simile(t, token(c)));
  return simili.length === 1 ? simili[0] : null;
}

// Nome usato nel CSV per una squadra di The Odds API (nome canonico); null se assente o ambiguo.
export function abbinaSquadra(nomeOdds, nomiCsv) {
  const target = normalizzaNome(nomeOdds);
  const diretti = nomiCsv.filter((c) => {
    const norm = normalizzaNome(c);
    return normalizzaNome(Object.hasOwn(ALIAS, norm) ? ALIAS[norm] : c) === target;
  });
  if (diretti.length === 1) return diretti[0];
  if (diretti.length > 1) return null;
  return nomeCanonico(nomeOdds, nomiCsv);
}
