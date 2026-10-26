import useSharedOutboxSync from './hooks/useSharedOutboxSync';
import { sharedCodeFromUrl, withoutSharedLink } from './lib/sharedLink';
import SessionEvaluation from './components/SessionEvaluation';
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Collaboration from './components/Collaboration';
import { getCupper } from './lib/collaboration';
import {
  INITIAL_SCORE
} from './constants';
import { LEXICON_OPTIONS, normalizeLexiconMode } from './lib/lexicon';
import {
  calculateTotal,
  buildSessionCSV,
  csvFilename,
  getBaseTag,
  importSessionFromCSV,
  initializeSamples
} from './lib/cupping';
import useGoogleSheets from './hooks/useGoogleSheets';
import { readScriptResponse, sessionFingerprint } from './lib/sharedSync';
import { normalizeSessionCode, validateRecalledSession } from './lib/sessionRecall';
import { newSyncId, normalizeSessionIdentity } from './lib/googleSheets';
import SearchableSelect from './components/SearchableSelect';
import { COUNTRY_OPTIONS, SAMPLE_TYPE_OPTIONS } from './lib/lotOptions';
import FlavorWheel from './components/FlavorWheel';
import { reportPdfFilename, uniquePdfFilename } from './lib/reportFilenames';
import { canModifyTag, nextTagModifier } from './lib/tagModifiers';
import Icon from './components/Icon';
import ReportTags from './components/ReportTags';
import SpiderGraph from './components/SpiderGraph';
import CsvExportDialog from './components/CsvExportDialog';
import CoffeeReportModal from './components/CoffeeReportModal';
import SessionUpdate from './components/SessionUpdate';
import LotLookupStatus from './components/LotLookupStatus';
import LotCacheControl from './components/LotCacheControl';
import useLotLookup from './hooks/useLotLookup';
import HandsLogo from '../assets/hands.png';
import {
  translate,
  translateLevel,
  translateProcessing,
  LANGUAGE_OPTIONS,
  nextLanguage,
  normalizeLanguage
} from './i18n';

const EInkToggle = ({ isActive, onToggle, t, compact = false, iconOnly = false, className = '' }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={isActive}
    aria-label={t('bwMode')}
    className={`eink-toggle ${isActive ? 'is-active' : ''} ${compact ? 'eink-toggle-compact' : ''} ${iconOnly ? 'eink-toggle-icon-only' : ''} ${className}`}
    title={isActive ? t('switchStandard') : t('switchBw')}
  >
    {iconOnly ? <Icon name="contrast" size={16} /> : <span>{t('bwMode')}</span>}
    {!compact && !iconOnly && <span className="eink-toggle-state">{isActive ? t('on') : t('off')}</span>}
  </button>
);

const LanguageToggle = ({ language, onToggle, t, compact = false, iconOnly = false, className = '' }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`eink-toggle ${compact ? 'eink-toggle-compact' : ''} ${iconOnly ? 'eink-toggle-icon-only' : ''} ${className}`}
    title={t(LANGUAGE_OPTIONS[nextLanguage(language)].switchKey)}
    aria-label={t(LANGUAGE_OPTIONS[nextLanguage(language)].switchKey)}
  >
    {iconOnly ? <Icon name="globe" size={16} /> : <span>{LANGUAGE_OPTIONS[nextLanguage(language)].code}</span>}
    {!compact && !iconOnly && <span className="eink-toggle-state">{LANGUAGE_OPTIONS[nextLanguage(language)].name}</span>}
  </button>
);

const METADATA_TABLE_COLUMNS = ['ositoId', 'lotName', 'processing', 'waterActivity', 'moisture', 'processingOther', 'country', 'sampleType', 'roastId'];
const PROCESSING_CANONICAL = { washed: 'Washed', natural: 'Natural', honey: 'Honey', other: 'Other' };
const draftFingerprint = (id, name, startTime, lexiconMode, samples) => sessionFingerprint({ syncId: id, name, startTime, lexiconMode, samples });
const METADATA_NUMERIC_COLUMNS = new Set(['waterActivity', 'moisture']);

// Columns that support click-and-drag fill. Osito ID uses the "<number>.<2-digit contract year>"
// convention, so the year suffix is matched exactly and never incremented; Roast ID just increments
// whatever trailing run of digits it finds (works for plain numbers or things like "R-004").
const FILL_SEQUENCE_FIELDS = new Set(['ositoId', 'roastId']);
const parseFillToken = (value, field) => {
  const raw = String(value ?? '').trim();
  if (field === 'ositoId') {
    const match = /^(\d+)(\.\d{2})$/.exec(raw);
    if (!match) return null;
    return { prefix: '', pad: match[1].length, number: parseInt(match[1], 10), suffix: match[2] };
  }
  const match = /^(.*?)(\d+)$/.exec(raw);
  if (!match) return null;
  return { prefix: match[1], pad: match[2].length, number: parseInt(match[2], 10), suffix: '' };
};
const formatFillToken = (token, number) => `${token.prefix}${String(Math.max(0, number)).padStart(token.pad, '0')}${token.suffix}`;
// Always a constant step (never a "fancy" pattern). A single seed cell always assumes +1 — adjacent
// coffees never share an Osito ID or Roast ID in practice. Two or more seed cells establish their own
// step instead, as long as they share the same prefix/suffix and a single, consistent difference.
const buildFillSequence = (seedValues, field, count) => {
  const fallback = () => Array.from({ length: count }, () => seedValues.at(-1) ?? '');
  const tokens = seedValues.map((value) => parseFillToken(value, field));
  if (tokens.some((token) => !token)) return fallback();
  if (tokens.length === 1) {
    const only = tokens[0];
    return Array.from({ length: count }, (_, i) => formatFillToken(only, only.number + i + 1));
  }
  const [first, ...rest] = tokens;
  if (rest.some((token) => token.prefix !== first.prefix || token.suffix !== first.suffix)) return fallback();
  const step = tokens[1].number - tokens[0].number;
  for (let i = 2; i < tokens.length; i += 1) if (tokens[i].number - tokens[i - 1].number !== step) return fallback();
  const last = tokens.at(-1);
  return Array.from({ length: count }, (_, i) => formatFillToken(last, last.number + step * (i + 1)));
};

const parseClipboardRows = (text) => {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
  if (!normalized) return [];
  return normalized.split('\n').map((line) => line.split('\t'));
};

