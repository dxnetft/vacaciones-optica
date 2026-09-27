import type { Holiday, ISODate, Settings } from './types.ts';

// Todas las operaciones usan UTC para no depender de la zona horaria del equipo.

const DAY_MS = 86_400_000;

export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function toDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function makeISO(year: number, month0: number, day: number): ISODate {
  return toISO(new Date(Date.UTC(year, month0, day)));
}

export function isValidISO(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(toDate(s)) === s;
}

export function todayISO(): ISODate {
  const now = new Date();
  return makeISO(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISO(new Date(toDate(iso).getTime() + n * DAY_MS));
}

/** Días entre `a` y `b` (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = domingo … 6 = sábado */
export function weekday(iso: ISODate): number {
  return toDate(iso).getUTCDay();
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function monthDays(year: number, month0: number): ISODate[] {
  const n = daysInMonth(year, month0);
  return Array.from({ length: n }, (_, i) => makeISO(year, month0, i + 1));
}

export function overlaps(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function clampRange(start: ISODate, end: ISODate, min: ISODate, max: ISODate): [ISODate, ISODate] | null {
  const s = start < min ? min : start;
  const e = end > max ? max : end;
  return s <= e ? [s, e] : null;
}

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeISO(year, month - 1, day);
}

/** Festivos nacionales comunes en toda España. Los autonómicos y locales se añaden a mano. */
export function spanishNationalHolidays(year: number): Holiday[] {
  const f = (m: number, d: number, name: string): Holiday => ({ date: makeISO(year, m - 1, d), name });
  return [
    f(1, 1, 'Año Nuevo'),
    f(1, 6, 'Epifanía del Señor'),
    { date: addDays(easterSunday(year), -2), name: 'Viernes Santo' },
    f(5, 1, 'Fiesta del Trabajo'),
    f(8, 15, 'Asunción de la Virgen'),
    f(10, 12, 'Fiesta Nacional de España'),
    f(11, 1, 'Todos los Santos'),
    f(12, 6, 'Día de la Constitución'),
    f(12, 8, 'Inmaculada Concepción'),
    f(12, 25, 'Navidad'),
  ];
}

export interface DayRules {
  workingWeekdays: number[];
  holidays: Set<ISODate>;
}

export function dayRules(settings: Pick<Settings, 'workingWeekdays' | 'holidays'>): DayRules {
  return {
    workingWeekdays: settings.workingWeekdays,
    holidays: new Set(settings.holidays.map((h) => h.date)),
  };
}

export function isWorkingDay(iso: ISODate, rules: DayRules): boolean {
  return rules.workingWeekdays.includes(weekday(iso)) && !rules.holidays.has(iso);
}

/** Días que consume un periodo según el modo de cómputo. */
export function countDays(
  start: ISODate,
  end: ISODate,
  mode: Settings['countMode'],
  rules: DayRules,
): number {
  if (end < start) return 0;
  if (mode === 'naturales') return diffDays(start, end) + 1;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(d, rules)) n++;
  return n;
}

/** Fecha de Excel (número de serie, sistema 1900) a ISO. */
export function excelSerialToISO(serial: number): ISODate {
  // 25569 = 1970-01-01. Excel considera erróneamente 1900 bisiesto, por eso la base funciona desde marzo de 1900.
  return toISO(new Date(Math.round((serial - 25569) * DAY_MS)));
}

const MONTH_ALIASES: [RegExp, number][] = [
  [/^(enero|ene|gener|gen|january|jan)\.?$/, 0],
  [/^(febrero|feb|febrer|february)\.?$/, 1],
  [/^(marzo|mar|marc|march)\.?$/, 2],
  [/^(abril|abr|april|apr)\.?$/, 3],
  [/^(mayo|may|maig|mai)\.?$/, 4],
  [/^(junio|jun|juny|june)\.?$/, 5],
  [/^(julio|jul|juliol|july)\.?$/, 6],
  [/^(agosto|ago|agost|august|aug)\.?$/, 7],
  [/^(septiembre|setiembre|sep|sept|set|setembre|september)\.?$/, 8],
  [/^(octubre|oct|october)\.?$/, 9],
  [/^(noviembre|nov|novembre|november)\.?$/, 10],
  [/^(diciembre|dic|desembre|des|december|dec)\.?$/, 11],
];

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve el mes (0-11) si el texto es exactamente un nombre de mes. */
export function parseMonthName(text: string): number | null {
  const t = normalizeText(text).replace(/ç/g, 'c');
  for (const [re, m] of MONTH_ALIASES) if (re.test(t)) return m;
  return null;
}

/** Busca un nombre de mes dentro de un texto más largo ("VACACIONES JULIO 2026"). Solo nombres completos. */
export function findMonthInText(text: string): number | null {
  const words = normalizeText(text).replace(/ç/g, 'c').split(/[^a-z]+/).filter((w) => w.length >= 4 || w === 'mayo' || w === 'maig');
  for (const w of words) {
    const m = parseMonthName(w);
    if (m !== null) return m;
  }
  return null;
}

export function findYearInText(text: string): number | null {
  const m = /(?:^|\D)(20\d{2}|19\d{2})(?:\D|$)/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * Interpreta fechas escritas como texto en formato español: 3/7/2026, 03-07-26, 2026-07-03,
 * "3 de julio de 2026" o "3 jul 2026".
 */
export function parseLooseDate(input: string, fallbackYear?: number): ISODate | null {
  const s = input.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return safeISO(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return safeISO(y, +m[2] - 1, +m[1]);
  }
  m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m && fallbackYear) return safeISO(fallbackYear, +m[2] - 1, +m[1]);
  const t = normalizeText(s).replace(/,/g, ' ');
  m = /^(?:[a-z]+\s+)?(\d{1,2})(?:\s+de|\s*-)?\s+([a-z]+)\.?(?:\s+de|\s*-)?\s*(\d{4})?$/.exec(t);
  if (m) {
    const month = parseMonthName(m[2]);
    const year = m[3] ? +m[3] : fallbackYear;
    if (month !== null && year) return safeISO(year, month, +m[1]);
  }
  return null;
}

function safeISO(y: number, m0: number, d: number): ISODate | null {
  if (y < 1990 || y > 2100 || m0 < 0 || m0 > 11 || d < 1 || d > daysInMonth(y, m0)) return null;
  return makeISO(y, m0, d);
}

export function formatDate(iso: ISODate, opts: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const d = toDate(iso);
  const parts = [`${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()].slice(0, 3).toLowerCase()}`];
  if (opts.withYear) parts.push(String(d.getUTCFullYear()));
  const base = parts.join(' ');
  return opts.withWeekday ? `${WEEKDAYS_ES[d.getUTCDay()].slice(0, 3)} ${base}` : base;
}

export function formatRange(start: ISODate, end: ISODate): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  if (start === end) return formatDate(start, { withYear: true });
  return `${formatDate(start, { withYear: !sameYear })} – ${formatDate(end, { withYear: true })}`;
}
