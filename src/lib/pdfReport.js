import { RADAR_LABELS } from '../constants.js';
import {
  calculateTotal,
  getCategoryForItem
} from './cupping.js';
import {
  translate,
  translateLevel,
  translateProcessing,
  translateRadarLabel,
  translateTag
} from '../i18n.js';
import { LineCapStyle, PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import inter400Url from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter400ItalicUrl from '@fontsource/inter/files/inter-latin-400-italic.woff?url';
import inter500Url from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import inter600Url from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import inter700Url from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import inter800Url from '@fontsource/inter/files/inter-latin-800-normal.woff?url';
import inter900Url from '@fontsource/inter/files/inter-latin-900-normal.woff?url';
import fraunces500Url from '@fontsource/fraunces/files/fraunces-latin-500-normal.woff?url';
import fraunces900Url from '@fontsource/fraunces/files/fraunces-latin-900-normal.woff?url';

const PAGE = {
  width: 792,
  height: 612,
  margin: 22
};

const COLORS = {
  ink: '#1f2b23',
  muted: '#7c6f5f',
  line: '#d8cabc',
  softLine: '#efe6da',
  surface: '#fffaf3',
  surfaceSoft: '#f8f3ea',
  stone: '#e7e5e4',
  dark: '#1f2b23',
  accent: '#c78547',
  accentDark: '#9d6331',
  accentSoft: '#f4e2cf',
  white: '#ffffff'
};

const BALANCE_COLORS = {
  Fruity: '#ef4444',
  Citrus: '#facc15',
  Floral: '#ec4899',
  Sweet: '#f97316',
  'Nutty/Cocoa': '#a8a29e',
  Spices: '#d946ef',
  Structure: '#22c55e',
  Negative: '#64748b'
};

const TAG_STYLES = {
  Fruity: { fill: '#fceee8', stroke: '#eec5b5', text: '#8f412f' },
  Citrus: { fill: '#fff3dc', stroke: '#efcf95', text: '#946022' },
  Floral: { fill: '#f7eef4', stroke: '#ddc0d0', text: '#7b3d5f' },
  Sweet: { fill: '#fbefdf', stroke: '#eecda8', text: '#995a1f' },
  'Nutty/Cocoa': { fill: '#f1ebe1', stroke: '#d8cabc', text: '#574839' },
  Spices: { fill: '#f5ecf7', stroke: '#d8bfde', text: '#69417e' },
  Structure: { fill: '#fceee8', stroke: '#eec5b5', text: '#8f412f' },
  Negative: { fill: '#eceff2', stroke: '#d4dde5', text: '#4a5760' }
};

const RADAR_SCORE_IDS = [
  'fragAroma',
  'cleanCup',
  'sweetness',
  'acidity',
  'body',
  'flavor',
  'aftertaste',
  'balance',
  'consistency',
  'overall'
];

const FONT_IDS = {
  regular: 'F1',
  medium: 'F1',
  semibold: 'F2',
  bold: 'F2',
  extraBold: 'F2',
  black: 'F2',
  italic: 'F3',
  serif: 'F4',
  serifBold: 'F5'
};

const GRAPH_FLOOR = 7;
const GRAPH_CEILING = 10;
const encoder = new TextEncoder();

const toAscii = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2022/g, '|')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\n\t]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

const fmt = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/g, '').replace(/\.$/, '');
};

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255
  ];
};

const fillColor = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return `${fmt(r)} ${fmt(g)} ${fmt(b)} rg`;
};

const strokeColor = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return `${fmt(r)} ${fmt(g)} ${fmt(b)} RG`;
};

const escapePdfText = (value) =>
  toAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ');

const estimateTextWidth = (text, size, font = 'regular') => {
  const factor = font === 'bold' ? 0.56 : font === 'italic' ? 0.5 : font === 'serifBold' ? 0.53 : font === 'serif' ? 0.5 : 0.52;
  return toAscii(text).length * size * factor;
};

const truncateToWidth = (value, maxWidth, size, font = 'regular') => {
  let text = toAscii(value);
  if (estimateTextWidth(text, size, font) <= maxWidth) return text;

  while (text.length > 0 && estimateTextWidth(`${text}...`, size, font) > maxWidth) {
    text = text.slice(0, -1).trimEnd();
  }

  return text ? `${text}...` : '...';
};

const wrapText = (value, maxWidth, size, font = 'regular', maxLines = Infinity) => {
  const words = toAscii(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateTextWidth(candidate, size, font) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    line = word;

    if (estimateTextWidth(line, size, font) > maxWidth) {
      line = truncateToWidth(line, maxWidth, size, font);
    }

    if (lines.length >= maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);

  if (lines.length === maxLines && words.length > 0) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      lines[lines.length - 1] = truncateToWidth(`${lines[lines.length - 1]}...`, maxWidth, size, font);
    }
  }

  return lines;
};

const numeric = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const scoreValues = (sample) => {
  const scores = sample.scores ?? {};
  const fragrance = numeric(scores.fragrance, 8.5);
  const aroma = scores.aroma === null || scores.aroma === undefined ? fragrance : numeric(scores.aroma, fragrance);
  return {
    fragAroma: (fragrance + aroma) / 2,
    cleanCup: numeric(scores.cleanCup, 8.5),
    sweetness: numeric(scores.sweetness, 8.5),
    acidity: numeric(scores.acidity, 8.5),
    body: numeric(scores.body, 8.5),
    flavor: numeric(scores.flavor, 8.5),
    aftertaste: numeric(scores.aftertaste, 8.5),
    balance: numeric(scores.balance, 8.5),
    consistency: numeric(scores.consistency, 8.5),
    overall: numeric(scores.overall, 8.5)
  };
};

const formatScore = (value) => numeric(value, 0).toFixed(2);

const formatWaterActivity = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return '';
  return Math.min(Math.max(parsed, 0), 0.99).toFixed(2);
};

const formatMoisture = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = Number.parseFloat(raw.replace('%', ''));
  if (!Number.isFinite(parsed)) return '';
  return Math.min(Math.max(parsed, 0), 100).toFixed(1);
};

class PdfPainter {
  constructor() {
    this.commands = [];
  }

  y(value) {
    return PAGE.height - value;
  }

  push(command) {
    this.commands.push(command);
  }

  fillRect(x, y, width, height, color) {
    this.push(`q ${fillColor(color)} ${fmt(x)} ${fmt(this.y(y + height))} ${fmt(width)} ${fmt(height)} re f Q`);
  }

  strokeRect(x, y, width, height, color = COLORS.line, lineWidth = 1) {
    this.push(`q ${strokeColor(color)} ${fmt(lineWidth)} w ${fmt(x)} ${fmt(this.y(y + height))} ${fmt(width)} ${fmt(height)} re S Q`);
  }

