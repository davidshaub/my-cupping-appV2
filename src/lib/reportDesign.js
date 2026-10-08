import { RADAR_LABELS } from '../constants.js';
import { calculateTotal } from './cupping.js';
import { translate, translateLevel, translateProcessing, translateRadarLabel, translateTag } from '../i18n.js';
import { layoutFlavorWheel, ringPoints, wheelColor, wheelProvenance, wrapWheelText } from './flavorWheel.js';

const INK = '#000000';
const WHITE = '#ffffff';
const MARGIN = 24;
const WIDTH = 792;

const textLines = (pdf, text, width, size = 9, font = 'regular') => String(text).split('\n').flatMap((paragraph) =>
  paragraph ? wrapWheelText(paragraph, width, size, (value, fontSize) => pdf.measureText(value, fontSize, font)) : ['']
);

const heading = (pdf, text, x, y, size = 16) => pdf.text(text, x, y, { font: 'serifBold', size, color: INK });

const drawHeader = (pdf, sessionStartTime, language) => {
  pdf.text(translate(language, 'labSummary').toUpperCase(), MARGIN, 24, { size: 9, font: 'bold', color: INK });
  pdf.text(translate(language, 'qualityControl').toUpperCase(), MARGIN, 36, { size: 6.5, color: INK });
  pdf.text(sessionStartTime, WIDTH - MARGIN, 24, { size: 7, align: 'right', color: INK, maxWidth: 230 });
  pdf.line(MARGIN, 44, WIDTH - MARGIN, 44, INK, 0.8);
};

const drawFooter = (pdf, language, logoImage, page = 1) => {
  pdf.line(MARGIN, 548, WIDTH - MARGIN, 548, INK, 0.8);
  pdf.text(`${translate(language, 'authorizedAnalysis')} · ${translate(language, 'protocol')}`.toUpperCase(), WIDTH / 2, 560, { size: 6, font: 'bold', align: 'center', color: INK });
  if (logoImage) {
    const width = 34;
    const height = width * logoImage.height / logoImage.width;
    pdf.image(logoImage.name, (WIDTH - width) / 2, 585 - height / 2, width, height, 90);
  }
};

const drawIdentity = (pdf, sample, index, language) => {
  const y = 54;
  const scoreX = 614;
  pdf.strokeRect(MARGIN, y, WIDTH - MARGIN * 2, 101, INK, 0.8);
  pdf.fillRect(scoreX, y, WIDTH - MARGIN - scoreX, 101, INK);
  pdf.text(sample.ositoId || translate(language, 'noId'), 42, y + 20, { font: 'bold', size: 10, color: INK, maxWidth: sample.country || sample.sampleType || sample.roastId ? 132 : 550 });
  ['country', 'sampleType', 'roastId'].forEach((field, i) => {
    const value = String(sample[field] || '').trim();
    if (!value) return;
    const x = 190 + i * 140;
    pdf.text(translate(language, field).toUpperCase(), x, y + 13, { size: 6, font: 'bold', color: INK, maxWidth: 132 });
    pdf.text(value, x, y + 25, { size: 9, color: INK, maxWidth: 132 });
  });
  const name = sample.lotName || `${translate(language, 'sample')} ${index + 1}`;
  let size = 25;
  let lines = textLines(pdf, name, 550, size, 'serifBold');
  while ((lines.length > 2 || (lines.length === 2 && size > 18)) && size > 12) { size--; lines = textLines(pdf, name, 550, size, 'serifBold'); }
  const titleBaseline = lines.length > 1 ? 40 : 47;
  lines.slice(0, 2).forEach((line, i) => heading(pdf, line, 42, y + titleBaseline + i * (size + 2), size));
  const meta = [
    [translate(language, 'processing'), sample.processing === 'Other' ? sample.processingOther || translate(language, 'other') : translateProcessing(language, sample.processing || 'Select One')],
    [translate(language, 'waterActivity'), sample.waterActivity || ''],
    [translate(language, 'moisture'), sample.moisture ? `${sample.moisture}%` : '']
  ].filter(([, value]) => value);
  meta.forEach(([label, value], i) => {
    const x = 42 + i * 184;
    pdf.text(label.toUpperCase(), x, y + 75, { size: 6, font: 'bold', color: INK });
    pdf.text(value, x, y + 87, { size: 9, color: INK, maxWidth: 175 });
  });
  pdf.text(translate(language, sample.noScore ? 'noScore' : 'finalScore').toUpperCase(), 691, y + 36, { size: 7, font: 'bold', color: WHITE, align: 'center' });
  pdf.text(calculateTotal(sample), 691, y + 72, { size: 36, font: 'black', color: WHITE, align: 'center' });
};

