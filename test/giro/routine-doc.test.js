import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('le istruzioni della routine contengono i passi obbligatori', () => {
  const t = fs.readFileSync('docs/routine/giro-del-mattino.md', 'utf8');
  for (const s of ['npm run giro -- --anteprima', '-notizie.json', 'npm run giro', 'npm test', 'git push origin main', '0,08', 'claude/notizie-']) assert.ok(t.includes(s), s);
});

test('la riserva esegue test, giro di riserva e poi avvia la pubblicazione', () => {
  const t = fs.readFileSync('.github/workflows/riserva.yml', 'utf8');
  for (const s of ["cron: '45 9 * * *'", 'workflow_dispatch', 'npm test', 'npm run giro -- --riserva', 'Giro di riserva', 'git pull --rebase', 'gh workflow run pubblica.yml', 'group: dati']) assert.ok(t.includes(s), s);
});

test('il README spiega chiavi e orari', () => {
  const t = fs.readFileSync('README.md', 'utf8');
  for (const s of ['Calcio: chiavi e giro del mattino', 'ODDS_API_KEY', 'FOOTBALL_DATA_ORG_KEY', 'the-odds-api.com', 'Notizie non controllate', 'fase-2-calcio']) assert.ok(t.includes(s), s);
});
