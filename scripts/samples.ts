/**
 * Excels de ejemplo con los formatos típicos que usan las empresas para las vacaciones.
 * Sirven para las pruebas automáticas y para probar el asistente de importación.
 */
import ExcelJS from 'exceljs';

const Y = 2026;
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const gray: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
const yellow: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const green: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
const themeOrange: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 5, tint: 0.3999 } as unknown as ExcelJS.Color };

const utc = (m: number, d: number) => new Date(Date.UTC(Y, m, d));
const dim = (m: number) => new Date(Date.UTC(Y, m + 1, 0)).getUTCDate();
const dow = (m: number, d: number) => utc(m, d).getUTCDay();

async function buf(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Una hoja por mes, días 1..31 en la cabecera, marcas con letras y fines de semana en gris. */
export async function monthlySheets(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const people = ['Ana García', 'Luis Martín', 'Marta Soler', 'Jordi Puig'];
  const marks: Record<string, [number, number, number, string][]> = {
    // [mes, desde, hasta, marca]
    'Ana García': [[6, 6, 17, 'V'], [11, 21, 24, 'V']],
    'Luis Martín': [[7, 3, 14, 'V'], [2, 12, 12, 'AP']],
    'Marta Soler': [[6, 20, 31, 'V'], [3, 6, 8, 'B']],
    'Jordi Puig': [[7, 17, 28, 'v']],
  };
  MONTHS.forEach((name, m) => {
    const ws = wb.addWorksheet(name);
    ws.getCell('A1').value = `VACACIONES ${name.toUpperCase()} ${Y}`;
    ws.getCell('A3').value = 'Nombre';
    for (let d = 1; d <= dim(m); d++) {
      ws.getRow(3).getCell(d + 1).value = d;
      ws.getRow(4).getCell(d + 1).value = WD[dow(m, d)];
    }
    people.forEach((p, i) => {
      const row = ws.getRow(5 + i);
      row.getCell(1).value = p;
      for (let d = 1; d <= dim(m); d++) {
        const cell = row.getCell(d + 1);
        if ([0, 6].includes(dow(m, d))) cell.fill = gray;
        for (const [mm, from, to, mark] of marks[p]) if (mm === m && d >= from && d <= to && dow(m, d) !== 0) cell.value = mark;
      }
    });
    ws.getCell(`A${6 + people.length}`).value = 'Leyenda: V vacaciones, AP asuntos propios, B baja';
  });
  return buf(wb);
}

/** Año completo en horizontal, meses como títulos combinados, marcas pintando celdas. */
export async function yearColors(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Vacaciones ${Y}`);
  ws.getCell('A2').value = 'Empleado';
  ws.getCell('B2').value = 'Tienda';
  let col = 3;
  const colOf: Record<string, number> = {};
  for (let m = 0; m < 12; m++) {
    ws.getRow(1).getCell(col).value = MONTHS[m].toUpperCase();
    ws.mergeCells(1, col, 1, col + dim(m) - 1);
    for (let d = 1; d <= dim(m); d++) {
      ws.getRow(2).getCell(col).value = d;
      colOf[`${m}-${d}`] = col;
      col++;
    }
  }
  const people: [string, string][] = [['Carla Ruiz', 'Diagonal'], ['Pedro Gil', 'Diagonal'], ['Núria Vidal', 'Gràcia'], ['Sergio León', 'Gràcia']];
  people.forEach(([p, s], i) => {
    const row = ws.getRow(3 + i);
    row.getCell(1).value = p;
    row.getCell(2).value = s;
  });
  const paint = (r: number, m: number, from: number, to: number, fill: ExcelJS.Fill) => {
    for (let d = from; d <= to; d++) ws.getRow(r).getCell(colOf[`${m}-${d}`]).fill = fill;
  };
  paint(3, 7, 1, 15, yellow); // Carla: 1-15 agosto
  paint(4, 6, 13, 24, yellow); // Pedro: 13-24 julio
  paint(4, 1, 9, 9, green); // Pedro: 9 feb asunto propio
  paint(5, 7, 17, 31, themeOrange); // Núria: 17-31 agosto (color de tema)
  paint(6, 11, 28, 31, yellow); // Sergio: 28-31 dic
  return buf(wb);
}

/** Listado clásico: una fila por periodo. */
export async function listFormat(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vacaciones');
  ws.addRow(['Registro de vacaciones']);
  ws.addRow([]);
  ws.addRow(['Nombre y apellidos', 'Centro', 'Tipo', 'Fecha inicio', 'Fecha fin', 'Observaciones']);
  ws.addRow(['Elena Torres', 'Sants', 'Vacaciones', utc(6, 1), utc(6, 15), '']);
  ws.addRow(['Elena Torres', 'Sants', 'Asuntos propios', utc(9, 5), utc(9, 5), 'Boda']);
  ws.addRow(['Raúl Campos', 'Sants', 'Vacaciones', '03/08/2026', '21/08/2026', '']);
  ws.addRow(['Irene Mas', 'Les Corts', 'Baja', utc(1, 2), utc(1, 20), '']);
  ws.addRow(['Irene Mas', 'Les Corts', '', utc(8, 7), utc(8, 11), 'sin tipo']);
  return buf(wb);
}

/** Cuadrante traspuesto: una fila por día (fechas reales) y una columna por persona. */
export async function transposed(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Verano');
  ws.getRow(1).values = ['Fecha', 'Toni', 'Laura', 'Pau'];
  let r = 2;
  for (let m = 6; m <= 7; m++) {
    for (let d = 1; d <= dim(m); d++) {
      const row = ws.getRow(r++);
      row.getCell(1).value = utc(m, d);
      row.getCell(1).numFmt = 'dd/mm/yyyy';
      if (m === 6 && d >= 6 && d <= 10) row.getCell(2).value = 'X';
      if (m === 7 && d >= 10 && d <= 21) row.getCell(3).value = 'X';
      if (m === 7 && d >= 24 && d <= 28) row.getCell(4).value = 'X';
    }
  }
  return buf(wb);
}

/** Una hoja por tienda con fechas reales en la cabecera. */
export async function perStore(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const stores: [string, string[]][] = [['Diagonal', ['Clara Font', 'Óscar Ferrer']], ['Gràcia', ['Berta Roca', 'Iván Soto']]];
  stores.forEach(([store, people], si) => {
    const ws = wb.addWorksheet(store);
    ws.getCell('A1').value = 'Persona';
    let c = 2;
    for (let m = 6; m <= 7; m++) {
      for (let d = 1; d <= dim(m); d++) {
        const cell = ws.getRow(1).getCell(c++);
        cell.value = utc(m, d);
        cell.numFmt = 'd/m';
      }
    }
    people.forEach((p, i) => {
      const row = ws.getRow(2 + i);
      row.getCell(1).value = p;
      const startCol = 2 + (i === 0 ? 5 : 35) + si * 3; // julio o agosto
      for (let k = 0; k < 10; k++) row.getCell(startCol + k).value = 'VAC';
    });
  });
  return buf(wb);
}

export const SAMPLES: Record<string, () => Promise<Buffer>> = {
  'cuadrante-mensual.xlsx': monthlySheets,
  'cuadrante-colores.xlsx': yearColors,
  'listado.xlsx': listFormat,
  'traspuesto.xlsx': transposed,
  'por-tiendas.xlsx': perStore,
};
