import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../server/db.ts';
import { createApp } from '../server/app.ts';
import { readWorkbook } from '../server/excel.ts';
import { analyzeWorkbook, extractAbsences } from '../shared/importer.ts';
import { dayRules } from '../shared/dates.ts';
import type { Absence, DataState, Employee, ImportResult } from '../shared/types.ts';
import { SAMPLES } from '../scripts/samples.ts';

let server: Server;
let base: string;
let dir: string;

async function call<T>(method: string, url: string, body?: unknown, admin = false, raw?: Buffer): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (admin) headers['x-admin-pin'] = '1234';
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (raw) headers['content-type'] = 'application/octet-stream';
  const res = await fetch(base + url, { method, headers, body: raw ? new Uint8Array(raw) : (body !== undefined ? JSON.stringify(body) : undefined) });
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, data: (ct.includes('json') ? await res.json() : await res.arrayBuffer()) as T };
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vac-'));
  const app = createApp(new Store(dir));
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('API', () => {
  it('protege las acciones de responsable con el PIN', async () => {
    expect((await call('POST', '/api/stores', { name: 'X' })).status).toBe(403);
    expect((await call('POST', '/api/auth', { pin: '0000' })).status).toBe(401);
    expect((await call('POST', '/api/auth', { pin: '1234' })).status).toBe(200);
  });

  it('importa un Excel y lo vuelve a exportar sin perder datos', async () => {
    const file = await SAMPLES['cuadrante-mensual.xlsx']();
    const parsed = await call<Parameters<typeof analyzeWorkbook>[0]>('POST', '/api/import/parse?name=cuadrante-mensual.xlsx', undefined, true, file);
    expect(parsed.status).toBe(200);
    const analysis = analyzeWorkbook(parsed.data, { year: 2026 });
    const state = (await call<DataState>('GET', '/api/state')).data;
    const rules = dayRules(state.settings);
    const absences = extractAbsences(parsed.data, analysis, {
      mapping: Object.fromEntries(analysis.markers.map((m) => [m.key, m.suggested])),
      includeEmployees: new Set(analysis.employees.filter((e) => e.include).map((e) => e.key)),
      sheetNamesAsStores: false,
      rules,
    });
    const employees = analysis.employees.filter((e) => e.include).map((e) => ({ name: e.name }));
    const r1 = await call<ImportResult>('POST', '/api/import/commit', { employees, absences, replaceImported: true }, true);
    expect(r1.data).toMatchObject({ createdEmployees: 4, createdAbsences: 7 });

    // Reimportar el mismo fichero no duplica nada.
    const r2 = await call<ImportResult>('POST', '/api/import/commit', { employees, absences, replaceImported: true }, true);
    expect(r2.data).toMatchObject({ createdEmployees: 0, createdAbsences: 7, removedAbsences: 7 });

    // El Excel exportado se puede volver a importar (hojas de cuadrante mensual).
    const exported = await call<ArrayBuffer>('GET', '/api/export?year=2026');
    expect(exported.status).toBe(200);
    const wb = await readWorkbook(Buffer.from(exported.data), 'vacaciones-2026.xlsx');
    const again = analyzeWorkbook(wb);
    const monthSheets = new Set(again.blocks.filter((b) => b.kind === 'grid').map((b) => b.sheetIndex));
    const reimported = extractAbsences(wb, again, {
      mapping: Object.fromEntries(again.markers.map((m) => [m.key, m.suggested])),
      includeEmployees: new Set(again.employees.map((e) => e.key)),
      sheetNamesAsStores: false,
      sheets: monthSheets,
      rules,
    });
    expect(reimported.map((a) => `${a.employeeName}|${a.start}|${a.end}|${a.type}`)).toEqual(
      absences.map((a) => `${a.employeeName}|${a.start}|${a.end}|${a.type}`),
    );
  });

  it('las solicitudes sin PIN quedan pendientes y el responsable las aprueba', async () => {
    const state = (await call<DataState>('GET', '/api/state')).data;
    const ana = state.employees.find((e: Employee) => e.name === 'Ana García')!;
    const created = await call<Absence>('POST', '/api/absences', { employeeId: ana.id, start: '2026-10-05', end: '2026-10-09', type: 'vacaciones', status: 'aprobada' });
    expect(created.data.status).toBe('pendiente');
    const overlap = await call('POST', '/api/absences', { employeeId: ana.id, start: '2026-10-08', end: '2026-10-12', type: 'vacaciones' });
    expect(overlap.status).toBe(409);
    expect((await call('POST', `/api/absences/${created.data.id}/decision`, { status: 'aprobada' })).status).toBe(403);
    const decided = await call<Absence>('POST', `/api/absences/${created.data.id}/decision`, { status: 'aprobada' }, true);
    expect(decided.data.status).toBe('aprobada');
    // Una vez aprobada, sin PIN no se puede borrar.
    expect((await call('DELETE', `/api/absences/${created.data.id}`)).status).toBe(403);
  });

  it('valida los datos de entrada', async () => {
    const state = (await call<DataState>('GET', '/api/state')).data;
    const id = state.employees[0].id;
    expect((await call('POST', '/api/absences', { employeeId: id, start: '2026-02-30', end: '2026-03-01', type: 'vacaciones' })).status).toBe(400);
    expect((await call('POST', '/api/absences', { employeeId: id, start: '2026-03-05', end: '2026-03-01', type: 'vacaciones' })).status).toBe(400);
    expect((await call('POST', '/api/absences', { employeeId: id, start: '2026-03-01', end: '2026-03-01', type: 'playa' })).status).toBe(400);
    const xls = await call<{ error: string }>('POST', '/api/import/parse?name=viejo.xls', undefined, true, Buffer.from('abc'));
    expect(xls.status).toBe(400);
    expect(xls.data.error).toMatch(/Guardar como/);
  });

  it('asigna horarios y aplica el límite de sábados de vacaciones', async () => {
    const state = (await call<DataState>('GET', '/api/state')).data;
    expect(state.settings.maxVacationSaturdays).toBe(2);
    expect(state.settings.scheduleGroups.map((g) => g.name)).toEqual(['Mañana', 'Tarde', 'Sábados']);

    const bad = await call('POST', '/api/employees', { name: 'X', schedule: { kind: 'fijo', groupId: 'no-existe' } }, true);
    expect(bad.status).toBe(400);
    const rota = await call<Employee>(
      'POST',
      '/api/employees',
      { name: 'Rosa Turnos', schedule: { kind: 'rotativo', groupIds: ['manana', 'tarde'], start: '2026-08-05', everyWeeks: 1 } },
      true,
    );
    expect(rota.data.schedule).toEqual({ kind: 'rotativo', groupIds: ['manana', 'tarde'], start: '2026-08-03', everyWeeks: 1 });

    const tarde = await call<Employee>('POST', '/api/employees', { name: 'Toni Tardes', schedule: { kind: 'fijo', groupId: 'tarde' } }, true);
    const ask = (start: string, end: string, admin = false) =>
      call<Absence>('POST', '/api/absences', { employeeId: tarde.data.id, start, end, type: 'vacaciones' }, admin);
    expect((await ask('2026-06-01', '2026-06-06')).status).toBe(200); // 1 sábado
    expect((await ask('2026-06-08', '2026-06-13')).status).toBe(200); // 2 sábados
    const third = await ask('2026-06-15', '2026-06-20');
    expect(third.status).toBe(409);
    expect((third.data as unknown as { error: string }).error).toMatch(/sábado/);
    expect((await ask('2026-06-15', '2026-06-19')).status).toBe(200); // sin el sábado sí
    expect((await ask('2026-06-27', '2026-06-27', true)).status).toBe(200); // el responsable puede saltárselo

    // Al borrar un horario, quien lo tenía se queda con el resto.
    const groups = state.settings.scheduleGroups.filter((g) => g.id !== 'tarde');
    expect((await call('PUT', '/api/settings', { scheduleGroups: groups }, true)).status).toBe(200);
    const after = (await call<DataState>('GET', '/api/state')).data;
    expect(after.employees.find((e) => e.id === rota.data.id)?.schedule).toEqual({ kind: 'fijo', groupId: 'manana' });
    expect(after.employees.find((e) => e.id === tarde.data.id)?.schedule).toBeNull();
  });
});
