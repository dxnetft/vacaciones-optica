import { useEffect, useState } from 'react';
import { useApp } from './context.tsx';
import { Icon, PinModal } from './components/ui.tsx';
import type { IconName } from './components/ui.tsx';
import { CalendarView } from './views/CalendarView.tsx';
import { YearView } from './views/YearView.tsx';
import { RequestsView } from './views/RequestsView.tsx';
import { TeamView } from './views/TeamView.tsx';
import { ImportView } from './views/ImportView.tsx';
import { SettingsView } from './views/SettingsView.tsx';

type Tab = 'calendario' | 'anual' | 'solicitudes' | 'equipo' | 'importar' | 'ajustes';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'calendario', label: 'Calendario', icon: 'calendar' },
  { id: 'anual', label: 'Vista anual', icon: 'grid' },
  { id: 'solicitudes', label: 'Solicitudes', icon: 'inbox' },
  { id: 'equipo', label: 'Equipo', icon: 'users' },
  { id: 'importar', label: 'Importar Excel', icon: 'upload' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' },
];

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'calendario';
}

export function App() {
  const { state, admin, logout, toast } = useApp();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [pin, setPin] = useState(false);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo(0, 0);
  };

  const pending = state.absences.filter((a) => a.status === 'pendiente').length;
  const firstRun = state.employees.length === 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" aria-hidden>
            <svg viewBox="0 0 64 64" width="22" height="22">
              <circle cx="21" cy="34" r="10" fill="none" stroke="currentColor" strokeWidth="5" />
              <circle cx="43" cy="34" r="10" fill="none" stroke="currentColor" strokeWidth="5" />
              <path d="M31 33h2" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <b>{state.settings.companyName}</b>
            <span>Vacaciones del equipo</span>
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.id === 'solicitudes' && pending > 0 && <span className="nav-badge">{pending}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {admin ? (
            <button
              className="admin-btn on"
              onClick={() => {
                logout();
                toast('Has salido del modo responsable');
              }}
            >
              <Icon name="unlock" /> <span>Modo responsable</span>
              <em>Salir</em>
            </button>
          ) : (
            <button className="admin-btn" onClick={() => setPin(true)}>
              <Icon name="lock" /> <span>Soy responsable</span>
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        {firstRun && tab !== 'importar' && (
          <div className="welcome">
            <div>
              <h2>¡Bienvenido! Empieza con el Excel que ya tenéis</h2>
              <p>
                Sube vuestro Excel de vacaciones actual y en un minuto tendrás aquí a todo el equipo con sus días. No hace falta cambiarle
                nada.
              </p>
            </div>
            <button className="primary big" onClick={() => go('importar')}>
              <Icon name="upload" /> Importar Excel
            </button>
          </div>
        )}
        {tab === 'calendario' && (
          <CalendarView
            year={year}
            month={month}
            onChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
          />
        )}
        {tab === 'anual' && (
          <YearView
            year={year}
            onYear={setYear}
            onOpenMonth={(m) => {
              setMonth(m);
              go('calendario');
            }}
          />
        )}
        {tab === 'solicitudes' && <RequestsView />}
        {tab === 'equipo' && <TeamView year={year} onYear={setYear} />}
        {tab === 'importar' && <ImportView onFinish={() => go('calendario')} />}
        {tab === 'ajustes' && <SettingsView />}
      </main>

      {pin && <PinModal onClose={() => setPin(false)} />}
    </div>
  );
}
