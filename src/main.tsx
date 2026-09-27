import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DataState } from '../shared/types.ts';
import { api } from './api.ts';
import { AppProvider } from './context.tsx';
import { App } from './App.tsx';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

api<DataState>('GET', '/api/state')
  .then((state) => {
    document.title = `Vacaciones · ${state.settings.companyName}`;
    root.render(
      <StrictMode>
        <AppProvider initial={state}>
          <App />
        </AppProvider>
      </StrictMode>,
    );
  })
  .catch(() => {
    root.render(
      <div className="boot-error">
        <h1>No se puede conectar con el servidor</h1>
        <p>Comprueba que el programa está en marcha y vuelve a cargar la página.</p>
      </div>,
    );
  });
