import ExcelJS from 'exceljs';
import { ABSENCE_TYPES, STATUS_LABELS } from '../shared/types.ts';
import type { DataState } from '../shared/types.ts';
import { MONTHS_ES, WEEKDAYS_SHORT, clampRange, dayRules, isWorkingDay, monthDays, overlaps, toDate } from '../shared/dates.ts';
import { absenceOn, absencesByEmployee, balanceFor, countDaysFor } from '../shared/stats.ts';
import { describeSchedule } from '../shared/schedule.ts';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const solid = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });

function lighten(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  return `#${[0, 2, 4]
    .map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) + (255 - parseInt(h.slice(i, i + 2), 16)) * amount)
      .toString(16).padStart(2, '0'))
    .join('')}`;
}

function sortedEmployees(state: DataState) {
  const storeName = (id: string | null) => state.stores.find((s) => s.id === id)?.name ?? 'Sin tienda';
  return state.employees
    .filter((e) => e.active)
    .sort((a, b) => storeName(a.storeId).localeCompare(storeName(b.storeId), 'es') || a.name.localeCompare(b.name, 'es'))
    .map((e) => ({ ...e, storeName: storeName(e.storeId) }));
}

/** Excel con resumen, listado y un cuadrante por mes (se puede volver a importar). */
export async function exportYear(state: DataState, year: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestor de vacaciones';
  const rules = dayRules(state.settings);
  const emps = sortedEmployees(state);
  const byEmp = absencesByEmployee(state.absences);
  const header = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: 'FF1D1D1B' } };
    row.eachCell((c) => (c.fill = solid('#ffcd00')));
  };

  // Resumen
  const sum = wb.addWorksheet('Resumen');
  sum.columns = [
    { header: 'Nombre', width: 28 },
    { header: 'Tienda', width: 20 },
    { header: 'Días del año', width: 13 },
    { header: 'Disfrutados/aprobados', width: 22 },
    { header: 'Pendientes de aprobar', width: 22 },
    { header: 'Restantes', width: 12 },
    { header: 'Otras ausencias (días)', width: 22 },
    { header: 'Sábados de vacaciones', width: 22 },
    { header: 'Horario', width: 30 },
  ];
  header(sum.getRow(1));
  for (const e of emps) {
    const b = balanceFor(e, year, state, rules);
    const sats = b.saturdaysUsed + b.saturdaysPending;
    sum.addRow([
      e.name, e.storeName, b.allowance, b.used, b.pending, b.remaining, b.otherDays,
      b.maxSaturdays ? `${sats} de ${b.maxSaturdays}` : sats, describeSchedule(e, rules) || 'General',
    ]);
  }

  // Listado
  const list = wb.addWorksheet('Listado');
  list.columns = [
    { header: 'Nombre', width: 28 },
    { header: 'Tienda', width: 20 },
    { header: 'Tipo', width: 18 },
    { header: 'Estado', width: 12 },
    { header: 'Desde', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Hasta', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Días', width: 8 },
    { header: 'Observaciones', width: 40 },
  ];
  header(list.getRow(1));
  const empById = new Map(emps.map((e) => [e.id, e]));
  const rows = state.absences
    .filter((a) => empById.has(a.employeeId) && overlaps(a.start, a.end, `${year}-01-01`, `${year}-12-31`))
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const a of rows) {
    const e = empById.get(a.employeeId)!;
    const r = clampRange(a.start, a.end, `${year}-01-01`, `${year}-12-31`)!;
    list.addRow([
      e.name, e.storeName, ABSENCE_TYPES[a.type].label, STATUS_LABELS[a.status],
      toDate(a.start), toDate(a.end), countDaysFor(e, r[0], r[1], state.settings.countMode, rules), a.note ?? '',
    ]);
  }
  list.autoFilter = { from: 'A1', to: 'H1' };

  // Cuadrantes mensuales
  for (let m = 0; m < 12; m++) {
    const ws = wb.addWorksheet(`${MONTHS_ES[m]} ${year}`);
    const days = monthDays(year, m);
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 16;
    days.forEach((_, i) => (ws.getColumn(i + 3).width = 4.2));
    const title = ws.getRow(1);
    title.getCell(1).value = `${MONTHS_ES[m].toUpperCase()} ${year}`;
    title.font = { bold: true, size: 14 };
    const dayRow = ws.getRow(2);
    const wdRow = ws.getRow(3);
    dayRow.getCell(1).value = 'Nombre';
    dayRow.getCell(2).value = 'Tienda';
    dayRow.font = { bold: true };
    days.forEach((d, i) => {
      const date = toDate(d);
      dayRow.getCell(i + 3).value = date.getUTCDate();
      wdRow.getCell(i + 3).value = WEEKDAYS_SHORT[date.getUTCDay()];
      dayRow.getCell(i + 3).alignment = wdRow.getCell(i + 3).alignment = { horizontal: 'center' };
    });
    wdRow.font = { color: { argb: 'FF64748B' }, size: 9 };
    emps.forEach((e, idx) => {
      const row = ws.getRow(idx + 4);
      row.getCell(1).value = e.name;
      row.getCell(2).value = e.storeName;
      days.forEach((d, i) => {
        const cell = row.getCell(i + 3);
        cell.alignment = { horizontal: 'center' };
        const a = absenceOn(byEmp.get(e.id), d);
        if (a) {
          const info = ABSENCE_TYPES[a.type];
          cell.value = a.status === 'pendiente' ? `${info.short}?` : info.short;
          cell.fill = solid(a.status === 'pendiente' ? lighten(info.color, 0.6) : lighten(info.color, 0.25));
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
        } else if (!isWorkingDay(d, rules)) cell.fill = solid('#e2e8f0');
      });
    });
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];
    const legendRow = ws.getRow(emps.length + 6);
    legendRow.getCell(1).value = 'Leyenda: ' + Object.values(ABSENCE_TYPES).map((t) => `${t.short} = ${t.label}`).join(' · ') + ' · "?" = pendiente';
    legendRow.font = { italic: true, color: { argb: 'FF64748B' } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Plantilla sencilla en formato listado para quien quiera empezar desde cero. */
export async function exportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vacaciones');
  ws.columns = [
    { header: 'Nombre', width: 28 },
    { header: 'Tienda', width: 20 },
    { header: 'Tipo', width: 18 },
    { header: 'Desde', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Hasta', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Observaciones', width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  const y = new Date().getFullYear();
  ws.addRow(['Ana García', 'Centro', 'Vacaciones', new Date(Date.UTC(y, 7, 3)), new Date(Date.UTC(y, 7, 14)), '']);
  ws.addRow(['Luis Martín', 'Centro', 'Asuntos propios', new Date(Date.UTC(y, 3, 17)), new Date(Date.UTC(y, 3, 17)), 'Mudanza']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