const App = () => {
  useSharedOutboxSync();
  const [collaboration, setCollaboration] = useState(() => {
    const code=sharedCodeFromUrl(window.location.href);
    return code ? { initialView:'guest',initialCode:code } : null;
  });
  useEffect(()=>{
    const openSharedLink=()=>{
      const code=sharedCodeFromUrl(window.location.href);
      setCollaboration(previous=>code?{initialView:'guest',initialCode:code}:previous?.initialCode?null:previous);
    };
    window.addEventListener('hashchange',openSharedLink);
    window.addEventListener('popstate',openSharedLink);
    return()=>{window.removeEventListener('hashchange',openSharedLink);window.removeEventListener('popstate',openSharedLink);};
  },[]);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [displayMode, setDisplayMode] = useState('standard');
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return normalizeLanguage(localStorage.getItem('cupping_language'));
  });
  const [appState, setAppState] = useState('setup');
  const [metadataOrigin, setMetadataOrigin] = useState('setup');
  const [blindSession,setBlindSession]=useState(false);
  const [numSamples, setNumSamples] = useState(1);
  const [lexiconMode, setLexiconMode] = useState('osito');
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);
  const [samples, setSamples] = useState([]);
  const samplesUndoStack = useRef([]);
  const samplesUndoPrevious = useRef(samples);
  const samplesUndoSkipNext = useRef(false);
  const samplesUndoLastPushAt = useRef(0);
  const [canUndoSamples, setCanUndoSamples] = useState(false);
  useEffect(() => {
    if (samplesUndoSkipNext.current) {
      samplesUndoSkipNext.current = false;
      samplesUndoPrevious.current = samples;
      return;
    }
    const now = Date.now();
    if (now - samplesUndoLastPushAt.current > 1500) {
      samplesUndoStack.current = [...samplesUndoStack.current, samplesUndoPrevious.current].slice(-20);
      samplesUndoLastPushAt.current = now;
      setCanUndoSamples(true);
    }
    samplesUndoPrevious.current = samples;
  }, [samples]);
  const resetSamplesUndo = () => {
    samplesUndoStack.current = [];
    samplesUndoLastPushAt.current = Date.now();
    setCanUndoSamples(false);
  };
  const undoSamplesChange = () => {
    const stack = samplesUndoStack.current;
    if (!stack.length) return;
    const previous = stack[stack.length - 1];
    samplesUndoStack.current = stack.slice(0, -1);
    samplesUndoSkipNext.current = true;
    samplesUndoLastPushAt.current = Date.now();
    setSamples(previous);
    setCanUndoSamples(samplesUndoStack.current.length > 0);
  };
  // Table view: a cell is either merely selected (arrow keys/click just move the selection) or
  // actively being edited (double-click, Enter, F2, or typing a character). Only one cell edits at a time.
  const [editingCell, setEditingCell] = useState(null);
  const fillDragRef = useRef(null);
  const [fillPreviewRow, setFillPreviewRow] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [history, setHistory] = useState([]);
  const lastPersistedDraft = useRef(null);
  // Saves can fail if the device is out of storage (realistic after a long heavy-use trip offline).
  // Every write to cupping_history goes through this so a full device surfaces a warning instead of
  // silently losing an edit — the in-memory state and the Google Sheet sync are unaffected either way.
  const saveHistoryStorage = (value) => {
    try {
      localStorage.setItem('cupping_history', JSON.stringify(value));
      return true;
    } catch {
      window.dispatchEvent(new CustomEvent('osito-toast', { detail: { kind: 'warning', key: 'storageFull', autoDismiss: false } }));
      return false;
    }
  };
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [activeSessionName, setActiveSessionName] = useState('');
  const [activeSavedSessionId, setActiveSavedSessionId] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [metadataTableMode, setMetadataTableMode] = useState(false);
  const [metadataTableSelection, setMetadataTableSelection] = useState({ anchor: null, focus: null });
  const metadataTableSelectionRef = useRef(metadataTableSelection);
  metadataTableSelectionRef.current = metadataTableSelection;
  const [metadataTableSort, setMetadataTableSort] = useState(null);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingPdfs, setIsExportingPdfs] = useState(false);
  const [preparedPdf, setPreparedPdf] = useState(null);
  const [recallCode, setRecallCode] = useState('');
  const [recalling, setRecalling] = useState(false);
  const recallRequest = useRef(0);
  useEffect(() => { recallRequest.current += 1; }, [appState]);
  const [preparedCsv, setPreparedCsv] = useState(null);
  const openCsvExport = () => setPreparedCsv({
    text: buildSessionCSV(samples, sessionStartTime, lexiconMode, activeSavedSession?.syncId || ''),
    name: csvFilename(activeSessionName)
  });
  const [historyPreview, setHistoryPreview] = useState(null);
  const [rehydratingId, setRehydratingId] = useState(null);
  const historyPdfRequest = useRef(0);
  const closePreparedPdf = () => {
    historyPdfRequest.current += 1;
    setPreparedPdf(null);
  };
  const [isDragActive, setIsDragActive] = useState(false);
  const [sampleDrag, setSampleDrag] = useState(null);
  const importInputRef = useRef(null);
  const metadataTableBodyRef = useRef(null);
  const metadataTableSelectingRef = useRef(false);
  const sampleDragRef = useRef(null);

  useEffect(() => () => {
    if (preparedPdf?.url) URL.revokeObjectURL(preparedPdf.url);
  }, [preparedPdf]);

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
      if (Array.isArray(parsed)) {
        const migrated = parsed.map(normalizeSessionIdentity);
        // Load what's already on disk first, then best-effort rewrite it in the migrated shape —
        // a storage-full device must never lose sessions that were already there just because this
        // routine rewrite couldn't be saved back.
        setHistory(migrated);
        saveHistoryStorage(migrated);
      }
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
      const wasSelecting = metadataTableSelectingRef.current;
      metadataTableSelectingRef.current = false;
      const drag = fillDragRef.current;
      fillDragRef.current = null;
      setFillPreviewRow(null);
      if (drag && drag.endRow > drag.seedEndRow) {
        const { col, seedStartRow, seedEndRow, endRow } = drag;
        const field = METADATA_TABLE_COLUMNS[col];
        setSamples((prev) => {
          const seedValues = prev.slice(seedStartRow, seedEndRow + 1).map((item) => item[field] || '');
          const count = endRow - seedEndRow;
          const filled = buildFillSequence(seedValues, field, count);
          return prev.map((item, idx) => {
            const offset = idx - (seedEndRow + 1);
            if (offset < 0 || offset >= count) return item;
            return applyMetadataTableValueToSample(item, field, filled[offset]);
          });
        });
        setMetadataTableSelection({ anchor: { row: seedStartRow, col }, focus: { row: endRow, col } });
        focusMetadataTableCell(endRow, col, { immediate: true });
        return;
      }
      // A plain drag-select moves the active cell on every pointerEnter without focusing it (to avoid
      // scroll/focus thrashing mid-drag — see handleMetadataTablePointerEnter). Once the drag ends,
      // the final cell needs real DOM focus so keyboard nav and copy/paste work on it afterward.
      const active = metadataTableSelectionRef.current.focus;
      if (wasSelecting && active) focusMetadataTableCell(active.row, active.col, { immediate: true });
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
  const lotLookup = useLotLookup(samples, setSamples, appState === 'metadata', activeSavedSessionId);
  const isTablet = viewportWidth >= 640 && viewportWidth < 1024;
  const isEinkMode = displayMode === 'eink';
  const t = (key) => translate(language, key);
  const reportRadarSize = isMobile ? 260 : isTablet ? 280 : 300;

  const resetToHome = () => {
    // Flush the latest edits before clearing the active session, including lot setup.
    if (samples.length && lastPersistedDraft.current !== draftFingerprint(activeSavedSessionId, activeSessionName, sessionStartTime, lexiconMode, samples)) {
      try {
        const existing = history.find(item => item.id === activeSavedSessionId);
        const startTime = sessionStartTime || new Date().toLocaleString();
        const entry = buildSessionEntry(existing?.id ?? Date.now(), activeSessionName || startTime, existing || {}, samples, startTime);
        persistHistory(existing ? history.map(item => item.id === existing.id ? entry : item) : [entry, ...history]);
      } catch (error) {
        console.error(error);
        window.alert(t('homeSaveError'));
        return;
      }
    }
    setBlindSession(false);
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
  const toggleLanguage = () => setLanguage(nextLanguage);

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
    syncId: existingEntry.syncId || newSyncId(),
    name,
    cupper: existingEntry.cupper ?? getCupper(),
    date: existingEntry.date || new Date().toLocaleDateString(),
    startTime,
    lexiconMode,
    samples: cloneSamplesForSave(sourceSamples).map(sample => ({ ...sample, cupper: sample.cupper ?? existingEntry.cupper ?? getCupper() })),
    count: sourceSamples.length
  });

  const persistHistory = (updatedHistory) => {
    saveHistoryStorage(updatedHistory);
    setHistory(updatedHistory);
  };

  const sharedSync = useGoogleSheets(history, (codes, versions) => setHistory(current => {
    const updated = current.map(entry => codes[entry.syncId] ? { ...entry, sessionCode: codes[entry.syncId], ...versions?.[entry.syncId] } : entry);
    saveHistoryStorage(updated);
    return updated;
  }));

  // A trimmed entry keeps only what Saved Sessions search/display needs (name/date/code/count plus each
  // sample's ositoId+lotName+syncId); scores/notes/tags are dropped. Reopening it fetches the full data
  // back from the sheet via its session code — the same recall path as the manual code-entry flow.
  const trimSessionEntry = (entry) => ({
    ...entry,
    trimmed: true,
    samples: entry.samples.map(sample => ({ syncId: sample.syncId, ositoId: sample.ositoId, lotName: sample.lotName }))
  });

  // Trimming only kicks in once local storage is actually getting tight, not on a fixed age — most
  // devices will never hit this. When it does, the oldest already-synced sessions (beyond the most
  // recent TRIM_KEEP_RECENT) get trimmed first, stopping as soon as usage is back under the target.
  const TRIM_KEEP_RECENT = 10;
  const TRIM_TRIGGER_BYTES = 4 * 1024 * 1024;
  const TRIM_TARGET_BYTES = 3 * 1024 * 1024;
  const runStorageTrim = (currentHistory) => {
    const startSize = JSON.stringify(currentHistory).length;
    if (startSize < TRIM_TRIGGER_BYTES) return currentHistory;

    const candidates = currentHistory
      .map((entry, idx) => ({ entry, idx }))
      .slice(TRIM_KEEP_RECENT)
      .filter(({ entry }) => !entry.trimmed && entry.id !== activeSavedSessionId && sharedSync.isSynced(entry))
      .reverse();
    if (!candidates.length) return currentHistory;

    const next = [...currentHistory];
    let size = startSize;
    for (const { entry, idx } of candidates) {
      if (size < TRIM_TARGET_BYTES) break;
      const trimmedEntry = trimSessionEntry(entry);
      size -= JSON.stringify(entry).length - JSON.stringify(trimmedEntry).length;
      next[idx] = trimmedEntry;
    }
    return next;
  };

  const trimCheckTimer = useRef(null);
  useEffect(() => {
    clearTimeout(trimCheckTimer.current);
    trimCheckTimer.current = setTimeout(() => {
      setHistory(current => {
        const next = runStorageTrim(current);
        if (next === current) return current;
        saveHistoryStorage(next);
        return next;
      });
    }, 3000);
    return () => clearTimeout(trimCheckTimer.current);
  }, [history]);

  // Reopening a trimmed entry (click in Saved Sessions, or Share cupping) needs its full data back first.
  const rehydrateSession = async (entry) => {
    if (!entry.trimmed) return entry;
    if (!entry.sessionCode) throw new Error('sharedUnavailable');
    const result = await readScriptResponse({ action: 'recall', code: entry.sessionCode });
    if (result.protocol !== 2) throw new Error('sharedUpgrade');
    const remote = validateRecalledSession(result.session, entry.sessionCode);
    const hydrated = { ...entry, ...remote, id: entry.id, trimmed: false };
    persistHistory(history.map(item => (item.id === entry.id ? hydrated : item)));
    sharedSync.acceptRemote(hydrated);
    return hydrated;
  };

  const withRehydrated = async (item, onReady) => {
    if (rehydratingId) return;
    if (item.trimmed) setRehydratingId(item.id);
    try {
      onReady(await rehydrateSession(item));
    } catch {
      window.dispatchEvent(new CustomEvent('osito-toast', { detail: { kind: 'warning', key: 'archivedSessionOffline', autoDismiss: false } }));
    } finally {
      setRehydratingId(null);
    }
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
    const draft = draftFingerprint(activeSavedSessionId, activeSessionName, sessionStartTime, lexiconMode, samples);
    if (lastPersistedDraft.current === draft) return;

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
      saveHistoryStorage(updatedHistory);
      lastPersistedDraft.current = draft;
      return updatedHistory;
    });
  }, [samples, sessionStartTime, activeSavedSessionId, activeSessionName, lexiconMode]);

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
    setBlindSession(false);
    setLexiconMode(normalizeLexiconMode(session.lexiconMode));
    const sessionSamples = Array.isArray(session.samples) ? session.samples : [];
    const loadedStartTime = session.startTime || new Date().toLocaleString();
    lastPersistedDraft.current = draftFingerprint(session.id ?? null, session.name || '', loadedStartTime, normalizeLexiconMode(session.lexiconMode), sessionSamples);
    resetSamplesUndo();
    setEditingCell(null);
    setSamples(sessionSamples);
    setNumSamples(sessionSamples.length || 1);
    setActiveSampleIndex(0);
    setSessionStartTime(loadedStartTime);
    setActiveSessionName(session.name || '');
    setActiveSavedSessionId(session.id ?? null);
    setSessionName(session.name || '');
    setAppState('report');
  };

  const normalizeSampleCount = (value) => {
    const count = Number(value);
    return Number.isSafeInteger(count) && count >= 1 ? count : 1;
  };

  const addCoffee = () => {
    setSamples((current) => {
      const nextId = current.reduce((max, sample) => Math.max(max, Number(sample.id) || 0), 0) + 1;
      return [...current, { ...initializeSamples(1)[0], id: nextId }];
    });
    setNumSamples(samples.length + 1);
    setMetadataTableSort(null);
  };

  const startSession = () => {
    setBlindSession(false);
    const startedAt = new Date().toLocaleString();
    const nextSamples = initializeSamples(normalizeSampleCount(numSamples));
    setSessionStartTime(startedAt);
    resetSamplesUndo();
    setEditingCell(null);
    setSamples(nextSamples);
    setActiveSampleIndex(0);
    createAutosavedSession(nextSamples, startedAt);
    setAppState('cupping');
  };

  const goToMetadata = (origin) => {
    const nextStartTime = sessionStartTime || new Date().toLocaleString();
    const nextSamples = samples.length === 0 ? initializeSamples(normalizeSampleCount(numSamples)) : samples;
    if (!sessionStartTime) setSessionStartTime(nextStartTime);
    if (samples.length === 0) setSamples(nextSamples);
    if (activeSavedSessionId === null && nextSamples.length > 0) createAutosavedSession(nextSamples, nextStartTime);
    setMetadataOrigin(origin);
    setAppState('metadata');
  };

  const isCsvFile = (file) => String(file?.name ?? '').toLowerCase().endsWith('.csv');
  const recallSession = async event => {
    event.preventDefault();
    const request = ++recallRequest.current;
    setRecalling(true);
    setImportError('');
    try {
      sharedSync.holdRecall();
      const code = normalizeSessionCode(recallCode);
      const result = await readScriptResponse({ action: 'recall', code });
      if (result.protocol !== 2) throw new Error('sharedUpgrade');
      if (request !== recallRequest.current) return;
      const session = validateRecalledSession(result.session, code);
      const existing = history.find(entry => entry.syncId === session.syncId);
      if (existing && !window.confirm(t('replaceRecalledSession'))) return;
      const entry = { ...session, id: existing?.id ?? newSyncId(), name: session.name || session.startTime || code };
      persistHistory(existing ? history.map(item => item.id === existing.id ? entry : item) : [entry, ...history]);
      sharedSync.acceptRemote(entry);
      loadSession(entry);
    } catch (error) {
      if (request === recallRequest.current) setImportError(t(error.message === 'invalidSessionCode' ? 'invalidSessionCode' : 'recallFailed'));
    } finally { sharedSync.release('*'); setRecalling(false); }
  };

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
      setLexiconMode(normalizeLexiconMode(imported.lexiconMode));
      setNumSamples(imported.samples.length);
      setActiveSampleIndex(0);
      setSessionStartTime(importedStartTime);
      const matching = history.find(entry => entry.syncId === imported.syncId);
      const entry = buildSessionEntry(matching?.id ?? newSyncId(), imported.sessionName || importedStartTime, { syncId: imported.syncId || newSyncId() }, imported.samples, importedStartTime);
      entry.lexiconMode = imported.lexiconMode;
      persistHistory(matching ? history.map(item => item.id === matching.id ? entry : item) : [entry, ...history]);
      setActiveSavedSessionId(entry.id);
      setActiveSessionName(entry.name);
      setSessionName(imported.sessionName || '');
      setAppState('report');
    } catch (err) {
      setImportError(language !== 'en' ? t('csvImportError') : err?.message || t('csvImportError'));
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const printAllPdf = async () => {
    if (isExportingPdfs || samples.length === 0) return;
    setIsExportingPdfs(true);
    try {
      const { buildCombinedReportPdf } = await import('./lib/pdfReport');
      const name = reportPdfFilename(samples, activeSessionName);
      const bytes = await buildCombinedReportPdf(samples, { sessionStartTime: reportDateWithCode(sessionStartTime, activeSavedSession), language, logoSrc: HandsLogo, title: name.replace(/\.pdf$/, '') });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPreparedPdf({ url, name });
    } catch (error) {
      console.error(error);
      window.alert(t('pdfExportError'));
    } finally {
      setIsExportingPdfs(false);
    }
  };

  const prepareHistoryCoffeePdf = async (session, sample, index) => {
    const request = ++historyPdfRequest.current;
    const name = uniquePdfFilename(sample, index, new Map());
    setPreparedPdf({ name, url: null });
    try {
      const { buildCombinedReportPdf } = await import('./lib/pdfReport');
      const bytes = await buildCombinedReportPdf([sample], {
        sessionStartTime: reportDateWithCode(session.startTime || session.date || '', session), language, logoSrc: HandsLogo, title: name.replace(/\.pdf$/, '')
      });
      if (request !== historyPdfRequest.current) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setPreparedPdf({ name, url });
    } catch (error) {
      if (request !== historyPdfRequest.current) return;
      console.error(error);
      setPreparedPdf(null);
      window.alert(t('pdfExportError'));
    }
  };

  const renderPdfReadyDialog = () => preparedPdf && <div className="pdf-ready-backdrop print-hidden">
    <section role="dialog" aria-modal="true" aria-labelledby="pdf-ready-title" className="pdf-ready-dialog" onKeyDown={event => {
      if (event.key === 'Escape') closePreparedPdf();
      if (event.key === 'Tab') {
        const controls = event.currentTarget.querySelectorAll('button, a');
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
      }
    }}>
      <button type="button" className="pdf-ready-close" onClick={closePreparedPdf} aria-label={t('closePdf')} autoFocus><Icon name="x" size={20} /></button>
      <h2 id="pdf-ready-title" aria-live="polite">{t(preparedPdf.url ? 'pdfReady' : 'exportingPdfs')}</h2>
      <p>{preparedPdf.name}</p>
      {preparedPdf.url && <div className="pdf-ready-actions">
        <a href={preparedPdf.url} download={preparedPdf.name}><Icon name="download" size={18} />{t('downloadPdf')}</a>
        <a href={preparedPdf.url} target="_blank" rel="noopener noreferrer"><Icon name="printer" size={18} />{t('openPdf')}</a>
      </div>}
    </section>
  </div>;

  const downloadPdfSet = async () => {
    if (isExportingPdfs || samples.length === 0) return;

    setIsExportingPdfs(true);
    try {
      const { downloadReportPdfZip } = await import('./lib/pdfReport');
      await downloadReportPdfZip(samples, {
        sessionStartTime: reportDateWithCode(sessionStartTime, activeSavedSession),
        sessionName: activeSessionName,
        language,
        logoSrc: HandsLogo
      });
    } catch (err) {
      console.error(err);
      window.alert(t('pdfExportError'));
    } finally {
      setIsExportingPdfs(false);
    }
  };

  const updateScore = (sampleIdx, cat, delta) => {
    setSamples((prev) => {
      const sample = prev[sampleIdx];
      if (sample.noScore) return prev;
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

  // Deferred by default via requestAnimationFrame so a cell added in this same render (not yet in the
  // DOM) can still be found once React commits. Callers that know the target cell is already rendered
  // (e.g. clicking/tapping an existing cell) should pass immediate:true — otherwise a fast follow-up
  // keystroke can land before the deferred focus() runs and get lost or go to the wrong element.
  const focusMetadataTableCell = (row, col, { selectText = false, immediate = false } = {}) => {
    const run = () => {
      const cell = metadataTableBodyRef.current?.querySelector(`[data-metadata-cell="${row}-${col}"]`);
      if (!cell) return;
      cell.focus({ preventScroll: true });
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (selectText) cell.select?.();
    };
    if (immediate) run();
    else window.requestAnimationFrame(run);
  };

  const selectMetadataTableCell = (row, col, { extend = false, focus = true, selectText = false, immediate = false } = {}) => {
    const nextCell = {
      row: Math.min(Math.max(row, 0), Math.max(samples.length - 1, 0)),
      col: Math.min(Math.max(col, 0), METADATA_TABLE_COLUMNS.length - 1)
    };
    setMetadataTableSelection((current) => ({
      anchor: extend && current.anchor ? current.anchor : nextCell,
      focus: nextCell
    }));
    if (focus) focusMetadataTableCell(nextCell.row, nextCell.col, { selectText, immediate });
  };

  const isEditingCell = (row, col) => editingCell?.row === row && editingCell?.col === col;
  // A dropdown field that just started editing from a typed character needs its own search text
  // seeded with what was typed, so the list narrows immediately instead of showing everything.
  const seededQueryFor = (row, col, displayValue) => (isEditingCell(row, col) && editingCell.seeded ? displayValue : undefined);

  // Single place every live keystroke in the table goes through, whether typed normally or seeded
  // by beginEditingCell below, so both paths stay identical.
  const handleTableFieldChange = (idx, field, value) => {
    if (field === 'processing') {
      // Only commit to a canonical value when the typed/seeded text exactly matches one of the
      // dropdown's own labels (i.e. an actual selection) — otherwise this is still a
      // partial search in progress, so just mirror it and let SearchableSelect's own filtering
      // narrow the list. Normalizing every keystroke here previously turned "N" into "Other"
      // before "Natural" could ever be typed. Free text still gets normalized on blur.
      const pickedKey = Object.keys(PROCESSING_CANONICAL).find((key) => t(key) === value);
      setSamples((prev) => prev.map((item, i) => {
        if (i !== idx) return item;
        if (!pickedKey) return { ...item, processing: value };
        const canonical = PROCESSING_CANONICAL[pickedKey];
        return { ...item, processing: canonical, processingOther: canonical === 'Other' ? item.processingOther : '' };
      }));
    } else {
      updateMetadata(idx, field, value);
    }
  };

  const beginEditingCell = (row, col, { seedValue } = {}) => {
    // Synchronous, not the usual rAF-deferred focus: if a keystroke seeded this edit, the next
    // keystroke can arrive within a frame, and a deferred focus means it lands before the field is
    // even focused — or after, right as select-all highlights the seed character, so it overwrites
    // it instead of continuing after it. Flushing now means the field is already focused and
    // correctly positioned before this function returns, so no keystroke can race it.
    flushSync(() => {
      if (seedValue !== undefined) handleTableFieldChange(row, METADATA_TABLE_COLUMNS[col], seedValue);
      setEditingCell({ row, col, seeded: seedValue !== undefined });
    });
    const cell = metadataTableBodyRef.current?.querySelector(`[data-metadata-cell="${row}-${col}"]`);
    if (!cell) return;
    cell.focus({ preventScroll: true });
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (seedValue !== undefined) {
      const end = cell.value?.length ?? 0;
      cell.setSelectionRange?.(end, end);
    } else {
      cell.select?.();
    }
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
    } else if (['lotName', 'country', 'sampleType', 'roastId'].includes(field)) {
      next[field] = raw;
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

  // Leaving an edited Osito ID cell needs to trigger the lot lookup the same way blurring a plain
  // input would. Pressing Enter/Tab/Escape/arrows exits edit mode by unmounting the <input> via
  // setEditingCell(null) rather than a real DOM blur, and React doesn't reliably deliver a synthetic
  // blur for an element removed this way — so lotLookup.commit() never ran. Routing every programmatic
  // exit through here instead of setEditingCell(null) directly keeps that commit call in sync.
  const stopEditingCell = () => {
    lotLookup.commit();
    setEditingCell(null);
  };

  // A cell only edits when you double-click, press Enter/F2, or start typing on it — plain
  // click/arrow navigation just selects, like a real spreadsheet. See isEditingCell/beginEditingCell.
  const handleMetadataTableKeyDown = (row, col, e) => {
    const editing = isEditingCell(row, col);
    const moveTo = (nextRow, nextCol, { extend = e.shiftKey } = {}) => {
      e.preventDefault();
      stopEditingCell();
      selectMetadataTableCell(nextRow, nextCol, { extend });
    };

    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      if (!canUndoSamples) return;
      e.preventDefault();
      stopEditingCell();
      undoSamplesChange();
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
      moveTo(nextRow, nextCol, { extend: false });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (editing) { stopEditingCell(); selectMetadataTableCell(row + (e.shiftKey ? -1 : 1), col, { extend: false }); }
      else beginEditingCell(row, col);
      return;
    }

    if (e.key === 'F2') {
      if (!editing) { e.preventDefault(); beginEditingCell(row, col); }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) stopEditingCell();
      focusMetadataTableCell(row, col);
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      const range = getMetadataTableSelectionRange() || { startRow: row, endRow: row, startCol: col, endCol: col };
      const singleCell = range.startRow === range.endRow && range.startCol === range.endCol;
      if (editing && singleCell) return; // let native text deletion happen inside the field
      e.preventDefault();
      stopEditingCell();
      clearMetadataTableRange(range);
      return;
    }

    if (!editing) {
      if (e.key === 'ArrowUp') { moveTo(row - 1, col); return; }
      if (e.key === 'ArrowDown') { moveTo(row + 1, col); return; }
      if (e.key === 'ArrowLeft') { moveTo(row, col - 1); return; }
      if (e.key === 'ArrowRight') { moveTo(row, col + 1); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Home') { moveTo(0, 0); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'End') { moveTo(samples.length - 1, METADATA_TABLE_COLUMNS.length - 1); return; }
      if (e.key === 'Home') { moveTo(row, 0); return; }
      if (e.key === 'End') { moveTo(row, METADATA_TABLE_COLUMNS.length - 1); return; }
      // Typing over a selected (not-yet-editing) cell replaces its content and starts editing,
      // same as any spreadsheet — only reserved/modified keys are excluded.
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        beginEditingCell(row, col, { seedValue: e.key });
      }
      return;
    }

    // Editing: left/right move the text cursor until it hits the edge of the field (see
    // shouldMoveHorizontally), then move cells. Up/down have no meaning in a single-line field,
    // so they always commit the edit and move row, matching spreadsheet convention.
    if (e.key === 'ArrowUp') { moveTo(row - 1, col); return; }
    if (e.key === 'ArrowDown') { moveTo(row + 1, col); return; }
    if (e.key === 'ArrowLeft' && shouldMoveHorizontally(e)) { moveTo(row, col - 1); return; }
    if (e.key === 'ArrowRight' && shouldMoveHorizontally(e)) { moveTo(row, col + 1); return; }
  };

  const handleMetadataTablePointerDown = (row, col, e) => {
    if (e.button !== 0) return;
    metadataTableSelectingRef.current = true;
    if (isEditingCell(row, col)) {
      selectMetadataTableCell(row, col, { extend: e.shiftKey, focus: false });
      return;
    }
    // iOS Safari doesn't reliably show the on-screen keyboard for a focus() call made from a
    // dblclick handler (double-tap), so touch gets its own gesture: tapping a cell that's already
    // the sole selection edits it, same as F2/Enter would. Mouse keeps double-click/Enter/F2 only.
    const isSoleSelectedCell = metadataTableSelection.anchor?.row === row && metadataTableSelection.anchor?.col === col &&
      metadataTableSelection.focus?.row === row && metadataTableSelection.focus?.col === col;
    if (e.pointerType === 'touch' && !e.shiftKey && isSoleSelectedCell) {
      beginEditingCell(row, col);
      return;
    }
    stopEditingCell();
    // Safari (desktop and iPad) doesn't focus a plain div on click/tap the way Chrome/Firefox do, so
    // without an explicit focus call here the "selected" cell is never actually document.activeElement
    // there — breaking keyboard nav and, critically, copy/paste (which targets whatever has focus).
    // immediate:true because the cell is already rendered — a deferred focus here can lose a fast
    // follow-up keystroke (e.g. typing right after the click) to the race it'd otherwise create.
    selectMetadataTableCell(row, col, { extend: e.shiftKey, immediate: true });
  };

  const handleMetadataTablePointerEnter = (row, col) => {
    if (fillDragRef.current) {
      const drag = fillDragRef.current;
      if (drag.col === col && row >= drag.seedEndRow && row !== drag.endRow) {
        fillDragRef.current = { ...drag, endRow: row };
        setFillPreviewRow(row);
      }
      return;
    }
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
    if (!canModifyTag(tagString)) return;
    setSamples((prev) => {
      const field = `${section}Tags`;
      const tags = [...prev[idx].notes[field]];
      const tagIdx = tags.indexOf(tagString);
      if (tagIdx === -1) return prev;

      tags[tagIdx] = nextTagModifier(tagString);

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

  const renderLexiconSelector = () => (
    <fieldset className="lexicon-selector">
      <legend className="text-xs font-bold text-stone-600 mb-2">{t('lexicon')}</legend>
      <div className="grid grid-cols-3 gap-1 border border-stone-300 rounded-lg p-1 bg-white">
        {['osito', 'wcr', 'both'].map((mode) => (
          <label key={mode} className={`relative cursor-pointer rounded-md text-center px-3 py-2 text-sm font-bold ${lexiconMode === mode ? 'bg-stone-900 text-white' : 'text-stone-700'}`}>
            <input
              className="peer sr-only"
              type="radio"
              name="lexicon"
              value={mode}
              checked={lexiconMode === mode}
              onChange={() => setLexiconMode(mode)}
            />
            <span className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4">
              {mode === 'osito' ? 'Osito' : mode === 'wcr' ? 'WCR' : t('bothLexicons')}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  if (collaboration) return <Collaboration key={collaboration.initialCode||'composer'} {...collaboration} onClose={() => { setCollaboration(null); window.history.replaceState(null, '', withoutSharedLink(window.location.href)); }} />;

  if (appState === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-stone-100">
        <div className="home-card max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-8 md:p-10 text-center border border-stone-200">
          <div className="inline-flex p-4 rounded-3xl bg-stone-900 text-white mb-6 md:mb-8 shadow-xl">
            <Icon name="coffee" size={28} />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-stone-900 mb-2 tracking-tight">{t('cuppingLab')}</h1>
          <p className="text-stone-400 font-medium mb-8 md:mb-10 text-xs uppercase tracking-widest">{t('selectSampleCount')}</p>
          <div className="flex items-center justify-between bg-stone-100 rounded-2xl p-2 md:p-3 mb-8 md:mb-10 border border-stone-200 shadow-inner">
            <button
              onClick={() => setNumSamples(Math.max(1, normalizeSampleCount(numSamples) - 1))}
              aria-label={t('decreaseSampleCount')}
              className="w-12 h-12 md:w-14 md:h-14 bg-white shadow-sm flex items-center justify-center btn-stone-light"
            >
              <Icon name="minus" size={18} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              aria-label={t('sampleCount')}
              value={numSamples}
              onChange={(e) => setNumSamples(e.target.value)}
              onBlur={() => setNumSamples(normalizeSampleCount(numSamples))}
              onFocus={(e) => e.target.select()}
              className="sample-count-input min-w-0 w-32 mx-2 bg-transparent text-center text-4xl md:text-5xl font-black text-stone-900 tabular-nums rounded-lg focus:outline-2 focus:outline-stone-900"
            />
            <button
              onClick={() => setNumSamples(normalizeSampleCount(numSamples) + 1)}
              aria-label={t('increaseSampleCount')}
              className="w-12 h-12 md:w-14 md:h-14 bg-white shadow-sm flex items-center justify-center btn-stone-light"
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
          <div className="space-y-3">
            {renderLexiconSelector()}
            <button onClick={startSession} className="w-full py-4 md:py-5 btn-stone-dark font-black text-base md:text-lg flex items-center justify-center gap-3 shadow-2xl">
              {t('startSession')}
              <Icon name="chevron-right" />
            </button>
            <div className="home-session-actions grid grid-cols-3 gap-3">
              <button
                onClick={() => {
                  setImportError('');
                  setAppState('import');
                }}
                aria-label={t('recallSession')}
                className="group min-h-[104px] rounded-2xl bg-white border border-stone-200 shadow-sm hover:border-stone-300 hover:shadow-md active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 px-2 text-center"
              >
                <span className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Icon name="upload" size={18} />
                </span>
                <span className="font-black text-[9px] sm:text-[10px] text-stone-700 uppercase tracking-[0.16em] leading-[1.05]">
                  <span className="block">{t('recallSession')}</span>
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
            <div className="home-secondary-actions">
              <button type="button" onClick={() => setCollaboration({ initialView: 'join' })}><Icon name="users" size={16} />Join a cupping</button>
              <button type="button" onClick={() => setCollaboration({ initialView: 'settings' })}><Icon name="settings" size={16} />Settings</button>
            </div>
            <div className="home-display-control home-preferences">
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
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
                <h1 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">{t('recallSession')}</h1>
                <p className="text-stone-400 font-black text-[10px] uppercase tracking-widest mt-2">
                  {t('sessionCode')} / CSV
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
                <Icon name="home" size={16} />
                {t('home')}
              </button>
            </div>
          </div>

          <form onSubmit={recallSession} className="recall-code-form">
            <label htmlFor="recall-code">{t('sessionCode')}</label>
            <div><input id="recall-code" value={recallCode} onChange={event => setRecallCode(event.target.value)} placeholder="K7MR-4X2P" autoCapitalize="characters" autoComplete="off" spellCheck={false} required maxLength={20} />
            <button type="submit" disabled={recalling || isImporting}>{t(recalling ? 'recallingSession' : 'openSessionCode')}</button></div>
          </form>
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


  const reportDateWithCode = (date, session) => session?.sessionCode ? `${date || ''} | ${t('sessionCode')}: ${session.sessionCode}` : date || '';
  const renderCoffeeReport = (s, idx, reportDate) => (
                <div
                  key={s.id}
                  className="sample-spec-sheet mb-14 md:mb-32 border-b-2 border-stone-100 pb-10 md:pb-16 last:border-0 last:mb-0 last:pb-0 print:border-stone-900 print:border-2 print:p-[0.8cm] print:mb-0 print:pb-0"
                >
                  <div className="print-page-header print-only">
                    <div className="print-page-heading-group">
                      <p className="print-page-title">{t('labSummary')}</p>
                      <p className="print-page-subtitle">{t('qualityControl')}</p>
                    </div>
                    <div className="print-page-date">{reportDate}</div>
                  </div>
                  <div className="print-identity-block flex flex-col sm:flex-row items-stretch justify-between border border-stone-900 mb-6">
                    <div className="report-identity-copy flex-1 p-4 md:p-5 bg-stone-50/30 flex flex-col justify-center">
                      <div className="report-identity-id-row flex items-center gap-3 mb-1">
                        {!s.lotName && (
                          <span className="text-[9px] font-black text-stone-300 uppercase tracking-widest">{t('sample')} 0{idx + 1}</span>
                        )}
                        <span className="report-coffee-id text-base font-bold text-stone-900">
                          {s.ositoId || t('noId')}
                        </span>
                      </div>
                      <h2 className="report-coffee-name text-xl sm:text-2xl md:text-4xl font-bold text-stone-900 leading-tight">
                        {s.lotName ? s.lotName : `${t('sample')} 0${idx + 1}`}
                      </h2>
                      <div className="report-lot-details">
                        {['country', 'sampleType', 'roastId'].filter((field) => s[field]?.trim()).map((field) => (
                          <span key={field} className="break-words"><span className="font-bold">{t(field)}:</span> {s[field]}</span>
                         ))}
                      </div>
                      <div className="report-identity-metadata flex flex-wrap items-center gap-4 sm:gap-6 pt-2">
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
                      <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.4em] mb-1">{t(s.noScore ? 'noScore' : 'finalScore')}</p>
                      <p className="text-4xl sm:text-5xl md:text-6xl font-black tabular-nums text-white leading-none">{calculateTotal(s)}</p>
                    </div>
                  </div>

                  <div className="spec-grid print-spec-grid flex flex-col lg:grid lg:grid-cols-[auto_1fr] gap-8 md:gap-12 lg:gap-16">
                    <div className="print-visual-row flex flex-col sm:flex-row items-center sm:items-start justify-center lg:justify-start gap-8 md:gap-8 visual-row">
                      <div className="print-chart-panel flex flex-col items-center w-full sm:w-auto">
                        <p className="section-header mb-6">{t('attributeMap')}</p>
                        {s.noScore ? <div className="flex items-center justify-center" style={{ width: reportRadarSize, height: reportRadarSize }}>{t('noScore')}</div> : <SpiderGraph scores={s.scores} size={reportRadarSize} einkMode={isEinkMode} language={language} />}
                      </div>
                      <div className="print-chart-panel flex flex-col items-center w-full sm:w-auto">
                        <p className="section-header mb-6">{t('flavorProfile')}</p>
                        <div className="report-wheel-panel">
                          <FlavorWheel
                            notes={s.notes}
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
                          <div className="report-observation-levels flex flex-wrap gap-2 mb-2 text-stone-800">
                            {s.notes.acidityLevel && (
                              <span>
                                {t('acidity')}: {translateLevel(language, s.notes.acidityLevel)}
                              </span>
                            )}
                            {s.notes.sweetnessLevel && (
                              <span>
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
  );

  if (appState === 'history') {
    return (
      <div className="min-h-screen bg-stone-100 p-6 md:p-12">
        {historyPreview && <CoffeeReportModal
          title={[historyPreview.sample.ositoId, historyPreview.sample.lotName || `${t('coffee')} ${historyPreview.index + 1}`].filter(Boolean).join(' · ')}
          onClose={() => { closePreparedPdf(); setHistoryPreview(null); }}
          onCreatePdf={() => prepareHistoryCoffeePdf(historyPreview.session, historyPreview.sample, historyPreview.index)}
          suspended={Boolean(preparedPdf)} t={t}
        >
          <div className="report-title"><div><h1>{t('labSummary')}</h1><p>{t('qualityControl')}</p></div><div className="report-title-date">{reportDateWithCode(historyPreview.session.startTime || historyPreview.session.date, historyPreview.session)}</div></div>
          {renderCoffeeReport(historyPreview.sample, historyPreview.index, reportDateWithCode(historyPreview.session.startTime || historyPreview.session.date, historyPreview.session))}
        </CoffeeReportModal>}
        {renderPdfReadyDialog()}
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">{t('savedSessions')}</h1>
            <div className="flex items-center gap-3">
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <button type="button" onClick={() => setAppState('setup')} className="eink-toggle eink-toggle-compact">
                <Icon name="home" size={16} /> {t('home')}
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
                const isRehydrating = rehydratingId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => withRehydrated(item, loadSession)}
                    className={`bg-white p-6 rounded-3xl border border-stone-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow relative group ${isRehydrating ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="flex items-center gap-1 text-[10px] font-black text-stone-300 uppercase tracking-widest">
                        {item.date}
                        {item.trimmed && <span title={t('archivedSessionHint')}><Icon name="download" size={11} className="text-stone-300" /></span>}
                      </span>
                      <button onClick={(e) => deleteSession(item.id, e)} className="history-delete-button p-2 transition-colors">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                    <h3 className="text-lg font-black text-stone-900 leading-tight pr-4">{item.name}</h3>
                    <p className="session-code">{t('sessionCode')}: {item.sessionCode || t('codePending')}</p>
                    <button type="button" className="history-share-action" onClick={event => { event.stopPropagation(); withRehydrated(item, hydrated => setCollaboration({ initialView: 'create', session: hydrated })); }}>Share cupping<Icon name="chevron-right" size={14} /></button>
                    <p className="text-xs font-bold text-stone-400 uppercase mt-2">{item.count} {t('samples')}</p>
                    {coffeeMatches.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {coffeeMatches.slice(0, 3).map(({ sample, idx }) => (
                          <button
                            type="button"
                            key={`${item.id}-${idx}`}
                            onClick={event => { event.stopPropagation(); withRehydrated(item, hydrated => setHistoryPreview({ session: hydrated, sample: hydrated.samples[idx] ?? sample, index: idx })); }}
                            title={t('viewReport')}
                            aria-label={`${t('viewReport')}: ${sample.ositoId || sample.lotName || `${t('coffee')} ${idx + 1}`}`}
                            className="history-coffee-token inline-flex items-center rounded-full bg-stone-100 border border-stone-200 px-3 py-1 text-[10px] font-black text-stone-600 uppercase tracking-wider"
                          >
                            #{idx + 1} {sample.lotName || t('coffee')}{sample.ositoId ? ` · ${sample.ositoId}` : ''}
                          </button>
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
      processingOther: t('processingDetails'),
      country: t('country'), sampleType: t('sampleType'), roastId: t('roastId')
    };
    const tableColumnWidths = {
      ositoId: '150px',
      lotName: '230px',
      processing: '170px',
      waterActivity: '140px',
      moisture: '120px',
      processingOther: '230px',
      country: '160px', sampleType: '160px', roastId: '160px'
    };
    const selectionRange = getMetadataTableSelectionRange();
    const getTableCellClass = (row, col, extra = '') => {
      const drag = fillDragRef.current;
      const isFillPreview = drag && drag.col === col && row > drag.seedEndRow && row <= (fillPreviewRow ?? drag.endRow);
      return `metadata-grid-cell ${isMetadataTableCellSelected(row, col) ? 'is-selected' : ''} ${
        isMetadataTableCellActive(row, col) ? 'is-active' : ''
      } ${isFillPreview ? 'is-fill-preview' : ''} ${extra}`;
    };
    const getTableCommonProps = (row, col) => ({
      'data-metadata-cell': `${row}-${col}`,
      'data-table-row': row,
      'data-table-col': col,
      onFocus: () => {
        if (!isMetadataTableCellSelected(row, col)) selectMetadataTableCell(row, col, { focus: false });
      },
      onKeyDown: (e) => handleMetadataTableKeyDown(row, col, e),
      onPaste: (e) => handleTablePaste(row, col, tableColumns, e),
      onCopy: handleMetadataTableCopy,
      onCut: handleMetadataTableCut
    });
    const getTableInputProps = (row, col) => ({ ...getTableCommonProps(row, col), className: 'metadata-grid-input' });
    const getTableCellProps = (row, col, extra = '') => ({
      className: getTableCellClass(row, col, extra),
      onPointerDown: (e) => handleMetadataTablePointerDown(row, col, e),
      onPointerEnter: () => handleMetadataTablePointerEnter(row, col),
      'aria-selected': isMetadataTableCellSelected(row, col)
    });
    const getSortButtonClass = (column, direction) =>
      `metadata-sort-button ${metadataTableSort?.field === column && metadataTableSort?.direction === direction ? 'is-active' : ''}`;
    // Click-and-drag fill: only on Osito ID / Roast ID, only from the bottom of a single-column
    // selection, and only while not already dragging (so the handle doesn't jump mid-drag).
    const showFillHandle = (row, col) =>
      !fillDragRef.current &&
      FILL_SEQUENCE_FIELDS.has(METADATA_TABLE_COLUMNS[col]) &&
      selectionRange && selectionRange.startCol === col && selectionRange.endCol === col && selectionRange.endRow === row;
    const renderFillHandle = (row, col) => {
      if (!showFillHandle(row, col)) return null;
      return (
        <div
          className="metadata-fill-handle"
          title={t('fillHandle')}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fillDragRef.current = { col, seedStartRow: selectionRange.startRow, seedEndRow: selectionRange.endRow, endRow: selectionRange.endRow };
            setFillPreviewRow(selectionRange.endRow);
          }}
        />
      );
    };
    const renderStaticCell = (row, col, field, { placeholder = '' } = {}) => {
      const display = getMetadataTableDisplayValue(samples[row], field);
      return (
        <div
          {...getTableCommonProps(row, col)}
          tabIndex={-1}
          className="metadata-grid-display"
          onDoubleClick={() => beginEditingCell(row, col)}
        >
          {display || <span className="metadata-grid-placeholder">{placeholder}</span>}
        </div>
      );
    };

    return (
      <div className="min-h-screen bg-stone-100 p-4 md:p-12">
        <div className="max-w-4xl mx-auto space-y-6 metadata-editor-content">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">{t('lotInformation')}</h1>
            <div className="flex gap-2 flex-wrap">
              <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact />
              <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact />
              <button
                type="button"
                onClick={() => { stopEditingCell(); setMetadataTableMode(current => !current); }}
                className="eink-toggle eink-toggle-compact"
                title={t(metadataTableMode ? 'standardView' : 'tableView')}
              >
                {t(metadataTableMode ? 'standardView' : 'tableView')}
              </button>
              {metadataTableMode && canUndoSamples && (
                <button
                  type="button"
                  onClick={undoSamplesChange}
                  className="eink-toggle eink-toggle-compact"
                  title={t('undoTableChange')}
                >
                  <Icon name="rotate-ccw" size={16} /> {t('undoTableChange')}
                </button>
              )}
              <button
                onClick={resetToHome}
                type="button"
                className="eink-toggle eink-toggle-compact"
              >
                <Icon name="home" size={16} /> {t('home')}
              </button>
            </div>
          </div>

          <div className="max-w-sm">{renderLexiconSelector()}</div>
          <LotCacheControl lookup={lotLookup} language={language} />
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
                        <td {...getTableCellProps(idx, 0, 'lot-id-cell')}>
                          {isEditingCell(idx, 0) ? (
                            <input
                              {...getTableInputProps(idx, 0)}
                              value={s.ositoId || ''}
                              onChange={(e) => handleTableFieldChange(idx, 'ositoId', e.target.value)}
                              onBlur={lotLookup.commit}
                              placeholder="OS-ID..."
                              aria-label={`${t('ositoId')} ${idx + 1}`}
                            />
                          ) : renderStaticCell(idx, 0, 'ositoId', { placeholder: 'OS-ID...' })}
                          <LotLookupStatus sample={s} lookup={lotLookup} language={language} compact />
                          {renderFillHandle(idx, 0)}
                        </td>
                        <td {...getTableCellProps(idx, 1)}>
                          {isEditingCell(idx, 1) ? (
                            <input
                              {...getTableInputProps(idx, 1)}
                              value={s.lotName || ''}
                              onChange={(e) => handleTableFieldChange(idx, 'lotName', e.target.value)}
                              placeholder={`${t('lotName')}...`}
                              aria-label={`${t('lotName')} ${idx + 1}`}
                            />
                          ) : renderStaticCell(idx, 1, 'lotName', { placeholder: `${t('lotName')}...` })}
                        </td>
                        <td {...getTableCellProps(idx, 2)}>
                          {isEditingCell(idx, 2) ? (
                            <SearchableSelect
                              value={s.processing && s.processing !== 'Select One' ? translateProcessing(language, s.processing) : ''}
                              onChange={(value) => handleTableFieldChange(idx, 'processing', value)}
                              options={[t('washed'), t('natural'), t('honey'), t('other')]}
                              label={`${t('processing')} ${idx + 1}`}
                              noMatches={t('noMatchingOptions')}
                              initialQuery={seededQueryFor(idx, 2, s.processing && s.processing !== 'Select One' ? translateProcessing(language, s.processing) : '')}
                              inputProps={{ ...getTableInputProps(idx, 2), placeholder: t('processingPlaceholder') }}
                            />
                          ) : renderStaticCell(idx, 2, 'processing', { placeholder: t('processingPlaceholder') })}
                        </td>
                        <td {...getTableCellProps(idx, 3)}>
                          {isEditingCell(idx, 3) ? (
                            <input
                              {...getTableInputProps(idx, 3)}
                              value={s.waterActivity || ''}
                              onChange={(e) => handleTableFieldChange(idx, 'waterActivity', e.target.value)}
                              onBlur={(e) => handleTableFieldChange(idx, 'waterActivity', formatWaterActivity(e.target.value))}
                              placeholder="0.00"
                              inputMode="decimal"
                              type="text"
                              className="metadata-grid-input tabular-nums"
                              aria-label={`${t('waterActivity')} ${idx + 1}`}
                            />
                          ) : renderStaticCell(idx, 3, 'waterActivity', { placeholder: '0.00' })}
                        </td>
                        <td {...getTableCellProps(idx, 4, 'metadata-grid-cell-with-affix')}>
                          {isEditingCell(idx, 4) ? (
                            <input
                              {...getTableInputProps(idx, 4)}
                              value={s.moisture || ''}
                              onChange={(e) => handleTableFieldChange(idx, 'moisture', e.target.value)}
                              onBlur={(e) => handleTableFieldChange(idx, 'moisture', formatMoisture(e.target.value))}
                              placeholder="0.0"
                              inputMode="decimal"
                              type="text"
                              className="metadata-grid-input tabular-nums"
                              aria-label={`${t('moisture')} ${idx + 1}`}
                            />
                          ) : renderStaticCell(idx, 4, 'moisture', { placeholder: '0.0' })}
                          <span className="metadata-grid-affix">%</span>
                        </td>
                        <td {...getTableCellProps(idx, 5)}>
                          {isEditingCell(idx, 5) ? (
                            <input
                              {...getTableInputProps(idx, 5)}
                              value={s.processingOther || ''}
                              onChange={(e) => handleTableFieldChange(idx, 'processingOther', e.target.value)}
                              placeholder={s.processing === 'Other' ? t('processingDetailsPlaceholder') : '-'}
                              aria-label={`${t('processingDetails')} ${idx + 1}`}
                            />
                          ) : renderStaticCell(idx, 5, 'processingOther', { placeholder: s.processing === 'Other' ? t('processingDetailsPlaceholder') : '-' })}
                        </td>
                        {['country', 'sampleType', 'roastId'].map((field, offset) => {
                          const col = 6 + offset;
                          return (
                            <td key={field} {...getTableCellProps(idx, col)}>
                              {isEditingCell(idx, col) ? (
                                field === 'roastId' ? (
                                  <input {...getTableInputProps(idx, col)}
                                    value={s[field] || ''} onChange={(e) => handleTableFieldChange(idx, field, e.target.value)}
                                    placeholder={`${t(field)}...`} aria-label={`${t(field)} ${idx + 1}`} />
                                ) : (
                                  <SearchableSelect value={s[field]} onChange={(value) => handleTableFieldChange(idx, field, value)}
                                    options={field === 'country' ? COUNTRY_OPTIONS : SAMPLE_TYPE_OPTIONS}
                                    label={`${t(field)} ${idx + 1}`} noMatches={t('noMatchingOptions')}
                                    initialQuery={seededQueryFor(idx, col, s[field] || '')}
                                    inputProps={{ ...getTableInputProps(idx, col), placeholder: `${t(field)}...` }} />
                                )
                              ) : renderStaticCell(idx, col, field, { placeholder: `${t(field)}...` })}
                              {field === 'roastId' && renderFillHandle(idx, col)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                      onBlur={lotLookup.commit}
                      placeholder="OS-ID..."
                      className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                    />
                    <LotLookupStatus sample={s} lookup={lotLookup} language={language} />
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['country', 'sampleType', 'roastId'].map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-[9px] font-black text-stone-400 uppercase ml-1" htmlFor={`${field}-${s.id}`}>{t(field)}</label>
                      {field === 'roastId' ? <input id={`${field}-${s.id}`} value={s[field] || ''}
                        onChange={(e) => updateMetadata(idx, field, e.target.value)} placeholder={`${t(field)}...`}
                        className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm" /> :
                        <SearchableSelect value={s[field]} onChange={(value) => updateMetadata(idx, field, value)}
                          options={field === 'country' ? COUNTRY_OPTIONS : SAMPLE_TYPE_OPTIONS}
                          label={t(field)} noMatches={t('noMatchingOptions')}
                          inputProps={{ id: `${field}-${s.id}`, placeholder: `${t(field)}...` }}
                          className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm" />}

                    </div>
                  ))}
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
            onClick={addCoffee}
            className="w-full py-3 btn-stone-light border border-stone-300 flex items-center justify-center gap-2 font-bold"
          >
            <Icon name="plus" size={18} />
            {t('addCoffee')}
          </button>
          <div className="metadata-navigation">
            <div className="metadata-navigation-actions">
              <button type="button" onClick={()=>{setBlindSession(false);setAppState('cupping');}} className="btn-stone-dark">{t('startSession')}</button>
              <button type="button" onClick={()=>{setBlindSession(true);setAppState('cupping');}} className="btn-stone-light">Start Blind Session</button>
              <button type="button" onClick={()=>setAppState('report')} className="btn-stone-light">{t('viewReport')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'report') {
    return (
      <div className="report-screen min-h-screen bg-stone-100 p-4 md:p-8 relative">
        {preparedCsv && <CsvExportDialog data={preparedCsv} onClose={() => setPreparedCsv(null)} t={t} />}
        {renderSaveSessionModal()}
        {renderPdfReadyDialog()}
        <div className="max-w-[1400px] mx-auto space-y-4 pb-28 md:pb-20 report-container">
          <header className="report-toolbar flex flex-wrap items-center justify-between print-hidden gap-3 mb-6">
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={resetToHome}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-stone-100 px-4 md:px-5 py-2 rounded-xl font-bold shadow-sm border border-stone-200 text-stone-600 active:scale-95 transition-all text-xs"
              >
                <Icon name="home" size={16} />
                {t('home')}
              </button>
              <button
                onClick={() => setAppState('cupping')}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white px-4 md:px-5 py-2 rounded-xl font-bold shadow-sm border border-stone-200 text-stone-600 active:scale-95 transition-all text-xs"
              >
                <Icon name="edit-3" size={16} />
                {t('editSession')}
              </button>
              <button type="button" className="report-share-button" onClick={() => setCollaboration({ initialView: 'create', session: buildSessionEntry(activeSavedSessionId || Date.now(), activeSessionName || sessionStartTime || 'Cupping', activeSavedSession || {}) })}><Icon name="users" size={16} />Share cupping</button>
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
                onClick={openCsvExport}
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
                <Icon name="file-text" size={16} />
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

          {activeSavedSession?.sessionCode && <SessionUpdate
            key={activeSavedSession.syncId}
            session={activeSavedSession}
            sync={sharedSync}
            language={language}
            onReplace={remote => {
              const entry = { ...remote, id: activeSavedSession.id };
              persistHistory(history.map(item => item.id === entry.id ? entry : item));
              sharedSync.acceptRemote(entry);
              loadSession(entry);
            }}
          />}
          <div className="report-surface bg-white p-4 md:p-10 rounded-3xl shadow-sm border border-stone-200 print:p-0 print:border-none print:shadow-none">
            <div className="report-title print-hidden">
              <div>
                <h1>{t('labSummary')}</h1>
                <p>{t('qualityControl')}</p>
              </div>
              <div className="report-title-date">{reportDateWithCode(sessionStartTime, activeSavedSession)}</div>
            </div>
            <div className="report-pages space-y-0">
              {samples.map((s, idx) => renderCoffeeReport(s, idx, reportDateWithCode(sessionStartTime, activeSavedSession)))}
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

        <div className="report-mobile-actions fixed md:hidden bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-stone-200 px-3 pt-2 pb-safe print-hidden">
          <div className="grid grid-cols-6 gap-2">
            <button
              onClick={() => setAppState('cupping')}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-100 text-stone-700 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="edit-3" size={14} />
              <span>{t('editSession')}</span>
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
              onClick={openCsvExport}
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
              <Icon name="file-text" size={14} />
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
      {renderSaveSessionModal()}
      {/* The installed app's status bar is translucent (index.html) and overlays the page, so this
          bar needs to reserve that space itself via padding — otherwise scrolled content shows
          through behind the status bar instead of this bar's own opaque background. */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <header className="cupping-toolbar max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={resetToHome}
            aria-label={t('home')}
            title={t('home')}
            className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-transform active:scale-90"
          >
            <Icon name="home" size={24} />
          </button>
          <div className="cupping-coffee-tabs flex items-center gap-2 overflow-x-auto py-1 flex-1 px-4" role="group" aria-label={t('sample')}>
            {samples.map((s, idx) => (
              <button
                key={idx}
                aria-pressed={activeSampleIndex === idx}
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
            type="button"
            onClick={() => goToMetadata('cupping')}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white text-stone-800 border border-stone-200 shadow-sm font-black text-[10px] uppercase tracking-widest active:scale-95 shrink-0 transition-transform"
            title={t('lotInformation')}
            aria-label={t('lotInformation')}
          >
            <Icon name="edit-2" size={16} />
            <span className="hidden sm:inline">{t('lots')}</span>
          </button>
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
            <LanguageToggle language={language} onToggle={toggleLanguage} t={t} compact iconOnly={viewportWidth < 700} />
            <EInkToggle isActive={isEinkMode} onToggle={toggleDisplayMode} t={t} compact iconOnly={viewportWidth < 700} />
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-4 md:px-12 pb-4 flex justify-between items-end text-stone-900 gap-3">
          <div className="min-w-0 pl-2">
            <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] leading-none block mb-1">{blindSession?'Blind cupping':t('analyzingLot')}</span>
            <h2 className="cupping-coffee-title text-base md:text-xl font-black tracking-tight">
              {blindSession?`${t('coffee')} ${activeSampleIndex+1}`:(currentSample.lotName || `${t('coffee')} ${activeSampleIndex + 1}`)}
            </h2>
          </div>
          <div className="text-right leading-none shrink-0 pl-4 pr-2">
            <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] block mb-1">{t(currentSample.noScore ? 'noScore' : 'liveScore')}</span>
            <span className="text-3xl md:text-4xl font-black tabular-nums">{calculateTotal(currentSample)}</span>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4 md:p-12 space-y-12 main-container">
        <SessionEvaluation sample={currentSample} language={language} t={t} lexiconMode={lexiconMode}
          onScore={(id,delta)=>updateScore(activeSampleIndex,id,delta)}
          onLevel={(field,value)=>updateLevel(activeSampleIndex,field,value)}
          onNoScore={()=>setSamples(prev=>prev.map((sample,index)=>index===activeSampleIndex?{...sample,noScore:!sample.noScore}:sample))}
          onTag={(field,tag)=>toggleTag(activeSampleIndex,field,tag)}
          onCycle={(field,tag)=>cycleTagModifier(activeSampleIndex,field,tag)}
          onNotes={value=>setSamples(prev=>prev.map((sample,index)=>index===activeSampleIndex?{...sample,notes:{...sample.notes,otherText:value}}:sample))}
        />
      </main>
    </div>
  );
};

export default App;
