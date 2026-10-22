// Eventi di odss-api per tutti gli sport: dalle righe grezze alla partita intera con i bookmaker, l'abbinamento
// rigoroso alle partite delle nostre raccolte e i formati dei bookmaker che usano i vari sport.
// - Solo la riga della partita intera (scope "match", period "full_time"): scegliPartitaIntera del calcio.
// - Esiti sospesi fuori (l'API li toglie già da `outcomes`; un esito in `suspended` si toglie comunque),
//   bookmaker tutto sospeso fuori, bookmaker con un orario d'inizio diverso (start_time) di più di
//   CONFIG.odss.toleranzaInizioOre fuori (può essere un'altra partita), quote dei bookmaker dell'utente
//   aggiornate da più di CONFIG.odss.oreMaxQuota ore fuori.
// - Mercati per linea: 'moneyline', '1x2', 'dc', 'ou|215.5', 'ah|-4.5' (ah: linea ed esiti HOME/AWAY della casa).
import { CONFIG } from '../config.js';
import { scegliPartitaIntera } from '../calcio/odss.js';

const O = CONFIG.odss;
const ORA_MS = 3600000;
const EXCHANGE = /betfair|matchbook|smarkets|betdaq|exchange/i;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const vuoto = (v) => v === undefined || v === null || v === '';
const quotaValida = (q) => num(q) && q > 1;

const chiaveMercato = (r) => (vuoto(r.line) ? r.market : `${r.market}|${Number(r.line)}`);

// Bookmaker di una riga: { chiave, exchange, aggiornato, outcomes } o null se fuori.
function libroDi(b, inizio, adesso) {
  if (!oggetto(b) || typeof b.key !== 'string' || b.suspended === true) return null;
  if (Object.hasOwn(b, 'start_time')) {
    const t = Date.parse(b.start_time);
    if (!Number.isFinite(t) || Math.abs(t - inizio) > O.toleranzaInizioOre * ORA_MS) return null;
  }
  const chiave = b.key.toLowerCase();
  // Pinnacle fermo da più di CONFIG.odss.oreMaxPinnacle ore: fuori, la probabilità viene dal consenso.
  if (adesso && chiave === 'pinnacle') {
    const t = Date.parse(b.last_update);
    if (Number.isFinite(t) && adesso.getTime() - t > O.oreMaxPinnacle * ORA_MS) return null;
  }
  if (adesso && O.miei.includes(chiave)) {
    const t = Date.parse(b.last_update);
    if (!Number.isFinite(t) || adesso.getTime() - t > O.oreMaxQuota * ORA_MS) return null;
  }
  const fuori = new Set(Array.isArray(b.suspended) ? b.suspended.map(String) : []);
  const outcomes = Object.fromEntries(Object.entries(oggetto(b.outcomes) ? b.outcomes : {})
    .filter(([e, q]) => !fuori.has(e) && quotaValida(q)));
  if (!Object.keys(outcomes).length) return null;
  return { chiave, exchange: b.is_exchange === true || EXCHANGE.test(chiave), aggiornato: b.last_update ?? null, outcomes };
}

