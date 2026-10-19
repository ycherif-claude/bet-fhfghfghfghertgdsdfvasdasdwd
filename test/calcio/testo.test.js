import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, normalizzaNome, finestraGiornata, dataRoma } from '../../src/calcio/testo.js';

test('slug toglie accenti e simboli', () => assert.equal(slug('Atlético  Madrid!'), 'atletico-madrid'));
test('normalizzaNome toglie i prefissi societari', () => assert.equal(normalizzaNome('AC Milan'), normalizzaNome('Milan')));
test('finestraGiornata attraversa il cambio dell\'ora', () => {
  const { da, a } = finestraGiornata('2026-10-24');
  assert.equal(da.toISOString(), '2026-10-24T06:00:00.000Z');
  assert.equal(a.toISOString(), '2026-10-25T07:00:00.000Z');
});
test('dataRoma alle 07:35 restituisce oggi, non ieri', () =>
  assert.equal(dataRoma(new Date('2026-10-20T05:35:00Z')), '2026-10-20'));
