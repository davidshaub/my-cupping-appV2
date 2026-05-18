import React from 'react';
import { GRAPH_FLOOR, RADAR_LABELS } from '../constants';

const SpiderGraph = ({ scores, size, einkMode = false }) => {
  const center = size / 2;
  const isCompact = size <= 190;
  const radius = size * (isCompact ? 0.2 : 0.23);
  const labelDistance = size * (isCompact ? 0.24 : 0.26);
  const labelFontSize = isCompact ? 6 : 8;
  const fragAroma = scores.aroma !== null ? (scores.fragrance + scores.aroma) / 2 : scores.fragrance;
  const data = [
    fragAroma,
    scores.cleanCup,
    scores.sweetness,
    scores.acidity,
    scores.body,
    scores.flavor,
    scores.aftertaste,
    scores.balance,
    scores.consistency,
    scores.overall
  ];

  const pts = data.map((v, i) => {
    const r = Math.max(0, (v - GRAPH_FLOOR) / (10 - GRAPH_FLOOR)) * radius;
    const angle = i * ((Math.PI * 2) / 10) - Math.PI / 2;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  });

  const path = `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`;
  const gridStroke = einkMode ? '#6b7280' : '#e7e5e4';
  const axisStroke = einkMode ? '#9ca3af' : '#f5f5f4';
  const dataFill = einkMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(28, 25, 23, 0.12)';
  const dataStroke = einkMode ? '#000000' : '#1c1917';
  const pointStroke = einkMode ? '#ffffff' : '#ffffff';

  return (
    <div className="w-full flex items-center justify-center overflow-hidden">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="font-sans max-w-full h-auto">
        {[7.5, 8.5, 9.5].map((v) => (
          <circle
            key={v}
            cx={center}
            cy={center}
            r={((v - GRAPH_FLOOR) / (10 - GRAPH_FLOOR)) * radius}
            fill="none"
            stroke={gridStroke}
            strokeWidth="1"
            strokeDasharray="4,4"
          />
        ))}
        {RADAR_LABELS.map((label, i) => {
          const displayLabel = isCompact && label === 'Consistency' ? 'Consist.' : label;
          const angle = i * ((Math.PI * 2) / 10) - Math.PI / 2;
          const cos = Math.cos(angle);
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          const lp = { x: center + labelDistance * Math.cos(angle), y: center + labelDistance * Math.sin(angle) };
          let textAnchor = 'middle';
          let labelX = lp.x;
          if (cos > 0.28) {
            textAnchor = 'start';
            labelX += 4;
          } else if (cos < -0.28) {
            textAnchor = 'end';
            labelX -= 4;
          }
          return (
            <g key={label}>
              <line x1={center} y1={center} x2={x2} y2={y2} stroke={axisStroke} strokeWidth="1.5" />
              <text
                x={labelX}
                y={lp.y}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                fontSize={labelFontSize}
                fill={einkMode ? '#000000' : undefined}
                className={`font-black uppercase tracking-tighter ${einkMode ? '' : 'fill-stone-400'}`}
              >
                {displayLabel}
              </text>
            </g>
          );
        })}
        <path d={path} fill={dataFill} stroke={dataStroke} strokeWidth={einkMode ? '3' : '2.5'} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={einkMode ? '4' : '4.5'} fill={dataStroke} stroke={pointStroke} strokeWidth="2.5" />
        ))}
      </svg>
    </div>
  );
};

export default SpiderGraph;
