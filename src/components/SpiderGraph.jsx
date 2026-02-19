import React from 'react';
import { GRAPH_FLOOR, RADAR_LABELS } from '../constants';

const SpiderGraph = ({ scores, size }) => {
  const center = size / 2;
  const radius = (size / 2) * 0.72;
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

  return (
    <div className="w-full flex items-center justify-center overflow-hidden">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible font-sans max-w-full h-auto">
        {[7.5, 8.5, 9.5].map((v) => (
          <circle
            key={v}
            cx={center}
            cy={center}
            r={((v - GRAPH_FLOOR) / (10 - GRAPH_FLOOR)) * radius}
            fill="none"
            stroke="#e7e5e4"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
        ))}
        {RADAR_LABELS.map((label, i) => {
          const angle = i * ((Math.PI * 2) / 10) - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          const lp = { x: center + (radius + 30) * Math.cos(angle), y: center + (radius + 30) * Math.sin(angle) };
          return (
            <g key={label}>
              <line x1={center} y1={center} x2={x2} y2={y2} stroke="#f5f5f4" strokeWidth="1.5" />
              <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" className="text-[8px] font-black fill-stone-400 uppercase tracking-tighter">
                {label}
              </text>
            </g>
          );
        })}
        <path d={path} fill="rgba(28, 25, 23, 0.12)" stroke="#1c1917" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4.5" fill="#1c1917" stroke="#ffffff" strokeWidth="2.5" />
        ))}
      </svg>
    </div>
  );
};

export default SpiderGraph;
