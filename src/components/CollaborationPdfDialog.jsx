import React, { useEffect, useRef, useState } from 'react';
import { safeFilenamePart } from '../lib/reportFilenames';

export default function CollaborationPdfDialog({ options, onClose }) {
  const dialog = useRef(null), live = useRef(true), objectUrls = useRef(new Set());
  const [url,setUrl] = useState(''), [error,setError] = useState(''), [zipBusy,setZipBusy] = useState(false);
  const [retry,setRetry] = useState(0);
  const filename = `${safeFilenamePart(options.title, 'Osito_Report')}.pdf`;
  useEffect(() => {
    live.current = true;
    const trigger = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current.showModal();
    return () => { live.current = false; document.body.style.overflow = overflow; objectUrls.current.forEach(value=>URL.revokeObjectURL(value)); objectUrls.current.clear(); if(trigger?.isConnected)trigger.focus(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError('');
    import('../lib/collaborationPdf').then(module=>module.buildCollaborationPdf(options)).then(bytes=>{
      if(cancelled || !live.current)return;
      const nextUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})); objectUrls.current.add(nextUrl); setUrl(nextUrl);
    }).catch(err=>{if(!cancelled&&live.current)setError(err.message||'Unable to prepare the PDF. Please retry.');});
    return ()=>{cancelled=true;};
  }, [options,retry]);
  const downloadSet = async () => {
    if(zipBusy)return;
    setZipBusy(true);setError('');
    try {
      const {buildCollaborationPdfSet}=await import('../lib/collaborationPdf');
      const result=await buildCollaborationPdfSet(options);
      if(!live.current)return;
      const zipUrl=URL.createObjectURL(new Blob([result.zipBytes],{type:'application/zip'}));objectUrls.current.add(zipUrl);
      const link=document.createElement('a');link.href=zipUrl;link.download=result.zipFilename;document.body.append(link);link.click();link.remove();
      setTimeout(()=>{URL.revokeObjectURL(zipUrl);objectUrls.current.delete(zipUrl);},60000);
    } catch(err) { if(live.current)setError(err.message||'Unable to prepare the PDF set. Please retry.'); }
    finally { if(live.current)setZipBusy(false); }
  };
  return <dialog ref={dialog} className="collab-password-dialog collab-export-dialog" aria-labelledby="collab-export-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="collab-dialog-title"><h2 id="collab-export-title">Export PDF</h2><button autoFocus type="button" aria-label="Close PDF export" onClick={onClose}>×</button></div>
    <p className="collab-muted">{filename}</p>
    {!url&&!error&&<p role="status">Preparing your PDF…</p>}
    {error&&<p className="collab-error" role="alert">{error}</p>}
    {!url&&error&&<button onClick={()=>setRetry(value=>value+1)}>Retry PDF preparation</button>}
    {url&&<div className="collab-export-actions"><a className="collab-export-primary" href={url} target="_blank" rel="noopener noreferrer">Open / Print PDF</a><a href={url} download={filename}>Download PDF</a><button disabled={zipBusy} onClick={downloadSet}>{zipBusy?'Preparing PDF set…':'Download PDF set'}</button><small>ZIP containing a separate PDF for each coffee, named after the coffee.</small></div>}
  </dialog>;
}
