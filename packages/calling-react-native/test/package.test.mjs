import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('screen package is opt-in and does not become an engine dependency',async()=>{
  const engine=JSON.parse(await readFile(new URL('../../calling/package.json',import.meta.url)));
  const kit=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
  assert.equal(engine.dependencies?.[kit.name],undefined);
  assert.equal(engine.peerDependencies?.react,undefined);
  assert.equal(kit.peerDependenciesMeta['react-native-webrtc'].optional,true);
  const ui=await readFile(new URL('../dist/index.js',import.meta.url),'utf8');
  assert.equal(/from ['"]\.\/native/.test(ui),false);
  const native=await readFile(new URL('../dist/native.js',import.meta.url),'utf8');
  assert.equal(/Loop|child_app_id|supabase|apiKey|CallKit/.test(native),false);
});
test('sound files have valid PCM headers and short distinct durations',async()=>{
  const durations=[];
  for(const name of ['ringing','connecting','ended']) {
    const data=await readFile(new URL(`../assets/${name}.wav`,import.meta.url));
    assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');
    const duration=data.readUInt32LE(40)/data.readUInt32LE(28);
    assert.ok(duration>0 && duration<3); durations.push(duration);
  }
  assert.equal(new Set(durations).size,3);
});
