import fs from 'node:fs';
import path from 'node:path';
import { SAMPLES } from './samples.ts';

const dir = path.resolve('samples');
fs.mkdirSync(dir, { recursive: true });
for (const [name, build] of Object.entries(SAMPLES)) {
  fs.writeFileSync(path.join(dir, name), await build());
  console.log(`samples/${name}`);
}
