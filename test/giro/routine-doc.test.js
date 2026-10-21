import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('le istruzioni della routine contengono i passi obbligatori', () => {
  const t = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['npm run giro -- --anteprima', '-notizie.json', 'npm run giro', 'npm test', 'git push origin main', '0,08']) assert.ok(t.includes(s), s);
  // Piano B non ancora attivo: nessuna Action legge un ramo delle notizie.
  assert.ok(t.includes('non ancora attivo'));
  assert.ok(!t.includes('claude/notizie-'));
  // git pull subito prima del giro, e l'anteprima con gli id dei candidati.
  assert.ok(t.includes('`git pull` e subito dopo `npm run giro`'));
  assert.ok(t.includes('idCandidato: mercato | selezione'));
});

test('raccolta e riserva: push ripetuto fino a 3 volte, conflitto → rebase annullato e uscita con errore', () => {
  for (const f of ['raccolta.yml', 'riserva.yml']) {
    const t = fs.readFileSync(`.github/workflows/${f}`, 'utf8');
    for (const s of ['for tentativo in 1 2 3', 'git pull --rebase', 'git rebase --abort', 'exit 1', 'sleep']) assert.ok(t.includes(s), `${f}: ${s}`);
  }
});

test('la riserva esegue test, giro di riserva e poi avvia la pubblicazione', () => {
  const t = fs.readFileSync('.github/workflows/riserva.yml', 'utf8');
  for (const s of ["cron: '45 9 * * *'", 'workflow_dispatch', 'npm test', 'npm run giro -- --riserva', 'Giro di riserva', 'git pull --rebase', 'gh workflow run pubblica.yml', 'group: dati']) assert.ok(t.includes(s), s);
});

test('il README spiega chiavi e orari', () => {
  const t = fs.readFileSync('README.md', 'utf8');
  for (const s of ['Calcio: chiavi e giro del mattino', 'ODDS_API_KEY', 'FOOTBALL_DATA_ORG_KEY', 'the-odds-api.com', 'Notizie non controllate', 'fase-2-calcio']) assert.ok(t.includes(s), s);
});

test('la routine spiega da dove copiare i nomi e cosa fare con raccolta vuota', () => {
  const t = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['partite[].mercati[]', 'idCandidato', 'calcio-2026-10-20-inter-roma-1x2-1', 'partiteControllate: []', 'TZ=Europe/Rome date +%F', 'git rebase --abort', 'dentro `fonte`']) assert.ok(t.includes(s), s);
});

test('le istruzioni NBA: mattino e serale contengono i passi obbligatori', () => {
  const m = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['Totale punti', 'Handicap -4.5', '"Questionable"', 'ultimo messaggio della sessione', '<oggi>-nba.json', 'né `<oggi>.json` né `<oggi>-nba.json`', 'nba-2026-10-20-boston-celtics-new-york-knicks-handicap-meno-4-5-casa', '20 ricerche web', 'giro-serale.md']) assert.ok(m.includes(s), s);
  const s = fs.readFileSync('docs/routine/giro-serale.md', 'utf8');
  for (const x of ['npm run serale-nba -- --applica', '-serale-nba.json', '-serale-quote.json', 'git pull', 'npm test', 'git push origin main', "TZ=Europe/Rome date -d '-8 hours' +%F", 'Giro serale <data>', 'confermata', 'modificata', 'annullata', 'delta', 'git rebase --abort', '10 ricerche web']) assert.ok(s.includes(x), x);
});

test('il README spiega chiavi, routine serale, orari e stati delle schede NBA', () => {
  const t = fs.readFileSync('README.md', 'utf8');
  for (const s of ['BALLDONTLIE_API_KEY', 'SPORTSGAMEODDS_API_KEY', 'balldontlie.io', 'sportsgameodds.com', 'ROUTINE_SERALE_URL', 'ROUTINE_SERALE_TOKEN', 'Add another trigger', 'Generate token', 'Giro serale', '22:30', '14:00', 'Confermata', 'Modificata', 'Annullata', 'stessa linea', 'Totale punti']) assert.ok(t.includes(s), s);
});

