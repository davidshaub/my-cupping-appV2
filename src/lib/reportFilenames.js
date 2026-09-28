export const safeFilenamePart = (value, fallback) => {
  const cleaned = String(value || fallback || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2022/g, '|')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\n\t]/g, '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return cleaned || fallback;
};

export const uniquePdfFilename = (sample, index, used) => {
  const base = safeFilenamePart(sample.ositoId || sample.lotName, `Sample_${String(index + 1).padStart(2, '0')}`);
  const count = (used.get(base) ?? 0) + 1;
  used.set(base, count);
  return count === 1 ? `${base}.pdf` : `${base}_${count}.pdf`;
};

export const reportPdfFilename = (samples, sessionName) => samples.length === 1
  ? uniquePdfFilename(samples[0], 0, new Map())
  : `${safeFilenamePart(sessionName, 'Cupping_Report')}.pdf`;
