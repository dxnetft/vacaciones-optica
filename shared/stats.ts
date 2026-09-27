import { ABSENCE_TYPES } from './types.ts';
import type { Absence, DataState, Employee, ISODate, Store } from './types.ts';
import { addDays, clampRange, dayRules, diffDays, isWorkingDay, overlaps, weekday } from './dates.ts';
import type { DayRules } from './dates.ts';
import { coversAfternoon, coversMorning, hasSchedule, onlySaturdays, workOn } from './schedule.ts';
import type { WorkDay } from './schedule.ts';

/**
 * Días que consume un periodo para una persona. En modo laborable solo cuentan los días que
 * le toca trabajar según su horario (o los días laborables generales si no tiene horario).
 */
export function countDaysFor(
  emp: Pick<Employee, 'schedule'>,
  start: ISODate,
  end: ISODate,
  mode: DataState['settings']['countMode'],
  rules: DayRules,
): number {
  if (end < start) return 0;
  if (mode === 'naturales') return diffDays(start, end) + 1;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (workOn(emp, d, rules)) n++;
  return n;
}

/** Sábados que le tocaba trabajar dentro del periodo, agrupados por año. */
export function workedSaturdays(emp: Pick<Employee, 'schedule'>, start: ISODate, end: ISODate, rules: DayRules): Map<number, number> {
  const out = new Map<number, number>();
  if (end < start) return out;
  // Avanza hasta el primer sábado y luego de semana en semana.
  let d = addDays(start, (6 - weekday(start) + 7) % 7);
  for (; d <= end; d = addDays(d, 7)) {
    if (!workOn(emp, d, rules)) continue;
    const y = Number(d.slice(0, 4));
    out.set(y, (out.get(y) ?? 0) + 1);
  }
  return out;
}

/**
 * Máximo de sábados de vacaciones al año para una persona (0 = sin límite). Solo tiene sentido
 * contando días laborables, y no se aplica a quien solo trabaja los sábados.
 */
export function saturdayLimit(emp: Pick<Employee, 'schedule'>, settings: DataState['settings'], rules: DayRules): number {
  if (settings.countMode !== 'laborables' || onlySaturdays(emp, rules)) return 0;
  return settings.maxVacationSaturdays ?? 0;
}

export interface Balance {
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  /** Días de otras ausencias (no descuentan saldo), para información. */
  otherDays: number;
  /** Sábados de vacaciones aprobados y pendientes. */
  saturdaysUsed: number;
  saturdaysPending: number;
  /** Máximo de sábados de vacaciones al año. 0 = sin límite. */
  maxSaturdays: number;
}

/** Días de vacaciones al año: los de la persona, los de su horario fijo o el valor general. */
export function allowanceFor(emp: Pick<Employee, 'annualDays' | 'schedule'>, state: Pick<DataState, 'settings'>): number {
  if (emp.annualDays !== null && emp.annualDays !== undefined) return emp.annualDays;
  const s = emp.schedule;
  const g = s?.kind === 'fijo' ? state.settings.scheduleGroups?.find((x) => x.id === s.groupId) : undefined;
  return g?.annualDays ?? state.settings.defaultAnnualDays;
}

export function balanceFor(emp: Employee, year: number, state: DataState, rules = dayRules(state.settings)): Balance {
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  let used = 0;
  let pending = 0;
  let otherDays = 0;
  let saturdaysUsed = 0;
  let saturdaysPending = 0;
  for (const a of state.absences) {
    if (a.employeeId !== emp.id || a.status === 'rechazada') continue;
    const r = clampRange(a.start, a.end, yStart, yEnd);
    if (!r) continue;
    const n = countDaysFor(emp, r[0], r[1], state.settings.countMode, rules);
    if (!ABSENCE_TYPES[a.type].countsAgainstBalance) {
      if (a.status === 'aprobada') otherDays += n;
      continue;
    }
    const sats = workedSaturdays(emp, r[0], r[1], rules).get(year) ?? 0;
    if (a.status === 'aprobada') {
      used += n;
      saturdaysUsed += sats;
    } else {
      pending += n;
      saturdaysPending += sats;
    }
  }
  const allowance = allowanceFor(emp, state);
  return {
    allowance,
    used,
    pending,
    remaining: allowance - used - pending,
    otherDays,
    saturdaysUsed,
    saturdaysPending,
    maxSaturdays: saturdayLimit(emp, state.settings, rules),
  };
}

/** Índice rápido: empleado -> ausencias (no rechazadas) ordenadas por inicio. */
export function absencesByEmployee(absences: Absence[]): Map<string, Absence[]> {
  const map = new Map<string, Absence[]>();
  for (const a of absences) {
    if (a.status === 'rechazada') continue;
    const list = map.get(a.employeeId) ?? [];
    list.push(a);
    map.set(a.employeeId, list);
  }
  for (const list of map.values()) list.sort((x, y) => x.start.localeCompare(y.start));
  return map;
}

export function absenceOn(list: Absence[] | undefined, day: ISODate): Absence | undefined {
  if (!list) return undefined;
  // Las aprobadas tienen prioridad sobre las pendientes al pintar.
  let found: Absence | undefined;
  for (const a of list) {
    if (a.start > day) break;
    if (a.end >= day) {
      if (a.status === 'aprobada') return a;
      found ??= a;
    }
  }
  return found;
}

export interface DayCoverage {
  day: ISODate;
  working: boolean;
  /** Personas a las que les toca trabajar ese día (estén o no de vacaciones). */
  total: number;
  absent: number;
  present: number;
  /** Presentes de mañana y de tarde (quien hace partido cuenta en los dos). */
  morning: number;
  afternoon: number;
  /** Si alguien de la tienda tiene turnos: el mínimo se comprueba por turno. */
  byShift: boolean;
  minStaff: number;
  /** Por debajo del mínimo contando solo aprobadas. */
  breach: boolean;
  /** Por debajo del mínimo si se aprobaran también las pendientes. */
  breachIfPending: boolean;
  absentNames: string[];
}

