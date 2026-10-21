import { slug } from '../calcio/testo.js';

// Squadre di Eurolega (codici dell'API ufficiale, stagione 2026-27 più quelle della 2025-26)
// e NBL. Ogni squadra ha parole chiave distintive: un nome (di The Odds API, dell'API Eurolega
// o di TheSportsDB) è riconosciuto se contiene, come parole intere, le parole di una sola squadra.
// Mai parole condivise da due squadre ("tel aviv", "istanbul", "belgrade", "melbourne").
const TABELLE = {
  eurolega: [
    ['ASV', 'ASVEL', ['asvel', 'villeurbanne']],
    ['BAR', 'FC Barcelona', ['barcelona', 'barca']],
    ['BAS', 'Baskonia', ['baskonia', 'vitoria']],
    ['BES', 'Besiktas', ['besiktas']],
    ['DUB', 'Dubai Basketball', ['dubai']],
    ['HTA', 'Hapoel Tel Aviv', ['hapoel']],
    ['IST', 'Anadolu Efes', ['anadolu', 'efes']],
    ['MAD', 'Real Madrid', ['real madrid']],
    ['MCO', 'AS Monaco', ['monaco']],
    ['MIL', 'Olimpia Milano', ['olimpia', 'milano', 'milan', 'armani']],
    ['MUN', 'Bayern Munich', ['bayern', 'munich', 'munchen']],
    ['OLY', 'Olympiacos', ['olympiacos', 'olympiakos', 'piraeus']],
    ['PAM', 'Valencia Basket', ['valencia']],
    ['PAN', 'Panathinaikos', ['panathinaikos']],
    ['PAR', 'Partizan', ['partizan']],
    ['PRS', 'Paris Basketball', ['paris']],
    ['RED', 'Crvena Zvezda', ['crvena zvezda', 'zvezda', 'red star']],
    ['TEL', 'Maccabi Tel Aviv', ['maccabi']],
    ['ULK', 'Fenerbahce', ['fenerbahce']],
    ['VIR', 'Virtus Bologna', ['virtus', 'bologna']],
    ['ZAL', 'Zalgiris Kaunas', ['zalgiris', 'kaunas']],
  ],
  nbl: [
    ['ADE', 'Adelaide 36ers', ['adelaide', '36ers']],
    ['BRI', 'Brisbane Bullets', ['brisbane', 'bullets']],
    ['CAI', 'Cairns Taipans', ['cairns', 'taipans']],
    ['ILL', 'Illawarra Hawks', ['illawarra', 'hawks']],
    ['MEL', 'Melbourne United', ['melbourne united', 'united']],
    ['NZB', 'New Zealand Breakers', ['new zealand', 'breakers']],
    ['PER', 'Perth Wildcats', ['perth', 'wildcats']],
    ['SEM', 'South East Melbourne Phoenix', ['south east melbourne', 's e melbourne', 'phoenix']],
    ['SYD', 'Sydney Kings', ['sydney', 'kings']],
    ['TAS', 'Tasmania JackJumpers', ['tasmania', 'jackjumpers', 'jack jumpers']],
  ],
};

const parole = (testo) => `-${slug(testo)}-`;

export const CAMPIONATI_BASKET = Object.freeze(Object.keys(TABELLE));

// Codice della squadra del campionato, o null se il nome non è riconosciuto o è ambiguo. Non indovina mai.
export function codiceSquadra(campionato, nome) {
  const tabella = TABELLE[campionato];
  if (!tabella || nome == null) return null;
  const testo = parole(nome);
  const trovate = tabella.filter(([, , chiavi]) => chiavi.some((k) => testo.includes(parole(k))));
  return trovate.length === 1 ? trovate[0][0] : null;
}

export function nomeSquadra(campionato, codice) {
  return TABELLE[campionato]?.find(([c]) => c === codice)?.[1] ?? null;
}

// Controllo della tabella: nessuna parola chiave deve riconoscere due squadre.
for (const [campionato, tabella] of Object.entries(TABELLE)) {
  for (const [codice, nome] of tabella) {
    if (codiceSquadra(campionato, nome) !== codice) throw new Error(`Squadra ${campionato} ambigua: ${nome}`);
  }
}
