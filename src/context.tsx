import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DataState } from '../shared/types.ts';
import { api, getAdminPin, setAdminPin } from './api.ts';

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

interface AppContext {
  state: DataState;
  reload: () => Promise<void>;
  admin: boolean;
  login: (pin: string) => Promise<void>;
  logout: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  /** Ejecuta una acción mostrando el error como aviso y recargando datos. */
  run: (fn: () => Promise<unknown>, okText?: string) => Promise<boolean>;
}

const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}

const POLL_MS = 30_000;

export function AppProvider({ initial, children }: { initial: DataState; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [admin, setAdmin] = useState(() => !!getAdminPin());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const reload = useCallback(async () => {
    setState(await api<DataState>('GET', '/api/state'));
  }, []);

  // Refresco periódico para ver los cambios de otras personas.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') reload().catch(() => {});
    }, POLL_MS);
    const onFocus = () => reload().catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, okText?: string) => {
      try {
        await fn();
        await reload();
        if (okText) toast(okText);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Error inesperado', 'error');
        if ((e as { status?: number }).status === 403) {
          setAdminPin(null);
          setAdmin(false);
        }
        return false;
      }
    },
    [reload, toast],
  );

  const login = useCallback(async (pin: string) => {
    await api('POST', '/api/auth', { pin });
    setAdminPin(pin);
    setAdmin(true);
  }, []);

  const logout = useCallback(() => {
    setAdminPin(null);
    setAdmin(false);
  }, []);

  const value = useMemo(() => ({ state, reload, admin, login, logout, toast, run }), [state, reload, admin, login, logout, toast, run]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