test('le istruzioni tennis: mattino, serale e README', () => {
  const m = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['<oggi>-tennis.json', 'né `<oggi>.json` né `<oggi>-nba.json` né `<oggi>-tennis.json`', 'Vincente incontro', '0,08', 'Ritiro annunciato', 'tennis-2026-10-20-carlos-alcaraz-jannik-sinner-vincente-incontro-jannik-sinner', 'ordine alfabetico']) assert.ok(m.includes(s), s);
  const s = fs.readFileSync('docs/routine/giro-serale.md', 'utf8');
  for (const x of ['Giro serale (NBA e tennis)', '-serale-tennis.json', '-serale-tennis-notizie.json', 'npm run serale-tennis -- --aggiungi', 'Giro serale <data>', '10 ricerche web', 'già iniziata']) assert.ok(s.includes(x), x);
  assert.ok(!fs.existsSync('docs/routine/giro-serale-nba.md'));
  const r = fs.readFileSync('README.md', 'utf8');
  for (const x of ['Tennis: mercato', 'Vincente incontro', 'rimborsata', 'bet365', 'sera prima', 'Slam', 'Masters 1000']) assert.ok(r.includes(x), x);
});

test('le istruzioni basket: mattino e README', () => {
  const m = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['<oggi>-basket.json', 'né `<oggi>-tennis.json` né `<oggi>-basket.json`', 'basket-2026-10-21-real-madrid-fc-barcelona-vincente-real-madrid', 'solo-pinnacle', '"In dubbio"']) assert.ok(m.includes(s), s);
  const r = fs.readFileSync('README.md', 'utf8');
  for (const s of ['Basket: Eurolega e NBL', 'data/storico/eurolega.json', 'TheSportsDB', '3 crediti', 'solo mercato']) assert.ok(r.includes(s), s);
  const w = fs.readFileSync('.github/workflows/raccolta.yml', 'utf8');
  assert.ok(w.includes('npm run raccolta-basket'));
});

test('le istruzioni pallavolo: mattino, README e workflow', () => {
  const m = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['<oggi>-pallavolo.json', 'né `<oggi>-basket.json` né `<oggi>-pallavolo.json`', 'Handicap set -1.5', 'Totale set 3.5', 'pallavolo-2026-10-21-itas-trentino-rana-verona-handicap-set-meno-1-5-casa']) assert.ok(m.includes(s), s);
  const r = fs.readFileSync('README.md', 'utf8');
  for (const s of ['ODDSPAPI_API_KEY', '250 richieste', 'quota bet365', 'data/stato/oddspapi.json', 'Collaudo OddsPapi pallavolo']) assert.ok(r.includes(s), s);
  const w = fs.readFileSync('.github/workflows/raccolta.yml', 'utf8');
  for (const s of ['npm run raccolta-pallavolo', 'ODDSPAPI_API_KEY: ${{ secrets.ODDSPAPI_API_KEY }}']) assert.ok(w.includes(s), s);
  // Il collaudo non stampa i dati del conto (il repository è pubblico).
  assert.ok(!/console\.log\(breve\(account\)\)/.test(fs.readFileSync('scripts/collaudo-oddspapi.mjs', 'utf8')));
});

test('notifiche Telegram: README e workflow', () => {
  const r = fs.readFileSync('README.md', 'utf8');
  for (const s of ['Notifiche Telegram', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', '@BotFather', 'getUpdates', 'data/stato/telegram.json']) assert.ok(r.includes(s), s);
  const w = fs.readFileSync('.github/workflows/notifiche.yml', 'utf8');
  for (const s of ['npm run notifiche', 'workflow_run', "'Raccolta dati calcio'", "'Giro serale'", 'group: dati', 'for tentativo in 1 2 3', 'git rebase --abort']) assert.ok(w.includes(s), s);
});

test('controlli prima delle partite: routine, README e workflow', () => {
  const c = fs.readFileSync('docs/routine/controllo-pre-partita.md', 'utf8');
  for (const s of ['npm run controlli -- --applica', '-controlli-decisioni.json', 'in_revisione', 'quotaMinima', 'git rebase --abort', '5 ricerche web']) assert.ok(c.includes(s), s);
  const m = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  assert.ok(m.includes('giocatoriChiave'));
  const r = fs.readFileSync('README.md', 'utf8');
  for (const s of ['Controlli prima delle partite', 'ROUTINE_CONTROLLI_URL', 'ROUTINE_CONTROLLI_TOKEN', 'regole fisse']) assert.ok(r.includes(s), s);
  const w = fs.readFileSync('.github/workflows/controlli.yml', 'utf8');
  for (const s of ["cron: '*/10 * * * *'", 'npm run controlli', 'AVVIA_CLAUDE', 'group: dati', 'for tentativo in 1 2 3', 'Controllo pre-partita']) assert.ok(w.includes(s), s);
  assert.ok(fs.readFileSync('.github/workflows/notifiche.yml', 'utf8').includes("'Controlli prima delle partite'"));
});
