// Dalla raccolta (più le notizie di Claude) ai candidati della giornata (§5.2, §5.4, §5.7, §6.1).
import { CONFIG } from '../config.js';
import { calcolaValue, probValida } from '../regole/value.js';
import { oraRoma } from '../calcio/testo.js';
import { idCandidato } from './id.js';
import { applicaCorrezioni } from './notizie.js';

const EPS = 1e-9;
const C = CONFIG.calcio;
const SINGOLA = CONFIG.quote.singola;

// Percentuale intera (0.465 → "47%"), senza il rumore della virgola mobile.
const pct = (p) => `${Math.round(Number((p * 100).toFixed(6)))}%`;
const virgola = (q) => q.toFixed(2).replace('.', ',');
const numerico = (x) => typeof x === 'number' && Number.isFinite(x);
const ora = (iso) => (iso && Number.isFinite(Date.parse(iso)) ? oraRoma(new Date(iso)) : null);

export { idCandidato };

// Probabilità usata: media pesata modello/Pinnacle, oppure quella disponibile.
export function probUsata(probModello, probPinnacle) {
  const pm = numerico(probModello) ? probModello : null;
  const pp = numerico(probPinnacle) ? probPinnacle : null;
  if (pm !== null && pp !== null) return C.pesoPinnacle * pp + (1 - C.pesoPinnacle) * pm;
  return pm ?? pp;
}

function rigaProb(m, prob) {
  const pm = numerico(m.probModello);
  const pp = numerico(m.probPinnacle);
  if (pm && pp) return `Modello ${pct(m.probModello)}, Pinnacle ${pct(m.probPinnacle)}, probabilità usata ${pct(prob)}`;
  return `${pm ? 'Solo modello' : 'Solo Pinnacle'}, probabilità usata ${pct(prob)}`;
}

function rigaQuota(m) {
  if (m.quota === null) return 'Quota da verificare su bet365';
  const n = /mediana di (\d+) bookmaker/.exec(m.fonteQuota ?? '')?.[1];
  const alle = ora(m.oraQuota);
  const quando = alle ? ` alle ${alle}` : '';
  return n ? `Quota mediana ${virgola(m.quota)} su ${n} bookmaker${quando}` : `Quota ${virgola(m.quota)} (${m.fonteQuota ?? 'fonte non indicata'})${quando}`;
}

function rigaNotizie(m, prob, partita, notizie) {
  if (!notizie) return 'Notizie non controllate: giro di Claude non eseguito';
  const alle = ora(notizie.controllateAlle);
  const c = m.correzioneNotizie;
  if (c) {
    return `Notizie: ${c.motivo} (${c.fonte}, ${alle}) → ${m.selezione}: modello da ${pct(m.probModello - c.delta)} a ${pct(m.probModello)}, finale ${pct(prob)}`;
  }
  if (Array.isArray(notizie.partiteControllate) && !notizie.partiteControllate.includes(partita.idPartita)) {
    return 'Notizie non controllate per questa partita';
  }
  return `Notizie controllate alle ${alle}: nessuna correzione`;
}

function creaCandidato(partita, m, prob, notizie) {
  const senzaQuota = m.quota === null;
  return {
    id: idCandidato(partita.idPartita, m.mercato, m.selezione),
    sport: 'calcio',
    competizione: partita.competizione,
    partita: partita.partita,
    idPartita: partita.idPartita,
    inizio: partita.inizio,
    tipo: 'singola',
    mercato: m.mercato,
    selezione: m.selezione,
    prob,
    quota: senzaQuota ? null : m.quota,
    fonteQuota: senzaQuota ? null : m.fonteQuota ?? null,
    oraQuota: senzaQuota ? null : m.oraQuota ?? null,
    quotaDaVerificare: senzaQuota,
    ragionamento: [
      ...(Array.isArray(partita.ragionamentoBase) ? partita.ragionamentoBase : []),
      rigaProb(m, prob),
      rigaQuota(m),
      rigaNotizie(m, prob, partita, notizie),
    ],
    probModello: numerico(m.probModello) ? m.probModello : null,
    probPinnacle: numerico(m.probPinnacle) ? m.probPinnacle : null,
    correzioneNotizie: m.correzioneNotizie ?? null,
  };
}

