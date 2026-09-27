import { ABSENCE_TYPES } from './types.ts';
import type { Absence, DataState, Employee, ISODate, Store } from './types.ts';
import { addDays, clampRange, countDays, dayRules, isWorkingDay, overlaps } from './dates.ts';
import type { DayRules } from './dates.ts';

export interface Balance {
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  /** Días de otras ausencias (no descuentan saldo), para información. */
  otherDays: number;
}

export function allowanceFor(emp: Employee, state: Pick<DataState, 'settings'>): number {
  return emp.annualDays ?? state.settings.defaultAnnualDays;
}

export function balanceFor(emp: Employee, year: number, state: DataState, rules = dayRules(state.settings)): Balance {
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  let used = 0;
  let pending = 0;
  let otherDays = 0;
  for (const a of state.absences) {
    if (a.employeeId !== emp.id || a.status === 'rechazada') continue;
    const r = clampRange(a.start, a.end, yStart, yEnd);
    if (!r) continue;
    const n = countDays(r[0], r[1], state.settings.countMode, rules);
    if (!ABSENCE_TYPES[a.type].countsAgainstBalance) {
      if (a.status === 'aprobada') otherDays += n;
    } else if (a.status === 'aprobada') used += n;
    else pending += n;
  }
  const allowance = allowanceFor(emp, state);
  return { allowance, used, pending, remaining: allowance - used - pending, otherDays };
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
  total: number;
  absent: number;
  present: number;
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
    const present = emps.length - approved.size;
    return {
      day,
      working,
      total: emps.length,
      absent: approved.size,
      present,
      minStaff,
      breach: working && minStaff > 0 && present < minStaff,
      breachIfPending: working && minStaff > 0 && emps.length - any.size < minStaff,
      absentNames: [...any].map((id) => names.get(id) ?? '?'),
    };
  });
}

export interface RequestCheck {
  days: number;
  overlapsOwn: Absence[];
  colleaguesOff: { employee: Employee; absence: Absence }[];
  breachDays: ISODate[];
}

/** Comprueba una solicitud: días que consume, compañeros ausentes y días sin cobertura mínima. */
export function checkRequest(
  state: DataState,
  req: { employeeId: string; start: ISODate; end: ISODate; ignoreId?: string },
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
  return {
    days: countDays(req.start, req.end, state.settings.countMode, rules),
    overlapsOwn,
    colleaguesOff,
    breachDays,
  };
}
