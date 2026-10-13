import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { sessionFingerprint } from '../lib/sharedSync';

const text = {
  en: {
    button: 'Update Session', checking: 'Checking for updates...', close: 'Close', cancel: 'Keep This Version',
    newer: 'A newer session is available', current: 'This session is up to date.',
    pending: 'Your local changes are waiting to sync. Nothing was replaced.',
    replace: 'Load Updated Session', warning: 'This replaces the session on this device, including any unsynced changes. Save a separate copy or export CSV first if you need to keep them.',
    replaceInfo: 'Load the latest saved names, scores, and notes onto this device?',
    updated: 'Last synced', unknown: 'Previous sync time unavailable', legacy: 'Check the saved version before continuing',
    sharedConflict: 'Another device updated this session. Check for updates before continuing.',
    sharedBaselineMissing: 'Check Update Session before syncing. This device cannot verify its last synced copy.',
    sharedUpgrade: 'The Google Apps Script needs its new version deployed before session updates can be used.',
    updateOffline: 'You are offline. Your local session is unchanged.', updateBusy: 'An upload is finishing. Please try again in a moment.',
    failed: 'Could not check for updates. Your local session is unchanged.',
  },
  es: {
    button: 'Actualizar sesión', checking: 'Buscando actualizaciones...', close: 'Cerrar', cancel: 'Conservar esta versión',
    newer: 'Hay una sesión más reciente', current: 'Esta sesión está actualizada.',
    pending: 'Los cambios locales están pendientes de sincronización. No se reemplazó nada.',
    replace: 'Cargar sesión actualizada', warning: 'Se reemplazará la sesión de este dispositivo, incluidos los cambios sin sincronizar. Guarda una copia independiente o exporta un CSV primero si quieres conservarlos.',
    replaceInfo: '¿Cargar los últimos nombres, puntuaciones y notas guardados en este dispositivo?',
    updated: 'Última sincronización', unknown: 'Hora de sincronización anterior no disponible', legacy: 'Revisa la versión guardada antes de continuar',
    sharedConflict: 'Otro dispositivo actualizó esta sesión. Busca actualizaciones antes de continuar.',
    sharedBaselineMissing: 'Consulta Actualizar sesión antes de sincronizar. Este dispositivo no puede verificar su última copia sincronizada.',
    sharedUpgrade: 'Debes implementar la nueva versión de Google Apps Script para actualizar sesiones.',
    updateOffline: 'Sin conexión. La sesión local no cambió.', updateBusy: 'Se está completando una subida. Inténtalo de nuevo en un momento.',
    failed: 'No se pudieron buscar actualizaciones. La sesión local no cambió.',
  },
  'pt-BR': {
    button: 'Atualizar sessão', checking: 'Buscando atualizações...', close: 'Fechar', cancel: 'Manter esta versão',
    newer: 'Há uma sessão mais recente', current: 'Esta sessão está atualizada.',
    pending: 'As alterações locais estão aguardando sincronização. Nada foi substituído.',
    replace: 'Carregar sessão atualizada', warning: 'Isso substitui a sessão neste dispositivo, incluindo alterações não sincronizadas. Salve uma cópia separada ou exporte um CSV primeiro se precisar mantê-las.',
    replaceInfo: 'Carregar os últimos nomes, notas e observações salvos neste dispositivo?',
    updated: 'Última sincronização', unknown: 'Horário da sincronização anterior indisponível', legacy: 'Confira a versão salva antes de continuar',
    sharedConflict: 'Outro dispositivo atualizou esta sessão. Verifique as atualizações antes de continuar.',
    sharedBaselineMissing: 'Confira Atualizar sessão antes de sincronizar. Este dispositivo não pode verificar sua última cópia sincronizada.',
    sharedUpgrade: 'É necessário implantar a nova versão do Google Apps Script para atualizar sessões.',
    updateOffline: 'Você está offline. A sessão local não foi alterada.', updateBusy: 'Um envio está sendo concluído. Tente novamente em instantes.',
    failed: 'Não foi possível verificar as atualizações. A sessão local não foi alterada.',
  },
};

export default function SessionUpdate({ session, sync, onReplace, language }) {
  const t = key => (text[language] || text.en)[key];
  const [state, setState] = useState(null);
  const dialog = useRef(null), request = useRef(0);
  const release = useRef(sync.release);
  release.current = sync.release;
  useEffect(() => () => { request.current++; release.current(session.syncId); }, [session.syncId]);
  useEffect(() => {
    if (state && !dialog.current.open) dialog.current.showModal();
    if (!state && dialog.current.open) dialog.current.close();
  }, [state]);
  const close = () => {
    request.current++;
    sync.release(session.syncId);
    setState(null);
  };
  const check = async () => {
    const token = ++request.current;
    setState({ kind: 'checking' });
    try {
      const { remote, dirty, baselineKnown } = await sync.checkRemote(session);
      if (token !== request.current) return;
      const same = sessionFingerprint(remote) === sessionFingerprint(session);
      if (same) {
        onReplace(remote);
        setState({ kind: 'current' });
      } else if (baselineKnown && Number.isSafeInteger(session.sharedRevision) && remote.sharedRevision === session.sharedRevision) {
        setState({ kind: 'pending' });
      } else {
        setState({ kind: 'newer', remote, dirty });
      }
    } catch (error) {
      if (token === request.current) setState({ kind: 'error', message: t(error.message) || t('failed') });
    }
  };
  const conflict = sync.conflicts[session.syncId];
  const legacy = !Number.isSafeInteger(session.sharedRevision);
  return <div className="session-update print-hidden">
    <button type="button" onClick={check} disabled={!!state} className="session-update-button" title={t('button')}>
      <Icon name="refresh-cw" size={16} />{t('button')}
    </button>
    <span role="status">{conflict ? t(conflict) : legacy ? t('legacy') : session.sharedUpdatedAt ? `${t('updated')}: ${new Date(session.sharedUpdatedAt).toLocaleString(language)}` : ''}</span>
    <dialog ref={dialog} className="session-update-dialog" aria-labelledby="session-update-title" onCancel={event => { event.preventDefault(); close(); }}>
      <header><h2 id="session-update-title">{t('button')}</h2><button type="button" onClick={close} aria-label={t('close')}><Icon name="x" size={20} /></button></header>
      <div aria-live="polite">
        <p>{state?.kind === 'error' ? state.message : t(state?.kind)}</p>
        {state?.kind === 'newer' && <>
          <p className="session-update-time">{state.remote.sharedUpdatedAt ? new Date(state.remote.sharedUpdatedAt).toLocaleString(language) : t('unknown')}</p>
          <p>{t(state.dirty ? 'warning' : 'replaceInfo')}</p>
        </>}
      </div>
      <footer>
        <button type="button" onClick={close}>{t(state?.kind === 'newer' ? 'cancel' : 'close')}</button>
        {state?.kind === 'newer' && <button type="button" className="btn-stone-dark" onClick={() => {
          try { onReplace(state.remote); close(); }
          catch { setState({ kind: 'error', message: t('failed') }); }
        }}>{t('replace')}</button>}
      </footer>
    </dialog>
  </div>;
}
