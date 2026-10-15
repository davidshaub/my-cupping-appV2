import { buildCombinedReportPdf, createZipBytes, prepareReportAssets } from './pdfReport.js';
import { coffeePdfFilenames, safeFilenamePart } from './reportFilenames.js';
import { aggregateEvaluations, evaluationScore, notesFields } from './collaboration.js';
import HandsLogo from '../../assets/hands.png';

export const preloadCollaborationPdf = () => prepareReportAssets(HandsLogo);
export const collaborationReportSamples = (coffees, panel) => coffees.map(item => {
  const result = aggregateEvaluations(item.evaluations);
  const cuppers = [...new Set(item.evaluations.map(e => e.cupper || 'Unnamed cupper'))];
  return {
    ...item.sample, lotName: item.name || item.sample.lotName, roastId: '',
    reportKind: panel ? 'panel' : 'shared', reportScore: result.score,
    reportAttributesAvailable: Boolean(result.attributes),
    reportAttribution: 'Cupped by ' + cuppers.join(', '),
    reportEvaluations: item.evaluations.map(e => ({ cupper: e.cupper || 'Unnamed cupper', score: evaluationScore(e) })),
    reportPerspectives: panel ? [] : item.evaluations.map(e => ({ title: `${e.cupper || 'Unnamed cupper'} · ${evaluationScore(e) == null ? 'No score' : evaluationScore(e).toFixed(2)}`, text: [...notesFields.map(([key,label]) => `${label}: ${(e.notes?.[key] || []).join(' · ') || 'None.'}`),e.notes?.otherText].filter(Boolean).join('\n') })),
    noScore: result.score == null, scores: result.attributes || {},
    notes: { ...result.notes, otherText: panel ? (item.summary || '').trim() : '' }
  };
});
export async function buildCollaborationPdf({ title, coffees, panel=false }) {
  if (!coffees.length) throw new Error('Add at least one coffee before exporting.');
  return buildCombinedReportPdf(collaborationReportSamples(coffees, panel), { sessionStartTime: title || (panel ? 'Osito Panel Report' : 'Shared Cupping Report'), language: 'en', logoSrc: HandsLogo });
}
export async function buildCollaborationPdfSet(options) {
  if (!options.coffees.length) throw new Error('Add at least one coffee before exporting.');
  const names = coffeePdfFilenames(options.coffees);
  const files = [];
  for (let index = 0; index < options.coffees.length; index++) {
    files.push({ name: names[index], data: await buildCollaborationPdf({ ...options, coffees: [options.coffees[index]] }) });
  }
  return { files, zipBytes: createZipBytes(files), zipFilename: `${safeFilenamePart(options.title, 'Osito_Report')}.zip` };
}
export async function downloadCollaborationPdf(options) {
  const bytes = await buildCollaborationPdf(options);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url;
  a.download = (options.title || 'Osito Report').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 100) + '.pdf';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
