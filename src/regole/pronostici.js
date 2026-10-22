// Pronostici sì/no [utente, 22/10/2026]: per ogni partita i mercati dove il modello, da solo e senza
// quote, è sopra la soglia del mercato (CONFIG.pronostici). La probabilità mostrata è quella vera della
// stessa fascia nelle stagioni passate, resa monotona con la regressione isotonica, nella tabella del gruppo
// della competizione (principali, seconde serie, extra: data/taratura/calibrazione.json; coppe:
// data/storico/elo-europeo.json). Il "sì" esce solo se il limite inferiore di Wilson (95%) della fascia è
// almeno probMinima [correzioni B1, B2]. La quota minima è 1 / probabilità.
// La quota del bookmaker, se c'è, serve solo a dire se oggi conviene giocarlo (eGiocabile).
// Quando il giro li pubblica se ne salva un'istantanea (data/registro/<data>-pronostici.json) che il
// registro chiude dal risultato della partita, anche se la raccolta non ha quella partita.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { gruppoCompetizione } from '../calcio/competizioni.js';
import { fasceIsotoniche } from '../taratura/isotonica.js';
import { abbinaEventiOdss, quoteOdssPronostico } from '../calcio/odss.js';

const C = CONFIG.pronostici;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function leggiCalibrazione(dirData) {
  let cal = null;
  try {
    cal = JSON.parse(fs.readFileSync(path.join(dirData, 'taratura', 'calibrazione.json'), 'utf8'));
  } catch {
    return null;
  }
  // Coppe europee: calibrazione dell'Elo europeo sulle coppe passate (data/storico/elo-europeo.json).
  try {
    cal.coppe = JSON.parse(fs.readFileSync(path.join(dirData, 'storico', 'elo-europeo.json'), 'utf8')).calibrazione;
  } catch {
    // Senza file le coppe non hanno pronostici.
  }
  return cal;
}

const chiave = (sport, mercato, selezione) => (sport === 'tennis' ? `${mercato}|*` : `${mercato}|${selezione}`);

const arrotonda = (x) => Math.round(x * 10000) / 10000;

// Fascia del modello: { prob (isotonica), limite (Wilson 95%), n (partite della fascia) }; le fasce con meno
// di minCampioniFascia casi non contano (si usa la fascia sotto). null se nessuna fascia vale.
export function fasciaCalibrata(fasce, p) {
  const valide = fasceIsotoniche(fasce, C.minCampioniFascia).filter((f) => f.da <= p + 1e-9);
  const f = valide.at(-1);
  if (!f) return null;
  const prob = Math.min(0.97, f.isotonica);
  return { prob: arrotonda(prob), limite: arrotonda(Math.min(prob, f.limite)), n: f.n };
}

export const probCalibrata = (fasce, p) => fasciaCalibrata(fasce, p)?.prob ?? null;

// Gruppo della calibrazione di una partita: coppe se il modello è l'Elo europeo, altrimenti quello della competizione.
export function gruppoCalibrazione(partita) {
  if (partita?.modello === 'elo-europeo') return 'coppe';
  return gruppoCompetizione(partita?.competizione);
}

// Tabelle (mercato → fasce) del gruppo della partita; null se il gruppo non ha tabella.
function tabelleDi(partita, sport, calibrazione) {
  if (sport !== 'calcio') return calibrazione?.[sport] ?? null;
  const gruppo = gruppoCalibrazione(partita);
  if (!gruppo) return null;
  return (gruppo === 'coppe' ? calibrazione?.coppe : calibrazione?.calcio?.[gruppo]) ?? null;
}

export const quotaMinima = (prob) => Math.ceil((1 / prob) * 100 - 1e-9) / 100;

// "Giocabile ✅" [correzione C2]: anche il mercato senza margine (Pinnacle o consenso) dà almeno probMinima
// e la quota è almeno margineQuota × la minima. Senza quota o senza Pinnacle mai: solo da tenere d'occhio.
export function eGiocabile({ quota, probMercato, quotaMinima: minima }) {
  if (!num(quota) || !num(probMercato) || !num(minima)) return false;
  return probMercato >= C.probMinima - 1e-9 && quota >= C.margineQuota * minima - 1e-9;
}

