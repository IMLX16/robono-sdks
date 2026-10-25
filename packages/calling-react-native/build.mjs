import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {cwd: new URL('.', import.meta.url), stdio: 'inherit'});
await import('./sbom.mjs');
