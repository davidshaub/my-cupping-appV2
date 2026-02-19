import React from 'react';
import Icon from './Icon';
import { INCREMENT } from '../constants';

const ScoreControl = ({ label, value, onUpdate, colorClass = 'text-stone-900' }) => (
  <div className="flex items-center justify-between bg-white p-3 md:p-5 rounded-2xl border border-stone-200 shadow-sm">
    <span className="text-sm md:text-lg font-bold text-stone-700 score-label truncate">{label}</span>
    <div className="flex items-center gap-1 md:gap-6 shrink-0 score-control-group">
      <button
        onClick={() => onUpdate(-INCREMENT)}
        className="w-9 h-9 md:w-14 md:h-14 flex items-center justify-center btn-stone-light control-btn shrink-0"
      >
        <Icon name="minus" size={14} />
      </button>
      <span className={`text-base md:text-3xl font-black w-12 md:w-20 text-center tabular-nums score-value ${colorClass}`}>
        {value === null ? '—' : value.toFixed(2)}
      </span>
      <button
        onClick={() => onUpdate(INCREMENT)}
        className="w-9 h-9 md:w-14 md:h-14 flex items-center justify-center btn-stone-light control-btn shrink-0"
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  </div>
);

export default ScoreControl;
