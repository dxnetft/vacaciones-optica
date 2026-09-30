import { useMemo, useState } from 'react';
import { SHIFTS } from '../../shared/types.ts';
import type { Employee, EmployeeSchedule, Shift, Store } from '../../shared/types.ts';
import { WEEKDAYS_ES, WEEKDAYS_SHORT, addDays, dayRules, mondayOf, todayISO, weekday } from '../../shared/dates.ts';
import { allowanceFor, balanceFor } from '../../shared/stats.ts';
import { currentRotationIndex, describeSchedule, hasWeekdaySplit, rotationStartFor, scheduledOn, workOn } from '../../shared/schedule.ts';
import { api } from '../api.ts';
import { useApp } from '../context.tsx';
import { Avatar, Empty, Icon, Modal } from '../components/ui.tsx';

const COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#14b8a6', '#eab308', '#6366f1', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e'];

export function TeamView({ year, onYear }: { year: number; onYear: (y: number) => void }) {
  const { state, admin, run } = useApp();
  const [editEmp, setEditEmp] = useState<Partial<Employee> | null>(null);
  const [editStore, setEditStore] = useState<Partial<Store> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const rules = useMemo(() => dayRules(state.settings), [state.settings]);
  const saturdayColumn = state.settings.countMode === 'laborables' && state.settings.maxVacationSaturdays > 0;

  const storeName = (id: string | null) => state.stores.find((s) => s.id === id)?.name ?? 'Sin tienda';
  const people = [...state.employees]
    .filter((e) => showInactive || e.active)
    .sort((a, b) => storeName(a.storeId).localeCompare(storeName(b.storeId), 'es') || a.name.localeCompare(b.name, 'es'));

  const removeStore = (s: Store) => {
    if (confirm(`¿Borrar la tienda "${s.name}"? Las personas quedarán sin tienda asignada.`)) run(() => api('DELETE', `/api/stores/${s.id}`), 'Tienda borrada');
  };

  return (
    <div className="view">
      <div className="view-header">
        <h1>Equipo</h1>
        <div className="toolbar">
          <select value={year} onChange={(e) => onYear(Number(e.target.value))} aria-label="Año de los saldos">
            {[year - 2, year - 1, year, year + 1, year + 2].map((y) => (
              <option key={y} value={y}>
                Saldos {y}
              </option>
            ))}
          </select>
          {admin && (
            <>
              <button onClick={() => setEditStore({ name: '', minStaff: 0 })}>
                <Icon name="store" /> Nueva tienda
              </button>
              <button className="primary" onClick={() => setEditEmp({ name: '', storeId: state.stores[0]?.id ?? null, annualDays: null, active: true })}>
                <Icon name="plus" /> Añadir persona
              </button>
            </>
          )}
        </div>
      </div>

      {state.stores.length > 0 && (
        <div className="store-cards">
          {state.stores.map((s) => {
            const count = state.employees.filter((e) => e.active && e.storeId === s.id).length;
            return (
              <div key={s.id} className="store-card">
                <div>
                  <b>{s.name}</b>
                  <div className="muted small">
                    {count} {count === 1 ? 'persona' : 'personas'} · {s.minStaff > 0 ? `mínimo ${s.minStaff} trabajando` : 'sin mínimo de personal'}
                  </div>
                </div>
                {admin && (
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => setEditStore(s)} aria-label="Editar tienda">
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="icon-btn" onClick={() => removeStore(s)} aria-label="Borrar tienda">
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {people.length === 0 ? (
        <Empty icon="users" title="Todavía no hay nadie en el equipo">
          La forma más rápida de empezar es importar vuestro Excel actual: las personas se crean solas.
        </Empty>
      ) : (
        <div className="table-card">
          <table className="table team-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Tienda</th>
                <th>Horario</th>
                <th className="num">Días {year}</th>
                <th className="num">Aprobados</th>
                <th className="num">Pendientes</th>
                {saturdayColumn && (
                  <th className="num" title="Sábados de vacaciones gastados (incluye pendientes) sobre el máximo del año">
                    Sábados
                  </th>
                )}
                <th className="balance-col">Le quedan</th>
                {admin && <th />}
              </tr>
            </thead>
            <tbody>
              {people.map((e) => {
                const b = balanceFor(e, year, state, rules);
                const pct = b.allowance ? Math.min(100, ((b.used + b.pending) / b.allowance) * 100) : 0;
                const usedPct = b.allowance ? Math.min(100, (b.used / b.allowance) * 100) : 0;
                return (
                  <tr key={e.id} className={e.active ? '' : 'inactive'}>
                    <td>
                      <div className="person-cell">
                        <Avatar employee={e} />
                        <span>{e.name}</span>
                        {!e.active && <span className="chip">de baja</span>}
                      </div>
                    </td>
                    <td className="muted">{storeName(e.storeId)}</td>
                    <td className={describeSchedule(e, rules) ? '' : 'muted'}>{describeSchedule(e, rules) || 'General'}</td>
                    <td className="num">
                      {b.allowance}
                      {e.annualDays !== null && <span className="muted small" title="Valor personalizado"> *</span>}
                    </td>
                    <td className="num">{b.used}</td>
                    <td className="num">{b.pending || '—'}</td>
                    {saturdayColumn && (
                      <td
                        className={`num ${b.maxSaturdays && b.saturdaysUsed + b.saturdaysPending > b.maxSaturdays ? 'bad' : ''}`}
                        title={b.maxSaturdays ? undefined : 'Sin límite de sábados'}
                      >
                        {b.maxSaturdays ? `${b.saturdaysUsed + b.saturdaysPending}/${b.maxSaturdays}` : '—'}
                      </td>
                    )}
                    <td>
                      <div className="balance">
                        <div className="bar">
                          <div className="bar-pending" style={{ width: `${pct}%` }} />
                          <div className="bar-used" style={{ width: `${usedPct}%` }} />
                        </div>
                        <b className={b.remaining < 0 ? 'bad' : ''}>{b.remaining}</b>
                      </div>
                    </td>
                    {admin && (
                      <td className="row-actions">
                        <button className="icon-btn" onClick={() => setEditEmp(e)} aria-label={`Editar ${e.name}`}>
                          <Icon name="edit" size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <label className="check-inline muted small">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar también personas que ya no están
      </label>

      {editEmp && <EmployeeModal value={editEmp} onClose={() => setEditEmp(null)} />}
      {editStore && <StoreModal value={editStore} onClose={() => setEditStore(null)} />}
    </div>
  );
}

function EmployeeModal({ value, onClose }: { value: Partial<Employee>; onClose: () => void }) {
  const { state, run } = useApp();
  const [form, setForm] = useState({
    name: value.name ?? '',
    storeId: value.storeId ?? '',
    annualDays: value.annualDays === null || value.annualDays === undefined ? '' : String(value.annualDays),
    color: value.color ?? COLORS[state.employees.length % COLORS.length],
    active: value.active ?? true,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [schedule, setSchedule] = useState<EmployeeSchedule | null>(value.schedule ?? null);
  const [overrides, setOverrides] = useState<Record<string, Shift | null>>(value.shiftOverrides ?? {});
  const save = async () => {
    const body = {
      ...form,
      storeId: form.storeId || null,
      annualDays: form.annualDays === '' ? null : Number(form.annualDays),
      schedule,
      shiftOverrides: overrides,
    };
    const ok = await run(
      () => (value.id ? api('PUT', `/api/employees/${value.id}`, body) : api('POST', '/api/employees', body)),
      value.id ? 'Persona actualizada' : 'Persona añadida',
    );
    if (ok) onClose();
  };
  const remove = async () => {
    if (!value.id || !confirm(`¿Borrar a ${value.name} y todas sus ausencias? Si solo ha dejado la empresa, mejor desmarca "Activa".`)) return;
    if (await run(() => api('DELETE', `/api/employees/${value.id}`), 'Persona borrada')) onClose();
  };
  return (
    <Modal
      title={value.id ? 'Editar persona' : 'Añadir persona'}
      onClose={onClose}
      footer={
        <>
          {value.id && (
            <button className="danger-ghost" onClick={remove}>
              <Icon name="trash" /> Borrar
            </button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={save} disabled={!form.name.trim()}>
            Guardar
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre y apellidos" />
      </label>
      <label className="field">
        <span>Tienda</span>
        <select value={form.storeId} onChange={(e) => set('storeId', e.target.value)}>
          <option value="">Sin tienda</option>
          {state.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Días de vacaciones al año</span>
        <input
          type="number"
          min={0}
          max={366}
          value={form.annualDays}
          placeholder={`Por defecto: ${allowanceFor({ annualDays: null, schedule }, state)}`}
          onChange={(e) => set('annualDays', e.target.value)}
        />
        <small className="muted">Déjalo vacío para usar el valor de su horario o el general de Ajustes.</small>
      </label>
      <ScheduleField value={schedule} onChange={setSchedule} overrides={overrides} onOverrides={setOverrides} />
      <div className="field">
        <span>Color</span>
        <div className="color-picker">
          {COLORS.map((c) => (
            <button key={c} type="button" className={form.color === c ? 'selected' : ''} style={{ background: c }} onClick={() => set('color', c)} aria-label={c} />
          ))}
        </div>
      </div>
      <label className="check-inline">
        <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Activa (sigue en la empresa)
      </label>
    </Modal>
  );
}

function StoreModal({ value, onClose }: { value: Partial<Store>; onClose: () => void }) {
  const { run } = useApp();
  const [name, setName] = useState(value.name ?? '');
  const [minStaff, setMinStaff] = useState(String(value.minStaff ?? 0));
  const save = async () => {
    const body = { name, minStaff: Number(minStaff) || 0 };
    const ok = await run(
      () => (value.id ? api('PUT', `/api/stores/${value.id}`, body) : api('POST', '/api/stores', body)),
      value.id ? 'Tienda actualizada' : 'Tienda creada',
    );
    if (ok) onClose();
  };
  return (
    <Modal
      title={value.id ? 'Editar tienda' : 'Nueva tienda'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={save} disabled={!name.trim()}>
            Guardar
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Diagonal" />
      </label>
      <label className="field">
        <span>Mínimo de personas trabajando</span>
        <input type="number" min={0} value={minStaff} onChange={(e) => setMinStaff(e.target.value)} />
        <small className="muted">
          Si un día quedan menos, se marca en rojo y se avisa al pedir o aprobar vacaciones. Si el equipo tiene horarios con turnos, el
          mínimo se aplica a la mañana y a la tarde por separado. 0 = sin mínimo.
        </small>
      </label>
    </Modal>
  );
}

/**
 * Horario de una persona: sin horario, fijo o rotativo, con una vista previa de esta semana y la
 * próxima. Cada día de la vista previa se puede cambiar a mano haciendo clic.
 */
function ScheduleField({
  value,
  onChange,
  overrides,
  onOverrides,
}: {
  value: EmployeeSchedule | null;
  onChange: (s: EmployeeSchedule | null) => void;
  overrides: Record<string, Shift | null>;
  onOverrides: (o: Record<string, Shift | null>) => void;
}) {
  const { state } = useApp();
  const groups = state.settings.scheduleGroups;
  const rules = useMemo(() => dayRules(state.settings), [state.settings]);
  const today = todayISO();
  const kind = value?.kind ?? 'none';
  const current = value?.kind === 'rotativo' ? currentRotationIndex(value, today) : 0;

  const splitDay = value?.splitDay ?? null;
  const setKind = (k: string) => {
    if (k === 'fijo') onChange({ kind: 'fijo', groupId: value?.kind === 'rotativo' ? value.groupIds[current] : groups[0].id, splitDay });
    else if (k === 'rotativo') {
      const first = value?.kind === 'fijo' ? value.groupId : groups[0].id;
      const second = groups.find((g) => g.id !== first)?.id ?? first;
      onChange({ kind: 'rotativo', groupIds: [first, second], start: mondayOf(today), everyWeeks: 1, splitDay });
    } else onChange(null);
  };
  // Los horarios rotativos cambian cada semana. Al cambiar la rotación se mantiene qué posición toca esta semana.
  const setRotation = (groupIds: string[], index: number) =>
    onChange({ kind: 'rotativo', groupIds, everyWeeks: 1, start: rotationStartFor(today, Math.min(index, groupIds.length - 1), 1), splitDay });
  const assigned = value ? (value.kind === 'fijo' ? [value.groupId] : value.groupIds) : [];
  const splitGroup = groups.find((g) => assigned.includes(g.id) && hasWeekdaySplit(g));
  const defaultSplit = splitGroup ? [1, 2, 3, 4, 5].find((d) => splitGroup.days[d] === 'P') : undefined;

  if (!groups.length) {
    return (
      <div className="field">
        <span>Horario</span>
        <small className="muted">Todavía no hay horarios. Créalos en Ajustes → Horarios.</small>
      </div>
    );
  }

  const week = mondayOf(today);
  const preview = [0, 1].map((w) => ({
    label: w === 0 ? 'Esta semana' : 'La próxima',
    days: Array.from({ length: 7 }, (_, i) => addDays(week, w * 7 + i)),
  }));
  // Al hacer clic en un día se pasa al siguiente turno; al dar la vuelta vuelve a lo que marca el horario.
  const cycleDay = (day: string) => {
    const base = scheduledOn({ schedule: value }, day, rules);
    const now = day in overrides ? overrides[day] : base;
    const seq: (Shift | 'dia' | null)[] = base === 'dia' ? ['dia', 'M', 'T', 'P', null] : ['M', 'T', 'P', null];
    const next = seq[(seq.indexOf(now) + 1) % seq.length];
    const { [day]: _, ...rest } = overrides;
    onOverrides(next === base || next === 'dia' ? rest : { ...rest, [day]: next });
  };
  const previewDays = preview.flatMap((w) => w.days);
  const changedHere = previewDays.filter((d) => d in overrides);

  return (
    <div className="field">
      <span>Horario</span>
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="none">Sin horario (trabaja los días generales de Ajustes)</option>
        <option value="fijo">Fijo: siempre el mismo horario</option>
        <option value="rotativo" disabled={groups.length < 2}>
          Rotativo: va cambiando de horario
        </option>
      </select>

      {value?.kind === 'fijo' && (
        <select value={value.groupId} onChange={(e) => onChange({ kind: 'fijo', groupId: e.target.value, splitDay })} aria-label="Horario fijo">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}

      {value?.kind === 'rotativo' && (
        <div className="rotation">
          {value.groupIds.map((id, i) => (
            <div key={i} className="rotation-row">
              <label className="check-inline" title="Marca qué horario le toca esta semana">
                <input
                  type="radio"
                  name="rotation-now"
                  checked={current === i}
                  onChange={() => setRotation(value.groupIds, i)}
                />
                <span className="muted small">{current === i ? 'Esta semana' : `Turno ${i + 1}`}</span>
              </label>
              <select
                value={id}
                onChange={(e) => setRotation(value.groupIds.map((x, j) => (j === i ? e.target.value : x)), current)}
                aria-label={`Horario ${i + 1} de la rotación`}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {value.groupIds.length > 2 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Quitar de la rotación"
                  onClick={() => setRotation(value.groupIds.filter((_, j) => j !== i), current > i ? current - 1 : current)}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ))}
          <div className="inline-row">
            <button type="button" className="small-btn" onClick={() => setRotation([...value.groupIds, groups[0].id], current)}>
              <Icon name="plus" size={14} /> Añadir a la rotación
            </button>
            <span className="muted small">Cambia de horario cada semana.</span>
          </div>
        </div>
      )}

      {value && splitGroup && defaultSplit !== undefined && (
        <label className="inline-row small">
          Día de jornada partida
          <select
            value={splitDay ?? ''}
            onChange={(e) => onChange({ ...value, splitDay: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Día de jornada partida"
          >
            <option value="">{`El del horario (${WEEKDAYS_ES[defaultSplit].toLowerCase()})`}</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {WEEKDAYS_ES[d]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="schedule-preview">
          <div className="sp-row sp-head">
            <span />
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <span key={d}>{WEEKDAYS_SHORT[d]}</span>
            ))}
          </div>
          {preview.map((w) => (
            <div key={w.label} className="sp-row">
              <span className="muted small">{w.label}</span>
              {w.days.map((d) => {
                const date = `${d.slice(8)}/${d.slice(5, 7)}`;
                if (rules.holidays.has(d)) {
                  return (
                    <span key={d} className="shift-tag sp-holiday" title={`${date}: festivo`}>
                      F
                    </span>
                  );
                }
                const s = workOn({ schedule: value, shiftOverrides: overrides }, d, rules);
                const changed = d in overrides;
                const label = s === 'dia' ? '✓' : s ?? '—';
                const name = s === 'dia' ? 'día completo' : s ? SHIFTS[s].label.toLowerCase() : 'libre';
                return (
                  <button
                    type="button"
                    key={d}
                    className={`shift-tag sp-day ${s && s !== 'dia' ? `shift-${s}` : ''} ${changed ? 'changed' : ''}`}
                    title={`${date}: ${name}${changed ? ' (cambiado a mano)' : ''}. Clic para cambiarlo.`}
                    aria-label={`${WEEKDAYS_ES[weekday(d)]} ${date}: ${name}`}
                    onClick={() => cycleDay(d)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        <div className="inline-row">
          <span className="muted small">Haz clic en un día para cambiarlo solo ese día (mañana, tarde, partido o libre).</span>
          {changedHere.length > 0 && (
            <button
              type="button"
              className="small-btn"
              onClick={() => onOverrides(Object.fromEntries(Object.entries(overrides).filter(([d]) => !previewDays.includes(d))))}
            >
              Deshacer cambios ({changedHere.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
