// Banco di prova delle strategie [utente, 07/11/2026]: niente soldi veri finché una strategia non dimostra di battere il
// mercato. Dalle righe del registro (tutto quello che il sistema segue in background) ogni strategia sceglie le sue
// giocate del giorno; per ognuna si misura come è andata (vinte, resa a 1 € a giocata) e soprattutto il valore alla
// chiusura: quota del mattino per probabilità del mercato prima della partita, meno 1. Il valore alla chiusura risente
// poco della fortuna: è positivo solo se al mattino si è presa una quota migliore di quella che il mercato ha poi
// riconosciuto giusta. Una strategia è "pronta" con almeno `minimo` giocate misurate alla chiusura e un valore medio
// di almeno `sogliaPronta`; "in perdita" se con altrettante giocate il valore resta sotto zero.
import fs from 'node:fs';
import path from 'node:path';
import { conta } from './confronto-settimanale.js';
import { scegliLista } from '../regole/coppie-quota2.js';

export const BANCO = { da: '2026-10-23', minimo: 300, sogliaPronta: 0.01 };
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const arrotonda = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;
const valide = (righe) => righe.filter((x) => x && num(x.quota) && x.quota > 1 && num(x.probMercato) && x.probMercato > 0);

// Al massimo una giocata per partita: la migliore per `voto`.
function unaPerPartita(righe, voto) {
  const migliore = new Map();
  for (const x of righe) {
    const c = migliore.get(x.idPartita);
    if (!c || voto(x) > voto(c)) migliore.set(x.idPartita, x);
  }
  return [...migliore.values()];
}
const tra = (x, min, max) => x.quota >= min - 1e-9 && x.quota <= max + 1e-9;

export const STRATEGIE = [
  { id: 'lista', nome: "Lista del giorno: 1 e Over 1.5 di calcio, quota 1,25-1,70, modello e mercato d'accordo", scegli: (r) => scegliLista(r) },
  { id: 'favoriti', nome: 'Favoriti a quota 1,20-1,50, ogni sport e mercato (il più probabile per partita)', scegli: (r) => unaPerPartita(valide(r).filter((x) => tra(x, 1.2, 1.5)), (x) => x.probMercato) },
  { id: 'favoritiBassi', nome: 'Favoriti a quota 1,10-1,25, ogni sport e mercato', scegli: (r) => unaPerPartita(valide(r).filter((x) => tra(x, 1.1, 1.25)), (x) => x.probMercato) },
  { id: 'prezzo', nome: 'Quota media dei bookmaker vicina al prezzo giusto di Pinnacle (entro il 3%)', scegli: (r) => unaPerPartita(valide(r).filter((x) => x.riferimento === 'Pinnacle' && x.quota * x.probMercato >= 0.97), (x) => x.quota * x.probMercato) },
  { id: 'modello', nome: 'Il nostro modello dà almeno 5 punti più del mercato', scegli: (r) => unaPerPartita(valide(r).filter((x) => num(x.probModello) && x.probModello - x.probMercato >= 0.05), (x) => x.probModello - x.probMercato) },
  { id: 'tutto', nome: 'Tutto quello che il sistema segue (per confronto)', scegli: (r) => valide(r) },
];

// Valore alla chiusura delle giocate che hanno la probabilità di prima della partita.
export function valoreChiusura(righe) {
  const misurate = righe.filter((x) => num(x.quota) && num(x.probPrePartita) && x.probPrePartita > 0);
  return {
    giocate: misurate.length,
    valore: misurate.length ? arrotonda(misurate.reduce((a, x) => a + x.quota * x.probPrePartita - 1, 0) / misurate.length, 4) : null,
  };
}

export function statoStrategia(chiusura, B = BANCO) {
  if (chiusura.giocate < B.minimo || chiusura.valore === null) return 'in prova';
  if (chiusura.valore >= B.sogliaPronta) return 'pronta';
  return chiusura.valore < 0 ? 'in perdita' : 'in prova';
}

// `giorni`: [{ data, righe }].
export function bancoProva(giorni, B = BANCO) {
  const scelte = Object.fromEntries(STRATEGIE.map((s) => [s.id, []]));
  for (const { data, righe } of giorni) {
    if (!(data >= B.da) || !Array.isArray(righe)) continue;
    for (const s of STRATEGIE) scelte[s.id].push(...s.scegli(righe));
  }
  const strategie = STRATEGIE.map((s) => {
    const r = scelte[s.id];
    const chiusura = valoreChiusura(r.filter((x) => x.esito === 'vinta' || x.esito === 'persa'));
    return { id: s.id, nome: s.nome, ...conta(r), chiusura, stato: statoStrategia(chiusura, B) };
  });
  return { da: B.da, minimo: B.minimo, sogliaPronta: B.sogliaPronta, giorni: giorni.filter((g) => g.data >= B.da).length, strategie, pronte: strategie.filter((s) => s.stato === 'pronta' && s.id !== 'tutto').map((s) => s.id) };
}

// Registro della sera: data/registro/AAAA-MM-GG.json.
export function leggiRegistro(dirData) {
  const dir = path.join(dirData, 'registro');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().flatMap((f) => {
    try {
      return [{ data: f.slice(0, 10), righe: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).righe ?? [] }];
    } catch {
      return [];
    }
  });
}
