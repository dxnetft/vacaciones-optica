import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ABSENCE_TYPE_KEYS } from '../shared/types.ts';
import type { Absence, AbsenceStatus, AbsenceType, Employee, ImportPayload, ImportResult, Settings, Store as ShopStore } from '../shared/types.ts';
import { isValidISO, overlaps } from '../shared/dates.ts';
import { employeeKey } from '../shared/importer.ts';
import { Store, hashPin, newId } from './db.ts';
import { UserError, readWorkbook } from './excel.ts';
import { exportTemplate, exportYear } from './export.ts';

const PALETTE = ['#0ea5e9', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#14b8a6', '#eab308', '#6366f1', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e'];
const STATUSES: AbsenceStatus[] = ['pendiente', 'aprobada', 'rechazada'];

function fail(message: string, status = 400): never {
  const e = new UserError(message);
  e.status = status;
  throw e;
}

function str(v: unknown, field: string, max = 120): string {
  if (typeof v !== 'string' || !v.trim()) fail(`Falta el campo "${field}".`);
  return v.trim().slice(0, max);
}

function date(v: unknown, field: string): string {
  if (!isValidISO(v)) fail(`La fecha "${field}" no es válida.`);
  return v;
}

function int(v: unknown, field: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`"${field}" debe ser un número entre ${min} y ${max}.`);
  return n;
}