const drawRadar = (pdf, sample, language) => {
  heading(pdf, translate(language, 'attributeMap'), 24, 185);
  if (sample.noScore) {
    pdf.text(translate(language, 'noScore'), 163, 305, { size: 12, color: INK, align: 'center' });
    return;
  }
  const cx = 163, cy = 305, radius = 91;
  const point = (r, i) => ({ x: cx + Math.cos(-Math.PI / 2 + i * Math.PI / 5) * r, y: cy + Math.sin(-Math.PI / 2 + i * Math.PI / 5) * r });
  [7.5, 8.5, 9.5, 10].forEach((value) => pdf.circle(cx, cy, (value - 7) / 3 * radius, { stroke: '#d4d4d4', lineWidth: 0.6, dash: value === 10 ? [] : [2, 3] }));
  const scores = sample.scores;
  const values = [scores.aroma == null ? scores.fragrance : (scores.fragrance + scores.aroma) / 2, scores.cleanCup, scores.sweetness, scores.acidity, scores.body, scores.flavor, scores.aftertaste, scores.balance, scores.consistency, scores.overall];
  values.forEach((_, i) => { const p = point(radius, i); pdf.line(cx, cy, p.x, p.y, '#dddddd', 0.5); });
  const points = values.map((value, i) => point((Math.min(10, Math.max(7, value)) - 7) / 3 * radius, i));
  pdf.polygon(points, { fill: '#eeeeee', stroke: INK, lineWidth: 1.4 });
  points.forEach((p) => pdf.circle(p.x, p.y, 2.7, { fill: INK, stroke: WHITE, lineWidth: 1 }));
  RADAR_LABELS.forEach((label, i) => {
    const p = point(radius + 13, i);
    const name = language !== 'en' ? translateRadarLabel(language, label) : ({ 'Frag/Aroma': 'Fr/Aroma', Consistency: 'Consist.' }[label] || label);
    pdf.text(name.toUpperCase(), p.x, p.y + 2, { size: 6, color: INK, align: p.x < cx - 10 ? 'right' : p.x > cx + 10 ? 'left' : 'center' });
  });
};

const drawWheel = (pdf, sample, language) => {
  heading(pdf, translate(language, 'flavorProfile'), 341, 185);
  const wheel = layoutFlavorWheel(sample.notes, { width: 560, language, measure: (value, size) => pdf.measureText(value, size, 'serifBold') });
  if (!wheel.descriptors.length) {
    pdf.text(translate(language, 'profileUnavailable'), 554, 302, { size: 10, color: '#555555', align: 'center' });
    return [];
  }
  const dense = wheel.descriptors.length > 10 || wheel.height > 310;
  const scale = 0.76;
  const cx = 554;
  const cy = 304;
  const r = wheel.radius * scale;
  const drawRing = (entry, inner, outer, color) => pdf.polygon(ringPoints(cx, cy, inner, outer, entry.start, entry.end), { fill: color, stroke: WHITE, lineWidth: 0.8 });
  wheel.groups.forEach((group) => drawRing(group, r * 0.27, r * 0.68, wheelColor(group.category)));
  wheel.descriptors.forEach((entry, i) => drawRing(entry, r * 0.68, r, wheelColor(entry.category, true, i)));
  wheel.groups.filter(group => !group.external).forEach((group) => {
    const angle = (group.start + group.end) / 2;
    group.lines.forEach((line, i) => pdf.text(line, cx + Math.cos(angle) * r * 0.48, cy + Math.sin(angle) * r * 0.48 + (i - (group.lines.length - 1) / 2) * 9 + 3, { size: 9, font: 'serifBold', color: WHITE, align: 'center' }));
  });
  const continuation = [];
  if (dense) {
    wheel.descriptors.forEach((entry, i) => {
      const angle = (entry.start + entry.end) / 2;
      pdf.text(String(i + 1), cx + Math.cos(angle) * r * 0.84, cy + Math.sin(angle) * r * 0.84 + 2, { size: 7, color: INK, font: 'bold', align: 'center' });
    });
    pdf.text(translate(language, 'profileKeyContinued'), cx, 421, { size: 8, color: INK, align: 'center' });
    continuation.push({ title: translate(language, 'flavorProfile'), text: wheel.descriptors.map((entry, i) => `${i + 1}. ${translateTag(language, entry.name)} - ${wheelProvenance(entry, language)}`).join('\n') });
  } else {
    wheel.labels.forEach((label) => {
      const labelX = cx + (label.x - wheel.centerX) * scale;
      const labelY = cy + (label.y - wheel.centerY) * scale;
      const anchorX = cx + (label.anchor.x - wheel.centerX) * scale;
      const anchorY = cy + (label.anchor.y - wheel.centerY) * scale;
      const elbowX = cx + (label.elbow.x - wheel.centerX) * scale;
      const elbowY = cy + (label.elbow.y - wheel.centerY) * scale;
      pdf.line(anchorX, anchorY, elbowX, elbowY, '#555555', 0.5);
      pdf.line(elbowX, elbowY, labelX - label.side * 3, cy + (label.connectorY - wheel.centerY) * scale, '#555555', 0.5);
      label.lines.forEach((line, i) => pdf.text(line, labelX, labelY + 10 + i * 12, { size: 10, font: 'serifBold', color: INK, align: label.side > 0 ? 'left' : 'right' }));
      pdf.text(wheelProvenance(label, language), labelX, labelY + label.lines.length * 12 + 8, { size: 7, color: INK, align: label.side > 0 ? 'left' : 'right' });
    });
  }
  if (wheel.useCategoryKey) {
    const rows = [[]];
    let rowWidth = 0;
    wheel.groups.forEach(group => {
      const width = pdf.measureText(group.name, 7, 'regular') + 10;
      if (rowWidth && rowWidth + 12 + width > 427) { rows.push([]); rowWidth = 0; }
      rows.at(-1).push({ group, width });
      rowWidth += (rowWidth ? 12 : 0) + width;
    });
    rows.forEach((row, index) => {
      const width = row.reduce((sum, item) => sum + item.width, 0) + (row.length - 1) * 12;
      let x = cx - width / 2;
      const y = (dense ? 432 : 414) + index * 11;
      row.forEach(({ group, width: itemWidth }) => {
        pdf.circle(x + 3, y - 2, 2.5, { fill: wheelColor(group.category) });
        pdf.text(group.name, x + 10, y, { size: 7, color: INK });
        x += itemWidth + 12;
      });
    });
  }
  return continuation;
};

