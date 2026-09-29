import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

// Run with the local Vite app on port 5173. Scores are illustrative QA data,
// not a transcription of the source report's individual attribute grades.
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => originalFetch(new URL(url, 'http://127.0.0.1:5173'), options);
try {
  const { buildVectorReportPdfSet, buildCombinedReportPdf } = await server.ssrLoadModule('/src/lib/pdfReport.js');
  const { initializeSamples } = await server.ssrLoadModule('/src/lib/cupping.js');
  const [sample] = initializeSamples(1);
  Object.assign(sample, { ositoId: '273.26', lotName: 'POÇOS DE CALDAS (BLUESTONE LANE #5)', processing: 'Natural', waterActivity: '.61', moisture: '11.0' });
  for (const key of Object.keys(sample.scores)) if (!['aroma', 'defects', 'correction'].includes(key)) sample.scores[key] = 8.5;
  sample.scores.fragrance = 8.25;
  sample.scores.flavor = 8.25;
  sample.notes = { fragAromaTags: ['Red Fruit', 'Slight Plum', 'Slight Citrus', 'Chocolate'], inCupTags: ['Citrus', 'Slight Melon', 'Good Sweetness', 'Balanced', 'Red Fruit'], negativeTags: [], acidityLevel: 'Med', sweetnessLevel: 'Med', otherText: '' };
  await mkdir('/tmp/cupping-report-qa', { recursive: true });
  for (const language of ['en', 'es', 'pt-BR']) {
    const result = await buildVectorReportPdfSet([sample], { language, sessionStartTime: '6/25/2026, 11:38:37 AM', logoSrc: '/my-cupping-appV2/assets/hands.png' });
    await writeFile(`/tmp/cupping-report-qa/report-${language}.pdf`, result.files[0].data);
    console.log(language, (await PDFDocument.load(result.files[0].data)).getPageCount(), 'page(s)');
  }
  sample.notes.otherText = 'Long observation preserved in full. '.repeat(250) + 'END OF OBSERVATIONS';
  const dense = await buildVectorReportPdfSet([sample], { language: 'es' });
  await writeFile('/tmp/cupping-report-qa/overflow.pdf', dense.files[0].data);
  console.log('overflow', (await PDFDocument.load(dense.files[0].data)).getPageCount(), 'pages');
  const reviews = [
    { fragAromaTags: ['Dried Banana', 'Grain', 'Cocoa'], inCupTags: ['Terracotta', 'Brown, Roast', 'Phosphoric', 'Herbal'], negativeTags: ['Potato', 'Ashy', 'Age'], acidityLevel: 'Med', sweetnessLevel: 'Med+', otherText: '' },
    { fragAromaTags: ['Raspberry', 'Molasses'], inCupTags: ['Caramel', 'Almond', 'Peanuts'], negativeTags: [], acidityLevel: 'Med', sweetnessLevel: 'Med+', otherText: '' }
  ].map((notes,i) => ({...sample, ositoId: `DESIGN ${i+1}`, lotName: 'Layout review - illustrative scores', notes}));
  const output = process.argv[2] || '/tmp/cupping-report-qa/output/pdf';
  await mkdir(output, {recursive:true});
  await writeFile(`${output}/wheel-layout-review.pdf`, await buildCombinedReportPdf(reviews, {sessionStartTime:'September 28, 2026', logoSrc:'/my-cupping-appV2/assets/hands.png'}));
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
