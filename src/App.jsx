import React, { useEffect, useRef, useState } from 'react';
import {
  CATEGORIES,
  CATEGORISED_LEXICON,
  INITIAL_SCORE,
  NEGATIVE_LEXICON
} from './constants';
import {
  calculateTotal,
  downloadCSV,
  getBaseTag,
  importSessionFromCSV,
  initializeSamples
} from './lib/cupping';
import DonutChart from './components/DonutChart';
import Icon from './components/Icon';
import LexiconSearch from './components/LexiconSearch';
import ReportTags from './components/ReportTags';
import ScoreControl from './components/ScoreControl';
import SpiderGraph from './components/SpiderGraph';
import HandsLogo from '../assets/hands.png';
import HandsPrintLogo from '../assets/hands-print-clean.png';
import LevelSelector from './components/LevelSelector';
import {
  translate,
  translateLevel,
  translateProcessing,
  translateScoreLabel
} from './i18n';

const EInkToggle = ({ isActive, onToggle, t, compact = false, className = '' }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={isActive}
    className={`eink-toggle ${isActive ? 'is-active' : ''} ${compact ? 'eink-toggle-compact' : ''} ${className}`}
    title={isActive ? t('switchStandard') : t('switchBw')}
  >
    <span>{t('bwMode')}</span>
    {!compact && <span className="eink-toggle-state">{isActive ? t('on') : t('off')}</span>}
  </button>
);

const LanguageToggle = ({ language, onToggle, t, compact = false, className = '' }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`eink-toggle ${compact ? 'eink-toggle-compact' : ''} ${className}`}
    title={language === 'en' ? t('switchSpanish') : t('switchEnglish')}
  >
    <span>{language === 'en' ? 'ES' : 'EN'}</span>
    {!compact && <span className="eink-toggle-state">{language === 'en' ? 'Español' : 'English'}</span>}
  </button>
);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const METADATA_TABLE_COLUMNS = ['ositoId', 'lotName', 'processing', 'waterActivity', 'moisture', 'processingOther'];
const METADATA_NUMERIC_COLUMNS = new Set(['waterActivity', 'moisture']);

const parseClipboardRows = (text) => {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
  if (!normalized) return [];
  return normalized.split('\n').map((line) => line.split('\t'));
};

