import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
// Explicit public entry points: native device registration belongs to the host app.
await rm(new URL('./dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
for (const name of ['index', 'history']) {
  const source = await readFile(new URL(`./src/${name}.mjs`, import.meta.url), 'utf8');
  const types = await readFile(new URL(`./src/${name === 'index' ? 'index.d.ts' : 'history.d.mts'}`, import.meta.url), 'utf8');
  await writeFile(new URL(`./dist/${name}.js`, import.meta.url), source.replaceAll("'./index.mjs'", "'./index.js'"));
  await writeFile(new URL(`./dist/${name}.d.ts`, import.meta.url), types.replaceAll("'./index.mjs'", "'./index.js'"));
}
