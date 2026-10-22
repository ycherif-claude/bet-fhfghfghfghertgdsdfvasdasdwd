// Budget unico delle richieste a odss-api.com [utente, 22/10/2026]: piano gratuito da 500 richieste ogni 30 giorni,
// condiviso da tutti gli sport e dai controlli. Stato in data/stato/odss.json:
//   { aggiornatoAlle, rimaste, limite, reset, giorno, usateOggi, controlliOggi, perSport: { calcio: n, … } }
// - usateOggi: richieste del giro del mattino (tutte le raccolte), al massimo CONFIG.odss.richiesteGiorno;
// - perSport: le stesse divise per sport, ognuno al massimo CONFIG.odss.tetti[sport];
// - controlliOggi: richieste dei controlli pre-partita, al massimo CONFIG.odss.richiesteControlli;
// - mai sotto CONFIG.odss.riserva richieste rimaste (dall'intestazione X-RateLimit-Remaining).
// Il conteggio del giorno riparte quando cambia `giorno` (data di Roma); un reset passato rende sconosciute le rimaste.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';

const O = CONFIG.odss;
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

// Budget di un giro. `tipo`: 'mattino' (raccolte, con `sport`) o 'controlli'.
// puo(dopo): si può fare una richiesta lasciandone `dopo` per quello che resta da scaricare?
// conta(): una richiesta fatta (anche se fallita); aggiorna(limiti): rimaste/limite/reset dall'intestazione.
export function creaBudgetOdss({ stato, data, adesso, tipo = 'mattino', sport = null }) {
  const s0 = oggetto(stato) ? stato : {};
  const scaduto = !vuoto(s0.reset) && Number.isFinite(Date.parse(s0.reset)) && Date.parse(s0.reset) <= adesso.getTime();
  const stessoGiorno = s0.giorno === data;
  const s = {
    rimaste: num(s0.rimaste) && !scaduto ? s0.rimaste : null,
    limite: num(s0.limite) ? s0.limite : null,
    reset: scaduto ? null : s0.reset ?? null,
    usateOggi: stessoGiorno && num(s0.usateOggi) ? s0.usateOggi : 0,
    controlliOggi: stessoGiorno && num(s0.controlliOggi) ? s0.controlliOggi : 0,
    perSport: stessoGiorno && oggetto(s0.perSport) ? Object.fromEntries(Object.entries(s0.perSport).filter(([, v]) => num(v))) : {},
  };
  const dellaSport = () => (sport ? s.perSport[sport] ?? 0 : 0);
  const tettoSport = () => (sport && num(O.tetti?.[sport]) ? O.tetti[sport] : Infinity);
  const libere = () => {
    if (tipo === 'controlli') return O.richiesteControlli - s.controlliOggi;
    return Math.min(O.richiesteGiorno - s.usateOggi, tettoSport() - dellaSport());
  };
  const b = {
    puo(dopo = 0) {
      return 1 + dopo <= libere() && (s.rimaste === null || s.rimaste - 1 - dopo >= O.riserva);
    },
    // Motivo per cui non si può fare la prossima richiesta (per erroriGiro).
    motivo() {
      if (libere() < 1) {
        if (tipo === 'controlli') return `tetto di ${O.richiesteControlli} richieste al giorno per i controlli raggiunto`;
        if (O.richiesteGiorno - s.usateOggi < 1) return `tetto di ${O.richiesteGiorno} richieste al giorno del giro del mattino raggiunto`;
        return `tetto di ${tettoSport()} richieste al giorno per ${sport} raggiunto`;
      }
      return `riserva di ${O.riserva} richieste raggiunta (rimaste ${s.rimaste})`;
    },
    descrizione() {
      const oggi = tipo === 'controlli' ? `controlli oggi ${s.controlliOggi} su ${O.richiesteControlli}` : `oggi ${s.usateOggi} richieste su ${O.richiesteGiorno}`;
      return `${oggi}, rimaste ${s.rimaste ?? 'sconosciute'}, riserva ${O.riserva}`;
    },
    conta() {
      if (tipo === 'controlli') s.controlliOggi++;
      else {
        s.usateOggi++;
        if (sport) s.perSport[sport] = dellaSport() + 1;
      }
    },
    aggiorna(l) {
      if (num(l?.rimaste)) s.rimaste = l.rimaste;
      else if (s.rimaste !== null) s.rimaste -= 1;
      if (num(l?.limite)) s.limite = l.limite;
      if (l?.reset) s.reset = l.reset;
    },
    get rimaste() { return s.rimaste; },
    get usateOggi() { return s.usateOggi; },
    stato() {
      return {
        aggiornatoAlle: adesso.toISOString(), rimaste: s.rimaste, limite: s.limite, reset: s.reset, giorno: data,
        usateOggi: s.usateOggi, controlliOggi: s.controlliOggi, perSport: { ...s.perSport },
      };
    },
  };
  return b;
}
