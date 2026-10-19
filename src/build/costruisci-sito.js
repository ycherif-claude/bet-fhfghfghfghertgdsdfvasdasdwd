import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIG } from '../config.js';
import { selezionaGiocate } from '../regole/selezione.js';
import { statoBankroll } from '../bankroll/bankroll.js';
import { giornataDi } from '../bankroll/settimana.js';
import { riepiloga } from '../storico/riepiloghi.js';

const cent = (n) => Math.round(n * 100) / 100;

function leggiJson(cartella) {
  if (!fs.existsSync(cartella)) return [];
  return fs.readdirSync(cartella).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(cartella, f), 'utf8')));
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
  const giornate = leggiJson(path.join(dirData, 'giornate'));
  const segnature = leggiJson(path.join(dirData, 'segnature'));
  const data = giornataDi(adesso);
  const oggiG = giornate.find((g) => g.data === data) ?? null;
  const altre = giornate.filter((g) => g !== oggiG);

  let giornataOggi = oggiG;
  if (oggiG && !('giocate' in oggiG)) {
    const stato = statoBankroll(altre.flatMap((g) => g.giocate ?? []), segnature, adesso);
    const { giocate, scartate } = selezionaGiocate(oggiG.candidati ?? [], stato);
    giornataOggi = { ...oggiG, giocate, scartate };
  }

  const tutte = [...altre, ...(giornataOggi ? [giornataOggi] : [])].flatMap((g) => g.giocate ?? []);
  const ultime = ultimeSegnature(segnature);
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
    bankroll: statoBankroll(tutte, segnature, adesso),
    storico: { righe, riepiloghi: { fatte: per('fatte'), proposte: per('proposte') }, andamento: calcolaAndamento(righe) },
    segnature,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const dati = costruisciDati(path.join(radice, 'data'), new Date());
  fs.mkdirSync(path.join(radice, 'site'), { recursive: true });
  fs.writeFileSync(path.join(radice, 'site', 'dati.json'), JSON.stringify(dati, null, 2) + '\n');
  console.log('site/dati.json scritto');
}