const App = () => {
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [displayMode, setDisplayMode] = useState('standard');
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem('cupping_language') === 'es' ? 'es' : 'en';
  });
  const [appState, setAppState] = useState('setup');
  const [metadataOrigin, setMetadataOrigin] = useState('setup');
  const [numSamples, setNumSamples] = useState(1);
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);
  const [samples, setSamples] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [history, setHistory] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [activeSessionName, setActiveSessionName] = useState('');
  const [activeSavedSessionId, setActiveSavedSessionId] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, onConfirm: null });
  const [metadataTableMode, setMetadataTableMode] = useState(false);
  const [metadataTableSelection, setMetadataTableSelection] = useState({ anchor: null, focus: null });
  const [metadataTableSort, setMetadataTableSort] = useState(null);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingPdfs, setIsExportingPdfs] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [sampleDrag, setSampleDrag] = useState(null);
  const importInputRef = useRef(null);
  const metadataTableBodyRef = useRef(null);
  const metadataTableSelectingRef = useRef(false);
  const sampleDragRef = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.displayMode = displayMode;
  }, [displayMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    localStorage.setItem('cupping_language', language);
  }, [language]);

  useEffect(() => {
    const saved = localStorage.getItem('cupping_history');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) setHistory(parsed);
    } catch {
      localStorage.removeItem('cupping_history');
    }
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const stopTableSelection = () => {
      metadataTableSelectingRef.current = false;
    };

    window.addEventListener('pointerup', stopTableSelection);
    window.addEventListener('pointercancel', stopTableSelection);
    return () => {
      window.removeEventListener('pointerup', stopTableSelection);
      window.removeEventListener('pointercancel', stopTableSelection);
    };
  }, []);

  useEffect(() => {
    if (!metadataTableMode) return;

    setMetadataTableSelection((current) => {
      if (!current.anchor || !current.focus || samples.length === 0) return { anchor: null, focus: null };
      const clampCell = (cell) => ({
        row: Math.min(Math.max(cell.row, 0), samples.length - 1),
        col: Math.min(Math.max(cell.col, 0), METADATA_TABLE_COLUMNS.length - 1)
      });
      const next = { anchor: clampCell(current.anchor), focus: clampCell(current.focus) };
      if (next.anchor.row === current.anchor.row && next.anchor.col === current.anchor.col && next.focus.row === current.focus.row && next.focus.col === current.focus.col) {
        return current;
      }
      return next;
    });
  }, [metadataTableMode, samples.length]);

  const isMobile = viewportWidth < 640;
  const isTablet = viewportWidth >= 640 && viewportWidth < 1024;
  const isEinkMode = displayMode === 'eink';
  const t = (key) => translate(language, key);
  const reportRadarSize = isMobile ? 260 : isTablet ? 280 : 300;
  const reportDonutSize = isMobile ? 150 : isTablet ? 170 : 180;
  const reportRadarVerticalLabelSpace = reportRadarSize <= 260 ? 26 : 32;
  const reportBalanceOffset = isMobile ? 0 : reportRadarVerticalLabelSpace + (reportRadarSize - reportDonutSize) / 2;

  const openConfirm = (action) => setConfirmDialog({ open: true, onConfirm: action });
  const closeConfirm = () => setConfirmDialog({ open: false, onConfirm: null });
  const confirmAndRun = () => {
    confirmDialog.onConfirm?.();
    closeConfirm();
  };

  const resetToHome = () => {
    setSamples([]);
    setSessionStartTime(null);
    setActiveSampleIndex(0);
    setActiveSessionName('');
    setActiveSavedSessionId(null);
    setSessionName('');
    setAppState('setup');
  };

  const toggleDisplayMode = () => {
    setDisplayMode((current) => (current === 'eink' ? 'standard' : 'eink'));
  };
  const toggleLanguage = () => setLanguage((current) => (current === 'en' ? 'es' : 'en'));

  const cloneSamplesForSave = (sourceSamples = samples) =>
    sourceSamples.map((sample) => ({
      ...sample,
      scores: { ...(sample.scores ?? {}) },
      notes: {
        ...(sample.notes ?? {}),
        fragAromaTags: [...(sample.notes?.fragAromaTags ?? [])],
        inCupTags: [...(sample.notes?.inCupTags ?? [])],
        negativeTags: [...(sample.notes?.negativeTags ?? [])]
      }
    }));

  const buildSessionEntry = (id, name, existingEntry = {}, sourceSamples = samples, startTime = sessionStartTime) => ({
    ...existingEntry,
    id,
    name,
    date: new Date().toLocaleDateString(),
    startTime,
    samples: cloneSamplesForSave(sourceSamples),
    count: sourceSamples.length
  });

  const persistHistory = (updatedHistory) => {
    setHistory(updatedHistory);
    localStorage.setItem('cupping_history', JSON.stringify(updatedHistory));
  };

  const createAutosavedSession = (sourceSamples, startTime) => {
    const autosaveName = startTime || new Date().toLocaleString();
    const newEntry = buildSessionEntry(Date.now(), autosaveName, {}, sourceSamples, autosaveName);
    const updatedHistory = [newEntry, ...history];
    persistHistory(updatedHistory);
    setActiveSavedSessionId(newEntry.id);
    setActiveSessionName(newEntry.name);
    setSessionName(newEntry.name);
    return newEntry;
  };

  useEffect(() => {
    if (activeSavedSessionId === null || !sessionStartTime || samples.length === 0) return;

    setHistory((currentHistory) => {
      const existingIndex = currentHistory.findIndex((item) => item.id === activeSavedSessionId);
      if (existingIndex === -1) return currentHistory;

      const existingEntry = currentHistory[existingIndex];
      const updatedEntry = buildSessionEntry(
        activeSavedSessionId,
        activeSessionName || existingEntry.name || sessionStartTime,
        existingEntry,
        samples,
        sessionStartTime
      );
      const updatedHistory = currentHistory.map((item, idx) => (idx === existingIndex ? updatedEntry : item));
      localStorage.setItem('cupping_history', JSON.stringify(updatedHistory));
      return updatedHistory;
    });
  }, [samples, sessionStartTime, activeSavedSessionId, activeSessionName]);

  const openSaveSessionModal = () => {
    setSessionName(activeSessionName || sessionName);
    setShowSaveModal(true);
  };

  const closeSaveSessionModal = () => {
    setShowSaveModal(false);
  };

  const saveSessionLocal = (mode = 'new') => {
    const trimmedName = sessionName.trim();
    if (!trimmedName) return;

    if (mode === 'overwrite' && activeSavedSessionId !== null) {
      const existingEntry = history.find((item) => item.id === activeSavedSessionId);
      if (existingEntry) {
        const updatedEntry = buildSessionEntry(activeSavedSessionId, trimmedName, existingEntry);
        const updatedHistory = history.map((item) => (item.id === activeSavedSessionId ? updatedEntry : item));
        persistHistory(updatedHistory);
        setActiveSessionName(trimmedName);
        closeSaveSessionModal();
        return;
      }
    }

    const newEntry = {
      ...buildSessionEntry(Date.now(), trimmedName)
    };

    const updatedHistory = [newEntry, ...history];
    persistHistory(updatedHistory);
    setActiveSavedSessionId(newEntry.id);
    setActiveSessionName(trimmedName);
    closeSaveSessionModal();
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    const updated = history.filter((h) => h.id !== id);
    persistHistory(updated);
    if (activeSavedSessionId === id) setActiveSavedSessionId(null);
  };

  const loadSession = (session) => {
    const sessionSamples = Array.isArray(session.samples) ? session.samples : [];
    const loadedStartTime = session.startTime || new Date().toLocaleString();
    setSamples(sessionSamples);
    setNumSamples(sessionSamples.length || 1);
    setActiveSampleIndex(0);
    setSessionStartTime(loadedStartTime);
    setActiveSessionName(session.name || '');
    setActiveSavedSessionId(session.id ?? null);
    setSessionName(session.name || '');
    setAppState('report');
  };

  const startSession = () => {
    const startedAt = new Date().toLocaleString();
    const nextSamples = initializeSamples(numSamples);
    setSessionStartTime(startedAt);
    setSamples(nextSamples);
    setActiveSampleIndex(0);
    createAutosavedSession(nextSamples, startedAt);
    setAppState('cupping');
  };

  const goToMetadata = (origin) => {
    const nextStartTime = sessionStartTime || new Date().toLocaleString();
    const nextSamples = samples.length === 0 ? initializeSamples(numSamples) : samples;
    if (!sessionStartTime) setSessionStartTime(nextStartTime);
    if (samples.length === 0) setSamples(nextSamples);
    if (activeSavedSessionId === null && nextSamples.length > 0) createAutosavedSession(nextSamples, nextStartTime);
    setMetadataOrigin(origin);
    setAppState('metadata');
  };

  const isCsvFile = (file) => String(file?.name ?? '').toLowerCase().endsWith('.csv');

  const importSessionCsvFile = async (file) => {
    if (!file) return;
    setImportError('');
    setIsImporting(true);
    try {
      if (!isCsvFile(file)) {
        throw new Error(t('csvInvalidType'));
      }
      const text = await file.text();
      const imported = importSessionFromCSV(text, file.name);
      const importedStartTime = imported.sessionStartTime || new Date().toLocaleString();
      setSamples(imported.samples);
      setNumSamples(imported.samples.length);
      setActiveSampleIndex(0);
      setSessionStartTime(importedStartTime);
      setActiveSavedSessionId(null);
      setActiveSessionName(imported.sessionName || '');
      setSessionName(imported.sessionName || '');
      setAppState('report');
    } catch (err) {
      setImportError(language === 'es' ? t('csvImportError') : err?.message || t('csvImportError'));
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const printAllPdf = () => {
    const title = activeSessionName.trim() || `${t('report')} ${new Date().toLocaleString()}`;
    const pages = Array.from(document.querySelectorAll('.report-pages .sample-spec-sheet'));
    const printWindow = window.open('', '_blank');

    if (!printWindow || pages.length === 0) {
      const prev = document.title;
      document.title = title;
      window.print();
      setTimeout(() => {
        document.title = prev;
      }, 500);
      return;
    }

    const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => (node.tagName === 'LINK' ? `<link rel="stylesheet" href="${escapeHtml(node.href)}">` : node.outerHTML))
      .join('\n');
    const displayModeAttr = document.documentElement.dataset.displayMode ? ` data-display-mode="${escapeHtml(document.documentElement.dataset.displayMode)}"` : '';
    const pageMarkup = pages
      .map((page) => page.outerHTML.replace(/<img([^>]*?)src="[^"]*"([^>]*?)>/g, `<img$1src="${escapeHtml(HandsPrintLogo)}"$2>`))
      .join('\n');

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
<html lang="${escapeHtml(language)}"${displayModeAttr}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtml(window.location.href)}">
  <title>${escapeHtml(title)}</title>
  ${styleTags}
  <style>
    @page {
      size: letter landscape;
      margin: 0.3in;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html,
    body {
      width: auto;
      min-width: 0;
      min-height: 0;
      padding: 0;
      margin: 0;
      overflow: visible;
      background: #ffffff;
    }

    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f2b23;
    }

    .print-document {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    .print-hidden,
    .report-title,
    .report-signoff,
    .report-logo {
      display: none !important;
    }

    .print-only {
      display: block !important;
    }

    .sample-spec-sheet {
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      height: 6.85in !important;
      min-height: 6.85in !important;
      max-height: 6.85in !important;
      padding: 0 0 0.16in 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      border: 0 !important;
      background: #ffffff !important;
      box-shadow: none !important;
      display: grid !important;
      grid-template-rows: auto auto 1fr auto !important;
      gap: 0.12in !important;
      break-before: auto !important;
      break-after: auto !important;
      break-inside: avoid !important;
      page-break-before: auto !important;
      page-break-after: auto !important;
      page-break-inside: avoid !important;
    }

    .sample-spec-sheet + .sample-spec-sheet {
      break-before: page !important;
      page-break-before: always !important;
    }

    .sample-spec-sheet * {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .print-page-header {
      display: flex !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 0.24in !important;
      border-bottom: 1.4px solid #1c1917 !important;
      padding-bottom: 0.12in !important;
    }

    .print-page-footer {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 0.03in !important;
      width: 100% !important;
      margin-top: 0.02in !important;
      padding-top: 0.07in !important;
      border-top: 1.4px solid #1c1917 !important;
      text-align: center !important;
    }

    .print-footer-text {
      max-width: 100% !important;
      margin: 0 !important;
      overflow: hidden !important;
      color: #1f2b23 !important;
      font-size: 8.5px !important;
      font-weight: 800 !important;
      letter-spacing: 0.08em !important;
      line-height: 1.2 !important;
      text-align: center !important;
      text-transform: uppercase !important;
      white-space: nowrap !important;
    }

    .print-identity-block {
      margin: 0 !important;
    }

    .print-spec-grid,
    .spec-grid {
      display: grid !important;
      grid-template-columns: 4.85in 1fr !important;
      gap: 0.25in !important;
      margin-top: 0 !important;
      align-items: start !important;
    }

    .print-visual-row,
    .visual-row {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      gap: 0.16in !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      border-bottom: none !important;
    }

    .data-column {
      gap: 0.18in !important;
    }

    .print-tag-sections {
      gap: 0.14in !important;
    }

    .print-tag-sections > div {
      margin: 0 !important;
      padding-bottom: 0.03in !important;
    }

    .print-tag-sections > div > div {
      max-height: 0.72in !important;
      overflow: hidden !important;
    }

    .print-notes-block {
      margin-top: 0 !important;
      padding-top: 0.1in !important;
    }

    .print-notes-body {
      max-height: 1.05in !important;
      overflow: hidden !important;
      padding-right: 0 !important;
    }

    .print-logo {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 0.86in !important;
      margin-top: 0 !important;
      overflow: hidden !important;
    }

    .print-logo img {
      display: block !important;
      width: auto !important;
      height: 0.78in !important;
      max-width: none !important;
      max-height: none !important;
      object-fit: contain !important;
      transform: none !important;
      transform-origin: center center !important;
      image-rendering: auto !important;
    }
  </style>
</head>
<body>
  <main class="print-document">
    ${pageMarkup}
  </main>
  <script>
    const waitForImages = () => Promise.all(Array.from(document.images).map((img) => (
      img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      })
    )));
    const waitForFonts = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.all([waitForImages(), waitForFonts]).then(() => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 250);
    });
    window.addEventListener('afterprint', () => {
      setTimeout(() => window.close(), 500);
    });
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  const downloadPdfSet = async () => {
    if (isExportingPdfs || samples.length === 0) return;

    setIsExportingPdfs(true);
    try {
      const { downloadReportPdfZip } = await import('./lib/pdfReport');
      await downloadReportPdfZip(samples, {
        sessionStartTime,
        sessionName: activeSessionName,
        language,
        logoSrc: HandsPrintLogo
      });
    } catch (err) {
      console.error(err);
      window.alert(t('pdfExportError'));
    } finally {
      setIsExportingPdfs(false);
    }
  };

  const renderConfirmModal = () =>
    confirmDialog.open && (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-stone-900/70 backdrop-blur-sm p-6">
        <div className="bg-white w-full max-w-md rounded-[1.75rem] p-8 space-y-5 shadow-2xl">
          <div className="space-y-2">
            <h3 className="text-xl font-black text-stone-900 leading-tight">{t('leaveSessionTitle')}</h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              {t('leaveSessionBody')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={closeConfirm}
              className="w-full py-3 rounded-xl font-bold text-stone-700 bg-stone-100 border border-stone-200 hover:bg-stone-200 active:scale-95 transition"
            >
              {t('stayHere')}
            </button>
            <button onClick={confirmAndRun} className="w-full py-3 rounded-xl font-bold text-white btn-stone-dark active:scale-95 transition">
              {t('yesGoBack')}
            </button>
          </div>
        </div>
      </div>
    );

  const updateScore = (sampleIdx, cat, delta) => {
    setSamples((prev) => {
      const sample = prev[sampleIdx];
      const current = sample.scores[cat];
      const cur = current ?? 0;
      let next = current === null ? INITIAL_SCORE : Math.round((cur + delta) * 4) / 4;
      if (next < 0 && cat !== 'correction') next = 0;
      if (next > 10 && !['defects', 'correction'].includes(cat)) next = 10;

      return prev.map((item, idx) =>
        idx === sampleIdx
          ? {
              ...item,
              scores: {
                ...item.scores,
                [cat]: next
              }
            }
          : item
      );
    });
  };

  const updateLevel = (sampleIdx, field, value) => {
    setSamples((prev) =>
      prev.map((item, idx) =>
        idx === sampleIdx
          ? {
              ...item,
              notes: {
                ...item.notes,
                [field]: value
              }
            }
          : item
      )
    );
  };

  const updateMetadata = (sampleIdx, field, value) => {
    setSamples((prev) =>
      prev.map((item, idx) => {
        if (idx !== sampleIdx) return item;
        const next = { ...item, [field]: value };
        if (field === 'processingOther' && String(value ?? '').trim()) next.processing = 'Other';
        return next;
      })
    );
  };

  const getMetadataTableSelectionRange = (selection = metadataTableSelection) => {
    if (!selection.anchor || !selection.focus) return null;
    return {
      startRow: Math.min(selection.anchor.row, selection.focus.row),
      endRow: Math.max(selection.anchor.row, selection.focus.row),
      startCol: Math.min(selection.anchor.col, selection.focus.col),
      endCol: Math.max(selection.anchor.col, selection.focus.col)
    };
  };

  const isMetadataTableCellSelected = (row, col) => {
    const range = getMetadataTableSelectionRange();
    if (!range) return false;
    return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
  };

  const isMetadataTableCellActive = (row, col) => metadataTableSelection.focus?.row === row && metadataTableSelection.focus?.col === col;

  const focusMetadataTableCell = (row, col, { selectText = false } = {}) => {
    window.requestAnimationFrame(() => {
      const cell = metadataTableBodyRef.current?.querySelector(`[data-metadata-cell="${row}-${col}"]`);
      if (!cell) return;
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (selectText) cell.select?.();
    });
  };

  const selectMetadataTableCell = (row, col, { extend = false, focus = true, selectText = false } = {}) => {
    const nextCell = {
      row: Math.min(Math.max(row, 0), Math.max(samples.length - 1, 0)),
      col: Math.min(Math.max(col, 0), METADATA_TABLE_COLUMNS.length - 1)
    };
    setMetadataTableSelection((current) => ({
      anchor: extend && current.anchor ? current.anchor : nextCell,
      focus: nextCell
    }));
    if (focus) focusMetadataTableCell(nextCell.row, nextCell.col, { selectText });
  };

  const applyMetadataTableValueToSample = (sample, field, value) => {
    const next = { ...sample };
    const raw = String(value ?? '');

    if (field === 'processing') {
      const normalized = normalizeProcessingInput(raw, next.processingOther);
      next.processing = normalized.processing;
      next.processingOther = normalized.processingOther;
    } else if (field === 'processingOther') {
      next.processingOther = raw;
      if (raw.trim()) next.processing = 'Other';
    } else if (field === 'waterActivity') {
      next.waterActivity = formatWaterActivity(raw);
    } else if (field === 'moisture') {
      next.moisture = formatMoisture(raw);
    } else if (field === 'ositoId') {
      next.ositoId = raw;
    } else if (field === 'lotName') {
      next.lotName = raw;
    }

    return next;
  };

  const getMetadataTableDisplayValue = (sample, field) => {
    if (field === 'processing') return sample.processing && sample.processing !== 'Select One' ? translateProcessing(language, sample.processing) : '';
    return String(sample[field] ?? '');
  };

  const clearMetadataTableRange = (range = getMetadataTableSelectionRange()) => {
    if (!range) return;
    setSamples((prev) =>
      prev.map((item, rowIdx) => {
        if (rowIdx < range.startRow || rowIdx > range.endRow) return item;
        let next = item;
        for (let colIdx = range.startCol; colIdx <= range.endCol; colIdx += 1) {
          next = applyMetadataTableValueToSample(next, METADATA_TABLE_COLUMNS[colIdx], '');
        }
        return next;
      })
    );
  };

  const getMetadataTableSortValue = (sample, field) => {
    const raw = getMetadataTableDisplayValue(sample, field).trim();
    if (METADATA_NUMERIC_COLUMNS.has(field)) {
      const numeric = Number.parseFloat(raw.replace('%', ''));
      return {
        blank: raw === '' || Number.isNaN(numeric),
        value: Number.isNaN(numeric) ? 0 : numeric
      };
    }

    return {
      blank: raw === '',
      value: raw
    };
  };

  const compareMetadataTableValues = (a, b, field, direction) => {
    const aValue = getMetadataTableSortValue(a, field);
    const bValue = getMetadataTableSortValue(b, field);

    if (aValue.blank && bValue.blank) return 0;
    if (aValue.blank) return 1;
    if (bValue.blank) return -1;

    const comparison = METADATA_NUMERIC_COLUMNS.has(field)
      ? aValue.value - bValue.value
      : String(aValue.value).localeCompare(String(bValue.value), language, {
          sensitivity: 'base',
          numeric: true
        });

    return direction === 'desc' ? comparison * -1 : comparison;
  };

  const sortMetadataTable = (field, direction) => {
    if (!METADATA_TABLE_COLUMNS.includes(field) || samples.length < 2) return;

    const activeSampleId = samples[activeSampleIndex]?.id;
    const focusedCell = metadataTableSelection.focus;
    const focusedSampleId = focusedCell ? samples[focusedCell.row]?.id : null;
    const sortedSamples = samples
      .map((sample, index) => ({ sample, index }))
      .sort((a, b) => compareMetadataTableValues(a.sample, b.sample, field, direction) || a.index - b.index)
      .map(({ sample }) => sample);

    setSamples(sortedSamples);
    setMetadataTableSort({ field, direction });

    const nextActiveIndex = sortedSamples.findIndex((sample) => sample.id === activeSampleId);
    if (nextActiveIndex !== -1) setActiveSampleIndex(nextActiveIndex);

    if (focusedSampleId) {
      const nextFocusRow = sortedSamples.findIndex((sample) => sample.id === focusedSampleId);
      if (nextFocusRow !== -1) {
        const nextFocus = {
          row: nextFocusRow,
          col: Math.min(focusedCell.col, METADATA_TABLE_COLUMNS.length - 1)
        };
        setMetadataTableSelection({ anchor: nextFocus, focus: nextFocus });
        focusMetadataTableCell(nextFocus.row, nextFocus.col);
        return;
      }
    }

    setMetadataTableSelection({ anchor: null, focus: null });
  };

  const getActiveIndexAfterReorder = (currentIndex, fromIndex, toIndex) => {
    if (currentIndex === fromIndex) return toIndex;
    if (fromIndex < toIndex && currentIndex > fromIndex && currentIndex <= toIndex) return currentIndex - 1;
    if (fromIndex > toIndex && currentIndex >= toIndex && currentIndex < fromIndex) return currentIndex + 1;
    return currentIndex;
  };

  const reorderSamples = (fromIndex, toIndex) => {
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= samples.length ||
      toIndex >= samples.length
    ) {
      return;
    }

    setSamples((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setActiveSampleIndex((current) => getActiveIndexAfterReorder(current, fromIndex, toIndex));
    setMetadataTableSort(null);
  };

  const getTableReorderTargetIndex = (clientY) => {
    const rows = Array.from(metadataTableBodyRef.current?.querySelectorAll('[data-sample-row-index]') ?? []);
    if (rows.length === 0) return null;

    return rows.reduce(
      (closest, row) => {
        const rect = row.getBoundingClientRect();
        const index = Number(row.dataset.sampleRowIndex);
        const distance = Math.abs(clientY - (rect.top + rect.height / 2));
        return distance < closest.distance ? { index, distance } : closest;
      },
      { index: Number(rows[0].dataset.sampleRowIndex), distance: Infinity }
    ).index;
  };

  const startSampleReorder = (idx, e) => {
    if (samples.length < 2) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const dragState = { fromIndex: idx, overIndex: idx, pointerId: e.pointerId };
    sampleDragRef.current = dragState;
    setSampleDrag(dragState);
  };

  const updateSampleReorderTarget = (e) => {
    e.preventDefault();
    updateSampleReorderTargetFromClientY(e.clientY);
  };

  const updateSampleReorderTargetFromClientY = (clientY) => {
    const dragState = sampleDragRef.current;
    if (!dragState) return;
    const overIndex = getTableReorderTargetIndex(clientY);
    if (overIndex === null || overIndex === dragState.overIndex) return;

    const nextDragState = { ...dragState, overIndex };
    sampleDragRef.current = nextDragState;
    setSampleDrag(nextDragState);
  };

  const completeSampleReorder = () => {
    const dragState = sampleDragRef.current;
    if (!dragState) return;
    sampleDragRef.current = null;
    setSampleDrag(null);
    reorderSamples(dragState.fromIndex, dragState.overIndex);
  };

  const finishSampleReorder = (e) => {
    const dragState = sampleDragRef.current;
    if (!dragState) return;
    e.preventDefault();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    completeSampleReorder();
  };

  const cancelSampleReorder = (e) => {
    if (!sampleDragRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    sampleDragRef.current = null;
    setSampleDrag(null);
  };

  const handleSampleReorderKeyDown = (idx, e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      reorderSamples(idx, Math.max(0, idx - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      reorderSamples(idx, Math.min(samples.length - 1, idx + 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      reorderSamples(idx, 0);
    } else if (e.key === 'End') {
      e.preventDefault();
      reorderSamples(idx, samples.length - 1);
    }
  };

  const isSampleReordering = sampleDrag !== null;

  useEffect(() => {
    if (!isSampleReordering) return undefined;

    const handleWindowPointerMove = (event) => {
      if (sampleDragRef.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateSampleReorderTargetFromClientY(event.clientY);
    };

    const handleWindowPointerUp = (event) => {
      if (sampleDragRef.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      completeSampleReorder();
    };

    const handleWindowPointerCancel = (event) => {
      if (sampleDragRef.current?.pointerId !== event.pointerId) return;
      sampleDragRef.current = null;
      setSampleDrag(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [isSampleReordering]);

  const formatWaterActivity = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number.parseFloat(raw);
    if (Number.isNaN(numeric)) return '';
    const clamped = Math.min(Math.max(numeric, 0), 0.99);
    return clamped.toFixed(2);
  };

  const formatMoisture = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number.parseFloat(raw.replace('%', ''));
    if (Number.isNaN(numeric)) return '';
    const clamped = Math.min(Math.max(numeric, 0), 100);
    return clamped.toFixed(1);
  };

  const normalizeProcessingInput = (rawValue, existingDetails = '') => {
    const raw = String(rawValue ?? '').trim();
    if (!raw) return { processing: 'Select One', processingOther: '' };

    const lower = raw.toLowerCase();
    if (lower === 'select one' || lower === 'seleccionar' || lower === 'n/a') return { processing: 'Select One', processingOther: '' };

    const canonical = (processing) => ({
      processing,
      processingOther: processing === 'Other' ? existingDetails || '' : ''
    });

    if (lower === 'washed' || lower === 'wash' || lower === 'fully washed' || lower === 'lavado') return canonical('Washed');
    if (lower === 'natural' || lower === 'dry process' || lower === 'dry-processed') return canonical('Natural');
    if (lower === 'honey' || lower === 'miel') return canonical('Honey');
    if (lower === 'other' || lower === 'otro') return canonical('Other');

    if (/^(other|otro)\s*[:\\-–—]/i.test(raw)) {
      const details = raw.replace(/^(other|otro)\s*[:\\-–—]\s*/i, '').trim();
      return { processing: 'Other', processingOther: details || existingDetails || '' };
    }

    const match = ['Washed', 'Natural', 'Honey', 'Other', 'Select One'].find((opt) => opt.toLowerCase() === lower);
    if (match) return canonical(match);

    // Anything else becomes "Other" with the pasted/typed text moved to details.
    return { processing: 'Other', processingOther: raw };
  };

  const serializeMetadataTableRange = (range = getMetadataTableSelectionRange()) => {
    if (!range) return '';
    const lines = [];
    for (let rowIdx = range.startRow; rowIdx <= range.endRow; rowIdx += 1) {
      const sample = samples[rowIdx];
      if (!sample) continue;
      const cells = [];
      for (let colIdx = range.startCol; colIdx <= range.endCol; colIdx += 1) {
        cells.push(getMetadataTableDisplayValue(sample, METADATA_TABLE_COLUMNS[colIdx]));
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  };

  const handleTablePaste = (startRow, startCol, columnOrder, e) => {
    const text = e.clipboardData?.getData('text/plain') ?? e.clipboardData?.getData('text');
    const rows = parseClipboardRows(text);
    if (rows.length === 0) return;

    e.preventDefault();
    const range = getMetadataTableSelectionRange();
    const useRangeStart =
      range &&
      startRow >= range.startRow &&
      startRow <= range.endRow &&
      startCol >= range.startCol &&
      startCol <= range.endCol;
    const targetStartRow = useRangeStart ? range.startRow : startRow;
    const targetStartCol = useRangeStart ? range.startCol : startCol;
    const fillsSelection = useRangeStart && rows.length === 1 && rows[0].length === 1 && (range.endRow > range.startRow || range.endCol > range.startCol);
    const pasteEndRow = fillsSelection ? range.endRow : Math.min(samples.length - 1, targetStartRow + rows.length - 1);
    const pasteEndCol = fillsSelection
      ? range.endCol
      : Math.min(columnOrder.length - 1, targetStartCol + Math.max(...rows.map((cells) => cells.length)) - 1);

    setSamples((prev) =>
      prev.map((item, rowIdx) => {
        if (rowIdx < targetStartRow || rowIdx > pasteEndRow) return item;
        let next = item;
        for (let colIdx = targetStartCol; colIdx <= pasteEndCol; colIdx += 1) {
          const value = fillsSelection ? rows[0][0] : rows[rowIdx - targetStartRow]?.[colIdx - targetStartCol];
          if (value === undefined) continue;
          const colKey = columnOrder[colIdx];
          if (!colKey) continue;
          next = applyMetadataTableValueToSample(next, colKey, value);
        }
        return next;
      })
    );

    setMetadataTableSelection({
      anchor: { row: targetStartRow, col: targetStartCol },
      focus: { row: pasteEndRow, col: pasteEndCol }
    });
    focusMetadataTableCell(targetStartRow, targetStartCol);
  };

  const handleMetadataTableCopy = (e) => {
    const target = e.currentTarget;
    const range = getMetadataTableSelectionRange() ?? { startRow: Number(target.dataset.tableRow), endRow: Number(target.dataset.tableRow), startCol: Number(target.dataset.tableCol), endCol: Number(target.dataset.tableCol) };
    const hasTextSelection = typeof target.selectionStart === 'number' && target.selectionStart !== target.selectionEnd;
    if (hasTextSelection && range.startRow === range.endRow && range.startCol === range.endCol) return;

    const tableText = serializeMetadataTableRange(range);
    if (!tableText) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', tableText);
  };

  const handleMetadataTableCut = (e) => {
    handleMetadataTableCopy(e);
    if (e.defaultPrevented) clearMetadataTableRange();
  };

  const shouldMoveHorizontally = (e) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) return true;
    const valueLength = String(e.currentTarget.value ?? '').length;
    const selectionStart = e.currentTarget.selectionStart;
    const selectionEnd = e.currentTarget.selectionEnd;
    if (typeof selectionStart !== 'number' || typeof selectionEnd !== 'number') return true;
    if (selectionStart !== selectionEnd) return false;
    if (e.key === 'ArrowLeft') return selectionStart === 0;
    if (e.key === 'ArrowRight') return selectionStart === valueLength;
    return true;
  };

  const handleMetadataTableKeyDown = (row, col, e) => {
    const moveTo = (nextRow, nextCol, { extend = e.shiftKey, selectText = false } = {}) => {
      e.preventDefault();
      selectMetadataTableCell(nextRow, nextCol, { extend, selectText });
    };

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setMetadataTableSelection({
        anchor: { row: 0, col: 0 },
        focus: { row: Math.max(samples.length - 1, 0), col: METADATA_TABLE_COLUMNS.length - 1 }
      });
      focusMetadataTableCell(row, col);
      return;
    }

    if (e.key === 'Tab') {
      let nextRow = row;
      let nextCol = col + (e.shiftKey ? -1 : 1);
      if (nextCol < 0) {
        nextCol = METADATA_TABLE_COLUMNS.length - 1;
        nextRow -= 1;
      } else if (nextCol >= METADATA_TABLE_COLUMNS.length) {
        nextCol = 0;
        nextRow += 1;
      }
      moveTo(nextRow, nextCol, { extend: false, selectText: true });
      return;
    }

    if (e.key === 'Enter') {
      moveTo(row + (e.shiftKey ? -1 : 1), col, { extend: false, selectText: true });
      return;
    }

    if (e.key === 'Escape') {
      moveTo(row, col, { extend: false });
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && getMetadataTableSelectionRange()) {
      const range = getMetadataTableSelectionRange();
      if (range.endRow > range.startRow || range.endCol > range.startCol) {
        e.preventDefault();
        clearMetadataTableRange(range);
        return;
      }
    }

    if (e.key === 'ArrowUp') {
      moveTo(row - 1, col);
    } else if (e.key === 'ArrowDown') {
      moveTo(row + 1, col);
    } else if (e.key === 'ArrowLeft' && shouldMoveHorizontally(e)) {
      moveTo(row, col - 1);
    } else if (e.key === 'ArrowRight' && shouldMoveHorizontally(e)) {
      moveTo(row, col + 1);
    } else if (e.key === 'Home' && (e.metaKey || e.ctrlKey)) {
      moveTo(0, 0);
    } else if (e.key === 'End' && (e.metaKey || e.ctrlKey)) {
      moveTo(samples.length - 1, METADATA_TABLE_COLUMNS.length - 1);
    } else if (e.key === 'Home') {
      moveTo(row, 0);
    } else if (e.key === 'End') {
      moveTo(row, METADATA_TABLE_COLUMNS.length - 1);
    }
  };

  const handleMetadataTablePointerDown = (row, col, e) => {
    if (e.button !== 0) return;
    metadataTableSelectingRef.current = true;
    selectMetadataTableCell(row, col, { extend: e.shiftKey, focus: false });
  };

  const handleMetadataTablePointerEnter = (row, col) => {
    if (!metadataTableSelectingRef.current) return;
    selectMetadataTableCell(row, col, { extend: true, focus: false });
  };

  const toggleTag = (idx, section, tag) => {
    setSamples((prev) => {
      const field = `${section}Tags`;
      const current = prev[idx].notes[field];
      const base = getBaseTag(tag);
      const existing = current.find((t) => getBaseTag(t) === base);
      const nextTags = existing ? current.filter((t) => getBaseTag(t) !== base) : [...current, tag];

      return prev.map((item, sampleIdx) =>
        sampleIdx === idx
          ? {
              ...item,
              notes: {
                ...item.notes,
                [field]: nextTags
              }
            }
          : item
      );
    });
  };

  const cycleTagModifier = (idx, section, tagString) => {
    setSamples((prev) => {
      const field = `${section}Tags`;
      const tags = [...prev[idx].notes[field]];
      const tagIdx = tags.indexOf(tagString);
      if (tagIdx === -1) return prev;

      const baseTag = getBaseTag(tagString);
      let newTag = '';
      if (tagString.startsWith('Slight ')) {
        newTag = `Intense ${baseTag}`;
      } else if (tagString.startsWith('Intense ')) {
        newTag = baseTag;
      } else {
        newTag = `Slight ${baseTag}`;
      }

      tags[tagIdx] = newTag;

      return prev.map((item, sampleIdx) =>
        sampleIdx === idx
          ? {
              ...item,
              notes: {
                ...item.notes,
                [field]: tags
              }
            }
          : item
      );
    });
  };

  const normalizeSearchValue = (value) => String(value ?? '').toLowerCase();
  const getSessionCoffeeMatches = (session, query) => {
    if (!query) return [];

    return (session.samples ?? [])
      .map((sample, idx) => ({ sample, idx }))
      .filter(({ sample }) =>
        [sample.ositoId, sample.lotName].some((value) => normalizeSearchValue(value).includes(query))
      );
  };

  const historySearchTerm = historySearch.trim().toLowerCase();
  const filteredHistory = historySearchTerm
    ? history.filter(
        (item) =>
          normalizeSearchValue(item.name).includes(historySearchTerm) ||
          getSessionCoffeeMatches(item, historySearchTerm).length > 0
      )
    : history;
  const activeSavedSession =
    activeSavedSessionId === null ? null : history.find((item) => item.id === activeSavedSessionId) ?? null;

  const renderSaveSessionModal = () =>
    showSaveModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-6">
        <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="text-center">
            <h3 className="text-xl font-black text-stone-900">
              {activeSavedSession ? t('saveSessionChanges') : t('nameSession')}
            </h3>
            <p className="text-stone-400 font-bold text-[10px] uppercase tracking-widest mt-1">{t('saveOnDevice')}</p>
          </div>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder={t('sessionNamePlaceholder')}
            className="w-full bg-stone-50 p-4 rounded-2xl border border-stone-200 outline-none font-bold text-sm"
          />
          <div className="flex flex-col gap-2">
            {activeSavedSession ? (
              <>
                <button onClick={() => saveSessionLocal('overwrite')} className="w-full py-4 btn-stone-dark font-black text-sm uppercase tracking-widest">
                  {t('saveOverCurrent')}
                </button>
                <button
                  onClick={() => saveSessionLocal('new')}
                  className="w-full py-4 rounded-xl bg-white text-stone-700 border border-stone-200 font-black text-sm uppercase tracking-widest active:scale-95"
                >
                  {t('saveAsNewSession')}
                </button>
              </>
            ) : (
              <button onClick={() => saveSessionLocal('new')} className="w-full py-4 btn-stone-dark font-black text-sm uppercase tracking-widest">
                {t('saveSession')}
              </button>
            )}
            <button onClick={closeSaveSessionModal} className="w-full py-2 text-stone-400 font-bold text-xs uppercase">
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    );

  if (appState === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-stone-100">
        <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-8 md:p-10 text-center border border-stone-200">
          <div className="inline-flex p-4 rounded-3xl bg-stone-900 text-white mb-6 md:mb-8 shadow-xl">
            <Icon name="coffee" size={28} />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-stone-900 mb-2 tracking-tight">{t('cuppingLab')}</h1>
          <p className="text-stone-400 font-medium mb-8 md:mb-10 text-xs uppercase tracking-widest">{t('selectSampleCount')}</p>
          <div className="flex items-center justify-between bg-stone-100 rounded-2xl p-2 md:p-3 mb-8 md:mb-10 border border-stone-200 shadow-inner">
            <button
              onClick={() => setNumSamples(Math.max(1, numSamples - 1))}
              className="w-12 h-12 md:w-14 md:h-14 bg-white shadow-sm flex items-center justify-center btn-stone-light"
            >
              <Icon name="minus" size={18} />
            </button>
            <span className="text-4xl md:text-5xl font-black text-stone-900 tabular-nums">{numSamples}</span>
            <button
              onClick={() => setNumSamples(numSamples + 1)}
              className="w-12 h-12 md:w-14 md:h-14 bg-white shadow-sm flex items-center justify-center btn-stone-light"
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
          <div className="space-y-3">
            <button onClick={startSession} className="w-full py-4 md:py-5 btn-stone-dark font-black text-base md:text-lg flex items-center justify-center gap-3 shadow-2xl">
              {t('startSession')}
              <Icon name="chevron-right" />
            </button>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => {
                  setImportError('');
                  setAppState('import');
                }}
                aria-label={t('uploadSession')}
                className="group min-h-[104px] rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-stone-300 hover:shadow-md active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 px-2 text-center"
              >
                <span className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Icon name="upload" size={18} />
                </span>
                <span className="font-black text-[9px] sm:text-[10px] text-stone-700 uppercase tracking-[0.16em] leading-[1.05]">
                  <span className="block">{t('upload')}</span>
                  <span className="block">{t('session')}</span>
                </span>
              </button>
              <button
                onClick={() => goToMetadata('setup')}
                aria-label={t('configureLotInfo')}
                className="group min-h-[104px] rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-stone-300 hover:shadow-md active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 px-2 text-center"
              >
                <span className="w-9 h-9 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Icon name="edit-2" size={18} />
                </span>
                <span className="font-black text-[9px] sm:text-[10px] text-stone-700 uppercase tracking-[0.16em] leading-[1.05]">
                  <span className="block">{t('lot')}</span>
                  <span className="block">{t('info')}</span>
                </span>
              </button>
              <button
                onClick={() => setAppState('history')}
                aria-label={t('viewHistory')}
                className="group min-h-[104px] rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-stone-300 hover:shadow-md active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 px-2 text-center"
              >
                <span className="w-9 h-9 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Icon name="clock" size={18} />
                </span>
                <span className="font-black text-[9px] sm:text-[10px] text-stone-700 uppercase tracking-[0.16em] leading-[1.05]">
                  {t('history')}
                </span>
              </button>
            </div>
            <div className="home-display-control">
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} className="home-display-toggle" />
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} className="home-display-toggle" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'import') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-stone-100">
        <div className="max-w-xl w-full bg-white rounded-[2rem] shadow-2xl p-8 md:p-10 border border-stone-200">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="inline-flex p-3 rounded-2xl bg-stone-900 text-white shadow-xl">
                <Icon name="upload" size={20} />
              </div>
              <div className="pt-0.5">
                <h1 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">{t('uploadSession')}</h1>
                <p className="text-stone-400 font-black text-[10px] uppercase tracking-widest mt-2">
                  {t('importCsvSubtitle')}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <button
                onClick={() => setAppState('setup')}
                className="px-3 py-2 rounded-xl bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 font-black text-[11px] uppercase tracking-widest flex items-center gap-2 whitespace-nowrap"
              >
                <Icon name="chevron-left" size={16} />
                {t('back')}
              </button>
            </div>
          </div>

          <p className="text-sm text-stone-600 font-bold leading-relaxed">
            {t('importDescription')}
          </p>

          {importError && (
            <div className="mt-5 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-red-700 font-bold text-sm">{importError}</div>
          )}

          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => importSessionCsvFile(e.target.files?.[0])}
          />

          <div
            onClick={() => (isImporting ? null : importInputRef.current?.click())}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isImporting) setIsDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isImporting) setIsDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragActive(false);
              if (isImporting) return;
              const file = e.dataTransfer?.files?.[0];
              if (file) importSessionCsvFile(file);
            }}
            className={`mt-6 rounded-[1.75rem] border-2 border-dashed p-8 md:p-10 text-center cursor-pointer select-none transition ${
              isImporting
                ? 'bg-stone-50 border-stone-100 text-stone-300'
                : isDragActive
                  ? 'bg-stone-50 border-stone-900 text-stone-900'
                  : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-stone-400'
            }`}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-white border border-stone-200 shadow-sm text-stone-900 mb-5">
              <Icon name={isImporting ? 'loader-2' : 'upload'} size={22} className={isImporting ? 'animate-spin' : ''} />
            </div>
            <p className="text-base md:text-lg font-black tracking-tight">{isImporting ? t('importing') : t('dropCsv')}</p>
            <p className="text-[11px] font-black text-stone-400 uppercase tracking-widest mt-2">{t('orBrowse')}</p>

            <div className="mt-6">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isImporting) importInputRef.current?.click();
                }}
                disabled={isImporting}
                className={`px-5 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest inline-flex items-center justify-center gap-2 border transition-colors ${
                  isImporting ? 'bg-stone-100 text-stone-300 border-stone-100' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Icon name="upload" size={16} />
                {t('browseFiles')}
              </button>
            </div>
          </div>

          <div className="mt-5 text-[11px] text-stone-400 font-bold leading-relaxed">
            {t('importTip')}
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'history') {
    return (
      <div className="min-h-screen bg-stone-100 p-6 md:p-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">{t('savedSessions')}</h1>
            <div className="flex items-center gap-3">
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <button onClick={() => setAppState('setup')} className="text-stone-400 font-bold hover:text-stone-900 text-sm">
                {t('back')}
              </button>
            </div>
          </div>
          <div className="relative">
            <Icon name="search" size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder={t('searchSavedSessions')}
              className="w-full bg-white rounded-2xl border border-stone-200 shadow-sm py-4 pl-11 pr-12 outline-none font-bold text-stone-800 placeholder:text-stone-300 focus:border-stone-300 focus:shadow-md"
            />
            {historySearch && (
              <button
                type="button"
                onClick={() => setHistorySearch('')}
                aria-label={t('clearSearch')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-stone-300 hover:text-stone-700 hover:bg-stone-100"
              >
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((item) => {
                const coffeeMatches = getSessionCoffeeMatches(item, historySearchTerm);
                return (
                  <div
                    key={item.id}
                    onClick={() => loadSession(item)}
                    className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow relative group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest">{item.date}</span>
                      <button onClick={(e) => deleteSession(item.id, e)} className="history-delete-button p-2 text-stone-200 hover:text-red-500 transition-colors">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                    <h3 className="text-lg font-black text-stone-900 leading-tight pr-4">{item.name}</h3>
                    <p className="text-xs font-bold text-stone-400 uppercase mt-2">{item.count} {t('samples')}</p>
                    {coffeeMatches.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {coffeeMatches.slice(0, 3).map(({ sample, idx }) => (
                          <span
                            key={`${item.id}-${idx}`}
                            className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-[10px] font-black text-stone-600 uppercase tracking-wider"
                          >
                            #{idx + 1} {sample.lotName || t('coffee')}{sample.ositoId ? ` · ${sample.ositoId}` : ''}
                          </span>
                        ))}
                        {coffeeMatches.length > 3 && (
                          <span className="inline-flex items-center rounded-full bg-stone-900 px-3 py-1 text-[10px] font-black text-white uppercase tracking-wider">
                            +{coffeeMatches.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-20 text-center text-stone-400 font-bold italic">
                {history.length > 0 ? t('noMatchingSessions') : t('noSessions')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'metadata') {
    const tableColumns = METADATA_TABLE_COLUMNS;
    const tableColumnLabels = {
      ositoId: t('ositoId'),
      lotName: t('lotName'),
      processing: t('processing'),
      waterActivity: t('waterActivity'),
      moisture: t('moisture'),
      processingOther: t('processingDetails')
    };
    const tableColumnWidths = {
      ositoId: '150px',
      lotName: '230px',
      processing: '170px',
      waterActivity: '140px',
      moisture: '120px',
      processingOther: '230px'
    };
    const getTableCellClass = (row, col, extra = '') =>
      `metadata-grid-cell ${isMetadataTableCellSelected(row, col) ? 'is-selected' : ''} ${
        isMetadataTableCellActive(row, col) ? 'is-active' : ''
      } ${extra}`;
    const getTableInputProps = (row, col) => ({
      'data-metadata-cell': `${row}-${col}`,
      'data-table-row': row,
      'data-table-col': col,
      onFocus: () => {
        if (!isMetadataTableCellSelected(row, col)) selectMetadataTableCell(row, col, { focus: false });
      },
      onKeyDown: (e) => handleMetadataTableKeyDown(row, col, e),
      onPaste: (e) => handleTablePaste(row, col, tableColumns, e),
      onCopy: handleMetadataTableCopy,
      onCut: handleMetadataTableCut,
      className: 'metadata-grid-input'
    });
    const getTableCellProps = (row, col, extra = '') => ({
      className: getTableCellClass(row, col, extra),
      onPointerDown: (e) => handleMetadataTablePointerDown(row, col, e),
      onPointerEnter: () => handleMetadataTablePointerEnter(row, col),
      'aria-selected': isMetadataTableCellSelected(row, col)
    });
    const getSortButtonClass = (column, direction) =>
      `metadata-sort-button ${metadataTableSort?.field === column && metadataTableSort?.direction === direction ? 'is-active' : ''}`;

    return (
      <div className="min-h-screen bg-stone-100 p-4 md:p-12">
        <div className="max-w-4xl mx-auto space-y-6 pb-32">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">{t('lotInformation')}</h1>
            <div className="flex gap-2 flex-wrap">
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <button
                onClick={() => setMetadataTableMode(false)}
                className={`px-4 py-2 rounded-xl font-bold text-xs border ${
                  !metadataTableMode ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'
                }`}
              >
                {t('standardView')}
              </button>
              <button
                onClick={() => setMetadataTableMode(true)}
                className={`px-4 py-2 rounded-xl font-bold text-xs border ${
                  metadataTableMode ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'
                }`}
              >
                {t('tableView')}
              </button>
              <button
                onClick={() => setAppState(metadataOrigin === 'report' ? 'report' : 'setup')}
                className="text-stone-400 font-bold text-sm"
              >
                {t('back')}
              </button>
            </div>
          </div>

          {metadataTableMode ? (
            <div className="metadata-table-shell">
              <table className="metadata-spreadsheet text-left text-sm" role="grid">
                <colgroup>
                  <col style={{ width: '44px' }} />
                  <col style={{ width: '52px' }} />
                  {tableColumns.map((column) => (
                    <col key={column} style={{ width: tableColumnWidths[column] }} />
                  ))}
                </colgroup>
                <thead className="text-[11px] font-black uppercase tracking-widest text-stone-500">
                  <tr>
                    <th className="metadata-table-corner text-center">
                      <span className="sr-only">{t('reorder')}</span>
                    </th>
                    <th className="metadata-table-corner text-center">#</th>
                    {tableColumns.map((column) => (
                      <th key={column} className="metadata-column-header whitespace-nowrap">
                        <div className="metadata-column-header-content">
                          <span>{tableColumnLabels[column]}</span>
                          <span className="metadata-sort-controls">
                            <button
                              type="button"
                              onClick={() => sortMetadataTable(column, 'asc')}
                              className={getSortButtonClass(column, 'asc')}
                              aria-label={`${t('sortAscending')}: ${tableColumnLabels[column]}`}
                              aria-pressed={metadataTableSort?.field === column && metadataTableSort?.direction === 'asc'}
                              title={t('sortAscending')}
                            >
                              <Icon name="chevron-up" size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => sortMetadataTable(column, 'desc')}
                              className={getSortButtonClass(column, 'desc')}
                              aria-label={`${t('sortDescending')}: ${tableColumnLabels[column]}`}
                              aria-pressed={metadataTableSort?.field === column && metadataTableSort?.direction === 'desc'}
                              title={t('sortDescending')}
                            >
                              <Icon name="chevron-down" size={12} />
                            </button>
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody ref={metadataTableBodyRef}>
                  {samples.map((s, idx) => {
                    const isDraggingRow = sampleDrag?.fromIndex === idx;
                    const isDropTarget = sampleDrag?.overIndex === idx && sampleDrag?.fromIndex !== idx;
                    return (
                      <tr
                        key={s.id}
                        data-sample-row-index={idx}
                        className={`metadata-table-row transition-colors ${
                          isDropTarget ? 'metadata-row-drop-target' : ''
                        } ${isDraggingRow ? 'metadata-row-dragging opacity-60' : ''}`}
                      >
                        <td className="metadata-row-handle-cell text-center">
                          <button
                            type="button"
                            disabled={samples.length < 2}
                            onPointerDown={(e) => startSampleReorder(idx, e)}
                            onPointerMove={updateSampleReorderTarget}
                            onPointerUp={finishSampleReorder}
                            onPointerCancel={cancelSampleReorder}
                            onKeyDown={(e) => handleSampleReorderKeyDown(idx, e)}
                            aria-label={`${t('reorderLot')} ${idx + 1}`}
                            title={t('reorderLot')}
                            className={`sample-reorder-handle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-400 transition ${
                              samples.length < 2 ? 'opacity-40' : 'hover:bg-white hover:text-stone-700 active:scale-95'
                            }`}
                          >
                            <Icon name="grip-vertical" size={16} />
                          </button>
                        </td>
                        <th scope="row" className="metadata-row-number text-center">{idx + 1}</th>
                        <td {...getTableCellProps(idx, 0)}>
                          <input
                            {...getTableInputProps(idx, 0)}
                            value={s.ositoId || ''}
                            onChange={(e) => updateMetadata(idx, 'ositoId', e.target.value)}
                            placeholder="OS-ID..."
                            aria-label={`${t('ositoId')} ${idx + 1}`}
                          />
                        </td>
                        <td {...getTableCellProps(idx, 1)}>
                          <input
                            {...getTableInputProps(idx, 1)}
                            value={s.lotName || ''}
                            onChange={(e) => updateMetadata(idx, 'lotName', e.target.value)}
                            placeholder={`${t('lotName')}...`}
                            aria-label={`${t('lotName')} ${idx + 1}`}
                          />
                        </td>
                        <td {...getTableCellProps(idx, 2)}>
                          <input
                            {...getTableInputProps(idx, 2)}
                            value={s.processing && s.processing !== 'Select One' ? translateProcessing(language, s.processing) : ''}
                            onChange={(e) => updateMetadata(idx, 'processing', e.target.value)}
                            onBlur={(e) => {
                              const normalized = normalizeProcessingInput(e.target.value, s.processingOther);
                              setSamples((prev) =>
                                prev.map((item, sIdx) =>
                                  sIdx === idx
                                    ? {
                                        ...item,
                                        processing: normalized.processing,
                                        processingOther: normalized.processingOther
                                      }
                                    : item
                                )
                              );
                            }}
                            placeholder={t('processingPlaceholder')}
                            list="processing-options"
                            aria-label={`${t('processing')} ${idx + 1}`}
                          />
                        </td>
                        <td {...getTableCellProps(idx, 3)}>
                          <input
                            {...getTableInputProps(idx, 3)}
                            value={s.waterActivity || ''}
                            onChange={(e) => updateMetadata(idx, 'waterActivity', e.target.value)}
                            onBlur={(e) => updateMetadata(idx, 'waterActivity', formatWaterActivity(e.target.value))}
                            placeholder="0.00"
                            inputMode="decimal"
                            type="text"
                            className="metadata-grid-input tabular-nums"
                            aria-label={`${t('waterActivity')} ${idx + 1}`}
                          />
                        </td>
                        <td {...getTableCellProps(idx, 4, 'metadata-grid-cell-with-affix')}>
                          <input
                            {...getTableInputProps(idx, 4)}
                            value={s.moisture || ''}
                            onChange={(e) => updateMetadata(idx, 'moisture', e.target.value)}
                            onBlur={(e) => updateMetadata(idx, 'moisture', formatMoisture(e.target.value))}
                            placeholder="0.0"
                            inputMode="decimal"
                            type="text"
                            className="metadata-grid-input tabular-nums"
                            aria-label={`${t('moisture')} ${idx + 1}`}
                          />
                          <span className="metadata-grid-affix">%</span>
                        </td>
                        <td {...getTableCellProps(idx, 5)}>
                          <input
                            {...getTableInputProps(idx, 5)}
                            value={s.processingOther || ''}
                            onChange={(e) => updateMetadata(idx, 'processingOther', e.target.value)}
                            placeholder={s.processing === 'Other' ? t('processingDetailsPlaceholder') : '-'}
                            aria-label={`${t('processingDetails')} ${idx + 1}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="processing-options">
                <option value={t('washed')} />
                <option value={t('natural')} />
                <option value={t('honey')} />
                <option value={t('other')} />
              </datalist>
            </div>
          ) : (
            samples.map((s, idx) => (
              <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-stone-50 pb-3">
                  <span className="w-6 h-6 rounded-full bg-stone-900 text-white flex items-center justify-center font-black text-[10px]">#{idx + 1}</span>
                  <h3 className="font-black text-stone-800 uppercase tracking-widest text-[10px]">{t('lotData')}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase ml-1">{t('ositoId')}</label>
                    <input
                      value={s.ositoId}
                      onChange={(e) => updateMetadata(idx, 'ositoId', e.target.value)}
                      placeholder="OS-ID..."
                      className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase ml-1">{t('lotName')}</label>
                    <input
                      value={s.lotName}
                      onChange={(e) => updateMetadata(idx, 'lotName', e.target.value)}
                      placeholder={`${t('lotName')}...`}
                      className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase ml-1">{t('processing')}</label>
                    <select
                      value={s.processing}
                      onChange={(e) => updateMetadata(idx, 'processing', e.target.value)}
                      className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                    >
                      <option value="Select One">{t('selectOne')}</option>
                      <option value="Washed">{t('washed')}</option>
                      <option value="Natural">{t('natural')}</option>
                      <option value="Honey">{t('honey')}</option>
                      <option value="Other">{t('other')}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase ml-1">{t('waterActivity')}</label>
                    <input
                      value={s.waterActivity || ''}
                      onChange={(e) => updateMetadata(idx, 'waterActivity', e.target.value)}
                      onBlur={(e) => updateMetadata(idx, 'waterActivity', formatWaterActivity(e.target.value))}
                      placeholder="0.00"
                      inputMode="decimal"
                      type="number"
                      step="0.01"
                      min="0"
                      max="0.99"
                      className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase ml-1">{t('moisture')}</label>
                    <div className="relative">
                      <input
                        value={s.moisture || ''}
                        onChange={(e) => updateMetadata(idx, 'moisture', e.target.value)}
                        onBlur={(e) => updateMetadata(idx, 'moisture', formatMoisture(e.target.value))}
                        placeholder="0.0"
                        inputMode="decimal"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className="w-full bg-stone-50 p-3 pr-9 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-stone-400">%</span>
                    </div>
                  </div>
                </div>
                {s.processing === 'Other' && (
                  <div className="animate-in slide-in-from-top-2">
                    <input
                      value={s.processingOther}
                      onChange={(e) => updateMetadata(idx, 'processingOther', e.target.value)}
                      placeholder={t('processingDetailsPlaceholder')}
                      className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                    />
                  </div>
                )}
              </div>
            ))
          )}
          <button
            onClick={() => setAppState(metadataOrigin === 'report' ? 'report' : 'cupping')}
            className="w-[calc(100%-2rem)] md:w-full py-4 md:py-5 btn-stone-dark font-black text-base md:text-lg shadow-2xl fixed bottom-3 md:bottom-6 left-1/2 -translate-x-1/2 max-w-lg uppercase tracking-wider pb-safe"
          >
            {t('saveDetails')}
          </button>
        </div>
      </div>
    );
  }

  if (appState === 'report') {
    return (
      <div className="report-screen min-h-screen bg-stone-100 p-4 md:p-8 relative">
        {renderConfirmModal()}
        {renderSaveSessionModal()}
        <div className="max-w-[1400px] mx-auto space-y-4 pb-28 md:pb-20 report-container">
          <header className="flex flex-wrap items-center justify-between print-hidden gap-3 mb-6">
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => openConfirm(resetToHome)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-stone-100 px-4 md:px-5 py-2 rounded-xl font-bold shadow-sm border border-stone-200 text-stone-600 active:scale-95 transition-all text-xs"
              >
                <Icon name="home" size={16} />
                {t('reset')}
              </button>
              <button
                onClick={() => setAppState('cupping')}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white px-4 md:px-5 py-2 rounded-xl font-bold shadow-sm border border-stone-200 text-stone-600 active:scale-95 transition-all text-xs"
              >
                <Icon name="chevron-left" size={16} />
                {t('back')}
              </button>
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact className="flex-1 sm:flex-none eink-report-mobile-toggle" />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact className="flex-1 sm:flex-none eink-report-mobile-toggle" />
            </div>
            <div className="hidden md:flex flex-wrap gap-2">
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <button
                onClick={openSaveSessionModal}
                className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl font-bold text-blue-600 border border-blue-100 active:scale-95 text-xs"
              >
                <Icon name="save" size={16} />
                {t('save')}
              </button>
              <button
                onClick={() => goToMetadata('report')}
                className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl font-bold text-stone-600 border border-stone-200 active:scale-95 text-xs"
              >
                <Icon name="edit-2" size={16} />
                {t('lots')}
              </button>
              <button
                onClick={() => downloadCSV(samples, sessionStartTime, activeSessionName)}
                className="flex items-center gap-2 bg-stone-200 px-4 py-2 rounded-xl font-bold text-stone-800 active:scale-95 text-xs"
              >
                <Icon name="download" size={16} />
                CSV
              </button>
              <button
                onClick={downloadPdfSet}
                disabled={isExportingPdfs}
                className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl font-bold text-stone-800 border border-stone-200 active:scale-95 disabled:opacity-60 disabled:active:scale-100 text-xs"
              >
                <Icon name="file-archive" size={16} />
                {isExportingPdfs ? t('exportingPdfs') : t('downloadPdfSet')}
              </button>
              <button
                onClick={printAllPdf}
                className="flex items-center gap-2 px-6 py-2 btn-stone-dark font-bold shadow-xl active:scale-95 text-xs"
              >
                <Icon name="printer" size={16} />
                {t('printPdf')}
              </button>
            </div>
          </header>

          <div className="report-surface bg-white p-4 md:p-10 rounded-3xl shadow-sm border border-stone-200 print:p-0 print:border-none print:shadow-none">
            <div className="report-title print-hidden">
              <div>
                <h1>{t('labSummary')}</h1>
                <p>{t('qualityControl')}</p>
              </div>
              <div className="report-title-date">{sessionStartTime}</div>
            </div>
            <div className="report-pages space-y-0">
              {samples.map((s, idx) => (
                <div
                  key={s.id}
                  className="sample-spec-sheet mb-14 md:mb-32 border-b-2 border-stone-100 pb-10 md:pb-16 last:border-0 last:mb-0 last:pb-0 print:border-stone-900 print:border-2 print:p-[0.8cm] print:mb-0 print:pb-0"
                >
                  <div className="print-page-header print-only">
                    <div className="print-page-heading-group">
                      <p className="print-page-title">{t('labSummary')}</p>
                      <p className="print-page-subtitle">{t('qualityControl')}</p>
                    </div>
                    <div className="print-page-date">{sessionStartTime}</div>
                  </div>
                  <div className="print-identity-block flex flex-col sm:flex-row items-stretch justify-between border border-stone-900 mb-6">
                    <div className="flex-1 p-4 md:p-5 bg-stone-50/30 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-1">
                        {!s.lotName && (
                          <span className="text-[9px] font-black text-stone-300 uppercase tracking-widest">{t('sample')} 0{idx + 1}</span>
                        )}
                        <span className="inline-flex items-center gap-2 text-base font-black text-stone-900 uppercase tracking-tight px-2 py-1 rounded-xl bg-stone-100 border border-stone-200">
                          {s.ositoId || t('noId')}
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-stone-900 tracking-tighter uppercase leading-tight">
                        {s.lotName ? s.lotName : `${t('sample')} 0${idx + 1}`}
                      </h2>
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-2">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-stone-300 uppercase tracking-widest">{t('processing')}</span>
                          <span className="text-[12px] font-bold text-stone-600 uppercase">
                            {s.processing !== 'Select One'
                              ? s.processing === 'Other'
                                ? s.processingOther
                                : translateProcessing(language, s.processing)
                              : t('undefined')}
                          </span>
                        </div>
                        {s.waterActivity && (
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-stone-300 uppercase tracking-widest whitespace-nowrap">{t('waterActivity')}</span>
                            <span className="text-[12px] font-bold text-stone-600 tabular-nums">{formatWaterActivity(s.waterActivity)}</span>
                          </div>
                        )}
                        {s.moisture && (
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-stone-300 uppercase tracking-widest">{t('moisture')}</span>
                            <span className="text-[12px] font-bold text-stone-600 tabular-nums">{formatMoisture(s.moisture)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grade-display w-full sm:w-auto shrink-0 flex flex-col items-center justify-center bg-stone-900 px-6 sm:px-10 py-4 sm:min-w-[200px]">
                      <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.4em] mb-1">{t('finalScore')}</p>
                      <p className="text-4xl sm:text-5xl md:text-6xl font-black tabular-nums text-white leading-none">{calculateTotal(s)}</p>
                    </div>
                  </div>

                  <div className="spec-grid print-spec-grid flex flex-col lg:grid lg:grid-cols-[auto_1fr] gap-8 md:gap-12 lg:gap-16">
                    <div className="print-visual-row flex flex-col sm:flex-row items-center sm:items-start justify-center lg:justify-start gap-8 md:gap-8 visual-row">
                      <div className="print-chart-panel flex flex-col items-center w-full sm:w-auto">
                        <p className="section-header mb-6">{t('attributeMap')}</p>
                        <SpiderGraph scores={s.scores} size={reportRadarSize} einkMode={isEinkMode} language={language} />
                      </div>
                      <div className="print-chart-panel flex flex-col items-center w-full sm:w-auto">
                        <p className="section-header mb-6">{t('sensoryBalance')}</p>
                        <div className="report-balance-align" style={{ '--report-balance-offset': `${reportBalanceOffset}px` }}>
                          <DonutChart
                            tags={[...s.notes.fragAromaTags, ...s.notes.inCupTags]}
                            size={reportDonutSize}
                            className="print-donut-chart"
                            einkMode={isEinkMode}
                            language={language}
                            t={t}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-8 data-column">
                      <div className="space-y-6 print-tag-sections">
                        <ReportTags label={t('fragranceAroma')} tags={s.notes.fragAromaTags} alwaysShow language={language} t={t} />
                        <ReportTags label={t('inCup')} tags={s.notes.inCupTags} alwaysShow language={language} t={t} />
                        <ReportTags label={t('negative')} tags={s.notes.negativeTags} alwaysShow language={language} t={t} />
                      </div>

                      <div className="pt-6 border-t border-stone-100 print-notes-block">
                        <p className="section-header text-stone-900 mb-3">{t('otherObservations')}</p>
                        {(s.notes.acidityLevel || s.notes.sweetnessLevel) && (
                          <div className="flex flex-wrap gap-2 mb-2 text-[11px] font-black text-stone-800 print:text-[10px]">
                            {s.notes.acidityLevel && (
                              <span className="px-3 py-1 rounded-lg bg-stone-100 border border-stone-200">
                                {t('acidity')}: {translateLevel(language, s.notes.acidityLevel)}
                              </span>
                            )}
                            {s.notes.sweetnessLevel && (
                              <span className="px-3 py-1 rounded-lg bg-stone-100 border border-stone-200">
                                {t('sweetness')}: {translateLevel(language, s.notes.sweetnessLevel)}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-[13px] leading-relaxed text-stone-700 italic pr-4 print-notes-body">
                          {s.notes.otherText ? s.notes.otherText : s.notes.acidityLevel || s.notes.sweetnessLevel ? '' : (
                            <span className="text-stone-300 italic opacity-50">{t('noneRecordedPeriod')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="print-page-footer print-only">
                    <p className="print-footer-text">{t('authorizedAnalysis')} • {t('protocol')}</p>
                    <div className="print-logo">
                      <img src={HandsLogo} alt={t('handsLogo')} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="report-signoff mt-12 pt-4 border-t border-stone-100 text-center print-hidden">
              <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.6em] leading-snug">
                <span className="block">{t('authorizedAnalysis')}</span>
                <span className="block">{t('protocol')}</span>
              </p>
            </div>
            <div className="report-logo print-hidden">
              <img src={HandsLogo} alt={t('handsLogo')} />
            </div>
          </div>
        </div>

        <div className="fixed md:hidden bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-stone-200 px-3 pt-2 pb-safe print-hidden">
          <div className="grid grid-cols-6 gap-2">
            <button
              onClick={() => setAppState('cupping')}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-100 text-stone-700 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="chevron-left" size={14} />
              {t('back')}
            </button>
            <button
              onClick={() => goToMetadata('report')}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-white text-stone-700 border border-stone-200 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="edit-2" size={14} />
              {t('lots')}
            </button>
            <button
              onClick={openSaveSessionModal}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-white text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="save" size={14} />
              {t('save')}
            </button>
            <button
              onClick={() => downloadCSV(samples, sessionStartTime, activeSessionName)}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-200 text-stone-800 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="download" size={14} />
              CSV
            </button>
            <button
              onClick={downloadPdfSet}
              disabled={isExportingPdfs}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-white text-stone-800 border border-stone-200 text-[10px] font-black uppercase tracking-wider disabled:opacity-60"
            >
              <Icon name="file-archive" size={14} />
              {isExportingPdfs ? '...' : t('pdfs')}
            </button>
            <button
              onClick={printAllPdf}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-900 text-white text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="printer" size={14} />
              {t('print')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentSample = samples[activeSampleIndex];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 pb-24 md:pb-40">
      {renderConfirmModal()}
      {renderSaveSessionModal()}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
        <header className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => openConfirm(resetToHome)}
            className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-transform active:scale-90"
          >
            <Icon name="chevron-left" size={24} />
          </button>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 flex-1 px-4">
            {samples.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSampleIndex(idx)}
                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                  activeSampleIndex === idx ? 'bg-stone-800 text-white shadow-lg scale-105' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
          <button
            onClick={openSaveSessionModal}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white text-blue-700 border border-blue-100 shadow-sm font-black text-[10px] uppercase tracking-widest active:scale-95 shrink-0 transition-transform"
            title={t('save')}
            aria-label={t('save')}
          >
            <Icon name="save" size={16} />
            <span className="hidden sm:inline">{t('save')}</span>
          </button>
          <button
            onClick={() => setAppState('report')}
            className="px-4 sm:px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl btn-stone-dark active:scale-95 shrink-0 transition-transform"
          >
            {t('report')}
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
            <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-4 md:px-12 pb-4 flex justify-between items-end text-stone-900 gap-3">
          <div className="min-w-0 pl-2">
            <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] leading-none block mb-1">{t('analyzingLot')}</span>
            <h2 className="text-base md:text-xl font-black tracking-tight leading-none truncate">
              {currentSample.lotName || `${t('coffee')} ${activeSampleIndex + 1}`}
            </h2>
          </div>
          <div className="text-right leading-none shrink-0 pl-4 pr-2">
            <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] block mb-1">{t('liveScore')}</span>
            <span className="text-3xl md:text-4xl font-black tabular-nums">{calculateTotal(currentSample)}</span>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4 md:p-12 space-y-12 main-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-20">
          <div className="space-y-2 md:space-y-3">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <Icon name="clipboard-list" size={14} />
              {t('attributeGrading')}
            </h3>
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="space-y-2">
                <ScoreControl
                  label={translateScoreLabel(language, cat.id, cat.label)}
                  value={currentSample.scores[cat.id]}
                  onUpdate={(d) => updateScore(activeSampleIndex, cat.id, d)}
                />
                {cat.id === 'sweetness' && (
                  <LevelSelector
                    label={t('sweetnessLevel')}
                    value={currentSample.notes?.sweetnessLevel || ''}
                    onSelect={(val) => updateLevel(activeSampleIndex, 'sweetnessLevel', val)}
                    language={language}
                    t={t}
                  />
                )}
                {cat.id === 'acidity' && (
                  <LevelSelector
                    label={t('acidityLevel')}
                    value={currentSample.notes?.acidityLevel || ''}
                    onSelect={(val) => updateLevel(activeSampleIndex, 'acidityLevel', val)}
                    language={language}
                    t={t}
                  />
                )}
              </div>
            ))}
            <div className="pt-6 space-y-2 md:space-y-3 border-t-2 border-stone-100 mt-6">
              <ScoreControl
                label={t('defects')}
                value={currentSample.scores.defects}
                onUpdate={(d) => updateScore(activeSampleIndex, 'defects', d)}
                colorClass="text-red-600"
              />
              <ScoreControl
                label={t('cupCorrection')}
                value={currentSample.scores.correction}
                onUpdate={(d) => updateScore(activeSampleIndex, 'correction', d)}
                colorClass="text-blue-600"
              />
            </div>
          </div>
          <div className="space-y-8">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <Icon name="tag" size={14} />
              {t('sensoryMapping')}
            </h3>
            <LexiconSearch
              label={t('fragranceAndAroma')}
              tags={currentSample.notes.fragAromaTags}
              options={CATEGORISED_LEXICON}
              onToggle={(t) => toggleTag(activeSampleIndex, 'fragAroma', t)}
              onCycle={(t) => cycleTagModifier(activeSampleIndex, 'fragAroma', t)}
              language={language}
              t={t}
            />
            <LexiconSearch
              label={t('inCup')}
              tags={currentSample.notes.inCupTags}
              options={CATEGORISED_LEXICON}
              onToggle={(t) => toggleTag(activeSampleIndex, 'inCup', t)}
              onCycle={(t) => cycleTagModifier(activeSampleIndex, 'inCup', t)}
              language={language}
              t={t}
            />
            <LexiconSearch
              label={t('negativeFactors')}
              tags={currentSample.notes.negativeTags}
              options={{ Negative: NEGATIVE_LEXICON }}
              onToggle={(t) => toggleTag(activeSampleIndex, 'negative', t)}
              onCycle={(t) => cycleTagModifier(activeSampleIndex, 'negative', t)}
              language={language}
              t={t}
            />
            <div className="space-y-3 pt-8 border-t-2 border-stone-100">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Icon name="edit-3" size={12} />
                {t('technicalJournal')}
              </label>
              <textarea
                value={currentSample.notes.otherText}
                onChange={(e) =>
                  setSamples((prev) =>
                    prev.map((item, idx) =>
                      idx === activeSampleIndex
                        ? {
                            ...item,
                            notes: {
                              ...item.notes,
                              otherText: e.target.value
                            }
                          }
                        : item
                    )
                  )
                }
                className="w-full bg-stone-100 border-2 border-transparent rounded-[1.5rem] p-5 text-sm md:text-base focus:bg-white focus:border-stone-300 min-h-[160px] resize-none transition-all outline-none shadow-inner font-medium text-stone-700 leading-relaxed"
                placeholder={t('detailedFeedback')}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
