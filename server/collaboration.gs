// Append this file to google-apps-script.gs when deploying. Uses only the existing spreadsheet.
const COLLAB_TABS = { invites: 'Shared Invitations', coffees: 'Shared Coffees', entries: 'Shared Contributions', panels: 'Osito Panel Reports' };
function collabSheet_(kind) {
  const book = SpreadsheetApp.openById(CUPPING_SPREADSHEET), name = COLLAB_TABS[kind];
  let sheet = book.getSheetByName(name);
  if (!sheet) { sheet = book.insertSheet(name); sheet.appendRow(['ID', 'Data', 'Cupper']); }
  collabSheetLayout_(kind, sheet);
  return sheet;
}
function collabRows_(kind) {
  return collabSheet_(kind).getDataRange().getValues().slice(1).filter(row => row[0]).map(row => ({ id: String(row[0]), data: JSON.parse(row[1]) }));
}
function collabPut_(kind, id, data) {
  const text = JSON.stringify(data);
  if (text.length > 45000) throw new Error('This record is too large. Use fewer evaluations.');
  const sheet = collabSheet_(kind), rows = sheet.getDataRange().getValues();
  const index = rows.findIndex((row, i) => i > 0 && row[0] === id);
  const values = [id, text, literal_(data.cupper || '')];
  if (index < 0) sheet.appendRow(values); else sheet.getRange(index + 1, 1, 1, 3).setValues([values]);
  if (collabSummaryHeaders_(kind).length) {
    const rowNumber = index < 0 ? rows.length + 1 : index + 1;
    const lookup = kind === 'entries' ? collabCoffeeLookup_() : null;
    collabWriteSummaries_(sheet, rows[0], kind, [{ rowNumber, data }], lookup);
    collabFormatSummaryRow_(sheet, rows[0], kind, rowNumber);
  }
}

// Every "Shared ___" tab, and the Panel tab, store the full record as JSON in the hidden Data
// column; these summary headers/derivers are what turn that into readable columns alongside it.
const PANEL_SUMMARY_HEADERS = ['Date of Report', 'Report Title', 'Lots / Coffees', 'Osito IDs', 'Coffee Count'];
function panelSummary_(panel) {
  const coffees = Array.isArray(panel.coffees) ? panel.coffees : [];
  const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].join('; ');
  const date = panel.createdAt ? new Date(panel.createdAt) : null;
  return {
    Cuppers: unique(coffees.flatMap(coffee => (coffee.evaluations || []).map(evaluation => evaluation.cupper))),
    'Date of Report': date && Number.isFinite(date.getTime()) ? date : '',
    'Report Title': typeof panel.title === 'string' ? panel.title : '',
    'Lots / Coffees': unique(coffees.map(coffee => coffee.name || coffee.sample?.lotName)),
    'Osito IDs': unique(coffees.map(coffee => coffee.sample?.ositoId)),
    'Coffee Count': coffees.length
  };
}

const INVITES_SUMMARY_HEADERS = ['Session Name', 'Cupping Date', 'Mode', 'Blind?', 'Status', 'Results Shared?', 'Created'];
function invitesSummary_(invite) {
  const created = invite.createdAt ? new Date(invite.createdAt) : null;
  return {
    'Session Name': typeof invite.name === 'string' ? invite.name : '',
    'Cupping Date': typeof invite.date === 'string' ? invite.date : '',
    Mode: invite.defaultMode === 'quick' ? 'Quick' : invite.defaultMode === 'full' ? 'Full' : '',
    'Blind?': invite.blind ? 'Yes' : 'No',
    Status: invite.closed ? 'Closed' : 'Open',
    'Results Shared?': invite.revealed ? 'Yes' : 'No',
    Created: created && Number.isFinite(created.getTime()) ? created : ''
  };
}

const COFFEES_SUMMARY_HEADERS = ['Invitation Code', 'Lot Name', 'Osito ID', 'Country', 'Host Cupper', 'Position'];
function coffeesSummary_(coffee) {
  const sample = coffee.sample || {}, host = coffee.hostEvaluation || {};
  return {
    'Invitation Code': typeof coffee.code === 'string' ? coffee.code : '',
    'Lot Name': typeof sample.lotName === 'string' ? sample.lotName : '',
    'Osito ID': typeof sample.ositoId === 'string' ? sample.ositoId : '',
    Country: typeof sample.country === 'string' ? sample.country : '',
    'Host Cupper': typeof host.cupper === 'string' ? host.cupper : '',
    Position: Number.isInteger(coffee.position) ? coffee.position + 1 : ''
  };
}

