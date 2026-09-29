/** Fecha en formato ISO `YYYY-MM-DD` (sin hora ni zona horaria). */
export type ISODate = string;

export type AbsenceType = 'vacaciones' | 'asuntos_propios' | 'baja' | 'formacion' | 'otro';
export type AbsenceStatus = 'pendiente' | 'aprobada' | 'rechazada';

export interface AbsenceTypeInfo {
  label: string;
  short: string;
  color: string;
  /** Si descuenta del saldo anual de vacaciones. */
  countsAgainstBalance: boolean;
}

export const ABSENCE_TYPES: Record<AbsenceType, AbsenceTypeInfo> = {
  vacaciones: { label: 'Vacaciones', short: 'V', color: '#2563eb', countsAgainstBalance: true },
  asuntos_propios: { label: 'Asuntos propios', short: 'AP', color: '#8b5cf6', countsAgainstBalance: false },
  baja: { label: 'Baja', short: 'B', color: '#ef4444', countsAgainstBalance: false },
  formacion: { label: 'Formación', short: 'F', color: '#f59e0b', countsAgainstBalance: false },
  otro: { label: 'Otro / libre', short: 'O', color: '#64748b', countsAgainstBalance: false },
};

export const ABSENCE_TYPE_KEYS = Object.keys(ABSENCE_TYPES) as AbsenceType[];

export const STATUS_LABELS: Record<AbsenceStatus, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

/** Turno de un día: mañana, tarde o partido (mañana y tarde). */
export type Shift = 'M' | 'T' | 'P';

export const SHIFTS: Record<Shift, { label: string; short: string }> = {
  M: { label: 'Mañana', short: 'M' },
  T: { label: 'Tarde', short: 'T' },
  P: { label: 'Partido', short: 'P' },
};

export const SHIFT_KEYS = Object.keys(SHIFTS) as Shift[];

/** Un horario semanal que se puede asignar a varias personas (p. ej. "Mañana", "Tarde", "Sábados"). */
export interface ScheduleGroup {
  id: string;
  name: string;
  /** Turno de cada día de la semana (0 = domingo … 6 = sábado). `null` = ese día no trabaja. */
  days: (Shift | null)[];
  /** Días de vacaciones al año de quien tiene este horario fijo. `null` o ausente = el valor general. */
  annualDays?: number | null;
}

/**
 * Horario de una persona: siempre el mismo o rotativo (va pasando por varios horarios,
 * cambiando cada `everyWeeks` semanas).
 */
export type EmployeeSchedule = (
  | { kind: 'fijo'; groupId: string }
  | {
      kind: 'rotativo';
      groupIds: string[];
      /** Un lunes en el que empieza el primer horario de la lista. */
      start: ISODate;
      everyWeeks: number;
    }
) & {
  /**
   * Día de la semana en que esta persona hace la jornada partida (1 = lunes … 5 = viernes),
   * en las semanas en que su horario tiene un día partido entre semana. `null` = el del horario.
   */
  splitDay?: number | null;
};

export interface Store {
  id: string;
  name: string;
  /**
   * Personas mínimas que deben estar trabajando cada día laborable. Si el equipo tiene turnos,
   * el mínimo se aplica a la mañana y a la tarde por separado. 0 = sin mínimo.
   */
  minStaff: number;
}

export interface Employee {
  id: string;
  name: string;
  storeId: string | null;
  color: string;
  /** Días de vacaciones al año. `null` = usar el valor por defecto de ajustes. */
  annualDays: number | null;
  active: boolean;
  /** `null` o ausente = sin horario: trabaja los días laborables generales de Ajustes. */
  schedule?: EmployeeSchedule | null;
  /**
   * Cambios manuales de un día concreto que mandan sobre el horario: el turno que hace ese día
   * o `null` si ese día libra. Los pone el responsable desde la ficha de la persona.
   */
  shiftOverrides?: Record<ISODate, Shift | null>;
}

export interface Absence {
  id: string;
  employeeId: string;
  start: ISODate;
  end: ISODate;
  type: AbsenceType;
  status: AbsenceStatus;
  note?: string;
  source: 'app' | 'excel';
  createdAt: string;
  decidedAt?: string;
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export interface Settings {
  companyName: string;
  /** Cómo se cuentan los días de vacaciones consumidos. */
  countMode: 'laborables' | 'naturales';
  /** Días de la semana que se trabajan (0 = domingo … 6 = sábado). */
  workingWeekdays: number[];
  defaultAnnualDays: number;
  /** Cuántos de los días de vacaciones pueden ser sábado cada año. 0 = sin límite. */
  maxVacationSaturdays: number;
  holidays: Holiday[];
  /** Horarios que se pueden asignar a las personas del equipo. */
  scheduleGroups: ScheduleGroup[];
}

export interface DataState {
  stores: Store[];
  employees: Employee[];
  absences: Absence[];
  settings: Settings;
}

/* ---------- Importación desde Excel ---------- */

export interface RawCell {
  /** Valor tal cual (texto o número). */
  v: string | number | null;
  /** Si la celda contiene una fecha real de Excel. */
  d?: ISODate;
  /** Clave del color de relleno (p. ej. `FFFF0000` o `theme:5:0.4`). */
  fill?: string;
  /** Color CSS aproximado del relleno, para mostrarlo. */
  color?: string;
}

export interface RawSheet {
  name: string;
  rows: (RawCell | null)[][];
}

export interface RawWorkbook {
  fileName: string;
  sheets: RawSheet[];
}

export interface ImportedAbsence {
  employeeName: string;
  store?: string;
  start: ISODate;
  end: ISODate;
  type: AbsenceType;
  status: AbsenceStatus;
  note?: string;
}

export interface ImportPayload {
  employees: { name: string; store?: string }[];
  absences: ImportedAbsence[];
  /** Borra las ausencias importadas antes desde Excel que se solapen con el rango importado. */
  replaceImported: boolean;
}

export interface ImportResult {
  createdEmployees: number;
  createdStores: number;
  createdAbsences: number;
  removedAbsences: number;
}
