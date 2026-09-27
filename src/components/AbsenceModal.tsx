import { useMemo, useState } from 'react';
import { ABSENCE_TYPES, ABSENCE_TYPE_KEYS } from '../../shared/types.ts';
import type { Absence, AbsenceStatus, AbsenceType, ISODate } from '../../shared/types.ts';
import { formatDate, formatRange, isValidISO, todayISO } from '../../shared/dates.ts';
import { balanceFor, checkRequest } from '../../shared/stats.ts';
import { api } from '../api.ts';
import { useApp } from '../context.tsx';
import { Avatar, Icon, Modal, StatusBadge } from './ui.tsx';

export interface AbsenceDraft {
  employeeId?: string;
  start?: ISODate;
  end?: ISODate;
}

export function AbsenceModal({ absence, draft, onClose }: { absence?: Absence; draft?: AbsenceDraft; onClose: () => void }) {
  const { state, admin, run } = useApp();
  const activeEmployees = state.employees.filter((e) => e.active || e.id === absence?.employeeId);
  const [employeeId, setEmployeeId] = useState(absence?.employeeId ?? draft?.employeeId ?? activeEmployees[0]?.id ?? '');
  const [start, setStart] = useState(absence?.start ?? draft?.start ?? todayISO());
  const [end, setEnd] = useState(absence?.end ?? draft?.end ?? draft?.start ?? todayISO());
  const [type, setType] = useState<AbsenceType>(absence?.type ?? 'vacaciones');
  const [note, setNote] = useState(absence?.note ?? '');
  const [status, setStatus] = useState<AbsenceStatus>(absence?.status ?? (admin ? 'aprobada' : 'pendiente'));

  const editable = !absence || admin || absence.status === 'pendiente';
  const validDates = isValidISO(start) && isValidISO(end) && end >= start;
  const emp = state.employees.find((e) => e.id === employeeId);

  const check = useMemo(
    () => (emp && validDates ? checkRequest(state, { employeeId, start, end, type, ignoreId: absence?.id }) : null),
    [state, emp, employeeId, start, end, type, validDates, absence?.id],
  );
  const balance = useMemo(() => (emp ? balanceFor(emp, Number(start.slice(0, 4)) || new Date().getFullYear(), state) : null), [emp, start, state]);
  const countsBalance = ABSENCE_TYPES[type].countsAgainstBalance;
  const previouslyCounted = absence && absence.status !== 'rechazada' && ABSENCE_TYPES[absence.type].countsAgainstBalance
    ? checkRequest(state, { employeeId: absence.employeeId, start: absence.start, end: absence.end, ignoreId: absence.id }).days
    : 0;
  const remainingAfter = balance && check ? balance.remaining + previouslyCounted - (countsBalance ? check.days : 0) : null;
  const saturdaysOver = check?.saturdaysOver[0];
  // El equipo no puede pasarse del máximo de sábados; el responsable sí (el servidor aplica la misma regla).
  const blockedBySaturdays = !!saturdaysOver && !admin;

  const byStore = useMemo(() => {
    const groups = new Map<string, typeof activeEmployees>();
    for (const e of [...activeEmployees].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
      const s = state.stores.find((x) => x.id === e.storeId)?.name ?? 'Sin tienda';
      groups.set(s, [...(groups.get(s) ?? []), e]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [activeEmployees, state.stores]);

  const save = async () => {
    const body = { employeeId, start, end, type, note, ...(admin ? { status } : {}) };
    const ok = await run(
      () => (absence ? api('PUT', `/api/absences/${absence.id}`, body) : api('POST', '/api/absences', body)),
      absence ? 'Cambios guardados' : admin ? 'Ausencia añadida' : 'Solicitud enviada. El responsable la revisará.',
    );
    if (ok) onClose();
  };

  const decide = async (s: AbsenceStatus) => {
    if (!absence) return;
    const ok = await run(() => api('POST', `/api/absences/${absence.id}/decision`, { status: s }), s === 'aprobada' ? 'Aprobada' : 'Rechazada');
    if (ok) onClose();
  };

  const remove = async () => {
    if (!absence || !confirm('¿Seguro que quieres borrar esta ausencia?')) return;
    const ok = await run(() => api('DELETE', `/api/absences/${absence.id}`), 'Ausencia borrada');
    if (ok) onClose();
  };

  if (!activeEmployees.length) {
    return (
      <Modal title="Nueva ausencia" onClose={onClose}>
        <p className="muted">Todavía no hay personas en el equipo. Añádelas en "Equipo" o importa vuestro Excel.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={absence ? (editable ? 'Editar ausencia' : 'Detalle de la ausencia') : admin ? 'Nueva ausencia' : 'Solicitar vacaciones'}
      onClose={onClose}
      wide
      footer={
        <>
          {absence && (admin || absence.status === 'pendiente') && (
            <button className="danger-ghost" onClick={remove}>
              <Icon name="trash" /> {absence.status === 'pendiente' && !admin ? 'Cancelar solicitud' : 'Borrar'}
            </button>
          )}
          <span className="spacer" />
          {absence && admin && absence.status === 'pendiente' && (
            <>
              <button className="danger" onClick={() => decide('rechazada')}>Rechazar</button>
              <button className="success" onClick={() => decide('aprobada')}>
                <Icon name="check" /> Aprobar
              </button>
            </>
          )}
          {editable && (
            <button className="primary" onClick={save} disabled={!validDates || !employeeId || blockedBySaturdays}>
              {absence ? 'Guardar' : admin ? 'Añadir' : 'Enviar solicitud'}
            </button>
          )}
        </>
      }
    >
      <div className="absence-form">
        <div className="form-main">
          <label className="field">
            <span>Persona</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!editable || !!absence}>
              {byStore.map(([store, list]) => (
                <optgroup key={store} label={store}>
                  {list.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Tipo</span>
            <div className="type-picker">
              {ABSENCE_TYPE_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={type === k ? 'selected' : ''}
                  style={{ '--c': ABSENCE_TYPES[k].color } as React.CSSProperties}
                  onClick={() => setType(k)}
                  disabled={!editable}
                >
                  <i /> {ABSENCE_TYPES[k].label}
                </button>
              ))}
            </div>
          </div>

          <div className="row-2">
            <label className="field">
              <span>Desde</span>
              <input
                type="date"
                value={start}
                disabled={!editable}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (e.target.value > end) setEnd(e.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>Hasta (incluido)</span>
              <input type="date" value={end} min={start} disabled={!editable} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Nota (opcional)</span>
            <textarea rows={2} value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: viaje, boda, cambio con Laura…" />
          </label>

          {admin && (
            <label className="field">
              <span>Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as AbsenceStatus)}>
                <option value="aprobada">Aprobada</option>
                <option value="pendiente">Pendiente</option>
                <option value="rechazada">Rechazada</option>
              </select>
            </label>
          )}
          {absence && !admin && (
            <p className="muted small">
              Estado: <StatusBadge status={absence.status} />
              {absence.status !== 'pendiente' && ' · Solo el responsable puede cambiarla.'}
            </p>
          )}
        </div>

        <aside className="form-side">
          {emp && (
            <div className="side-person">
              <Avatar employee={emp} size={36} />
              <div>
                <strong>{emp.name}</strong>
                <div className="muted small">{state.stores.find((s) => s.id === emp.storeId)?.name ?? 'Sin tienda'}</div>
              </div>
            </div>
          )}
          {check && (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <b>{check.days}</b>
                  <span>días {state.settings.countMode}</span>
                </div>
                {countsBalance && remainingAfter !== null && (
                  <div className={`stat ${remainingAfter < 0 ? 'stat-bad' : ''}`}>
                    <b>{remainingAfter}</b>
                    <span>le quedarán en {start.slice(0, 4)}</span>
                  </div>
                )}
                {countsBalance && balance && balance.maxSaturdays > 0 && check.saturdays > 0 && (
                  <div className={`stat ${saturdaysOver ? 'stat-bad' : ''}`}>
                    <b>{check.saturdays}</b>
                    <span>
                      {check.saturdays === 1 ? 'sábado' : 'sábados'} (máx. {balance.maxSaturdays} al año)
                    </span>
                  </div>
                )}
              </div>
              {saturdaysOver && (
                <div className="callout callout-bad">
                  <Icon name="alert" />
                  <div>
                    <b>Se pasa de los sábados de vacaciones:</b> serían {saturdaysOver.total} en {saturdaysOver.year} y el máximo es{' '}
                    {saturdaysOver.max}.{' '}
                    {admin ? 'Como responsable puedes guardarla igualmente.' : 'Pide los días sin incluir el sábado.'}
                  </div>
                </div>
              )}
              {check.overlapsOwn.length > 0 && (
                <div className="callout callout-warn">
                  <Icon name="alert" /> Ya tiene otra ausencia en esas fechas ({formatRange(check.overlapsOwn[0].start, check.overlapsOwn[0].end)}).
                </div>
              )}
              {check.breachDays.length > 0 && (
                <div className="callout callout-bad">
                  <Icon name="alert" />
                  <div>
                    <b>Cobertura insuficiente</b> en {check.breachDays.length} día{check.breachDays.length > 1 ? 's' : ''}:{' '}
                    {check.breachDays.slice(0, 6).map((d) => formatDate(d)).join(', ')}
                    {check.breachDays.length > 6 && '…'}
                  </div>
                </div>
              )}
              <div className="side-section">
                <h4>Compañeros de su tienda fuera esos días</h4>
                {check.colleaguesOff.length === 0 ? (
                  <p className="muted small">Nadie. ¡Vía libre!</p>
                ) : (
                  <ul className="mini-list">
                    {check.colleaguesOff.map(({ employee, absence: a }) => (
                      <li key={a.id}>
                        <Avatar employee={employee} size={22} />
                        <span>{employee.name}</span>
                        <span className="muted small">
                          {formatRange(a.start, a.end)}
                          {a.status === 'pendiente' && ' (pendiente)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}
