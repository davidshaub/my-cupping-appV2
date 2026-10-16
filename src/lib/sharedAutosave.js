import { emptyContribution, normalizeInviteCode } from './collaboration.js';

// One durable outbox per invitation and browser. Never replace edits with a late response.
export class SharedAutosave {
  constructor({code,storage=localStorage,send,onChange=()=>{},online=()=>navigator.onLine}) {
    Object.assign(this,{code,storage,send,onChange,online});
    this.key='osito_shared_outbox_'+normalizeInviteCode(code);
    try{this.state=JSON.parse(storage.getItem(this.key)||'null');}catch{}
    this.state ||= {drafts:{},pending:{},versions:{},mode:null,name:null,flight:null};
    this.running=false;this.status='idle';this.error='';
  }
  persist(){try{this.storage.setItem(this.key,JSON.stringify(this.state));this.storageError='';}catch{this.storageError='Device storage is unavailable. Keep this page open until changes upload.';}this.onChange();}
  hydrate(entries,defaultMode){
    this.state.name ??= entries.find(e=>e.own)?.cupper||null;
    this.state.mode ||= entries.find(e=>e.own)?.mode||defaultMode||'quick';
    for(const entry of entries.filter(e=>e.own))if(!this.state.pending[entry.sampleId]&&(entry.revision||0)>=(this.state.drafts[entry.sampleId]?.revision||0))this.state.drafts[entry.sampleId]=entry;
    this.persist();
  }
  draft(id){return {...(this.state.drafts[id]||emptyContribution(this.state.mode||'quick')),mode:this.state.mode||'quick',...(this.state.name!==null?{cupper:this.state.name}:{})};}
  edit(id,patch){this.lastEditAt=Date.now();this.state.drafts[id]={...this.draft(id),...patch};this.state.pending[id]=true;this.state.versions[id]=(this.state.versions[id]||0)+1;this.status='pending';this.error='';this.persist();this.onEdit?.();}
  preference(field,value){
    this.state[field]=value;
    for(const id of Object.keys(this.state.drafts))this.edit(id,field==='mode'?{mode:value}:{cupper:value});
    this.persist();
  }
  async flush(){
    if(this.running)return;
    if(!this.online()){this.status='offline';this.onChange();return;}
    if(!this.state.flight){
      let items=Object.keys(this.state.pending).map(sampleId=>({sampleId,entry:{...this.draft(sampleId),cupper:this.draft(sampleId).cupper.trim(),quickScore:this.draft(sampleId).quickScore===''?'':Number(this.draft(sampleId).quickScore)},revision:this.state.drafts[sampleId]?.revision||0,version:this.state.versions[sampleId]})).filter(({entry})=>entry.mode==='full'||entry.quickScore!==''||entry.notes.otherText.trim()||['fragAromaTags','inCupTags','negativeTags'].some(key=>entry.notes[key].length));
      let bytes=0;items=items.filter(item=>{const size=new TextEncoder().encode(JSON.stringify(item)).length;if(bytes&&bytes+size>200000)return false;bytes+=size;return true;});
      if(!items.length){this.status=Object.keys(this.state.pending).length?'empty':'saved';this.onChange();return;}
      if(items.some(item=>!item.entry.cupper.trim())){this.status='name';this.onChange();return;}
      this.state.flight={requestId:crypto.randomUUID(),items};this.persist();
    }
    this.running=true;this.status='saving';this.onChange();
    const flight=this.state.flight;
    try{
      const result=await this.send(flight);
      if(!Array.isArray(result.entries)||result.entries.length!==flight.items.length)throw new Error('Update the Google Apps Script deployment to enable automatic saving.');
      const confirmed=result.entries.map(entry=>({...flight.items.find(item=>item.sampleId===entry.sampleId)?.entry,...entry}));
      for(const entry of confirmed){
        const sent=flight.items.find(item=>item.sampleId===entry.sampleId);
        if(!sent)continue;
        if(this.state.versions[entry.sampleId]===sent.version){this.state.drafts[entry.sampleId]={...entry,own:true};delete this.state.pending[entry.sampleId];}
        else this.state.drafts[entry.sampleId]={...this.state.drafts[entry.sampleId],revision:entry.revision};
      }
      this.state.flight=null;this.status=Object.keys(this.state.pending).length?'pending':'saved';this.error='';this.persist();this.onSaved?.(confirmed);
    }catch(error){
      this.error=error.message;
      this.status=/another tab|closed|not part|invalid|too large|deployment/i.test(error.message)?'blocked':this.online()?'retry':'offline';
      // A definite server rejection can be retried after the host reopens submissions.
      if(this.status==='blocked'||error.serverRejected){this.state.flight=null;this.persist();}
      this.onChange();
    }finally{this.running=false;}
  }
}
