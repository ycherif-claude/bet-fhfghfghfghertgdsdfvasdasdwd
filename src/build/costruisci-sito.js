import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { selezionaGiocate } from '../regole/selezione.js';
import { probValida } from '../regole/value.js';
import { statoBankroll, giocateConProva } from '../bankroll/bankroll.js';
import { giornataDi } from '../bankroll/settimana.js';
import { riepiloga } from '../storico/riepiloghi.js';
import { bilancioPronostici } from '../regole/pronostici.js';
import { bigliettiGiornata, profittoReale } from '../storico/biglietti.js';
import { MODI, bilancioCoppie } from '../regole/coppie-quota2.js';
import { chiusuraPartite, confrontoModello, guadagnoBookmaker, storicoMercati } from '../regole/mercati-partite.js';

const cent = (n) => Math.round(n * 100) / 100;

// Legge ogni file .json della cartella. Un file illeggibile non ferma la build:
// finisce in `errori` ({ file, errore }) e viene saltato.
export function leggiJson(dirData, sotto, errori) {
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
export function erroreGiocata(g) {
  if (!g || typeof g !== 'object') return 'giocata non valida';
  if (typeof g.id !== 'string' || g.id === '') return 'giocata senza id';
  if (!istanteValido(g.inizio)) return `giocata ${g.id}: inizio non valido`;
  if (!probValida(g.prob)) return `giocata ${g.id}: probabilità non valida`;
  if (!Number.isFinite(g.puntata?.euro) || g.puntata.euro < 0) return `giocata ${g.id}: puntata non valida`;
  return null;
}

// Motivo per cui una segnatura non è utilizzabile, oppure null.
export function erroreSegnatura(s) {
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

// Saldo da 0 [utente, 29/10/2026]: un punto per giornata (da CONFIG.inizioConti) con almeno una giocata fatta e chiusa.
function calcolaAndamento(righe) {
  const perGiorno = new Map();
  for (const { giocata, segnatura } of righe) {
    if (!giocata.esito || !segnatura?.fatta || giocata.prova === true) continue;
    const giorno = giornataDi(new Date(giocata.inizio));
    if (giorno < CONFIG.inizioConti) continue;
    perGiorno.set(giorno, (perGiorno.get(giorno) ?? 0) + profittoReale(giocata, segnatura));
  }
  let saldo = 0;
  return [...perGiorno.keys()].sort().map((data) => {
    saldo += perGiorno.get(data);
    return { data, saldo: cent(saldo) };
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

  // Solo le giocate valide; le altre finiscono in erroriDati. Giornata di prova: tutte le giocate di prova.
  const giocateValide = ({ file, g }) => giocateConProva(g, g.giocate ?? []).filter((x) => {
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

  // Coppie e multiple che l'utente gioca davvero: righe da segnare come le giocate (mai "da segnare").
  const biglietti = giornate.flatMap((x) => bigliettiGiornata(x.g)).filter((b) => b.inizio);
  const tutte = [...giocateAltre, ...(giornataOggi?.giocate ?? []), ...biglietti];
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
    // Il bookmaker esiste solo per le giocate fatte davvero.
    ...(vista === 'fatte' ? { bookmaker: riepiloga(righe, 'bookmaker', vista) } : {}),
  });

  // Bilancio dei pronostici dell'ultima giornata passata che ne ha (i pronostici si chiudono il giorno dopo).
  const conPronostici = altre.filter((x) => x.g.data < data && Array.isArray(x.g.pronostici) && x.g.pronostici.length)
    .sort((a, b) => a.g.data.localeCompare(b.g.data)).at(-1);

  return {
    generatoAlle: adesso.toISOString(),
    oggi: { data, disponibile: giornataOggi !== null, giornata: giornataOggi },
    bankroll: statoBankroll(tutte, tutteSegnature, adesso),
    inizioConti: CONFIG.inizioConti,
    storico: { righe, riepiloghi: { fatte: per('fatte'), proposte: per('proposte') }, andamento: calcolaAndamento(righe) },
    segnature: tutteSegnature,
    bilancioPronostici: conPronostici ? { data: conPronostici.g.data, ...bilancioPronostici(conPronostici.g) } : null,
    // Coppie a quota 2 dall'inizio: i due modi a confronto (1 € a coppia).
    bilancioCoppie: Object.fromEntries(MODI.map((k) => [k, bilancioCoppie(giornate.map((x) => x.g), k)])),
    // Mercati delle partite di multiple bonus e coppie: vinte, quota media e guadagno a 1 € per mercato.
    storicoMercati: storicoMercati(giornate.map((x) => x.g)),
    // Modello contro mercato sulle stesse partite (dal 30/10/2026).
    confrontoModello: confrontoModello(giornate.map((x) => x.g)),
    // Quota di chiusura delle partite di coppie e multiple (dal 30/10/2026).
    chiusura: chiusuraPartite(giornate.map((x) => x.g)),
    // Quanto paga in più il bookmaker migliore sulle coppie mostrate (dal 30/10/2026).
    bookmakerMigliore: guadagnoBookmaker(giornate.map((x) => x.g)),
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
