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

test('Expo resolves the documented package and all existing plugin paths to the same plugin',async()=>{
  const {createRequire}=await import('node:module');
  const {mkdtempSync,mkdirSync,symlinkSync,rmSync}=await import('node:fs');
  const {homedir}=await import('node:os');const path=await import('node:path');
  const root=path.resolve(import.meta.dirname,'../../..');
  const parent=path.join(homedir(),'Robono-archives/experiments/calling-compatibility-2026-10-25');mkdirSync(parent,{recursive:true});
  const dir=mkdtempSync(path.join(parent,'plugin-resolver-'));
  try {
    mkdirSync(path.join(dir,'node_modules/@robono'),{recursive:true});
    symlinkSync(path.resolve(import.meta.dirname,'..'),path.join(dir,'node_modules/@robono/calling-react-native'),'dir');
    const require=createRequire(new URL('../package.json',import.meta.url));
    const {resolveConfigPluginFunction}=require('@expo/config-plugins/build/utils/plugin-resolver');
    const plugins=['@robono/calling-react-native','@robono/calling-react-native/app.plugin','@robono/calling-react-native/app.plugin.js','@robono/calling-react-native/app.plugin.cjs'].map(name=>resolveConfigPluginFunction(dir,name));
    for(const plugin of plugins)assert.equal(plugin,plugins[0]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
