import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inizioSettimana } from '../../src/bankroll/settimana.js';

test('domenica 25/10/2026 23:30 Roma (giorno del cambio ora) appartiene alla settimana del 19/10', () =>
  assert.equal(inizioSettimana(new Date('2026-10-25T22:30:00Z')), '2026-10-19'));
test('lunedì 26/10 01:30 Roma appartiene alla settimana del 26/10', () =>
  assert.equal(inizioSettimana(new Date('2026-10-26T00:30:00Z')), '2026-10-26'));
test('un lunedì restituisce se stesso', () =>
  assert.equal(inizioSettimana(new Date('2026-10-19T10:00:00Z')), '2026-10-19'));
