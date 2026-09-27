import { useMemo, useState } from 'react';
import type { Employee, Store } from '../../shared/types.ts';
import { dayRules } from '../../shared/dates.ts';
import { balanceFor } from '../../shared/stats.ts';
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
                <th className="num">Días {year}</th>
                <th className="num">Aprobados</th>
                <th className="num">Pendientes</th>
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
                    <td className="num">
                      {b.allowance}
                      {e.annualDays !== null && <span className="muted small" title="Valor personalizado"> *</span>}
                    </td>
                    <td className="num">{b.used}</td>
                    <td className="num">{b.pending || '—'}</td>
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
  const save = async () => {
    const body = { ...form, storeId: form.storeId || null, annualDays: form.annualDays === '' ? null : Number(form.annualDays) };
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
          placeholder={`Por defecto: ${state.settings.defaultAnnualDays}`}
          onChange={(e) => set('annualDays', e.target.value)}
        />
        <small className="muted">Déjalo vacío para usar el valor general de Ajustes.</small>
      </label>
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
        <span>Mínimo de personas trabajando cada día</span>
        <input type="number" min={0} value={minStaff} onChange={(e) => setMinStaff(e.target.value)} />
        <small className="muted">Si un día quedan menos, se marca en rojo y se avisa al pedir o aprobar vacaciones. 0 = sin mínimo.</small>
      </label>
    </Modal>
  );
}