// Frase semplice del pronostico (per sito e Telegram).
export function testoPronostico(partita, mercato, selezione) {
  const casa = partita.casa ?? String(partita.partita).split(' - ')[0];
  const trasferta = partita.trasferta ?? String(partita.partita).split(' - ')[1];
  const k = `${mercato}|${selezione}`;
  const testi = {
    '1X2|1': `Vince ${casa}`,
    '1X2|2': `Vince ${trasferta}`,
    'Doppia chance|1X': `${casa} non perde (1X)`,
    'Doppia chance|X2': `${trasferta} non perde (X2)`,
    'Doppia chance|12': 'Non finisce in pareggio (12)',
    'Under/Over 1.5|Over 1.5': 'Almeno 2 gol (Over 1.5)',
    'Under/Over 2.5|Over 2.5': 'Almeno 3 gol (Over 2.5)',
    'Under/Over 3.5|Under 3.5': 'Al massimo 3 gol (Under 3.5)',
    'Under/Over casa 0.5|Over 0.5': `Segna ${casa}`,
    'Under/Over trasferta 0.5|Over 0.5': `Segna ${trasferta}`,
  };
  if (testi[k]) return testi[k];
  if (/^Vincente/.test(mercato)) return `Vince ${selezione}`;
  return `${mercato}: ${selezione}`;
}

// Probabilità prudente di un pronostico: il limite di Wilson della fascia (dati vecchi senza limite: la probabilità).
export const probPrudente = (x) => (num(x?.limite) ? x.limite : num(x?.prob) ? x.prob : 0);

// Pronostico migliore della partita [utente, 22/10/2026, idea 2]: uno solo con `migliore: true`, gli altri false.
// Se almeno uno ha la quota: il massimo di probabilità prudente × quota fra quelli con quota. Altrimenti la
// probabilità prudente più alta fra quelli con quota minima ≥ 1,20 (sotto, la giocata non vale la pena); se
// nessuno arriva a 1,20, quello con la quota minima più alta. A parità vince il primo (il più sicuro).
export const QUOTA_MINIMA_MIGLIORE = 1.2;
export function scegliMigliore(pronostici) {
  const lista = Array.isArray(pronostici) ? pronostici : [];
  if (!lista.length) return [];
  const conQuota = lista.filter((x) => num(x.quota));
  const massimo = (candidati, valore) => candidati.reduce((m, x) => (valore(x) > valore(m) + 1e-12 ? x : m));
  let scelto;
  if (conQuota.length) scelto = massimo(conQuota, (x) => probPrudente(x) * x.quota);
  else {
    const alti = lista.filter((x) => num(x.quotaMinima) && x.quotaMinima >= QUOTA_MINIMA_MIGLIORE - 1e-9);
    scelto = alti.length ? massimo(alti, probPrudente) : massimo(lista, (x) => (num(x.quotaMinima) ? x.quotaMinima : 0));
  }
  return lista.map((x) => ({ ...x, migliore: x === scelto }));
}

// Pronostici di una partita della raccolta: al massimo maxPerPartita, i più sicuri; uno è il migliore.
// `eventoOdss` (idea 1): l'evento odss-api abbinato alla partita. Con l'evento la quota è la migliore dei
// bookmaker dell'utente (quotaMigliore, null se nessuno la dà: gol casa/ospite non hanno un mercato squadra) e
// il mercato senza margine è Pinnacle (odss-api, poi The Odds API) o il consenso dei bookmaker. Senza evento,
// tutto come prima (mediana e Pinnacle di The Odds API).
export function pronosticiPartita(partita, calibrazione, eventoOdss = null) {
  const sport = partita.sport ?? 'calcio';
  const soglie = C.soglie[sport];
  const tabelle = tabelleDi(partita, sport, calibrazione);
  if (!soglie || !tabelle) return [];
  const out = [];
  for (const m of partita.mercati ?? []) {
    const k = chiave(sport, m.mercato, m.selezione);
    if (!(k in soglie) || !num(m.probModello) || m.probModello < soglie[k] - 1e-9) continue;
    const fascia = fasciaCalibrata(tabelle[k], m.probModello);
    if (!fascia || fascia.limite < C.probMinima - 1e-9) continue;
    const { prob, limite, n } = fascia;
    const minima = quotaMinima(prob);
    let quota = num(m.quota) && m.quota > 1 ? m.quota : null;
    let probMercato = num(m.probPinnacle) ? m.probPinnacle : null;
    let odss = {};
    if (eventoOdss) {
      const q = quoteOdssPronostico(eventoOdss, m.mercato, m.selezione);
      quota = q?.quotaMigliore ?? null;
      if (q) {
        if (num(q.probConsenso) && (q.fonteConsenso === 'Pinnacle' || probMercato === null)) probMercato = q.probConsenso;
        odss = {
          quoteMiei: q.quoteMiei, quotaMigliore: q.quotaMigliore, bookmakerMigliore: q.bookmakerMigliore, oraQuota: q.oraQuota,
          probConsenso: q.probConsenso, fonteConsenso: q.fonteConsenso,
        };
      }
    }
    out.push({
      mercato: m.mercato, selezione: m.selezione, testo: testoPronostico(partita, m.mercato, m.selezione), probModello: m.probModello, prob, limite, n, quotaMinima: minima,
      quota, ...odss, probMercato, giocabile: eGiocabile({ quota, probMercato, quotaMinima: minima }), esito: null,
    });
  }
  return scegliMigliore(out.sort((a, b) => b.prob - a.prob).slice(0, C.maxPerPartita));
}

