import React, { useEffect, useState } from 'react';
import { translate, normalizeLanguage } from '../i18n';
import Icon from './Icon';

// Deliberately outside the App component tree: App.jsx has a separate top-level return per screen
// (setup, cupping, metadata, report, history...), so a toast that lives inside any one of them would
// vanish on every screen change. This mounts once, independent of whichever screen is showing, and
// listens for a plain window event — any part of the app can trigger it with no prop drilling.
// window.dispatchEvent(new CustomEvent('osito-toast', { detail: { kind: 'info'|'warning', key, autoDismiss } }))
export default function ToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const onToast = (event) => setToast(event.detail);
    window.addEventListener('osito-toast', onToast);
    return () => window.removeEventListener('osito-toast', onToast);
  }, []);

  useEffect(() => {
    if (!toast?.autoDismiss) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const language = normalizeLanguage(localStorage.getItem('cupping_language'));
  const isWarning = toast.kind === 'warning';

  return (
    <div className={`osito-toast ${isWarning ? 'osito-toast-warning' : ''}`} role="status">
      <span>{translate(language, toast.key)}</span>
      {!toast.autoDismiss && (
        <button type="button" onClick={() => setToast(null)} aria-label={translate(language, 'closeAlert')}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