// Righe grezze → [{ id, campionato, casa, trasferta, inizio, libri: [{ chiave, exchange, aggiornato, mercati }] }].
// `diagnostica` (non enumerabile): { righe, righeUsate, doppie, senzaIntero, periodiVisti }.
export function eventiDaRighe(righe, { adesso = null } = {}) {
  const scelta = scegliPartitaIntera(righe);
  const eventi = new Map();
  for (const r of scelta.righe) {
    const inizio = Date.parse(r.commence_time);
    if (!r.home_team || !r.away_team || !Number.isFinite(inizio) || typeof r.market !== 'string') continue;
    const id = String(r.event_id ?? `${r.home_team}|${r.away_team}|${r.commence_time}`);
    if (!eventi.has(id)) {
      eventi.set(id, { id, sport: r.sport ?? null, campionato: r.league ?? null, casa: r.home_team, trasferta: r.away_team, inizio: r.commence_time, libri: new Map() });
    }
    const e = eventi.get(id);
    for (const b of Array.isArray(r.bookmakers) ? r.bookmakers : []) {
      const l = libroDi(b, inizio, adesso);
      if (!l) continue;
      if (!e.libri.has(l.chiave)) e.libri.set(l.chiave, { chiave: l.chiave, exchange: l.exchange, aggiornato: l.aggiornato, mercati: {} });
      e.libri.get(l.chiave).mercati[chiaveMercato(r)] = l.outcomes;
    }
  }
  const out = [...eventi.values()].map((e) => ({ ...e, libri: [...e.libri.values()] })).filter((e) => e.libri.length)
    .sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio) || a.id.localeCompare(b.id));
  Object.defineProperty(out, 'diagnostica', {
    value: { righe: Array.isArray(righe) ? righe.length : 0, righeUsate: scelta.righe.length, doppie: scelta.doppie, senzaIntero: scelta.senzaIntero.length, periodiVisti: scelta.periodiVisti },
    enumerable: false,
  });
  return out;
}

// Più eventi odss della stessa partita (fonti diverse unite male dal feed): bookmaker uniti. Lo stesso bookmaker
// con quote diverse per lo stesso mercato in due eventi: quel mercato si scarta (non si sceglie a caso).
export function unisciEventi(eventi) {
  if (eventi.length === 1) return eventi[0];
  const libri = new Map();
  const conflitti = new Map();
  for (const e of eventi) {
    for (const l of e.libri) {
      if (!libri.has(l.chiave)) { libri.set(l.chiave, { ...l, mercati: { ...l.mercati } }); conflitti.set(l.chiave, new Set()); continue; }
      const u = libri.get(l.chiave);
      for (const [k, o] of Object.entries(l.mercati)) {
        if (!u.mercati[k]) u.mercati[k] = o;
        else if (JSON.stringify(u.mercati[k]) !== JSON.stringify(o)) conflitti.get(l.chiave).add(k);
      }
    }
  }
  for (const [chiave, ks] of conflitti) for (const k of ks) delete libri.get(chiave).mercati[k];
  const [primo] = eventi;
  return { ...primo, id: eventi.map((e) => e.id).join(','), libri: [...libri.values()].filter((l) => Object.keys(l.mercati).length) };
}

// Map(id nostro → { evento, invertito }). `nostri`: [{ id, casa, trasferta, inizio }].
// Stessa partita: inizio entro `tolleranzaOre` e `stesso(nomeOdss, nomeNostro)` per casa e trasferta. Gli eventi così
// sono la stessa partita e si uniscono. Se nessuno: squadre invertite (solo con `invertibile`, per il tennis), poi
// `simile` (un evento solo). Lo stesso evento per più partite nostre → nessun abbinamento. Mai indovinare.
export function abbinaEventi(nostri, eventi, { stesso, simile = null, tolleranzaOre = O.toleranzaOre, invertibile = false }) {
  const lista = (Array.isArray(eventi) ? eventi : []).filter((e) => oggetto(e) && e.casa && e.trasferta && Number.isFinite(Date.parse(e.inizio)));
  const scelti = new Map();
  for (const n of Array.isArray(nostri) ? nostri : []) {
    const t = Date.parse(n.inizio);
    if (!n?.casa || !n?.trasferta || !Number.isFinite(t)) continue;
    const vicini = lista.filter((e) => Math.abs(Date.parse(e.inizio) - t) <= tolleranzaOre * ORA_MS);
    const dritti = vicini.filter((e) => stesso(e.casa, n.casa) && stesso(e.trasferta, n.trasferta));
    const rovesci = invertibile ? vicini.filter((e) => stesso(e.casa, n.trasferta) && stesso(e.trasferta, n.casa)) : [];
    if (dritti.length && rovesci.length) continue;
    if (dritti.length) { scelti.set(n.id, { eventi: dritti, invertito: false }); continue; }
    if (rovesci.length) { scelti.set(n.id, { eventi: rovesci, invertito: true }); continue; }
    if (!simile) continue;
    const s = vicini.filter((e) => simile(e.casa, n.casa) && simile(e.trasferta, n.trasferta));
    if (s.length === 1) scelti.set(n.id, { eventi: s, invertito: false });
  }
  const usi = new Map();
  for (const x of scelti.values()) for (const e of x.eventi) usi.set(e, (usi.get(e) ?? 0) + 1);
  const out = new Map();
  for (const [id, x] of scelti) {
    if (x.eventi.some((e) => usi.get(e) > 1)) continue;
    out.set(id, { evento: unisciEventi(x.eventi), invertito: x.invertito });
  }
  return out;
}

