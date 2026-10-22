// Budget unico delle richieste a odss-api.com [utente, 22/10/2026]: piano gratuito da 500 richieste ogni 30 giorni,
// condiviso da tutti gli sport e dai controlli. Stato in data/stato/odss.json:
//   { aggiornatoAlle, rimaste, limite, reset, limiteRaggiuntoFino,
//     giornate: { 'AAAA-MM-GG': { usate, controlli, perSport: { calcio: n, … }, avvisi: [motivi già scritti] } } }
// La chiave è sempre la giornata del progetto (dalle 08:00 di Roma alle 08:00 del giorno dopo, giornataDi):
// - raccolte del mattino: la giornata che raccolgono (`data`, la cui finestra comincia alle 08:00): la raccolta delle
//   07:35 del 23 conta nella giornata del 23 anche se parte prima delle 08:00, e un cron in ritardo dopo le 08:00 non
//   la sposta. usate ≤ CONFIG.odss.richiesteGiorno, perSport[sport] ≤ CONFIG.odss.tetti[sport];
// - controlli: la giornata in corso, giornataDi(adesso) (alle 07:50 del 23 è ancora quella del 22).
//   controlli ≤ CONFIG.odss.richiesteControlli.
// Ogni tipo ha il suo contatore nella sua giornata: scrivere l'uno non azzera mai l'altro [revisione, 23/10/2026].
// Mai sotto CONFIG.odss.riserva richieste rimaste. Dopo un HTTP 429 (limite di odss) nessuno step chiede più niente
// fino al reset (o per un'ora se il reset non si sa): `limiteRaggiuntoFino`.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { giornataDi } from '../bankroll/settimana.js';
import { finestraGiornata } from '../calcio/testo.js';

const O = CONFIG.odss;
const GIORNATE_TENUTE = 7;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const vuoto = (v) => v === undefined || v === null || v === '';

export const fileStatoOdss = (dirData) => path.join(dirData, 'stato', 'odss.json');

export function leggiStatoOdss(dirData) {
  try { return JSON.parse(fs.readFileSync(fileStatoOdss(dirData), 'utf8')); } catch { return null; }
}

