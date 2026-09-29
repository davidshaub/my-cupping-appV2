import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { getSmartMatch, getTagStyle } from '../lib/cupping';
import { translateCategory, translateTag } from '../i18n';
import { canonicalTag, tagSearchText } from '../lib/lexicon';
import { canModifyTag, hasSlightOnly } from '../lib/tagModifiers';

const LexiconSearch = ({ label, tags, options, onToggle, onCycle, language, t }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [smartMatch, setSmartMatch] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const panelId = useId();
  const inputRef = useRef(null);
  const browseRef = useRef(null);
  const backRef = useRef(null);

  useEffect(() => {
    if (isBrowsing && selectedCategory) backRef.current?.focus();
  }, [isBrowsing, selectedCategory]);

  const flatOptions = useMemo(() => Object.values(options).flat(), [options]);
  const categories = useMemo(() => Object.keys(options), [options]);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    const timer = setTimeout(async () => {
      if (
        searchTerm.length >= 3 &&
        !flatOptions.some((o) => `${tagSearchText(o)} ${translateTag(language, o)}`.toLowerCase().includes(searchTerm.toLowerCase()))
      ) {
        setIsLoading(true);
        setSmartMatch(null);
        const match = await getSmartMatch(
          searchTerm,
          flatOptions.filter((o) => !tags.some((t) => canonicalTag(t) === canonicalTag(o))),
          controller.signal
        );
        if (isCurrent) {
          setSmartMatch(match);
          setIsLoading(false);
        }
      } else {
        setSmartMatch(null);
        setIsLoading(false);
      }
    }, 600);

    return () => {
      isCurrent = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchTerm, flatOptions, tags, language]);

  const filtered = (selectedCategory ? options[selectedCategory] ?? [] : flatOptions).filter(
    (o) => (isBrowsing || `${tagSearchText(o)} ${translateTag(language, o)}`.toLowerCase().includes(searchTerm.toLowerCase())) && !tags.some((t) => canonicalTag(t) === canonicalTag(o))
  );

  useEffect(() => {
    setHighlightIndex(0);
  }, [searchTerm, selectedCategory, options]);

  useEffect(() => {
    setSelectedCategory(null);
    setIsBrowsing(false);
    setSmartMatch(null);
  }, [options]);

  const visibleSuggestions = selectedCategory ? filtered : filtered.slice(0, 8);
  const smartSuggestionFallback = smartMatch && flatOptions.includes(smartMatch) && !tags.some((tag) => canonicalTag(tag) === canonicalTag(smartMatch)) && !filtered.includes(smartMatch) ? [smartMatch] : [];
  const highlightPool = visibleSuggestions.length > 0 ? visibleSuggestions : smartSuggestionFallback;

  const handleSelect = (value) => {
    onToggle(value);
    setSearchTerm('');
    setSelectedCategory(null);
    setIsBrowsing(false);
    setIsFocused(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectHighlightedSuggestion = () => {
    if (!isFocused || (isBrowsing && !selectedCategory)) return false;
    if (!searchTerm && !selectedCategory) return false;
    if (highlightPool.length === 0) return false;
    handleSelect(highlightPool[highlightIndex] ?? highlightPool[0]);
    return true;
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    selectHighlightedSuggestion();
  };

  const handleKeyDown = (e) => {
    if (!isFocused || (isBrowsing && !selectedCategory)) return;
    if (highlightPool.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % highlightPool.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + highlightPool.length) % highlightPool.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectHighlightedSuggestion();
    }
  };

  return (
    <div className="space-y-3 relative">
      <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block leading-none">{label}</label>
          <form className="relative" onSubmit={handleSearchSubmit}
            onFocus={() => setIsFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsFocused(false);
                setIsBrowsing(false);
                setSelectedCategory(null);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsFocused(false);
                setIsBrowsing(false);
                setSelectedCategory(null);
              }
            }}>
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all shadow-inner ${
                isFocused ? 'bg-white border-stone-300' : 'bg-stone-50 border-transparent'
              }`}
            >
              <Icon name="search" size={16} className="text-stone-300 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSelectedCategory(null); setIsBrowsing(false); setIsFocused(true); }}
                onFocus={() => setIsFocused(true)}
                onKeyDown={handleKeyDown}
                enterKeyHint="search"
                inputMode="search"
                autoComplete="off"
                aria-label={label}
                placeholder={t('search')}
                className="bg-transparent border-none p-0 text-sm font-bold text-stone-800 focus:ring-0 w-full min-w-0 placeholder:text-stone-300 outline-none"
              />
              {isLoading && (
                <div className="animate-spin text-stone-400 shrink-0">
                  <Icon name="loader-2" size={14} />
                </div>
              )}
              <button ref={browseRef} type="button" className="lexicon-browse-toggle" aria-label={t(isBrowsing ? 'closeCategories' : 'browseCategories')} title={t(isBrowsing ? 'closeCategories' : 'browseCategories')}
                aria-expanded={isFocused && isBrowsing} aria-controls={panelId}
                onClick={() => { setIsBrowsing(!isBrowsing); setSelectedCategory(null); setIsFocused(!isBrowsing); }}>
                <Icon name={isBrowsing ? 'x' : 'plus'} size={18} />
              </button>
            </div>
            {isFocused && (isBrowsing || searchTerm.trim().length > 0) && (
              <div id={panelId} className="lexicon-suggestion-panel absolute z-50 left-0 right-0 top-full mt-2 bg-white border-2 border-stone-200 rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto p-1">
                {isBrowsing && <div className="lexicon-category-header">
                  {selectedCategory ? <button ref={backRef} type="button" onClick={() => { setSelectedCategory(null); setHighlightIndex(0); browseRef.current?.focus(); }} aria-label={t('backToCategories')} title={t('backToCategories')}><Icon name="chevron-left" size={18} />{t('categories')}</button> : <span>{t('categories')}</span>}
                  {selectedCategory && <span>{translateCategory(language, selectedCategory)}</span>}
                </div>}
                {isBrowsing && !selectedCategory ? (
                  <div className="flex flex-wrap gap-2 p-3">
                    {categories.map((cat) => (
                      <button key={cat} type="button" onClick={() => { setSelectedCategory(cat); }} className="px-3 py-2 rounded-lg bg-stone-100 text-stone-700 text-xs font-bold">
                        {translateCategory(language, cat)}
                      </button>
                    ))}
                  </div>
                ) : visibleSuggestions.length > 0 ? (
                  visibleSuggestions.map((option) => {
                    const isActiveSuggestion = highlightPool[highlightIndex] === option;
                    return (
                      <button
                        type="button"
                        key={option}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelect(option)}
                        aria-selected={isActiveSuggestion}
                        data-suggestion-active={isActiveSuggestion ? 'true' : undefined}
                        className={`w-full text-left px-5 py-3.5 text-sm font-bold text-stone-700 rounded-xl transition-colors ${
                          isActiveSuggestion ? 'bg-stone-100' : 'hover:bg-stone-50'
                        }`}
                      >
                        {translateTag(language, option)}
                      </button>
                    );
                  })
                ) : !isBrowsing && smartSuggestionFallback.length > 0 ? (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(smartSuggestionFallback[0])}
                    aria-selected={highlightPool[highlightIndex] === smartSuggestionFallback[0]}
                    data-suggestion-active={highlightPool[highlightIndex] === smartSuggestionFallback[0] ? 'true' : undefined}
                    className={`w-full text-left px-5 py-4 bg-stone-900 text-white flex justify-between items-center rounded-xl ${
                      highlightPool[highlightIndex] === smartSuggestionFallback[0]
                        ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-white'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black opacity-60 uppercase mb-1 leading-none tracking-widest">{t('mapping')}</span>
                      <span className="font-black text-base">{translateTag(language, smartSuggestionFallback[0])}</span>
                    </div>
                    <Icon name="sparkles" size={16} className="text-amber-400 shrink-0 ml-4" />
                  </button>
                ) : (
                  <div className="p-3 space-y-2">
                    <p className="text-[9px] font-black text-stone-300 uppercase px-2 mb-2 tracking-tighter">{t('noMatches')}</p>
                  </div>
                )}
              </div>
            )}
          </form>
        <div className="flex flex-wrap gap-2 min-h-[30px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className={`${getTagStyle(tag)} px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-2 shadow-sm border ${canModifyTag(tag) ? 'active:scale-95 cursor-pointer' : 'cursor-default'}`}
              onClick={() => { if (canModifyTag(tag)) onCycle?.(tag); }}
              title={onCycle && canModifyTag(tag) ? t(hasSlightOnly(tag) ? 'slightOnlyCycleTitle' : 'cycleTitle') : undefined}
            >
              {translateTag(language, tag)}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(tag);
                }}
                className="opacity-70 hover:opacity-100 shrink-0 text-[11px] px-2 py-1 leading-none rounded-lg bg-white/90 border border-black/10"
                title={t('remove')}
              >
                <Icon name="x" size={13} />
              </button>
            </span>
          ))}
        </div>
    </div>
  );
};

export default LexiconSearch;