  roundedRect(x, y, width, height, radius, { fill = null, stroke = COLORS.line, lineWidth = 1 } = {}) {
    const r = Math.min(radius, width / 2, height / 2);
    const k = 0.5522847498;
    const left = x;
    const right = x + width;
    const top = y;
    const bottom = y + height;
    const path = [
      `${fmt(left + r)} ${fmt(this.y(top))} m`,
      `${fmt(right - r)} ${fmt(this.y(top))} l`,
      `${fmt(right - r + r * k)} ${fmt(this.y(top))} ${fmt(right)} ${fmt(this.y(top + r - r * k))} ${fmt(right)} ${fmt(this.y(top + r))} c`,
      `${fmt(right)} ${fmt(this.y(bottom - r))} l`,
      `${fmt(right)} ${fmt(this.y(bottom - r + r * k))} ${fmt(right - r + r * k)} ${fmt(this.y(bottom))} ${fmt(right - r)} ${fmt(this.y(bottom))} c`,
      `${fmt(left + r)} ${fmt(this.y(bottom))} l`,
      `${fmt(left + r - r * k)} ${fmt(this.y(bottom))} ${fmt(left)} ${fmt(this.y(bottom - r + r * k))} ${fmt(left)} ${fmt(this.y(bottom - r))} c`,
      `${fmt(left)} ${fmt(this.y(top + r))} l`,
      `${fmt(left)} ${fmt(this.y(top + r - r * k))} ${fmt(left + r - r * k)} ${fmt(this.y(top))} ${fmt(left + r)} ${fmt(this.y(top))} c`,
      'h'
    ].join(' ');
    const colorCommands = [
      fill ? fillColor(fill) : '',
      stroke ? strokeColor(stroke) : '',
      `${fmt(lineWidth)} w`
    ].filter(Boolean).join(' ');
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.push(`q ${colorCommands} ${path} ${paint} Q`);
  }

  line(x1, y1, x2, y2, color = COLORS.line, lineWidth = 1) {
    this.push(`q ${strokeColor(color)} ${fmt(lineWidth)} w ${fmt(x1)} ${fmt(this.y(y1))} m ${fmt(x2)} ${fmt(this.y(y2))} l S Q`);
  }

  circle(x, y, radius, { fill = null, stroke = null, lineWidth = 1 } = {}) {
    const k = 0.5522847498;
    const r = radius;
    const path = [
      `${fmt(x + r)} ${fmt(this.y(y))} m`,
      `${fmt(x + r)} ${fmt(this.y(y + k * r))} ${fmt(x + k * r)} ${fmt(this.y(y + r))} ${fmt(x)} ${fmt(this.y(y + r))} c`,
      `${fmt(x - k * r)} ${fmt(this.y(y + r))} ${fmt(x - r)} ${fmt(this.y(y + k * r))} ${fmt(x - r)} ${fmt(this.y(y))} c`,
      `${fmt(x - r)} ${fmt(this.y(y - k * r))} ${fmt(x - k * r)} ${fmt(this.y(y - r))} ${fmt(x)} ${fmt(this.y(y - r))} c`,
      `${fmt(x + k * r)} ${fmt(this.y(y - r))} ${fmt(x + r)} ${fmt(this.y(y - k * r))} ${fmt(x + r)} ${fmt(this.y(y))} c`,
      'h'
    ].join(' ');
    const colorCommands = [
      fill ? fillColor(fill) : '',
      stroke ? strokeColor(stroke) : '',
      `${fmt(lineWidth)} w`
    ].filter(Boolean).join(' ');
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.push(`q ${colorCommands} ${path} ${paint} Q`);
  }

  arc(cx, cy, radius, startAngle, endAngle, color, lineWidth) {
    const commands = [];
    let current = startAngle;
    const direction = endAngle >= startAngle ? 1 : -1;

    while ((direction > 0 && current < endAngle) || (direction < 0 && current > endAngle)) {
      const next = direction > 0 ? Math.min(current + Math.PI / 2, endAngle) : Math.max(current - Math.PI / 2, endAngle);
      const delta = next - current;
      const k = (4 / 3) * Math.tan(delta / 4);
      const p0 = { x: cx + Math.cos(current) * radius, y: cy + Math.sin(current) * radius };
      const p3 = { x: cx + Math.cos(next) * radius, y: cy + Math.sin(next) * radius };
      const c1 = { x: p0.x - Math.sin(current) * radius * k, y: p0.y + Math.cos(current) * radius * k };
      const c2 = { x: p3.x + Math.sin(next) * radius * k, y: p3.y - Math.cos(next) * radius * k };
      if (commands.length === 0) commands.push(`${fmt(p0.x)} ${fmt(this.y(p0.y))} m`);
      commands.push(`${fmt(c1.x)} ${fmt(this.y(c1.y))} ${fmt(c2.x)} ${fmt(this.y(c2.y))} ${fmt(p3.x)} ${fmt(this.y(p3.y))} c`);
      current = next;
    }

    this.push(`q ${strokeColor(color)} ${fmt(lineWidth)} w 1 J ${commands.join(' ')} S Q`);
  }

  image(name, x, y, width, height) {
    this.push(`q ${fmt(width)} 0 0 ${fmt(height)} ${fmt(x)} ${fmt(this.y(y + height))} cm /${name} Do Q`);
  }

  polygon(points, { fill = null, stroke = COLORS.line, lineWidth = 1 } = {}) {
    if (points.length === 0) return;
    const [first, ...rest] = points;
    const path = [
      `${fmt(first.x)} ${fmt(this.y(first.y))} m`,
      ...rest.map((point) => `${fmt(point.x)} ${fmt(this.y(point.y))} l`),
      'h'
    ].join(' ');
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    const colorCommands = [
      fill ? fillColor(fill) : '',
      stroke ? strokeColor(stroke) : '',
      `${fmt(lineWidth)} w`
    ].filter(Boolean).join(' ');
    this.push(`q ${colorCommands} ${path} ${paint} Q`);
  }

  measureText(value, size, font = 'regular', letterSpacing = 0) {
    const printable = toAscii(value);
    return estimateTextWidth(printable, size, font) + Math.max(0, printable.length - 1) * letterSpacing;
  }

  text(value, x, y, {
    size = 10,
    font = 'regular',
    color = COLORS.ink,
    align = 'left',
    maxWidth = null
  } = {}) {
    let printable = toAscii(value);
    if (!printable) return;
    if (maxWidth) printable = truncateToWidth(printable, maxWidth, size, font);

    let tx = x;
    const width = estimateTextWidth(printable, size, font);
    if (align === 'center') tx -= width / 2;
    if (align === 'right') tx -= width;

    this.push(`q ${fillColor(color)} BT /${FONT_IDS[font]} ${fmt(size)} Tf 1 0 0 1 ${fmt(tx)} ${fmt(this.y(y))} Tm (${escapePdfText(printable)}) Tj ET Q`);
  }

