// Notizie di Claude: controllo delle correzioni e delle esclusioni (§6.1) e loro applicazione.
import { CONFIG } from '../config.js';
import { idCandidato } from './id.js';

const EPS = 1e-9;
const { correzioneMax, probMin, probMax } = CONFIG.calcio;

// Mercati su cui Claude può dare un delta; gli altri si possono solo escludere.
// NBA (spec §5.4): Vincente, Handicap <linea> (della casa, con segno, oppure 0) e Totale punti <linea>,
// tutti a 2 selezioni: la complementare riceve −delta.
export function correggibile(mercato) {
  return mercato === '1X2' || mercato === 'Gol/No gol'
    || /^Under\/Over (casa |trasferta |1° tempo )?\d+\.5$/.test(mercato)
    || /^(Angoli|Cartellini) Under\/Over \d+\.5$/.test(mercato)
    || mercato === 'Vincente'
    || /^Handicap (0|[+-]\d+(\.\d+)?)$/.test(mercato)
    || /^Totale punti \d+(\.\d+)?$/.test(mercato);
}

const testoPieno = (x) => typeof x === 'string' && x.trim() !== '';
const numero = (n) => String(Math.round(n * 1e6) / 1e6);

// Variazioni del modello per ogni selezione di un mercato: Map(selezione → { delta, correzioni }).
// 2 selezioni: la complementare riceve −delta. 1X2: la terza riceve −(d1+d2); con una sola
// correzione le altre due si dividono −d in proporzione alla loro probabilità del modello.
function variazioni(partita, mercato, corr) {
  const voci = partita.mercati.filter((m) => m.mercato === mercato);
  const out = new Map();
  for (const c of corr) out.set(c.selezione, { delta: c.delta, correzioni: [c] });
  const altre = voci.filter((m) => !out.has(m.selezione));
  const somma = corr.reduce((a, c) => a + c.delta, 0);
  if (mercato === '1X2' && corr.length === 1 && altre.length === 2) {
    const tot = altre[0].probModello + altre[1].probModello;
    for (const m of altre) out.set(m.selezione, { delta: tot > 0 ? -somma * (m.probModello / tot) : -somma / 2, correzioni: corr });
  } else if (altre.length === 1) {
    out.set(altre[0].selezione, { delta: -somma, correzioni: corr });
  }
  return out;
}

