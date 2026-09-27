import { describe, expect, it } from 'vitest';
import { readCsv, readWorkbook } from '../server/excel.ts';
import { analyzeWorkbook, extractAbsences, mergeDays, monthFromTitle } from '../shared/importer.ts';
import type { Analysis, MarkerTarget } from '../shared/importer.ts';
import { dayRules, spanishNationalHolidays } from '../shared/dates.ts';
import type { RawWorkbook } from '../shared/types.ts';
import { SAMPLES } from '../scripts/samples.ts';

const rules = dayRules({ workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: spanishNationalHolidays(2026) });

async function load(name: string) {
  const wb = await readWorkbook(await SAMPLES[name](), name);
  const analysis = analyzeWorkbook(wb, { year: 2026 });
  return { wb, analysis };
}

function run(wb: RawWorkbook, analysis: Analysis, opts: { sheetNamesAsStores?: boolean; mapping?: Record<string, MarkerTarget> } = {}) {
  const mapping = Object.fromEntries(analysis.markers.map((m) => [m.key, m.suggested]));
  return extractAbsences(wb, analysis, {
    mapping: { ...mapping, ...opts.mapping },
    includeEmployees: new Set(analysis.employees.filter((e) => e.include).map((e) => e.key)),
    sheetNamesAsStores: opts.sheetNamesAsStores ?? false,
    rules,
  });
}

const simple = (list: ReturnType<typeof run>) => list.map((a) => `${a.employeeName}|${a.start}|${a.end}|${a.type}${a.store ? '|' + a.store : ''}`);

describe('cuadrante mensual (una hoja por mes, letras)', () => {
  it('detecta personas, marcas y periodos', async () => {
    const { wb, analysis } = await load('cuadrante-mensual.xlsx');
    expect(analysis.blocks).toHaveLength(12);
    const included = analysis.employees.filter((e) => e.include).map((e) => e.name).sort();
    expect(included).toEqual(['Ana García', 'Jordi Puig', 'Luis Martín', 'Marta Soler']);
    // La fila de leyenda se ve en el asistente pero desmarcada
    expect(analysis.employees.find((e) => e.name.startsWith('Leyenda'))?.include).toBe(false);
    expect(analysis.markers.map((m) => m.key).sort()).toEqual(['t:AP', 't:B', 't:V']);
    // Los fines de semana en gris no cuentan como marca
    expect(analysis.markers.some((m) => m.kind === 'fill')).toBe(false);
    const out = simple(run(wb, analysis));
    expect(out).toEqual([
      'Ana García|2026-07-06|2026-07-17|vacaciones',
      'Ana García|2026-12-21|2026-12-24|vacaciones',
      'Jordi Puig|2026-08-17|2026-08-28|vacaciones',
      'Luis Martín|2026-03-12|2026-03-12|asuntos_propios',
      'Luis Martín|2026-08-03|2026-08-14|vacaciones',
      'Marta Soler|2026-04-06|2026-04-08|baja',
      'Marta Soler|2026-07-20|2026-07-31|vacaciones',
    ]);
  });
});