  multilineText(value, x, y, width, {
    size = 9,
    font = 'regular',
    color = COLORS.ink,
    lineHeight = size * 1.35,
    maxLines = 4
  } = {}) {
    const lines = wrapText(value, width, size, font, maxLines);
    lines.forEach((line, index) => {
      this.text(line, x, y + index * lineHeight, { size, font, color, maxWidth: width });
    });
    return y + lines.length * lineHeight;
  }

  content() {
    return this.commands.join('\n');
  }
}

const CANVAS_FONT = {
  regular: (size) => `400 ${size}px Inter, sans-serif`,
  medium: (size) => `500 ${size}px Inter, sans-serif`,
  semibold: (size) => `600 ${size}px Inter, sans-serif`,
  bold: (size) => `700 ${size}px Inter, sans-serif`,
  extraBold: (size) => `800 ${size}px Inter, sans-serif`,
  black: (size) => `900 ${size}px Inter, sans-serif`,
  italic: (size) => `italic 400 ${size}px Inter, sans-serif`,
  serif: (size) => `500 ${size}px Fraunces, serif`,
  serifBold: (size) => `900 ${size}px Fraunces, serif`
};

class CanvasPainter {
  constructor(canvas, scale, images = {}) {
    this.canvas = canvas;
    this.scale = scale;
    this.images = images;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(scale, scale);
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.fontKerning = 'normal';
    this.ctx.textRendering = 'optimizeLegibility';
  }

  pathPaint({ fill = null, stroke = null, lineWidth = 1, dash = [] } = {}) {
    if (fill) {
      this.ctx.fillStyle = fill;
      this.ctx.fill();
    }
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = lineWidth;
      this.ctx.setLineDash(dash);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  fillRect(x, y, width, height, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
  }

  strokeRect(x, y, width, height, color = COLORS.line, lineWidth = 1) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, width, height);
  }

  roundedRect(x, y, width, height, radius, options = {}) {
    const r = Math.min(radius, width / 2, height / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
    this.pathPaint(options);
  }

  line(x1, y1, x2, y2, color = COLORS.line, lineWidth = 1) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.pathPaint({ stroke: color, lineWidth });
  }

  circle(x, y, radius, options = {}) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.closePath();
    this.pathPaint(options);
  }

  arc(cx, cy, radius, startAngle, endAngle, color, lineWidth) {
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, startAngle, endAngle);
    this.pathPaint({ stroke: color, lineWidth });
  }

  image(name, x, y, width, height) {
    const source = this.images[name];
    if (source) this.ctx.drawImage(source, x, y, width, height);
  }

  polygon(points, options = {}) {
    if (!points.length) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => this.ctx.lineTo(point.x, point.y));
    this.ctx.closePath();
    this.pathPaint(options);
  }

  font(size, font) {
    this.ctx.font = (CANVAS_FONT[font] || CANVAS_FONT.regular)(size);
  }

  measureText(value, size, font = 'regular', letterSpacing = 0) {
    this.font(size, font);
    const printable = String(value ?? '');
    if ('letterSpacing' in this.ctx) {
      this.ctx.letterSpacing = `${letterSpacing}px`;
      const width = this.ctx.measureText(printable).width;
      this.ctx.letterSpacing = '0px';
      return width;
    }
    return this.ctx.measureText(printable).width + Math.max(0, printable.length - 1) * letterSpacing;
  }

  truncate(value, maxWidth, size, font) {
    let printable = String(value ?? '').replace(/\s+/g, ' ').trim();
    this.font(size, font);
    if (this.ctx.measureText(printable).width <= maxWidth) return printable;
    while (printable && this.ctx.measureText(`${printable}...`).width > maxWidth) {
      printable = printable.slice(0, -1).trimEnd();
    }
    return printable ? `${printable}...` : '...';
  }

  text(value, x, y, {
    size = 10,
    font = 'regular',
    color = COLORS.ink,
    align = 'left',
    maxWidth = null,
    letterSpacing = 0,
    baseline = 'alphabetic'
  } = {}) {
    let printable = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!printable) return;
    if (maxWidth) printable = this.truncate(printable, maxWidth, size, font);
    this.font(size, font);
    this.ctx.fillStyle = color;
    this.ctx.textBaseline = baseline;
    if (!letterSpacing || 'letterSpacing' in this.ctx) {
      if ('letterSpacing' in this.ctx) this.ctx.letterSpacing = `${letterSpacing}px`;
      this.ctx.textAlign = align;
      this.ctx.fillText(printable, x, y);
      if ('letterSpacing' in this.ctx) this.ctx.letterSpacing = '0px';
      return;
    }

    const width = this.measureText(printable, size, font, letterSpacing);
    let cursorX = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    this.ctx.textAlign = 'left';
    for (const character of printable) {
      this.ctx.fillText(character, cursorX, y);
      cursorX += this.ctx.measureText(character).width + letterSpacing;
    }
  }

  multilineText(value, x, y, width, {
    size = 9,
    font = 'regular',
    color = COLORS.ink,
    lineHeight = size * 1.35,
    maxLines = 4
  } = {}) {
    this.font(size, font);
    const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(candidate).width <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = this.truncate(word, width, size, font);
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach((text, index) => this.text(text, x, y + index * lineHeight, { size, font, color, maxWidth: width }));
    return y + lines.length * lineHeight;
  }
}

const pdfColor = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r, g, b);
};

class VectorPdfPainter {
  constructor(page, fonts, images = {}) {
    this.page = page;
    this.fonts = fonts;
    this.images = images;
  }

  y(value) {
    return PAGE.height - value;
  }

  font(font) {
    return this.fonts[font] || this.fonts.regular;
  }

  measureText(value, size, font = 'regular', letterSpacing = 0) {
    const printable = String(value ?? '');
    return this.font(font).widthOfTextAtSize(printable, size) + Math.max(0, printable.length - 1) * letterSpacing;
  }

  fillRect(x, y, width, height, color) {
    this.page.drawRectangle({ x, y: this.y(y + height), width, height, color: pdfColor(color) });
  }

  strokeRect(x, y, width, height, color = COLORS.line, lineWidth = 1) {
    this.page.drawRectangle({
      x,
      y: this.y(y + height),
      width,
      height,
      borderColor: pdfColor(color),
      borderWidth: lineWidth
    });
  }

