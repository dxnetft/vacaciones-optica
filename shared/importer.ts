/**
 * Analizador de Excel de vacaciones.
 *
 * Cada empresa tiene su propio Excel, así que en vez de exigir una plantilla se detectan
 * automáticamente los formatos más habituales:
 *
 *  1. Cuadrante (rejilla): una fila por persona y una columna por día. Los días pueden ser
 *     fechas reales o números 1..31 (con el mes en el nombre de la hoja o en un título encima).
 *     Puede haber una hoja por mes, varios meses apilados en una hoja o el año entero en horizontal.
 *     Las ausencias se marcan con letras (V, AP, B…) o pintando la celda de color.
 *  2. Cuadrante traspuesto: una fila por día y una columna por persona.
 *  3. Listado: una fila por periodo con columnas tipo Nombre / Desde / Hasta / Tipo.
 *
 * El resultado del análisis se revisa en el asistente de importación (qué significa cada
 * marca, qué personas incluir…) antes de extraer las ausencias definitivas.
 */
import type { AbsenceStatus, AbsenceType, ISODate, ImportedAbsence, RawCell, RawSheet, RawWorkbook } from './types.ts';
import {
  addDays,
  daysInMonth,
  diffDays,
  excelSerialToISO,
  findYearInText,
  isWorkingDay,
  makeISO,
  normalizeText,
  parseLooseDate,
  parseMonthName,
} from './dates.ts';
import type { DayRules } from './dates.ts';

export type MarkerTarget = AbsenceType | 'ignorar';

export interface Marker {
  key: string;
  kind: 'text' | 'fill' | 'list';
  label: string;
  color?: string;
  count: number;
  suggested: MarkerTarget;
}

export interface DayCol {
  col: number;
  date: ISODate;
}

export interface GridBlock {
  kind: 'grid';
  sheetIndex: number;
  sheet: string;
  transposed: boolean;
  headerRow: number;
  nameCol: number;
  storeCol?: number;
  dayCols: DayCol[];
  dataRows: number[];
  /** Relleno que ocupa casi toda una columna (fines de semana, festivos…): no es una marca. */
  shadedCols: Record<number, string>;
}

export interface ListBlock {
  kind: 'list';
  sheetIndex: number;
  sheet: string;
  headerRow: number;
  nameCol: number;
  startCol: number;
  endCol?: number;
  /** La columna de fin indica el día de vuelta al trabajo (se resta un día). */
  endIsReturn: boolean;
  typeCol?: number;
  storeCol?: number;
  statusCol?: number;
  noteCol?: number;
  dataRows: number[];
}

export type Block = GridBlock | ListBlock;

export interface DetectedEmployee {
  key: string;
  name: string;
  store?: string;
  /** Primera hoja en la que aparece (para usarla como tienda si las hojas son tiendas). */
  firstSheet: string;
  marks: number;
  include: boolean;
}

export interface Analysis {
  year: number;
  blocks: Block[];
  markers: Marker[];
  employees: DetectedEmployee[];
  warnings: string[];
  /** Sugerencia: las hojas parecen ser tiendas/centros y no meses. */
  sheetNamesLookLikeStores: boolean;
  dateRange?: [ISODate, ISODate];
}

export interface ExtractOptions {
  mapping: Record<string, MarkerTarget>;
  includeEmployees: Set<string>;
  sheetNamesAsStores: boolean;
  /** Si se indica, se ignoran las hojas que no estén en la lista. */
  sheets?: Set<number>;
  rules: DayRules;
}

/* ------------------------------------------------------------------ */
/* Utilidades de celdas                                                */
/* ------------------------------------------------------------------ */

export function employeeKey(name: string): string {
  return normalizeText(name).replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();
}

function cellText(cell: RawCell | null | undefined): string {
  if (!cell || cell.v === null || cell.v === undefined) return '';
  return String(cell.v).trim();
}

function isNameLike(text: string): boolean {
  if (text.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(text)) return false;
  if (parseLooseDate(text)) return false;
  return true;
}

