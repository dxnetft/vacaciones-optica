import { describe, expect, it } from 'vitest';
import { countDays, dayRules, easterSunday, parseLooseDate, spanishNationalHolidays } from '../shared/dates.ts';
import { balanceFor, checkRequest, coverageFor } from '../shared/stats.ts';
import type { DataState } from '../shared/types.ts';

const settings = {
  companyName: 'Test',
  countMode: 'laborables' as const,
  workingWeekdays: [1, 2, 3, 4, 5, 6],
  defaultAnnualDays: 23,
  holidays: spanishNationalHolidays(2026),
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