// Elenco degli errori (vuoto se va tutto bene). Ogni messaggio dice quale voce e perché.
export function validaNotizie(notizie, raccolta) {
  const errori = [];
  if (!notizie || typeof notizie !== 'object' || Array.isArray(notizie)) return ['Il file notizie non contiene un oggetto'];
  if (typeof notizie.controllateAlle !== 'string' || !Number.isFinite(Date.parse(notizie.controllateAlle))) {
    errori.push('controllateAlle mancante o non valido (serve un orario ISO, per esempio 2026-10-20T08:15:00+02:00)');
  }
  if (notizie.partiteControllate !== undefined && !Array.isArray(notizie.partiteControllate)) errori.push('partiteControllate deve essere un elenco');
  const correzioni = notizie.correzioni ?? [];
  const esclusioni = notizie.esclusioni ?? [];
  if (!Array.isArray(correzioni)) errori.push('correzioni deve essere un elenco');
  if (!Array.isArray(esclusioni)) errori.push('esclusioni deve essere un elenco');
  if (errori.length) return errori;

  const partite = new Map((raccolta?.partite ?? []).map((p) => [p.idPartita, p]));

  // Correzioni valide singolarmente, raggruppate per partita e mercato.
  const gruppi = new Map();
  correzioni.forEach((c, i) => {
    const nome = `Correzione ${i + 1} (${c?.idPartita} · ${c?.mercato} · ${c?.selezione})`;
    const err = (motivo) => errori.push(`${nome}: ${motivo}`);
    const p = partite.get(c?.idPartita);
    if (!p) return err('partita inesistente nella raccolta di oggi');
    if (p.modello === 'solo-pinnacle') return err('partita con probabilità solo Pinnacle (coppa o nazionale): non si corregge, si può solo escludere');
    const voce = p.mercati.find((m) => m.mercato === c.mercato && m.selezione === c.selezione);
    if (!voce) return err('mercato o selezione inesistente nella partita');
    if (!correggibile(c.mercato)) return err(`mercato non correggibile: si può solo escludere il candidato`);
    if (typeof c.delta !== 'number' || !Number.isFinite(c.delta)) return err('delta non numerico');
    if (Math.abs(c.delta) > correzioneMax + EPS) return err(`delta ${numero(c.delta)} oltre il massimo di ±${correzioneMax}`);
    if (!testoPieno(c.motivo)) return err('motivo mancante');
    if (!testoPieno(c.fonte)) return err('fonte mancante');
    if (typeof voce.probModello !== 'number') return err('probabilità del modello assente: non si può correggere');
    const chiave = `${c.idPartita}|${c.mercato}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, { p, nome: `${c.idPartita} · ${c.mercato}`, corr: [] });
    gruppi.get(chiave).corr.push(c);
  });

  for (const { p, nome, corr } of gruppi.values()) {
    const err = (motivo) => errori.push(`Correzioni ${nome}: ${motivo}`);
    const selezioni = new Set(corr.map((c) => c.selezione));
    if (selezioni.size < corr.length) { err('la stessa selezione è corretta più volte'); continue; }
    const mercato = corr[0].mercato;
    if (mercato === '1X2' && corr.length > 2) { err('nell\'1X2 al massimo 2 selezioni corrette: la terza si ricava'); continue; }
    if (mercato !== '1X2' && corr.length > 1) { err('una sola correzione per mercato: la selezione opposta si ricava'); continue; }
    for (const [selezione, { delta }] of variazioni(p, mercato, corr)) {
      const ricavata = !selezioni.has(selezione);
      if (ricavata && Math.abs(delta) > correzioneMax + EPS) {
        err(`la correzione ricavata su "${selezione}" vale ${numero(delta)}, oltre il massimo di ±${correzioneMax}`);
        continue;
      }
      const voce = p.mercati.find((m) => m.mercato === mercato && m.selezione === selezione);
      if (typeof voce.probModello !== 'number') { err(`probabilità del modello assente su "${selezione}"`); continue; }
      const nuova = voce.probModello + delta;
      if (nuova < probMin - EPS || nuova > probMax + EPS) {
        err(`"${selezione}" passerebbe da ${numero(voce.probModello)} a ${numero(nuova)}, fuori dall'intervallo ${probMin}–${probMax}`);
      }
    }
  }

  esclusioni.forEach((x, i) => {
    const nome = `Esclusione ${i + 1} (${x?.idPartita}${x?.idCandidato ? ` · ${x.idCandidato}` : ''})`;
    const err = (motivo) => errori.push(`${nome}: ${motivo}`);
    const p = partite.get(x?.idPartita);
    if (!p) return err('partita inesistente nella raccolta di oggi');
    if (x.idCandidato !== undefined && x.idCandidato !== null
      && !p.mercati.some((m) => idCandidato(p.idPartita, m.mercato, m.selezione) === x.idCandidato)) {
      return err('candidato inesistente nella partita');
    }
    if (!testoPieno(x.motivo)) return err('motivo mancante');
    if (!testoPieno(x.fonte)) return err('fonte mancante');
  });
  return errori;
}

// Copia della partita con `probModello` corretto e `correzioneNotizie` su ogni mercato
// ({ delta, motivo, fonte } oppure null). Le correzioni devono essere già valide.
export function applicaCorrezioni(partita, correzioni) {
  const mie = (correzioni ?? []).filter((c) => c.idPartita === undefined || c.idPartita === partita.idPartita);
  const perMercato = new Map();
  for (const c of mie) {
    if (!perMercato.has(c.mercato)) perMercato.set(c.mercato, []);
    perMercato.get(c.mercato).push(c);
  }
  const cambi = new Map();
  for (const [mercato, corr] of perMercato) {
    for (const [selezione, v] of variazioni(partita, mercato, corr)) cambi.set(`${mercato}|${selezione}`, v);
  }
  return {
    ...partita,
    mercati: partita.mercati.map((m) => {
      const v = cambi.get(`${m.mercato}|${m.selezione}`);
      if (!v) return { ...m, correzioneNotizie: null };
      const unisci = (k) => [...new Set(v.correzioni.map((c) => c[k]))].join('; ');
      return {
        ...m,
        probModello: m.probModello + v.delta,
        correzioneNotizie: { delta: v.delta, motivo: unisci('motivo'), fonte: unisci('fonte') },
      };
    }),
  };
}