// Tutti i mercati con una probabilità utilizzabile, dopo le correzioni: [{ partita, m, prob, ordine, value }].
// Con `adesso`, le partite già iniziate (inizio <= adesso) non contano: `iniziate` le conta.
export function valutaMercati(raccolta, notizie, { adesso = null } = {}) {
  const correzioni = notizie?.correzioni ?? [];
  const voci = [];
  let ordine = 0;
  let iniziate = 0;
  for (const originale of raccolta?.partite ?? []) {
    if (!originale || !Array.isArray(originale.mercati)) continue;
    if (adesso && Date.parse(originale.inizio) <= adesso.getTime()) { iniziate++; continue; }
    const partita = applicaCorrezioni(originale, correzioni.filter((c) => c.idPartita === originale.idPartita));
    for (const m of partita.mercati) {
      const prob = probUsata(m.probModello, m.probPinnacle);
      const o = ordine++;
      if (!probValida(prob)) continue;
      const quota = numerico(m.quota) && m.quota > 1 ? m.quota : null;
      voci.push({ partita, m: { ...m, quota }, prob, ordine: o, value: quota === null ? null : calcolaValue(prob, quota) });
    }
  }
  return { voci, iniziate };
}

// Motivo di pre-scarto: esclusione delle notizie, poi scarto dal mercato (dopo la correzione); altrimenti null.
function motivoPreScarto(v, esclusioni) {
  const id = idCandidato(v.partita.idPartita, v.m.mercato, v.m.selezione);
  const escl = esclusioni.find((x) => x.idPartita === v.partita.idPartita && (!x.idCandidato || x.idCandidato === id));
  if (escl) return `notizia: ${escl.motivo}`;
  const { probModello: pm, probPinnacle: pp } = v.m;
  if (numerico(pm) && numerico(pp) && Math.abs(pm - pp) > C.scartoMaxPinnacle + EPS) return 'stima troppo lontana dal mercato';
  return null;
}

// I posti (maxMercatiPartita per partita, maxSenzaQuotaGiorno al giorno) vanno solo ai mercati
// non pre-scartati; quelli pre-scartati restano fra i candidati, fuori dai posti.
export function costruisciCandidati(raccolta, notizie, { adesso = null } = {}) {
  const { voci, iniziate } = valutaMercati(raccolta, notizie, { adesso });
  const esclusioni = notizie?.esclusioni ?? [];
  for (const v of voci) v.preScarto = motivoPreScarto(v, esclusioni);

  // Con quota: value positivo; per partita i primi maxMercatiPartita fra i non pre-scartati.
  const scelte = [];
  const perPartita = new Map();
  for (const v of voci.filter((x) => x.value !== null && x.value > EPS)) {
    if (v.preScarto) { scelte.push(v); continue; }
    if (!perPartita.has(v.partita.idPartita)) perPartita.set(v.partita.idPartita, []);
    perPartita.get(v.partita.idPartita).push(v);
  }
  for (const lista of perPartita.values()) {
    scelte.push(...lista.sort((a, b) => b.value - a.value || a.ordine - b.ordine).slice(0, C.maxMercatiPartita));
  }

  // Senza quota (§5.4): solo modello, lontano dalla frequenza del campionato, quota giusta 1.60–3.00.
  const senza = voci
    .filter((v) => v.m.quota === null && v.partita.modello !== 'solo-pinnacle'
      && numerico(v.m.probModello) && numerico(v.m.frequenzaCampionato))
    .map((v) => ({ ...v, scostamento: Math.abs(v.m.probModello - v.m.frequenzaCampionato) }))
    .filter((v) => v.scostamento >= C.scostamentoMinSenzaQuota - EPS
      && 1 / v.prob >= SINGOLA.min - EPS && 1 / v.prob <= SINGOLA.max + EPS);
  scelte.push(...senza.filter((v) => v.preScarto));
  scelte.push(...senza.filter((v) => !v.preScarto)
    .sort((a, b) => b.scostamento - a.scostamento || a.ordine - b.ordine)
    .slice(0, C.maxSenzaQuotaGiorno));

  scelte.sort((a, b) => a.ordine - b.ordine);
  const candidati = scelte.map((v) => creaCandidato(v.partita, v.m, v.prob, notizie));
  const preScartate = scelte.filter((v) => v.preScarto)
    .map((v) => ({ idCandidato: idCandidato(v.partita.idPartita, v.m.mercato, v.m.selezione), motivo: v.preScarto }));
  return { candidati, preScartate, iniziate };
}
