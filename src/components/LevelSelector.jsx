import React from 'react';
import { translateLevel } from '../i18n';

const LEVELS = [
  { label: 'Low', short: 'L' },
  { label: 'Med-', short: 'M-' },
  { label: 'Med', short: 'M' },
  { label: 'Med+', short: 'M+' },
  { label: 'High', short: 'H' }
];

const LevelSelector = ({ label, value, onSelect, language, t }) => (
  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mt-2 w-full" aria-label={`${label} ${t('intensity')}`}>
    {LEVELS.map((level) => {
      const active = value === level.label;
      return (
        <button
          key={level.label}
          type="button"
          onClick={() => onSelect(active ? '' : level.label)}
          className={`w-full px-2 py-2 text-[11px] sm:px-3 sm:py-2 sm:text-xs md:text-sm font-black uppercase tracking-wide rounded-xl border transition-all shadow-sm ${
            active
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
          }`}
        >
          <span className="sm:hidden">{level.short}</span>
          <span className="hidden sm:inline">{translateLevel(language, level.label)}</span>
        </button>
      );
    })}
  </div>
);

export default LevelSelector;