// Pronostici del giorno: le partite non iniziate con almeno un pronostico, in ordine di inizio.
// `odss`: eventi di data/raccolta/<data>-odss.json (null se mancano), abbinati alle partite di calcio.
export function pronosticiGiornata(raccolta, calibrazione, { adesso = null, escluse = new Set(), odss = null } = {}) {
  const out = [];
  const abbinati = Array.isArray(odss) ? abbinaEventiOdss(raccolta?.partite ?? [], odss) : new Map();
  for (const p of raccolta?.partite ?? []) {
    if (!p || escluse.has(p.idPartita)) continue;
    if (adesso && Date.parse(p.inizio) <= adesso.getTime()) continue;
    const pronostici = pronosticiPartita(p, calibrazione, abbinati.get(p.idPartita) ?? null);
    if (!pronostici.length) continue;
    out.push({ idPartita: p.idPartita, sport: p.sport ?? 'calcio', competizione: p.competizione, partita: p.partita, inizio: p.inizio, pronostici });
  }
  return out.sort((a, b) => Date.parse(a.inizio) - Date.parse(b.inizio));
}

// ---- Istantanea dei pronostici pubblicati (si chiude da sola, correzione C1) ----

export const fileIstantanea = (dirData, data) => path.join(dirData, 'registro', `${data}-pronostici.json`);
const chiaveRiga = (r) => `${r.idPartita}|${r.mercato}|${r.selezione}`;
const leggiFile = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
};

// Righe autosufficienti: tutto quello che serve per trovare il risultato e calcolare l'esito.
export function righeIstantanea(pronosticiGiornata) {
  const righe = [];
  for (const p of Array.isArray(pronosticiGiornata) ? pronosticiGiornata : []) {
    for (const x of Array.isArray(p?.pronostici) ? p.pronostici : []) {
      righe.push({
        idPartita: p.idPartita, sport: p.sport ?? 'calcio', competizione: p.competizione, partita: p.partita, inizio: p.inizio,
        mercato: x.mercato, selezione: x.selezione, testo: x.testo ?? null, prob: x.prob, probModello: x.probModello ?? null,
        ...(num(x.n) ? { n: x.n, limite: x.limite ?? null } : {}), quotaMinima: x.quotaMinima, esito: x.esito ?? null,
        // Idea 2: il bilancio distingue i migliori da tutti (i dati vecchi non hanno il campo).
        ...(typeof x.migliore === 'boolean' ? { migliore: x.migliore } : {}),
        // Idea 5: il bilancio del lunedì conta a parte i pronostici ✅ (con la quota del mattino).
        ...(x.giocabile === true ? { giocabile: true } : {}), ...(num(x.quota) ? { quota: x.quota } : {}),
        // Idea 1: il bookmaker della quota del mattino (odss-api).
        ...(num(x.quota) && typeof x.bookmakerMigliore === 'string' ? { bookmaker: x.bookmakerMigliore } : {}),
      });
    }
  }
  return righe;
}

