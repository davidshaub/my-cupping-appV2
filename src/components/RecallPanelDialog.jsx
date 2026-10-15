import React, { useEffect, useRef, useState } from 'react';
import { collaborationRequest } from '../lib/collaboration';

export default function RecallPanelDialog({ password, initialId='', onRecall, onClose }) {
  const dialog=useRef(null),live=useRef(true),controller=useRef(null);
  const [id,setId]=useState(initialId),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    live.current=true;
    const trigger=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current.showModal();
    return ()=>{live.current=false;controller.current?.abort();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus();};
  },[]);
  const recall=async event=>{
    event.preventDefault();if(busy||!id.trim())return;
    setBusy(true);setError('');controller.current=new AbortController();
    try {
      const result=await collaborationRequest('loadPanel',{password,panelId:id.trim()},{signal:controller.current.signal});
      if(!live.current)return;
      if(!result.panel||!Array.isArray(result.panel.coffees))throw new Error('Unable to read this Panel Report. Check the Report ID and try again.');
      onRecall(result.panel,id.trim());
    }catch(err){if(live.current)setError(err.message||'Unable to recall this report. Please try again.');}
    finally{if(live.current)setBusy(false);}
  };
  return <dialog ref={dialog} className="collab-password-dialog" aria-labelledby="recall-panel-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="collab-dialog-title"><h2 id="recall-panel-title">Recall Panel Report</h2><button type="button" aria-label="Close report recall" onClick={onClose}>×</button></div>
    <p>Paste the Report ID from the Osito Panel Reports sheet.</p>
    <form onSubmit={recall}><label>Report ID<input autoFocus autoComplete="off" placeholder="Paste Report ID" value={id} maxLength={120} onFocus={event=>event.target.select()} onChange={event=>setId(event.target.value)}/></label>
      {error&&<p className="collab-error" role="alert">{error}</p>}
      <button type="submit" className="collab-primary" disabled={busy||!id.trim()}>{busy?'Recalling report…':'Recall report'}</button>
    </form>
  </dialog>;
}
