import { useRef, useState } from 'react';
import type { Holiday, Settings } from '../../shared/types.ts';
import { WEEKDAYS_ES, formatDate, spanishNationalHolidays } from '../../shared/dates.ts';
import { api, download } from '../api.ts';
import { useApp } from '../context.tsx';
import { Icon, PinModal } from '../components/ui.tsx';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SettingsView() {
  const { state, admin, run, toast, logout } = useApp();
  const [form, setForm] = useState<Settings>(state.settings);
  const [newHoliday, setNewHoliday] = useState<Holiday>({ date: '', name: '' });
  const [pin, setPin] = useState({ a: '', b: '' });
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [pinModal, setPinModal] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(state.settings);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => run(() => api('PUT', '/api/settings', form), 'Ajustes guardados');

  const addHolidays = (list: Holiday[]) => {
    const have = new Set(form.holidays.map((h) => h.date));
    set('holidays', [...form.holidays, ...list.filter((h) => !have.has(h.date))].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const years = [...new Set(form.holidays.map((h) => h.date.slice(0, 4)))].sort();
  const nextYear = new Date().getFullYear() + 1;

  return (
    <div className="view narrow">
      <div className="view-header">
        <h1>Ajustes</h1>
        {admin && (
          <div className="toolbar">
            <button className="primary" onClick={save} disabled={!dirty}>
              Guardar cambios
            </button>
          </div>
        )}
      </div>

      <section className="card">
        <h3>Exportar</h3>
        <p className="muted small">Descarga un Excel con el resumen de saldos, el listado de ausencias y un cuadrante por mes con colores.</p>
        <div className="inline-row">
          <select value={exportYear} onChange={(e) => setExportYear(Number(e.target.value))}>
            {[exportYear - 1, exportYear, exportYear + 1].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <button onClick={() => download(`/api/export?year=${exportYear}`, `vacaciones-${exportYear}.xlsx`).catch((e) => toast(e.message, 'error'))}>
            <Icon name="download" /> Descargar Excel
          </button>
        </div>
      </section>

      {!admin ? (
        <div className="callout">
          <Icon name="lock" />
          <div>
            Los ajustes solo los puede cambiar el responsable.{' '}
            <button className="link" onClick={() => setPinModal(true)}>
              Entrar con PIN
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="card">
            <h3>General</h3>
            <label className="field">
              <span>Nombre de la empresa</span>
              <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </label>
            <div className="row-2">
              <label className="field">
                <span>Días de vacaciones al año (por defecto)</span>
                <input type="number" min={0} max={366} value={form.defaultAnnualDays} onChange={(e) => set('defaultAnnualDays', Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Cómo se cuentan</span>
                <select value={form.countMode} onChange={(e) => set('countMode', e.target.value as Settings['countMode'])}>
                  <option value="laborables">Días laborables</option>
                  <option value="naturales">Días naturales</option>
                </select>
              </label>
            </div>
            <div className="field">
              <span>Días que se trabaja</span>
              <div className="weekday-toggle">
                {WEEK_ORDER.map((d) => {
                  const on = form.workingWeekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={on ? 'selected' : ''}
                      onClick={() => set('workingWeekdays', on ? form.workingWeekdays.filter((x) => x !== d) : [...form.workingWeekdays, d].sort())}
                    >
                      {WEEKDAYS_ES[d].slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <small className="muted">
                Se usa para contar días laborables y avisar de la cobertura mínima. En óptica suele trabajarse de lunes a sábado.
              </small>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Festivos</h3>
              <div className="inline-row">
                {[nextYear - 1, nextYear].map((y) => (
                  <button key={y} className="small-btn" onClick={() => addHolidays(spanishNationalHolidays(y))}>
                    + Nacionales {y}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted small">
              Añade también los autonómicos y locales de vuestra ciudad. Los festivos no cuentan como días de vacaciones en modo laborable.
            </p>
            <div className="inline-row">
              <input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })} />
              <input placeholder="Nombre (p. ej. La Mercè)" value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} />
              <button
                disabled={!newHoliday.date}
                onClick={() => {
                  addHolidays([{ date: newHoliday.date, name: newHoliday.name || 'Festivo local' }]);
                  setNewHoliday({ date: '', name: '' });
                }}
              >
                Añadir
              </button>
            </div>
            {years.map((y) => (
              <div key={y} className="holiday-year">
                <h4>{y}</h4>
                <div className="holiday-chips">
                  {form.holidays
                    .filter((h) => h.date.startsWith(y))
                    .map((h) => (
                      <span key={h.date} className="holiday-chip">
                        <b>{formatDate(h.date, { withWeekday: true })}</b> {h.name}
                        <button className="icon-btn tiny" onClick={() => set('holidays', form.holidays.filter((x) => x.date !== h.date))} aria-label={`Quitar ${h.name}`}>
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>PIN de responsable</h3>
              <button className="small-btn" onClick={logout}>
                <Icon name="lock" /> Salir del modo responsable
              </button>
            </div>
            <div className="inline-row">
              <input type="password" inputMode="numeric" placeholder="Nuevo PIN (4-8 cifras)" value={pin.a} onChange={(e) => setPin({ ...pin, a: e.target.value })} />
              <input type="password" inputMode="numeric" placeholder="Repítelo" value={pin.b} onChange={(e) => setPin({ ...pin, b: e.target.value })} />
              <button
                disabled={!pin.a || pin.a !== pin.b}
                onClick={async () => {
                  const ok = await run(() => api('PUT', '/api/settings', { newPin: pin.a }), 'PIN cambiado. Vuelve a entrar con el nuevo.');
                  if (ok) {
                    setPin({ a: '', b: '' });
                    sessionStorage.removeItem('adminPin');
                    location.reload();
                  }
                }}
              >
                Cambiar PIN
              </button>
            </div>
          </section>

          <section className="card">
            <h3>Copia de seguridad</h3>
            <p className="muted small">
              El servidor guarda una copia automática al día. Además puedes descargar todos los datos en un fichero y restaurarlos más tarde.
            </p>
            <div className="inline-row">
              <button onClick={() => download('/api/backup', `vacaciones-copia-${new Date().toISOString().slice(0, 10)}.json`)}>
                <Icon name="download" /> Descargar copia
              </button>
              <button onClick={() => restoreInput.current?.click()}>
                <Icon name="upload" /> Restaurar copia…
              </button>
              <input
                ref={restoreInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f || !confirm('Se reemplazarán TODOS los datos actuales por los de la copia. ¿Continuar?')) return;
                  try {
                    const data = JSON.parse(await f.text());
                    await run(() => api('POST', '/api/restore', data), 'Copia restaurada');
                  } catch {
                    toast('El fichero no es una copia válida', 'error');
                  }
                }}
              />
            </div>
          </section>
        </>
      )}
      {pinModal && <PinModal onClose={() => setPinModal(false)} />}
    </div>
  );
}
