import { createServer } from 'vite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
 const pathname = new URL(url, 'http://localhost').pathname.replace('/my-cupping-appV2/', '/');
 const bytes = await readFile(path.join(process.cwd(), pathname.startsWith('/node_modules/') ? pathname : 'public' + pathname));
 return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
try {
 const { buildVectorReportPdfSet } = await server.ssrLoadModule('/src/lib/pdfReport.js');
 const { initializeSamples } = await server.ssrLoadModule('/src/lib/cupping.js');
 await mkdir('/tmp/cupping-identity-qa', {recursive:true});
 for (const [key, name, language] of [['example','Sync Test','en'],['long','POÇOS DE CALDAS (BLUESTONE LANE #5)','pt-BR'],['spanish','Sync Test','es'],['wrapped','POÇOS DE CALDAS - BLUESTONE LANE SPECIAL RESERVE COFFEE LOT FROM THE OCTOBER ARRIVAL','en']]) {
  const [sample] = initializeSamples(1);
  Object.assign(sample,{lotName:name,ositoId:'123.45',country:'Yemen',sampleType:'PSS',roastId:'1234',processing:'Washed',waterActivity:'0.50',moisture:'10.5'});
  const result=await buildVectorReportPdfSet([sample],{language,sessionStartTime:'10/8/2026, 11:58 AM'});
  await writeFile(`/tmp/cupping-identity-qa/${key}.pdf`,result.files[0].data);
 }
} finally {globalThis.fetch=originalFetch;await server.close();}
