import { SHEET_URL } from '../lib/googleSheets.js';

export default function GoogleSheetsSync({ sync, t }) {
  return <section aria-label={t('googleSheets')} className="print-hidden rounded-xl border border-stone-200 bg-white p-3 my-3 text-left">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <a href={SHEET_URL} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-stone-800 underline">{t('googleSheets')}</a>
        <p role="status" className="text-xs text-stone-600 mt-1">{t(sync.status)}</p>
      </div>
      <div className="flex gap-2">
        {sync.connected && <button type="button" onClick={sync.retry} disabled={!sync.online || sync.status === 'googleSyncing'} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold disabled:opacity-50">{t('googleSyncNow')}</button>}
        <button type="button" onClick={sync.connected ? sync.disconnect : sync.connect} disabled={!sync.connected && (!sync.online || sync.status === 'googleConnecting' || (!sync.ready && !sync.error))} className="rounded-lg bg-stone-900 text-white px-3 py-2 text-xs font-bold disabled:opacity-50">{t(sync.connected ? 'googleDisconnect' : 'googleConnect')}</button>
      </div>
    </div>
    <p className="text-xs text-stone-500 mt-2">{t(sync.offlineReady ? 'googleOfflineReady' : 'googleOfflinePreparing')}</p>
    {!sync.connected && <p className="text-xs text-stone-500 mt-2">{t('googleSyncHelp')}</p>}
    {sync.error && <p role="alert" className="text-xs text-red-700 mt-2">{t(sync.error)}</p>}
  </section>;
}
