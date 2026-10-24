// ESPN (API pubblica non ufficiale, senza chiave): partite del giorno, formazioni titolari del calcio
// e infortuni NBA. Verificata il 21/10/2026. Se non risponde, il controllo usa solo le quote e lo scrive.
import { scarica } from '../calcio/fonti/http.js';
import { normalizzaNome, slug } from '../calcio/testo.js';
import { ALIAS as ALIAS_CALCIO } from '../calcio/squadre.js';
import { squadraNba } from '../nba/squadre.js';
import { CAMPIONATI_BASKET, codiceSquadra } from '../basket/squadre.js';
import { COMPETIZIONI } from '../calcio/competizioni.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Competizioni del calcio (nomi della raccolta) → campionato ESPN.
export const CAMPIONATI_ESPN = Object.freeze({
  'Premier League': 'soccer/eng.1',
  LaLiga: 'soccer/esp.1',
  'Serie A': 'soccer/ita.1',
  Bundesliga: 'soccer/ger.1',
  'Ligue 1': 'soccer/fra.1',
  'Champions League': 'soccer/uefa.champions',
  'Europa League': 'soccer/uefa.europa',
  Eredivisie: 'soccer/ned.1',
  'Primeira Liga': 'soccer/por.1',
  Championship: 'soccer/eng.2',
  'Nations League': 'soccer/uefa.nations',
  'Qualificazioni Mondiali': 'soccer/fifa.worldq.uefa',
  'Serie B': 'soccer/ita.2',
  'Segunda División': 'soccer/esp.2',
  '2. Bundesliga': 'soccer/ger.2',
  'Ligue 2': 'soccer/fra.2',
  NBA: 'basketball/nba',
  // Campionati senza quote (solo pronostici) che ESPN copre.
  ...Object.fromEntries(COMPETIZIONI.filter((c) => !c.chiave && c.espn).map((c) => [c.nome, c.espn])),
});

function json(testo) {
  try { return JSON.parse(testo); } catch { throw new Error('site.api.espn.com: risposta non valida'); }
}

// Nomi diversi della stessa squadra fra ESPN e The Odds API, oltre a quelli della raccolta del calcio.
const ALIAS_ESPN = { psg: 'Paris Saint Germain' };
const chiaveCalcio = (nome) => {
  const n = normalizzaNome(nome);
  const alias = Object.hasOwn(ALIAS_CALCIO, n) ? ALIAS_CALCIO[n] : Object.hasOwn(ALIAS_ESPN, n) ? ALIAS_ESPN[n] : null;
  return alias ? normalizzaNome(alias) : n;
};

// Vero se i due nomi sono la stessa squadra: stesso nome normalizzato o alias noti dello sport
// (NBA: abbreviazione; basket: codice di Eurolega o NBL; calcio: alias della raccolta). Una parola
// in comune non basta mai ("New York Knicks" e "New Orleans Pelicans", "Maccabi" e "Hapoel Tel Aviv").
export function stessaSquadra(a, b, sport = null) {
  if (!String(a ?? '').trim() || !String(b ?? '').trim()) return false;
  if (sport === 'nba') {
    const x = squadraNba(a);
    const y = squadraNba(b);
    if (x && y) return x.abbr === y.abbr;
  }
  if (sport === 'basket') {
    for (const campionato of CAMPIONATI_BASKET) {
      const x = codiceSquadra(campionato, a);
      const y = codiceSquadra(campionato, b);
      if (x && y) return x === y;
    }
  }
  return chiaveCalcio(a) === chiaveCalcio(b);
}

// Parole di un nome di giocatore, senza accenti e senza Jr./Sr./II/III.
const SUFFISSI = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
const pezzi = (nome) => slug(nome).split('-').filter((p) => p && !SUFFISSI.has(p));
const stesseParole = (x, y) => [...x].sort().join('-') === [...y].sort().join('-');

