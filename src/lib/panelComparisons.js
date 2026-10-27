// One row describes one output coffee; commas separate that coffee's source evaluations.
export function parseCoffeeComparisons(text) {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Enter one coffee group per line, with Sample IDs separated by commas.');
  const used = new Set();
  return lines.map((line, index) => {
    const ids = line.split(',').map(id => id.trim()).filter(Boolean);
    if (!ids.length || ids.some(id => /[\s;]/.test(id))) throw new Error(`Line ${index + 1}: separate Sample IDs with commas; start a new line for another coffee.`);
    ids.forEach(id => { if (used.has(id)) throw new Error(`Sample ID ${id} appears more than once. Include each evaluation in only one group.`); used.add(id); });
    return ids;
  });
}

export function planCoffeeComparisons(lines, records) {
  const byId = new Map(records.map(record => [record.id, record]));
  return lines.map((ids, index) => {
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length) throw new Error(`Coffee ${index + 1}: Sample ID not found: ${missing.join(', ')}. Check the sheet and try again.`);
    const sample = byId.get(ids[0]).sample;
    return { id: crypto.randomUUID(), name: sample.lotName || sample.ositoId || `Coffee ${index + 1}`, sample, ids, summary: '' };
  });
}

export function suggestSessionComparisons(records) {
  const grouped = new Map();
  records.forEach(record => {
    // Lot names and table positions are not reliable identities across sessions.
    // Evaluations without a lot ID remain separate for manual review.
    const lot = String(record.sample.ositoId || '').trim().toLowerCase();
    const key = lot ? `lot:${lot}` : `evaluation:${record.id}`;
    const group = grouped.get(key);
    if (group) group.ids.push(record.id);
    else grouped.set(key, { id: crypto.randomUUID(), name: record.sample.lotName || record.sample.ositoId || 'Coffee', sample: record.sample, ids: [record.id], summary: '' });
  });
  return [...grouped.values()];
}