// Entries only know the coffee's syncId; resolving it to a lot name/Osito ID needs the Coffees
// tab's own rows, built once per batch rather than re-reading the sheet per entry.
function collabCoffeeLookup_() {
  const lookup = {};
  collabRows_('coffees').forEach(({ data }) => { lookup[data.code + ':' + data.sample?.syncId] = data; });
  return lookup;
}
const ENTRIES_SUMMARY_HEADERS = ['Invitation Code', 'Coffee', 'Osito ID', 'Mode', 'Revision', 'Updated'];
function entriesSummary_(entry, coffeeLookup) {
  const coffee = coffeeLookup?.[entry.code + ':' + entry.sampleId], sample = coffee?.sample || {};
  const updated = entry.updatedAt ? new Date(entry.updatedAt) : null;
  return {
    'Invitation Code': typeof entry.code === 'string' ? entry.code : '',
    Coffee: sample.lotName || sample.ositoId || '',
    'Osito ID': typeof sample.ositoId === 'string' ? sample.ositoId : '',
    Mode: entry.mode === 'quick' ? 'Quick' : entry.mode === 'full' ? 'Full' : '',
    Revision: Number.isInteger(entry.revision) ? entry.revision : '',
    Updated: updated && Number.isFinite(updated.getTime()) ? updated : ''
  };
}

function collabSummaryHeaders_(kind) {
  return { invites: INVITES_SUMMARY_HEADERS, coffees: COFFEES_SUMMARY_HEADERS, entries: ENTRIES_SUMMARY_HEADERS, panels: PANEL_SUMMARY_HEADERS }[kind] || [];
}
function collabSummary_(kind, data, coffeeLookup) {
  if (kind === 'invites') return invitesSummary_(data);
  if (kind === 'coffees') return coffeesSummary_(data);
  if (kind === 'entries') return entriesSummary_(data, coffeeLookup);
  if (kind === 'panels') return panelSummary_(data);
  return null;
}
// The one column per kind worth a date/time display format, if any.
const COLLAB_DATE_HEADER = { invites: 'Created', entries: 'Updated', panels: 'Date of Report' };
const COLLAB_COLUMN_WIDTHS = {
  invites: { ID: 120, 'Session Name': 220, 'Cupping Date': 130, Mode: 80, 'Blind?': 70, Status: 80, 'Results Shared?': 120, Created: 150 },
  coffees: { ID: 170, 'Invitation Code': 110, 'Lot Name': 220, 'Osito ID': 130, Country: 110, 'Host Cupper': 140, Position: 80 },
  entries: { ID: 220, Cupper: 150, 'Invitation Code': 110, Coffee: 220, 'Osito ID': 130, Mode: 80, Revision: 70, Updated: 150 },
  panels: { ID: 260, Cuppers: 220, 'Date of Report': 175, 'Report Title': 210, 'Lots / Coffees': 300, 'Osito IDs': 180, 'Coffee Count': 110 }
};

