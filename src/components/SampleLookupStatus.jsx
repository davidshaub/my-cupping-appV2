import React from 'react';
import Icon from './Icon';

const copy = {
  en: { loading: 'Looking up sample...', filled: 'Sample details loaded', missing: 'No matching Sample ID', ambiguous: 'Multiple matches found.', failed: 'Lookup unavailable. Manual entry still works.', offline: 'Offline. Enter details manually or retry online.', notConfigured: 'Sample lookup is not set up yet.', review: 'AirTable details available', apply: 'Replace These Details', keep: 'Keep Current Details', retry: 'Retry lookup', ositoId: 'Osito ID', lotName: 'Lot Name', sampleType: 'Sample Type', moisture: 'Moisture', waterActivity: 'Water Activity' },
  es: { loading: 'Buscando muestra...', filled: 'Datos de la muestra cargados', missing: 'No se encontró el ID de muestra', ambiguous: 'Se encontraron varias coincidencias.', failed: 'Consulta no disponible. Puedes ingresar los datos manualmente.', offline: 'Sin conexión. Ingresa los datos manualmente o vuelve a intentar con conexión.', notConfigured: 'La búsqueda de muestras aún no está configurada.', review: 'Datos de AirTable disponibles', apply: 'Reemplazar estos datos', keep: 'Conservar datos actuales', retry: 'Reintentar consulta', ositoId: 'ID Osito', lotName: 'Nombre del lote', sampleType: 'Tipo de Muestra', moisture: 'Humedad', waterActivity: 'Actividad de Agua' },
  'pt-BR': { loading: 'Buscando amostra...', filled: 'Dados da amostra carregados', missing: 'ID de amostra não encontrado', ambiguous: 'Vários resultados encontrados.', failed: 'Consulta indisponível. Você pode preencher manualmente.', offline: 'Sem conexão. Preencha manualmente ou tente novamente online.', notConfigured: 'A busca de amostras ainda não foi configurada.', review: 'Dados do AirTable disponíveis', apply: 'Substituir estes dados', keep: 'Manter dados atuais', retry: 'Tentar novamente', ositoId: 'ID Osito', lotName: 'Nome do lote', sampleType: 'Tipo de Amostra', moisture: 'Umidade', waterActivity: 'Atividade de Água' },
};

export default function SampleLookupStatus({ sample, lookup, language, compact = false }) {
  const state = lookup.states[sample.syncId];
  if (!state || state.id !== String(sample.labSampleId || '').trim()) return null;
  const t = copy[language] || copy.en;
  if (compact && state.status === 'filled') return <span className="lot-lookup-check" role="status" aria-label={t.filled} title={t.filled}>
    <span aria-hidden="true"><Icon name="check" size={16} /></span>
  </span>;
  return <div className="lot-lookup-status" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {state.status === 'review' ? <details>
      <summary>{t.review}</summary>
      <dl>{['ositoId', 'lotName', 'sampleType', 'moisture', 'waterActivity'].filter(key => state.patch[key]).map(key => <React.Fragment key={key}>
        <dt>{t[key]}</dt><dd>{state.patch[key]}</dd>
      </React.Fragment>)}</dl>
      <button type="button" className="lot-lookup-apply" onClick={() => lookup.apply(sample.syncId, state)}>{t.apply}</button>
      <button type="button" onClick={() => lookup.dismiss(sample.syncId)}>{t.keep}</button>
    </details> : <div role="status">
      <span>{t[state.status]}</span>
      {['failed', 'offline', 'missing', 'ambiguous'].includes(state.status) && <button type="button" className="lot-lookup-retry" title={t.retry} aria-label={t.retry} onClick={() => lookup.retry(sample)}><Icon name="refresh-cw" size={16} /></button>}
    </div>}
  </div>;
}
