import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeSamples} from '../src/lib/cupping.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const context=await browser.newContext({viewport:{width:390,height:900}});
  const sample={...initializeSamples(1)[0],lotName:'Offline coffee'};
  let entries=[],posts=0,receipts=new Map();
  const invitation={code:'ABCD-EFGH',name:'Offline cupping',defaultMode:'quick',closed:false,revealed:false};
  await context.route('https://script.google.com/**',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      posts++;const body=JSON.parse(request.postData());
      assert.equal(body.action,'saveContributions');
      entries=body.items.map(item=>({...item.entry,id:item.sampleId,sampleId:item.sampleId,revision:item.revision+1,own:true}));
      receipts.set(body.requestId,{collaboration:{saved:true,entries:entries.map(({id,sampleId,revision})=>({id,sampleId,revision}))}});
      return route.fulfill({body:'received'});
    }
    const url=new URL(request.url());const result=url.searchParams.get('action')==='receipt'?receipts.get(url.searchParams.get('requestId'))||{pending:true}:{invitation,coffees:[sample],entries,isHost:false};
    return route.fulfill({contentType:'text/javascript',body:`${url.searchParams.get('callback')}(${JSON.stringify(result)});`});
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/my-cupping-appV2/?shared=ABCD-EFGH');
  await page.getByRole('heading',{name:'Offline coffee',exact:true}).waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();await page.getByRole('heading',{name:'Offline coffee',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>!!navigator.serviceWorker.controller),true);
  await page.getByRole('textbox',{name:'Your name'}).fill('Offline tester');
  await context.setOffline(true);
  await page.getByRole('spinbutton',{name:'Final score'}).fill('88');
  await page.getByPlaceholder('Additional observations.').fill('Completed without a connection.');
  await page.getByRole('radio').nth(1).check();
  await page.getByRole('button',{name:'Increase Fragrance',exact:true}).click();
  await page.reload();
  await page.getByRole('heading',{name:'Offline coffee',exact:true}).waitFor();
  assert.equal(await page.getByRole('radio').nth(1).isChecked(),true);
  assert.equal(await page.getByPlaceholder('Additional observations.').inputValue(),'Completed without a connection.');
  assert.equal(await page.locator('.score-value').first().innerText(),'8.75');
  assert.equal(posts,0);
  await page.screenshot({path:'/tmp/shared-offline-reloaded.png',fullPage:true});
  await context.setOffline(false);
  await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('osito_shared_outbox_ABCDEFGH')).pending).length===0);
  assert.equal(posts,1);assert.equal(entries[0].notes.otherText,'Completed without a connection.');assert.equal(entries[0].scores.fragrance,8.75);
  // Pending edits must also upload after leaving the cupping screen.
  await context.setOffline(true);
  await page.getByPlaceholder('Additional observations.').fill('Offline finish, then Home.');
  await page.getByRole('button',{name:'Back to app',exact:true}).click();
  await context.setOffline(false);
  await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('osito_shared_outbox_ABCDEFGH')).pending).length===0);
  assert.equal(entries[0].notes.otherText,'Offline finish, then Home.');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('Passed: production offline scoring, offline reload, preserved mode/name/notes/scores, and automatic single-batch reconnect upload.');
}finally{await browser.close();}
