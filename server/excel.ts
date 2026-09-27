import ExcelJS from 'exceljs';
import type { RawCell, RawSheet, RawWorkbook } from '../shared/types.ts';
import { toISO } from '../shared/dates.ts';

const MAX_ROWS = 3000;
const MAX_COLS = 800;

// Paleta de tema por defecto de Office (orden de índices de tema en los rellenos).
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

// Paleta "indexed" clásica de Excel (colores 0-63).
const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00',
  '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF',
  '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300',
  '993300', '993366', '333399', '333333',
];

/** Lee los colores reales del tema del libro, si están disponibles. */
function themePalette(wb: ExcelJS.Workbook): string[] {
  const xml: string | undefined = (wb as unknown as { _themes?: Record<string, string> })._themes?.theme1;
  if (!xml) return DEFAULT_THEME;
  const pick = (tag: string): string | null => {
    const m = new RegExp(`<a:${tag}>\\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")`).exec(xml);
    return m ? (m[1] ?? m[2]).toUpperCase() : null;
  };
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  return order.map((t, i) => pick(t) ?? DEFAULT_THEME[i]);
}

function applyTint(hex: string, tint: number): string {
  const ch = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = ch.map((c) => Math.round(tint >= 0 ? c + (255 - c) * tint : c * (1 + tint)));
  return out.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

interface ColorSpec {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

function fillOf(cell: ExcelJS.Cell, palette: string[]): { fill: string; color: string } | undefined {
  const f = cell.fill as ExcelJS.Fill | undefined;
  if (!f || f.type !== 'pattern' || f.pattern === 'none') return undefined;
  const c = (f.fgColor ?? f.bgColor) as ColorSpec | undefined;
  if (!c) return undefined;
  if (c.argb) {
    const argb = c.argb.toUpperCase();
    return { fill: argb, color: `#${argb.slice(-6)}` };
  }
  if (typeof c.theme === 'number') {
    const tint = Math.round((c.tint ?? 0) * 100) / 100;
    const base = palette[c.theme] ?? '999999';
    return { fill: `theme:${c.theme}:${tint}`, color: `#${applyTint(base, tint)}` };
  }
  if (typeof c.indexed === 'number') {
    if (c.indexed === 64 || c.indexed === 65) return undefined; // "automático"
    const hex = INDEXED[c.indexed] ?? '999999';
    return { fill: `FF${hex}`, color: `#${hex}` };
  }
  return undefined;
}

function normalizeValue(value: ExcelJS.CellValue): { v: string | number | null; d?: string } {
  if (value === null || value === undefined) return { v: null };
  if (typeof value === 'number') return { v: value };
  if (typeof value === 'string') return { v: value };
  if (typeof value === 'boolean') return { v: value ? 'SI' : 'NO' };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { v: null };
    const iso = toISO(value);
    return { v: iso, d: iso };
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return { v: value.richText.map((r) => r.text).join('') };
    if ('result' in value) return normalizeValue((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') return { v: (value as { text: string }).text };
    if ('error' in value) return { v: null };
  }
  return { v: String(value) };
}

export async function readXlsx(buffer: Buffer, fileName: string): Promise<RawWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const palette = themePalette(wb);
  const sheets: RawSheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.state && ws.state !== 'visible') return;
    const rowCount = Math.min(ws.rowCount, MAX_ROWS);
    const colCount = Math.min(ws.columnCount, MAX_COLS);
    const rows: (RawCell | null)[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const cells: (RawCell | null)[] = [];
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        const isSlave = cell.isMerged && cell.master && cell.master.address !== cell.address;
        const { v, d } = isSlave ? { v: null, d: undefined } : normalizeValue(cell.value);
        const fill = fillOf(cell, palette);
        if (v === null && !fill) {
          cells.push(null);
          continue;
        }
        const raw: RawCell = { v: typeof v === 'string' ? v.trim() || null : v };
        if (d) raw.d = d;
        if (fill) {
          raw.fill = fill.fill;
          raw.color = fill.color;
        }
        cells.push(raw);
      }
      while (cells.length && cells[cells.length - 1] === null) cells.pop();
      rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
    sheets.push({ name: ws.name, rows });
  });
  return { fileName, sheets };
}

/** CSV exportado desde Excel en español (normalmente separado por punto y coma). */
export function readCsv(text: string, fileName: string): RawWorkbook {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best, ';');
  const rows: (RawCell | null)[][] = [];
  let row: (RawCell | null)[] = [];
  let field = '';
  let quoted = false;
  const pushField = () => {
    const t = field.trim();
    if (!t) row.push(null);
    else if (/^-?\d+([.,]\d+)?$/.test(t) && !/^0\d/.test(t)) row.push({ v: Number(t.replace(',', '.')) });
    else row.push({ v: t });
    field = '';
  };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) pushField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      pushField();
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    pushField();
    rows.push(row);
  }
  return { fileName, sheets: [{ name: fileName.replace(/\.[^.]+$/, ''), rows }] };
}

export async function readWorkbook(buffer: Buffer, fileName: string): Promise<RawWorkbook> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const utf8 = buffer.toString('utf8');
    // Excel en Windows suele guardar CSV en Windows-1252.
    const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
    return readCsv(text, fileName);
  }
  if (lower.endsWith('.xls')) {
    throw new UserError(
      'Los ficheros .xls (formato antiguo de Excel) no se pueden leer directamente. Ábrelo en Excel y usa "Guardar como" → "Libro de Excel (.xlsx)".',
    );
  }
  // .xlsx y .xlsm son ZIP: comprobamos la firma para dar un error claro.
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new UserError('El fichero no parece un Excel .xlsx válido.');
  }
  return readXlsx(buffer, fileName);
}

export class UserError extends Error {
  status = 400;
}
