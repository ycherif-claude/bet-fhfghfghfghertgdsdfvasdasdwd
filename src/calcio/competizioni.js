const c = (chiave, csv, nome, priorita) =>
  ({ chiave, nome, csv, priorita, modello: csv ? 'dixon-coles' : 'solo-pinnacle' });

export const COMPETIZIONI = [
  c('soccer_epl', 'E0', 'Premier League', 1),
  c('soccer_spain_la_liga', 'SP1', 'LaLiga', 1),
  c('soccer_italy_serie_a', 'I1', 'Serie A', 1),
  c('soccer_germany_bundesliga', 'D1', 'Bundesliga', 1),
  c('soccer_france_ligue_one', 'F1', 'Ligue 1', 1),
  c('soccer_uefa_champs_league', null, 'Champions League', 1),
  c('soccer_uefa_europa_league', null, 'Europa League', 1),
  c('soccer_netherlands_eredivisie', 'N1', 'Eredivisie', 2),
  c('soccer_portugal_primeira_liga', 'P1', 'Primeira Liga', 2),
  c('soccer_efl_champ', 'E1', 'Championship', 2),
  c('soccer_uefa_nations_league', null, 'Nations League', 2),
  c('soccer_fifa_world_cup_qualifiers_europe', null, 'Qualificazioni Mondiali', 2),
  c('soccer_italy_serie_b', 'I2', 'Serie B', 3),
  c('soccer_spain_segunda_division', 'SP2', 'Segunda División', 3),
  c('soccer_germany_bundesliga2', 'D2', '2. Bundesliga', 3),
  c('soccer_france_ligue_two', 'F2', 'Ligue 2', 3),
];
