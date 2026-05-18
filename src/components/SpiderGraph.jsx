import React from 'react';
import { GRAPH_FLOOR, RADAR_LABELS } from '../constants';

const DISPLAY_LABELS = {
  'Frag/Aroma': 'Fr/Aroma',
  Consistency: 'Consist.'
};

const SpiderGraph = ({ scores, size, einkMode = false }) => {
  const isCompact = size <= 260;
  const horizontalLabelSpace = isCompact ? 42 : 54;
  const verticalLabelSpace = isCompact ? 26 : 32;
  const svgWidth = size + horizontalLabelSpace * 2;
  const svgHeight = size + verticalLabelSpace * 2;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const radius = size * 0.39;
  const labelDistance = radius + (isCompact ? 17 : 20);
  const labelFontSize = isCompact ? 8 : 9;
  const labelOffset = isCompact ? 3 : 4;
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
    return { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
  });

  const path = `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`;
  const gridStroke = einkMode ? '#6b7280' : '#e7e5e4';
  const axisStroke = einkMode ? '#9ca3af' : '#f5f5f4';
  const dataFill = einkMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(28, 25, 23, 0.12)';
  const dataStroke = einkMode ? '#000000' : '#1c1917';
  const pointStroke = einkMode ? '#ffffff' : '#ffffff';
  const gridLevels = [7.5, 8.5, 9.5, 10];

  return (
    <div className="w-full flex items-center justify-center overflow-hidden">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="font-sans max-w-full h-auto">
        {gridLevels.map((v) => (
          <circle
            key={v}
            cx={centerX}
            cy={centerY}
            r={((v - GRAPH_FLOOR) / (10 - GRAPH_FLOOR)) * radius}
            fill="none"
            stroke={gridStroke}
            strokeWidth={v === 10 ? '1.25' : '1'}
            strokeDasharray={v === 10 ? undefined : '4,4'}
          />
        ))}
        {RADAR_LABELS.map((label, i) => {
          const displayLabel = DISPLAY_LABELS[label] ?? label;
          const angle = i * ((Math.PI * 2) / 10) - Math.PI / 2;
          const cos = Math.cos(angle);
          const x2 = centerX + radius * Math.cos(angle);
          const y2 = centerY + radius * Math.sin(angle);
          const lp = { x: centerX + labelDistance * Math.cos(angle), y: centerY + labelDistance * Math.sin(angle) };
          let textAnchor = 'middle';
          let labelX = lp.x;
          const estimatedLabelWidth = displayLabel.length * labelFontSize * 0.62;
          if (cos > 0.28) {
            textAnchor = 'start';
            labelX = Math.min(labelX + labelOffset, svgWidth - estimatedLabelWidth - 2);
          } else if (cos < -0.28) {
            textAnchor = 'end';
            labelX = Math.max(labelX - labelOffset, estimatedLabelWidth + 2);
          }
          return (
            <g key={label}>
              <line x1={centerX} y1={centerY} x2={x2} y2={y2} stroke={axisStroke} strokeWidth="1.5" />
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
