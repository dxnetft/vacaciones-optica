import { useMemo, useState } from 'react';
import type { Absence } from '../../shared/types.ts';
import { formatDate, formatRange } from '../../shared/dates.ts';
import { balanceFor, checkRequest } from '../../shared/stats.ts';
import { api } from '../api.ts';
import { useApp } from '../context.tsx';
import { AbsenceModal } from '../components/AbsenceModal.tsx';
import { Avatar, Empty, Icon, StatusBadge, TypeBadge } from '../components/ui.tsx';

export function RequestsView() {
  const { state, admin, run } = useApp();
  const [open, setOpen] = useState<Absence | null>(null);
  const [creating, setCreating] = useState(false);

  const pending = useMemo(
    () => state.absences.filter((a) => a.status === 'pendiente').sort((a, b) => a.start.localeCompare(b.start)),
    [state.absences],
  );
  const decided = useMemo(
    () =>
      state.absences
        .filter((a) => a.status !== 'pendiente' && a.source === 'app' && a.decidedAt)
        .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
        .slice(0, 15),
    [state.absences],
  );
  const emp = (id: string) => state.employees.find((e) => e.id === id);
  const store = (id: string | null | undefined) => state.stores.find((s) => s.id === id)?.name ?? 'Sin tienda';

  const decide = (a: Absence, status: 'aprobada' | 'rechazada') =>
    run(() => api('POST', `/api/absences/${a.id}/decision`, { status }), status === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada');

  return (
    <div className="view narrow">
      <div className="view-header">
        <h1>Solicitudes</h1>
        <div className="toolbar">
          <button className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Nueva solicitud
          </button>
        </div>
      </div>
      <p className="muted intro">
        {admin
          ? 'Revisa cada solicitud con toda la información delante: quién más está fuera, si la tienda se queda corta y cuántos días le quedan.'
          : 'Aquí aparecen las solicitudes que esperan la aprobación del responsable.'}
      </p>

      {pending.length === 0 ? (
        <Empty icon="inbox" title="No hay solicitudes pendientes">
          Todo al día.
        </Empty>
      ) : (
        <div className="request-list">
          {pending.map((a) => {
            const e = emp(a.employeeId);
            if (!e) return null;
            const check = checkRequest(state, { employeeId: a.employeeId, start: a.start, end: a.end, type: a.type, ignoreId: a.id });
            const bal = balanceFor(e, Number(a.start.slice(0, 4)), state);
            return (
              <article key={a.id} className="request-card">
                <div className="request-main" onClick={() => setOpen(a)} role="button" tabIndex={0}>
                  <Avatar employee={e} size={40} />
                  <div className="request-info">
                    <div className="request-title">
                      <strong>{e.name}</strong>
                      <span className="muted small">{store(e.storeId)}</span>
                    </div>
                    <div className="request-dates">
                      {formatRange(a.start, a.end)} · <b>{check.days} días</b> <TypeBadge type={a.type} />
                    </div>
                    {a.note && <div className="request-note">“{a.note}”</div>}
                    <div className="chips">
                      <span className={`chip ${bal.remaining < 0 ? 'chip-bad' : ''}`}>
                        Saldo tras aprobar: {bal.remaining} días
                      </span>
                      {check.colleaguesOff.length > 0 && (
                        <span className="chip chip-warn" title={check.colleaguesOff.map((c) => `${c.employee.name}: ${formatRange(c.absence.start, c.absence.end)}`).join('\n')}>
                          Coincide con {check.colleaguesOff.map((c) => c.employee.name.split(' ')[0]).join(', ')}
                        </span>
                      )}
                      {check.breachDays.length > 0 && (
                        <span className="chip chip-bad" title={check.breachDays.map((d) => formatDate(d)).join(', ')}>
                          <Icon name="alert" size={13} /> {check.breachDays.length} día{check.breachDays.length > 1 ? 's' : ''} bajo mínimo
                        </span>
                      )}
                      {check.saturdaysOver.length > 0 && (
                        <span className="chip chip-bad">
                          <Icon name="alert" size={13} /> {check.saturdaysOver[0].total} sábados (máx. {check.saturdaysOver[0].max})
                        </span>
                      )}
                      {check.colleaguesOff.length === 0 && check.breachDays.length === 0 && check.saturdaysOver.length === 0 && (
                        <span className="chip chip-ok">Sin conflictos</span>
                      )}
                    </div>
                  </div>
                </div>
                {admin && (
                  <div className="request-actions">
                    <button className="danger-ghost" onClick={() => decide(a, 'rechazada')}>
                      Rechazar
                    </button>
                    <button className="success" onClick={() => decide(a, 'aprobada')}>
                      <Icon name="check" /> Aprobar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="section-title">Decididas recientemente</h2>
          <div className="table-card">
            <table className="table">
              <tbody>
                {decided.map((a) => {
                  const e = emp(a.employeeId);
                  return (
                    <tr key={a.id} onClick={() => setOpen(a)} className="clickable">
                      <td>{e?.name ?? '—'}</td>
                      <td>{formatRange(a.start, a.end)}</td>
                      <td>
                        <TypeBadge type={a.type} />
                      </td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && <AbsenceModal absence={open} onClose={() => setOpen(null)} />}
      {creating && <AbsenceModal draft={{}} onClose={() => setCreating(false)} />}
    </div>
  );
}