export function storeEmployees(state: DataState, storeId: string | null): Employee[] {
  return state.employees.filter((e) => e.active && e.storeId === storeId);
}

export function coverageFor(
  state: DataState,
  storeId: string | null,
  days: ISODate[],
  rules: DayRules = dayRules(state.settings),
  extra?: Pick<Absence, 'employeeId' | 'start' | 'end'>,
): DayCoverage[] {
  const store: Store | undefined = state.stores.find((s) => s.id === storeId);
  const emps = storeEmployees(state, storeId);
  const ids = new Set(emps.map((e) => e.id));
  const names = new Map(emps.map((e) => [e.id, e.name]));
  const first = days[0];
  const last = days[days.length - 1];
  const relevant = state.absences.filter(
    (a) => ids.has(a.employeeId) && a.status !== 'rechazada' && first && overlaps(a.start, a.end, first, last),
  );
  const minStaff = store?.minStaff ?? 0;
  const byShift = emps.some((e) => hasSchedule(e, rules));
  return days.map((day) => {
    const approved = new Set<string>();
    const any = new Set<string>();
    for (const a of relevant) {
      if (a.start <= day && a.end >= day) {
        any.add(a.employeeId);
        if (a.status === 'aprobada') approved.add(a.employeeId);
      }
    }
    if (extra && ids.has(extra.employeeId) && extra.start <= day && extra.end >= day) {
      any.add(extra.employeeId);
      approved.add(extra.employeeId);
    }
    const working = isWorkingDay(day, rules);
    let total = 0;
    let absent = 0;
    const count = (out: Set<string>) => {
      let m = 0;
      let t = 0;
      for (const e of emps) {
        const w: WorkDay = workOn(e, day, rules);
        if (!w || out.has(e.id)) continue;
        if (coversMorning(w)) m++;
        if (coversAfternoon(w)) t++;
      }
      return [m, t] as const;
    };
    for (const e of emps) {
      if (!workOn(e, day, rules)) continue;
      total++;
      if (approved.has(e.id)) absent++;
    }
    const [morning, afternoon] = count(approved);
    const [morningP, afternoonP] = count(any);
    const short = (m: number, t: number) => working && minStaff > 0 && (m < minStaff || t < minStaff);
    return {
      day,
      working,
      total,
      absent,
      present: total - absent,
      morning,
      afternoon,
      byShift,
      minStaff,
      breach: short(morning, afternoon),
      breachIfPending: short(morningP, afternoonP),
      absentNames: [...any].map((id) => names.get(id) ?? '?'),
    };
  });
}

export interface RequestCheck {
  days: number;
  /** Sábados de vacaciones que gasta la solicitud. */
  saturdays: number;
  /** Años en los que se pasaría del máximo de sábados de vacaciones, con el total resultante. */
  saturdaysOver: { year: number; total: number; max: number }[];
  overlapsOwn: Absence[];
  colleaguesOff: { employee: Employee; absence: Absence }[];
  breachDays: ISODate[];
}

/** Comprueba una solicitud: días que consume, compañeros ausentes y días sin cobertura mínima. */
export function checkRequest(
  state: DataState,
  req: { employeeId: string; start: ISODate; end: ISODate; ignoreId?: string; type?: Absence['type'] },
): RequestCheck {
  const rules = dayRules(state.settings);
  const emp = state.employees.find((e) => e.id === req.employeeId);
  const others = state.absences.filter((a) => a.id !== req.ignoreId && a.status !== 'rechazada');
  const overlapsOwn = others.filter((a) => a.employeeId === req.employeeId && overlaps(a.start, a.end, req.start, req.end));
  const colleaguesOff: RequestCheck['colleaguesOff'] = [];
  if (emp) {
    for (const a of others) {
      if (a.employeeId === emp.id || !overlaps(a.start, a.end, req.start, req.end)) continue;
      const other = state.employees.find((e) => e.id === a.employeeId);
      if (other && other.active && other.storeId === emp.storeId) colleaguesOff.push({ employee: other, absence: a });
    }
  }
  const breachDays: ISODate[] = [];
  if (emp && req.end >= req.start && req.end <= addDays(req.start, 400)) {
    const days: ISODate[] = [];
    for (let d = req.start; d <= req.end; d = addDays(d, 1)) days.push(d);
    const scoped: DataState = { ...state, absences: others };
    for (const c of coverageFor(scoped, emp.storeId, days, rules, req)) if (c.breach) breachDays.push(c.day);
  }
  let saturdays = 0;
  const saturdaysOver: RequestCheck['saturdaysOver'] = [];
  const max = emp ? saturdayLimit(emp, state.settings, rules) : 0;
  if (emp && ABSENCE_TYPES[req.type ?? 'vacaciones'].countsAgainstBalance && req.end <= addDays(req.start, 400)) {
    const scoped: DataState = { ...state, absences: others };
    for (const [year, n] of workedSaturdays(emp, req.start, req.end, rules)) {
      saturdays += n;
      if (!max) continue;
      const b = balanceFor(emp, year, scoped, rules);
      const total = b.saturdaysUsed + b.saturdaysPending + n;
      if (total > max) saturdaysOver.push({ year, total, max });
    }
  }
  return {
    days: emp ? countDaysFor(emp, req.start, req.end, state.settings.countMode, rules) : 0,
    saturdays,
    saturdaysOver,
    overlapsOwn,
    colleaguesOff,
    breachDays,
  };
}
