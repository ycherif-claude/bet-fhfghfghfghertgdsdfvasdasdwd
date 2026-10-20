import { normalizzaNome } from '../calcio/testo.js';

// 30 squadre NBA, stagione 2026-27, con nome completo ufficiale in inglese.
// Gli alias coprono le forme brevi comuni; mai "Los Angeles" o "LA" da soli.
const elenco = [
  ['ATL', 'Atlanta Hawks', ['Atlanta', 'Hawks']],
  ['BOS', 'Boston Celtics', ['Boston', 'Celtics']],
  ['BKN', 'Brooklyn Nets', ['Brooklyn', 'Nets', 'BRK']],
  ['CHA', 'Charlotte Hornets', ['Charlotte', 'Hornets', 'CHO']],
  ['CHI', 'Chicago Bulls', ['Chicago', 'Bulls']],
  ['CLE', 'Cleveland Cavaliers', ['Cleveland', 'Cavaliers', 'Cavs']],
  ['DAL', 'Dallas Mavericks', ['Dallas', 'Mavericks', 'Mavs']],
  ['DEN', 'Denver Nuggets', ['Denver', 'Nuggets']],
  ['DET', 'Detroit Pistons', ['Detroit', 'Pistons']],
  ['GSW', 'Golden State Warriors', ['Golden State', 'Warriors', 'GS']],
  ['HOU', 'Houston Rockets', ['Houston', 'Rockets']],
  ['IND', 'Indiana Pacers', ['Indiana', 'Pacers']],
  ['LAC', 'LA Clippers', ['Los Angeles Clippers', 'L.A. Clippers', 'Clippers']],
  ['LAL', 'Los Angeles Lakers', ['LA Lakers', 'L.A. Lakers', 'Lakers']],
  ['MEM', 'Memphis Grizzlies', ['Memphis', 'Grizzlies']],
  ['MIA', 'Miami Heat', ['Miami', 'Heat']],
  ['MIL', 'Milwaukee Bucks', ['Milwaukee', 'Bucks']],
  ['MIN', 'Minnesota Timberwolves', ['Minnesota', 'Timberwolves', 'Wolves']],
  ['NOP', 'New Orleans Pelicans', ['New Orleans', 'Pelicans', 'NOP']],
  ['NYK', 'New York Knicks', ['NY Knicks', 'Knicks']],
  ['OKC', 'Oklahoma City Thunder', ['Oklahoma City', 'Oklahoma', 'Thunder']],
  ['ORL', 'Orlando Magic', ['Orlando', 'Magic']],
  ['PHI', 'Philadelphia 76ers', ['Philadelphia', 'Philly', '76ers', 'Sixers']],
  ['PHX', 'Phoenix Suns', ['Phoenix', 'Suns', 'PHO']],
  ['POR', 'Portland Trail Blazers', ['Portland', 'Trail Blazers', 'Blazers']],
  ['SAC', 'Sacramento Kings', ['Sacramento', 'Kings']],
  ['SAS', 'San Antonio Spurs', ['San Antonio', 'Spurs']],
  ['TOR', 'Toronto Raptors', ['Toronto', 'Raptors']],
  ['UTA', 'Utah Jazz', ['Utah', 'Jazz']],
  ['WAS', 'Washington Wizards', ['Washington', 'Wizards']],
];

export const SQUADRE = Object.freeze(
  elenco.map(([abbr, nome, alias]) => Object.freeze({ abbr, nome, alias: Object.freeze(alias) })),
);

const indice = new Map();
for (const s of SQUADRE) {
  for (const chiave of [s.abbr, s.nome, ...s.alias]) {
    const k = normalizzaNome(chiave);
    if (indice.has(k) && indice.get(k) !== s) throw new Error(`Alias NBA ambiguo: ${chiave}`);
    indice.set(k, s);
  }
}

// Riconosce una squadra dal nome completo, dall'abbreviazione o da un alias. Non indovina mai.
export function squadraNba(nomeOAbbr) {
  if (nomeOAbbr == null) return null;
  const s = indice.get(normalizzaNome(nomeOAbbr));
  return s ? { abbr: s.abbr, nome: s.nome } : null;
}