  roundedRect(x, y, width, height, radius, { fill = null, stroke = COLORS.line, lineWidth = 1 } = {}) {
    const r = Math.min(radius, width / 2, height / 2);
    const k = 0.5522847498;
    const right = x + width;
    const bottom = y + height;
    const path = [
      `M ${x + r} ${y}`,
      `L ${right - r} ${y}`,
      `C ${right - r + r * k} ${y} ${right} ${y + r - r * k} ${right} ${y + r}`,
      `L ${right} ${bottom - r}`,
      `C ${right} ${bottom - r + r * k} ${right - r + r * k} ${bottom} ${right - r} ${bottom}`,
      `L ${x + r} ${bottom}`,
      `C ${x + r - r * k} ${bottom} ${x} ${bottom - r + r * k} ${x} ${bottom - r}`,
      `L ${x} ${y + r}`,
      `C ${x} ${y + r - r * k} ${x + r - r * k} ${y} ${x + r} ${y}`,
      'Z'
    ].join(' ');
    this.page.drawSvgPath(path, {
      x: 0,
      y: PAGE.height,
      color: fill ? pdfColor(fill) : undefined,
      borderColor: stroke ? pdfColor(stroke) : undefined,
      borderWidth: stroke ? lineWidth : undefined
    });
  }

  line(x1, y1, x2, y2, color = COLORS.line, lineWidth = 1, dash = []) {
    this.page.drawLine({
      start: { x: x1, y: this.y(y1) },
      end: { x: x2, y: this.y(y2) },
      color: pdfColor(color),
      thickness: lineWidth,
      dashArray: dash
    });
  }

  circle(x, y, radius, { fill = null, stroke = null, lineWidth = 1, dash = [] } = {}) {
    this.page.drawCircle({
      x,
      y: this.y(y),
      size: radius,
      color: fill ? pdfColor(fill) : undefined,
      borderColor: stroke ? pdfColor(stroke) : undefined,
      borderWidth: stroke ? lineWidth : undefined,
      borderDashArray: dash
    });
  }

  arc(cx, cy, radius, startAngle, endAngle, color, lineWidth) {
    const points = [];
    const steps = Math.max(8, Math.ceil(Math.abs(endAngle - startAngle) * radius / 4));
    for (let index = 0; index <= steps; index += 1) {
      const angle = startAngle + ((endAngle - startAngle) * index) / steps;
      points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    this.page.drawSvgPath(path, {
      x: 0,
      y: PAGE.height,
      borderColor: pdfColor(color),
      borderWidth: lineWidth,
      borderLineCap: LineCapStyle.Round
    });
  }

  image(name, x, y, width, height) {
    const image = this.images[name];
    if (image) this.page.drawImage(image, { x, y: this.y(y + height), width, height });
  }

  polygon(points, { fill = null, stroke = COLORS.line, lineWidth = 1, opacity = 1 } = {}) {
    if (!points.length) return;
    const path = `${points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} Z`;
    this.page.drawSvgPath(path, {
      x: 0,
      y: PAGE.height,
      color: fill ? pdfColor(fill) : undefined,
      opacity: fill ? opacity : undefined,
      borderColor: stroke ? pdfColor(stroke) : undefined,
      borderWidth: stroke ? lineWidth : undefined,
      borderOpacity: stroke ? 1 : undefined
    });
  }

  truncate(value, maxWidth, size, font, letterSpacing = 0) {
    let printable = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (this.measureText(printable, size, font, letterSpacing) <= maxWidth) return printable;
    while (printable && this.measureText(`${printable}...`, size, font, letterSpacing) > maxWidth) {
      printable = printable.slice(0, -1).trimEnd();
    }
    return printable ? `${printable}...` : '...';
  }

  text(value, x, y, {
    size = 10,
    font = 'regular',
    color = COLORS.ink,
    align = 'left',
    maxWidth = null,
    letterSpacing = 0,
    baseline = 'alphabetic'
  } = {}) {
    let printable = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!printable) return;
    if (maxWidth) printable = this.truncate(printable, maxWidth, size, font, letterSpacing);
    const embeddedFont = this.font(font);
    const width = this.measureText(printable, size, font, letterSpacing);
    let cursorX = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const baselineY = this.y(y) - (baseline === 'middle' ? size * 0.35 : 0);

    if (!letterSpacing) {
      this.page.drawText(printable, { x: cursorX, y: baselineY, size, font: embeddedFont, color: pdfColor(color) });
      return;
    }

    let previous = '';
    for (const character of printable) {
      this.page.drawText(character, { x: cursorX, y: baselineY, size, font: embeddedFont, color: pdfColor(color) });
      const current = `${previous}${character}`;
      cursorX += embeddedFont.widthOfTextAtSize(current, size) - embeddedFont.widthOfTextAtSize(previous, size) + letterSpacing;
      previous = current;
    }
  }

  multilineText(value, x, y, width, {
    size = 9,
    font = 'regular',
    color = COLORS.ink,
    lineHeight = size * 1.35,
    maxLines = 4
  } = {}) {
    const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.measureText(candidate, size, font) <= width) line = candidate;
      else {
        if (line) lines.push(line);
        line = this.truncate(word, width, size, font);
      }
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach((text, index) => this.text(text, x, y + index * lineHeight, { size, font, color, maxWidth: width }));
    return y + lines.length * lineHeight;
  }
}

const drawSectionTitle = (pdf, title, x, y, width) => {
  pdf.text(title.toUpperCase(), x, y, {
    size: 6.75,
    font: 'black',
    color: '#8e7f6d',
    maxWidth: width,
    letterSpacing: 1.35
  });
  pdf.line(x, y + 7, x + width, y + 7, COLORS.softLine, 0.9);
};

const drawHeader = (pdf, sessionStartTime, language) => {
  pdf.text(translate(language, 'labSummary').toUpperCase(), PAGE.margin, 32, {
    size: 9.7,
    font: 'extraBold',
    color: COLORS.ink,
    letterSpacing: 1.26
  });
  pdf.text(translate(language, 'qualityControl').toUpperCase(), PAGE.margin, 47, {
    size: 6.75,
    font: 'bold',
    color: '#4f4437',
    letterSpacing: 0.54
  });
  pdf.text(sessionStartTime || '', PAGE.width - PAGE.margin, 31, {
    size: 6,
    font: 'bold',
    color: COLORS.ink,
    align: 'right',
    maxWidth: 230,
    letterSpacing: 0.48
  });
  pdf.line(PAGE.margin, 60, PAGE.width - PAGE.margin, 60, '#7a7a7a', 0.9);
  pdf.line(PAGE.margin, 68, PAGE.width - PAGE.margin, 68, COLORS.ink, 1);
};

const processingLabel = (sample, language) => {
  if (sample.processing === 'Other') return sample.processingOther || translate(language, 'other');
  if (sample.processing && sample.processing !== 'Select One') return translateProcessing(language, sample.processing);
  return translate(language, 'undefined');
};

