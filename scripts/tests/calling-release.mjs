import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] || '.');
const output = resolve(process.argv[3] || join(homedir(), 'Robono-archives/experiments/calling-sdk-release-2026-10-23'));
mkdirSync(output, { recursive: true });
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const artifacts = [];
for (const name of ['calling', 'server']) {
 const cwd = join(root, 'packages', name);
 run('npm', ['test'], cwd);
 const result = run('npm', ['pack', '--json', '--pack-destination', output], cwd);
 const [packed] = JSON.parse(result.slice(result.indexOf('[\n')));
 const paths = packed.files.map(f => f.path);
 for (const required of ['LICENSE','README.md','CHANGELOG.md','SBOM.spdx.json','dist/index.js','dist/index.d.ts']) {
  if (!paths.includes(required)) throw Error(`${name}: missing ${required}`);
 }
 for (const path of paths) if (/(^|\/)(src|test|node_modules|\.env)(\/|$)/.test(path)) throw Error(`Unexpected public file: ${path}`);
 if (name === 'calling' && paths.some(p => /native-runtime|audio-diagnostics/.test(p))) throw Error('Private runtime leaked');
 const file = join(output, packed.filename);
 artifacts.push({name, file, filename: packed.filename, sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),integrity:packed.integrity,files:paths});
}
const consumer = join(output, 'consumer');
mkdirSync(consumer, { recursive:true });
writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'robono-calling-package-verification',private:true,type:'module',dependencies:Object.fromEntries(artifacts.map(p=>['@robono/'+p.name,'file:'+p.file]))},null,2));
run('npm',['install','--ignore-scripts','--offline','--no-audit','--no-fund'],consumer);
// Execute the actual cancellation/recovery suite against the installed tarball.
const clientTests = readFileSync(join(root,'packages/calling/test/client.test.mjs'),'utf8').replace("'../src/index.mjs'","'@robono/calling'");
writeFileSync(join(consumer,'client.test.mjs'),clientTests);
writeFileSync(join(consumer,'exports.test.mjs'),`import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCallHistory, describeCall } from '@robono/calling/history';
import { toCallingPushPayload } from '@robono/server';
test('installed public entry points and webhook helper',()=>{
 assert.deepEqual(mergeCallHistory({cursor:0,entries:[]},{entries:[],nextCursor:0,hasMore:false}),{cursor:0,entries:[]});
 assert.equal(describeCall({role:'callee',connectedAt:null,reason:'cancelled'}).label,'Missed voice call');
 assert.equal(toCallingPushPayload({event:'calling.incoming',event_id:'event',call:{id:'call',connection_id:'bridge:friend',ring_expires_at:'2026-10-23T10:00:00Z',sequence:1}}).call_id,'call');
});`);
writeFileSync(join(consumer,'consumer.ts'),`import { RobonoCallingClient, createHttpTransport, type Snapshot } from '@robono/calling';
import { mergeCallHistory, describeCall } from '@robono/calling/history';
import { toCallingPushPayload, type CallingWebhookEvent } from '@robono/server';
const client = new RobonoCallingClient({request:createHttpTransport({baseUrl:'https://example.invalid',token:'session'}),onChange:(snapshot:Snapshot)=>snapshot.call?.connectedAt});
const history = mergeCallHistory({cursor:0,entries:[]},await client.history());
if(history.entries[0]) describeCall(history.entries[0]);
declare const event: CallingWebhookEvent;
toCallingPushPayload(event);
await client.dispose();`);
const compiler = join(root,'packages/server/node_modules/typescript/bin/tsc');
run('node',[compiler,'--noEmit','--strict','--skipLibCheck','--module','NodeNext','--target','ES2022','--lib','ES2022,DOM','consumer.ts'],consumer);
const testOutput=run('node',['--test','client.test.mjs','exports.test.mjs'],consumer);
writeFileSync(join(output,'installed-package-tests.log'),testOutput);
writeFileSync(join(output,'SHA256SUMS'),artifacts.map(p=>`${p.sha256}  ${p.filename}`).join('\n')+'\n');
writeFileSync(join(output,'package-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),artifacts},null,2)+'\n');
// Dependencies are rebuildable; preserve tests, lockfile, checksums and release packages.
rmSync(join(consumer,'node_modules'),{recursive:true,force:true});
console.log(testOutput);
console.log('Versioned packages and SHA256SUMS:',output);
