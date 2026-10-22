// Doppie e triple di pronostici [utente, 22/10/2026, idea 4]. Ogni mattina, dai pronostici migliori di partite
// diverse (mai due della stessa partita, mai due partite della stessa squadra), fino a CONFIG.pronostici.schedine.max
// schedine da 2 o 3 pronostici con quota totale fra 1,50 e 2,00. Quota della gamba: la quota se c'è, altrimenti la
// quota minima (`quotaDaVerificare: true`). Con le quote di odss-api (idea 1) la quota è la migliore dei bookmaker
// dell'utente e la gamba dice su quale (`bookmaker`). Ordine: probabilità combinata prudente (prodotto dei limiti di Wilson)
// decrescente; a parità la quota più alta. Nessuna gamba in comune fra le schedine.
// In modalità prova: `prova: true`, "PROVA – non giocare". Dopo la prova: solo gambe ✅ (giocabili), altrimenti
// nessuna schedina. Non sono giocate: non entrano mai nel bankroll.
// Esito: vinta se tutte le gambe sono vinte; una gamba rimborsata si toglie e la quota si ricalcola senza.
import { CONFIG } from '../config.js';
import { normalizzaNome } from '../calcio/testo.js';
import { probPrudente } from './pronostici.js';

const S = CONFIG.pronostici.schedine;
export const ETICHETTA_PROVA = 'PROVA – non giocare';
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const cent = (x) => Math.round(x * 100) / 100;
const arrotonda = (x) => Math.round(x * 10000) / 10000;

// Hash breve e stabile (per l'id della schedina).
function hash(testo) {
  let h = 5381;
  for (const c of String(testo)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

const squadre = (partita) => String(partita ?? '').split(' - ').map((x) => normalizzaNome(x)).filter(Boolean);

// Gambe possibili: il pronostico migliore di ogni partita (dopo la prova solo se giocabile ✅).
function gambe(pronosticiGiornata, { soloGiocabili, escluse }) {
  const out = [];
  for (const p of Array.isArray(pronosticiGiornata) ? pronosticiGiornata : []) {
    if (!p || escluse.has(p.idPartita) || !Array.isArray(p.pronostici)) continue;
    const x = p.pronostici.find((y) => y && y.migliore === true);
    if (!x || (soloGiocabili && x.giocabile !== true)) continue;
    const conQuota = num(x.quota) && x.quota > 1;
    const quota = conQuota ? x.quota : x.quotaMinima;
    if (!num(quota) || quota <= 1) continue;
    const bookmaker = conQuota && typeof x.bookmakerMigliore === 'string' && x.quotaMigliore === x.quota ? x.bookmakerMigliore : null;
    // Solo la quota di un bookmaker dell'utente è sicura: la media (o una quota senza bookmaker) e la minima sono da verificare.
    out.push({
      idPartita: p.idPartita, sport: p.sport ?? 'calcio', competizione: p.competizione, partita: p.partita, inizio: p.inizio,
      mercato: x.mercato, selezione: x.selezione, testo: x.testo ?? null, quota, ...(bookmaker ? { bookmaker } : {}), ...(conQuota && !bookmaker ? { fonteQuota: 'media' } : {}), quotaDaVerificare: !bookmaker,
      prob: x.prob, limite: num(x.limite) ? x.limite : null, giocabile: x.giocabile === true, esito: null,
      squadre: squadre(p.partita),
    });
  }
  return out;
}

// Combinazioni di `k` elementi (indici crescenti).
function combinazioni(n, k) {
  const out = [];
  const giro = (inizio, scelti) => {
    if (scelti.length === k) { out.push([...scelti]); return; }
    for (let i = inizio; i < n; i++) { scelti.push(i); giro(i + 1, scelti); scelti.pop(); }
  };
  giro(0, []);
  return out;
}

export function costruisciSchedinePronostici(pronosticiGiornata, { data, prova, escluse = new Set(), max = S.max } = {}) {
  if (max <= 0) return [];
  const lista = gambe(pronosticiGiornata, { soloGiocabili: !prova, escluse });
  const candidate = [];
  for (let k = S.gambeMin; k <= S.gambeMax; k++) {
    for (const idx of combinazioni(lista.length, k)) {
      const g = idx.map((i) => lista[i]);
      // Mai due partite della stessa squadra.
      const tutte = g.flatMap((x) => x.squadre);
      if (new Set(tutte).size !== tutte.length) continue;
      const quota = g.reduce((q, x) => q * x.quota, 1);
      if (quota < S.quotaMin - 1e-9 || quota > S.quotaMax + 1e-9) continue;
      candidate.push({ g, quota, prob: g.reduce((p, x) => p * probPrudente(x), 1) });
    }
  }
  candidate.sort((a, b) => b.prob - a.prob || b.quota - a.quota || a.g.length - b.g.length);
  const usate = new Set();
  const out = [];
  for (const c of candidate) {
    if (out.length >= max) break;
    if (c.g.some((x) => usate.has(x.idPartita))) continue;
    c.g.forEach((x) => usate.add(x.idPartita));
    const gambeSchedina = c.g.map(({ squadre: _s, ...x }) => x);
    out.push({
      id: `sp-${data}-${hash(gambeSchedina.map((x) => `${x.idPartita}|${x.mercato}|${x.selezione}`).sort().join(','))}`,
      tipo: c.g.length === 2 ? 'doppia' : 'tripla',
      gambe: gambeSchedina,
      quota: cent(c.quota),
      probCombinata: arrotonda(c.prob),
      quotaDaVerificare: gambeSchedina.some((x) => x.quotaDaVerificare),
      ...(prova ? { prova: true, etichetta: ETICHETTA_PROVA } : {}),
      esito: null,
      quotaFinale: null,
    });
  }
  return out;
}

// Giro rifatto prima delle partite [revisione, 22/10/2026]: le schedine già pubblicate non si sostituiscono in
// silenzio. Resta una schedina con una gamba già iniziata, oppure con tutte le gambe ancora valide: stesso pronostico,
// ancora il migliore della partita (e dopo la prova ancora ✅). Le altre si tolgono con il motivo.
// { tenute, tolte: [{ id, tipo, motivo }] }.
export function rivediSchedine(pubblicate, pronosticiGiornata, { adesso, prova }) {
  const t = adesso.getTime();
  const partite = new Map((Array.isArray(pronosticiGiornata) ? pronosticiGiornata : []).filter((p) => p && p.idPartita).map((p) => [p.idPartita, p]));
  const tenute = [];
  const tolte = [];
  for (const s of Array.isArray(pubblicate) ? pubblicate : []) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.gambe)) continue;
    if (s.gambe.some((g) => Date.parse(g?.inizio) <= t)) { tenute.push(s); continue; }
    const motivi = [];
    for (const g of s.gambe) {
      const p = partite.get(g?.idPartita);
      const x = (Array.isArray(p?.pronostici) ? p.pronostici : []).find((y) => y && y.mercato === g.mercato && y.selezione === g.selezione);
      const nome = `${g?.partita}: ${g?.testo ?? `${g?.mercato} ${g?.selezione}`}`;
      if (!p) motivi.push(`${g?.partita} non ha più pronostici`);
      else if (!x) motivi.push(`${nome} non è più un pronostico`);
      else if (x.migliore !== true) motivi.push(`${nome} non è più il pronostico migliore`);
      else if (!prova && x.giocabile !== true) motivi.push(`${nome} non è più giocabile ✅`);
    }
    if (motivi.length) tolte.push({ id: s.id, tipo: s.tipo, motivo: motivi.join('; ') });
    else tenute.push(s);
  }
  return { tenute, tolte };
}