const sampleDisplayName = (sample, index, language) =>
  sample.lotName || `${translate(language, 'sample')} ${String(index + 1).padStart(2, '0')}`;

const sampleDisplayId = (sample, language) =>
  sample.ositoId || translate(language, 'noId');

const drawIdentity = (pdf, sample, index, language) => {
  const x = PAGE.margin;
  const y = 70;
  const leftWidth = 590;
  const scoreWidth = PAGE.width - PAGE.margin * 2 - leftWidth;
  const height = 118;
  const name = sampleDisplayName(sample, index, language);

  pdf.fillRect(x, y, leftWidth, height, '#fcfbfa');
  pdf.strokeRect(x, y, leftWidth, height, '#111111', 0.9);
  pdf.fillRect(x + leftWidth, y, scoreWidth, height, COLORS.dark);
  pdf.strokeRect(x + leftWidth, y, scoreWidth, height, '#111111', 0.9);

  if (!sample.lotName) {
    pdf.text(`${translate(language, 'sample').toUpperCase()} ${String(index + 1).padStart(2, '0')}`, x + 18, y + 37, {
      size: 6,
      font: 'bold',
      color: COLORS.muted
    });
  }

  const idLabel = sampleDisplayId(sample, language).toUpperCase();
  const idWidth = Math.min(120, Math.max(54, pdf.measureText(idLabel, 11, 'black') + 16));
  pdf.roundedRect(x + 17, y + 17, idWidth, 27, 8, { fill: '#fffaf3', stroke: COLORS.line, lineWidth: 0.7 });
  pdf.text(idLabel, x + 17 + idWidth / 2, y + 31, {
    size: 11,
    font: 'black',
    color: COLORS.ink,
    align: 'center',
    baseline: 'middle',
    maxWidth: idWidth - 12
  });

  pdf.text(name.toUpperCase(), x + 18, y + 67, {
    size: name.length > 36 ? 18.7 : 20.3,
    font: 'serifBold',
    color: COLORS.ink,
    maxWidth: leftWidth - 36
  });

  const metaY = y + 89;
  pdf.text(translate(language, 'processing').toUpperCase(), x + 18, metaY, {
    size: 6,
    font: 'black',
    color: '#a8a29e',
    letterSpacing: 0.6
  });
  pdf.text(processingLabel(sample, language).toUpperCase(), x + 18, metaY + 14, {
    size: 9,
    font: 'bold',
    color: '#57534e',
    maxWidth: 188
  });

  const waterActivity = formatWaterActivity(sample.waterActivity);
  const moisture = formatMoisture(sample.moisture);
  if (waterActivity) {
    pdf.text(translate(language, 'waterActivity').toUpperCase(), x + 264, metaY, { size: 6, font: 'bold', color: COLORS.muted });
    pdf.text(waterActivity, x + 350, metaY, { size: 7, font: 'bold', color: COLORS.ink });
  }
  if (moisture) {
    pdf.text(translate(language, 'moisture').toUpperCase(), x + 398, metaY, { size: 6, font: 'bold', color: COLORS.muted });
    pdf.text(`${moisture}%`, x + 452, metaY, { size: 7, font: 'bold', color: COLORS.ink });
  }

  pdf.text(translate(language, 'finalScore').toUpperCase(), x + leftWidth + scoreWidth / 2, y + 41, {
    size: 6.75,
    font: 'black',
    color: '#c6a17a',
    align: 'center',
    letterSpacing: 2.7
  });
  pdf.text(calculateTotal(sample), x + leftWidth + scoreWidth / 2, y + 79, {
    size: 37,
    font: 'black',
    color: COLORS.white,
    align: 'center'
  });
};

const radarPoint = (centerX, centerY, radius, index, count) => {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius
  };
};

const drawRadar = (pdf, sample, language, x, y) => {
  pdf.text(translate(language, 'attributeMap').toUpperCase(), x + 96, y, {
    size: 6.75,
    font: 'black',
    color: COLORS.muted,
    align: 'center',
    letterSpacing: 1.35
  });

  const centerX = x + 96;
  const centerY = y + 99;
  const radius = 58;
  const scores = scoreValues(sample);
  const values = RADAR_SCORE_IDS.map((id) => scores[id]);

  [7.5, 8.5, 9.5, 10].forEach((level) => {
    const levelRadius = ((level - GRAPH_FLOOR) / (GRAPH_CEILING - GRAPH_FLOOR)) * radius;
    pdf.circle(centerX, centerY, levelRadius, {
      stroke: '#e7e5e4',
      lineWidth: level === 10 ? 0.78 : 0.62,
      dash: level === 10 ? [] : [2.4, 2.4]
    });
  });

  values.forEach((_, index) => {
    const endpoint = radarPoint(centerX, centerY, radius, index, values.length);
    pdf.line(centerX, centerY, endpoint.x, endpoint.y, '#f5f5f4', 0.9);
  });

  const dataPoints = values.map((value, index) => {
    const clamped = Math.min(Math.max(value, GRAPH_FLOOR), GRAPH_CEILING);
    const valueRadius = ((clamped - GRAPH_FLOOR) / (GRAPH_CEILING - GRAPH_FLOOR)) * radius;
    return radarPoint(centerX, centerY, valueRadius, index, values.length);
  });
  pdf.polygon(dataPoints, { fill: '#1c1917', stroke: '#1c1917', lineWidth: 1.5, opacity: 0.12 });
  dataPoints.forEach((point) => pdf.circle(point.x, point.y, 2.7, {
    fill: '#1c1917',
    stroke: '#ffffff',
    lineWidth: 1.5
  }));

  RADAR_LABELS.forEach((label, index) => {
    const displayLabel = language === 'es'
      ? translateRadarLabel(language, label)
      : ({ 'Frag/Aroma': 'Fr/Aroma', Consistency: 'Consist.' }[label] ?? label);
    const point = radarPoint(centerX, centerY, radius + 14, index, RADAR_LABELS.length);
    let align = 'center';
    if (point.x < centerX - 16) align = 'right';
    if (point.x > centerX + 16) align = 'left';
    const labelX = Math.min(Math.max(point.x, x + 28), x + 168);
    pdf.text(displayLabel.toUpperCase(), labelX, point.y, {
      size: 4.1,
      font: 'black',
      color: '#a8a29e',
      align,
      maxWidth: 46,
      baseline: 'middle',
      letterSpacing: -0.18
    });
  });
};

