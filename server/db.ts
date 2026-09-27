import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DataState, Settings } from '../shared/types.ts';
import { spanishNationalHolidays } from '../shared/dates.ts';
import { DEFAULT_SCHEDULE_GROUPS } from '../shared/schedule.ts';

/** Estado persistido: los datos de la app más el hash del PIN de responsable. */
export interface DB extends DataState {
  version: 1;
  adminPinHash: string;
}

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(`vacaciones-optica:${pin}`).digest('hex');
}

export function newId(): string {
  return crypto.randomUUID();
}

function defaultSettings(): Settings {
  const year = new Date().getFullYear();
  return {
    companyName: 'Óptica Universitaria',
    countMode: 'laborables',
    workingWeekdays: [1, 2, 3, 4, 5, 6],
    defaultAnnualDays: 23,
    maxVacationSaturdays: 2,
    holidays: [...spanishNationalHolidays(year), ...spanishNationalHolidays(year + 1)],
    scheduleGroups: DEFAULT_SCHEDULE_GROUPS.map((g) => ({ ...g, days: [...g.days] })),
  };
}

export function emptyDB(pin = process.env.ADMIN_PIN ?? '1234'): DB {
  return {
    version: 1,
    stores: [],
    employees: [],
    absences: [],
    settings: defaultSettings(),
    adminPinHash: hashPin(pin),
  };
}

/**
 * Almacenamiento en un fichero JSON. Para un equipo de decenas de personas es más que
 * suficiente, no necesita instalar ninguna base de datos y se puede copiar como copia de seguridad.
 */
export class Store {
  readonly file: string;
  data: DB;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, 'db.json');
    if (fs.existsSync(this.file)) {
      const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<DB>;
      const base = emptyDB();
      this.data = { ...base, ...loaded, settings: { ...base.settings, ...loaded.settings } } as DB;
    } else {
      this.data = emptyDB();
      this.save();
    }
  }

  save(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
    this.backupDaily();
  }

  /** Guarda una copia al día (se conservan las últimas 30). */
  private backupDaily(): void {
    const dir = path.join(path.dirname(this.file), 'backups');
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `db-${today}.json`);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(this.file, target);
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('db-')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.rmSync(path.join(dir, f));
  }

  publicState(): DataState {
    const { stores, employees, absences, settings } = this.data;
    return { stores, employees, absences, settings };
  }
}
