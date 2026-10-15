import React, { useEffect, useRef } from 'react';

export default function PanelPasswordDialog({ password, onPassword, onUnlock, onClose, busy, error }) {
  const dialog = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    return () => { document.body.style.overflow = priorOverflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={dialog} className="collab-password-dialog" aria-labelledby="panel-unlock-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="collab-dialog-title"><h2 id="panel-unlock-title">Open Panel Report</h2><button type="button" aria-label="Close password prompt" onClick={onClose}>×</button></div>
    <p>Enter your password to continue.</p>
    <form onSubmit={event=>{event.preventDefault();if(!busy&&password)onUnlock();}}><label>Panel password<input type="password" autoComplete="off" value={password} onChange={event=>onPassword(event.target.value)} autoFocus/></label>
      {error&&<p className="collab-error" role="alert">{error}</p>}
      <button type="submit" className="collab-primary" disabled={busy||!password}>{busy?'Opening…':'Open composer'}</button>
    </form>
  </dialog>;
}
