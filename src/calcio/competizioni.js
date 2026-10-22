// Gruppi della calibrazione dei pronostici [correzione B2]: ogni gruppo ha la sua tabella
// (data/taratura/calibrazione.json; le coppe in data/storico/elo-europeo.json).
export const GRUPPI_CALIBRAZIONE = ['principali', 'secondeSerie', 'extra', 'coppe'];
const SECONDE_SERIE = new Set(['E1', 'I2', 'SP2', 'D2', 'F2']);

const c = (chiave, csv, nome, priorita) => ({
  chiave, nome, csv, priorita, modello: csv ? 'dixon-coles' : 'solo-pinnacle',
  gruppo: csv ? (SECONDE_SERIE.has(csv) ? 'secondeSerie' : 'principali') : null,
});

// Campionati senza quote [utente, 22/10/2026]: solo modello e pronostici sì/no, le quote le guarda l'utente.
// Calendario da ESPN (`espn`) o, se ESPN non li ha, dai file fixtures di football-data.co.uk.
// `formato: 'extra'`: storico in un solo file (football-data.co.uk/new/<codice>.csv), senza primo tempo.
// `paese`/`lega`: come nel file fixtures dei campionati extra. Verificati il 22/10/2026 (pronostici giusti
// il 76-81% sulle stagioni 2023/24-2025/26, in linea con la calibrazione).
const n = (csv, nome, espn, extra = null) => ({
  chiave: null, nome, csv, priorita: 4, modello: 'dixon-coles', gruppo: 'extra', espn, ...(extra ? { formato: 'extra', ...extra } : {}),
});

export const COMPETIZIONI = [
  c('soccer_epl', 'E0', 'Premier League', 1),
  c('soccer_spain_la_liga', 'SP1', 'LaLiga', 1),
  c('soccer_italy_serie_a', 'I1', 'Serie A', 1),
  c('soccer_germany_bundesliga', 'D1', 'Bundesliga', 1),
  c('soccer_france_ligue_one', 'F1', 'Ligue 1', 1),
  { ...c('soccer_uefa_champs_league', null, 'Champions League', 1), coppa: true, gruppo: 'coppe' },
  { ...c('soccer_uefa_europa_league', null, 'Europa League', 1), coppa: true, gruppo: 'coppe' },
  c('soccer_netherlands_eredivisie', 'N1', 'Eredivisie', 2),
  c('soccer_portugal_primeira_liga', 'P1', 'Primeira Liga', 2),
  c('soccer_efl_champ', 'E1', 'Championship', 2),
  c('soccer_uefa_nations_league', null, 'Nations League', 2),
  c('soccer_fifa_world_cup_qualifiers_europe', null, 'Qualificazioni Mondiali', 2),
  c('soccer_italy_serie_b', 'I2', 'Serie B', 3),
  c('soccer_spain_segunda_division', 'SP2', 'Segunda División', 3),
  c('soccer_germany_bundesliga2', 'D2', '2. Bundesliga', 3),
  c('soccer_france_ligue_two', 'F2', 'Ligue 2', 3),
  n('E2', 'League One', 'soccer/eng.3'),
  n('E3', 'League Two', 'soccer/eng.4'),
  n('EC', 'National League', 'soccer/eng.5'),
  n('SC0', 'Scottish Premiership', 'soccer/sco.1'),
  n('SC1', 'Scottish Championship', 'soccer/sco.2'),
  n('SC2', 'Scottish League One', null),
  n('SC3', 'Scottish League Two', null),
  n('B1', 'Pro League (Belgio)', null),
  n('T1', 'Süper Lig (Turchia)', 'soccer/tur.1'),
  n('G1', 'Super League (Grecia)', 'soccer/gre.1'),
  n('AUT', 'Bundesliga (Austria)', 'soccer/aut.1', { paese: 'Austria', lega: 'Bundesliga' }),
  n('DNK', 'Superliga (Danimarca)', 'soccer/den.1', { paese: 'Denmark', lega: 'Superliga' }),
  n('SWZ', 'Super League (Svizzera)', null, { paese: 'Switzerland', lega: 'Super League' }),
  n('NOR', 'Eliteserien (Norvegia)', 'soccer/nor.1', { paese: 'Norway', lega: 'Eliteserien' }),
  n('SWE', 'Allsvenskan (Svezia)', 'soccer/swe.1', { paese: 'Sweden', lega: 'Allsvenskan' }),
  n('POL', 'Ekstraklasa (Polonia)', null, { paese: 'Poland', lega: 'Ekstraklasa' }),
  n('ROU', 'Superliga (Romania)', null, { paese: 'Romania', lega: 'Superliga' }),
  n('IRL', 'Premier Division (Irlanda)', null, { paese: 'Ireland', lega: 'Premier Division' }),
  n('FIN', 'Veikkausliiga (Finlandia)', null, { paese: 'Finland', lega: 'Veikkausliiga' }),
  n('ARG', 'Liga Profesional (Argentina)', 'soccer/arg.1', { paese: 'Argentina', lega: 'Liga Profesional' }),
  n('BRA', 'Serie A (Brasile)', 'soccer/bra.1', { paese: 'Brazil', lega: 'Serie A' }),
  n('MEX', 'Liga MX (Messico)', 'soccer/mex.1', { paese: 'Mexico', lega: 'Liga MX' }),
  n('USA', 'MLS (Stati Uniti)', 'soccer/usa.1', { paese: 'USA', lega: 'MLS' }),
  n('JPN', 'J1 League (Giappone)', 'soccer/jpn.1', { paese: 'Japan', lega: 'J1 League' }),
  n('CHN', 'Super League (Cina)', 'soccer/chn.1', { paese: 'China', lega: 'Super League' }),
  // Coppa senza quote: calendario da ESPN, modello Elo europeo (src/coppe).
  { chiave: null, nome: 'Conference League', csv: null, priorita: 4, modello: 'elo-europeo', espn: 'soccer/uefa.europa.conf', coppa: true, gruppo: 'coppe' },
];

