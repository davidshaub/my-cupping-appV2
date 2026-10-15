import React from 'react';
import { CATEGORIES } from '../constants';
import { LEXICON_OPTIONS } from '../lib/lexicon';
import { translateScoreLabel } from '../i18n';
import Icon from './Icon';
import ScoreControl from './ScoreControl';
import LevelSelector from './LevelSelector';
import LexiconSearch from './LexiconSearch';

export default function SessionEvaluation({sample, language, t, lexiconMode='both', onScore, onLevel, onNoScore, onTag, onCycle, onNotes, notesPlaceholder}) {
  return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-20">
          <div className="space-y-2 md:space-y-3">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <Icon name="clipboard-list" size={14} />
              {t('attributeGrading')}
            </h3>
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="space-y-2">
                <ScoreControl
                  label={translateScoreLabel(language, cat.id, cat.label)}
                  value={sample.scores[cat.id]}
                  disabled={sample.noScore}
                  onUpdate={(d) => onScore(cat.id, d)}
                />
                {cat.id === 'sweetness' && (
                  <LevelSelector
                    label={t('sweetnessLevel')}
                    value={sample.notes?.sweetnessLevel || ''}
                    onSelect={(val) => onLevel('sweetnessLevel', val)}
                    language={language}
                    t={t}
                  />
                )}
                {cat.id === 'acidity' && (
                  <LevelSelector
                    label={t('acidityLevel')}
                    value={sample.notes?.acidityLevel || ''}
                    onSelect={(val) => onLevel('acidityLevel', val)}
                    language={language}
                    t={t}
                  />
                )}
              </div>
            ))}
            <div className="pt-6 space-y-2 md:space-y-3 border-t-2 border-stone-100 mt-6">
              <ScoreControl
                label={t('defects')}
                value={sample.scores.defects}
                disabled={sample.noScore}
                onUpdate={(d) => onScore('defects', d)}
                colorClass="text-red-600"
              />
              <ScoreControl
                label={t('cupCorrection')}
                value={sample.scores.correction}
                disabled={sample.noScore}
                onUpdate={(d) => onScore('correction', d)}
                colorClass="text-blue-600"
              />
              <div className="pt-2">
                <button
                  type="button"
                  aria-pressed={Boolean(sample.noScore)}
                  onClick={() => onNoScore()}
                  className="no-score-toggle"
                >
                  {t(sample.noScore ? 'restoreScoring' : 'noScore')}
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-8">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3">
              <Icon name="tag" size={14} />
              {t('sensoryMapping')}
            </h3>
            <LexiconSearch
              label={t('fragranceAndAroma')}
              tags={sample.notes.fragAromaTags}
              options={LEXICON_OPTIONS[lexiconMode].positive}
              onToggle={(t) => onTag('fragAroma', t)}
              onCycle={(t) => onCycle('fragAroma', t)}
              language={language}
              t={t}
            />
            <LexiconSearch
              label={t('inCup')}
              tags={sample.notes.inCupTags}
              options={LEXICON_OPTIONS[lexiconMode].positive}
              onToggle={(t) => onTag('inCup', t)}
              onCycle={(t) => onCycle('inCup', t)}
              language={language}
              t={t}
            />
            <LexiconSearch
              label={t('negativeFactors')}
              tags={sample.notes.negativeTags}
              options={LEXICON_OPTIONS[lexiconMode].negative}
              onToggle={(t) => onTag('negative', t)}
              onCycle={(t) => onCycle('negative', t)}
              language={language}
              t={t}
            />
            <div className="space-y-3 pt-8 border-t-2 border-stone-100">
              <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Icon name="edit-3" size={12} />
                {t('technicalJournal')}
              </label>
              <textarea
                value={sample.notes.otherText}
                onChange={e => onNotes(e.target.value)}
                className="w-full bg-stone-100 border-2 border-transparent rounded-[1.5rem] p-5 text-sm md:text-base focus:bg-white focus:border-stone-300 min-h-[160px] resize-none transition-all outline-none shadow-inner font-medium text-stone-700 leading-relaxed"
                placeholder={notesPlaceholder || t('detailedFeedback')}
              />
            </div>
          </div>
        </div>
  );
}
