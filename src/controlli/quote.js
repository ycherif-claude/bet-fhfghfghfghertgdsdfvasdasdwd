// Quote dell'ultimo momento per le giocate da controllare: una richiesta per competizione (non per
// giocata), con le stesse fonti della raccolta del mattino e sempre sopra le soglie di crediti di
// CONFIG.controlli. Per ogni voce: { quota, n, prob } (mediana e riferimento di mercato),
// { assente: true } (partita sparita dal palinsesto) o { saltata: motivo }.
import { CONFIG } from '../config.js';
import { COMPETIZIONI } from '../calcio/competizioni.js';
import { quotaMedianaNba } from '../nba/quote.js';
import { quotaMedianaTennis, probPinnacleTennis } from '../tennis/raccolta.js';
import { CAMPIONATI as CAMPIONATI_BASKET, riferimento } from '../basket/raccolta.js';
import { stessaSquadra } from './espn.js';

const K = CONFIG.controlli;
const ESCLUSI = /betfair|matchbook|smarkets|exchange/;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const ORA_MS = 3600000;

export const squadreDi = (partita) => {
  const i = String(partita).indexOf(' - ');
  return i < 0 ? null : { casa: partita.slice(0, i), trasferta: partita.slice(i + 3) };
};

// Evento della fonte con le stesse squadre (o gli stessi giocatori) e un orario vicino; null se manca o è ambiguo.
// Prima entrambe le squadre; altrimenti basta una, se è l'unica partita così in quell'orario
// (i nomi cambiano fra le fonti). I nomi si confrontano interi o con gli alias dello sport (stessaSquadra).
export function trovaEvento(voce, eventi, { casa = 'casa', trasferta = 'trasferta' } = {}) {
  const sq = squadreDi(voce.partita);
  if (!sq) return null;
  const t = Date.parse(voce.inizio);
  const vicini = eventi.filter((e) => Math.abs(Date.parse(e.inizio) - t) <= K.toleranzaOre * ORA_MS);
  const c = (e) => stessaSquadra(e[casa] ?? '', sq.casa, voce.sport);
  const tr = (e) => stessaSquadra(e[trasferta] ?? '', sq.trasferta, voce.sport);
  const entrambe = vicini.filter((e) => c(e) && tr(e));
  if (entrambe.length) return entrambe.length === 1 ? entrambe[0] : null;
  const una = vicini.filter((e) => c(e) || tr(e));
  return una.length === 1 ? una[0] : null;
}

