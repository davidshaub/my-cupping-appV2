import { canonicalTag, categoryForTag, LEXICON_CATEGORIES } from './lexicon.js';
import { CATEGORY_COLORS } from '../constants.js';
import { translateCategory, translateTag } from '../i18n.js';

export const wheelProvenance = (entry, language = 'en') => entry.aroma && entry.cup
  ? ({es: 'Aroma + taza', 'pt-BR': 'Aroma + xícara'}[language] ?? 'Aroma + cup')
  : entry.aroma ? 'Aroma' : ({es: 'Taza', 'pt-BR': 'Xícara'}[language] ?? 'Cup');

export const buildFlavorProfile = (notes = {}) => {
  const entries = new Map();
  for (const [field, source] of [['fragAromaTags', 'aroma'], ['inCupTags', 'cup']]) {
    for (const tag of notes[field] ?? []) {
      const name = tag.replace(/^(Slight|Intense) /, '');
      const key = canonicalTag(name);
      const category = categoryForTag(name);
      if (!category || category === 'Osito-specific') continue;
      if (!entries.has(key)) entries.set(key, { key, name, category, aroma: false, cup: false });
      entries.get(key)[source] = true;
    }
  }
  // One stable ordering, shared by screen and PDF. Each descriptor gets equal space.
  const descriptors = [...entries.values()].sort((a, b) => LEXICON_CATEGORIES.indexOf(a.category) - LEXICON_CATEGORIES.indexOf(b.category));
  const groups = [];
  const step = Math.PI * 2 / descriptors.length;
  // Offset odd-count wheels so no descriptor sits directly on the bottom axis.
  const rotation = descriptors.length % 2 ? step / 4 : 0;
  descriptors.forEach((entry, index) => {
    entry.start = -Math.PI / 2 + rotation + index * step;
    entry.end = -Math.PI / 2 + rotation + (index + 1) * step;
    const previous = groups.at(-1);
    if (previous?.category === entry.category) previous.end = entry.end;
    else groups.push({ category: entry.category, start: entry.start, end: entry.end });
  });
  return { descriptors, groups };
};

export const ringPoints = (cx, cy, inner, outer, start, end) => {
  const count = Math.max(2, Math.ceil((end - start) * 32));
  const points = [];
  for (let i = 0; i <= count; i++) {
    const angle = start + (end - start) * i / count;
    points.push({ x: cx + outer * Math.cos(angle), y: cy + outer * Math.sin(angle) });
  }
  for (let i = count; i >= 0; i--) {
    const angle = start + (end - start) * i / count;
    points.push({ x: cx + inner * Math.cos(angle), y: cy + inner * Math.sin(angle) });
  }
  return points;
};

export const wheelColor = (category, outer = false, index = 0) => {
  const hex = ({ Fruity: '#d94b58', Sweet: '#c99428', Cocoa: '#866042' })[category] ?? CATEGORY_COLORS[category] ?? '#777777';
  if (!outer) return hex;
  const fraction = 0.2 + (index % 4) * 0.09;
  return '#' + hex.slice(1).match(/../g).map((part) => Math.round(parseInt(part, 16) * (1 - fraction) + 255 * fraction).toString(16).padStart(2, '0')).join('');
};

export const wrapWheelText = (text, width, size, measure = (value, fontSize) => value.length * fontSize * 0.53, breakLongWords = true) => {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, size) > width) { lines.push(line); line = ''; }
    if (breakLongWords && measure(word, size) > width) {
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measure(line + char, size) > width) { lines.push(line); line = ''; }
        line += char;
      }
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
};

export const layoutFlavorWheel = (notes, { width = 560, language = 'en', measure } = {}) => {
  const profile = buildFlavorProfile(notes);
  const compact = width < 430;
  const measureLabel = measure ?? ((value, size) => value.length * size * 0.65);
  const longestWord = Math.max(1, ...profile.descriptors.flatMap(entry => translateTag(language, entry.name).split(/\s+/).map(word => measureLabel(word, 1))));
  const fontSize = compact ? Math.min(11, (width / 2 - 71) / longestWord) : 14;
  const radius = compact ? Math.min(72, Math.max(40, width / 2 - longestWord * fontSize - 31)) : 108;
  const centerX = width / 2;
  const labelX = centerX + radius + 23;
  const labelWidth = width - labelX - 5;
  const labels = profile.descriptors.map((entry) => {
    const angle = (entry.start + entry.end) / 2;
    const side = Math.cos(angle) >= 0 ? 1 : -1;
    const lines = wrapWheelText(translateTag(language, entry.name), labelWidth, fontSize, measureLabel, false);
    return { ...entry, angle, side, lines, height: lines.length * (fontSize + 2) + 15, desiredY: Math.sin(angle) * (radius + 18) };
  });
  const sides = [-1, 1].map((side) => labels.filter((label) => label.side === side).sort((a, b) => a.desiredY - b.desiredY));
  const height = Math.max(radius * 2 + 65, ...sides.map((side) => side.reduce((sum, label) => sum + label.height + 10, 20)));
  const centerY = height / 2;
  for (const side of sides) {
    let cursor = 10;
    side.forEach((label) => { label.y = Math.max(cursor, centerY + label.desiredY - label.height / 2); cursor = label.y + label.height + 10; });
    cursor = height - 10;
    for (const label of [...side].reverse()) { label.y = Math.min(label.y, cursor - label.height); cursor = label.y - 10; }
    side.forEach((label) => {
      const nearY = Math.max(0, Math.abs(label.y + label.height / 2 - centerY) - label.height / 2);
      const rimX = Math.sqrt(Math.max(0, (radius + 10) ** 2 - nearY ** 2));
      const elbowX = (radius + 12) * Math.abs(Math.cos(label.angle));
      label.x = centerX + label.side * (Math.max(rimX, elbowX) + 14);
      label.anchor = { x: centerX + (radius + 2) * Math.cos(label.angle), y: centerY + (radius + 2) * Math.sin(label.angle) };
      label.elbow = { x: centerX + (radius + 12) * Math.cos(label.angle), y: centerY + (radius + 12) * Math.sin(label.angle) };
      label.connectorY = label.y + fontSize * 0.6;
    });
  }
  const groups = profile.groups.map((group, index) => {
    const angle = (group.start + group.end) / 2;
    const labelRadius = radius * 0.48;
    const name = translateCategory(language, group.category);
    const size = compact ? 10 : 12;
    const x = labelRadius * Math.cos(angle), y = labelRadius * Math.sin(angle);
    const textWidth = (measure ?? ((value, fontSize) => value.length * fontSize * 0.65))(name, size) + 8;
    // Test the complete label rectangle against the annular sector, not just its arc width.
    let fits = true;
    for (let dx = -textWidth / 2; dx <= textWidth / 2; dx += textWidth / 8) {
      for (const dy of [-size * 0.7, size * 0.7]) {
        const r = Math.hypot(x + dx, y + dy);
        let a = Math.atan2(y + dy, x + dx);
        while (a < group.start) a += Math.PI * 2;
        if (r < radius * 0.3 || r > radius * 0.65 || a > group.end) fits = false;
      }
    }
    return { ...group, index, name, lines: [name], external: !fits, fontSize: size, x: centerX + x, y: centerY + y };
  });
  // Switch the entire category layer to a legend when any label would be cramped.
  const useCategoryKey = groups.some(group => group.external);
  groups.forEach(group => { group.external = useCategoryKey; });
  return { ...profile, groups, labels, useCategoryKey, width, height, centerX, centerY, radius, fontSize };
};