// Esito dalle gambe: { esito: 'vinta' | 'persa' | 'rimborsata' | null, quotaFinale }.
export function esitoSchedina(s) {
  const g = Array.isArray(s?.gambe) ? s.gambe : [];
  if (g.some((x) => x?.esito === 'persa')) return { esito: 'persa', quotaFinale: 0 };
  if (!g.length || g.some((x) => x?.esito == null)) return { esito: null, quotaFinale: null };
  const rimaste = g.filter((x) => x.esito !== 'rimborsata');
  if (!rimaste.length) return { esito: 'rimborsata', quotaFinale: 1 };
  return { esito: 'vinta', quotaFinale: cent(rimaste.reduce((q, x) => q * x.quota, 1)) };
}

// Riporta sulle gambe gli esiti (mappa idPartita|mercato|selezione → esito) e ricalcola l'esito delle schedine.
// Con `adesso`: una gamba ancora senza risultato S.giorniRimborso giorni dopo l'inizio (partita rinviata o sospesa)
// è rimborsata, come nelle multiple bonus; un risultato vero che arriva dopo lo sostituisce. Vero se qualcosa è cambiato.
export function aggiornaEsitiSchedine(schedine, esiti, adesso = null) {
  let cambiato = false;
  for (const s of Array.isArray(schedine) ? schedine : []) {
    if (!s || !Array.isArray(s.gambe)) continue;
    for (const x of s.gambe) {
      const e = esiti.get(`${x.idPartita}|${x.mercato}|${x.selezione}`) ?? null;
      if (e && x.esito !== e) { x.esito = e; delete x.motivoEsito; cambiato = true; }
      if (!e && x.esito == null && adesso && adesso.getTime() - Date.parse(x.inizio) >= S.giorniRimborso * 86400000) {
        x.esito = 'rimborsata';
        x.motivoEsito = `nessun risultato dopo ${S.giorniRimborso} giorni (partita rinviata o sospesa)`;
        cambiato = true;
      }
    }
    const r = esitoSchedina(s);
    if (r.esito !== (s.esito ?? null) || r.quotaFinale !== (s.quotaFinale ?? null)) { s.esito = r.esito; s.quotaFinale = r.quotaFinale; cambiato = true; }
  }
  return cambiato;
}
