// Calcolo giornaliero dell'Elo europeo: storico delle coppe (ESPN), partite dei campionati (CSV di
// football-data.co.uk), squadre ESPN per paese. Scrive data/storico/elo-europeo.json con i punteggi,
// le squadre ESPN riconosciute, i parametri dei gol e la calibrazione dei pronostici sulle coppe passate.
// Uso: node src/coppe/rating.js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMPETIZIONI } from '../calcio/competizioni.js';
import { footballDataUk } from '../calcio/fonti/football-data-uk.js';
import { bloccoEspn, scarica } from '../calcio/fonti/http.js';
import { dataCalendarioRoma, segnalaAvvisiFonti } from '../registro/avvisi-fonti.js';
import { mercatiGol } from '../calcio/modelli/mercati-gol.js';
import { ESITI_CALCIO } from '../taratura/calibrazione.js';
import { aggiornaStoricoCoppe } from './storico.js';
import { ESPN_PAESE, PAESE, idSquadra } from './squadre.js';
import { PARAMETRI, calcolaElo, lambdaCoppa, stimaGol } from './elo.js';

const yy = (n) => String(n % 100).padStart(2, '0');
const DAL = '2021-07-01';
const CAMPIONI_DAL = '2023-07-01';

function stagioniFino(data) {
  const [anno, mese] = data.split('-').map(Number);
  const ultima = mese >= 7 ? anno : anno - 1;
  const out = [];
  for (let a = 2021; a <= ultima; a++) out.push(`${yy(a)}${yy(a + 1)}`);
  return out;
}

export async function partiteNazionali(fonti, data, errori) {
  const out = [];
  for (const c of COMPETIZIONI.filter((x) => x.csv)) {
    const paese = PAESE[c.csv];
    try {
      const righe = c.formato === 'extra'
        ? await fonti.footballDataUk.partiteExtra(c.csv)
        : (await Promise.all(stagioniFino(data).map((s) => fonti.footballDataUk.partite(c.csv, [s]).catch(() => [])))).flat();
      for (const p of righe) {
        if (p.data < DAL || p.data >= data) continue;
        out.push({ data: p.data, inizio: `${p.data}T15:00:00Z`, casa: `${paese}:${p.casa}`, trasferta: `${paese}:${p.trasferta}`, gc: p.gc, gt: p.gt, codice: c.csv });
      }
    } catch (e) {
      errori.push(`football-data.co.uk ${c.csv}: ${e?.message ?? e}`);
    }
  }
  return out;
}

