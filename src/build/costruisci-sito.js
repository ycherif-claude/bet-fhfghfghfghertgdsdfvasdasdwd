import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { selezionaGiocate } from '../regole/selezione.js';
import { probValida } from '../regole/value.js';
import { statoBankroll } from '../bankroll/bankroll.js';
import { giornataDi } from '../bankroll/settimana.js';
import { riepiloga } from '../storico/riepiloghi.js';

const cent = (n) => Math.round(n * 100) / 100;

// Legge ogni file .json della cartella. Un file illeggibile non ferma la build:
// finisce in `errori` ({ file, errore }) e viene saltato.
function leggiJson(dirData, sotto, errori) {
  const cartella = path.join(dirData, sotto);
  if (!fs.existsSync(cartella)) return [];
  const letti = [];
  for (const nome of fs.readdirSync(cartella).filter((f) => f.endsWith('.json')).sort()) {
    const file = `${sotto}/${nome}`;
    try {
      const contenuto = JSON.parse(fs.readFileSync(path.join(cartella, nome), 'utf8'));
      if (!contenuto || typeof contenuto !== 'object' || Array.isArray(contenuto)) throw new Error('il file non contiene un oggetto');
      letti.push({ file, contenuto });
    } catch (e) {
      errori.push({ file, errore: e instanceof SyntaxError ? `JSON non valido (${e.message})` : e.message });
    }
  }
  return letti;
}

const istanteValido = (iso) => typeof iso === 'string' && Number.isFinite(Date.parse(iso));

// Motivo per cui una giocata non è utilizzabile, oppure null.
function erroreGiocata(g) {
  if (!g || typeof g !== 'object') return 'giocata non valida';
  if (typeof g.id !== 'string' || g.id === '') return 'giocata senza id';
  if (!istanteValido(g.inizio)) return `giocata ${g.id}: inizio non valido`;
  if (!probValida(g.prob)) return `giocata ${g.id}: probabilità non valida`;
  if (!Number.isFinite(g.puntata?.euro) || g.puntata.euro < 0) return `giocata ${g.id}: puntata non valida`;
  return null;
}

// Motivo per cui una segnatura non è utilizzabile, oppure null.
function erroreSegnatura(s) {
  if (typeof s.idGiocata !== 'string' || s.idGiocata === '') return 'segnatura senza idGiocata';
  if (typeof s.fatta !== 'boolean') return 'campo fatta non valido';
  if (!istanteValido(s.ora)) return 'ora non valida';
  if (s.fatta) {
    if (!Number.isFinite(s.puntataReale) || s.puntataReale <= 0) return 'puntata reale non valida';
    if (!Number.isFinite(s.quotaReale) || s.quotaReale <= 1) return 'quota reale non valida';
  }
  return null;
}

function ultimeSegnature(segnature) {
  const ultima = new Map();
  for (const s of segnature) {
    const prec = ultima.get(s.idGiocata);
    if (!prec || Date.parse(s.ora) >= Date.parse(prec.ora)) ultima.set(s.idGiocata, s);
  }
  return ultima;
}

// Un punto per giornata con almeno una giocata fatta e chiusa.
function calcolaAndamento(righe) {
  const perGiorno = new Map();
  for (const { giocata, segnatura } of righe) {
    if (!giocata.esito || !segnatura?.fatta) continue;
    const giorno = giornataDi(new Date(giocata.inizio));
    const { puntataReale: p, quotaReale: q } = segnatura;
    const profitto = giocata.esito === 'vinta' ? p * (q - 1) : giocata.esito === 'persa' ? -p : 0;
    perGiorno.set(giorno, (perGiorno.get(giorno) ?? 0) + profitto);
  }
  let bankroll = CONFIG.bankrollIniziale;
  return [...perGiorno.keys()].sort().map((data) => {
    bankroll += perGiorno.get(data);
    return { data, bankroll: cent(bankroll) };
  });
}

