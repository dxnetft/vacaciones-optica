import { describe, expect, it } from 'vitest';
import { countDays, dayRules, easterSunday, parseLooseDate, spanishNationalHolidays } from '../shared/dates.ts';
import { allowanceFor, balanceFor, checkRequest, countDaysFor, coverageFor } from '../shared/stats.ts';
import { DEFAULT_SCHEDULE_GROUPS, currentRotationIndex, rotationStartFor, workOn } from '../shared/schedule.ts';
import type { DataState } from '../shared/types.ts';

const settings = {
  companyName: 'Test',
  countMode: 'laborables' as const,
  workingWeekdays: [1, 2, 3, 4, 5, 6],
  defaultAnnualDays: 23,
  maxVacationSaturdays: 0,
  holidays: spanishNationalHolidays(2026),
  scheduleGroups: [],
};

const state: DataState = {
  settings,
  stores: [{ id: 's1', name: 'Centro', minStaff: 2 }],
  employees: [
    { id: 'a', name: 'Ana', storeId: 's1', color: '#000', annualDays: null, active: true },
    { id: 'b', name: 'Bea', storeId: 's1', color: '#000', annualDays: 30, active: true },
    { id: 'c', name: 'Carlos', storeId: 's1', color: '#000', annualDays: null, active: true },
  ],
  absences: [
    { id: '1', employeeId: 'a', start: '2026-08-10', end: '2026-08-21', type: 'vacaciones', status: 'aprobada', source: 'app', createdAt: '' },
    { id: '2', employeeId: 'a', start: '2026-12-28', end: '2027-01-08', type: 'vacaciones', status: 'aprobada', source: 'app', createdAt: '' },
    { id: '3', employeeId: 'b', start: '2026-08-17', end: '2026-08-18', type: 'vacaciones', status: 'pendiente', source: 'app', createdAt: '' },
    { id: '4', employeeId: 'c', start: '2026-03-02', end: '2026-03-04', type: 'baja', status: 'aprobada', source: 'app', createdAt: '' },
  ],
};

describe('fechas', () => {
  it('calcula la Pascua y los festivos nacionales', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(spanishNationalHolidays(2026).find((h) => h.name === 'Viernes Santo')?.date).toBe('2026-04-03');
  });

  it('cuenta días laborables sin domingos ni festivos', () => {
    // 10-21 agosto 2026: 12 días naturales, menos el domingo 16 y el sábado 15 (festivo)
    expect(countDays('2026-08-10', '2026-08-21', 'laborables', dayRules(settings))).toBe(10);
    expect(countDays('2026-08-10', '2026-08-21', 'naturales', dayRules(settings))).toBe(12);
  });

  it('entiende fechas escritas a mano', () => {
    expect(parseLooseDate('3/8/2026')).toBe('2026-08-03');
    expect(parseLooseDate('03-08-26')).toBe('2026-08-03');
    expect(parseLooseDate('3 de agosto de 2026')).toBe('2026-08-03');
    expect(parseLooseDate('31/02/2026')).toBeNull();
  });
});

describe('saldos y cobertura', () => {
  it('reparte las ausencias que cruzan de año', () => {
    const ana = state.employees[0];
    const b26 = balanceFor(ana, 2026, state);
    // 10 días en agosto + 28-31 dic (4 laborables)
    expect(b26).toMatchObject({ allowance: 23, used: 14, pending: 0, remaining: 9 });
    const b27 = balanceFor(ana, 2027, state);
    // 1-8 enero 2027: sin el 1 y el 6 (festivos, no cargados para 2027) → 7 laborables (L-S, sin domingo 3)
    expect(b27.used).toBe(7);
  });

  it('las bajas no descuentan vacaciones', () => {
    expect(balanceFor(state.employees[2], 2026, state)).toMatchObject({ used: 0, otherDays: 3 });
  });

  it('detecta días por debajo del mínimo', () => {
    const cov = coverageFor(state, 's1', ['2026-08-17', '2026-08-19']);
    expect(cov[0]).toMatchObject({ present: 2, breach: false, breachIfPending: true });
    const check = checkRequest(state, { employeeId: 'c', start: '2026-08-17', end: '2026-08-19' });
    expect(check.colleaguesOff.map((c) => c.employee.name).sort()).toEqual(['Ana', 'Bea']);
    expect(check.breachDays).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
  });
});