const getBalanceSegments = (sample) => {
  const categoryOrder = ['Fruity', 'Citrus', 'Sweet', 'Floral', 'Nutty/Cocoa', 'Spices', 'Structure', 'Negative'];
  const tags = [
    ...(sample.notes?.fragAromaTags ?? []),
    ...(sample.notes?.inCupTags ?? [])
  ];
  const counts = tags.reduce((acc, tag) => {
    const category = getCategoryForItem(tag) || 'Structure';
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count, pct: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
};

const drawBalance = (pdf, sample, language, x, y) => {
  pdf.text(translate(language, 'sensoryBalance').toUpperCase(), x + 74, y, {
    size: 6.75,
    font: 'black',
    color: COLORS.muted,
    align: 'center',
    letterSpacing: 1.35
  });
  const segments = getBalanceSegments(sample);

  if (segments.length === 0) {
    pdf.circle(x + 74, y + 99, 43, { stroke: COLORS.stone, lineWidth: 12 });
    pdf.text(translate(language, 'profileUnavailable'), x + 74, y + 103, {
      size: 8,
      font: 'black',
      color: COLORS.muted,
      align: 'center'
    });
    return;
  }

  const centerX = x + 74;
  const centerY = y + 99;
  const radius = 42;
  const lineWidth = 16;
  const gap = 0.04;
  let cursor = -Math.PI / 2;

  pdf.circle(centerX, centerY, radius, { stroke: COLORS.stone, lineWidth });
  segments.forEach(({ category, pct }) => {
    const segmentLength = Math.PI * 2 * pct;
    const end = cursor + Math.max(0.05, segmentLength - gap);
    pdf.arc(centerX, centerY, radius, cursor, end, BALANCE_COLORS[category] || BALANCE_COLORS.Structure, lineWidth);
    cursor += segmentLength;
  });
  pdf.circle(centerX, centerY, 30, { fill: COLORS.white });
  pdf.text(translate(language, 'balance').toUpperCase(), centerX, centerY + 3, {
    size: 8,
    font: 'black',
    color: COLORS.ink,
    align: 'center'
  });

  const legendY = y + 172;
  const legendWidth = 145;
  const shown = segments.slice(0, 4);
  const totalLabelWidth = shown.reduce((sum, { category }) => sum + pdf.measureText(category.toUpperCase(), 5, 'black', 0.05) + 13, 0);
  let legendX = x + Math.max(0, (legendWidth - totalLabelWidth) / 2);
  shown.forEach(({ category }) => {
    pdf.circle(legendX + 3, legendY - 1.5, 3, { fill: BALANCE_COLORS[category] || BALANCE_COLORS.Structure });
    pdf.text(category.toUpperCase(), legendX + 10, legendY, {
      size: 5,
      font: 'black',
      color: COLORS.ink,
      maxWidth: 46,
      letterSpacing: 0.05
    });
    legendX += pdf.measureText(category.toUpperCase(), 5, 'black', 0.05) + 18;
  });
};

const drawScoreGrid = (pdf, sample, language, x, y, width) => {
  drawSectionTitle(pdf, translate(language, 'attributeGrading'), x, y, width);
  const scores = scoreValues(sample);
  const colWidth = width / 2;
  const rowHeight = 17;

  RADAR_SCORE_IDS.forEach((id, index) => {
    const col = index < 5 ? 0 : 1;
    const row = index % 5;
    const cellX = x + col * colWidth;
    const cellY = y + 18 + row * rowHeight;
    if (row % 2 === 0) pdf.fillRect(cellX, cellY - 10, colWidth - 8, 14, COLORS.surfaceSoft);

    pdf.text(translateRadarLabel(language, RADAR_LABELS[index]), cellX + 6, cellY, {
      size: 7,
      font: 'bold',
      color: COLORS.muted,
      maxWidth: colWidth - 50
    });
    pdf.text(formatScore(scores[id]), cellX + colWidth - 14, cellY, {
      size: 7.5,
      font: 'bold',
      color: COLORS.ink,
      align: 'right'
    });
  });
};

const tagStyle = (tag) => TAG_STYLES[getCategoryForItem(tag) || 'Negative'] || TAG_STYLES.Negative;

const drawTagSection = (pdf, label, tags, language, x, y, width, maxRows = 2) => {
  pdf.text(label.toUpperCase(), x, y, {
    size: 6.75,
    font: 'black',
    color: '#8e7f6d',
    maxWidth: width,
    letterSpacing: 1.35
  });
  pdf.line(x, y + 8, x + width, y + 8, COLORS.softLine, 0.9);

  if (!tags.length) {
    pdf.text(translate(language, 'noneRecorded'), x, y + 23, {
      size: 6,
      font: 'italic',
      color: '#b6aea2'
    });
    return y + 34;
  }

  let cursorX = x;
  let cursorY = y + 22;
  let row = 0;

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    const text = translateTag(language, tag);
    const chipWidth = Math.min(100, Math.max(28, pdf.measureText(text, 6, 'bold') + 11.7));

    if (cursorX + chipWidth > x + width) {
      row += 1;
      cursorX = x;
      cursorY += 17;
    }

    if (row >= maxRows) {
      const remaining = tags.length - index;
      const moreText = `+${remaining} more`;
      pdf.roundedRect(cursorX, cursorY - 9.25, 42, 11.5, 3, { fill: COLORS.surfaceSoft, stroke: COLORS.line, lineWidth: 0.5 });
      pdf.text(moreText, cursorX + 21, cursorY - 3.5, {
        size: 5.6,
        font: 'bold',
        color: COLORS.muted,
        align: 'center',
        baseline: 'middle'
      });
      return cursorY + 17;
    }

    const style = tagStyle(tag);
    pdf.roundedRect(cursorX, cursorY - 9.25, chipWidth, 11.5, 3, { fill: style.fill, stroke: style.stroke, lineWidth: 0.5 });
    pdf.text(text, cursorX + chipWidth / 2, cursorY - 3.5, {
      size: 6,
      font: 'bold',
      color: style.text,
      align: 'center',
      baseline: 'middle',
      maxWidth: chipWidth - 10
    });
    cursorX += chipWidth + 5;
  }

  return cursorY + 17;
};

const drawNotes = (pdf, sample, language, x, y, width) => {
  drawSectionTitle(pdf, translate(language, 'otherObservations'), x, y, width);
  let cursorY = y + 22;
  const notes = sample.notes ?? {};
  const badges = [
    notes.acidityLevel ? `${translate(language, 'acidity')}: ${translateLevel(language, notes.acidityLevel)}` : '',
    notes.sweetnessLevel ? `${translate(language, 'sweetness')}: ${translateLevel(language, notes.sweetnessLevel)}` : ''
  ].filter(Boolean);

  if (badges.length) {
    let badgeX = x;
    badges.forEach((badge) => {
      const label = truncateToWidth(badge, 104, 7.5, 'black');
      const badgeWidth = pdf.measureText(label, 7.5, 'black') + 18;
      pdf.roundedRect(badgeX, cursorY - 10, badgeWidth, 15, 6, { fill: COLORS.surfaceSoft, stroke: COLORS.line, lineWidth: 0.6 });
      pdf.text(label, badgeX + badgeWidth / 2, cursorY - 2.5, {
        size: 7.5,
        font: 'black',
        color: COLORS.ink,
        align: 'center',
        baseline: 'middle'
      });
      badgeX += badgeWidth + 8;
    });
    cursorY += 24;
  }

  const text = notes.otherText || (badges.length ? '' : translate(language, 'noneRecordedPeriod'));
  if (text) {
    pdf.multilineText(text, x, cursorY, width - 12, {
      size: 7.4,
      font: 'italic',
      color: notes.otherText ? COLORS.ink : '#b6aea2',
      lineHeight: 10.5,
      maxLines: 5
    });
  }
};

const drawFooter = (pdf, language, logoImage) => {
  pdf.line(PAGE.margin, 454, PAGE.width - PAGE.margin, 454, '#777777', 0.9);
  pdf.text(`${translate(language, 'authorizedAnalysis')} • ${translate(language, 'protocol')}`.toUpperCase(), PAGE.width / 2, 467, {
    size: 6.7,
    font: 'extraBold',
    color: COLORS.ink,
    align: 'center',
    letterSpacing: 0.51
  });

  if (logoImage) {
    const height = 56;
    const width = height * (logoImage.width / logoImage.height);
    pdf.image(logoImage.name, PAGE.width / 2 - width / 2, 475, width, height);
    return;
  }

  pdf.text('OSITO', PAGE.width / 2, 512, {
    size: 12,
    font: 'serifBold',
    color: COLORS.ink,
    align: 'center'
  });
};

const paintSampleReport = (pdf, sample, index, {
  sessionStartTime = '',
  language = 'en',
  logoImage = null
} = {}) => {
  pdf.fillRect(0, 0, PAGE.width, PAGE.height, COLORS.white);
  drawHeader(pdf, sessionStartTime, language);
  drawIdentity(pdf, sample, index, language);

  const leftX = PAGE.margin;
  const rightX = 412;
  const bodyY = 206;

  drawRadar(pdf, sample, language, leftX, bodyY);
  drawBalance(pdf, sample, language, leftX + 204, bodyY);

  let tagY = bodyY;
  tagY = drawTagSection(pdf, translate(language, 'fragranceAroma'), sample.notes?.fragAromaTags ?? [], language, rightX, tagY, 358, 2);
  tagY = drawTagSection(pdf, translate(language, 'inCup'), sample.notes?.inCupTags ?? [], language, rightX, tagY + 3, 358, 2);
  const negativeEndY = drawTagSection(
    pdf,
    translate(language, 'negative'),
    sample.notes?.negativeTags ?? [],
    language,
    rightX,
    tagY + 3,
    358,
    2
  );
  drawNotes(pdf, sample, language, rightX, Math.max(316, negativeEndY + 4), 358);
  drawFooter(pdf, language, logoImage);
};

export const createSampleReportPdf = (sample, index, options = {}) => {
  const pdf = new PdfPainter();
  paintSampleReport(pdf, sample, index, options);

  return createPdfBytes(pdf.content(), options.logoImage ? [options.logoImage] : []);
};

const asBytes = (value) => encoder.encode(value);

const streamObject = (id, dictionary, streamBytes) =>
  concatBytes([
    asBytes(`${id} 0 obj\n<< ${dictionary} /Length ${streamBytes.length} >>\nstream\n`),
    streamBytes,
    asBytes('\nendstream\nendobj\n')
  ]);

const createPdfBytes = (content, images = []) => {
  const imageObjects = images.map((image, index) => ({
    ...image,
    objectId: 9 + index
  }));
  const xObjects = imageObjects.length
    ? `/XObject << ${imageObjects.map((image) => `/${image.name} ${image.objectId} 0 R`).join(' ')} >>`
    : '';
  const contentBytes = asBytes(content);
  const objects = [
    asBytes('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    asBytes('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    asBytes(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R /F5 8 0 R >> ${xObjects} >> /Contents ${8 + imageObjects.length + 1} 0 R >>\nendobj\n`),
    asBytes('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'),
    asBytes('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n'),
    asBytes('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>\nendobj\n'),
    asBytes('7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>\nendobj\n'),
    asBytes('8 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>\nendobj\n'),
    ...imageObjects.map((image) =>
      streamObject(
        image.objectId,
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8`,
        image.data
      )
    ),
    streamObject(8 + imageObjects.length + 1, '', contentBytes)
  ];

  const parts = [asBytes('%PDF-1.4\n')];
  const offsets = [0];
  let byteOffset = parts[0].length;
  objects.forEach((object) => {
    offsets.push(byteOffset);
    parts.push(object);
    byteOffset += object.length;
  });

  const xrefOffset = byteOffset;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  ].join('');

  return concatBytes([...parts, asBytes(xref)]);
};