export function createApp(db: Store) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const isAdmin = (req: Request) => {
    const pin = req.header('x-admin-pin');
    return !!pin && hashPin(pin) === db.data.adminPinHash;
  };
  const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
    if (!isAdmin(req)) fail('Esta acción requiere el modo responsable (PIN).', 403);
    next();
  };
  const nextColor = () => PALETTE[db.data.employees.length % PALETTE.length];

  app.get('/api/state', (_req, res) => {
    res.json(db.publicState());
  });

  app.post('/api/auth', (req, res) => {
    const ok = typeof req.body?.pin === 'string' && hashPin(req.body.pin) === db.data.adminPinHash;
    if (!ok) fail('PIN incorrecto.', 401);
    res.json({ ok: true });
  });

  /* ---------- Tiendas ---------- */

  const parseStore = (body: Record<string, unknown>): Omit<ShopStore, 'id'> => ({
    name: str(body.name, 'nombre', 80),
    minStaff: body.minStaff === undefined ? 0 : int(body.minStaff, 'mínimo de personal', 0, 500),
  });

  app.post('/api/stores', requireAdmin, (req, res) => {
    const store: ShopStore = { id: newId(), ...parseStore(req.body) };
    db.data.stores.push(store);
    db.save();
    res.json(store);
  });

  app.put('/api/stores/:id', requireAdmin, (req, res) => {
    const store = db.data.stores.find((s) => s.id === req.params.id) ?? fail('Tienda no encontrada.', 404);
    Object.assign(store, parseStore(req.body));
    db.save();
    res.json(store);
  });

  app.delete('/api/stores/:id', requireAdmin, (req, res) => {
    db.data.stores = db.data.stores.filter((s) => s.id !== req.params.id);
    for (const e of db.data.employees) if (e.storeId === req.params.id) e.storeId = null;
    db.save();
    res.json({ ok: true });
  });

  /* ---------- Personas ---------- */

  const parseEmployee = (body: Record<string, unknown>): Omit<Employee, 'id'> => {
    const storeId = body.storeId ? String(body.storeId) : null;
    if (storeId && !db.data.stores.some((s) => s.id === storeId)) fail('La tienda indicada no existe.');
    return {
      name: str(body.name, 'nombre'),
      storeId,
      color: typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : nextColor(),
      annualDays: body.annualDays === null || body.annualDays === '' || body.annualDays === undefined
        ? null
        : int(body.annualDays, 'días al año', 0, 366),
      active: body.active !== false,
    };
  };

  app.post('/api/employees', requireAdmin, (req, res) => {
    const emp: Employee = { id: newId(), ...parseEmployee(req.body) };
    db.data.employees.push(emp);
    db.save();
    res.json(emp);
  });

  app.put('/api/employees/:id', requireAdmin, (req, res) => {
    const emp = db.data.employees.find((e) => e.id === req.params.id) ?? fail('Persona no encontrada.', 404);
    Object.assign(emp, parseEmployee(req.body));
    db.save();
    res.json(emp);
  });

  app.delete('/api/employees/:id', requireAdmin, (req, res) => {
    db.data.employees = db.data.employees.filter((e) => e.id !== req.params.id);
    db.data.absences = db.data.absences.filter((a) => a.employeeId !== req.params.id);
    db.save();
    res.json({ ok: true });
  });

  /* ---------- Ausencias ---------- */

  const parseAbsence = (body: Record<string, unknown>) => {
    const employeeId = str(body.employeeId, 'persona');
    if (!db.data.employees.some((e) => e.id === employeeId)) fail('La persona indicada no existe.');
    const start = date(body.start, 'desde');
    const end = date(body.end, 'hasta');
    if (end < start) fail('La fecha de fin es anterior a la de inicio.');
    const type = body.type as AbsenceType;
    if (!ABSENCE_TYPE_KEYS.includes(type)) fail('Tipo de ausencia no válido.');
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : undefined;
    return { employeeId, start, end, type, note };
  };

  app.post('/api/absences', (req, res) => {
    const admin = isAdmin(req);
    const data = parseAbsence(req.body);
    const status: AbsenceStatus = admin && STATUSES.includes(req.body.status) ? req.body.status : 'pendiente';
    const dup = db.data.absences.find(
      (a) => a.employeeId === data.employeeId && a.status !== 'rechazada' && overlaps(a.start, a.end, data.start, data.end),
    );
    if (dup && !req.body.allowOverlap) fail('Esta persona ya tiene una ausencia en esas fechas.', 409);
    const absence: Absence = {
      id: newId(),
      ...data,
      status,
      source: 'app',
      createdAt: new Date().toISOString(),
      ...(status !== 'pendiente' ? { decidedAt: new Date().toISOString() } : {}),
    };
    db.data.absences.push(absence);
    db.save();
    res.json(absence);
  });

  app.put('/api/absences/:id', (req, res) => {
    const absence = db.data.absences.find((a) => a.id === req.params.id) ?? fail('Ausencia no encontrada.', 404);
    const admin = isAdmin(req);
    if (!admin && absence.status !== 'pendiente') fail('Solo el responsable puede modificar ausencias ya decididas.', 403);
    const data = parseAbsence({ ...absence, ...req.body });
    Object.assign(absence, data);
    if (data.note === undefined) delete absence.note;
    if (admin && STATUSES.includes(req.body.status) && req.body.status !== absence.status) {
      absence.status = req.body.status;
      absence.decidedAt = new Date().toISOString();
    }
    db.save();
    res.json(absence);
  });

  app.post('/api/absences/:id/decision', requireAdmin, (req, res) => {
    const absence = db.data.absences.find((a) => a.id === req.params.id) ?? fail('Ausencia no encontrada.', 404);
    if (!STATUSES.includes(req.body?.status)) fail('Estado no válido.');
    absence.status = req.body.status;
    absence.decidedAt = new Date().toISOString();
    db.save();
    res.json(absence);
  });

  app.delete('/api/absences/:id', (req, res) => {
    const absence = db.data.absences.find((a) => a.id === req.params.id) ?? fail('Ausencia no encontrada.', 404);
    if (!isAdmin(req) && absence.status !== 'pendiente') fail('Solo el responsable puede borrar ausencias ya aprobadas.', 403);
    db.data.absences = db.data.absences.filter((a) => a.id !== absence.id);
    db.save();
    res.json({ ok: true });
  });

  /* ---------- Ajustes ---------- */

  app.put('/api/settings', requireAdmin, (req, res) => {
    const b = req.body ?? {};
    const s = db.data.settings;
    const next: Settings = {
      companyName: b.companyName !== undefined ? str(b.companyName, 'nombre de empresa', 80) : s.companyName,
      countMode: b.countMode === 'naturales' || b.countMode === 'laborables' ? b.countMode : s.countMode,
      workingWeekdays: Array.isArray(b.workingWeekdays)
        ? [...new Set<number>(b.workingWeekdays.map((d: unknown) => int(d, 'día de la semana', 0, 6)))].sort()
        : s.workingWeekdays,
      defaultAnnualDays: b.defaultAnnualDays !== undefined ? int(b.defaultAnnualDays, 'días por defecto', 0, 366) : s.defaultAnnualDays,
      holidays: Array.isArray(b.holidays)
        ? b.holidays
            .map((h: { date?: unknown; name?: unknown }) => ({ date: date(h.date, 'festivo'), name: String(h.name ?? 'Festivo').slice(0, 80) }))
            .sort((x: { date: string }, y: { date: string }) => x.date.localeCompare(y.date))
        : s.holidays,
    };
    db.data.settings = next;
    if (typeof b.newPin === 'string') {
      if (!/^\d{4,8}$/.test(b.newPin)) fail('El PIN debe tener entre 4 y 8 cifras.');
      db.data.adminPinHash = hashPin(b.newPin);
    }
    db.save();
    res.json(next);
  });

  /* ---------- Excel ---------- */

  app.post(
    '/api/import/parse',
    requireAdmin,
    express.raw({ type: () => true, limit: '25mb' }),
    async (req, res) => {
      const fileName = decodeURIComponent(String(req.query.name ?? 'fichero.xlsx'));
      if (!Buffer.isBuffer(req.body) || !req.body.length) fail('No se ha recibido ningún fichero.');
      try {
        res.json(await readWorkbook(req.body, fileName));
      } catch (e) {
        if (e instanceof UserError) throw e;
        fail('No se ha podido leer el fichero. ¿Es un Excel válido?');
      }
    },
  );

  app.post('/api/import/commit', requireAdmin, (req, res) => {
    const payload = req.body as ImportPayload;
    if (!payload || !Array.isArray(payload.absences) || !Array.isArray(payload.employees)) fail('Datos de importación no válidos.');
    const result: ImportResult = { createdEmployees: 0, createdStores: 0, createdAbsences: 0, removedAbsences: 0 };

    const storeByName = new Map(db.data.stores.map((s) => [employeeKey(s.name), s]));
    const ensureStore = (name: string | undefined): string | null => {
      if (!name?.trim()) return null;
      const key = employeeKey(name);
      let s = storeByName.get(key);
      if (!s) {
        s = { id: newId(), name: name.trim().slice(0, 80), minStaff: 0 };
        db.data.stores.push(s);
        storeByName.set(key, s);
        result.createdStores++;
      }
      return s.id;
    };

    const empByKey = new Map(db.data.employees.map((e) => [employeeKey(e.name), e]));
    const ensureEmployee = (name: string, store?: string): Employee => {
      const key = employeeKey(name);
      let e = empByKey.get(key);
      if (!e) {
        e = { id: newId(), name: name.trim().slice(0, 120), storeId: ensureStore(store), color: nextColor(), annualDays: null, active: true };
        db.data.employees.push(e);
        empByKey.set(key, e);
        result.createdEmployees++;
      } else if (!e.storeId && store) e.storeId = ensureStore(store);
      return e;
    };

    const valid = payload.absences.filter(
      (a) => a && typeof a.employeeName === 'string' && a.employeeName.trim() && isValidISO(a.start) && isValidISO(a.end) &&
        a.end >= a.start && ABSENCE_TYPE_KEYS.includes(a.type),
    );
    for (const e of payload.employees) if (e && typeof e.name === 'string' && e.name.trim()) ensureEmployee(e.name, e.store);

    if (payload.replaceImported && valid.length) {
      const min = valid.reduce((m, a) => (a.start < m ? a.start : m), valid[0].start);
      const max = valid.reduce((m, a) => (a.end > m ? a.end : m), valid[0].end);
      const before = db.data.absences.length;
      db.data.absences = db.data.absences.filter((a) => !(a.source === 'excel' && overlaps(a.start, a.end, min, max)));
      result.removedAbsences = before - db.data.absences.length;
    }

    const now = new Date().toISOString();
    for (const a of valid) {
      const emp = ensureEmployee(a.employeeName, a.store);
      const exists = db.data.absences.some(
        (x) => x.employeeId === emp.id && x.start === a.start && x.end === a.end && x.type === a.type && x.status !== 'rechazada',
      );
      if (exists) continue;
      db.data.absences.push({
        id: newId(),
        employeeId: emp.id,
        start: a.start,
        end: a.end,
        type: a.type,
        status: STATUSES.includes(a.status) ? a.status : 'aprobada',
        ...(a.note ? { note: String(a.note).slice(0, 500) } : {}),
        source: 'excel',
        createdAt: now,
        decidedAt: now,
      });
      result.createdAbsences++;
    }
    db.save();
    res.json(result);
  });

  app.get('/api/export', async (req, res) => {
    const year = req.query.year ? int(req.query.year, 'año', 1990, 2100) : new Date().getFullYear();
    const buf = await exportYear(db.publicState(), year);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="vacaciones-${year}.xlsx"`);
    res.send(buf);
  });

  app.get('/api/template', async (_req, res) => {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-vacaciones.xlsx"');
    res.send(await exportTemplate());
  });

  /* ---------- Copias de seguridad ---------- */

  app.get('/api/backup', requireAdmin, (_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="vacaciones-copia-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(db.publicState());
  });

  app.post('/api/restore', requireAdmin, (req, res) => {
    const b = req.body ?? {};
    if (!Array.isArray(b.employees) || !Array.isArray(b.absences) || !Array.isArray(b.stores) || typeof b.settings !== 'object') {
      fail('La copia de seguridad no tiene el formato esperado.');
    }
    db.data = { ...db.data, stores: b.stores, employees: b.employees, absences: b.absences, settings: { ...db.data.settings, ...b.settings } };
    db.save();
    res.json({ ok: true });
  });

  app.use('/api', (_req, _res) => fail('Ruta no encontrada.', 404));

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    const status = (err as { status?: number })?.status;
    if (status === 413) return res.status(413).json({ error: 'El fichero es demasiado grande.' });
    if (status === 400) return res.status(400).json({ error: 'Petición no válida.' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return app;
}
