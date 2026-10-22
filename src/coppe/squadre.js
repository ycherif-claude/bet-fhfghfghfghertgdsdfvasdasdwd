// Squadre delle coppe europee: id ESPN → squadra dei campionati con storico (paese:nome del CSV).
// Le squadre di ESPN si riconoscono dall'elenco delle squadre di ogni campionato ESPN (id esatto),
// poi per nome tra le squadre di quel paese. Le altre restano squadre "solo coppe" (espn:<id>).
import { abbinaEspn } from '../calcio/squadre.js';
import { ALIAS_ESPN_CSV, COMPETIZIONI } from '../calcio/competizioni.js';
import { ALIAS } from '../calcio/squadre.js';
import { normalizzaNome } from '../calcio/testo.js';

// Paese di ogni codice CSV (le serie dello stesso paese condividono i nomi delle squadre).
export const PAESE = {
  E0: 'ENG', E1: 'ENG', E2: 'ENG', E3: 'ENG', EC: 'ENG',
  SC0: 'SCO', SC1: 'SCO', SC2: 'SCO', SC3: 'SCO',
  D1: 'GER', D2: 'GER', I1: 'ITA', I2: 'ITA', SP1: 'ESP', SP2: 'ESP', F1: 'FRA', F2: 'FRA',
  N1: 'NED', P1: 'POR', B1: 'BEL', T1: 'TUR', G1: 'GRE',
  AUT: 'AUT', DNK: 'DNK', SWZ: 'SUI', NOR: 'NOR', SWE: 'SWE', POL: 'POL', ROU: 'ROU', IRL: 'IRL', FIN: 'FIN',
  ARG: 'ARG', BRA: 'BRA', MEX: 'MEX', USA: 'USA', JPN: 'JPN', CHN: 'CHN',
};

// Campionati ESPN per paese (per l'elenco delle squadre con il loro id ESPN).
export const ESPN_PAESE = {
  ENG: ['eng.1', 'eng.2', 'eng.3', 'eng.4', 'eng.5'], SCO: ['sco.1', 'sco.2'], GER: ['ger.1', 'ger.2'], ITA: ['ita.1', 'ita.2'],
  ESP: ['esp.1', 'esp.2'], FRA: ['fra.1', 'fra.2'], NED: ['ned.1'], POR: ['por.1'], BEL: ['bel.1'], TUR: ['tur.1'], GRE: ['gre.1'],
  AUT: ['aut.1'], DNK: ['den.1'], SUI: ['sui.1'], NOR: ['nor.1'], SWE: ['swe.1'], ROU: ['rou.1'], IRL: ['irl.1'], FIN: ['fin.1'],
};

// Nomi ESPN delle coppe → nomi del CSV, oltre a quelli dei campionati senza quote.
const ALIAS_COPPE = {
  'CSU Craiova': 'Univ. Craiova', 'Universitatea Cluj': 'U. Cluj', Internazionale: 'Inter', 'FC Cologne': 'FC Koln',
  'Brighton & Hove Albion': 'Brighton', 'Athletic Club': 'Ath Bilbao', 'Sint-Truidense': 'St Truiden',
};
// Alias di tutti i campionati, dal nome ESPN al nome del CSV.
const ALIAS_TUTTI = Object.assign({}, ...Object.values(ALIAS_ESPN_CSV), ALIAS_COPPE);
// Paesi con storico ma senza elenco squadre su ESPN: lì le squadre si cercano per nome. Negli altri paesi
// no: "Inter Baku" non è l'Inter, "Red Star Belgrade" non è il Red Star francese.
const SENZA_ELENCO = ['POL', 'FIN', 'IRL'];

// Nome del CSV per un nome ESPN fra i nomi di un paese: alias ESPN, alias delle quote, nome uguale o contenuto.
export function nomeNelPaese(nome, nomiPaese) {
  const r = abbinaEspn(nome, nomiPaese, ALIAS_TUTTI);
  if (r) return r;
  // Alias delle quote: chiave = nome del CSV normalizzato, valore = nome tipo ESPN/The Odds API.
  const norm = normalizzaNome(nome);
  const daAlias = nomiPaese.filter((c) => {
    const k = normalizzaNome(c);
    return Object.hasOwn(ALIAS, k) && normalizzaNome(ALIAS[k]) === norm;
  });
  return daAlias.length === 1 ? daAlias[0] : null;
}

// Id della squadra per il rating: `PAESE:nome CSV` se riconosciuta, altrimenti `espn:<id>`.
export function idSquadra(squadraEspn, { paeseDiEspn, nomiPerPaese }) {
  const paese = paeseDiEspn.get(squadraEspn.id);
  if (paese && nomiPerPaese.has(paese)) {
    const n = nomeNelPaese(squadraEspn.nome, nomiPerPaese.get(paese));
    if (n) return `${paese}:${n}`;
  }
  // Paese sconosciuto: un solo paese senza elenco ESPN con quel nome, e senza numeri in più ("Bohemians 1905").
  if (!paese && !/\d/.test(squadraEspn.nome)) {
    const trovati = SENZA_ELENCO.filter((p) => nomiPerPaese.has(p))
      .map((p) => [p, nomeNelPaese(squadraEspn.nome, nomiPerPaese.get(p))]).filter(([, n]) => n);
    if (trovati.length === 1) return `${trovati[0][0]}:${trovati[0][1]}`;
  }
  return `espn:${squadraEspn.id}`;
}

export const codiciCsv = () => COMPETIZIONI.filter((c) => c.csv).map((c) => c.csv);