describe('horarios y turnos', () => {
  const shifts: DataState = {
    settings: { ...settings, maxVacationSaturdays: 2, scheduleGroups: DEFAULT_SCHEDULE_GROUPS },
    stores: [{ id: 's', name: 'Tienda', minStaff: 1 }],
    employees: [
      { id: 'm', name: 'Mañanas', storeId: 's', color: '#000', annualDays: null, active: true, schedule: { kind: 'fijo', groupId: 'manana' } },
      { id: 't', name: 'Tardes', storeId: 's', color: '#000', annualDays: null, active: true, schedule: { kind: 'fijo', groupId: 'tarde' } },
      {
        id: 'r',
        name: 'Rota',
        storeId: 's',
        color: '#000',
        annualDays: null,
        active: true,
        schedule: { kind: 'rotativo', groupIds: ['manana', 'tarde'], start: '2026-08-03', everyWeeks: 1 },
      },
      { id: 'sa', name: 'Sábados', storeId: 's', color: '#000', annualDays: null, active: true, schedule: { kind: 'fijo', groupId: 'sabados' } },
    ],
    absences: [
      { id: 'v1', employeeId: 't', start: '2026-07-06', end: '2026-07-11', type: 'vacaciones', status: 'aprobada', source: 'app', createdAt: '' },
      { id: 'v2', employeeId: 't', start: '2026-07-13', end: '2026-07-18', type: 'vacaciones', status: 'pendiente', source: 'app', createdAt: '' },
    ],
  };
  const rules = dayRules(shifts.settings);
  const [m, t, r, sa] = shifts.employees;

  it('sabe qué turno le toca a cada persona', () => {
    expect(workOn(m, '2026-08-05', rules)).toBe('P'); // miércoles: jornada partida
    expect(workOn(m, '2026-08-08', rules)).toBeNull(); // sábado: libre
    expect(workOn(t, '2026-08-08', rules)).toBe('P');
    expect(workOn(t, '2026-08-15', rules)).toBeNull(); // festivo
    expect(workOn(sa, '2026-08-07', rules)).toBeNull();
    expect(workOn({ schedule: null }, '2026-08-08', rules)).toBe('dia');
  });

  it('alterna los horarios rotativos cada semana', () => {
    expect(workOn(r, '2026-08-04', rules)).toBe('M');
    expect(workOn(r, '2026-08-11', rules)).toBe('T');
    expect(workOn(r, '2026-08-18', rules)).toBe('M');
    expect(workOn(r, '2026-07-28', rules)).toBe('T'); // también hacia atrás
    expect(workOn(r, '2026-08-29', rules)).toBe('P'); // sábado de semana de tarde
    const sc = { kind: 'rotativo' as const, groupIds: ['manana', 'tarde'], start: rotationStartFor('2026-09-16', 1, 2), everyWeeks: 2 };
    expect(currentRotationIndex(sc, '2026-09-16')).toBe(1);
    expect(currentRotationIndex(sc, '2026-09-21')).toBe(1);
    expect(currentRotationIndex(sc, '2026-09-28')).toBe(0);
  });

  it('solo cuenta los días que le toca trabajar', () => {
    expect(countDaysFor(m, '2026-08-03', '2026-08-09', 'laborables', rules)).toBe(5);
    expect(countDaysFor(t, '2026-08-03', '2026-08-09', 'laborables', rules)).toBe(6);
    expect(countDaysFor(sa, '2026-08-03', '2026-08-09', 'laborables', rules)).toBe(1);
    expect(countDaysFor(sa, '2026-08-03', '2026-08-09', 'naturales', rules)).toBe(7);
  });

  it('limita los sábados de vacaciones al año', () => {
    expect(balanceFor(t, 2026, shifts)).toMatchObject({ used: 6, pending: 6, saturdaysUsed: 1, saturdaysPending: 1, maxSaturdays: 2 });
    const third = checkRequest(shifts, { employeeId: 't', start: '2026-08-24', end: '2026-08-29', type: 'vacaciones' });
    expect(third.saturdays).toBe(1);
    expect(third.saturdaysOver).toEqual([{ year: 2026, total: 3, max: 2 }]);
    expect(checkRequest(shifts, { employeeId: 't', start: '2026-08-24', end: '2026-08-28' }).saturdaysOver).toEqual([]);
    // Un asunto propio en sábado no gasta sábados de vacaciones.
    expect(checkRequest(shifts, { employeeId: 't', start: '2026-08-29', end: '2026-08-29', type: 'asuntos_propios' }).saturdaysOver).toEqual([]);
    // Quien no trabaja los sábados no los gasta.
    expect(checkRequest(shifts, { employeeId: 'm', start: '2026-08-24', end: '2026-08-30' }).saturdays).toBe(0);
    // Al editar una solicitud no se cuenta dos veces.
    expect(checkRequest(shifts, { employeeId: 't', start: '2026-07-13', end: '2026-07-18', ignoreId: 'v2' }).saturdaysOver).toEqual([]);
  });

  it('cada persona puede tener su propio día de partido', () => {
    const lunes = { schedule: { kind: 'fijo' as const, groupId: 'manana', splitDay: 1 } };
    expect(workOn(lunes, '2026-08-03', rules)).toBe('P'); // lunes
    expect(workOn(lunes, '2026-08-05', rules)).toBe('M'); // el miércoles del horario pasa a mañana
    expect(workOn(lunes, '2026-08-08', rules)).toBeNull(); // el sábado sigue libre
    // En las semanas de tarde de una rotación no hay partido entre semana.
    const rota = { schedule: { ...r.schedule!, splitDay: 1 } };
    expect(workOn(rota, '2026-08-10', rules)).toBe('T');
    expect(workOn(rota, '2026-08-17', rules)).toBe('P');
  });

  it('quien solo trabaja sábados tiene sus propios días y no tiene límite de sábados', () => {
    expect(allowanceFor(sa, shifts)).toBe(4);
    expect(allowanceFor({ ...sa, annualDays: 2 }, shifts)).toBe(2);
    expect(allowanceFor(t, shifts)).toBe(23);
    const check = checkRequest(shifts, { employeeId: 'sa', start: '2026-06-01', end: '2026-06-30' });
    expect(check.saturdays).toBe(4);
    expect(check.saturdaysOver).toEqual([]);
    expect(balanceFor(sa, 2026, shifts).maxSaturdays).toBe(0);
  });

  it('comprueba la cobertura de mañana y de tarde por separado', () => {
    const [mon, sat] = coverageFor(shifts, 's', ['2026-08-03', '2026-08-08']);
    expect(mon).toMatchObject({ byShift: true, total: 3, morning: 2, afternoon: 1, breach: false });
    expect(sat).toMatchObject({ total: 2, morning: 2, afternoon: 2 });
    const check = checkRequest(shifts, { employeeId: 't', start: '2026-08-03', end: '2026-08-04' });
    expect(check.breachDays).toEqual(['2026-08-03', '2026-08-04']); // la tarde se queda vacía
    expect(checkRequest(shifts, { employeeId: 'm', start: '2026-08-03', end: '2026-08-03' }).breachDays).toEqual([]);
  });
});
