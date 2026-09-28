import React, { useEffect, useRef, useState } from 'react';
import { layoutFlavorWheel, ringPoints, wheelColor, wheelProvenance } from '../lib/flavorWheel';

const FlavorWheel = ({ notes, language, einkMode, t }) => {
  const ref = useRef(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.min(600, entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const wheel = layoutFlavorWheel(notes, { width, language });
  const { centerX: cx, centerY: cy, radius: r } = wheel;
  return (
    <div ref={ref} className="flavor-wheel">
      {wheel.descriptors.length === 0 ? <p className="wheel-empty">{t('profileUnavailable')}</p> : (
        <>
          <svg role="img" aria-label={t('flavorProfile')} viewBox={`0 0 ${width} ${wheel.height}`}>
            <title>{t('flavorProfile')}</title>
            {wheel.groups.map((group) => <polygon key={group.category} points={ringPoints(cx, cy, r * 0.27, r * 0.68, group.start, group.end).map((p) => `${p.x},${p.y}`).join(' ')} fill={einkMode ? '#fff' : wheelColor(group.category)} stroke={einkMode ? '#000' : '#fff'} strokeWidth="1.2" />)}
            {wheel.descriptors.map((entry, index) => <polygon key={entry.key} points={ringPoints(cx, cy, r * 0.68, r, entry.start, entry.end).map((p) => `${p.x},${p.y}`).join(' ')} fill={einkMode ? '#fff' : wheelColor(entry.category, true, index)} stroke={einkMode ? '#000' : '#fff'} strokeWidth="1.2" />)}
            {wheel.groups.filter(group => !group.external || einkMode).map((group) => <text key={group.category} className="wheel-category" textAnchor="middle" fill={einkMode ? '#000' : '#fff'} fontSize={group.fontSize} x={group.x} y={group.y + group.fontSize / 3}>{group.external ? group.index + 1 : group.name}</text>)}
            {wheel.labels.map((label) => <g key={label.key}>
              <polyline points={`${label.anchor.x},${label.anchor.y} ${label.elbow.x},${label.elbow.y} ${label.x - label.side * 4},${label.connectorY}`} fill="none" stroke="#555" strokeWidth="0.8" />
              <text textAnchor={label.side > 0 ? 'start' : 'end'} fill="#000" className="wheel-label" fontSize={wheel.fontSize}>{label.lines.map((line, index) => <tspan key={index} x={label.x} y={label.y + wheel.fontSize + index * (wheel.fontSize + 2)}>{line}</tspan>)}</text>
              <text x={label.x} y={label.y + label.lines.length * (wheel.fontSize + 2) + 11} textAnchor={label.side > 0 ? 'start' : 'end'} fill="#000" fontSize={width < 430 ? 9 : 11}>{wheelProvenance(label, language)}</text>
            </g>)}
          </svg>
          {wheel.useCategoryKey && <div className="wheel-category-key">{wheel.groups.map((group) => <span key={group.category}>{einkMode ? <b>{group.index + 1}</b> : <i aria-hidden="true" style={{ backgroundColor: wheelColor(group.category) }} />}{group.name}</span>)}</div>}
        </>
      )}
    </div>
  );
};
export default FlavorWheel;
