import { CONFIG } from '../config.js';

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: CONFIG.fusoOrario, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23', weekday: 'short',
});

// Componenti di un istante in ora di Roma.
export function partiRoma(istante) {
  const p = Object.fromEntries(formato.formatToParts(istante).map((x) => [x.type, x.value]));
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ora: +p.hour, giornoSettimana: p.weekday };
}

const GIORNI = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const toData = (ms) => new Date(ms).toISOString().slice(0, 10);

// Data AAAA-MM-GG del lunedì della settimana (ora di Roma) che contiene l'istante.
export function inizioSettimana(istante) {
  const r = partiRoma(istante);
  return toData(Date.UTC(r.anno, r.mese - 1, r.giorno) - GIORNI[r.giornoSettimana] * 86400000);
}

// Data AAAA-MM-GG della "giornata" 08:00-07:59 (Roma) che contiene l'istante.
export function giornataDi(istante) {
  const r = partiRoma(istante);
  return toData(Date.UTC(r.anno, r.mese - 1, r.giorno) - (r.ora < 8 ? 86400000 : 0));
}
