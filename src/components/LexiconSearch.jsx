import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import { getBaseTag, getSmartMatch, getTagStyle } from '../lib/cupping';

const LexiconSearch = ({ label, tags, options, onToggle, onCycle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [smartMatch, setSmartMatch] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);

  const flatOptions = useMemo(() => Object.values(options).flat(), [options]);
  const categories = useMemo(() => Object.keys(options), [options]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm.length >= 3 && !flatOptions.some((o) => o.toLowerCase().includes(searchTerm.toLowerCase()))) {
        setIsLoading(true);
        const match = await getSmartMatch(
          searchTerm,
          flatOptions.filter((o) => !tags.some((t) => getBaseTag(t) === o))
        );
        if (match && match !== 'None') setSmartMatch(match);
        setIsLoading(false);
      } else {
        setSmartMatch(null);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [searchTerm, flatOptions, tags]);

  const filtered = flatOptions.filter(
    (o) => o.toLowerCase().includes(searchTerm.toLowerCase()) && !tags.some((t) => getBaseTag(t) === o)
  );

  const handleSelect = (value) => {
    onToggle(value);
    setSearchTerm('');
    setIsFocused(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="space-y-3 relative">
      <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block leading-none">{label}</label>
      <div className="relative">
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
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 250)}
            placeholder="Search..."
            className="bg-transparent border-none p-0 text-sm font-bold text-stone-800 focus:ring-0 w-full placeholder:text-stone-300 outline-none"
          />
          {isLoading && (
            <div className="animate-spin text-stone-400 shrink-0">
              <Icon name="loader-2" size={14} />
            </div>
          )}
        </div>
        {isFocused && searchTerm.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white border-2 border-stone-200 rounded-3xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto p-1">
            {filtered.length > 0 ? (
              filtered.slice(0, 8).map((option) => (
                <button
                  key={option}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(option)}
                  className="w-full text-left px-5 py-3.5 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  {option}
                </button>
              ))
            ) : (
              <div className="p-3 space-y-2">
                <p className="text-[9px] font-black text-stone-300 uppercase px-2 mb-2 tracking-tighter">No matches. Map to group:</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(cat)}
                      className="px-3 py-2 rounded-lg bg-stone-100 text-stone-600 font-black text-[10px] uppercase tracking-tighter hover:bg-stone-200 transition-colors"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {smartMatch && !filtered.includes(smartMatch) && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(smartMatch)}
                className="w-full text-left px-5 py-4 bg-stone-900 text-white flex justify-between items-center rounded-xl mt-1"
              >
                <div className="flex flex-col">
                  <span className="text-[9px] font-black opacity-60 uppercase mb-1 leading-none tracking-widest">Mapping</span>
                  <span className="font-black text-base">{smartMatch}</span>
                </div>
                <Icon name="sparkles" size={16} className="text-amber-400 shrink-0 ml-4" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 min-h-[30px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`${getTagStyle(tag)} px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-2 shadow-sm border active:scale-95 cursor-pointer`}
            onClick={() => onCycle?.(tag)}
            title={onCycle ? 'Click to cycle: normal -> Slight -> Intense' : undefined}
          >
            {tag}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(tag);
              }}
              className="opacity-40 hover:opacity-100 shrink-0"
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};

export default LexiconSearch;
