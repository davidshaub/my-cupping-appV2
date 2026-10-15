import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeSamples} from '../src/lib/cupping.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
for(const width of [390,1024]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  const sample=initializeSamples(1)[0];Object.assign(sample,{lotName:'La Esperanza',ositoId:'488.26',country:'Colombia',processing:'Washed'});sample.notes.fragAromaTags=['Floral','Honey'];sample.notes.inCupTags=['Stone Fruit','Black Tea'];
  let entries=[],invitation={code:'ABCD-EFGH',name:'Supplier cupping',defaultMode:'quick',closed:false,revealed:true},receipts=new Map();
  const record={id:sample.syncId,source:'primary',sample,cupper:'David',sessionCode:'ABCD-EFGH',date:'October 15, 2026'};
  const snapshot=()=>({invitation,coffees:[{...sample,hostEvaluation:{...sample,id:'host',mode:'full',cupper:'David'}}],entries,isHost:true});
  await context.route('https://script.google.com/**',async route=>{
    if(route.request().method()==='POST'){
      const body=JSON.parse(route.request().postData());if(body.protocol!=='collaboration-v1')return route.fulfill({body:'received'});
      let result;
      if(body.action==='submitContribution'){const entry={...body.entry,id:'entry',sampleId:body.sampleId,own:true,revision:1};entries=[entry];result={saved:true,entry};}
      if(body.action==='updateInvitation'){Object.assign(invitation,Object.fromEntries(['closed','revealed','defaultMode'].filter(k=>k in body).map(k=>[k,body[k]])));result={saved:true};}
      if(body.action==='panelLookup'){
        if(body.password!=='C0ff33'){receipts.set(body.requestId,{collaborationError:'Incorrect Panel Report password.'});return route.fulfill({body:'received'});}
        result={evaluations:body.sampleIds?.length||body.sessionCodes?.length?[record]:[],missingSampleIds:[],missingSessionCodes:[]};
      }
      if(body.action==='savePanel')result={saved:true,panelId:'edition-id'};
      receipts.set(body.requestId,{collaboration:result});return route.fulfill({body:'received'});
    }
    const url=new URL(route.request().url()),action=url.searchParams.get('action');
    const result=action==='sharedReport'?snapshot():action==='receipt'?(receipts.get(url.searchParams.get('requestId'))||{pending:true}):{lotCatalog:[]};
    return route.fulfill({contentType:'text/javascript',body:`${url.searchParams.get('callback')}(${JSON.stringify(result)});`});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:5173/my-cupping-appV2/');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('textbox',{name:'Your name'}).fill('María');
  await page.getByRole('button',{name:'Back to app'}).click();await page.getByRole('button',{name:'Join a cupping',exact:true}).click();await page.getByRole('textbox',{name:'Invitation code'}).fill('ABCD-EFGH');await page.getByRole('button',{name:'Open cupping',exact:true}).click();
  await page.getByRole('heading',{name:'La Esperanza',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Your name'}).inputValue(),'María');
  const search=page.getByPlaceholder(/search|type/i).first();await search.fill('Strawberry');await page.getByRole('button',{name:'Strawberry',exact:true}).click();
  await page.getByRole('radio').nth(1).check();await page.getByText('Strawberry',{exact:true}).waitFor();assert.equal(await page.getByRole('spinbutton',{name:'Fragrance',exact:true}).inputValue(),'8.5');
  await page.getByRole('spinbutton',{name:'Fragrance',exact:true}).fill('9');await page.getByRole('radio').nth(0).check();await page.getByRole('spinbutton',{name:'Final score · optional'}).fill('87');await page.getByPlaceholder('Additional observations.').fill('Peach, honey, and a tea-like finish.');
  await page.getByRole('button',{name:'Submit impressions for this coffee'}).click();await page.getByRole('status').filter({hasText:'saved'}).waitFor();
  await page.getByRole('radio').nth(1).check();assert.equal(await page.getByRole('spinbutton',{name:'Fragrance',exact:true}).inputValue(),'9');await page.getByRole('radio').nth(0).check();assert.equal(await page.getByRole('spinbutton',{name:'Final score · optional'}).inputValue(),'87');
  await page.getByRole('button',{name:'Shared report',exact:true}).click();await page.getByRole('heading',{name:'Flavor profile'}).waitFor();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export PDF',exact:true}).click();const download=await downloadPromise;await download.saveAs(`/tmp/shared-cupping-${width}.pdf`);
  await page.screenshot({path:`/tmp/shared-cupping-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.getByRole('button',{name:'Host controls',exact:true}).click();await page.getByRole('button',{name:'Close submissions',exact:true}).click();await page.getByRole('button',{name:'Reopen submissions',exact:true}).waitFor();await page.getByRole('button',{name:'Your impressions',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Submit impressions for this coffee'}).isDisabled(),true);
  await page.getByRole('button',{name:'Back to app'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Open Panel Report',exact:true}).click();
  assert.equal(await page.getByLabel('Report title').count(),0,'Composer remains absent before authentication');
  await page.getByLabel('Panel password').fill('wrong');await page.getByRole('button',{name:'Unlock Panel Report',exact:true}).click();await page.getByRole('alert').filter({hasText:'Incorrect'}).waitFor();assert.equal(await page.getByLabel('Report title').count(),0);
  await page.getByLabel('Panel password').fill('C0ff33');await page.getByRole('button',{name:'Unlock Panel Report',exact:true}).click();await page.getByLabel('Coffee comparisons — Sample IDs').waitFor();assert.equal(await page.getByLabel('Panel password').count(),0);
  await page.getByLabel('Coffee comparisons — Sample IDs').fill(sample.syncId);await page.getByRole('button',{name:'Build comparisons',exact:true}).click();await page.getByLabel(`Group evaluation ${sample.syncId}`).waitFor();assert.notEqual(await page.getByLabel(`Group evaluation ${sample.syncId}`).inputValue(),'','Comparison assigned directly from input row');
  await page.getByLabel('Panel observations',{exact:true}).fill('A sweet, expressive coffee with a clean finish.');
  const panelDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export PDF',exact:true}).click();await (await panelDownload).saveAs(`/tmp/panel-cupping-${width}.pdf`);
  await page.getByRole('button',{name:'Save fixed edition'}).click();await page.getByRole('status').filter({hasText:'Saved fixed edition'}).waitFor();await page.screenshot({path:`/tmp/panel-cupping-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await context.close();
}
console.log('Passed: saved name, invitation code, Quick/Full preservation, tags, submission, host closure, report/PDF, Panel composition/save, and responsive layout at 390 and 1024 px.');
}finally{await browser.close();}
