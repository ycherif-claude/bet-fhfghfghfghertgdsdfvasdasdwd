// Pronostici sì/no [utente, 22/10/2026]: per ogni partita i mercati dove il modello, da solo e senza
// quote, è sopra la soglia del mercato (CONFIG.pronostici). La probabilità mostrata è quella vera della
// stessa fascia nelle stagioni passate (data/taratura/calibrazione.json); la quota minima è 1 / probabilità.
// La quota del bookmaker, se c'è, serve solo a dire se oggi conviene giocarlo (eGiocabile).
// Quando il giro li pubblica se ne salva un'istantanea (data/registro/<data>-pronostici.json) che il
// registro chiude dal risultato della partita, anche se la raccolta non ha quella partita.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';

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

// Frequenza vera della fascia del modello; con meno di minCampioniFascia casi si usa la fascia sotto.
export function probCalibrata(fasce, p) {
  if (!Array.isArray(fasce)) return null;
  const valide = fasce.filter((f) => f.n >= C.minCampioniFascia && f.da <= p + 1e-9).sort((a, b) => b.da - a.da);
  return valide.length ? Math.min(0.97, valide[0].vera) : null;
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

// Pronostici di una partita della raccolta: al massimo maxPerPartita, i più sicuri.
export function pronosticiPartita(partita, calibrazione) {
  const sport = partita.sport ?? 'calcio';
  const soglie = C.soglie[sport];
  const tabelle = partita.modello === 'elo-europeo' ? calibrazione?.coppe : calibrazione?.[sport];
  if (!soglie || !tabelle) return [];
  const out = [];
  for (const m of partita.mercati ?? []) {
    const k = chiave(sport, m.mercato, m.selezione);
    if (!(k in soglie) || !num(m.probModello) || m.probModello < soglie[k] - 1e-9) continue;
    const prob = probCalibrata(tabelle[k], m.probModello);
    if (!prob || prob < C.probMinima - 1e-9) continue;
    const minima = quotaMinima(prob);
    const quota = num(m.quota) && m.quota > 1 ? m.quota : null;
    const probMercato = num(m.probPinnacle) ? m.probPinnacle : null;
    out.push({
      mercato: m.mercato, selezione: m.selezione, testo: testoPronostico(partita, m.mercato, m.selezione), probModello: m.probModello, prob, quotaMinima: minima,
      quota, probMercato, giocabile: eGiocabile({ quota, probMercato, quotaMinima: minima }), esito: null,
    });
  }
  return out.sort((a, b) => b.prob - a.prob).slice(0, C.maxPerPartita);
}

// Pronostici del giorno: le partite non iniziate con almeno un pronostico, in ordine di inizio.
export function pronosticiGiornata(raccolta, calibrazione, { adesso = null, escluse = new Set() } = {}) {
  const out = [];
  for (const p of raccolta?.partite ?? []) {
    if (!p || escluse.has(p.idPartita)) continue;
    if (adesso && Date.parse(p.inizio) <= adesso.getTime()) continue;
    const pronostici = pronosticiPartita(p, calibrazione);
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
        quotaMinima: x.quotaMinima, esito: x.esito ?? null,
      });
    }
  }
  return righe;
}

// Scrive l'istantanea dei pronostici pubblicati. I pronostici delle partite già iniziate che c'erano
// prima restano: una nuova scrittura non li cancella.
export function salvaIstantanea(dirData, data, pronosticiGiornata, adesso) {
  const file = fileIstantanea(dirData, data);
  const prima = leggiFile(file);
  const nuove = righeIstantanea(pronosticiGiornata);
  const chiavi = new Set(nuove.map(chiaveRiga));
  const tenute = (Array.isArray(prima?.pronostici) ? prima.pronostici : [])
    .filter((r) => Date.parse(r.inizio) <= adesso.getTime() && !chiavi.has(chiaveRiga(r)));
  const pronostici = [...tenute, ...nuove];
  if (!pronostici.length && !prima) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ data, salvataAlle: adesso.toISOString(), pronostici }, null, 2)}
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
  return righe.length ? { data, daGiornata: true, pronostici: righe } : null;
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
