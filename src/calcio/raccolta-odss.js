// Raccolta mattutina delle quote dei bookmaker italiani (odss-api.com): data/raccolta/<data>-odss.json, che il
// giro del mattino legge da solo. Gira su GitHub nella raccolta (solo questo step riceve ODSS_API_KEY).
// Uso: node src/calcio/raccolta-odss.js [--data AAAA-MM-GG]
// La chiave non viene mai stampata: i log delle Action sono pubblici.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataRoma } from './testo.js';
import { eseguiRaccoltaOdss } from './odss.js';

async function principale() {
  const i = process.argv.indexOf('--data');
  const adesso = new Date();
  const data = i > -1 ? process.argv[i + 1] : dataRoma(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? '')) {
    console.error('Uso: node src/calcio/raccolta-odss.js [--data AAAA-MM-GG]');
    process.exit(1);
  }
  const r = await eseguiRaccoltaOdss({ dirData: path.resolve('data'), data, adesso, chiave: process.env.ODSS_API_KEY });
  const f = r.file;
  console.log(`Quote odss-api ${data}: ${f.eventi.length} partite, ${r.richieste} richieste, rimaste ${r.stato.rimaste ?? 'sconosciute'}, usate in questa giornata ${r.stato.giornate?.[Object.keys(r.stato.giornate ?? {}).sort().at(-1)]?.usate ?? 0}${r.tenuto ? ' (file di oggi già buono: non sostituito)' : ''}`);
  for (const e of f.erroriGiro) console.log(`- ${e}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principale().catch((e) => {
    // Il messaggio non contiene mai la chiave (è solo nell'intestazione della richiesta).
    console.error(`Raccolta odss-api fallita: ${String(e?.message ?? e).replaceAll(process.env.ODSS_API_KEY || '\u0000', '***')}`);
    process.exit(1);
  });
}
