import { useMemo, useState } from 'react';
import { ABSENCE_TYPES } from '../../shared/types.ts';
import type { Absence } from '../../shared/types.ts';
import { MONTHS_ES, WEEKDAYS_SHORT, clampRange, dayRules, eachDay, isWorkingDay, monthDays, todayISO, weekday } from '../../shared/dates.ts';
import { coverageFor } from '../../shared/stats.ts';
import { useApp } from '../context.tsx';
import { Icon } from '../components/ui.tsx';

/**
 * Vista anual para planificar: un mapa de calor con cuántas personas faltan cada día,
 * o las ausencias de una sola persona.
 */
export function YearView({ year, onYear, onOpenMonth }: { year: number; onYear: (y: number) => void; onOpenMonth: (m: number) => void }) {
  const { state } = useApp();
  const [scope, setScope] = useState<string>('all');
  const rules = useMemo(() => dayRules(state.settings), [state.settings]);
  const holidays = useMemo(() => new Map(state.settings.holidays.map((h) => [h.date, h.name])), [state.settings.holidays]);
  const today = todayISO();

  const person = scope.startsWith('p:') ? state.employees.find((e) => e.id === scope.slice(2)) : undefined;
  const scopeEmployees = useMemo(() => {
    const active = state.employees.filter((e) => e.active);
    if (scope === 'all') return active;
    if (scope.startsWith('s:')) return active.filter((e) => (e.storeId ?? 'none') === scope.slice(2));
    return active.filter((e) => e.id === scope.slice(2));
  }, [scope, state.employees]);

  const info = useMemo(() => {
    const ids = new Set(scopeEmployees.map((e) => e.id));
    const names = new Map(state.employees.map((e) => [e.id, e.name]));
    const map = new Map<string, { approved: string[]; pending: string[]; absence?: Absence }>();
    for (const a of state.absences) {
      if (!ids.has(a.employeeId) || a.status === 'rechazada' || a.end < `${year}-01-01` || a.start > `${year}-12-31`) continue;
      const range = clampRange(a.start, a.end, `${year}-01-01`, `${year}-12-31`)!;
      for (const d of eachDay(range[0], range[1])) {
        const entry = map.get(d) ?? { approved: [], pending: [] };
        (a.status === 'aprobada' ? entry.approved : entry.pending).push(names.get(a.employeeId) ?? '?');
        if (!entry.absence || a.status === 'aprobada') entry.absence = a;
        map.set(d, entry);
      }
    }
    return map;
  }, [scopeEmployees, state.absences, state.employees, year]);

  // Días en que alguna tienda queda por debajo del mínimo (solo con vista de todo el equipo o una tienda).
  const breaches = useMemo(() => {
    const set = new Set<string>();
    if (person) return set;
    const storeIds = scope.startsWith('s:') ? [scope.slice(2) === 'none' ? null : scope.slice(2)] : state.stores.map((s) => s.id);
    const allDays = Array.from({ length: 12 }, (_, m) => monthDays(year, m)).flat();
    for (const id of storeIds) for (const c of coverageFor(state, id, allDays, rules)) if (c.breach) set.add(c.day);
    return set;
  }, [person, scope, state, year, rules]);

  const max = Math.max(1, ...[...info.values()].map((v) => v.approved.length + v.pending.length));
  const total = scopeEmployees.length;
  const peak = [...info.entries()].sort((a, b) => b[1].approved.length - a[1].approved.length)[0];

  return (
    <div className="view">
      <div className="view-header">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => onYear(year - 1)} aria-label="Año anterior">
            <Icon name="left" />
          </button>
          <h1>Año {year}</h1>
          <button className="icon-btn" onClick={() => onYear(year + 1)} aria-label="Año siguiente">
            <Icon name="right" />
          </button>
        </div>
        <div className="toolbar">
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Ver">
            <option value="all">Todo el equipo</option>
            {state.stores.length > 0 && (
              <optgroup label="Tiendas">
                {state.stores.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Personas">
              {[...state.employees]
                .filter((e) => e.active)
                .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                .map((e) => (
                  <option key={e.id} value={`p:${e.id}`}>
                    {e.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </div>
      </div>

      <p className="muted intro">
        {person
          ? `Ausencias de ${person.name} durante ${year}.`
          : `Cuanto más oscuro, más gente fuera ese día (de ${total} personas). Ideal para ver de un vistazo cómo está repartido el verano o la Navidad.`}
        {!person && peak && peak[1].approved.length > 1 && (
          <>
            {' '}
            Día con más ausencias: <b>{peak[0].split('-').reverse().slice(0, 2).join('/')}</b> ({peak[1].approved.length} personas).
          </>
        )}
      </p>

      <div className="year-grid">
        {MONTHS_ES.map((name, m) => {
          const days = monthDays(year, m);
          const offset = (weekday(days[0]) + 6) % 7;
          return (
            <section key={m} className="mini-month">
              <button className="mini-title" onClick={() => onOpenMonth(m)}>
                {name}
                <Icon name="right" size={14} />
              </button>
              <div className="mini-grid">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                  <span key={d} className="mini-wd">
                    {d}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`e${i}`} />
                ))}
                {days.map((d) => {
                  const entry = info.get(d);
                  const n = entry ? entry.approved.length + entry.pending.length : 0;
                  let style: React.CSSProperties = {};
                  let cls = 'mini-day';
                  if (!isWorkingDay(d, rules)) cls += ' off';
                  if (holidays.has(d)) cls += ' holiday';
                  if (d === today) cls += ' today';
                  if (breaches.has(d)) cls += ' breach';
                  if (entry && person && entry.absence) {
                    style = { background: ABSENCE_TYPES[entry.absence.type].color, color: 'white' };
                    if (entry.absence.status === 'pendiente') cls += ' pending';
                  } else if (n) {
                    // Escala de marca: amarillo claro → amarillo → amarillo tostado oscuro.
                    const r = n / max;
                    const background =
                      r <= 0.5
                        ? `color-mix(in srgb, var(--brand) ${Math.round(30 + 140 * r)}%, transparent)`
                        : `color-mix(in srgb, #9a3412 ${Math.round(160 * (r - 0.5))}%, var(--brand))`;
                    style = { background, color: r > 0.75 ? 'white' : 'var(--on-brand)' };
                    if (!entry!.approved.length) cls += ' pending';
                  }
                  const tip = [
                    `${WEEKDAYS_SHORT[weekday(d)]} ${Number(d.slice(8))} ${name.toLowerCase()}`,
                    holidays.get(d),
                    entry?.approved.length ? `Fuera: ${entry.approved.join(', ')}` : '',
                    entry?.pending.length ? `Pendiente: ${entry.pending.join(', ')}` : '',
                    breaches.has(d) ? '⚠ Por debajo del mínimo de personal' : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                  return (
                    <span key={d} className={cls} style={style} title={tip}>
                      {Number(d.slice(8))}
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="legend">
        {person ? (
          Object.entries(ABSENCE_TYPES).map(([k, t]) => (
            <span key={k} className="legend-item">
              <i style={{ background: t.color }} /> {t.label}
            </span>
          ))
        ) : (
          <>
            <span className="legend-item">
              <i className="heat-scale" /> Menos → más personas fuera
            </span>
            <span className="legend-item">
              <i className="legend-breach" /> Día por debajo del mínimo de personal
            </span>
          </>
        )}
        <span className="legend-item">
          <i className="legend-holiday" /> Festivo
        </span>
      </div>
    </div>
  );
}
