import React from 'react';
import Icon from './Icon';

const copy = {
  en: { refresh: 'Refresh Lot Data', loading: 'Refreshing lot data...', saved: 'Lot data saved', empty: 'Lot data not downloaded yet', failed: 'Refresh failed. Saved lot data is still available.', offline: 'Offline. Using saved lot data.', memory: 'Available for this visit; device storage is full.' },
  es: { refresh: 'Actualizar datos de lotes', loading: 'Actualizando datos de lotes...', saved: 'Datos de lotes guardados', empty: 'Datos de lotes aún no descargados', failed: 'No se pudo actualizar. Los datos guardados siguen disponibles.', offline: 'Sin conexión. Usando datos guardados.', memory: 'Disponible durante esta visita; el almacenamiento está lleno.' },
  'pt-BR': { refresh: 'Atualizar dados dos lotes', loading: 'Atualizando dados dos lotes...', saved: 'Dados dos lotes salvos', empty: 'Dados dos lotes ainda não baixados', failed: 'Falha ao atualizar. Os dados salvos continuam disponíveis.', offline: 'Sem conexão. Usando dados salvos.', memory: 'Disponível nesta visita; o armazenamento está cheio.' },
};

export default function LotCacheControl({ lookup, language }) {
  const t = copy[language] || copy.en;
  const { catalog } = lookup;
  return <div className="lot-cache-control">
    <button type="button" className="eink-toggle eink-toggle-compact" onClick={lookup.refresh} disabled={catalog.status === 'loading'}>
      <Icon name="refresh-cw" size={16} />{t.refresh}
    </button>
    <span role="status">{['loading', 'failed', 'offline', 'memory'].includes(catalog.status) ? t[catalog.status] : catalog.refreshedAt ? `${t.saved}: ${new Date(catalog.refreshedAt).toLocaleString(language)}` : t.empty}</span>
  </div>;
}