// Scrive l'istantanea dei pronostici pubblicati. I pronostici delle partite già iniziate che c'erano
// prima restano: una nuova scrittura non li cancella. `schedine` (idea 4): le doppie e triple della giornata;
// senza, restano quelle di prima.
export function salvaIstantanea(dirData, data, pronosticiGiornata, adesso, schedine = undefined) {
  const file = fileIstantanea(dirData, data);
  const prima = leggiFile(file);
  const nuove = righeIstantanea(pronosticiGiornata);
  const chiavi = new Set(nuove.map(chiaveRiga));
  const tenute = (Array.isArray(prima?.pronostici) ? prima.pronostici : [])
    .filter((r) => Date.parse(r.inizio) <= adesso.getTime() && !chiavi.has(chiaveRiga(r)));
  const pronostici = [...tenute, ...nuove];
  if (!pronostici.length && !prima) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const conSchedine = Array.isArray(schedine) ? schedine : Array.isArray(prima?.schedine) ? prima.schedine : null;
  fs.writeFileSync(file, `${JSON.stringify({ data, salvataAlle: adesso.toISOString(), pronostici, ...(conSchedine ? { schedine: conSchedine } : {}) }, null, 2)}
`);
  return true;
}

// Istantanea della giornata `data`; se manca (giornate scritte prima del 23/10/2026) si legge dal file
// della giornata: `daGiornata: true`. null se non ci sono pronostici.
export function leggiIstantanea(dirData, data) {
  const ist = leggiFile(fileIstantanea(dirData, data));
  if (ist && Array.isArray(ist.pronostici)) return { ...ist, data: ist.data ?? data };
  const g = leggiFile(path.join(dirData, 'giornate', `${data}.json`));
  const righe = righeIstantanea(g?.pronostici);
  const schedine = Array.isArray(g?.schedinePronostici) ? g.schedinePronostici : null;
  return righe.length ? { data, daGiornata: true, pronostici: righe, ...(schedine ? { schedine } : {}) } : null;
}

const GIORNO = 86400000;
export const GIORNI_ESITO_PRONOSTICI = 4;
const giornoMese = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

// Guardia: pronostici ancora senza esito 4 giorni dopo (partita non trovata nella fonte degli esiti).
// Una riga per giornata, per le giornate da 4 a 6 giorni fa: va in erroriGiro, mai silenzio.
export function avvisiPronosticiSenzaEsito(dirData, oggi) {
  const out = [];
  for (let i = GIORNI_ESITO_PRONOSTICI + 2; i >= GIORNI_ESITO_PRONOSTICI; i--) {
    const data = new Date(Date.parse(`${oggi}T12:00:00Z`) - i * GIORNO).toISOString().slice(0, 10);
    const ist = leggiFile(fileIstantanea(dirData, data));
    const aperte = [...new Set((Array.isArray(ist?.pronostici) ? ist.pronostici : []).filter((r) => r && r.esito == null).map((r) => r.partita))];
    if (aperte.length) {
      out.push(`Pronostici del ${giornoMese(data)} senza esito dopo ${GIORNI_ESITO_PRONOSTICI} giorni (partita non trovata nella fonte degli esiti): ${aperte.join(', ')}`);
    }
  }
  return out;
}

// ---- Bilancio (correzione I4): i pronostici della stessa partita sono collegati, non indipendenti ----

// { giusti, chiusi, aperti, partite: { totale, tutteGiuste, conSbagliati, aperte }, sbagliati: [{ partita, testo }] }
export function bilancioPronostici(giornata) {
  const b = { giusti: 0, chiusi: 0, aperti: 0, partite: { totale: 0, tutteGiuste: 0, conSbagliati: 0, aperte: 0 }, sbagliati: [] };
  for (const p of Array.isArray(giornata?.pronostici) ? giornata.pronostici : []) {
    const lista = Array.isArray(p?.pronostici) ? p.pronostici : [];
    if (!lista.length) continue;
    b.partite.totale++;
    let sbagliati = 0;
    let aperti = 0;
    for (const x of lista) {
      if (x?.esito === 'vinta') { b.giusti++; b.chiusi++; } else if (x?.esito === 'persa') {
        b.chiusi++;
        sbagliati++;
        b.sbagliati.push({ partita: p.partita, testo: x.testo ?? x.selezione });
      } else if (x?.esito == null) aperti++;
    }
    b.aperti += aperti;
    if (sbagliati) b.partite.conSbagliati++;
    else if (aperti) b.partite.aperte++;
    else b.partite.tutteGiuste++;
  }
  return b;
}
