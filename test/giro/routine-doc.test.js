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
  for (const s of ['Totale punti', 'Handicap -4.5', 'questionable', 'nba-2026-10-20-boston-celtics-new-york-knicks-handicap-meno-4-5-casa', '20 ricerche web', 'giro-serale-nba.md']) assert.ok(m.includes(s) || m.toLowerCase().includes(s), s);
  const s = fs.readFileSync('docs/routine/giro-serale-nba.md', 'utf8');
  for (const x of ['npm run serale-nba -- --applica', '-serale-nba.json', '-serale-quote.json', 'git pull', 'npm test', 'git push origin main', "TZ=Europe/Rome date -d '-8 hours' +%F", 'Giro serale NBA <data>', 'confermata', 'modificata', 'annullata', 'delta', 'git rebase --abort', '10 ricerche web']) assert.ok(s.includes(x), x);
});

test('il README spiega chiavi, routine serale, orari e stati delle schede NBA', () => {
  const t = fs.readFileSync('README.md', 'utf8');
  for (const s of ['BALLDONTLIE_API_KEY', 'SPORTSGAMEODDS_API_KEY', 'balldontlie.io', 'sportsgameodds.com', 'ROUTINE_SERALE_URL', 'ROUTINE_SERALE_TOKEN', 'Add another trigger', 'Generate token', 'Giro serale NBA', '22:30', '14:00', 'Confermata', 'Modificata', 'Annullata', 'stessa linea', 'Totale punti']) assert.ok(t.includes(s), s);
});