function mediana(valori) {
  const v = [...valori].sort((a, b) => a - b);
  const n = v.length;
  const m = n >> 1;
  return n % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Calcio: 1X2 e Under/Over gol (gli altri mercati non hanno quote nella fonte gratuita: null).
export function quotaCalcio(evento, mercato, selezione) {
  let leggi;
  let tutte;
  if (mercato === '1X2') {
    const lato = { 1: 'casa', X: 'pareggio', 2: 'trasferta' }[selezione];
    if (!lato) return null;
    leggi = (b) => b.mercati?.h2h?.[lato];
    tutte = (b) => (b.mercati?.h2h ? ['casa', 'pareggio', 'trasferta'].map((k) => b.mercati.h2h[k]) : null);
  } else {
    const m = /^Under\/Over (\d+\.5)$/.exec(mercato);
    const s = /^(Over|Under) (\d+\.5)$/.exec(selezione);
    if (!m || !s || s[2] !== m[1]) return null;
    const lato = s[1].toLowerCase();
    leggi = (b) => b.mercati?.totals?.[m[1]]?.[lato];
    tutte = (b) => {
      const r = b.mercati?.totals?.[m[1]];
      return r ? [r.over, r.under] : null;
    };
  }
  const libri = (evento.bookmaker ?? []).filter((b) => !ESCLUSI.test(b.chiave));
  const quote = libri.map(leggi).filter((q) => num(q) && q > 1);
  if (quote.length < CONFIG.calcio.minBookmaker) return { saltata: 'meno di 3 bookmaker con la quota' };
  const pin = libri.find((b) => b.chiave === 'pinnacle');
  const coppia = pin ? tutte(pin) : null;
  let prob = null;
  if (coppia && coppia.every((q) => num(q) && q > 1)) {
    const somma = coppia.reduce((a, q) => a + 1 / q, 0);
    prob = 1 / leggi(pin) / somma;
  }
  return { quota: Math.floor(mediana(quote) * 100 + 1e-9) / 100, n: quote.length, prob };
}

// NBA, basket e pallavolo (stesso formato dei bookmaker): vincente, handicap e totale per linea.
export function quotaFormatoNba(evento, voce) {
  const sq = squadreDi(voce.partita);
  let tipo; let sel; let linea = null; let m;
  if (voce.mercato === 'Vincente') {
    tipo = 'vincente';
    // Il lato deve essere uno solo: se la selezione somiglia a entrambe le squadre (o a nessuna), niente quota.
    const c = stessaSquadra(voce.selezione, sq?.casa ?? '', voce.sport);
    const t = stessaSquadra(voce.selezione, sq?.trasferta ?? '', voce.sport);
    sel = c && !t ? 'casa' : t && !c ? 'trasferta' : null;
  } else if ((m = /^Handicap (?:set )?([+-]?\d+(?:\.\d+)?)$/.exec(voce.mercato))) {
    tipo = 'handicap'; sel = voce.selezione; linea = Number(m[1]);
  } else if ((m = /^Totale (?:punti|set) (\d+(?:\.\d+)?)$/.exec(voce.mercato))) {
    tipo = 'totale'; sel = String(voce.selezione).startsWith('Over') ? 'over' : 'under'; linea = Number(m[1]);
  }
  if (!tipo || (sel !== 'casa' && sel !== 'trasferta' && sel !== 'over' && sel !== 'under')) return null;
  const pulito = { ...evento, bookmaker: (evento.bookmaker ?? []).filter((b) => !ESCLUSI.test(b.chiave)) };
  const q = quotaMedianaNba(pulito, tipo, sel, linea, 3);
  if (!q) return { saltata: 'meno di 3 bookmaker con la stessa linea' };
  return { quota: q.quota, n: q.n, prob: riferimento(evento, tipo, linea)?.prob?.[sel] ?? null };
}

export function quotaTennis(evento, selezione) {
  const q = quotaMedianaTennis(evento, selezione);
  if (!q) return { saltata: 'meno di 3 bookmaker con la quota' };
  const sq = squadreDi(`${evento.giocatore1} - ${evento.giocatore2}`);
  return { quota: q.quota, n: q.n, prob: probPinnacleTennis(evento, sq.casa, sq.trasferta)?.[selezione] ?? null };
}

const gruppo = (voci, chiave) => {
  const out = new Map();
  for (const v of voci) {
    const k = chiave(v);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(v);
  }
  return out;
};

// `voci`: [{ id, sport, competizione, partita, inizio, mercato, selezione }]. Restituisce Map(id → risultato).
// `registra(sport, competizione, eventi)` (facoltativo) riceve gli eventi con le quote scaricate:
// servono al registro della taratura come quote di chiusura, senza richieste in più.
export async function quoteFresche(voci, { fonti, chiavi, finestra, errore, registra = () => {} }) {
  const out = new Map();
  const salta = (lista, motivo) => { for (const v of lista) out.set(v.id, { saltata: motivo }); };
  const opzOdds = { chiave: chiavi.oddsApi };

  for (const [k, lista] of gruppo(voci, (v) => `${v.sport}|${v.competizione}`)) {
    const sport = k.split('|')[0];
    const comp = lista[0].competizione;
    try {
      if (sport === 'calcio' || sport === 'basket') {
        if (!chiavi.oddsApi) { salta(lista, 'manca ODDS_API_KEY'); continue; }
        const chiave = sport === 'calcio' ? COMPETIZIONI.find((c) => c.nome === comp)?.chiave : CAMPIONATI_BASKET.find((c) => c.competizione === comp)?.chiave;
        if (!chiave) { salta(lista, 'competizione sconosciuta alle quote'); continue; }
        // Elenco gratuito: dice se la partita c'è ancora e quanti crediti restano.
        const fonte = sport === 'calcio' ? fonti.oddsApi : fonti.oddsBasket;
        const ev = await fonte.eventi(chiave, finestra, opzOdds);
        const costo = sport === 'calcio' ? 2 : 3;
        const conQuote = lista.filter((v) => (sport === 'calcio' ? quotaCalcio({ bookmaker: [] }, v.mercato, v.selezione) !== null : true));
        for (const v of lista) if (!trovaEvento(v, ev.eventi ?? [])) out.set(v.id, { assente: true });
        const daChiedere = conQuote.filter((v) => !out.has(v.id));
        for (const v of lista) if (!out.has(v.id) && !daChiedere.includes(v)) out.set(v.id, { saltata: 'mercato senza quote nella fonte gratuita' });
        if (!daChiedere.length) continue;
        if (!num(ev.rimasti) || ev.rimasti - costo < K.minCreditiOdds) { salta(daChiedere, 'crediti delle quote finiti'); continue; }
        const q = await fonte.quote(chiave, finestra, opzOdds);
        registra(sport, comp, q.eventi ?? []);
        for (const v of daChiedere) {
          const e = trovaEvento(v, q.eventi ?? []);
          out.set(v.id, !e ? { saltata: 'partita senza quote' } : sport === 'calcio' ? quotaCalcio(e, v.mercato, v.selezione) : quotaFormatoNba(e, v));
        }
      } else if (sport === 'tennis') {
        if (!chiavi.oddsApi) { salta(lista, 'manca ODDS_API_KEY'); continue; }
        const torneo = (await fonti.oddsTennis.torneiAttivi(opzOdds)).find((t) => t.titolo === comp);
        if (!torneo) { for (const v of lista) out.set(v.id, { assente: true }); continue; }
        const ev = await fonti.oddsTennis.eventi(torneo.chiave, finestra, opzOdds);
        const evento = (v, eventi) => trovaEvento(v, eventi, { casa: 'giocatore1', trasferta: 'giocatore2' })
          ?? trovaEvento({ ...v, partita: (({ casa, trasferta }) => `${trasferta} - ${casa}`)(squadreDi(v.partita)) }, eventi, { casa: 'giocatore1', trasferta: 'giocatore2' });
        for (const v of lista) if (!evento(v, ev.eventi ?? [])) out.set(v.id, { assente: true });
        const daChiedere = lista.filter((v) => !out.has(v.id));
        if (!daChiedere.length) continue;
        if (!num(ev.rimasti) || ev.rimasti - 1 < K.minCreditiOdds) { salta(daChiedere, 'crediti delle quote finiti'); continue; }
        const q = await fonti.oddsTennis.quote(torneo.chiave, finestra, opzOdds);
        registra(sport, comp, (q.eventi ?? []).map((e) => ({ ...e, casa: e.giocatore1, trasferta: e.giocatore2 })));
        for (const v of daChiedere) {
          const e = evento(v, q.eventi ?? []);
          out.set(v.id, e ? quotaTennis(e, v.selezione) : { saltata: 'partita senza quote' });
        }
      } else if (sport === 'nba') {
        if (!chiavi.sportsgameodds) { salta(lista, 'manca SPORTSGAMEODDS_API_KEY'); continue; }
        const eventi = await fonti.sportsgameodds.eventi(finestra, { chiave: chiavi.sportsgameodds });
        registra(sport, comp, eventi);
        for (const v of lista) {
          const e = trovaEvento(v, eventi);
          out.set(v.id, e ? quotaFormatoNba(e, v) : { assente: true });
        }
      } else if (sport === 'pallavolo') {
        if (!chiavi.oddspapi) { salta(lista, 'manca ODDSPAPI_API_KEY'); continue; }
        const conto = await fonti.oddspapi.conto({ chiave: chiavi.oddspapi });
        const libere = conto ? conto.limite - conto.usate - K.minRichiesteOddsPapi : 0;
        const partite = gruppo(lista, (v) => v.partita);
        if (libere < 1 + partite.size) { salta(lista, 'richieste OddsPapi finite'); continue; }
        const elenco = await fonti.oddspapi.partite(finestra, { chiave: chiavi.oddspapi });
        for (const [, stesse] of partite) {
          const f = trovaEvento(stesse[0], elenco);
          if (!f) { for (const v of stesse) out.set(v.id, { assente: true }); continue; }
          const bookmaker = await fonti.oddspapi.quote(f.id, { chiave: chiavi.oddspapi });
          registra(sport, comp, [{ ...f, bookmaker }]);
          for (const v of stesse) out.set(v.id, quotaFormatoNba({ bookmaker }, v));
        }
      } else {
        salta(lista, `sport ${sport} senza controllo delle quote`);
      }
    } catch (e) {
      errore(`Quote ${comp}`, e);
      for (const v of lista) if (!out.has(v.id)) out.set(v.id, { saltata: 'fonte delle quote non raggiungibile' });
    }
  }
  return out;
}
