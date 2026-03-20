import React, { useEffect, useState } from 'react';
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
  initializeSamples
} from './lib/cupping';
import DonutChart from './components/DonutChart';
import Icon from './components/Icon';
import LexiconSearch from './components/LexiconSearch';
import ReportTags from './components/ReportTags';
import ScoreControl from './components/ScoreControl';
import SpiderGraph from './components/SpiderGraph';
import HandsLogo from '../assets/hands.png';

const App = () => {
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [appState, setAppState] = useState('setup');
  const [metadataOrigin, setMetadataOrigin] = useState('setup');
  const [numSamples, setNumSamples] = useState(1);
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);
  const [samples, setSamples] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [history, setHistory] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionName, setSessionName] = useState('');

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

  const isMobile = viewportWidth < 640;
  const isTablet = viewportWidth >= 640 && viewportWidth < 1024;
  const reportRadarSize = isMobile ? 180 : isTablet ? 220 : 240;
  const reportDonutSize = isMobile ? 150 : isTablet ? 180 : 200;

  const resetToHome = () => {
    setSamples([]);
    setSessionStartTime(null);
    setActiveSampleIndex(0);
    setAppState('setup');
  };

  const saveSessionLocal = () => {
    if (!sessionName) return;

    const newEntry = {
      id: Date.now(),
      name: sessionName,
      date: new Date().toLocaleDateString(),
      startTime: sessionStartTime,
      samples,
      count: samples.length
    };

    const updatedHistory = [newEntry, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('cupping_history', JSON.stringify(updatedHistory));
    setShowSaveModal(false);
    setSessionName('');
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    localStorage.setItem('cupping_history', JSON.stringify(updated));
  };

  const loadSession = (session) => {
    setSamples(session.samples);
    setSessionStartTime(session.startTime);
    setAppState('report');
  };

  const startSession = () => {
    if (!sessionStartTime) setSessionStartTime(new Date().toLocaleString());
    setSamples(initializeSamples(numSamples));
    setAppState('cupping');
  };

  const goToMetadata = (origin) => {
    if (!sessionStartTime) setSessionStartTime(new Date().toLocaleString());
    if (samples.length === 0) setSamples(initializeSamples(numSamples));
    setMetadataOrigin(origin);
    setAppState('metadata');
  };

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

  const updateMetadata = (sampleIdx, field, value) => {
    setSamples((prev) => prev.map((item, idx) => (idx === sampleIdx ? { ...item, [field]: value } : item)));
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

  if (appState === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-stone-100">
        <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl p-8 md:p-10 text-center border border-stone-200">
          <div className="inline-flex p-4 rounded-3xl bg-stone-900 text-white mb-6 md:mb-8 shadow-xl">
            <Icon name="coffee" size={28} />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-stone-900 mb-2 tracking-tight">Cupping Lab</h1>
          <p className="text-stone-400 font-medium mb-8 md:mb-10 text-xs uppercase tracking-widest">Select sample count to begin</p>
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
              Start Session
              <Icon name="chevron-right" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => goToMetadata('setup')}
                className="py-3 md:py-4 bg-white text-stone-600 border-2 border-stone-100 rounded-2xl font-bold text-xs hover:bg-stone-50 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="settings-2" size={14} />
                Configure
              </button>
              <button
                onClick={() => setAppState('history')}
                className="py-3 md:py-4 bg-white text-stone-600 border-2 border-stone-100 rounded-2xl font-bold text-xs hover:bg-stone-50 transition-colors flex items-center justify-center gap-2"
              >
                <Icon name="history" size={14} />
                History
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'history') {
    return (
      <div className="min-h-screen bg-stone-100 p-6 md:p-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-black text-stone-900 tracking-tight">Saved Sessions</h1>
            <button onClick={() => setAppState('setup')} className="text-stone-400 font-bold hover:text-stone-900 text-sm">
              Back
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {history.length > 0 ? (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => loadSession(item)}
                  className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow relative group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest">{item.date}</span>
                    <button onClick={(e) => deleteSession(item.id, e)} className="p-2 text-stone-200 hover:text-red-500 transition-colors">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <h3 className="text-lg font-black text-stone-900 leading-tight pr-4">{item.name}</h3>
                  <p className="text-xs font-bold text-stone-400 uppercase mt-2">{item.count} Samples</p>
                </div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center text-stone-400 font-bold italic">No sessions saved on this device.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'metadata') {
    return (
      <div className="min-h-screen bg-stone-100 p-4 md:p-12">
        <div className="max-w-4xl mx-auto space-y-6 pb-32">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">Lot Information</h1>
            <button
              onClick={() => setAppState(metadataOrigin === 'report' ? 'report' : 'setup')}
              className="text-stone-400 font-bold text-sm"
            >
              Back
            </button>
          </div>
          {samples.map((s, idx) => (
            <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center gap-3 border-b border-stone-50 pb-3">
                <span className="w-6 h-6 rounded-full bg-stone-900 text-white flex items-center justify-center font-black text-[10px]">#{s.id}</span>
                <h3 className="font-black text-stone-800 uppercase tracking-widest text-[10px]">Lot Data</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-stone-400 uppercase ml-1">Osito ID</label>
                  <input
                    value={s.ositoId}
                    onChange={(e) => updateMetadata(idx, 'ositoId', e.target.value)}
                    placeholder="OS-ID..."
                    className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-stone-400 uppercase ml-1">Lot Name</label>
                  <input
                    value={s.lotName}
                    onChange={(e) => updateMetadata(idx, 'lotName', e.target.value)}
                    placeholder="Lot Name..."
                    className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-stone-400 uppercase ml-1">Processing</label>
                  <select
                    value={s.processing}
                    onChange={(e) => updateMetadata(idx, 'processing', e.target.value)}
                    className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                  >
                    <option>Select One</option>
                    <option>Washed</option>
                    <option>Natural</option>
                    <option>Honey</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              {s.processing === 'Other' && (
                <div className="animate-in slide-in-from-top-2">
                  <input
                    value={s.processingOther}
                    onChange={(e) => updateMetadata(idx, 'processingOther', e.target.value)}
                    placeholder="Processing Details..."
                    className="w-full bg-stone-50 p-3 rounded-xl border border-transparent focus:bg-white focus:border-stone-200 outline-none font-bold text-stone-800 text-sm"
                  />
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => setAppState(metadataOrigin === 'report' ? 'report' : 'cupping')}
            className="w-[calc(100%-2rem)] md:w-full py-4 md:py-5 btn-stone-dark font-black text-base md:text-lg shadow-2xl fixed bottom-3 md:bottom-6 left-1/2 -translate-x-1/2 max-w-lg uppercase tracking-wider pb-safe"
          >
            Save Details
          </button>
        </div>
      </div>
    );
  }

  if (appState === 'report') {
    return (
      <div className="min-h-screen bg-stone-100 p-4 md:p-8 relative">
        {showSaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-6">
            <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="text-center">
                <h3 className="text-xl font-black text-stone-900">Name this Session</h3>
                <p className="text-stone-400 font-bold text-[10px] uppercase tracking-widest mt-1">To save on this device</p>
              </div>
              <input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Morning QC..."
                className="w-full bg-stone-50 p-4 rounded-2xl border border-stone-200 outline-none font-bold text-sm"
              />
              <div className="flex flex-col gap-2">
                <button onClick={saveSessionLocal} className="w-full py-4 btn-stone-dark font-black text-sm uppercase tracking-widest">
                  Save Session
                </button>
                <button onClick={() => setShowSaveModal(false)} className="w-full py-2 text-stone-400 font-bold text-xs uppercase">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="max-w-[1400px] mx-auto space-y-4 pb-28 md:pb-20 report-container">
          <header className="flex flex-wrap items-center justify-between print-hidden gap-3 mb-6">
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={resetToHome}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-stone-100 px-4 md:px-5 py-2 rounded-xl font-bold shadow-sm border border-stone-200 text-stone-600 active:scale-95 transition-all text-xs"
              >
                <Icon name="home" size={16} />
                Reset
              </button>
              <button
                onClick={() => setAppState('cupping')}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white px-4 md:px-5 py-2 rounded-xl font-bold shadow-sm border border-stone-200 text-stone-600 active:scale-95 transition-all text-xs"
              >
                <Icon name="chevron-left" size={16} />
                Back
              </button>
            </div>
            <div className="hidden md:flex flex-wrap gap-2">
              <button
                onClick={() => setShowSaveModal(true)}
                className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl font-bold text-blue-600 border border-blue-100 active:scale-95 text-xs"
              >
                <Icon name="save" size={16} />
                Save
              </button>
              <button
                onClick={() => goToMetadata('report')}
                className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl font-bold text-stone-600 border border-stone-200 active:scale-95 text-xs"
              >
                <Icon name="edit-2" size={16} />
                Lots
              </button>
              <button
                onClick={() => downloadCSV(samples, sessionStartTime)}
                className="flex items-center gap-2 bg-stone-200 px-4 py-2 rounded-xl font-bold text-stone-800 active:scale-95 text-xs"
              >
                <Icon name="download" size={16} />
                CSV
              </button>
              <button
                onClick={() => {
                  const prev = document.title;
                  const stamp = new Date().toLocaleString();
                  document.title = `Cupping Report ${stamp}`;
                  window.print();
                  setTimeout(() => {
                    document.title = prev;
                  }, 500);
                }}
                className="flex items-center gap-2 px-6 py-2 btn-stone-dark font-bold shadow-xl active:scale-95 text-xs"
              >
                <Icon name="printer" size={16} />
                PRINT PDF
              </button>
            </div>
          </header>

          <div className="bg-white p-4 md:p-10 rounded-3xl shadow-sm border border-stone-200 print:p-0 print:border-none print:shadow-none">
            <div className="print-header print-only">
              <div className="print-header-inner">
                <div>
                  <h1>Lab Evaluation Summary</h1>
                  <p>Sourcing & Supply Quality Control</p>
                </div>
                <div className="print-header-date">{sessionStartTime}</div>
              </div>
            </div>
            <div className="space-y-0">
              {samples.map((s) => (
                <div
                  key={s.id}
                  className="sample-spec-sheet mb-14 md:mb-32 border-b-2 border-stone-100 pb-10 md:pb-16 last:border-0 last:mb-0 last:pb-0 print:border-stone-900 print:border-2 print:p-[0.8cm] print:mb-0 print:pb-0"
                >
                  <div className="print-page-header print-only">
                    <div>
                      <p className="print-page-title">Lab Evaluation Summary</p>
                      <p className="print-page-subtitle">Sourcing & Supply Quality Control</p>
                    </div>
                    <div className="print-header-date">{sessionStartTime}</div>
                  </div>
                  <div className="print-identity-block flex flex-col sm:flex-row items-stretch justify-between border border-stone-900 mb-6">
                    <div className="flex-1 p-4 md:p-5 bg-stone-50/30 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-1">
                        {!s.lotName && (
                          <span className="text-[9px] font-black text-stone-300 uppercase tracking-widest">Sample 0{s.id}</span>
                        )}
                        <span className="inline-flex items-center gap-2 text-base font-black text-stone-900 uppercase tracking-tight px-2 py-1 rounded-xl bg-stone-100 border border-stone-200">
                          {s.ositoId || 'No ID'}
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-stone-900 tracking-tighter uppercase leading-tight">
                        {s.lotName ? s.lotName : `Sample 0${s.id}`}
                      </h2>
                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-2">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-stone-300 uppercase tracking-widest">Processing</span>
                          <span className="text-[12px] font-bold text-stone-600 uppercase">
                            {s.processing !== 'Select One' ? (s.processing === 'Other' ? s.processingOther : s.processing) : 'Undefined'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grade-display w-full sm:w-auto shrink-0 flex flex-col items-center justify-center bg-stone-900 px-6 sm:px-10 py-4 sm:min-w-[200px]">
                      <p className="text-[9px] font-black text-stone-400 uppercase tracking-[0.4em] mb-1">Final Score</p>
                      <p className="text-4xl sm:text-5xl md:text-6xl font-black tabular-nums text-white leading-none">{calculateTotal(s)}</p>
                    </div>
                  </div>

                  <div className="spec-grid print-spec-grid flex flex-col sm:grid sm:grid-cols-[auto_1fr] gap-8 md:gap-12 lg:gap-16">
                    <div className="print-visual-row flex flex-col sm:flex-row items-center sm:items-start gap-8 md:gap-12 visual-row">
                      <div className="print-chart-panel flex flex-col items-center w-full sm:w-auto">
                        <p className="section-header mb-6">Attribute Map</p>
                        <SpiderGraph scores={s.scores} size={reportRadarSize} />
                      </div>
                      <div className="print-chart-panel flex flex-col items-center w-full sm:w-auto">
                        <p className="section-header mb-6">Sensory Balance</p>
                        <DonutChart tags={[...s.notes.fragAromaTags, ...s.notes.inCupTags]} size={reportDonutSize} className="print-donut-chart" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-8 data-column">
                      <div className="space-y-6 print-tag-sections">
                        <ReportTags label="Fragrance/Aroma" tags={s.notes.fragAromaTags} alwaysShow />
                        <ReportTags label="In the Cup" tags={s.notes.inCupTags} alwaysShow />
                        <ReportTags label="Negative" tags={s.notes.negativeTags} alwaysShow />
                      </div>

                      <div className="pt-6 border-t border-stone-100 print-notes-block">
                        <p className="section-header text-stone-900 mb-3">Other Observations</p>
                        <div className="text-[13px] leading-relaxed text-stone-700 italic pr-4 print-notes-body">
                          {s.notes.otherText || <span className="text-stone-300 italic opacity-50">None recorded.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="print-page-footer print-only">
                    <p className="print-footer-text">Authorized Analysis • Osito Lab Protocol</p>
                    <div className="print-logo">
                      <img src={HandsLogo} alt="Osito logo" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="report-signoff mt-12 pt-4 border-t border-stone-100 text-center print-hidden">
              <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.6em]">Authorized Analysis • Osito Lab Protocol</p>
            </div>
            <div className="report-logo print-hidden">
              <img src={HandsLogo} alt="Osito logo" />
            </div>
          </div>
        </div>

        <div className="fixed md:hidden bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-stone-200 px-3 pt-2 pb-safe print-hidden">
          <div className="grid grid-cols-5 gap-2">
            <button
              onClick={() => setAppState('cupping')}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-100 text-stone-700 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="chevron-left" size={14} />
              Back
            </button>
            <button
              onClick={() => goToMetadata('report')}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-white text-stone-700 border border-stone-200 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="edit-2" size={14} />
              Lots
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-white text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="save" size={14} />
              Save
            </button>
            <button
              onClick={() => downloadCSV(samples, sessionStartTime)}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-200 text-stone-800 text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="download" size={14} />
              CSV
            </button>
            <button
              onClick={() => window.print()}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-900 text-white text-[10px] font-black uppercase tracking-wider"
            >
              <Icon name="printer" size={14} />
              Print
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentSample = samples[activeSampleIndex];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 pb-24 md:pb-40">
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
        <header className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setAppState('setup')}
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
                {s.id}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAppState('report')}
            className="px-4 sm:px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl btn-stone-dark active:scale-95 shrink-0 transition-transform"
          >
            Report
          </button>
        </header>
        <div className="max-w-6xl mx-auto px-4 md:px-12 pb-4 flex justify-between items-end text-stone-900 gap-3">
          <div className="min-w-0 pl-2">
            <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] leading-none block mb-1">Analyzing Lot</span>
            <h2 className="text-base md:text-xl font-black tracking-tight leading-none truncate">{currentSample.lotName || `Coffee ${currentSample.id}`}</h2>
          </div>
          <div className="text-right leading-none shrink-0 pl-4 pr-2">
            <span className="text-stone-300 text-[9px] font-black uppercase tracking-[0.2em] block mb-1">Live Score</span>
            <span className="text-3xl md:text-4xl font-black tabular-nums">{calculateTotal(currentSample)}</span>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-4 md:p-12 space-y-12 main-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-20">
          <div className="space-y-2 md:space-y-3">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <Icon name="clipboard-list" size={14} />
              Attribute Grading
            </h3>
            {CATEGORIES.map((cat) => (
              <ScoreControl key={cat.id} label={cat.label} value={currentSample.scores[cat.id]} onUpdate={(d) => updateScore(activeSampleIndex, cat.id, d)} />
            ))}
            <div className="pt-6 space-y-2 md:space-y-3 border-t-2 border-stone-100 mt-6">
              <ScoreControl
                label="Defects"
                value={currentSample.scores.defects}
                onUpdate={(d) => updateScore(activeSampleIndex, 'defects', d)}
                colorClass="text-red-600"
              />
              <ScoreControl
                label="Cup Correction"
                value={currentSample.scores.correction}
                onUpdate={(d) => updateScore(activeSampleIndex, 'correction', d)}
                colorClass="text-blue-600"
              />
            </div>
          </div>
          <div className="space-y-8">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <Icon name="tag" size={14} />
              Sensory Mapping
            </h3>
            <LexiconSearch
              label="Fragrance & Aroma"
              tags={currentSample.notes.fragAromaTags}
              options={CATEGORISED_LEXICON}
              onToggle={(t) => toggleTag(activeSampleIndex, 'fragAroma', t)}
              onCycle={(t) => cycleTagModifier(activeSampleIndex, 'fragAroma', t)}
            />
            <LexiconSearch
              label="In the Cup"
              tags={currentSample.notes.inCupTags}
              options={CATEGORISED_LEXICON}
              onToggle={(t) => toggleTag(activeSampleIndex, 'inCup', t)}
              onCycle={(t) => cycleTagModifier(activeSampleIndex, 'inCup', t)}
            />
            <LexiconSearch
              label="Negative Factors"
              tags={currentSample.notes.negativeTags}
              options={{ Negative: NEGATIVE_LEXICON }}
              onToggle={(t) => toggleTag(activeSampleIndex, 'negative', t)}
              onCycle={(t) => cycleTagModifier(activeSampleIndex, 'negative', t)}
            />
            <div className="space-y-3 pt-8 border-t-2 border-stone-100">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Icon name="edit-3" size={12} />
                Technical Journal
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
                placeholder="Detailed feedback..."
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
