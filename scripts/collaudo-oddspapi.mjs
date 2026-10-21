// Collaudo di OddsPapi per la pallavolo (Fase 4d §7): stampa copertura, mercati e conteggio delle richieste.
// Usa circa 5 richieste del piano gratuito. Non stampa mai la chiave né i dati del conto
// (email e altro): il repository è pubblico e i log delle Actions lo sono anche loro.
const BASE = 'https://api.oddspapi.io/v4';
const chiave = process.env.ODDSPAPI_API_KEY;
if (!chiave) { console.log('Manca ODDSPAPI_API_KEY'); process.exit(1); }
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const pulisci = (t) => String(t).replaceAll(chiave, '***');

async function chiama(percorso, parametri = {}) {
  const url = `${BASE}/${percorso}?${new URLSearchParams({ ...parametri, apiKey: chiave })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const testo = await r.text();
  const intestazioni = [...r.headers].filter(([k]) => /limit|remain|quota|request|retry/i.test(k));
  console.log(`\n### ${percorso} ${JSON.stringify(parametri)} → HTTP ${r.status} ${JSON.stringify(intestazioni)}`);
  try { return JSON.parse(testo); } catch { console.log(pulisci(testo.slice(0, 500))); return null; }
}
const breve = (x, n = 1500) => pulisci(JSON.stringify(x)).slice(0, n);

// Del conto si stampano solo i contatori delle richieste.
const contatori = (j) => JSON.stringify(j ?? {}).match(/"request_(limit|count)":\d+/g) ?? 'contatori non trovati';
console.log('Richieste:', contatori(await chiama('account')));
const sport = await chiama('sports');
const voll = (sport ?? []).filter((s) => /volley/i.test(JSON.stringify(s)));
console.log('Sport pallavolo:', breve(voll));
const sportId = voll.find((s) => !/beach/i.test(JSON.stringify(s)))?.sportId ?? voll[0]?.sportId;
if (!sportId) process.exit(0);
await pausa(1500);
const tornei = await chiama('tournaments', { sportId });
for (const t of tornei ?? []) console.log(`torneo ${t.tournamentId} | ${t.categoryName} | ${t.tournamentName} | ${breve({ ...t, tournamentId: undefined, tournamentName: undefined, categoryName: undefined }, 300)}`);
await pausa(1500);
const mercati = await chiama('markets', { sportId });
const lista = Array.isArray(mercati) ? mercati : mercati?.markets ?? [];
console.log(`Mercati: ${lista.length}`);
for (const m of lista.slice(0, 80)) console.log(breve(m, 400));
await pausa(2500);
const da = new Date();
const a = new Date(da.getTime() + 47 * 3600 * 1000);
const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const partite = await chiama('fixtures', { sportId, from: iso(da), to: iso(a), hasOdds: 'true' });
console.log(`Partite con quote nelle prossime 47 ore: ${(partite ?? []).length}`);
for (const p of (partite ?? []).slice(0, 40)) console.log(`${p.fixtureId} | ${p.startTime} | ${p.tournamentId} ${p.categoryName} ${p.tournamentName} | ${p.participant1Name} - ${p.participant2Name} | ${p.statusName}`);
const scelta = (partite ?? []).find((p) => /italy|poland|turkey|germany|europe|international/i.test(`${p.categoryName}`)) ?? partite?.[0];
if (scelta) {
  await pausa(1000);
  const quote = await chiama('odds', { fixtureId: scelta.fixtureId, oddsFormat: 'decimal', verbosity: 3 });
  const bk = quote?.bookmakerOdds ?? {};
  console.log(`Quote di ${scelta.participant1Name} - ${scelta.participant2Name}: bookmaker ${Object.keys(bk).join(', ')}`);
  for (const nome of ['pinnacle', 'bet365', ...Object.keys(bk).filter((k) => k !== 'pinnacle' && k !== 'bet365').slice(0, 2)]) {
    const b = bk[nome];
    if (!b) { console.log(`${nome}: assente`); continue; }
    for (const [idM, m] of Object.entries(b.markets ?? {})) {
      const esiti = Object.entries(m.outcomes ?? {}).map(([idO, o]) => `${idO}=${Object.values(o.players ?? {}).map((p) => `${p.price}${p.bookmakerOutcomeId ? `(${p.bookmakerOutcomeId})` : ''}${p.mainLine ? '*' : ''}`).join('/')}`);
      console.log(`${nome} mercato ${idM}: ${esiti.join(' ')}`);
    }
  }
}
console.log('\nFine, richieste:', contatori(await chiama('account')));