describe('año en horizontal con colores', () => {
  it('lee meses combinados, colores (también de tema) y la columna de tienda', async () => {
    const { wb, analysis } = await load('cuadrante-colores.xlsx');
    expect(analysis.blocks).toHaveLength(1);
    const fills = analysis.markers.filter((m) => m.kind === 'fill');
    expect(fills).toHaveLength(3);
    expect(fills[0]).toMatchObject({ key: 'f:FFFFFF00', suggested: 'vacaciones' });
    const theme = fills.find((m) => m.key.startsWith('f:theme:5'));
    expect(theme?.color).toMatch(/^#[0-9A-F]{6}$/);
    const out = simple(
      run(wb, analysis, { mapping: { 'f:FF92D050': 'asuntos_propios', [theme!.key]: 'vacaciones' } }),
    );
    expect(out).toEqual([
      'Carla Ruiz|2026-08-01|2026-08-15|vacaciones|Diagonal',
      'Núria Vidal|2026-08-17|2026-08-31|vacaciones|Gràcia',
      'Pedro Gil|2026-02-09|2026-02-09|asuntos_propios|Diagonal',
      'Pedro Gil|2026-07-13|2026-07-24|vacaciones|Diagonal',
      'Sergio León|2026-12-28|2026-12-31|vacaciones|Gràcia',
    ]);
  });
});

describe('listado', () => {
  it('lee filas Nombre/Desde/Hasta con tipo, tienda y fechas en texto', async () => {
    const { wb, analysis } = await load('listado.xlsx');
    expect(analysis.blocks[0].kind).toBe('list');
    const out = run(wb, analysis);
    expect(simple(out)).toEqual([
      'Elena Torres|2026-07-01|2026-07-15|vacaciones|Sants',
      'Elena Torres|2026-10-05|2026-10-05|asuntos_propios|Sants',
      'Irene Mas|2026-02-02|2026-02-20|baja|Les Corts',
      'Irene Mas|2026-09-07|2026-09-11|vacaciones|Les Corts',
      'Raúl Campos|2026-08-03|2026-08-21|vacaciones|Sants',
    ]);
    expect(out.find((a) => a.start === '2026-10-05')?.note).toBe('Boda');
  });

  it('interpreta la columna "regreso" como el día de vuelta', () => {
    const wb = readCsv('Empleado;Salida;Regreso\nMaria Pons;01/08/2026;17/08/2026\n', 'viajes.csv');
    const analysis = analyzeWorkbook(wb);
    expect(simple(run(wb, analysis))).toEqual(['Maria Pons|2026-08-01|2026-08-16|vacaciones']);
  });
});

describe('cuadrante traspuesto', () => {
  it('detecta fechas en filas y personas en columnas', async () => {
    const { wb, analysis } = await load('traspuesto.xlsx');
    expect(analysis.blocks[0]).toMatchObject({ kind: 'grid', transposed: true });
    expect(simple(run(wb, analysis))).toEqual([
      'Laura|2026-08-10|2026-08-21|vacaciones',
      'Pau|2026-08-24|2026-08-28|vacaciones',
      'Toni|2026-07-06|2026-07-10|vacaciones',
    ]);
  });
});

describe('una hoja por tienda', () => {
  it('sugiere usar el nombre de la hoja como tienda', async () => {
    const { wb, analysis } = await load('por-tiendas.xlsx');
    expect(analysis.sheetNamesLookLikeStores).toBe(true);
    const out = simple(run(wb, analysis, { sheetNamesAsStores: true }));
    expect(out).toEqual([
      'Berta Roca|2026-07-09|2026-07-18|vacaciones|Gràcia',
      'Clara Font|2026-07-06|2026-07-15|vacaciones|Diagonal',
      'Iván Soto|2026-08-08|2026-08-17|vacaciones|Gràcia',
      'Óscar Ferrer|2026-08-05|2026-08-14|vacaciones|Diagonal',
    ]);
  });
});

describe('ejemplo realista de óptica', () => {
  it('lee las tres tiendas, letras, celdas pintadas e ignora domingos y festivos', async () => {
    const { wb, analysis } = await load('ejemplo-optica.xlsx');
    expect(analysis.blocks).toHaveLength(12);
    expect(analysis.employees.filter((e) => e.include)).toHaveLength(14);
    expect(analysis.markers.map((m) => m.key).sort()).toEqual(['f:FFFFEB84', 't:AP', 't:B', 't:F', 't:V']);
    const out = run(wb, analysis);
    expect(new Set(out.map((a) => a.store))).toEqual(new Set(['Diagonal', 'Gràcia', 'Sant Andreu']));
    const s = simple(out);
    // Celdas pintadas sin letra
    expect(s).toContain('Sergio Navarro|2026-08-03|2026-08-14|vacaciones|Gràcia');
    // Un periodo que cruza de junio a julio queda unido
    expect(s).toContain('Anna Puig|2026-06-22|2026-07-03|vacaciones|Diagonal');
    // Semana Santa: un periodo que cruza de marzo a abril
    expect(s).toContain('Sergio Navarro|2026-03-30|2026-04-02|vacaciones|Gràcia');
    expect(s).toContain('Marta Roca|2026-01-19|2026-01-30|baja|Gràcia');
  });
});

describe('utilidades', () => {
  it('distingue títulos de mes de nombres de persona', () => {
    expect(monthFromTitle('JULIO 2026')).toBe(6);
    expect(monthFromTitle('Vacaciones de agosto')).toBe(7);
    expect(monthFromTitle('Juliol')).toBe(6);
    expect(monthFromTitle('Julio Pérez')).toBeNull();
    expect(monthFromTitle('Abril Sánchez')).toBeNull();
  });

  it('une días separados solo por fin de semana o festivo', () => {
    const r = mergeDays(
      [
        { date: '2026-08-13', type: 'vacaciones' },
        { date: '2026-08-14', type: 'vacaciones' },
        // 15 agosto festivo (sábado) y 16 domingo
        { date: '2026-08-17', type: 'vacaciones' },
        { date: '2026-08-19', type: 'vacaciones' },
      ],
      rules,
    );
    expect(r).toEqual([
      { start: '2026-08-13', end: '2026-08-17', type: 'vacaciones' },
      { start: '2026-08-19', end: '2026-08-19', type: 'vacaciones' },
    ]);
  });

  it('avisa si el fichero no se reconoce', () => {
    const wb = readCsv('hola;adios\n1;2\n', 'raro.csv');
    const a = analyzeWorkbook(wb);
    expect(a.blocks).toHaveLength(0);
    expect(a.warnings.length).toBeGreaterThan(0);
  });
});
