/**
 * Excel de ejemplo realista: el tipo de cuadrante que suele usar una óptica con varias tiendas.
 * Una hoja por mes, columna de tienda, marcas con letras, domingos en gris, festivos en rosa
 * y alguna persona que marca sus vacaciones pintando las celdas en vez de escribir la letra.
 */
import ExcelJS from 'exceljs';
import { spanishNationalHolidays } from '../shared/dates.ts';

const Y = 2026;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const SUNDAY = solid('FFD9D9D9');
const HOLIDAY = solid('FFF8CBDA');
const PAINTED = solid('FFFFEB84');
const HEADER = solid('FF1F4E78');

// [mes (1-12), desde, hasta, marca]. Marca "#" = celda pintada sin letra.
type Period = [number, number, number, string];

const TEAM: { store: string; people: [string, Period[]][] }[] = [
  {
    store: 'Diagonal',
    people: [
      ['Laura Fernández', [[3, 20, 20, 'AP'], [7, 6, 17, 'V'], [12, 21, 24, 'V']]],
      ['Marc Soler', [[2, 16, 16, 'AP'], [8, 3, 14, 'V'], [10, 13, 16, 'V']]],
      ['Cristina Vidal', [[3, 9, 13, 'B'], [8, 10, 21, 'V'], [12, 28, 31, 'V']]],
      ['Javier Moreno', [[7, 20, 31, 'V'], [11, 2, 6, 'v']]],
      ['Anna Puig', [[6, 22, 30, 'V'], [7, 1, 3, 'V'], [9, 7, 11, 'V'], [10, 21, 22, 'F']]],
    ],
  },
  {
    store: 'Gràcia',
    people: [
      ['Pau Ribas', [[8, 17, 28, 'V'], [12, 21, 24, 'V']]],
      ['Elena Castro', [[5, 15, 15, 'AP'], [7, 13, 24, 'V'], [12, 28, 31, 'V']]],
      ['Sergio Navarro', [[3, 30, 31, 'V'], [4, 1, 2, 'V'], [8, 3, 14, '#']]],
      ['Marta Roca', [[1, 19, 30, 'B'], [8, 17, 31, 'V']]],
    ],
  },
  {
    store: 'Sant Andreu',
    people: [
      ['Jordi Martí', [[7, 27, 31, 'V'], [8, 1, 7, 'V'], [12, 28, 31, 'V']]],
      ['Lucía Romero', [[6, 5, 5, 'AP'], [8, 10, 21, 'V']]],
      ['David Serra', [[6, 29, 30, 'V'], [7, 1, 10, 'V'], [10, 5, 9, 'V']]],
      ['Núria Font', [[8, 3, 14, 'V'], [12, 21, 24, 'V']]],
      ['Albert Costa', [[4, 22, 23, 'F'], [9, 14, 25, 'V']]],
    ],
  },
];

export async function opticaExample(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const holidays = new Set(spanishNationalHolidays(Y).map((h) => h.date));

  MONTHS.forEach((name, m0) => {
    const ws = wb.addWorksheet(name);
    const days = new Date(Date.UTC(Y, m0 + 1, 0)).getUTCDate();
    const iso = (d: number) => `${Y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = (d: number) => new Date(Date.UTC(Y, m0, d)).getUTCDay();

    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 13;
    for (let d = 1; d <= days; d++) ws.getColumn(d + 2).width = 4;

    ws.getCell('A1').value = `VACACIONES ${name.toUpperCase()} ${Y}`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } };

    const head = ws.getRow(3);
    const wdRow = ws.getRow(4);
    head.getCell(1).value = 'Nombre';
    head.getCell(2).value = 'Tienda';
    for (let d = 1; d <= days; d++) {
      head.getCell(d + 2).value = d;
      wdRow.getCell(d + 2).value = WD[dow(d)];
    }
    head.eachCell((c) => {
      c.fill = HEADER;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { horizontal: 'center' };
    });
    wdRow.font = { size: 9, color: { argb: 'FF7F7F7F' } };
    wdRow.alignment = { horizontal: 'center' };

    let r = 5;
    for (const { store, people } of TEAM) {
      for (const [person, periods] of people) {
        const row = ws.getRow(r++);
        row.getCell(1).value = person;
        row.getCell(2).value = store;
        for (let d = 1; d <= days; d++) {
          const cell = row.getCell(d + 2);
          cell.alignment = { horizontal: 'center' };
          cell.border = { right: { style: 'hair', color: { argb: 'FFBFBFBF' } } };
          const sunday = dow(d) === 0;
          const holiday = holidays.has(iso(d));
          if (sunday) cell.fill = SUNDAY;
          else if (holiday) cell.fill = HOLIDAY;
          if (sunday || holiday) continue;
          for (const [pm, from, to, mark] of periods) {
            if (pm !== m0 + 1 || d < from || d > to) continue;
            if (mark === '#') cell.fill = PAINTED;
            else {
              cell.value = mark;
              cell.font = { bold: true };
            }
          }
        }
      }
    }

    ws.getCell(`A${r + 1}`).value = 'Leyenda: V = vacaciones · AP = asuntos propios · B = baja · F = formación · gris = domingo · rosa = festivo';
    ws.getCell(`A${r + 1}`).font = { italic: true, size: 9, color: { argb: 'FF7F7F7F' } };
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
