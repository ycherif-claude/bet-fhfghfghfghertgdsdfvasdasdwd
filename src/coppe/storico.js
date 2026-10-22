// Storico delle coppe europee (Champions, Europa e Conference League, con i preliminari) da ESPN:
// data/storico/coppe-europee.json. Si scaricano tutti i giorni della settimana (finali e preliminari non
// sono solo martedì-giovedì) [correzione B3]; ogni giorno si riprendono gli ultimi 10 giorni, il resto resta
// salvato. Le partite finite ai supplementari o ai rigori valgono con il risultato dei 90 minuti (Elo,
// calibrazione ed esiti dei pronostici sono tutti sui 90 minuti).
// Uso: node src/coppe/storico.js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scarica } from '../calcio/fonti/http.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
export const COPPE = {
  'uefa.champions': 'Champions League',
  'uefa.champions_qual': 'Champions League (preliminari)',
  'uefa.europa': 'Europa League',
  'uefa.europa_qual': 'Europa League (preliminari)',
  'uefa.europa.conf': 'Conference League',
  'uefa.europa.conf_qual': 'Conference League (preliminari)',
};
const INIZIO = '2021-06-20';
const GIORNO = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const DOPO_90 = new Set(['STATUS_FINAL_AET', 'STATUS_FINAL_PEN']);
const minuto = (clock) => {
  const m = /^(\d+)'/.exec(String(clock ?? '').trim());
  return m ? Number(m[1]) : null;
};

// Risultato dei 90 minuti di una partita finita ai supplementari o ai rigori, dai gol con il minuto del
// tabellone ESPN (90'+recupero compreso, rigori esclusi). Solo se i gol del dettaglio tornano esattamente
// con il punteggio finale di entrambe le squadre (autogol compresi): altrimenti null.
export function risultato90(c) {
  const lato = (h) => c?.competitors?.find((x) => x.homeAway === h);
  const casa = lato('home');
  const trasferta = lato('away');
  if (!Array.isArray(c?.details) || !casa?.team || !trasferta?.team) return null;
  const finale = { [casa.team.id]: Number(casa.score), [trasferta.team.id]: Number(trasferta.score) };
  if (!Object.values(finale).every(Number.isInteger)) return null;
  const tutti = { [casa.team.id]: 0, [trasferta.team.id]: 0 };
  const nei90 = { [casa.team.id]: 0, [trasferta.team.id]: 0 };
  for (const d of c.details) {
    if (!d?.scoringPlay || d.shootout) continue;
    const id = String(d.team?.id ?? '');
    const min = minuto(d.clock?.displayValue);
    if (!(id in tutti) || min === null) return null;
    tutti[id]++;
    if (min <= 90) nei90[id]++;
  }
  if (Object.keys(finale).some((id) => tutti[id] !== finale[id])) return null;
  return { gc: nei90[casa.team.id], gt: nei90[trasferta.team.id] };
}

// Partite di un giorno di una coppa: i gol dei 90 minuti, anche per quelle finite ai supplementari o ai
// rigori (`controllato90`; gol null se il dettaglio non basta).
export function partiteDaScoreboard(j, coppa) {
  const out = [];
  for (const e of j?.events ?? []) {
    const c = e.competitions?.[0];
    const lato = (h) => c?.competitors?.find((x) => x.homeAway === h);
    const casa = lato('home');
    const trasferta = lato('away');
    if (!casa?.team || !trasferta?.team) continue;
    const stato = c?.status?.type?.name ?? null;
    const finita = stato === 'STATUS_FULL_TIME';
    const dopo90 = DOPO_90.has(stato) ? risultato90(c) : null;
    out.push({
      id: String(e.id), coppa, inizio: e.date, data: String(e.date).slice(0, 10),
      casa: { id: String(casa.team.id), nome: casa.team.displayName },
      trasferta: { id: String(trasferta.team.id), nome: trasferta.team.displayName },
      gc: finita ? Number(casa.score) : dopo90?.gc ?? null, gt: finita ? Number(trasferta.score) : dopo90?.gt ?? null,
      // Neutro: finali e partite in campo neutro (il vantaggio casa non vale).
      neutro: c?.neutralSite === true,
      stato,
      ...(DOPO_90.has(stato) ? { controllato90: true } : {}),
    });
  }
  return out;
}

