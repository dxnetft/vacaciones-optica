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

export interface Store {
  id: string;
  name: string;
  /** Personas mínimas que deben estar trabajando cada día laborable. 0 = sin mínimo. */
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
  holidays: Holiday[];
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
