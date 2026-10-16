import {useEffect} from 'react';
import {sharedAutosaveStore} from '../lib/sharedAutosaveRegistry';

// Keep reconnect recovery alive when participants leave the shared screen for Home.
export default function useSharedOutboxSync(){
  useEffect(()=>{
    let active=true,running=false;
    const sync=async()=>{
      if(running||!navigator.onLine)return;running=true;
      try{
        const keys=Object.keys(localStorage).filter(key=>key.startsWith('osito_shared_outbox_'));
        for(const key of keys){
          if(!active)break;
          const store=sharedAutosaveStore(key.slice('osito_shared_outbox_'.length));
          if(store.status!=='blocked'&&(store.state.flight||Object.keys(store.state.pending).length)&&Date.now()-(store.lastEditAt||0)>=1000)await store.flush();
        }
      }finally{running=false;}
    };
    sync();const timer=setInterval(sync,5000);window.addEventListener('online',sync);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('online',sync);};
  },[]);
}