function collabWriteSummaries_(sheet, headers, kind, entries, coffeeLookup) {
  // Write only owned summary cells, preserving unrelated columns and formulas.
  entries.forEach(({ rowNumber, data }) => {
    const summary = collabSummary_(kind, data, coffeeLookup);
    if (!summary) return;
    let start = -1, values = [];
    const flush = () => { if (start >= 0) sheet.getRange(rowNumber, start + 1, 1, values.length).setValues([values]); start = -1; values = []; };
    headers.forEach((header, index) => {
      if (!Object.prototype.hasOwnProperty.call(summary, header)) { flush(); return; }
      if (start < 0) start = index;
      values.push(literal_(summary[header]));
    });
    flush();
  });
}
function collabFormatSummaryRow_(sheet, headers, kind, rowNumber) {
  const dateHeader = COLLAB_DATE_HEADER[kind];
  if (dateHeader) {
    const col = headers.indexOf(dateHeader) + 1;
    if (col > 0) sheet.getRange(rowNumber, col, 1, 1).setNumberFormat('mmm d, yyyy h:mm AM/PM');
  }
  sheet.getRange(rowNumber, 1, 1, headers.length).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.setRowHeightsForced(rowNumber, 1, 32);
}
function collabSheetLayout_(kind, sheet) {
  const summaryHeaders = collabSummaryHeaders_(kind);
  if (!summaryHeaders.length) return;
  const rows = sheet.getDataRange().getValues(), headers = rows[0].slice();
  const renameCupper = kind === 'panels' && headers[2] === 'Cupper';
  const needsMigration = renameCupper || summaryHeaders.some(name => !headers.includes(name));
  if (!needsMigration) return;
  if (renameCupper) { headers[2] = 'Cuppers'; sheet.getRange(1, 3, 1, 1).setValues([['Cuppers']]); }
  const missing = summaryHeaders.filter(name => !headers.includes(name));
  if (missing.length) {
    const needed = headers.length + missing.length - sheet.getMaxColumns();
    if (needed > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), needed);
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers.push(...missing);
  }
  const entries = [];
  rows.slice(1).forEach((row, index) => {
    if (!row[0] || !row[1]) return;
    try { entries.push({ rowNumber: index + 2, data: JSON.parse(row[1]) }); }
    catch (_) { /* Preserve an unreadable source row; other saved records still migrate. */ }
  });
  const coffeeLookup = kind === 'entries' ? collabCoffeeLookup_() : null;
  collabWriteSummaries_(sheet, headers, kind, entries, coffeeLookup);
  sheet.hideColumns(2);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getDataRange().setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  if (rows.length > 1) sheet.setRowHeightsForced(2, rows.length - 1, 32);
  const widths = COLLAB_COLUMN_WIDTHS[kind] || {};
  headers.forEach((header, index) => { if (widths[header]) sheet.setColumnWidth(index + 1, widths[header]); });
  const dateHeader = COLLAB_DATE_HEADER[kind];
  if (dateHeader && headers.includes(dateHeader)) {
    sheet.getRange(2, headers.indexOf(dateHeader) + 1, Math.max(1, rows.length - 1), 1).setNumberFormat('mmm d, yyyy h:mm AM/PM');
  }
}
// Optional one-time Run action in Apps Script to tidy existing rows in all four tabs immediately.
function organizePanelReports() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Service busy. Please retry.');
  try {
    ['invites', 'coffees', 'entries', 'panels'].forEach(kind => collabSheet_(kind));
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}
function collabHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value)).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function collabSecret_(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{32,100}$/.test(value)) throw new Error('Invalid access credential.'); return value; }
function collabCode_(raw) { return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function collabInvite_(code) {
  const invite = collabRows_('invites').find(row => collabCode_(row.id) === collabCode_(code));
  if (!invite) throw new Error('Invitation not found. Check the code.');
  return invite.data;
}
function collabHost_(invite, token) { if (collabHash_(collabSecret_(token)) !== invite.hostHash) throw new Error('Host access required.'); }
function collabValidateEvaluation_(entry) {
  if (!entry || !['quick', 'full'].includes(entry.mode) || typeof entry.cupper !== 'string' || !entry.cupper.trim() || entry.cupper.length > 80) throw new Error('Enter your name.');
  if (entry.quickScore !== '' && entry.quickScore != null && (typeof entry.quickScore !== 'number' || !Number.isFinite(entry.quickScore) || entry.quickScore < 0 || entry.quickScore > 100)) throw new Error('Final score must be between 0 and 100.');
  const notes = entry.notes;
  if (!notes || ['fragAromaTags', 'inCupTags', 'negativeTags'].some(key => !Array.isArray(notes[key]) || notes[key].length > 150 || notes[key].some(tag => typeof tag !== 'string' || tag.length > 120)) || typeof notes.otherText !== 'string' || notes.otherText.length > 6000) throw new Error('Invalid sensory observations.');
  const keys = ['fragrance','cleanCup','sweetness','acidity','body','flavor','aftertaste','balance','consistency','overall','defects','correction'];
  if (!entry.scores || keys.some(key => !Number.isFinite(entry.scores[key])) || (entry.scores.aroma != null && !Number.isFinite(entry.scores.aroma))) throw new Error('Invalid attribute scores.');
  if (keys.filter(k => !['defects','correction'].includes(k)).some(k => entry.scores[k] < 0 || entry.scores[k] > 10) || (entry.scores.aroma != null && (entry.scores.aroma < 0 || entry.scores.aroma > 10)) || entry.scores.defects < 0 || entry.scores.defects > 100 || Math.abs(entry.scores.correction) > 100) throw new Error('Attribute score outside range.');
  if (entry.mode === 'quick' && (entry.quickScore === '' || entry.quickScore == null) && !notes.otherText.trim() && !['fragAromaTags','inCupTags','negativeTags'].some(k => notes[k].length)) throw new Error('Add a score, tag, or note.');
  if (entry.mode === 'full' && !entry.noScore) { const s = entry.scores; const total = (s.fragrance + (s.aroma == null ? s.fragrance : s.aroma))/2 + ['cleanCup','sweetness','acidity','body','flavor','aftertaste','balance','consistency','overall'].reduce((sum,k)=>sum+s[k],0)-s.defects+s.correction; if(total < 0 || total > 100) throw new Error('Calculated final score must be between 0 and 100.'); }
}
function collabPublicEntry_(entry) { const { guestHash, ...safe } = entry; return safe; }
function collaborationRead_(params) {
  const invite = collabInvite_(params.code);
  const host = params.hostToken && collabHash_(params.hostToken) === invite.hostHash;
  const ownHash = params.guestToken ? collabHash_(params.guestToken) : '';
  const hideIdentities = invite.blind && !invite.identitiesRevealed && !host;
  const coffees = collabRows_('coffees').filter(row => row.data.code === invite.code).sort((a,b)=>(a.data.position||0)-(b.data.position||0)).map((row,index) => ({ ...(hideIdentities ? {syncId:row.data.sample.syncId,lotName:'Coffee '+(index+1)} : row.data.sample), hostEvaluation: invite.revealed || host ? row.data.hostEvaluation : null }));
  const all = collabRows_('entries').filter(row => row.data.code === invite.code).map(row => row.data);
  const entries = all.filter(entry => invite.revealed || host || entry.guestHash === ownHash).map(entry => ({ ...collabPublicEntry_(entry), own: entry.guestHash === ownHash }));
  const { hostHash, ...safe } = invite;
  if (hideIdentities) { safe.name = 'Blind cupping'; delete safe.sourceSessionId; }
  return { invitation: safe, coffees, entries, isHost: Boolean(host) };
}
function collabLookup_(body) {
  const password = PropertiesService.getScriptProperties().getProperty('OSITO_PANEL_PASSWORD') || 'C0ff33';
  if (body.password !== password) throw new Error('Incorrect Panel Report password.');
  const ids = (body.sampleIds || []).map(String), codes = (body.sessionCodes || []).map(collabCode_);
  if (ids.length + codes.length > 60) throw new Error('Look up at most 60 identifiers at a time.');
  const rows = cuppingSheet_().getDataRange().getValues(), headers = rows.shift(), col = name => headers.indexOf(name);
  const evaluations = [];
  rows.forEach(row => {
    if (!ids.includes(String(row[col('Sample ID')])) && !codes.includes(collabCode_(row[col('Session Code')]))) return;
    const data = JSON.parse(row[col('App Data')]);
    const sample = data.sample;
    evaluations.push({ id: sample.syncId, source: 'primary', sample, cupper: row[col('Cupper')] || sample.cupper || data.session.cupper || 'Unnamed cupper', sessionName: data.session.name || '', date: data.session.startTime || data.session.date || '', sessionCode: row[col('Session Code')] || '', sourceSessionId: data.session.syncId });
  });
  const invitations = collabRows_('invites'), sharedCoffees = collabRows_('coffees');
  const selectedSessions = new Set(evaluations.map(e=>e.sourceSessionId));
  collabRows_('entries').forEach(({id,data}) => {
    const invitation = invitations.find(row=>row.id===data.code)?.data;
    if (!ids.includes(id) && !codes.includes(collabCode_(data.code)) && !(codes.length && selectedSessions.has(invitation?.sourceSessionId))) return;
    const coffee = sharedCoffees.find(row=>row.data.code === data.code && row.data.sample.syncId === data.sampleId);
    if (coffee) evaluations.push({ id, source: 'shared', sample: coffee.data.sample, ...collabPublicEntry_(data), sessionCode: data.code });
  });
  if (evaluations.length > 60 || JSON.stringify(evaluations).length > 85000) throw new Error('Too many evaluations. Look up fewer samples.');
  const foundIds = new Set(evaluations.map(e=>e.id));
  return { evaluations, missingSampleIds: ids.filter(id=>!foundIds.has(id)), missingSessionCodes: codes.filter(code=>!evaluations.some(e=>collabCode_(e.sessionCode)===code)) };
}
function collaborationPost_(body) {
  const requestId = body.requestId;
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(requestId || '')) throw new Error('Invalid request.');
  const cache = CacheService.getScriptCache(), key = 'receipt:' + requestId;
  let lock;
  try {
    if (cache.get(key)) return ContentService.createTextOutput('received');
    lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) throw new Error('Service busy. Please retry.');
    if (cache.get(key)) return ContentService.createTextOutput('received');
    let result;
    if (body.action === 'createInvitation') {
      const hostToken = collabSecret_(body.hostToken), session = body.session;
      if (!session || !Array.isArray(session.samples) || !session.samples.length || session.samples.length > 40 || !['quick','full'].includes(body.defaultMode)) throw new Error('Select between 1 and 40 coffees.');
      const ids = new Set();
      session.samples.forEach(sample=>{if(!sample.syncId || ids.has(sample.syncId))throw new Error('Coffee IDs must be unique.');ids.add(sample.syncId);});
      // A stable invitation ID makes a retried create request idempotent after receipt expiry.
      const existing = collabRows_('invites').find(row=>row.data.creationId===body.requestId);
      if (existing) { collabHost_(existing.data,hostToken); result={code:existing.data.code}; }
      else {
        const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';let code;
        do { const uuid=Utilities.getUuid().replace(/-/g,'');code=Array.from({length:8},(_,i)=>alphabet[parseInt(uuid.slice(i*2,i*2+2),16)%alphabet.length]).join('');code=code.slice(0,4)+'-'+code.slice(4); } while(collabRows_('invites').some(row=>row.id===code));
        session.samples.forEach((sample,index)=>{
          const metadata={};['syncId','lotName','ositoId','country','processing','processingOther','sampleType','roastId','waterActivity','moisture'].forEach(k=>metadata[k]=String(sample[k]||''));
          collabPut_('coffees',code+':'+sample.syncId,{code,sample:metadata,hostEvaluation:{id:sample.syncId,mode:'full',cupper:sample.cupper||session.cupper||'Host',date:String(session.startTime||session.date||''),scores:sample.scores,notes:sample.notes,noScore:!!sample.noScore},position:index});
        });
        collabPut_('invites',code,{code,creationId:requestId,hostHash:collabHash_(hostToken),name:String(session.name||'Shared cupping').slice(0,160),date:String(session.date||''),sourceSessionId:String(session.syncId||''),defaultMode:body.defaultMode,blind:body.blind===true,identitiesRevealed:false,closed:false,revealed:false,createdAt:new Date().toISOString()});result={code};
      }
    } else if (body.action === 'submitContribution' || body.action === 'saveContributions') {
      const invite=collabInvite_(body.code); if(invite.closed)throw new Error('Submissions are closed.');
      const guestHash=collabHash_(collabSecret_(body.guestToken));
      const items=body.action==='saveContributions'?body.items:[body];
      if(!Array.isArray(items)||!items.length||items.length>40)throw new Error('Invalid contributions.');
      const coffees=collabRows_('coffees'),sheet=collabSheet_('entries'),raw=sheet.getDataRange().getValues(),rows=raw.slice(1).filter(row=>row[0]).map(row=>({id:String(row[0]),data:JSON.parse(row[1])})),seen=new Set();
      // Validate the entire batch before writing anything.
      const entries=items.map(item=>{
        if(seen.has(item.sampleId))throw new Error('Invalid duplicate coffee.');seen.add(item.sampleId);
        if(!coffees.some(row=>row.data.code===invite.code && row.data.sample.syncId===item.sampleId))throw new Error('Coffee is not part of this invitation.');
        collabValidateEvaluation_(item.entry);
        const id=invite.code+':'+item.sampleId+':'+guestHash.slice(0,24);
        const previous=rows.find(row=>row.id===id);
        if(previous?.data.lastRequestId===requestId)return previous.data;
        if(previous && item.revision!==previous.data.revision)throw new Error('This entry changed on another tab. Your local changes are retained.');
        return {id,code:invite.code,sampleId:item.sampleId,guestHash,cupper:item.entry.cupper.trim(),mode:item.entry.mode,noScore:!!item.entry.noScore,quickScore:item.entry.quickScore,scores:item.entry.scores,notes:item.entry.notes,revision:(previous?.data.revision||0)+1,lastRequestId:requestId,updatedAt:new Date().toISOString()};
      });
      const writes=entries.map(entry=>{
        const text=JSON.stringify(entry);if(text.length>45000)throw new Error('This record is too large.');
        return {index:raw.findIndex((row,i)=>i>0&&row[0]===entry.id),values:[entry.id,text,literal_(entry.cupper)]};
      });
      const appended=writes.filter(write=>write.index<0);
      if(appended.length)sheet.getRange(raw.length+1,1,appended.length,3).setValues(appended.map(write=>write.values));
      const updates=writes.filter(write=>write.index>0).sort((a,b)=>a.index-b.index);
      for(let i=0;i<updates.length;){
        let end=i+1;while(end<updates.length&&updates[end].index===updates[end-1].index+1)end++;
        sheet.getRange(updates[i].index+1,1,end-i,3).setValues(updates.slice(i,end).map(write=>write.values));i=end;
      }
      // This batch path writes rows directly (for the contiguous-range efficiency above) rather than
      // through collabPut_, so the readable summary columns are filled in separately here.
      const coffeeLookup={};coffees.forEach(({data})=>{coffeeLookup[data.code+':'+data.sample?.syncId]=data;});
      let appendCursor=raw.length+1;
      const rowNumbers=writes.map(write=>write.index<0?appendCursor++:write.index+1);
      collabWriteSummaries_(sheet,raw[0],'entries',entries.map((data,i)=>({rowNumber:rowNumbers[i],data})),coffeeLookup);
      rowNumbers.forEach(rowNumber=>collabFormatSummaryRow_(sheet,raw[0],'entries',rowNumber));
      result=body.action==='saveContributions'?{saved:true,entries:entries.map(entry=>({id:entry.id,code:entry.code,sampleId:entry.sampleId,revision:entry.revision,updatedAt:entry.updatedAt}))}:{saved:true,entry:collabPublicEntry_(entries[0])};
    } else if(body.action==='updateInvitation') {
      const invite=collabInvite_(body.code);collabHost_(invite,body.hostToken);
      ['closed','revealed'].forEach(k=>{if(typeof body[k]==='boolean')invite[k]=body[k];});
      if (typeof body.blind === 'boolean') invite.blind = body.blind;
      if (typeof body.identitiesRevealed === 'boolean') invite.identitiesRevealed = body.identitiesRevealed;
      // Sharing results also reveals the coffees; hiding results restores blind mode.
      if (typeof body.revealed === 'boolean' || typeof body.blind === 'boolean') invite.identitiesRevealed = !invite.blind || !!invite.revealed;
      if(['quick','full'].includes(body.defaultMode))invite.defaultMode=body.defaultMode;
      collabPut_('invites',invite.code,invite);const {hostHash,...safe}=invite;result={saved:true,invitation:safe};
    } else if(body.action==='panelLookup') result=collabLookup_(body);
    else if(body.action==='savePanel' || body.action==='loadPanel') {
      collabLookup_({password:body.password});
      if(body.action==='loadPanel'){const row=collabRows_('panels').find(row=>row.id===body.panelId);if(!row)throw new Error('Panel edition not found.');result={panel:row.data};}
      else {const panel=body.panel;if(!panel || !Array.isArray(panel.coffees) || !panel.coffees.length)throw new Error('Add coffees to the panel.');const id=body.requestId;collabPut_('panels',id,{...panel,id,createdAt:new Date().toISOString()});result={saved:true,panelId:id};}
    } else throw new Error('Unknown collaboration action.');
    SpreadsheetApp.flush();cache.put(key,JSON.stringify({collaboration:result}),600);
  }catch(error){cache.put(key,JSON.stringify({collaborationError:String(error.message||'Service unavailable.')}),600);}
  finally{if(lock && lock.hasLock())lock.releaseLock();}
  return ContentService.createTextOutput('received');
}
