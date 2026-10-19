import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiCsv } from '../../src/calcio/csv.js';

test('leggiCsv con BOM e virgolette', () =>
  assert.deepEqual(leggiCsv('\uFEFFDiv,HomeTeam\nE0,"Brighton, Hove"\n'), [{ Div: 'E0', HomeTeam: 'Brighton, Hove' }]));
test('leggiCsv: campi vuoti, CRLF e virgolette doppie escape', () =>
  assert.deepEqual(leggiCsv('a,b,c\r\n1,,"x ""y"""\r\n'), [{ a: '1', b: '', c: 'x "y"' }]));