// Partita femminile (campionato o squadre): "Euroleague Women", "WNBL", "A1, Femminile", "Serie A1 (F)", "Bundesliga, Donne"…
const FEMMINILE = /\b(w|wnbl|wnba|women|woman|ladies|femminile|feminino|femenino|feminin|feminine|donne|damer|kvinder|kobiety|frauen|dames)\b|\((f|w|k|d)\)/i;
export const femminile = (evento) => [evento?.campionato, evento?.casa, evento?.trasferta].some((x) => FEMMINILE.test(String(x ?? '')));

// Nome del campionato fra quelli ammessi (confronto esatto senza maiuscole e spazi doppi): il filtro league di odss
// è una sottostringa e porta anche femminili e altri paesi ("NBL" → "WNBL", "New Zealand - NBL Women"…).
const pulisciLega = (x) => String(x ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
export const legaAmmessa = (nome, elenco) => (elenco ?? []).some((x) => pulisciLega(x) === pulisciLega(nome));

// Tennis: solo singolari del circuito maggiore. Doppi ("Doubles", "Doppio", "/" fra i nomi) e tornei ITF, M25, W15,
// UTR fuori (i nostri tornei vengono da The Odds API: ATP e WTA). Campionato assente (null nel feed vero): ammesso,
// l'abbinamento si fa con i giocatori e l'orario del torneo della nostra raccolta.
const DOPPIO = /doubles?|doppio|dobles|doppel/i;
const MINORI = /\b(itf|utr|[mw]\d{2,3})\b/i;
export const tennisSingolare = (e) => !DOPPIO.test(String(e?.campionato ?? '')) && !MINORI.test(String(e?.campionato ?? ''))
  && ![e?.casa, e?.trasferta].some((n) => String(n ?? '').includes('/') || DOPPIO.test(String(n ?? '')));

const senzaExchange = (evento) => (evento?.libri ?? []).filter((l) => !l.exchange);
const lineaDi = (k, mercato) => (k.startsWith(`${mercato}|`) ? Number(k.slice(mercato.length + 1)) : null);
const lineaValida = (x) => Number.isFinite(x) && Number.isInteger(x * 2);
// Prezzo credibile di una linea alternativa: sul feed vero ci sono linee con un lato solo o a 33 (NBA, Snai).
const prezzoLinea = (q) => num(q) && q >= 1.01 && q <= 20;
const mezzo = (v) => { const x = [...v].sort((a, b) => a - b); const m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };

// Linea principale fra quelle dei bookmaker [revisione, 23/10/2026]: prima le linee .5 (senza rimborso), se ce ne sono;
// fra queste quelle offerte dal maggior numero di bookmaker; a pari, i due prezzi più vicini (mediana di |p1 − p2|),
// poi la linea più piccola.
function lineaPrincipale(perLibro, lati) {
  const linee = new Map();
  for (const coppie of perLibro) {
    for (const [l, c] of Object.entries(coppie ?? {})) {
      if (!linee.has(l)) linee.set(l, []);
      linee.get(l).push(Math.abs(c[lati[0]] - c[lati[1]]));
    }
  }
  if (!linee.size) return null;
  const mezze = [...linee].filter(([l]) => Number.isInteger(Number(l) - 0.5));
  const candidate = mezze.length ? mezze : [...linee];
  const massimo = Math.max(...candidate.map(([, d]) => d.length));
  return candidate.filter(([, d]) => d.length === massimo)
    .sort((a, b) => mezzo(a[1]) - mezzo(b[1]) || Math.abs(Number(a[0])) - Math.abs(Number(b[0])))[0][0];
}

// Formato dei bookmaker di NBA, basket e pallavolo: [{ chiave, aggiornato, mercati: { vincente: { casa, trasferta },
// handicap: { 'linea della casa': { casa, trasferta } }, totale: { linea: { over, under } } } }].
// - Basket: moneyline, ah e ou "full_time" non hanno pareggio e il feed ha a parte il 1x2 dei tempi regolamentari
//   (other:1x2_tempi_reg): la partita intera comprende i supplementari, come le nostre spiegazioni.
// - ah: linea ed esiti dal lato della casa (collaudo: Zalgiris -9.5 in casa, favorito, HOME 1.88 / AWAY 1.82).
// - Linee alternative: per ogni linea servono entrambi i prezzi fra 1,01 e 20; di handicap e totale resta solo la
//   linea principale (prezzi più vicini), la stessa per tutti i bookmaker.
// - Verso dell'handicap: vincente con la casa favorita (≥ 60%) e linea principale positiva, o sfavorita (≤ 40%) con
//   linea negativa → handicap scartato (`handicapScartato: true`).
// - `totali(linea)`: linee del totale ammesse (pallavolo: solo 3.5, i set). `handicap: false`: niente ah (pallavolo:
//   l'ah è in punti). `handicapSet`: handicap set da "other:set_handicap" (pallavolo), solo con esiti HOME/AWAY e
//   linea ±1.5, tutte e due le linee.
// - `linee: { handicap, totale }`: linee imposte (controlli: la linea della giocata, non la principale del momento).
export function inFormatoNba(evento, { invertito = false, totali = () => true, handicap = true, handicapSet = false, linee = {} } = {}) {
  const libri = [];
  for (const l of senzaExchange(evento)) {
    const m = {};
    const ml = l.mercati.moneyline;
    if (quotaValida(ml?.HOME) && quotaValida(ml?.AWAY)) m.vincente = invertito ? { casa: ml.AWAY, trasferta: ml.HOME } : { casa: ml.HOME, trasferta: ml.AWAY };
    const coppie = { handicap: {}, totale: {}, set: {} };
    for (const [k, o] of Object.entries(l.mercati)) {
      const ah = lineaDi(k, 'ah');
      if (handicap && lineaValida(ah) && prezzoLinea(o.HOME) && prezzoLinea(o.AWAY)) {
        const [linea, casa, trasferta] = invertito ? [-ah, o.AWAY, o.HOME] : [ah, o.HOME, o.AWAY];
        coppie.handicap[String(linea)] = { casa, trasferta };
      }
      const sh = lineaDi(k, 'other:set_handicap');
      if (handicapSet && Math.abs(sh) === 1.5 && Object.keys(o).sort().join(',') === 'AWAY,HOME' && prezzoLinea(o.HOME) && prezzoLinea(o.AWAY)) {
        const [linea, casa, trasferta] = invertito ? [-sh, o.AWAY, o.HOME] : [sh, o.HOME, o.AWAY];
        coppie.set[String(linea)] = { casa, trasferta };
      }
      const ou = lineaDi(k, 'ou');
      if (lineaValida(ou) && totali(ou) && prezzoLinea(o.OVER) && prezzoLinea(o.UNDER)) coppie.totale[String(ou)] = { over: o.OVER, under: o.UNDER };
    }
    libri.push({ l, m, coppie });
  }
  const hPrincipale = Number.isFinite(linee.handicap) ? String(linee.handicap) : lineaPrincipale(libri.map((x) => x.coppie.handicap), ['casa', 'trasferta']);
  const tPrincipale = Number.isFinite(linee.totale) ? String(linee.totale) : lineaPrincipale(libri.map((x) => x.coppie.totale), ['over', 'under']);
  let handicapScartato = false;
  if (hPrincipale !== null) {
    const linea = Number(hPrincipale);
    const prob = libri.filter((x) => x.m.vincente).map(({ m }) => (1 / m.vincente.casa) / (1 / m.vincente.casa + 1 / m.vincente.trasferta));
    const pCasa = prob.length ? prob.reduce((a, p) => a + p, 0) / prob.length : null;
    handicapScartato = pCasa !== null && ((pCasa >= 0.6 && linea > 0) || (pCasa <= 0.4 && linea < 0));
  }
  const bookmaker = [];
  for (const { l, m, coppie } of libri) {
    if (hPrincipale !== null && !handicapScartato && coppie.handicap[hPrincipale]) m.handicap = { [hPrincipale]: coppie.handicap[hPrincipale] };
    if (Object.keys(coppie.set).length) m.handicap = { ...(m.handicap ?? {}), ...coppie.set };
    if (tPrincipale !== null && coppie.totale[tPrincipale]) m.totale = { [tPrincipale]: coppie.totale[tPrincipale] };
    if (Object.keys(m).length) bookmaker.push({ chiave: l.chiave, aggiornato: l.aggiornato, mercati: m });
  }
  return { bookmaker, handicapScartato };
}

// Formato del tennis: [{ chiave, aggiornato, quote: { [g1]: quota, [g2]: quota } }], g1 e g2 i nostri nomi
// (g1 = casa dell'evento odss, se non invertito).
export function inFormatoTennis(evento, g1, g2, { invertito = false } = {}) {
  const out = [];
  for (const l of senzaExchange(evento)) {
    const ml = l.mercati.moneyline;
    if (!quotaValida(ml?.HOME) || !quotaValida(ml?.AWAY)) continue;
    out.push({ chiave: l.chiave, aggiornato: l.aggiornato, quote: invertito ? { [g1]: ml.AWAY, [g2]: ml.HOME } : { [g1]: ml.HOME, [g2]: ml.AWAY } });
  }
  return out;
}

// Formato del calcio di The Odds API: { bookmaker: [{ chiave, aggiornato, mercati: { h2h: { casa, pareggio, trasferta },
// totals: { '2.5': { over, under } } } }] } (solo linee .5).
export function inFormatoCalcio(evento) {
  const bookmaker = [];
  for (const l of senzaExchange(evento)) {
    const m = {};
    const x = l.mercati['1x2'];
    if (x) {
      const h = Object.fromEntries([['casa', x.HOME], ['pareggio', x.DRAW], ['trasferta', x.AWAY]].filter(([, q]) => quotaValida(q)));
      if (Object.keys(h).length) m.h2h = h;
    }
    for (const [k, o] of Object.entries(l.mercati)) {
      const ou = lineaDi(k, 'ou');
      if (!Number.isFinite(ou) || !Number.isInteger(ou - 0.5)) continue;
      const t = Object.fromEntries([['over', o.OVER], ['under', o.UNDER]].filter(([, q]) => quotaValida(q)));
      if (Object.keys(t).length) (m.totals ??= {})[String(ou)] = t;
    }
    if (Object.keys(m).length) bookmaker.push({ chiave: l.chiave, aggiornato: l.aggiornato, mercati: m });
  }
  return { id: evento?.id, casa: evento?.casa, trasferta: evento?.trasferta, inizio: evento?.inizio, bookmaker };
}
