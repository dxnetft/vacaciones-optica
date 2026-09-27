import { useMemo, useRef, useState } from 'react';
import { ABSENCE_TYPES, ABSENCE_TYPE_KEYS } from '../../shared/types.ts';
import type { ImportPayload, ImportResult, RawWorkbook } from '../../shared/types.ts';
import { countDays, dayRules, formatDate, formatRange } from '../../shared/dates.ts';
import { analyzeWorkbook, employeeKey, employeeStores, extractAbsences } from '../../shared/importer.ts';
import type { MarkerTarget } from '../../shared/importer.ts';
import { api, download } from '../api.ts';
import { useApp } from '../context.tsx';
import { Icon, PinModal } from '../components/ui.tsx';

type Step = 'upload' | 'review' | 'done';

export function ImportView({ onFinish }: { onFinish: () => void }) {
  const { state, admin, reload, toast } = useApp();
  const [step, setStep] = useState<Step>('upload');
  const [wb, setWb] = useState<RawWorkbook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pin, setPin] = useState(false);

  if (!admin) {
    return (
      <div className="view narrow">
        <h1>Importar Excel</h1>
        <div className="callout">
          <Icon name="lock" />
          <div>
            Importar datos está reservado al responsable.{' '}
            <button className="link" onClick={() => setPin(true)}>
              Entrar con PIN
            </button>
          </div>
        </div>
        {pin && <PinModal onClose={() => setPin(false)} />}
      </div>
    );
  }

  const upload = async (file: File) => {
    setLoading(true);
    setError('');
    try {
      const data = await api<RawWorkbook>('POST', `/api/import/parse?name=${encodeURIComponent(file.name)}`, undefined, await file.arrayBuffer());
      setWb(data);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido leer el fichero');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done' && result) {
    return (
      <div className="view narrow">
        <div className="done-card">
          <div className="done-icon">
            <Icon name="check" size={32} />
          </div>
          <h1>¡Importación completada!</h1>
          <ul className="done-stats">
            <li>
              <b>{result.createdAbsences}</b> ausencias importadas
            </li>
            <li>
              <b>{result.createdEmployees}</b> personas nuevas
            </li>
            <li>
              <b>{result.createdStores}</b> tiendas nuevas
            </li>
            {result.removedAbsences > 0 && (
              <li>
                <b>{result.removedAbsences}</b> ausencias de importaciones anteriores reemplazadas
              </li>
            )}
          </ul>
          <p className="muted">
            A partir de ahora ya podéis pedir y aprobar vacaciones desde aquí. Si alguna tienda necesita un mínimo de personal, configúralo en "Equipo".
          </p>
          <div className="done-actions">
            <button onClick={() => { setStep('upload'); setWb(null); setResult(null); }}>Importar otro fichero</button>
            <button className="primary" onClick={onFinish}>
              Ver el calendario
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'review' && wb) {
    return (
      <Review
        wb={wb}
        onBack={() => {
          setStep('upload');
          setWb(null);
        }}
        onDone={async (payload) => {
          try {
            const r = await api<ImportResult>('POST', '/api/import/commit', payload);
            await reload();
            setResult(r);
            setStep('done');
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Error al importar', 'error');
          }
        }}
        existingNames={new Set(state.employees.map((e) => employeeKey(e.name)))}
        hasImported={state.absences.some((a) => a.source === 'excel')}
      />
    );
  }

  return (
    <div className="view narrow">
      <h1>Importar vuestro Excel</h1>
      <p className="muted intro">
        No hace falta cambiar nada del Excel que ya usáis. Súbelo tal cual: detectamos automáticamente las personas, los días y las marcas
        (letras como <b>V</b> o <b>AP</b>, o celdas pintadas de color). Antes de guardar nada verás un resumen para revisarlo.
      </p>
      <DropZone onFile={upload} loading={loading} />
      {error && (
        <div className="callout callout-bad">
          <Icon name="alert" /> {error}
        </div>
      )}
      <div className="formats">
        <h3>Formatos que reconoce</h3>
        <div className="format-grid">
          <FormatCard title="Cuadrante por meses" text="Una fila por persona y una columna por día (1, 2, 3… o fechas). Una hoja por mes, varios meses en la misma hoja o el año entero en horizontal." />
          <FormatCard title="Celdas de colores" text="Si marcáis las vacaciones pintando las celdas, te preguntaremos qué significa cada color. Los fines de semana sombreados se ignoran." />
          <FormatCard title="Listado" text='Una fila por periodo, con columnas como "Nombre", "Desde"/"Hasta" (o "Fecha inicio"/"Fecha fin"), y opcionalmente "Tipo" y "Tienda".' />
          <FormatCard title="Por tiendas" text="Una hoja por tienda: se ofrece usar el nombre de cada hoja como tienda. También vale una columna «Tienda» o «Centro»." />
        </div>
        <p className="muted small">
          Se admiten ficheros <b>.xlsx</b> y <b>.csv</b>. Si tenéis un <b>.xls</b> antiguo, ábrelo en Excel y guárdalo como .xlsx.{' '}
          <button className="link" onClick={() => download('/api/template', 'plantilla-vacaciones.xlsx')}>
            Descargar plantilla vacía
          </button>
        </p>
      </div>
    </div>
  );
}

function FormatCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="format-card">
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function DropZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
    >
      <div className="dropzone-icon">
        <Icon name={loading ? 'file' : 'upload'} size={30} />
      </div>
      <b>{loading ? 'Leyendo el Excel…' : 'Arrastra aquí el Excel o haz clic para elegirlo'}</b>
      <span className="muted small">.xlsx, .xlsm o .csv</span>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.csv,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Review({
  wb,
  onBack,
  onDone,
  existingNames,
  hasImported,
}: {
  wb: RawWorkbook;
  onBack: () => void;
  onDone: (p: ImportPayload) => Promise<void>;
  existingNames: Set<string>;
  hasImported: boolean;
}) {
  const { state } = useApp();
  const [year, setYear] = useState<number | undefined>(undefined);
  const analysis = useMemo(() => analyzeWorkbook(wb, { year }), [wb, year]);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, MarkerTarget>>({});
  const [peopleOverrides, setPeopleOverrides] = useState<Record<string, boolean>>({});
  const [excludedSheets, setExcludedSheets] = useState<Set<number>>(new Set());
  const [sheetsAsStores, setSheetsAsStores] = useState<boolean>(analysis.sheetNamesLookLikeStores);
  const [replace, setReplace] = useState(hasImported);
  const [saving, setSaving] = useState(false);
  const rules = useMemo(() => dayRules(state.settings), [state.settings]);

  const mapping = useMemo(
    () => Object.fromEntries(analysis.markers.map((m) => [m.key, mappingOverrides[m.key] ?? m.suggested])),
    [analysis.markers, mappingOverrides],
  );
  const included = useMemo(
    () => new Set(analysis.employees.filter((e) => peopleOverrides[e.key] ?? e.include).map((e) => e.key)),
    [analysis.employees, peopleOverrides],
  );
  const sheetSet = useMemo(
    () => new Set(analysis.blocks.map((b) => b.sheetIndex).filter((i) => !excludedSheets.has(i))),
    [analysis.blocks, excludedSheets],
  );
  const preview = useMemo(
    () => extractAbsences(wb, analysis, { mapping, includeEmployees: included, sheetNamesAsStores: sheetsAsStores, sheets: sheetSet, rules }),
    [wb, analysis, mapping, included, sheetsAsStores, sheetSet, rules],
  );
  const stores = useMemo(() => employeeStores(analysis, sheetsAsStores), [analysis, sheetsAsStores]);

  const byPerson = useMemo(() => {
    const map = new Map<string, typeof preview>();
    for (const e of analysis.employees) if (included.has(e.key)) map.set(e.key, []);
    for (const a of preview) map.get(employeeKey(a.employeeName))?.push(a);
    return [...map.entries()];
  }, [preview, analysis.employees, included]);

  const sheets = useMemo(() => {
    const m = new Map<number, { name: string; desc: string[] }>();
    for (const b of analysis.blocks) {
      const s = m.get(b.sheetIndex) ?? { name: b.sheet, desc: [] };
      if (b.kind === 'grid') {
        const first = b.dayCols[0]?.date;
        const last = b.dayCols[b.dayCols.length - 1]?.date;
        s.desc.push(`${b.transposed ? 'Cuadrante (días en filas)' : 'Cuadrante'} · ${b.dataRows.length} filas · ${first && last ? formatRange(first, last) : ''}`);
      } else s.desc.push(`Listado · ${b.dataRows.length} filas`);
      m.set(b.sheetIndex, s);
    }
    return [...m.entries()];
  }, [analysis.blocks]);

  const usesDayNumbers = analysis.blocks.length > 0;
  const commit = async () => {
    setSaving(true);
    const employees = analysis.employees.filter((e) => included.has(e.key)).map((e) => ({ name: e.name, store: stores.get(e.key) }));
    await onDone({ employees, absences: preview, replaceImported: replace });
    setSaving(false);
  };

  return (
    <div className="view import-review">
      <div className="view-header">
        <div>
          <h1>Revisar importación</h1>
          <p className="muted">
            <Icon name="file" size={14} /> {wb.fileName}
          </p>
        </div>
        <div className="toolbar">
          <button onClick={onBack}>Elegir otro fichero</button>
          <button className="primary" onClick={commit} disabled={saving || (!preview.length && !included.size)}>
            {saving ? 'Importando…' : `Importar ${preview.length} ausencias de ${included.size} personas`}
          </button>
        </div>
      </div>

      {analysis.warnings.map((w) => (
        <div key={w} className="callout callout-warn">
          <Icon name="alert" /> {w}
        </div>
      ))}

      {analysis.blocks.length > 0 && (
        <div className="review-grid">
          <section className="card">
            <h3>1 · Hojas detectadas</h3>
            <ul className="check-list">
              {sheets.map(([i, s]) => (
                <li key={i}>
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={!excludedSheets.has(i)}
                      onChange={(e) => {
                        const next = new Set(excludedSheets);
                        if (e.target.checked) next.delete(i);
                        else next.add(i);
                        setExcludedSheets(next);
                      }}
                    />
                    <span>
                      <b>{s.name}</b>
                      <span className="muted small"> — {s.desc.join(' · ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {wb.sheets.length > sheets.length && (
              <p className="muted small">
                Hojas sin datos reconocibles (se ignoran):{' '}
                {wb.sheets.filter((_, i) => !sheets.some(([j]) => j === i)).map((s) => s.name).join(', ')}
              </p>
            )}
            {usesDayNumbers && (
              <label className="field inline-field">
                <span>Año si el Excel no lo indica</span>
                <input type="number" value={year ?? analysis.year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value) || undefined)} />
              </label>
            )}
            {analysis.dateRange && (
              <p className="muted small">
                Fechas encontradas: del {formatDate(analysis.dateRange[0], { withYear: true })} al {formatDate(analysis.dateRange[1], { withYear: true })}.
              </p>
            )}
            <label className="check-inline">
              <input type="checkbox" checked={sheetsAsStores} onChange={(e) => setSheetsAsStores(e.target.checked)} />
              Cada hoja es una tienda (usar el nombre de la hoja como tienda)
            </label>
            {hasImported && (
              <label className="check-inline">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                Reemplazar lo importado anteriormente en estas fechas (evita duplicados si vuelves a importar)
              </label>
            )}
          </section>

          <section className="card">
            <h3>2 · ¿Qué significa cada marca?</h3>
            {analysis.markers.length === 0 ? (
              <p className="muted">No se ha encontrado ninguna marca en los días.</p>
            ) : (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Marca en el Excel</th>
                    <th className="num">Veces</th>
                    <th>Es…</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.markers.map((m) => (
                    <tr key={m.key}>
                      <td>
                        {m.kind === 'fill' ? (
                          <span className="marker">
                            <i style={{ background: m.color ?? '#ccc' }} /> Celda coloreada
                          </span>
                        ) : m.kind === 'list' ? (
                          <span className="muted">{m.label}</span>
                        ) : (
                          <code className="marker-text">{m.label}</code>
                        )}
                      </td>
                      <td className="num">{m.count}</td>
                      <td>
                        <select
                          value={mapping[m.key]}
                          onChange={(e) => setMappingOverrides({ ...mappingOverrides, [m.key]: e.target.value as MarkerTarget })}
                        >
                          {ABSENCE_TYPE_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {ABSENCE_TYPES[k].label}
                            </option>
                          ))}
                          <option value="ignorar">No es una ausencia (ignorar)</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {analysis.employees.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>3 · Personas y periodos</h3>
            <span className="muted small">Desmarca las filas que no sean personas (totales, títulos, leyendas…)</span>
          </div>
          <div className="people-preview">
            {analysis.employees.map((e) => {
              const on = included.has(e.key);
              const list = byPerson.find(([k]) => k === e.key)?.[1] ?? [];
              const vacDays = list
                .filter((a) => ABSENCE_TYPES[a.type].countsAgainstBalance)
                .reduce((n, a) => n + countDays(a.start, a.end, state.settings.countMode, rules), 0);
              return (
                <div key={e.key} className={`pp-row ${on ? '' : 'off'}`}>
                  <label className="check-inline pp-name">
                    <input type="checkbox" checked={on} onChange={(ev) => setPeopleOverrides({ ...peopleOverrides, [e.key]: ev.target.checked })} />
                    <span>
                      <b>{e.name}</b>
                      <span className="muted small">
                        {stores.get(e.key) ? ` · ${stores.get(e.key)}` : ''}
                        {existingNames.has(e.key) ? ' · ya existe' : ' · nueva'}
                      </span>
                    </span>
                  </label>
                  {on && (
                    <div className="pp-periods">
                      {list.length === 0 && <span className="muted small">Sin ausencias</span>}
                      {list.map((a) => (
                        <span key={`${a.start}${a.type}`} className="period" style={{ '--c': ABSENCE_TYPES[a.type].color } as React.CSSProperties}>
                          {formatRange(a.start, a.end)}
                          {a.type !== 'vacaciones' && <em> · {ABSENCE_TYPES[a.type].label}</em>}
                        </span>
                      ))}
                    </div>
                  )}
                  {on && vacDays > 0 && <span className="pp-total">{vacDays} d</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
