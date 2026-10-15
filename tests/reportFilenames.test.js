import test from 'node:test';
import assert from 'node:assert/strict';
import { coffeePdfFilenames, reportPdfFilename, uniquePdfFilename } from '../src/lib/reportFilenames.js';

test('single-coffee downloads use the coffee ID, not the saved-session name', () => {
  assert.equal(reportPdfFilename([{ositoId:'273.26',lotName:'Kebena'}], 'September cupping'), '273.26.pdf');
});

test('single-coffee fallback matches the PDF set convention', () => {
  for (const sample of [{lotName:'Poços de Caldas'}, {}]) {
    assert.equal(reportPdfFilename([sample], 'Session'), uniquePdfFilename(sample, 0, new Map()));
  }
  assert.equal(reportPdfFilename([{lotName:'Poços de Caldas'}]), 'Pocos_de_Caldas.pdf');
  assert.equal(reportPdfFilename([{}]), 'Sample_01.pdf');
});

test('combined reports use the session name and set entries retain unique coffee names', () => {
  assert.equal(reportPdfFilename([{},{}], 'Monday Cupping'), 'Monday_Cupping.pdf');
  const names = new Map();
  assert.equal(uniquePdfFilename({ositoId:'273.26'}, 0, names), '273.26.pdf');
  assert.equal(uniquePdfFilename({ositoId:'273.26'}, 1, names), '273.26_2.pdf');
});

test('aggregate PDF sets use coffee headings and avoid name collisions',()=>{
  assert.deepEqual(coffeePdfFilenames([
    {sample:{ositoId:'273.26',lotName:'La Esperanza'}},
    {name:'Custom Coffee',sample:{lotName:'Original'}},
    {sample:{lotName:'La Esperanza_2'}},
    {sample:{lotName:'La Esperanza'}},
    {sample:{lotName:'LA ESPERANZA'}},
    {sample:{lotName:'Poços / Caldas'}},
    {sample:{}}
  ]),['La_Esperanza.pdf','Custom_Coffee.pdf','La_Esperanza_2.pdf','La_Esperanza_3.pdf','LA_ESPERANZA_4.pdf','Pocos_Caldas.pdf','Coffee_07.pdf']);
});