// `nome` (scritto dal giro del mattino) nell'elenco di quella squadra: true, false o null (non si sa).
// true:
// - stesse parole, in qualunque ordine ("Heung-min Son" e "Son Heung-Min");
// - stesso cognome e nome compatibile: uguale, l'uno prefisso dell'altro ("Nico González" e
//   "Nicolás González", "Matt" e "Matthew") o un'iniziale ("T. Hernandez"); con più nomi compatibili
//   decide il nome intero.
// null (la giocata va in revisione, mai confermata né annullata da sola): cognome in elenco ma nessun nome
// compatibile ("Lautaro" con il solo Lisandro Martínez, "Kike" ed "Enrique García"), oppure più omonimi
// compatibili senza il nome intero ("L. Martínez" con Lautaro e Lisandro).
// false: il cognome non compare in nessuna parola dell'elenco (se c'è solo in una parola non finale, null). Con `infortuni`
// (report NBA, nomi ufficiali interi) anche quando lo hanno solo giocatori con un nome intero incompatibile.
// Se il mattino ha scritto solo il cognome: un giocatore con quel cognome → true, più di uno → null.
export function inElenco(nome, elenco, { infortuni = false } = {}) {
  const p = pezzi(nome);
  if (!p.length) return false;
  const lista = elenco.map(pezzi).filter((x) => x.length);
  if (lista.some((x) => stesseParole(p, x))) return true;
  const cognome = p.at(-1);
  // Stesso cognome = ultima parola del nome in elenco; l'ordine
  // invertito ("Son Heung-Min") lo copre già il confronto delle parole qui sopra.
  const conCognome = lista.filter((x) => x.at(-1) === cognome);
  // Nessuno lo ha come ultima parola: fuori solo se il cognome non compare in nessuna parola dell'elenco;
  // in una parola non finale ("Vinícius Júnior", "Rodrigo Hernández Cascante", "Pedro Neto") non si sa.
  const senzaCognome = () => (lista.some((x) => x.includes(cognome)) ? null : false);
  if (p.length === 1) {
    if (cognome.length < 3) return false;
    return conCognome.length === 1 ? true : conCognome.length > 1 ? null : senzaCognome();
  }
  const compatibile = (t) => t.startsWith(p[0]) || p[0].startsWith(t);
  const conIniziale = lista.filter((x) => x.length >= 2 && x.at(-1) === cognome && compatibile(x[0]));
  if (conIniziale.length === 1) return true;
  if (conIniziale.length > 1) return conIniziale.filter((x) => x[0] === p[0]).length === 1 ? true : null;
  if (conCognome.length === 1 && conCognome[0].some((t) => t !== cognome && compatibile(t))) return true;
  if (!conCognome.length) return senzaCognome();
  // Report infortuni NBA (nomi ufficiali interi): con nomi interi incompatibili da entrambe le parti
  // è un altro giocatore (Moritz e Franz Wagner), quindi il giocatore chiave non è nell'elenco.
  if (infortuni && p[0].length > 1 && conCognome.every((x) => x.length >= 2 && x[0].length > 1)) return false;
  // Formazioni: cognome in elenco ma nessun nome compatibile ("Lautaro" con il solo Lisandro Martínez,
  // "Kike" ed "Enrique García"): non si sa, va in revisione. Fuori solo se nessuno ha quel cognome.
  return null;
}

export const espn = {
  // Partite di un giorno (AAAA-MM-GG): [{ id, casa, trasferta, inizio, stato, gc, gt, gcPT, gtPT }] (stato e punteggi
  // del tabellone: servono agli esiti del mattino senza chiedere il summary).
  async partite(campionato, data, opz = {}) {
    const r = await scarica(`${BASE}/${campionato}/scoreboard?dates=${data.replaceAll('-', '')}`, opz);
    return (json(r.testo).events ?? []).map((e) => {
      const squadre = e.competitions?.[0]?.competitors ?? [];
      const lato = (h) => squadre.find((s) => s.homeAway === h);
      const di = (h) => lato(h)?.team?.displayName ?? null;
      const n = (v) => (v !== undefined && v !== null && /^\d+$/.test(String(v)) ? Number(v) : null);
      return {
        id: String(e.id), casa: di('home'), trasferta: di('away'), inizio: e.date,
        stato: e.competitions?.[0]?.status?.type?.name ?? e.status?.type?.name ?? null,
        gc: n(lato('home')?.score), gt: n(lato('away')?.score),
        gcPT: n(lato('home')?.linescores?.[0]?.displayValue ?? lato('home')?.linescores?.[0]?.value), gtPT: n(lato('away')?.linescores?.[0]?.displayValue ?? lato('away')?.linescores?.[0]?.value),
      };
    });
  },

  // Formazioni del calcio: { casa: { titolari, pronta }, trasferta: … }. `pronta` = 11 titolari annunciati.
  async formazioni(campionato, id, opz = {}) {
    const r = await scarica(`${BASE}/${campionato}/summary?event=${id}`, opz);
    const d = json(r.testo);
    const out = {};
    for (const x of d.rosters ?? []) {
      const lato = x.homeAway === 'away' ? 'trasferta' : 'casa';
      const titolari = (x.roster ?? []).filter((p) => p.starter).map((p) => p.athlete?.displayName).filter(Boolean);
      out[lato] = { titolari, pronta: titolari.length >= 11 };
    }
    return out;
  },

  // Infortuni NBA: { casa: [nomi Out], trasferta: [nomi Out] }. La squadra si riconosce dall'id
  // (homeAway dell'intestazione); senza id, dal nome, solo se corrisponde a un lato soltanto.
  async infortuni(campionato, id, { casa, trasferta } = {}, opz = {}) {
    const r = await scarica(`${BASE}/${campionato}/summary?event=${id}`, opz);
    const d = json(r.testo);
    const out = { casa: [], trasferta: [] };
    const perId = new Map((d.header?.competitions?.[0]?.competitors ?? [])
      .filter((c) => c.team?.id != null && (c.homeAway === 'home' || c.homeAway === 'away'))
      .map((c) => [String(c.team.id), c.homeAway === 'home' ? 'casa' : 'trasferta']));
    const visti = new Set();
    for (const t of d.injuries ?? []) {
      const nome = t.team?.displayName ?? '';
      let lato = t.team?.id != null ? perId.get(String(t.team.id)) ?? null : null;
      if (!lato) {
        const c = stessaSquadra(nome, casa, 'nba');
        const tr = stessaSquadra(nome, trasferta, 'nba');
        lato = c && !tr ? 'casa' : tr && !c ? 'trasferta' : null;
      }
      // Due elenchi per lo stesso lato: qualcosa non torna, non si attribuisce niente.
      if (!lato || visti.has(lato)) continue;
      visti.add(lato);
      out[lato].push(...(t.injuries ?? []).filter((i) => /^out$/i.test(i.status ?? '')).map((i) => i.athlete?.displayName).filter(Boolean));
    }
    return out;
  },
};
