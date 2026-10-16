import {useEffect,useRef,useState} from 'react';
import {sharedAutosaveStore} from '../lib/sharedAutosaveRegistry';
import {normalizeInviteCode} from '../lib/collaboration';


export default function useSharedAutosave(code,data,onSaved){
  const [,render]=useState(0),ref=useRef(null),saved=useRef(onSaved);saved.current=onSaved;
  if(code&&ref.current?.code!==code){
    const store=sharedAutosaveStore(code);
    store.onChange=()=>render(n=>n+1);
    store.onSaved=entries=>saved.current?.(entries,store.code);
    ref.current=store;
    // Migrate previous local drafts without dropping unsubmitted observations.
    if(!Object.keys(ref.current.state.drafts).length){try{const old=JSON.parse(localStorage.getItem('osito_drafts_'+normalizeInviteCode(code))||'{}');for(const [id,draft] of Object.entries(old)){ref.current.state.drafts[id]=draft;ref.current.state.pending[id]=true;ref.current.state.versions[id]=1;}}catch{}}
  }
  const store=ref.current;
  useEffect(()=>{if(store&&data)store.hydrate(data.entries,data.invitation.defaultMode);},[store,data]);
  useEffect(()=>{
    if(!store||!data)return;
    store.onChange=()=>render(n=>n+1);store.onSaved=entries=>saved.current?.(entries,store.code);
    let active=true,timer;
    const save=async()=>{if(!active)return;if(!data.invitation.closed&&store.status!=='blocked')await store.flush();if(active)timer=setTimeout(save,store.status==='pending'?1000:10000);};
    store.onEdit=()=>{clearTimeout(timer);timer=setTimeout(save,1000);};
    timer=setTimeout(save,1000);
    const reconnect=()=>{clearTimeout(timer);save();};
    window.addEventListener('online',reconnect);
    const offline=()=>{store.status='offline';store.onChange();};window.addEventListener('offline',offline);
    return()=>{active=false;store.onEdit=null;store.onChange=()=>{};store.onSaved=null;clearTimeout(timer);window.removeEventListener('online',reconnect);window.removeEventListener('offline',offline);};
  },[store,data?.invitation.closed,!!data]);
  return store;
}
