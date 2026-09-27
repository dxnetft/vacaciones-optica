import type { Employee, EmployeeSchedule, ISODate, ScheduleGroup, Shift } from './types.ts';
import { addDays, diffDays, isWorkingDay, mondayOf, weekday } from './dates.ts';
import type { DayRules } from './dates.ts';

/**
 * Lo que trabaja una persona un día concreto:
 * - su turno (`M`, `T`, `P`) si tiene horario y ese día le toca trabajar;
 * - `'dia'` si no tiene horario asignado y es día laborable general (cuenta para mañana y tarde);
 * - `null` si ese día no trabaja (descanso, domingo o festivo).
 */
export type WorkDay = Shift | 'dia' | null;

export const DEFAULT_SCHEDULE_GROUPS: ScheduleGroup[] = [
  // De lunes a viernes de mañana, con un día de jornada partida. El sábado no se trabaja.
  // Cada persona puede tener su propio día de partido (ver `splitDay`).
  { id: 'manana', name: 'Mañana', days: [null, 'M', 'M', 'P', 'M', 'M', null] },
  // De lunes a viernes de tarde, y el sábado (que siempre es jornada completa).
  { id: 'tarde', name: 'Tarde', days: [null, 'T', 'T', 'T', 'T', 'T', 'P'] },
  // Solo los sábados, jornada completa. Quien hace todo el año de sábados tiene 4 días de vacaciones.
  { id: 'sabados', name: 'Sábados', days: [null, null, null, null, null, null, 'P'], annualDays: 4 },
];

/** Horario que le toca a la persona la semana de `day`, o `null` si no tiene. */
export function groupOn(emp: Pick<Employee, 'schedule'>, day: ISODate, rules: DayRules): ScheduleGroup | null {
  const s = emp.schedule;
  if (!s) return null;
  if (s.kind === 'fijo') return rules.scheduleGroups.get(s.groupId) ?? null;
  const ids = s.groupIds.filter((id) => rules.scheduleGroups.has(id));
  if (!ids.length) return null;
  return rules.scheduleGroups.get(ids[rotationIndex(s, day, ids.length)])!;
}

function rotationIndex(s: Extract<EmployeeSchedule, { kind: 'rotativo' }>, day: ISODate, n: number): number {
  const weeks = Math.floor(diffDays(mondayOf(s.start), mondayOf(day)) / 7);
  const period = Math.floor(weeks / Math.max(1, s.everyWeeks));
  return ((period % n) + n) % n;
}

export function workOn(emp: Pick<Employee, 'schedule'>, day: ISODate, rules: DayRules): WorkDay {
  if (rules.holidays.has(day)) return null;
  const g = groupOn(emp, day, rules);
  if (!g) return isWorkingDay(day, rules) ? 'dia' : null;
  const wd = weekday(day);
  const w = g.days[wd] ?? null;
  // Día de partido propio de la persona: se mueve el partido del horario a su día.
  const split = emp.schedule?.splitDay;
  if (split && wd >= 1 && wd <= 5 && hasWeekdaySplit(g)) {
    if (wd === split) return w ? 'P' : null;
    if (w === 'P') return 'M';
  }
  return w;
}

/** Si el horario tiene algún día de jornada partida entre semana. */
export function hasWeekdaySplit(g: ScheduleGroup): boolean {
  return [1, 2, 3, 4, 5].some((d) => g.days[d] === 'P');
}

/** Horario fijo que solo trabaja los sábados (no se le aplica el límite de sábados de vacaciones). */
export function onlySaturdays(emp: Pick<Employee, 'schedule'>, rules: DayRules): boolean {
  const s = emp.schedule;
  const g = s?.kind === 'fijo' ? rules.scheduleGroups.get(s.groupId) : undefined;
  return !!g && g.days[6] !== null && g.days.every((d, i) => i === 6 || d === null);
}

export const coversMorning = (w: WorkDay) => w === 'M' || w === 'P' || w === 'dia';
export const coversAfternoon = (w: WorkDay) => w === 'T' || w === 'P' || w === 'dia';

/** Si la persona tiene un horario asignado que existe en Ajustes. */
export function hasSchedule(emp: Pick<Employee, 'schedule'>, rules: DayRules): boolean {
  const s = emp.schedule;
  if (!s) return false;
  return s.kind === 'fijo' ? rules.scheduleGroups.has(s.groupId) : s.groupIds.some((id) => rules.scheduleGroups.has(id));
}

/** Descripción corta del horario: "Mañana", "Rotativo: Mañana ⇄ Tarde (cada 2 semanas)" o "". */
export function describeSchedule(emp: Pick<Employee, 'schedule'>, rules: DayRules): string {
  const s = emp.schedule;
  if (!s || !hasSchedule(emp, rules)) return '';
  if (s.kind === 'fijo') return rules.scheduleGroups.get(s.groupId)!.name;
  const names = s.groupIds.map((id) => rules.scheduleGroups.get(id)?.name).filter(Boolean);
  const every = s.everyWeeks > 1 ? ` (cada ${s.everyWeeks} semanas)` : '';
  return `Rotativo: ${names.join(' ⇄ ')}${every}`;
}

/** Posición actual en la rotación (0 = primer horario de la lista). */
export function currentRotationIndex(s: Extract<EmployeeSchedule, { kind: 'rotativo' }>, day: ISODate): number {
  return rotationIndex(s, day, Math.max(1, s.groupIds.length));
}

/** Fecha de inicio para que en la semana de `day` toque la posición `index` de la rotación. */
export function rotationStartFor(day: ISODate, index: number, everyWeeks: number): ISODate {
  return addDays(mondayOf(day), -index * Math.max(1, everyWeeks) * 7);
}