// `stato.bloccato`: ESPN ha risposto 403, ci si ferma subito [correzione C5].
export async function paesiEspn(errori, { fetch: f, stato = {} } = {}) {
  const m = new Map();
  for (const [paese, slugs] of Object.entries(ESPN_PAESE)) {
    for (const s of slugs) {
      if (stato.bloccato) return m;
      try {
        const j = JSON.parse((await scarica(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/teams`, f ? { fetch: f } : {})).testo);
        for (const t of j.sports?.[0]?.leagues?.[0]?.teams ?? []) m.set(String(t.team.id), paese);
      } catch (e) {
        if (bloccoEspn(e)) stato.bloccato = true;
        errori.push(`ESPN squadre ${s}: ${e?.message ?? e}`);
      }
    }
  }
  return m;
}

// Calcolo completo: punteggi, parametri dei gol e calibrazione (fasce di 5 punti) sulle coppe dal 2023/24.
export function calcolaRating({ nazionali, coppe, paeseDiEspn }) {
  const nomiPerPaese = new Map();
  for (const p of nazionali) {
    for (const id of [p.casa, p.trasferta]) {
      const [pa, ...n] = id.split(':');
      if (!nomiPerPaese.has(pa)) nomiPerPaese.set(pa, new Set());
      nomiPerPaese.get(pa).add(n.join(':'));
    }
  }
  for (const [k, v] of nomiPerPaese) nomiPerPaese.set(k, [...v]);
  const ctx = { paeseDiEspn, nomiPerPaese };
  const squadreEspn = {};
  const cup = coppe.map((p) => {
    const casa = idSquadra(p.casa, ctx);
    const trasferta = idSquadra(p.trasferta, ctx);
    squadreEspn[p.casa.id] = casa;
    squadreEspn[p.trasferta.id] = trasferta;
    return { data: p.data, inizio: p.inizio, casa, trasferta, gc: p.gc, gt: p.gt, neutro: p.neutro, coppa: true };
  });
  const tutte = [...nazionali, ...cup].sort((a, b) => (a.inizio < b.inizio ? -1 : a.inizio > b.inizio ? 1 : 0));
  const campioni = [];
  const rating = calcolaElo(tutte, {
    ...PARAMETRI,
    primaDi: (p, delta) => { if (p.coppa && p.gc !== null && p.data >= CAMPIONI_DAL) campioni.push({ delta, gc: p.gc, gt: p.gt }); },
  });
  const gol = stimaGol(campioni);
  const fasce = {};
  for (const c of campioni) {
    const lam = lambdaCoppa(gol, c.delta);
    for (const g of mercatiGol(lam.casa, lam.trasferta, 0.45)) {
      const k = `${g.mercato}|${g.selezione}`;
      if (!ESITI_CALCIO[k] || g.prob < 0.5) continue;
      const f = Math.min(95, Math.floor(g.prob * 20 + 1e-9) * 5);
      const x = ((fasce[k] ??= {})[f] ??= { n: 0, veri: 0 });
      x.n++;
      x.veri += +ESITI_CALCIO[k](c.gc, c.gt);
    }
  }
  const calibrazione = Object.fromEntries(Object.entries(fasce).map(([k, v]) => [k,
    Object.entries(v).map(([da, x]) => ({ da: Number(da) / 100, n: x.n, vera: Math.round((x.veri / x.n) * 10000) / 10000 })).sort((a, b) => a.da - b.da)]));
  return {
    parametri: PARAMETRI, gol, campioni: campioni.length,
    rating: Object.fromEntries([...rating].map(([k, v]) => [k, Math.round(v * 10) / 10])),
    squadreEspn, calibrazione,
  };
}

export async function aggiornaRating({ dirData, adesso, fonti = { footballDataUk }, fetch: f }) {
  const errori = [];
  const storico = await aggiornaStoricoCoppe({ dirData, adesso, fetch: f });
  errori.push(...storico.errori.slice(0, 5));
  const coppe = JSON.parse(fs.readFileSync(path.join(dirData, 'storico', 'coppe-europee.json'), 'utf8')).partite;
  const data = adesso.toISOString().slice(0, 10);
  const nazionali = await partiteNazionali(fonti, data, errori);
  const stato = { bloccato: storico.bloccato === true };
  const paeseDiEspn = await paesiEspn(errori, { fetch: f, stato });
  // ESPN in 403 [correzione C5]: con le squadre ESPN a metà i punteggi sarebbero peggiori di ieri, quindi
  // elo-europeo.json resta quello di ieri e una riga va negli avvisi del giorno (poi fra gli errori del giro).
  if (stato.bloccato || storico.bloccato) {
    const riga = `ESPN ha negato l'accesso (HTTP 403) all'Elo europeo delle coppe: punteggi di ieri, non aggiornati oggi`;
    errori.unshift(riga);
    segnalaAvvisiFonti(dirData, dataCalendarioRoma(adesso), [riga]);
    return { rating: {}, campioni: 0, nazionali: nazionali.length, coppe: coppe.length, errori, nonAggiornato: true };
  }
  const r = calcolaRating({ nazionali, coppe, paeseDiEspn });
  const file = path.join(dirData, 'storico', 'elo-europeo.json');
  fs.writeFileSync(file, `${JSON.stringify({ aggiornatoAlle: adesso.toISOString(), ...r })}\n`);
  return { ...r, nazionali: nazionali.length, coppe: coppe.length, errori };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  aggiornaRating({ dirData: 'data', adesso: new Date() }).then((r) => {
    console.log(`Elo europeo: ${Object.keys(r.rating).length} squadre, ${r.nazionali} partite nazionali, ${r.coppe} di coppa, ${r.campioni} per i gol, ${r.errori.length} errori`);
    for (const e of r.errori.slice(0, 10)) console.log(`- ${e}`);
  }).catch((e) => console.error(`Elo europeo non aggiornato: ${e?.message ?? e}`));
}