export function scriviStatoOdss(dirData, stato) {
  const file = fileStatoOdss(dirData);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(stato, null, 2)}\n`);
}

const giornataVuota = () => ({ usate: 0, controlli: 0, perSport: {}, avvisi: [] });
function pulisciGiornata(g) {
  const x = oggetto(g) ? g : {};
  return {
    usate: num(x.usate) ? x.usate : 0,
    controlli: num(x.controlli) ? x.controlli : 0,
    perSport: oggetto(x.perSport) ? Object.fromEntries(Object.entries(x.perSport).filter(([, v]) => num(v))) : {},
    avvisi: Array.isArray(x.avvisi) ? x.avvisi.filter((a) => typeof a === 'string') : [],
  };
}

// Giornate dello stato, anche dal formato di prima ({ giorno, usateOggi, controlliOggi, perSport }).
function giornateDi(s0) {
  const out = {};
  if (oggetto(s0.giornate)) for (const [k, g] of Object.entries(s0.giornate)) out[k] = pulisciGiornata(g);
  if (!vuoto(s0.giorno) && !out[s0.giorno]) {
    out[s0.giorno] = pulisciGiornata({ usate: s0.usateOggi, controlli: s0.controlliOggi, perSport: s0.perSport });
  }
  return out;
}

// Budget di un giro. `tipo`: 'mattino' (raccolte, con `sport` e `data` = giornata raccolta) o 'controlli'.
// puo(dopo): si può fare una richiesta lasciandone `dopo` per quello che resta da scaricare?
// conta(): una richiesta fatta (anche se fallita); aggiorna(limiti): rimaste/limite/reset dall'intestazione;
// ferma429(): limite di odss raggiunto, niente più richieste fino al reset; avvisoNuovo(motivo): true la prima volta
// che quel motivo si scrive nella giornata (per non ripetere la stessa riga a ogni passaggio dei controlli).
export function creaBudgetOdss({ stato, data, adesso, tipo = 'mattino', sport = null }) {
  const s0 = oggetto(stato) ? stato : {};
  const scaduto = !vuoto(s0.reset) && Number.isFinite(Date.parse(s0.reset)) && Date.parse(s0.reset) <= adesso.getTime();
  const chiave = tipo === 'controlli' ? giornataDi(adesso) : giornataDi(finestraGiornata(data).da);
  const giornate = giornateDi(s0);
  giornate[chiave] ??= giornataVuota();
  const g = giornate[chiave];
  const s = {
    rimaste: num(s0.rimaste) && !scaduto ? s0.rimaste : null,
    limite: num(s0.limite) ? s0.limite : null,
    reset: scaduto ? null : s0.reset ?? null,
    limiteRaggiuntoFino: Number.isFinite(Date.parse(s0.limiteRaggiuntoFino)) && Date.parse(s0.limiteRaggiuntoFino) > adesso.getTime() ? s0.limiteRaggiuntoFino : null,
  };
  const dellaSport = () => (sport ? g.perSport[sport] ?? 0 : 0);
  const tettoSport = () => (sport && num(O.tetti?.[sport]) ? O.tetti[sport] : Infinity);
  const libere = () => {
    if (tipo === 'controlli') return O.richiesteControlli - g.controlli;
    return Math.min(O.richiesteGiorno - g.usate, tettoSport() - dellaSport());
  };
  return {
    chiave,
    puo(dopo = 0) {
      if (s.limiteRaggiuntoFino) return false;
      return 1 + dopo <= libere() && (s.rimaste === null || s.rimaste - 1 - dopo >= O.riserva);
    },
    // Motivo per cui non si può fare la prossima richiesta (per erroriGiro).
    motivo() {
      if (s.limiteRaggiuntoFino) return `limite di richieste di odss-api raggiunto (HTTP 429) fino a ${s.limiteRaggiuntoFino}`;
      if (libere() < 1) {
        if (tipo === 'controlli') return `tetto di ${O.richiesteControlli} richieste al giorno per i controlli raggiunto`;
        if (O.richiesteGiorno - g.usate < 1) return `tetto di ${O.richiesteGiorno} richieste al giorno del giro del mattino raggiunto`;
        return `tetto di ${tettoSport()} richieste al giorno per ${sport} raggiunto`;
      }
      return `riserva di ${O.riserva} richieste raggiunta (rimaste ${s.rimaste})`;
    },
    descrizione() {
      const oggi = tipo === 'controlli' ? `controlli oggi ${g.controlli} su ${O.richiesteControlli}` : `oggi ${g.usate} richieste su ${O.richiesteGiorno}`;
      return `${oggi}, rimaste ${s.rimaste ?? 'sconosciute'}, riserva ${O.riserva}`;
    },
    conta() {
      if (tipo === 'controlli') g.controlli++;
      else {
        g.usate++;
        if (sport) g.perSport[sport] = dellaSport() + 1;
      }
    },
    aggiorna(l) {
      if (num(l?.rimaste)) s.rimaste = l.rimaste;
      else if (s.rimaste !== null) s.rimaste -= 1;
      if (num(l?.limite)) s.limite = l.limite;
      if (l?.reset) s.reset = l.reset;
    },
    ferma429() {
      const r = Date.parse(s.reset);
      s.limiteRaggiuntoFino = Number.isFinite(r) && r > adesso.getTime() ? s.reset : new Date(adesso.getTime() + 3600000).toISOString();
    },
    avvisoNuovo(motivo) {
      if (g.avvisi.includes(motivo)) return false;
      g.avvisi.push(motivo);
      return true;
    },
    get rimaste() { return s.rimaste; },
    stato() {
      const tenute = Object.keys(giornate).sort().slice(-GIORNATE_TENUTE);
      return {
        aggiornatoAlle: adesso.toISOString(), rimaste: s.rimaste, limite: s.limite, reset: s.reset,
        limiteRaggiuntoFino: s.limiteRaggiuntoFino,
        giornate: Object.fromEntries(tenute.map((k) => [k, { ...giornate[k], perSport: { ...giornate[k].perSport }, avvisi: [...giornate[k].avvisi] }])),
      };
    },
  };
}
