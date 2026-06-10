import React from 'react';
import { CATEGORY_COLORS } from '../constants';
import { getCategoryForItem } from '../lib/cupping';
import { translateCategory } from '../i18n';

const DonutChart = ({ tags, size = 200, className = '', einkMode = false, language, t }) => {
  const counts = { Fruity: 0, Citrus: 0, Floral: 0, Sweet: 0, 'Nutty/Cocoa': 0, Spices: 0 };

  tags.forEach((t) => {
    const cat = getCategoryForItem(t);
    if (cat && cat !== 'Structure') {
      let weight = 1.0;
      if (t.startsWith('Slight ')) weight = 0.5;
      else if (t.startsWith('Intense ')) weight = 2.0;
      counts[cat] += weight;
    }
  });

  const totalWeight = Object.values(counts).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-4 bg-stone-50 rounded-full border border-dashed border-stone-200 ${einkMode ? 'eink-chart-empty' : ''}`}
        style={{ width: size, height: size }}
      >
        <span className="text-[8px] font-black text-stone-300 uppercase">{t('profileUnavailable')}</span>
      </div>
    );
  }

  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const sortedEntries = Object.entries(counts).filter(([, weight]) => weight > 0);

  if (einkMode) {
    return (
      <div className={`eink-balance-chart ${className}`} style={{ width: size, minHeight: size }}>
        <div className="eink-chart-title">{t('balance')}</div>
        <div className="eink-balance-list">
          {sortedEntries.map(([cat, weight]) => {
            const percentage = Math.round((weight / totalWeight) * 100);
            return (
              <div key={cat} className="eink-balance-row">
                <div className="eink-balance-meta">
                  <span>{translateCategory(language, cat)}</span>
                  <strong>{percentage}%</strong>
                </div>
                <div className="eink-balance-track" aria-hidden="true">
                  <span style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90 overflow-visible">
        {sortedEntries.map(([cat, weight]) => {
          const percentage = (weight / totalWeight) * 100;
          const strokeDash = (percentage / 100) * circumference;
          const currentOffset = offset;
          offset += strokeDash;
          return (
            <circle
              key={cat}
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={CATEGORY_COLORS[cat]}
              strokeWidth="22"
              strokeDasharray={`${strokeDash} ${circumference}`}
              strokeDashoffset={-currentOffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-in-out"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-black text-stone-900 uppercase tracking-widest">{t('balance')}</span>
      </div>
      <div className="absolute top-[105%] flex flex-wrap justify-center gap-x-3 gap-y-1 w-[220px] sm:w-[260px]">
        {sortedEntries.map(([cat]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
            <span className="text-[8px] font-black text-stone-900 uppercase tracking-tighter whitespace-nowrap">
              {translateCategory(language, cat)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DonutChart;
