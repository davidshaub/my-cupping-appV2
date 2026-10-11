import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { initializeSamples } from '../src/lib/cupping.js';
import { normalizeSessionIdentity } from '../src/lib/googleSheets.js';

let rows, backups = [], logs = [], filterWidth, writes = 0;
const sheet = {
  getSheetId: () => 58722764,
  getLastColumn: () => rows[0].length,
  getMaxRows: () => rows.length + 100,
  getParent: () => ({}),
  copyTo: () => {
    backups.push(structuredClone(rows));
    return { setName() {}, getName: () => 'Backup' };
  },
  getFilter: () => ({
    getRange: () => ({ getRow: () => 1, getColumn: () => 1, getNumColumns: () => 2, getNumRows: () => rows.length }),
    getColumnFilterCriteria: col => col === 2 ? 'criterion' : null,
    remove() {},
  }),
  getDataRange: () => ({ getValues: () => structuredClone(rows), getFormulas: () => rows.map(row => row.map(() => '')) }),
  getRange: (r, c, n, width) => ({
    createFilter: () => {
      filterWidth = width;
      return { setColumnFilterCriteria: (col, criterion) => { assert.equal(col, 2); assert.equal(criterion, 'criterion'); } };
    },
    setValues: values => {
      assert.ok(backups.length, 'Backup must precede writes');
      writes++;
      values.forEach((row, i) => { rows[r - 1 + i] = [...row]; });
    },
  }),
};
const runtime = vm.createContext({
  SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }), flush() {} },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  console: { log: value => logs.push(JSON.parse(value)) },
});
vm.runInContext(await readFile('server/google-apps-script.gs', 'utf8'), runtime);
const session = normalizeSessionIdentity({ id: 1, name: 'Repair QA', samples: initializeSamples(2) });
session.sessionCode = 'Z598-9J6R';
session.samples[0].lotName = 'First';
session.samples[1].lotName = 'Second';
const values = session.samples.map((sample, i) => runtime.valuesForSample_(session, sample, i));
const headers = Object.keys(values[0]);
rows = [headers, ...values.map(value => headers.map(header => value[header]))];
const coffee = headers.indexOf('Coffee');
[rows[1][coffee], rows[2][coffee]] = [rows[2][coffee], rows[1][coffee]];
runtime.repairCuppingSheet();
assert.equal(rows[1][coffee], 'First');
assert.equal(rows[2][coffee], 'Second');
assert.equal(backups[0][1][coffee], 'Second');
assert.equal(filterWidth, headers.length);
const valid = structuredClone(rows);
rows[1][headers.indexOf('Sample ID')] = 'wrong-identity';
const beforeWrites = writes, beforeBackups = backups.length;
assert.throws(() => runtime.repairCuppingSheet(), /Identity mismatch/);
assert.equal(writes, beforeWrites);
assert.equal(backups.length, beforeBackups);
rows = structuredClone(valid);
// Legacy snapshots with no recoverable visible ordering fall back to original numbering.
rows.slice(1).forEach(row => {
  const col = headers.indexOf('App Data'), entry = JSON.parse(row[col]);
  delete entry.position;
  row[col] = JSON.stringify(entry);
  row[coffee] = 'Displaced';
});
runtime.repairCuppingSheet();
assert.deepEqual(logs.at(-1).originalNumberingRestoredFor, ['Repair QA']);

if (process.argv[2]) {
  // Read-only diagnostic fixture; no network calls or writes to the real sheet.
  rows = JSON.parse(execFileSync('python3', ['-c', 'import csv,json,sys; print(json.dumps(list(csv.reader(open(sys.argv[1])))))', process.argv[2]], { encoding: 'utf8' }));
  const count = rows.length;
  runtime.repairCuppingSheet();
  assert.equal(rows.length, count);
  const codeCol = rows[0].indexOf('Session Code');
  const target = rows.slice(1).filter(row => row[codeCol] === 'Z598-9J6R');
  assert.equal(target.length, 9);
  const positionCol = rows[0].indexOf('Table Position');
  const idCol = rows[0].indexOf('Osito ID/REF#');
  assert.deepEqual(target.sort((a, b) => a[positionCol] - b[positionCol]).map(row => row[idCol]), ['528.26', '529.26', '530.26', '531.26', '532.26', '533.26', '534.26', '535.26', '75.26']);
  console.log('Snapshot repair:', JSON.stringify(logs.at(-1)));
}
console.log('Passed: backup before writes, identity validation, filter expansion, legacy fallback, and visible data restoration.');
