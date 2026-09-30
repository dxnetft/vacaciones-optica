import { useEffect, useMemo, useState } from 'react';
import { ABSENCE_TYPES, SHIFTS } from '../../shared/types.ts';
import type { Absence, Employee, ISODate } from '../../shared/types.ts';
import { MONTHS_ES, WEEKDAYS_SHORT, dayRules, formatRange, isWorkingDay, monthDays, normalizeText, todayISO, weekOfYear, weekday } from '../../shared/dates.ts';
import { absencesByEmployee, balanceFor, countDaysFor, coverageFor } from '../../shared/stats.ts';
import { describeSchedule, hasSchedule, workOn } from '../../shared/schedule.ts';
import { useApp } from '../context.tsx';
import { AbsenceModal } from '../components/AbsenceModal.tsx';
import type { AbsenceDraft } from '../components/AbsenceModal.tsx';
import { Avatar, Empty, Icon } from '../components/ui.tsx';

interface Selection {
  employeeId: string;
  anchor: number;
  current: number;
}

export function CalendarView({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const { state } = useApp();
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ absence?: Absence; draft?: AbsenceDraft } | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);

  const days = useMemo(() => monthDays(year, month), [year, month]);
  // Tramos de semana dentro del mes, para la fila con el número de semana.
  const weeks = useMemo(() => {
    const out: { n: number; from: number; to: number }[] = [];
    days.forEach((d, i) => {
      const n = weekOfYear(d);
      if (out.length && out[out.length - 1].n === n) out[out.length - 1].to = i;
      else out.push({ n, from: i, to: i });
    });
    return out;
  }, [days]);
  const rules = useMemo(() => dayRules(state.settings), [state.settings]);
  const holidayNames = useMemo(() => new Map(state.settings.holidays.map((h) => [h.date, h.name])), [state.settings.holidays]);
  const byEmp = useMemo(() => absencesByEmployee(state.absences), [state.absences]);
  const today = todayISO();
  const first = days[0];
  const last = days[days.length - 1];

  const groups = useMemo(() => {
    const q = normalizeText(query);
    const visible = state.employees.filter(
      (e) => e.active && (storeFilter === 'all' || (e.storeId ?? 'none') === storeFilter) && (!q || normalizeText(e.name).includes(q)),
    );
    const stores = [...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const out: { id: string | null; name: string; minStaff: number; employees: Employee[] }[] = stores.map((s) => ({
      id: s.id,
      name: s.name,
      minStaff: s.minStaff,
      employees: visible.filter((e) => e.storeId === s.id),
    }));
    out.push({ id: null, name: state.stores.length ? 'Sin tienda asignada' : 'Equipo', minStaff: 0, employees: visible.filter((e) => !e.storeId || !state.stores.some((s) => s.id === e.storeId)) });
    for (const g of out) g.employees.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return out.filter((g) => g.employees.length);
  }, [state.employees, state.stores, storeFilter, query]);

  const coverage = useMemo(
    () => new Map(groups.map((g) => [g.id, coverageFor(state, g.id, days, rules)])),
    [groups, state, days, rules],
  );

  const outToday = state.absences.filter((a) => a.status === 'aprobada' && a.start <= today && a.end >= today);
  const pending = state.absences.filter((a) => a.status === 'pendiente').length;
  const breachCount = [...coverage.values()].flat().filter((c) => c.breach).length;
  const anyShifts = state.employees.some((e) => e.active && hasSchedule(e, rules));

  // Selección arrastrando: al soltar se abre el formulario con el rango.
  useEffect(() => {
    if (!sel) return;
    const up = () => {
      const a = Math.min(sel.anchor, sel.current);
      const b = Math.max(sel.anchor, sel.current);
      setModal({ draft: { employeeId: sel.employeeId, start: days[a], end: days[b] } });
      setSel(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [sel, days]);

  const move = (delta: number) => {
    const m = month + delta;
    onChange(year + Math.floor(m / 12), ((m % 12) + 12) % 12);
  };

  const dayClass = (d: ISODate) => {
    const cls = [];
    if (!isWorkingDay(d, rules)) cls.push('off');
    if (holidayNames.has(d)) cls.push('holiday');
    if (d === today) cls.push('today');
    if (weekday(d) === 1) cls.push('week-start');
    return cls.join(' ');
  };

  return (
    <div className="view">
      <div className="view-header">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Mes anterior">
            <Icon name="left" />
          </button>
          <h1>
            {MONTHS_ES[month]} <span className="muted">{year}</span>
          </h1>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Mes siguiente">
            <Icon name="right" />
          </button>
          <button className="ghost small-btn" onClick={() => onChange(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1)}>
            Hoy
          </button>
        </div>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="Buscar persona…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {state.stores.length > 0 && (
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} aria-label="Filtrar por tienda">
              <option value="all">Todas las tiendas</option>
              {state.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="none">Sin tienda</option>
            </select>
          )}
          <button className="primary" onClick={() => setModal({ draft: {} })}>
            <Icon name="plus" /> Solicitar
          </button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-icon" style={{ background: 'var(--brand-soft)', color: 'var(--accent)' }}>
            <Icon name="sun" />
          </span>
          <div>
            <b>{outToday.length}</b>
            <span>
              {outToday.length === 1 ? 'persona fuera hoy' : 'personas fuera hoy'}
              {outToday.length > 0 && (
                <em className="kpi-names">
                  {outToday.slice(0, 3).map((a) => state.employees.find((e) => e.id === a.employeeId)?.name.split(' ')[0]).join(', ')}
                  {outToday.length > 3 && '…'}
                </em>
              )}
            </span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            <Icon name="inbox" />
          </span>
          <div>
            <b>{pending}</b>
            <span>{pending === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-icon" style={{ background: breachCount ? 'var(--red-soft)' : 'var(--green-soft)', color: breachCount ? 'var(--red)' : 'var(--green)' }}>
            <Icon name={breachCount ? 'alert' : 'check'} />
          </span>
          <div>
            <b>{breachCount}</b>
            <span>{breachCount === 1 ? 'día sin cobertura mínima' : 'días sin cobertura mínima'} este mes</span>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <Empty icon="users" title={state.employees.length ? 'Nadie coincide con el filtro' : 'Todavía no hay equipo'}>
          {state.employees.length ? 'Prueba con otra búsqueda o tienda.' : 'Importa vuestro Excel actual o añade personas en "Equipo".'}
        </Empty>
      ) : (
        <div className="timeline-wrap">
          <div className="timeline" style={{ '--days': days.length } as React.CSSProperties}>
            <div className="tl-row tl-weeks">
              <div className="tl-name" />
              {weeks.map((w) => (
                <div
                  key={w.n}
                  className={`tl-week ${w.from > 0 ? 'week-start' : ''}`}
                  style={{ gridColumn: `${w.from + 2} / ${w.to + 3}` }}
                  title={`Semana ${w.n} del año`}
                >
                  {w.to - w.from >= 2 ? `Semana ${w.n}` : `S${w.n}`}
                </div>
              ))}
            </div>
            <div className="tl-row tl-head">
              <div className="tl-name">Equipo</div>
              {days.map((d) => (
                <div key={d} className={`tl-day ${dayClass(d)}`} title={holidayNames.get(d)}>
                  <span className="wd">{WEEKDAYS_SHORT[weekday(d)]}</span>
                  <span className="dn">{Number(d.slice(8))}</span>
                </div>
              ))}
            </div>

            {groups.map((g) => (
              <div key={g.id ?? 'none'} className="tl-group">
                <div className="tl-row tl-group-head">
                  <div className="tl-name">
                    <Icon name="store" size={15} />
                    <b>{g.name}</b>
                    {g.minStaff > 0 && <span className="muted small">mín. {g.minStaff}</span>}
                  </div>
                  {coverage.get(g.id)!.map((c) => (
                    <div
                      key={c.day}
                      className={`tl-cov ${dayClass(c.day)} ${c.breach ? 'bad' : c.breachIfPending ? 'warn' : c.absent ? 'some' : ''}`}
                      title={
                        (c.byShift
                          ? `Mañana: ${c.morning} · Tarde: ${c.afternoon}${c.minStaff ? ` (mínimo ${c.minStaff} por turno)` : ''}`
                          : `${c.present} de ${c.total} trabajando${c.minStaff ? ` (mínimo ${c.minStaff})` : ''}`) +
                        (c.absentNames.length ? `\nFuera: ${c.absentNames.join(', ')}` : '')
                      }
                    >
                      {!c.working ? '' : c.byShift ? (
                        <span className="cov-split">
                          <span>{c.morning}</span>
                          <span>{c.afternoon}</span>
                        </span>
                      ) : (
                        c.present
                      )}
                    </div>
                  ))}
                </div>

                {g.employees.map((e) => {
                  const list = (byEmp.get(e.id) ?? []).filter((a) => a.start <= last && a.end >= first);
                  const bal = balanceFor(e, year, state, rules);
                  const selRange = sel?.employeeId === e.id ? [Math.min(sel.anchor, sel.current), Math.max(sel.anchor, sel.current)] : null;
                  const schedule = describeSchedule(e, rules);
                  return (
                    <div key={e.id} className="tl-row tl-person">
                      <div className="tl-name">
                        <Avatar employee={e} size={26} />
                        <span className="tl-person-name" title={schedule ? `${e.name}\nHorario: ${schedule}` : e.name}>
                          {e.name}
                        </span>
                        <span className={`pill ${bal.remaining < 0 ? 'pill-bad' : ''}`} title={`Le quedan ${bal.remaining} días de vacaciones en ${year}`}>
                          {bal.remaining}
                        </span>
                      </div>
                      {days.map((d, i) => {
                        const w = schedule || e.shiftOverrides ? workOn(e, d, rules) : undefined;
                        const rest = w === null && isWorkingDay(d, rules);
                        const manual = !!e.shiftOverrides && d in e.shiftOverrides ? ' (cambiado a mano)' : '';
                        return (
                          <div
                            key={d}
                            className={`tl-cell ${dayClass(d)} ${rest ? 'rest' : ''} ${selRange && i >= selRange[0] && i <= selRange[1] ? 'selecting' : ''}`}
                            style={{ gridColumn: i + 2 }}
                            title={w && w !== 'dia' ? `Turno de ${SHIFTS[w].label.toLowerCase()}${manual}` : rest ? `No trabaja este día${manual}` : undefined}
                            onMouseDown={(ev) => {
                              if (ev.button !== 0) return;
                              ev.preventDefault();
                              setSel({ employeeId: e.id, anchor: i, current: i });
                            }}
                            onMouseEnter={() => sel?.employeeId === e.id && setSel({ ...sel, current: i })}
                          >
                            {w && w !== 'dia' && <span className={`shift shift-${w}`}>{w}</span>}
                          </div>
                        );
                      })}
                      {list.map((a) => {
                        const s = a.start < first ? 0 : Number(a.start.slice(8)) - 1;
                        const en = a.end > last ? days.length - 1 : Number(a.end.slice(8)) - 1;
                        const info = ABSENCE_TYPES[a.type];
                        const span = en - s + 1;
                        const n = countDaysFor(e, a.start, a.end, state.settings.countMode, rules);
                        return (
                          <button
                            key={a.id}
                            className={`tl-bar ${a.status === 'pendiente' ? 'pending' : ''} ${a.start < first ? 'cont-left' : ''} ${a.end > last ? 'cont-right' : ''}`}
                            style={{ gridColumn: `${s + 2} / ${en + 3}`, '--c': info.color } as React.CSSProperties}
                            title={`${e.name}\n${info.label}${a.status === 'pendiente' ? ' (pendiente)' : ''}\n${formatRange(a.start, a.end)} · ${n} días${a.note ? `\n${a.note}` : ''}`}
                            onClick={() => setModal({ absence: a })}
                          >
                            {span >= 4 ? `${info.label}${a.status === 'pendiente' ? ' ?' : ''}` : span >= 2 ? info.short : ''}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="legend">
        {Object.entries(ABSENCE_TYPES).map(([k, t]) => (
          <span key={k} className="legend-item">
            <i style={{ background: t.color }} /> {t.label}
          </span>
        ))}
        <span className="legend-item">
          <i className="legend-pending" /> Pendiente de aprobar
        </span>
        {anyShifts && (
          <span className="legend-item">
            <span className="shift shift-M">M</span> mañana <span className="shift shift-T">T</span> tarde{' '}
            <span className="shift shift-P">P</span> partido <i className="legend-rest" /> no trabaja
          </span>
        )}
        <span className="legend-item muted">Arrastra sobre la fila de una persona para marcar varios días.</span>
      </div>

      {modal && <AbsenceModal absence={modal.absence} draft={modal.draft} onClose={() => setModal(null)} />}
    </div>
  );
}
