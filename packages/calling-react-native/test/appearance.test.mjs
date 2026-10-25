import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultCallingAppearance,validateCallingAppearance,soundCatalog} from '../dist/appearance.js';
import {createCallAudio} from '../src/audio.mjs';
test('presentation contract validates every field',async()=>{
 const config=defaultCallingAppearance('My app');assert.deepEqual(validateCallingAppearance(config),config);
 for(const mutate of [c=>c.theme.background='red',c=>c.logoUrl='javascript:alert(1)',c=>c.logoUrl='https://secret@example.com/logo',c=>c.labels.answer='',c=>c.labels.answer='x'.repeat(33),c=>c.sounds.ended='unknown']){const bad=structuredClone(config);mutate(bad);assert.throws(()=>validateCallingAppearance(bad));}
});
test('every selectable sound includes a WAV asset',async()=>{
 for(const key of Object.keys(soundCatalog).filter(x=>x!=='none'))assert.equal((await readFile(new URL('../assets/'+key+'.wav',import.meta.url))).subarray(0,4).toString(),'RIFF');
});
test('selected cues loop only for waiting states; local interruption stays silent',async()=>{
 const played=[];const sounds={incoming:'marimba',connecting:'pulse',connected:'click',resumed:'bell',held:'click'};
 const audio=createCallAudio({sound:event=>sounds[event]||'none',pause(){},playing:()=>false,prepare:async()=>{},play:async(kind,options)=>played.push({kind,...options}),release:async()=>{},dispose(){},onError:e=>{throw e;}});
 const update=(phase,extra={})=>audio.update({phase,foreground:true,speaker:false,endTone:false,...extra});
 await update('incoming');await update('connecting');await update('connected');await update('connected',{speaker:true});
 assert.deepEqual(played.map(p=>[p.kind,p.loop]),[['marimba',true],['pulse',true],['click',false]]);
 await update('held',{localHeld:true});assert.equal(played.length,3);
 await update('connected',{cue:'resumed'});assert.equal(played.at(-1).kind,'bell');assert.equal(played.at(-1).loop,false);await audio.dispose();
});