const EXCLUDED_NAME = /^(total|totales|suma|leyenda|festivo|festivos|fin de semana|nota|notas|observaciones|mes|semana|dia|dias|nombre|empleado|empleados|trabajador|trabajadores|personal|equipo|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/;

function looksExcludedName(name: string): boolean {
  const n = normalizeText(name);
  if (EXCLUDED_NAME.test(n)) return true;
  if (parseMonthName(n) !== null) return true;
  if (/^(vacaciones|vacances|calendario|cuadrante)\b/.test(n)) return true;
  if (/^(tienda|centro|sede|botiga|departamento|seccion|local|oficina|optica)\b/.test(n)) return true;
  return false;
}

const WHITE_FILLS = new Set(['FFFFFFFF', 'FFFFFF', 'theme:0:0', 'theme:0']);

function isBackgroundFill(fill: string | undefined): boolean {
  return !fill || WHITE_FILLS.has(fill);
}

const TITLE_STOPWORDS = new Set([
  'de', 'del', 'mes', 'vacaciones', 'vacances', 'calendario', 'calendari', 'planning', 'planificacion',
  'cuadrante', 'ano', 'any', 'turnos', 'horario', 'festivos', 'y', 'i', 'el', 'la', 'month', 'plan',
]);

/** "JULIO 2026", "Vacaciones julio", "Juliol" → 6. "Julio Pérez" → null (es un nombre). */
export function monthFromTitle(text: string): number | null {
  const tokens = normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
  let month: number | null = null;
  for (const t of tokens) {
    if (/^\d+$/.test(t) || TITLE_STOPWORDS.has(t)) continue;
    const m = parseMonthName(t);
    if (m === null || month !== null) return null;
    month = m;
  }
  return month;
}

function transpose(sheet: RawSheet): RawSheet {
  const width = sheet.rows.reduce((w, r) => Math.max(w, r.length), 0);
  const rows: (RawCell | null)[][] = Array.from({ length: width }, () => []);
  sheet.rows.forEach((row, r) => row.forEach((cell, c) => (rows[c][r] = cell)));
  return { name: sheet.name, rows: rows.map((r) => Array.from(r, (c) => c ?? null)) };
}

const transposeCache = new WeakMap<RawSheet, RawSheet>();
function viewOf(wb: RawWorkbook, index: number, transposed: boolean): RawSheet {
  const sheet = wb.sheets[index];
  if (!transposed) return sheet;
  let t = transposeCache.get(sheet);
  if (!t) {
    t = transpose(sheet);
    transposeCache.set(sheet, t);
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* Detección de cabeceras de días                                     */
/* ------------------------------------------------------------------ */

interface DayCandidate {
  col: number;
  date?: ISODate;
  day?: number;
}

function dayCandidate(cell: RawCell | null, col: number): DayCandidate | null {
  if (!cell) return null;
  if (cell.d) return { col, date: cell.d };
  if (typeof cell.v === 'number') {
    if (Number.isInteger(cell.v) && cell.v >= 1 && cell.v <= 31) return { col, day: cell.v };
    if (Number.isInteger(cell.v) && cell.v >= 32874 && cell.v <= 73050) return { col, date: excelSerialToISO(cell.v) };
    return null;
  }
  const s = cellText(cell);
  if (!s) return null;
  // "1", "L 1", "Lun 1", "1 L", "1-L"
  const m = /^(?:[a-zA-ZáéíóúÁÉÍÓÚ]{1,3}\.?\s*)?(\d{1,2})(?:\s*[-/]?\s*[a-zA-ZáéíóúÁÉÍÓÚ]{1,3}\.?)?$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) return { col, day: d };
  }
  const iso = parseLooseDate(s);
  return iso ? { col, date: iso } : null;
}

const MAX_COL_GAP = 3;

/** Cadenas de celdas que forman una secuencia de días plausible dentro de una fila. */
function findDayChains(row: (RawCell | null)[]): DayCandidate[][] {
  const cands: DayCandidate[] = [];
  row.forEach((cell, c) => {
    const cand = dayCandidate(cell, c);
    if (cand) cands.push(cand);
  });
  const chains: DayCandidate[][] = [];
  let cur: DayCandidate[] = [];
  const valid = (a: DayCandidate, b: DayCandidate): boolean => {
    if (b.col - a.col > MAX_COL_GAP) return false;
    if (a.date && b.date) {
      const diff = diffDays(a.date, b.date);
      return diff >= 1 && diff <= 3;
    }
    if (a.day !== undefined && b.day !== undefined) {
      // +1 normalmente; hasta +3 si el cuadrante omite fines de semana; y vuelta a 1..3 al cambiar de mes.
      const diff = b.day - a.day;
      return (diff >= 1 && diff <= 3) || (b.day <= 3 && a.day >= 26);
    }
    return false;
  };
  for (const c of cands) {
    if (cur.length && valid(cur[cur.length - 1], c)) cur.push(c);
    else {
      if (cur.length >= 7) chains.push(cur);
      cur = [c];
    }
  }
  if (cur.length >= 7) chains.push(cur);
  return chains;
}

interface HeaderRow {
  row: number;
  chains: DayCandidate[][];
}

function findHeaderRows(sheet: RawSheet): HeaderRow[] {
  const out: HeaderRow[] = [];
  sheet.rows.forEach((row, r) => {
    const chains = findDayChains(row);
    if (chains.length) out.push({ row: r, chains });
  });
  return out;
}

/** Convierte cadenas de números de día en fechas, deduciendo mes y año del contexto. */
function resolveHeaderDates(
  sheet: RawSheet,
  header: HeaderRow,
  prevHeaderRow: number,
  fileName: string,
  fallbackYear: number,
  warnings: string[],
): DayCol[] {
  const out: DayCol[] = [];
  const rows = sheet.rows;
  const sheetMonth = monthFromTitle(sheet.name);
  const titleYear = (text: string) => findYearInText(text);

  // Año: cabecera, filas de encima, nombre de hoja, nombre de fichero.
  let explicitYear: number | null = null;
  for (let r = header.row; r >= Math.max(0, header.row - 3, prevHeaderRow + 1); r--) {
    for (const cell of rows[r] ?? []) {
      const t = cellText(cell);
      if (t && typeof cell?.v === 'string') explicitYear ??= titleYear(t);
      if (typeof cell?.v === 'number' && Number.isInteger(cell.v) && cell.v >= 1990 && cell.v <= 2100) explicitYear ??= cell.v;
      if (cell?.d && r < header.row) explicitYear ??= Number(cell.d.slice(0, 4));
    }
  }
  explicitYear ??= titleYear(sheet.name) ?? titleYear(fileName);
  let year = explicitYear ?? fallbackYear;

  // Segmentos: cada vez que el día vuelve a empezar, cambia el mes.
  const segments: DayCandidate[][] = [];
  for (const chain of header.chains) {
    if (chain[0].date) {
      for (const c of chain) out.push({ col: c.col, date: c.date! });
      continue;
    }
    let seg: DayCandidate[] = [];
    for (const c of chain) {
      if (seg.length && c.day! <= seg[seg.length - 1].day!) {
        segments.push(seg);
        seg = [];
      }
      seg.push(c);
    }
    if (seg.length) segments.push(seg);
  }
  if (!segments.length) return out;

  const monthForSegment = (seg: DayCandidate[], isFirst: boolean): number | null => {
    const from = seg[0].col;
    const to = seg[seg.length - 1].col;
    for (let r = header.row; r >= Math.max(0, header.row - 3, prevHeaderRow + 1); r--) {
      const row = rows[r] ?? [];
      const lo = isFirst ? 0 : Math.max(0, from - 2);
      for (let c = lo; c <= Math.min(to, row.length - 1); c++) {
        const cell = row[c];
        if (r === header.row && c >= from) break;
        if (cell?.d && r < header.row) return Number(cell.d.slice(5, 7)) - 1;
        const t = cellText(cell);
        if (t && typeof cell?.v === 'string') {
          const m = monthFromTitle(t);
          if (m !== null) return m;
        }
      }
    }
    return null;
  };

  const months: (number | null)[] = segments.map((seg, i) => monthForSegment(seg, i === 0));
  if (months[0] === null && sheetMonth !== null) months[0] = sheetMonth;
  // Rellenar huecos hacia delante y hacia atrás.
  for (let i = 1; i < months.length; i++) if (months[i] === null && months[i - 1] !== null) months[i] = (months[i - 1]! + 1) % 12;
  for (let i = months.length - 2; i >= 0; i--) if (months[i] === null && months[i + 1] !== null) months[i] = (months[i + 1]! + 11) % 12;
  if (months[0] === null) {
    // Sin pistas: si hay 12 segmentos es un año completo empezando en enero.
    if (segments.length > 1) warnings.push(`Hoja "${sheet.name}": no se indica el mes, se asume que empieza en enero.`);
    else warnings.push(`Hoja "${sheet.name}": no se encuentra el mes de los días (fila ${header.row + 1}). Revisa el resultado.`);
    for (let i = 0; i < months.length; i++) months[i] = i % 12;
  }

  let prevMonth = -1;
  segments.forEach((seg, i) => {
    const month = months[i]!;
    if (prevMonth !== -1 && month < prevMonth) year += 1;
    prevMonth = month;
    for (const c of seg) {
      if (c.day! <= daysInMonth(year, month)) out.push({ col: c.col, date: makeISO(year, month, c.day!) });
    }
  });
  return out;
}

const STORE_HEADER = /(tienda|centro|sede|local|departamento|seccion|botiga|establecimiento|delegacion|oficina)/;

function detectGrids(
  wb: RawWorkbook,
  sheetIndex: number,
  transposed: boolean,
  fallbackYear: number,
  warnings: string[],
): GridBlock[] {
  const sheet = viewOf(wb, sheetIndex, transposed);
  const headers = findHeaderRows(sheet);
  const blocks: GridBlock[] = [];
  const localWarnings: string[] = [];
  headers.forEach((h, i) => {
    const prevRow = i > 0 ? headers[i - 1].row : -1;
    const nextRow = i + 1 < headers.length ? headers[i + 1].row : sheet.rows.length;
    const dayCols = resolveHeaderDates(sheet, h, prevRow, wb.fileName, fallbackYear, localWarnings);
    if (dayCols.length < 7) return;
    const firstCol = Math.min(...dayCols.map((d) => d.col));
    const lastCol = Math.max(...dayCols.map((d) => d.col));
    const rowRange: number[] = [];
    for (let r = h.row + 1; r < nextRow; r++) rowRange.push(r);

    // Columna de nombres: la que más textos distintos tiene a la izquierda (o derecha) de los días.
    const scoreCol = (c: number) => {
      const seen = new Set<string>();
      for (const r of rowRange) {
        const t = cellText(sheet.rows[r]?.[c]);
        if (isNameLike(t)) seen.add(t);
      }
      return seen.size;
    };
    let nameCol = -1;
    let best = 0;
    for (let c = 0; c < firstCol; c++) {
      const s = scoreCol(c);
      if (s > best || (s === best && s > 0 && nameCol >= 0 && headerHasName(sheet, h.row, c))) {
        best = s;
        nameCol = c;
      }
    }
    if (nameCol < 0) {
      const width = sheet.rows.reduce((w, r) => Math.max(w, r.length), 0);
      for (let c = lastCol + 1; c < Math.min(width, lastCol + 4); c++) {
        const s = scoreCol(c);
        if (s > best) {
          best = s;
          nameCol = c;
        }
      }
    }
    if (nameCol < 0) return;

    let storeCol: number | undefined;
    for (let c = 0; c < firstCol; c++) {
      if (c === nameCol) continue;
      const head = [h.row, h.row - 1].map((r) => normalizeText(cellText(sheet.rows[r]?.[c]))).join(' ');
      if (STORE_HEADER.test(head)) storeCol = c;
    }

    const dataRows = rowRange.filter((r) => {
      const name = cellText(sheet.rows[r]?.[nameCol]);
      return isNameLike(name) && typeof sheet.rows[r]?.[nameCol]?.v === 'string';
    });
    if (!dataRows.length) return;

    const shadedCols: Record<number, string> = {};
    const threshold = Math.max(3, Math.ceil(dataRows.length * 0.6));
    for (const { col } of dayCols) {
      const counts = new Map<string, number>();
      for (const r of dataRows) {
        const f = sheet.rows[r]?.[col]?.fill;
        if (f && !isBackgroundFill(f)) counts.set(f, (counts.get(f) ?? 0) + 1);
      }
      for (const [f, n] of counts) if (n >= threshold && dataRows.length >= 3) shadedCols[col] = f;
    }

    blocks.push({
      kind: 'grid',
      sheetIndex,
      sheet: wb.sheets[sheetIndex].name,
      transposed,
      headerRow: h.row,
      nameCol,
      storeCol,
      dayCols,
      dataRows,
      shadedCols,
    });
  });
  if (blocks.length) warnings.push(...localWarnings);
  return blocks;
}

function headerHasName(sheet: RawSheet, headerRow: number, col: number): boolean {
  const t = normalizeText(cellText(sheet.rows[headerRow]?.[col]));
  return /(nombre|emplead|trabajador|persona|nom)/.test(t);
}

/* ------------------------------------------------------------------ */
/* Detección de listados                                               */
/* ------------------------------------------------------------------ */

const LIST_HEADERS = {
  name: /(nombre|emplead|trabajador|treballador|persona|colaborador|apellidos|^nom$)/,
  start: /(inicio|inici|desde|comienzo|salida|primer dia|^del?$|^from$|^start)/,
  end: /(fin\b|final|hasta|regreso|vuelta|reincorporacion|incorporacion|ultimo dia|^al$|^fins$|^to$|^end)/,
  single: /^(fecha|dia|date|data)$/,
  ret: /(regreso|vuelta|reincorporacion|incorporacion)/,
  type: /(tipo|motivo|concepto|ausencia|clase)/,
  store: STORE_HEADER,
  status: /(estado|aprobad|autoriz)/,
  note: /(observ|nota|coment)/,
};

function detectList(wb: RawWorkbook, sheetIndex: number, fallbackYear: number): ListBlock | null {
  const sheet = wb.sheets[sheetIndex];
  const limit = Math.min(sheet.rows.length, 30);
  for (let r = 0; r < limit; r++) {
    const row = sheet.rows[r] ?? [];
    const found: Partial<Record<keyof typeof LIST_HEADERS, number>> = {};
    row.forEach((cell, c) => {
      if (typeof cell?.v !== 'string') return;
      const t = normalizeText(cell.v);
      if (!t || t.length > 40) return;
      if (found.name === undefined && LIST_HEADERS.name.test(t)) found.name = c;
      else if (found.start === undefined && LIST_HEADERS.start.test(t)) found.start = c;
      else if (found.end === undefined && LIST_HEADERS.end.test(t)) {
        found.end = c;
        if (LIST_HEADERS.ret.test(t)) found.ret = c;
      } else if (found.single === undefined && LIST_HEADERS.single.test(t)) found.single = c;
      else if (found.type === undefined && LIST_HEADERS.type.test(t)) found.type = c;
      else if (found.store === undefined && LIST_HEADERS.store.test(t)) found.store = c;
      else if (found.status === undefined && LIST_HEADERS.status.test(t)) found.status = c;
      else if (found.note === undefined && LIST_HEADERS.note.test(t)) found.note = c;
    });
    const startCol = found.start ?? found.single;
    if (found.name === undefined || startCol === undefined) continue;
    const endCol = found.start !== undefined ? found.end : found.single;
    const dataRows: number[] = [];
    for (let rr = r + 1; rr < sheet.rows.length; rr++) {
      const cells = sheet.rows[rr] ?? [];
      if (isNameLike(cellText(cells[found.name])) && cellDate(cells[startCol], fallbackYear)) dataRows.push(rr);
    }
    if (!dataRows.length) continue;
    return {
      kind: 'list',
      sheetIndex,
      sheet: sheet.name,
      headerRow: r,
      nameCol: found.name,
      startCol,
      endCol,
      endIsReturn: found.ret !== undefined,
      typeCol: found.type,
      storeCol: found.store,
      statusCol: found.status,
      noteCol: found.note,
      dataRows,
    };
  }
  return null;
}

function cellDate(cell: RawCell | null | undefined, fallbackYear: number): ISODate | null {
  if (!cell) return null;
  if (cell.d) return cell.d;
  if (typeof cell.v === 'number' && cell.v >= 32874 && cell.v <= 73050) return excelSerialToISO(Math.floor(cell.v));
  if (typeof cell.v === 'string') return parseLooseDate(cell.v, fallbackYear);
  return null;
}

/* ------------------------------------------------------------------ */
/* Marcas                                                              */
/* ------------------------------------------------------------------ */

export function suggestForText(text: string): MarkerTarget | null {
  const t = normalizeText(text).replace(/[.\s]/g, '');
  if (!t) return null;
  if (/^(v|vac|vacacion|vacaciones|vacances|x|1|si|ok|✓|✔|vc|vv)$/.test(t)) return 'vacaciones';
  if (/^(ap|asuntospropios|asuntoproprio|asuntos|propios|ld|libredisposicion|personal|dp|diapersonal|p)$/.test(t)) return 'asuntos_propios';
  if (/^(b|baja|it|ilt|enf|enfermedad|bm|maternidad|paternidad|mat|pat)$/.test(t)) return 'baja';
  if (/^(f|form|formacion|curso|c|fo)$/.test(t)) return 'formacion';
  if (/^(l|libre|descanso|d|fiesta|compensa|comp|lib)$/.test(t)) return 'otro';
  if (/^(fest|festivo|0|-|no|n)$/.test(t)) return 'ignorar';
  if (t.startsWith('vacac')) return 'vacaciones';
  if (t.startsWith('asunto')) return 'asuntos_propios';
  if (t.startsWith('baja')) return 'baja';
  if (t.startsWith('forma')) return 'formacion';
  return null;
}

function statusFromText(text: string): AbsenceStatus {
  const t = normalizeText(text);
  if (/(pendiente|solicitad|provisional|sin aprobar)/.test(t)) return 'pendiente';
  if (/(rechaz|denegad|anulad|cancelad)/.test(t)) return 'rechazada';
  return 'aprobada';
}

function markerKeyForGridCell(cell: RawCell | null | undefined, shaded: string | undefined): string | null {
  const t = cellText(cell);
  if (t) return `t:${t.toUpperCase()}`;
  const fill = cell?.fill;
  if (fill && !isBackgroundFill(fill) && fill !== shaded) return `f:${fill}`;
  return null;
}

function markerKeyForListRow(cells: (RawCell | null)[], block: ListBlock): string {
  if (block.typeCol === undefined) return 'list:none';
  const t = cellText(cells[block.typeCol]);
  return t ? `t:${t.toUpperCase()}` : 'list:none';
}

/* ------------------------------------------------------------------ */
/* API principal                                                       */
/* ------------------------------------------------------------------ */

export function analyzeWorkbook(wb: RawWorkbook, opts: { year?: number } = {}): Analysis {
  const fallbackYear = opts.year ?? findYearInText(wb.fileName) ?? new Date().getFullYear();
  const warnings: string[] = [];
  const blocks: Block[] = [];

  wb.sheets.forEach((sheet, i) => {
    if (!sheet.rows.length) return;
    const list = detectList(wb, i, fallbackYear);
    if (list) {
      blocks.push(list);
      return;
    }
    const grids = detectGrids(wb, i, false, fallbackYear, warnings);
    if (grids.length) {
      blocks.push(...grids);
      return;
    }
    const tgrids = detectGrids(wb, i, true, fallbackYear, warnings);
    if (tgrids.length) blocks.push(...tgrids);
  });

  const markers = new Map<string, Marker>();
  const employees = new Map<string, DetectedEmployee>();
  let minDate: ISODate | undefined;
  let maxDate: ISODate | undefined;
  const touch = (d: ISODate) => {
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  };

  const addMarker = (key: string, cell: RawCell | null | undefined) => {
    let m = markers.get(key);
    if (!m) {
      if (key === 'list:none') m = { key, kind: 'list', label: 'Filas sin tipo indicado', count: 0, suggested: 'vacaciones' };
      else if (key.startsWith('t:')) {
        const text = key.slice(2);
        m = { key, kind: 'text', label: text, count: 0, suggested: suggestForText(text) ?? 'vacaciones' };
      } else m = { key, kind: 'fill', label: 'Celda coloreada', color: cell?.color, count: 0, suggested: 'vacaciones' };
      markers.set(key, m);
    }
    m.count++;
  };

  const addEmployee = (name: string, store: string | undefined, marks: number, sheet: string) => {
    const key = employeeKey(name);
    if (!key) return;
    const e = employees.get(key);
    if (e) {
      e.marks += marks;
      e.store ??= store;
    } else {
      const clean = name.replace(/\s+/g, ' ').trim();
      employees.set(key, { key, name: clean, store, firstSheet: sheet, marks, include: !looksExcludedName(clean) });
    }
  };

  for (const b of blocks) {
    const sheet = viewOf(wb, b.sheetIndex, b.kind === 'grid' && b.transposed);
    if (b.kind === 'grid') {
      for (const d of b.dayCols) touch(d.date);
      for (const r of b.dataRows) {
        const row = sheet.rows[r] ?? [];
        let marks = 0;
        for (const d of b.dayCols) {
          const key = markerKeyForGridCell(row[d.col], b.shadedCols[d.col]);
          if (key) {
            addMarker(key, row[d.col]);
            marks++;
          }
        }
        const store = b.storeCol !== undefined ? cellText(row[b.storeCol]) || undefined : undefined;
        addEmployee(cellText(row[b.nameCol]), store, marks, b.sheet);
      }
    } else {
      for (const r of b.dataRows) {
        const row = sheet.rows[r] ?? [];
        addMarker(markerKeyForListRow(row, b), null);
        const s = cellDate(row[b.startCol], fallbackYear);
        if (s) touch(s);
        const store = b.storeCol !== undefined ? cellText(row[b.storeCol]) || undefined : undefined;
        addEmployee(cellText(row[b.nameCol]), store, 1, b.sheet);
      }
    }
  }

  // El color más usado casi siempre significa "vacaciones"; el resto se deja como "otro".
  const fills = [...markers.values()].filter((m) => m.kind === 'fill').sort((a, b) => b.count - a.count);
  fills.forEach((m, i) => (m.suggested = i === 0 ? 'vacaciones' : 'otro'));

  const gridSheets = new Set(blocks.filter((b) => b.kind === 'grid').map((b) => b.sheetIndex));
  const sheetNamesLookLikeStores =
    gridSheets.size > 1 &&
    [...gridSheets].every((i) => monthFromTitle(wb.sheets[i].name) === null && !/^(hoja|sheet|full)\s*\d*$/i.test(wb.sheets[i].name.trim())) &&
    !blocks.some((b) => b.kind === 'grid' && b.storeCol !== undefined);

  if (!blocks.length) {
    warnings.push(
      'No se ha reconocido ningún cuadrante ni listado. Asegúrate de que haya una fila con los días (1, 2, 3… o fechas) y una columna con los nombres, o columnas "Nombre", "Desde" y "Hasta".',
    );
  }

  return {
    year: fallbackYear,
    blocks,
    markers: [...markers.values()].sort((a, b) => b.count - a.count),
    employees: [...employees.values()],
    warnings,
    sheetNamesLookLikeStores,
    dateRange: minDate && maxDate ? [minDate, maxDate] : undefined,
  };
}

interface DayMark {
  date: ISODate;
  type: AbsenceType;
}

/** Une días sueltos consecutivos (o separados solo por fines de semana/festivos) en periodos. */
export function mergeDays(marks: DayMark[], rules: DayRules): { start: ISODate; end: ISODate; type: AbsenceType }[] {
  const byType = new Map<AbsenceType, ISODate[]>();
  for (const m of marks) {
    const list = byType.get(m.type) ?? [];
    list.push(m.date);
    byType.set(m.type, list);
  }
  const out: { start: ISODate; end: ISODate; type: AbsenceType }[] = [];
  for (const [type, dates] of byType) {
    const sorted = [...new Set(dates)].sort();
    let start = sorted[0];
    let end = sorted[0];
    for (const d of sorted.slice(1)) {
      const gap = diffDays(end, d);
      let bridge = gap === 1;
      if (!bridge && gap <= 5) {
        bridge = true;
        for (let x = addDays(end, 1); x < d; x = addDays(x, 1)) {
          if (isWorkingDay(x, rules)) {
            bridge = false;
            break;
          }
        }
      }
      if (bridge) end = d;
      else {
        out.push({ start, end, type });
        start = end = d;
      }
    }
    if (start) out.push({ start, end, type });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function extractAbsences(wb: RawWorkbook, analysis: Analysis, opts: ExtractOptions): ImportedAbsence[] {
  const gridMarks = new Map<string, DayMark[]>();
  const names = new Map(analysis.employees.map((e) => [e.key, e]));
  const result: ImportedAbsence[] = [];
  const seen = new Set<string>();

  for (const b of analysis.blocks) {
    if (opts.sheets && !opts.sheets.has(b.sheetIndex)) continue;
    const sheet = viewOf(wb, b.sheetIndex, b.kind === 'grid' && b.transposed);
    for (const r of b.dataRows) {
      const row = sheet.rows[r] ?? [];
      const key = employeeKey(cellText(row[b.nameCol]));
      if (!opts.includeEmployees.has(key)) continue;
      if (b.kind === 'grid') {
        for (const d of b.dayCols) {
          const mk = markerKeyForGridCell(row[d.col], b.shadedCols[d.col]);
          if (!mk) continue;
          const target = opts.mapping[mk] ?? 'ignorar';
          if (target === 'ignorar') continue;
          const list = gridMarks.get(key) ?? [];
          list.push({ date: d.date, type: target });
          gridMarks.set(key, list);
        }
      } else {
        const target = opts.mapping[markerKeyForListRow(row, b)] ?? 'ignorar';
        if (target === 'ignorar') continue;
        const start = cellDate(row[b.startCol], analysis.year);
        if (!start) continue;
        let end = (b.endCol !== undefined ? cellDate(row[b.endCol], Number(start.slice(0, 4))) : null) ?? start;
        if (b.endIsReturn && end > start) end = addDays(end, -1);
        if (end < start) end = start;
        const status = b.statusCol !== undefined ? statusFromText(cellText(row[b.statusCol])) : 'aprobada';
        const note = b.noteCol !== undefined ? cellText(row[b.noteCol]) || undefined : undefined;
        const sig = `${key}|${start}|${end}|${target}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        result.push({ employeeName: names.get(key)?.name ?? cellText(row[b.nameCol]), start, end, type: target, status, note });
      }
    }
  }

  for (const [key, marks] of gridMarks) {
    for (const p of mergeDays(marks, opts.rules)) {
      const sig = `${key}|${p.start}|${p.end}|${p.type}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      result.push({ employeeName: names.get(key)?.name ?? key, ...p, status: 'aprobada' });
    }
  }

  const stores = employeeStores(analysis, opts.sheetNamesAsStores);
  for (const a of result) a.store = stores.get(employeeKey(a.employeeName));
  return result.sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'es') || a.start.localeCompare(b.start));
}

/** Tienda asignada a cada persona detectada (columna de tienda o, si se elige, nombre de la hoja). */
export function employeeStores(analysis: Analysis, sheetNamesAsStores: boolean): Map<string, string | undefined> {
  return new Map(analysis.employees.map((e) => [e.key, e.store ?? (sheetNamesAsStores ? e.firstSheet : undefined)]));
}