export function costruisciDati(dirData, adesso) {
  const erroriDati = [];
  const errore = (file, testo) => erroriDati.push({ file, errore: testo });

  const giornate = [];
  for (const { file, contenuto: g } of leggiJson(dirData, 'giornate', erroriDati)) {
    if (typeof g.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(g.data)) { errore(file, 'campo data mancante o non valido'); continue; }
    giornate.push({ file, g });
  }
  const segnature = [];
  for (const { file, contenuto: sig } of leggiJson(dirData, 'segnature', erroriDati)) {
    const motivo = erroreSegnatura(sig);
    if (motivo) { errore(file, motivo); continue; }
    segnature.push({ file, sig });
  }
  const tutteSegnature = segnature.map((x) => x.sig);

  // Solo le giocate valide; le altre finiscono in erroriDati.
  const giocateValide = ({ file, g }) => (g.giocate ?? []).filter((x) => {
    const motivo = erroreGiocata(x);
    if (motivo) errore(file, motivo);
    return !motivo;
  });

  const data = giornataDi(adesso);
  const oggiV = giornate.find((x) => x.g.data === data) ?? null;
  const altre = giornate.filter((x) => x !== oggiV);
  for (const x of altre) {
    if (!Array.isArray(x.g.giocate)) {
      errore(x.file, `Giornata ${x.g.data} senza giocate: il giro del mattino deve scriverle`);
      x.g = { ...x.g, giocate: [] };
    }
  }
  const giocateAltre = altre.flatMap(giocateValide);

  // La selezione in memoria è solo un ripiego di visualizzazione per oggi:
  // il giro del mattino deve scrivere "giocate" e "scartate" nel file.
  let giornataOggi = null;
  if (oggiV) {
    let g = oggiV.g;
    if (!Array.isArray(g.giocate)) {
      if ('giocate' in g) errore(oggiV.file, 'campo giocate non valido');
      let candidati = g.candidati ?? [];
      if (!Array.isArray(candidati)) { errore(oggiV.file, 'campo candidati non valido'); candidati = []; }
      const stato = statoBankroll(giocateAltre, tutteSegnature, adesso);
      g = { ...g, ...selezionaGiocate(candidati, stato) };
    }
    giornataOggi = { ...g, giocate: giocateValide({ file: oggiV.file, g }) };
  }

  const tutte = [...giocateAltre, ...(giornataOggi?.giocate ?? [])];
  const ids = new Set(tutte.map((g) => g.id));
  for (const { file, sig } of segnature) {
    if (!ids.has(sig.idGiocata)) errore(file, `Segnatura senza giocata: ${sig.idGiocata}`);
  }
  const ultime = ultimeSegnature(tutteSegnature);
  const righe = tutte
    .map((giocata) => ({ giocata, segnatura: ultime.get(giocata.id) ?? null }))
    .sort((a, b) => Date.parse(b.giocata.inizio) - Date.parse(a.giocata.inizio));

  const per = (vista) => ({
    sport: riepiloga(righe, 'sport', vista),
    tipo: riepiloga(righe, 'tipo', vista),
    mercato: riepiloga(righe, 'mercato', vista),
    quotaDaVerificare: riepiloga(righe, 'quotaDaVerificare', vista),
  });

  return {
    generatoAlle: adesso.toISOString(),
    oggi: { data, disponibile: giornataOggi !== null, giornata: giornataOggi },
    bankroll: statoBankroll(tutte, tutteSegnature, adesso),
    storico: { righe, riepiloghi: { fatte: per('fatte'), proposte: per('proposte') }, andamento: calcolaAndamento(righe) },
    segnature: tutteSegnature,
    erroriDati,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dati = costruisciDati(path.join(radice, 'data'), new Date());
  fs.mkdirSync(path.join(radice, 'site'), { recursive: true });
  fs.writeFileSync(path.join(radice, 'site', 'dati.json'), JSON.stringify(dati, null, 2) + '\n');
  console.log('site/dati.json scritto');
}
