import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSamples, calculateTotal, buildSessionCSV, importSessionFromCSV } from '../src/lib/cupping.js';
import { paintEditorialReport } from '../src/lib/reportDesign.js';

test('No Score overrides only the total and can be reversed without losing data', () => {
  const [sample] = initializeSamples(1);
  sample.notes.negativeTags = ['Potato'];
  sample.notes.otherText = 'Defect in two cups';
  const total = calculateTotal(sample);
  const original = JSON.stringify(sample);
  const marked = { ...sample, noScore: true };
  assert.equal(calculateTotal(marked), '0.00');
  assert.equal(calculateTotal({ ...marked, noScore: false }), total);
  assert.equal(JSON.stringify(sample), original);
  assert.deepEqual(JSON.parse(JSON.stringify(marked)), marked);
});

test('CSV round trips mixed scoring statuses, grades, zero aroma, and notes', () => {
  const samples = initializeSamples(3);
  samples[0].noScore = true;
  samples[0].scores.aroma = 0;
  samples[0].scores.correction = -1;
  samples[0].notes.negativeTags = ['Potato'];
  samples[0].notes.otherText = 'Defect, confirmed\nSecond cup';
  samples[0].ositoId = '145.26';
  samples[1].noScore = true;
  const csv = buildSessionCSV(samples, 'October 2', 'both');
  assert.match(csv, /Scoring Status/);
  const imported = importSessionFromCSV(csv, 'test.csv');
  assert.deepEqual(imported.samples, samples);
  assert.equal(imported.lexiconMode, 'both');
  assert.equal(calculateTotal(imported.samples[0]), '0.00');
});

test('legacy CSVs and blank or unknown status default to scored, never inferred from total', () => {
  const legacy = 'Sample #,Processing,Fragrance,Score\n1,Natural,8.5,0.00';
  const sample = importSessionFromCSV(legacy, 'old.csv').samples[0];
  assert.equal(sample.noScore, false);
  assert.notEqual(calculateTotal(sample), '0.00');
  for (const status of ['', 'Scored', 'unknown']) {
    const csv = `Sample #,Processing,Scoring Status\n1,Natural,${status}`;
    assert.equal(importSessionFromCSV(csv, 'old.csv').samples[0].noScore, false);
  }
  assert.equal(importSessionFromCSV('Sample #,Processing,Scoring Status\n1,Natural, NO SCORE ', 'new.csv').samples[0].noScore, true);
});

test('No Score PDF painter shows the override and notes without a radar polygon', () => {
  const [sample] = initializeSamples(1);
  sample.noScore = true;
  sample.notes.otherText = 'Defect confirmed';
  const text = [];
  let polygons = 0;
  const pdf = {
    text: value => text.push(value), measureText: value => value.length * 4,
    fillRect() {}, strokeRect() {}, line() {}, circle() {}, image() {},
    polygon() { polygons++; }
  };
  paintEditorialReport(pdf, sample, 0);
  assert.ok(text.includes('NO SCORE'));
  assert.ok(text.includes('0.00'));
  assert.ok(text.includes('Defect confirmed'));
  assert.equal(polygons, 0);
});
