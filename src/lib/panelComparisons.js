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

// Returns { groups, warning }. Lot names and table positions are not reliable
// identities across sessions, so evaluations with an Osito ID only ever match
// other evaluations with the same Osito ID. Evaluations missing an Osito ID fall
// back to table position, but only when every one of them has a known position
// and they come from more than one session - otherwise they stay separate.
export function suggestSessionComparisons(records) {
  const grouped = new Map();
  const unresolved = [];
  records.forEach(record => {
    const lot = String(record.sample.ositoId || '').trim().toLowerCase();
    if (!lot) { unresolved.push(record); return; }
    const key = `lot:${lot}`;
    const group = grouped.get(key);
    if (group) group.ids.push(record.id);
    else grouped.set(key, { id: crypto.randomUUID(), name: record.sample.lotName || record.sample.ositoId || 'Coffee', sample: record.sample, ids: [record.id], summary: '' });
  });

  const sessionKeyOf = record => record.sessionCode || record.sourceSessionId || 'unknown';
  const sessionKeys = new Set(unresolved.map(sessionKeyOf));
  const canPairByPosition = sessionKeys.size > 1 && unresolved.every(record => Number.isInteger(record.position));
  let warning = '';
  if (canPairByPosition) {
    const counts = new Map();
    unresolved.forEach(record => counts.set(sessionKeyOf(record), (counts.get(sessionKeyOf(record)) || 0) + 1));
    if (new Set(counts.values()).size > 1) {
      warning = `Sessions without Osito IDs have different coffee counts (${[...counts.values()].join(' vs ')}); positions were paired as far as possible - review each group below before saving.`;
    }
    unresolved.forEach(record => {
      const key = `position:${record.position}`;
      const group = grouped.get(key);
      if (group) group.ids.push(record.id);
      else grouped.set(key, { id: crypto.randomUUID(), name: record.sample.lotName || `Coffee ${record.position}`, sample: record.sample, ids: [record.id], summary: '' });
    });
  } else {
    unresolved.forEach(record => {
      grouped.set(`evaluation:${record.id}`, { id: crypto.randomUUID(), name: record.sample.lotName || record.sample.ositoId || 'Coffee', sample: record.sample, ids: [record.id], summary: '' });
    });
  }
  return { groups: [...grouped.values()], warning };
}
