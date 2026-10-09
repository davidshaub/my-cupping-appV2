import React, { useEffect, useRef } from 'react';
import Icon from './Icon';

export default function CoffeeReportModal({ title, onClose, onCreatePdf, suspended, t, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!suspended) dialog.current?.focus({ preventScroll: true });
  }, [suspended]);
  return <div className="coffee-preview-backdrop">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="coffee-preview-title"
      aria-hidden={suspended || undefined} className="coffee-preview report-screen"
      onKeyDown={event => {
        if (suspended) return;
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
          const controls = event.currentTarget.querySelectorAll('button:not(:disabled), a[href]');
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="coffee-preview-header">
        <h2 id="coffee-preview-title">{title}</h2>
        <button type="button" onClick={onCreatePdf} className="coffee-preview-pdf"><Icon name="download" size={16} />{t('createPdf')}</button>
        <button type="button" onClick={onClose} aria-label={t('closeReport')} title={t('closeReport')} className="coffee-preview-close"><Icon name="x" size={20} /></button>
      </header>
      <div className="coffee-preview-body">{children}</div>
    </section>
  </div>;
}
