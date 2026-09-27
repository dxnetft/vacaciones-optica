import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { Store } from './db.ts';
import { createApp } from './app.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ?? path.join(root, 'data');
const port = Number(process.env.PORT ?? 3000);

const db = new Store(dataDir);
const app = createApp(db);

const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  const index = path.join(dist, 'index.html');
  // La app web compilada: cualquier ruta que no sea de la API devuelve la página.
  const web = express.static(dist);
  app.use((req, res, next) => (req.path.startsWith('/api') ? next() : web(req, res, () => res.sendFile(index))));
}

app.listen(port, () => {
  console.log(`Gestor de vacaciones escuchando en http://localhost:${port}`);
  console.log(`Datos guardados en ${db.file}`);
});
