// Campionati di pallavolo in ordine di priorità (documento di progetto §4), con gli id di OddsPapi
// (palinsesto e quote) e di TheSportsDB (storico ed esiti). Verificati col collaudo del 21 ottobre 2026.
// Un campionato senza storico gratuito della stagione in corso resta fuori: gli esiti non si chiuderebbero.
export const CAMPIONATI_PALLAVOLO = Object.freeze([
  { id: 'superlega', competizione: 'SuperLega', oddspapi: 517, thesportsdb: 4544 },
  { id: 'champions-maschile', competizione: 'Champions League maschile', oddspapi: 586, thesportsdb: null },
  { id: 'champions-femminile', competizione: 'Champions League femminile', oddspapi: 587, thesportsdb: null },
  { id: 'a1-femminile', competizione: 'Serie A1 femminile', oddspapi: 567, thesportsdb: 4584 },
  { id: 'plusliga', competizione: 'PlusLiga', oddspapi: 831, thesportsdb: 5619 },
  { id: 'turchia', competizione: 'Efeler Ligi', oddspapi: 967, thesportsdb: 4543 },
  { id: 'bundesliga', competizione: 'Bundesliga', oddspapi: 501, thesportsdb: 5618 },
].map((c) => Object.freeze(c)));

// Parole in più per riconoscere una squadra di TheSportsDB (per id) dai nomi di OddsPapi:
// città o sponsor che TheSportsDB non scrive, e parole per separare due squadre della stessa città.
export const ALIAS_PALLAVOLO = Object.freeze({
  // SuperLega
  136632: ['civitanova', 'lube', 'cucine'],
  136633: ['piacenza', 'gas', 'sales'],
  136630: ['trento', 'itas'],
  136629: ['sir', 'susa'],
  136636: ['powervolley', 'allianz'],
  137435: ['latina'],
  137441: ['rana'],
  156395: ['pordenone'],
  // Bundesliga
  151995: ['recycling', 'rv', 'brv'],
  156370: ['olympia'],
  152032: ['konigs', 'wusterhausen'],
  152030: ['ssc', 'baden'],
  // PlusLiga e Efeler Ligi: per ora bastano i nomi di TheSportsDB.
});