const createJpegPagePdf = (jpegBytes, pixelWidth, pixelHeight) => {
  const content = asBytes(`q ${PAGE.width} 0 0 ${PAGE.height} 0 0 cm /Im1 Do Q`);
  const objects = [
    asBytes('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    asBytes('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    asBytes(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`),
    streamObject(4, `/Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpegBytes),
    streamObject(5, '', content)
  ];
  const parts = [asBytes('%PDF-1.4\n')];
  const offsets = [0];
  let byteOffset = parts[0].length;
  objects.forEach((object) => {
    offsets.push(byteOffset);
    parts.push(object);
    byteOffset += object.length;
  });
  const xrefOffset = byteOffset;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  ].join('');
  return concatBytes([...parts, asBytes(xref)]);
};

const canvasToJpeg = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob(async (blob) => {
    if (!blob) {
      reject(new Error('Unable to render PDF page image.'));
      return;
    }
    resolve(new Uint8Array(await blob.arrayBuffer()));
  }, 'image/jpeg', 0.96);
});

const createRasterSampleReportPdf = async (sample, index, options = {}) => {
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.width * scale;
  canvas.height = PAGE.height * scale;
  const images = options.logoImage?.source ? { [options.logoImage.name]: options.logoImage.source } : {};
  const painter = new CanvasPainter(canvas, scale, images);
  paintSampleReport(painter, sample, index, options);
  const jpegBytes = await canvasToJpeg(canvas);
  return createJpegPagePdf(jpegBytes, canvas.width, canvas.height);
};

const FONT_ASSET_URLS = {
  regular: inter400Url,
  medium: inter500Url,
  semibold: inter600Url,
  bold: inter700Url,
  extraBold: inter800Url,
  black: inter900Url,
  italic: inter400ItalicUrl,
  serif: fraunces500Url,
  serifBold: fraunces900Url
};

let vectorAssetPromise;

