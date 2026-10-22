// Storico delle coppe europee (Champions, Europa e Conference League, con i preliminari) da ESPN:
// data/storico/coppe-europee.json. Si scaricano solo martedì, mercoledì e giovedì (i giorni delle coppe);
// ogni giorno si riprendono gli ultimi 10 giorni, il resto resta salvato.
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

// Partite di un giorno di una coppa: solo quelle finite nei 90 minuti hanno i gol (supplementari esclusi).
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
    out.push({
      id: String(e.id), coppa, inizio: e.date, data: String(e.date).slice(0, 10),
      casa: { id: String(casa.team.id), nome: casa.team.displayName },
      trasferta: { id: String(trasferta.team.id), nome: trasferta.team.displayName },
      gc: finita ? Number(casa.score) : null, gt: finita ? Number(trasferta.score) : null,
      // Neutro: finali e partite in campo neutro (il vantaggio casa non vale).
      neutro: c?.neutralSite === true,
      stato,
    });
  }
  return out;
}

export function giorniDiCoppa(da, a) {
  const out = [];
  for (let t = Date.parse(`${da}T12:00:00Z`); t <= Date.parse(`${a}T12:00:00Z`); t += GIORNO) {
    const d = new Date(t).getUTCDay();
    if (d >= 2 && d <= 4) out.push(iso(t));
  }
  return out;
}

export async function aggiornaStoricoCoppe({ dirData, adesso, fetch: f, parallele = 6 }) {
  const file = path.join(dirData, 'storico', 'coppe-europee.json');
  let vecchio = { partite: [] };
  try { vecchio = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primo giro */ }
  const oggi = iso(adesso.getTime());
  const ultima = vecchio.partite.map((p) => p.data).sort().at(-1);
  const da = ultima ? iso(Date.parse(`${ultima}T12:00:00Z`) - 10 * GIORNO) : INIZIO;
  const lavori = giorniDiCoppa(da, iso(adesso.getTime() + 2 * GIORNO)).flatMap((g) => Object.keys(COPPE).map((s) => [s, g]));
  const nuove = new Map(vecchio.partite.map((p) => [p.id, p]));
  const errori = [];
  let i = 0;
  async function lavoratore() {
    while (i < lavori.length) {
      const [s, g] = lavori[i++];
      try {
        const r = await scarica(`${BASE}/${s}/scoreboard?dates=${g.replaceAll('-', '')}`, f ? { fetch: f } : {});
        for (const p of partiteDaScoreboard(JSON.parse(r.testo), COPPE[s])) nuove.set(p.id, p);
      } catch (e) {
        errori.push(`${s} ${g}: ${e?.message ?? e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: parallele }, lavoratore));
  const partite = [...nuove.values()].sort((a, b) => (a.inizio < b.inizio ? -1 : a.inizio > b.inizio ? 1 : 0));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ aggiornatoAlle: adesso.toISOString(), partite })}\n`);
  return { partite: partite.length, giocate: partite.filter((p) => p.gc !== null).length, richieste: lavori.length, errori, oggi };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  aggiornaStoricoCoppe({ dirData: 'data', adesso: new Date() }).then((r) => {
    console.log(`Coppe europee: ${r.partite} partite (${r.giocate} con risultato), ${r.richieste} richieste, ${r.errori.length} errori`);
    for (const e of r.errori.slice(0, 10)) console.log(`- ${e}`);
  }).catch((e) => console.error(`Storico coppe non aggiornato: ${e?.message ?? e}`));
}