const sectionsForSample = (sample, language) => {
  const notes = sample.notes ?? {};
  const none = translate(language, 'noneRecorded');
  const levels = [notes.acidityLevel && `${translate(language, 'acidity')}: ${translateLevel(language, notes.acidityLevel)}`, notes.sweetnessLevel && `${translate(language, 'sweetness')}: ${translateLevel(language, notes.sweetnessLevel)}`].filter(Boolean).join(' · ');
  return [
    { title: translate(language, 'fragranceAroma'), text: (notes.fragAromaTags ?? []).map((tag) => translateTag(language, tag)).join(' · ') || none },
    { title: translate(language, 'inCup'), text: (notes.inCupTags ?? []).map((tag) => translateTag(language, tag)).join(' · ') || none },
    { title: translate(language, 'negative'), text: (notes.negativeTags ?? []).map((tag) => translateTag(language, tag)).join(' · ') || none },
    { title: translate(language, 'otherObservations'), text: [levels, notes.otherText].filter(Boolean).join('\n') || none }
  ];
};

export const paintEditorialReport = (pdf, sample, index, { language = 'en', sessionStartTime = '', logoImage = null } = {}) => {
  pdf.fillRect(0, 0, 792, 612, WHITE);
  drawHeader(pdf, sessionStartTime, language);
  drawIdentity(pdf, sample, index, language);
  drawRadar(pdf, sample, language);
  const overflow = drawWheel(pdf, sample, language);
  pdf.line(MARGIN, 437, WIDTH - MARGIN, 437, INK, 0.8);
  const sections = sectionsForSample(sample, language);
  for (let i = 0; i < sections.length; i++) {
    const column = Math.min(i, 2);
    const x = MARGIN + column * 254;
    const y = i === 3 ? 505 : 462;
    const section = sections[i];
    heading(pdf, section.title, x, y, 13);
    const lines = textLines(pdf, section.text, 228, 8.5);
    const capacity = i >= 2 ? 2 : 5;
    lines.slice(0, capacity).forEach((line, row) => pdf.text(line, x, y + 17 + row * 11, { size: 8.5, color: INK }));
    if (lines.length > capacity) overflow.push({ title: section.title, text: lines.slice(capacity).join('\n') });
  }
  if (overflow.length) pdf.text(translate(language, 'reportContinued'), MARGIN, 541, { size: 6, color: '#555555' });
  drawFooter(pdf, language, logoImage);
  return overflow;
};

export const paintReportContinuation = (pdf, sections, options, pageNumber) => {
  const { language = 'en', sessionStartTime = '', logoImage = null } = options;
  drawHeader(pdf, sessionStartTime, language);
  const titleLines = textLines(pdf, `${options.sampleName || ''} - ${translate(language, 'continued')}`, 744, 13, 'serifBold');
  titleLines.forEach((line, index) => heading(pdf, line, MARGIN, 70 + index * 17, 13));
  let y = 98 + (titleLines.length - 1) * 17;
  const remaining = [];
  for (const section of sections) {
    if (y > 486) { remaining.push(section); continue; }
    heading(pdf, section.title, MARGIN, y, 13);
    y += 18;
    const lines = textLines(pdf, section.text, 744, 9);
    const capacity = Math.floor((526 - y) / 13);
    lines.slice(0, capacity).forEach((line, row) => pdf.text(line, MARGIN, y + row * 13, { size: 9, color: INK }));
    y += Math.min(lines.length, capacity) * 13 + 22;
    if (lines.length > capacity) remaining.push({ ...section, text: lines.slice(capacity).join('\n') });
  }
  drawFooter(pdf, language, logoImage, pageNumber);
  return remaining;
};