// Gruppo della calibrazione di una competizione (per nome), null se non ha pronostici (nazionali).
export const gruppoCompetizione = (nome) => COMPETIZIONI.find((x) => x.nome === nome)?.gruppo ?? null;

// Nomi ESPN → nomi del CSV di football-data.co.uk, per i campionati senza quote (codice del CSV → { ESPN: CSV }).
// I nomi uguali o contenuti l'uno nell'altro si abbinano da soli.
export const ALIAS_ESPN_CSV = {
  E2: { 'Peterborough United': 'Peterboro', 'Sheffield Wednesday': 'Sheffield Weds' },
  E3: { 'Bristol Rovers': 'Bristol Rvs' },
  EC: { 'Boston United': 'Boston Utd' },
  SC0: { 'Heart of Midlothian': 'Hearts' },
  SC1: { "Queen's Park": 'Queens Park', 'Inverness Caledonian Thistle': 'Inverness C', 'Raith Rovers': 'Raith Rvs' },
  T1: { 'Erzurum BB': 'Erzurumspor', 'Amed SFK': 'Amedspor', 'Istanbul Basaksehir': 'Buyuksehyr' },
  G1: { Levadiakos: 'Levadeiakos', Olympiacos: 'Olympiakos', 'Asteras Tripoli': 'Asteras Tripolis' },
  AUT: { 'Austria Lustenau': 'A. Lustenau', 'SV Josko Ried': 'Ried', 'Rapid Vienna': 'SK Rapid', 'WSG Swarovski Tirol': 'Tirol' },
  DNK: { 'Brøndby IF': 'Brondby', 'F.C. København': 'FC Copenhagen', 'FC Nordsjælland': 'Nordsjaelland', 'Sønderjyske Fodbold': 'Sonderjyske', AGF: 'Aarhus' },
  NOR: { Hamarkameratene: 'HamKam', 'Sarpsborg FK': 'Sarpsborg 08' },
  ARG: {
    "Newell's Old Boys": 'Newells Old Boys', 'Central Córdoba (Santiago del Estero)': 'Central Cordoba', 'Deportivo Riestra': 'Dep. Riestra',
    'Argentinos Juniors': 'Argentinos Jrs', 'Atlético Tucumán': 'Atl. Tucuman', 'Gimnasia La Plata': 'Gimnasia L.P.', 'Estudiantes de La Plata': 'Estudiantes L.P.',
  },
  BRA: { 'Vasco da Gama': 'Vasco', 'Red Bull Bragantino': 'Bragantino' },
  MEX: { 'Atlético de San Luis': 'Atl. San Luis' },
  USA: { 'D.C. United': 'DC United', 'Atlanta United FC': 'Atlanta Utd', LAFC: 'Los Angeles FC', 'Red Bull New York': 'New York Red Bulls', 'LA Galaxy': 'Los Angeles Galaxy' },
  JPN: { 'Tokyo Verdy 1969': 'Verdy', 'Urawa Red Diamonds': 'Urawa Reds', 'JEF United Ichihara-Chiba': 'Chiba' },
  CHN: { Henan: 'Henan Songshan Longmen' },
};
