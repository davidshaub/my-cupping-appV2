import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeSamples} from '../src/lib/cupping.js';
import {writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
for(const width of [390,1024]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  const sample=initializeSamples(1)[0];Object.assign(sample,{lotName:'La Esperanza',ositoId:'488.26',country:'Colombia',processing:'Washed'});sample.notes.fragAromaTags=['Floral','Honey'];sample.notes.inCupTags=['Stone Fruit','Black Tea'];
  let panelLookups=0,savedReport=null;
  let entries=[],invitation={code:'ABCD-EFGH',name:'Supplier cupping',defaultMode:'quick',closed:false,revealed:true},receipts=new Map();
  const secondSample={...initializeSamples(1)[0],lotName:'Second coffee',country:'Brazil'};
  const record={id:sample.syncId,source:'primary',sample,cupper:'David',sessionCode:'ABCD-EFGH',date:'October 15, 2026'};
  const snapshot=()=>({invitation,coffees:[{...sample,hostEvaluation:{...sample,id:'host',mode:'full',cupper:'David'}},secondSample],entries,isHost:true});
  await context.route('https://script.google.com/**',async route=>{
    if(route.request().method()==='POST'){
      const body=JSON.parse(route.request().postData());if(body.protocol!=='collaboration-v1')return route.fulfill({body:'received'});
      let result;
      if(body.action==='submitContribution'){const entry={...body.entry,id:'entry',sampleId:body.sampleId,own:true,revision:1};entries=[entry];result={saved:true,entry};}
      if(body.action==='updateInvitation'){Object.assign(invitation,Object.fromEntries(['closed','revealed','defaultMode','identitiesRevealed'].filter(k=>k in body).map(k=>[k,body[k]])));result={saved:true};}
      if(body.action==='panelLookup'){
        panelLookups++;
        if(body.password!=='C0ff33'){receipts.set(body.requestId,{collaborationError:'Incorrect Panel Report password.'});return route.fulfill({body:'received'});}
        result={evaluations:body.sampleIds?.length||body.sessionCodes?.length?[record]:[],missingSampleIds:[],missingSessionCodes:[]};
      }
      if(body.action==='savePanel'){savedReport=body.panel;result={saved:true,panelId:'edition-id'};}
      if(body.action==='loadPanel'){if(body.panelId!=='edition-id'){receipts.set(body.requestId,{collaborationError:'Panel report not found.'});return route.fulfill({body:'received'});}result={panel:savedReport};}
      receipts.set(body.requestId,{collaboration:result});return route.fulfill({body:'received'});
    }
    const url=new URL(route.request().url()),action=url.searchParams.get('action');
    const result=action==='sharedReport'?snapshot():action==='receipt'?(receipts.get(url.searchParams.get('requestId'))||{pending:true}):{lotCatalog:[]};
    return route.fulfill({contentType:'text/javascript',body:`${url.searchParams.get('callback')}(${JSON.stringify(result)});`});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await context.addInitScript(()=>{localStorage.setItem('osito_invitations',JSON.stringify([{code:'ABCD-EFGH',name:'Supplier cupping',date:'10/15/2026'}]));localStorage.setItem('osito_host_ABCDEFGH','host-test');});
  await page.goto('http://127.0.0.1:5173/my-cupping-appV2/');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('textbox',{name:'Your name'}).fill('María');
  const sharedSearch=page.getByRole('searchbox',{name:'Search shared cuppings'});
  await sharedSearch.fill('488.26');await page.getByRole('button',{name:/Supplier cupping.*La Esperanza/}).waitFor();
  await sharedSearch.fill('no matching coffee');await page.getByText('No shared cuppings match your search.').waitFor();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByRole('button',{name:/Supplier cupping.*La Esperanza/}).waitFor();
  await page.screenshot({path:`/tmp/shared-search-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Back to app'}).click();await page.getByRole('button',{name:'Join a cupping',exact:true}).click();await page.getByRole('textbox',{name:'Invitation code'}).fill('ABCD-EFGH');await page.getByRole('button',{name:'Open cupping',exact:true}).click();
  await page.getByRole('heading',{name:'La Esperanza',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Your name'}).inputValue(),'María');
  await page.getByRole('button',{name:'Coffee 2',exact:true}).click();await page.getByRole('heading',{name:'Second coffee',exact:true}).waitFor();await page.getByRole('button',{name:'Coffee 1',exact:true}).click();
  const search=page.getByPlaceholder(/search|type/i).first();await search.fill('Strawberry');await page.getByRole('button',{name:'Strawberry',exact:true}).click();
  await page.getByRole('radio').nth(1).check();await page.getByText('Strawberry',{exact:true}).waitFor();assert.equal(await page.getByRole('spinbutton',{name:'Fragrance',exact:true}).inputValue(),'8.5');
  await page.getByRole('spinbutton',{name:'Fragrance',exact:true}).fill('9');await page.getByRole('radio').nth(0).check();await page.getByRole('spinbutton',{name:'Final score'}).fill('87');await page.getByPlaceholder('Additional observations.').fill('Peach, honey, and a tea-like finish.');
  await page.getByRole('button',{name:'Submit impressions for this coffee'}).click();await page.getByRole('status').filter({hasText:'saved'}).waitFor();
  await page.getByRole('radio').nth(1).check();assert.equal(await page.getByRole('spinbutton',{name:'Fragrance',exact:true}).inputValue(),'9');await page.getByRole('radio').nth(0).check();assert.equal(await page.getByRole('spinbutton',{name:'Final score'}).inputValue(),'87');
  await page.getByRole('button',{name:'Shared report',exact:true}).click();await page.getByRole('heading',{name:'Flavor profile'}).first().waitFor();
  await page.getByRole('button',{name:'Export PDF',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Open / Print PDF',exact:true}).waitFor();
  const openPopup=page.waitForEvent('popup');await page.getByRole('link',{name:'Open / Print PDF',exact:true}).click();const viewer=await openPopup;await viewer.waitForLoadState('domcontentloaded');await viewer.close();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();const download=await downloadPromise;await download.saveAs(`/tmp/shared-cupping-${width}.pdf`);await page.getByRole('button',{name:'Close PDF export'}).click();
  await page.screenshot({path:`/tmp/shared-cupping-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  invitation.blind=true;invitation.identitiesRevealed=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Your impressions',exact:true}).click();await page.getByRole('heading',{name:'Coffee 1',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'La Esperanza',exact:true}).count(),0);await page.screenshot({path:`/tmp/blind-shared-${width}.png`});
  await page.getByRole('button',{name:'Host controls',exact:true}).click();await page.getByRole('button',{name:'Reveal coffee identities',exact:true}).click();await page.getByRole('button',{name:'Your impressions',exact:true}).click();await page.getByRole('heading',{name:'La Esperanza',exact:true}).waitFor();
  await page.getByRole('button',{name:'Host controls',exact:true}).click();await page.getByRole('button',{name:'Close submissions',exact:true}).click();await page.getByRole('button',{name:'Reopen submissions',exact:true}).waitFor();await page.getByRole('button',{name:'Your impressions',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Submit impressions for this coffee'}).isDisabled(),true);
  await page.getByRole('button',{name:'Back to app'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Open Panel Report',exact:true}).click();
  assert.equal(await page.getByLabel('Report title').count(),0,'Composer remains absent before authentication');
  await page.getByRole('dialog').waitFor();await page.screenshot({path:`/tmp/panel-password-${width}.png`});
  await page.getByLabel('Panel password').fill('wrong');await page.getByRole('button',{name:'Open composer',exact:true}).click();await page.getByRole('alert').filter({hasText:'Incorrect'}).waitFor();assert.equal(await page.getByLabel('Report title').count(),0);
  assert.equal(panelLookups,0);await page.getByLabel('Panel password').fill('C0ff33');await page.getByRole('button',{name:'Open composer',exact:true}).click();await page.getByLabel('Coffee comparisons — Sample IDs').waitFor();assert.equal(await page.getByLabel('Panel password').count(),0);assert.equal(panelLookups,0,'Unlock must not wait for Google');
  await page.getByLabel('Coffee comparisons — Sample IDs').fill(sample.syncId);await page.getByRole('button',{name:'Build comparisons',exact:true}).click();await page.getByText('Advanced options',{exact:true}).click();await page.getByLabel(`Where should evaluation ${sample.syncId} go?`).waitFor();assert.notEqual(await page.getByLabel(`Where should evaluation ${sample.syncId} go?`).inputValue(),'','Comparison assigned directly from input row');
  await page.getByText('Edit panel observations',{exact:true}).click();await page.getByLabel('Panel observations',{exact:true}).fill('A sweet, expressive coffee with a clean finish.');
  await page.getByRole('button',{name:'Export PDF',exact:true}).click();await page.getByRole('link',{name:'Download PDF',exact:true}).waitFor();await page.screenshot({path:`/tmp/panel-export-${width}.png`});
  const panelDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();await (await panelDownload).saveAs(`/tmp/panel-cupping-${width}.pdf`);
  const zipDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF set',exact:true}).click();const zip=await zipDownload;assert.equal(zip.suggestedFilename(),'Osito_Panel_Report.zip');await zip.saveAs(`/tmp/panel-set-${width}.zip`);await page.getByRole('button',{name:'Close PDF export'}).click();
  await page.getByRole('button',{name:'Save Panel Report'}).click();await page.getByRole('status').filter({hasText:'Panel report saved'}).waitFor();await page.screenshot({path:`/tmp/panel-cupping-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.getByRole('button',{name:'Lock composer'}).count(),0);
  await page.getByRole('button',{name:'Recall Panel Report',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.getByRole('textbox',{name:'Report ID',exact:true}).fill('missing-report');await page.getByRole('button',{name:'Recall report',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'not found'}).waitFor();
  await page.getByRole('button',{name:'Close report recall'}).click();await page.getByText('A sweet, expressive coffee with a clean finish.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Recall Panel Report',exact:true}).click();await page.getByRole('textbox',{name:'Report ID',exact:true}).fill(' edition-id ');await page.screenshot({path:`/tmp/panel-recall-${width}.png`});await page.getByRole('button',{name:'Recall report',exact:true}).click();await page.getByRole('status').filter({hasText:'Panel report recalled'}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);await page.getByText('A sweet, expressive coffee with a clean finish.',{exact:true}).waitFor();
  if(width===1024){
    const exports=await page.evaluate(async sample=>{
      const {buildCombinedReportPdf}=await import('/my-cupping-appV2/src/lib/pdfReport.js');
      const {buildCollaborationPdf,buildCollaborationPdfSet}=await import('/my-cupping-appV2/src/lib/collaborationPdf.js');
      const primary=await buildCombinedReportPdf([sample,sample],{sessionStartTime:'Primary report regression check'});
      const evaluations=[{...sample,mode:'full',cupper:'David'},{...sample,mode:'full',cupper:'María',scores:{...sample.scores,flavor:8.75}}];
      const start=performance.now();
      const panel=await buildCollaborationPdf({title:'Osito Panel Report',panel:true,coffees:Array.from({length:5},(_,i)=>({sample:{...sample,lotName:'Coffee '+(i+1),roastId:'6004'},evaluations,summary:''}))});
      const duration=performance.now()-start;
      const set=await buildCollaborationPdfSet({title:'Five coffee panel',panel:true,coffees:Array.from({length:5},(_,i)=>({sample:{...sample,lotName:'Coffee '+(i+1)},evaluations,summary:''}))});
      return{primary:Array.from(primary),panel:Array.from(panel),duration,zip:Array.from(set.zipBytes),filenames:set.files.map(f=>f.name)};
    },sample);
    const primary=await PDFDocument.load(new Uint8Array(exports.primary)),panel=await PDFDocument.load(new Uint8Array(exports.panel));
    assert.equal(primary.getPageCount(),2);assert.equal(panel.getPageCount(),5);assert.equal(panel.getPages()[0].getWidth(),792);assert.equal(panel.getPages()[0].getHeight(),612);
    await writeFile('/tmp/panel-five-coffee-check.pdf',new Uint8Array(exports.panel));
    await writeFile('/tmp/panel-five-coffee-set.zip',new Uint8Array(exports.zip));
    assert.deepEqual(exports.filenames,Array.from({length:5},(_,i)=>`Coffee_${i+1}.pdf`));
    console.log(`Five-coffee PDF generation with preloaded assets: ${Math.round(exports.duration)} ms.`);
  }
  assert.deepEqual(errors,[]);await context.close();
}
console.log('Passed: saved name, invitation code, Quick/Full preservation, tags, submission, host closure, report/PDF, Panel composition/save, and responsive layout at 390 and 1024 px.');
}finally{await browser.close();}