const loadVectorAssets = (logoSrc) => {
  if (!vectorAssetPromise) {
    vectorAssetPromise = Promise.all([
      Promise.all(Object.entries(FONT_ASSET_URLS).map(async ([name, url]) => [name, new Uint8Array(await (await fetch(url)).arrayBuffer())])),
      logoSrc ? fetch(logoSrc).then((response) => response.arrayBuffer()).then((bytes) => new Uint8Array(bytes)) : null
    ]).then(([fontEntries, logoBytes]) => ({ fontBytes: Object.fromEntries(fontEntries), logoBytes }));
  }
  return vectorAssetPromise;
};

const createVectorSampleReportPdf = async (sample, index, options, assets) => {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts = {};
  for (const [name, bytes] of Object.entries(assets.fontBytes)) {
    fonts[name] = await document.embedFont(bytes, { subset: true });
  }
  const images = {};
  let logoImage = null;
  if (assets.logoBytes) {
    const embeddedLogo = await document.embedPng(assets.logoBytes);
    images.Im1 = embeddedLogo;
    logoImage = { name: 'Im1', width: embeddedLogo.width, height: embeddedLogo.height };
  }
  const page = document.addPage([PAGE.width, PAGE.height]);
  const painter = new VectorPdfPainter(page, fonts, images);
  paintSampleReport(painter, sample, index, { ...options, logoImage });
  return new Uint8Array(await document.save());
};

const safeFilenamePart = (value, fallback) => {
  const cleaned = toAscii(value || fallback)
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return cleaned || fallback;
};

const uniquePdfFilename = (sample, index, used) => {
  const base = safeFilenamePart(sample.ositoId || sample.lotName, `Sample_${String(index + 1).padStart(2, '0')}`);
  const count = (used.get(base) ?? 0) + 1;
  used.set(base, count);
  return count === 1 ? `${base}.pdf` : `${base}_${count}.pdf`;
};

const zipFilename = (sessionName) => {
  const stamp = new Date()
    .toLocaleString()
    .replace(/[/:]/g, '-')
    .replace(/,/g, '')
    .replace(/\s+/g, '_');
  const safeSessionName = safeFilenamePart(sessionName, '');
  return safeSessionName ? `Cupping_Report_${safeSessionName}_${stamp}_PDFs.zip` : `Cupping_Report_${stamp}_PDFs.zip`;
};

const concatBytes = (parts) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
};

let crcTable = null;

const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};

const crc32 = (data) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
};

const makeHeader = (length) => {
  const header = new Uint8Array(length);
  return { header, view: new DataView(header.buffer) };
};

export const createZipBytes = (entries) => {
  const files = [];
  const central = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();

  entries.forEach(({ name, data }) => {
    const filename = encoder.encode(name);
    const content = data instanceof Uint8Array ? data : new Uint8Array(data);
    const crc = crc32(content);

    const local = makeHeader(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint16(10, dosTime, true);
    local.view.setUint16(12, dosDate, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, content.length, true);
    local.view.setUint32(22, content.length, true);
    local.view.setUint16(26, filename.length, true);
    local.view.setUint16(28, 0, true);
    files.push(local.header, filename, content);

    const centralHeader = makeHeader(46);
    centralHeader.view.setUint32(0, 0x02014b50, true);
    centralHeader.view.setUint16(4, 20, true);
    centralHeader.view.setUint16(6, 20, true);
    centralHeader.view.setUint16(8, 0x0800, true);
    centralHeader.view.setUint16(10, 0, true);
    centralHeader.view.setUint16(12, dosTime, true);
    centralHeader.view.setUint16(14, dosDate, true);
    centralHeader.view.setUint32(16, crc, true);
    centralHeader.view.setUint32(20, content.length, true);
    centralHeader.view.setUint32(24, content.length, true);
    centralHeader.view.setUint16(28, filename.length, true);
    centralHeader.view.setUint16(30, 0, true);
    centralHeader.view.setUint16(32, 0, true);
    centralHeader.view.setUint16(34, 0, true);
    centralHeader.view.setUint16(36, 0, true);
    centralHeader.view.setUint32(38, 0, true);
    centralHeader.view.setUint32(42, offset, true);
    central.push(centralHeader.header, filename);

    offset += local.header.length + filename.length + content.length;
  });

  const centralStart = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = makeHeader(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, centralStart, true);
  end.view.setUint16(20, 0, true);

  return concatBytes([...files, ...central, end.header]);
};

export const buildReportPdfSet = (samples, {
  sessionStartTime = '',
  sessionName = '',
  language = 'en',
  logoImage = null
} = {}) => {
  const usedNames = new Map();
  const files = samples.map((sample, index) => ({
    name: uniquePdfFilename(sample, index, usedNames),
    data: createSampleReportPdf(sample, index, { sessionStartTime, language, logoImage })
  }));

  return {
    files,
    zipFilename: zipFilename(sessionName),
    zipBytes: createZipBytes(files)
  };
};

const loadLogoImage = async (src) => {
  if (!src || typeof Image === 'undefined' || typeof document === 'undefined') return null;

  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    if (img.decode) {
      await img.decode();
    } else {
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', reject, { once: true });
      });
    }
  } catch {
    return null;
  }

  return {
    name: 'Im1',
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    source: img
  };
};

const buildRasterReportPdfSet = async (samples, {
  sessionStartTime = '',
  sessionName = '',
  language = 'en',
  logoImage = null
} = {}) => {
  const usedNames = new Map();
  const files = [];
  for (let index = 0; index < samples.length; index += 1) {
    files.push({
      name: uniquePdfFilename(samples[index], index, usedNames),
      data: await createRasterSampleReportPdf(samples[index], index, { sessionStartTime, language, logoImage })
    });
  }
  return {
    files,
    zipFilename: zipFilename(sessionName),
    zipBytes: createZipBytes(files)
  };
};

const buildVectorReportPdfSet = async (samples, {
  sessionStartTime = '',
  sessionName = '',
  language = 'en',
  logoSrc = null
} = {}) => {
  const assets = await loadVectorAssets(logoSrc);
  const usedNames = new Map();
  const files = [];
  for (let index = 0; index < samples.length; index += 1) {
    files.push({
      name: uniquePdfFilename(samples[index], index, usedNames),
      data: await createVectorSampleReportPdf(samples[index], index, { sessionStartTime, language }, assets)
    });
  }
  return {
    files,
    zipFilename: zipFilename(sessionName),
    zipBytes: createZipBytes(files)
  };
};

export const downloadReportPdfZip = async (samples, options = {}) => {
  const { zipBytes, zipFilename: downloadName, files } = await buildVectorReportPdfSet(samples, options);
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return { fileCount: files.length, zipFilename: downloadName };
};