// Tutti i giorni da `da` ad `a` compresi.
export function giorniDiCoppa(da, a) {
  const out = [];
  for (let t = Date.parse(`${da}T12:00:00Z`); t <= Date.parse(`${a}T12:00:00Z`); t += GIORNO) out.push(iso(t));
  return out;
}
const metaSettimana = (g) => { const d = new Date(`${g}T12:00:00Z`).getUTCDay(); return d >= 2 && d <= 4; };

// `maxRiprese`: giorni vecchi da riprendere a ogni giro, oltre agli ultimi 10 (ESPN risponde 403/502 se
// le richieste sono troppe): il resto resta in `daRiprendere` per i giri seguenti.
export async function aggiornaStoricoCoppe({ dirData, adesso, fetch: f, parallele = 3, maxRiprese = 400 }) {
  const file = path.join(dirData, 'storico', 'coppe-europee.json');
  let vecchio = { partite: [] };
  try { vecchio = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primo giro */ }
  const oggi = iso(adesso.getTime());
  const ultima = vecchio.partite.map((p) => p.data).sort().at(-1);
  const da = ultima ? iso(Date.parse(`${ultima}T12:00:00Z`) - 10 * GIORNO) : INIZIO;
  const fine = iso(adesso.getTime() + 2 * GIORNO);
  const chiave = (s, g) => `${s}|${g}`;
  const lavori = new Map(giorniDiCoppa(da, fine).flatMap((g) => Object.keys(COPPE).map((s) => [chiave(s, g), [s, g]])));
  // Giorni vecchi da riprendere, in ordine: partite salvate finite ai supplementari o ai rigori senza il
  // risultato dei 90 minuti, giorni rimasti dai giri prima, e (una volta sola, poi il segno `tuttiIGiorni`)
  // i giorni fuori da martedì-giovedì mai scaricati.
  const riprese = new Map();
  const aggiungi = (s, g) => { const k = chiave(s, g); if (COPPE[s] && !lavori.has(k)) riprese.set(k, [s, g]); };
  const slugDi = Object.fromEntries(Object.entries(COPPE).map(([s, nome]) => [nome, s]));
  for (const p of vecchio.partite) if (DOPO_90.has(p.stato) && !p.controllato90 && slugDi[p.coppa]) aggiungi(slugDi[p.coppa], p.data);
  for (const [s, g] of Array.isArray(vecchio.daRiprendere) ? vecchio.daRiprendere : []) aggiungi(s, g);
  if (!vecchio.tuttiIGiorni) {
    for (const g of giorniDiCoppa(INIZIO, fine).filter((x) => !metaSettimana(x)).reverse()) for (const s of Object.keys(COPPE)) aggiungi(s, g);
  }
  const tutteRiprese = [...riprese.values()];
  const elenco = [...lavori.values(), ...tutteRiprese.slice(0, maxRiprese)];
  const falliti = [...tutteRiprese.slice(maxRiprese)];
  const nuove = new Map(vecchio.partite.map((p) => [p.id, p]));
  const errori = [];
  let i = 0;
  async function lavoratore() {
    while (i < elenco.length) {
      const [s, g] = elenco[i++];
      try {
        const r = await scarica(`${BASE}/${s}/scoreboard?dates=${g.replaceAll('-', '')}`, f ? { fetch: f } : {});
        for (const p of partiteDaScoreboard(JSON.parse(r.testo), COPPE[s])) nuove.set(p.id, p);
      } catch (e) {
        errori.push(`${s} ${g}: ${e?.message ?? e}`);
        falliti.push([s, g]);
      }
    }
  }
  await Promise.all(Array.from({ length: parallele }, lavoratore));
  const partite = [...nuove.values()].sort((a, b) => (a.inizio < b.inizio ? -1 : a.inizio > b.inizio ? 1 : 0));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({
    aggiornatoAlle: adesso.toISOString(), tuttiIGiorni: true, ...(falliti.length ? { daRiprendere: falliti } : {}), partite,
  })}\n`);
  return { partite: partite.length, giocate: partite.filter((p) => p.gc !== null).length, richieste: elenco.length, errori, oggi };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  aggiornaStoricoCoppe({ dirData: 'data', adesso: new Date() }).then((r) => {
    console.log(`Coppe europee: ${r.partite} partite (${r.giocate} con risultato), ${r.richieste} richieste, ${r.errori.length} errori`);
    for (const e of r.errori.slice(0, 10)) console.log(`- ${e}`);
  }).catch((e) => console.error(`Storico coppe non aggiornato: ${e?.message ?? e}`));
}
