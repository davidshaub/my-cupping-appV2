import React from 'react';
import { getTagStyle } from '../lib/cupping';

const ReportTags = ({ label, tags, alwaysShow = false }) => {
  if (!alwaysShow && !tags.length) return null;

  return (
    <div className="space-y-2">
      <p className="section-header">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <span key={tag} className={`${getTagStyle(tag)} px-3 py-1 rounded text-[10px] font-bold border`}>
              {tag}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-stone-300 italic">None recorded</span>
        )}
      </div>
    </div>
  );
};

export default ReportTags;
