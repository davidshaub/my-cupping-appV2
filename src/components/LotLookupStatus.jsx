import React from 'react';
import Icon from './Icon';

const copy = {
  en: { loading: 'Looking up lot...', filled: 'Lot details loaded', missing: 'No matching Lot ID', ambiguous: 'Multiple matches. Check Lot Summary.', failed: 'Lookup unavailable. Manual entry still works.', offline: 'Offline. Enter details manually or retry online.', review: 'Sheet details available', apply: 'Replace These Details', keep: 'Keep Current Details', retry: 'Retry lookup', lotName: 'Lot Name', country: 'Country', processing: 'Processing' },
  es: { loading: 'Buscando lote...', filled: 'Datos del lote cargados', missing: 'No se encontró el ID', ambiguous: 'Varias coincidencias. Revisa Lot Summary.', failed: 'Consulta no disponible. Puedes ingresar los datos manualmente.', offline: 'Sin conexión. Ingresa los datos manualmente o vuelve a intentar con conexión.', review: 'Datos de la hoja disponibles', apply: 'Reemplazar estos datos', keep: 'Conservar datos actuales', retry: 'Reintentar consulta', lotName: 'Nombre del lote', country: 'País', processing: 'Procesamiento' },
  'pt-BR': { loading: 'Buscando lote...', filled: 'Dados do lote carregados', missing: 'ID não encontrado', ambiguous: 'Vários resultados. Confira Lot Summary.', failed: 'Consulta indisponível. Você pode preencher manualmente.', offline: 'Sem conexão. Preencha manualmente ou tente novamente online.', review: 'Dados da planilha disponíveis', apply: 'Substituir estes dados', keep: 'Manter dados atuais', retry: 'Tentar novamente', lotName: 'Nome do lote', country: 'País', processing: 'Processamento' },
};

export default function LotLookupStatus({ sample, lookup, language }) {
  const state = lookup.states[sample.syncId];
  if (!state || state.id !== String(sample.ositoId || '').trim()) return null;
  const t = copy[language] || copy.en;
  return <div className="lot-lookup-status" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {state.status === 'review' ? <details>
      <summary>{t.review}</summary>
      <dl>{['lotName', 'country', 'processing'].filter(key => state.patch[key]).map(key => <React.Fragment key={key}>
        <dt>{t[key]}</dt><dd>{key === 'processing' && state.patch.processingOther ? state.patch.processingOther : state.patch[key]}</dd>
      </React.Fragment>)}</dl>
      <button type="button" className="lot-lookup-apply" onClick={() => lookup.apply(sample.syncId, state)}>{t.apply}</button>
      <button type="button" onClick={() => lookup.dismiss(sample.syncId)}>{t.keep}</button>
    </details> : <div role="status">
      <span>{t[state.status]}</span>
      {['failed', 'offline', 'missing', 'ambiguous'].includes(state.status) && <button type="button" className="lot-lookup-retry" title={t.retry} aria-label={t.retry} onClick={() => lookup.retry(sample)}><Icon name="history" size={16} /></button>}
    </div>}
  </div>;
}
