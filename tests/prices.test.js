import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHoldingsTable, cleanTicker, looksLikePublishedCsv, fetchAllPrices } from '../www/js/prices.js';

const etfCsv = `Ticker,Name,Exchange,Price,Change,Units,Value
ASX:VAS,Vanguard Aus,ASX,$112.30,0.1%,40,"$4,492.00"
ASX:VGS,Vanguard Intl,ASX,$152.60,0.2%,30,"$4,578.00"
,,,,,,
Date,Ticker,Units,Price,,,
2022-03-14,VAS,25,92.10,,,`;

test('ETFs: reads only the top table and strips exchange prefixes', () => {
  const rows = parseHoldingsTable(etfCsv, 'etf');
  assert.deepEqual(rows.map((r) => r.ticker), ['VAS', 'VGS']);
  assert.equal(rows[0].units, 40);
  assert.equal(rows[0].value, 4492);
  assert.ok(Math.abs(rows[0].price - 112.3) < 1e-9);
});

test('Stocks: price D, units G, value H', () => {
  const csv = 'T,N,X,Price,a,b,Units,Value\nASX:CBA,Commbank,ASX,166.80,,,50,8340\n\nhistory,,,,,,,';
  const [r] = parseHoldingsTable(csv, 'stock');
  assert.equal(r.ticker, 'CBA'); assert.equal(r.units, 50); assert.equal(r.price, 166.8);
});

test('Crypto: uses value / units when the shown price rounds to $0.00', () => {
  const csv = 'Ticker,Price,x,Units,Value\nCOIN:SHIB,$0.00,,1000000,$25.40\nBTC,"$161,500.00",,0.12,"$19,380.00"';
  const rows = parseHoldingsTable(csv, 'crypto');
  assert.ok(Math.abs(rows[0].price - 0.0000254) < 1e-12);
  assert.ok(Math.abs(rows[1].price - 161500) < 1e-6);
});

test('Falls back to the price column when units or value are missing', () => {
  const [r] = parseHoldingsTable('T,Price\nETH,3150,,,', 'crypto');
  assert.equal(r.price, 3150);
});

test('cleanTicker and link check', () => {
  assert.equal(cleanTicker(' asx:ndq '), 'NDQ');
  assert.ok(looksLikePublishedCsv('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv'));
  assert.ok(!looksLikePublishedCsv('https://docs.google.com/spreadsheets/d/abc/edit#gid=0'));
  assert.ok(!looksLikePublishedCsv('http://evil.example/pub?output=csv'));
});

test('fetchAllPrices: first tab wins, errors are reported per tab', async () => {
  const fake = async (url) => {
    if (url === 'e') return new Response(etfCsv);
    if (url === 'h') return new Response('<!DOCTYPE html><html></html>');
    throw new TypeError('Failed to fetch');
  };
  const { found, errors, tabs } = await fetchAllPrices({ etf: 'e', stock: 'h', crypto: 'x' }, fake);
  assert.equal(tabs, 3);
  assert.deepEqual(Object.keys(found).sort(), ['VAS', 'VGS']);
  assert.deepEqual(errors.map((e) => [e.kind, e.code]).sort(), [['crypto', 'network'], ['stock', 'not_csv']]);
});
