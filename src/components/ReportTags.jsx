import React from 'react';
import { translateTag } from '../i18n';

const ReportTags = ({ label, tags, alwaysShow = false, language, t }) => {
  if (!alwaysShow && !tags.length) return null;

  return (
    <div className="space-y-2">
      <p className="section-header">{label}</p>
      <div className="report-written-tags">
        {tags.length > 0 ? (
          tags.map((tag, index) => (
            <React.Fragment key={tag}>
            {index > 0 && ' · '}
            <span>
              {translateTag(language, tag)}
            </span>
            </React.Fragment>
          ))
        ) : (
          <span className="text-[10px] text-stone-300 italic">{t('noneRecorded')}</span>
        )}
      </div>
    </div>
  );
};

export default ReportTags;
