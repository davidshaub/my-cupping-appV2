import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export default function CsvExportDialog({ data, onClose, t }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [showText, setShowText] = useState(false);
  const [sharing, setSharing] = useState(false);
  const dialog = useRef(null);
  const file = useRef(typeof File === 'function' ? new File([data.text], data.name, { type: 'text/csv' }) : null).current;
  let canShare = false;
  try { canShare = Boolean(file && navigator.share && navigator.canShare?.({ files: [file] })); } catch { /* Unsupported file sharing. */ }
  useEffect(() => {
    const trigger = document.activeElement;
    const objectUrl = URL.createObjectURL(new Blob([data.text], { type: 'text/csv;charset=utf-8' }));
    setUrl(objectUrl);
    dialog.current?.focus();
    return () => {
      // Allow Android's download service time to retrieve a clicked link.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [data]);
  const share = async () => {
    setSharing(true);
    setMessage('');
    try { await navigator.share({ files: [file] }); }
    catch (error) { if (error.name !== 'AbortError') setMessage(t('csvExportError')); }
    finally { setSharing(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(data.text); setMessage(t('csvCopied')); }
    catch { setShowText(true); setMessage(t('csvExportError')); }
  };
  return <div className="pdf-ready-backdrop">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="csv-export-title" className="pdf-ready-dialog csv-export-dialog" onKeyDown={event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const controls = event.currentTarget.querySelectorAll('button:not(:disabled), a[href], textarea');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <button type="button" className="pdf-ready-close" onClick={onClose} aria-label={t('closeCsv')}><Icon name="x" size={20} /></button>
      <h2 id="csv-export-title">{t('exportCsv')}</h2>
      <p>{data.name}</p>
      <div className="csv-export-actions">
        {url && <a href={url} download={data.name}>{t('downloadCsv')}</a>}
        {canShare && <button type="button" disabled={sharing} onClick={share}>{t('shareCsv')}</button>}
        <button type="button" onClick={copy}>{t('copyCsv')}</button>
        <button type="button" aria-expanded={showText} onClick={() => setShowText(value => !value)}>{t('viewCsv')}</button>
      </div>
      {message && <p role="status">{message}</p>}
      {showText && <textarea aria-label="CSV" readOnly value={data.text} onFocus={event => event.target.select()} />}
    </section>
  </div>;
}
