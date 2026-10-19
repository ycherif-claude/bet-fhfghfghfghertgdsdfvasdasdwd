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

import { isoRoma } from '../../src/calcio/testo.js';
test('isoRoma: offset +02:00 in estate e +01:00 in inverno, anche attorno al cambio dell\'ora', () => {
  assert.equal(isoRoma(new Date('2026-10-20T05:35:40Z')), '2026-10-20T07:35:40+02:00');
  assert.equal(isoRoma(new Date('2026-10-25T00:59:59Z')), '2026-10-25T02:59:59+02:00');
  assert.equal(isoRoma(new Date('2026-10-25T01:00:00Z')), '2026-10-25T02:00:00+01:00');
  assert.equal(isoRoma(new Date('2026-12-01T23:30:00Z')), '2026-12-02T00:30:00+01:00');
});
