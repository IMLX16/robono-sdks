import { RobonoCallingClient } from '@robono/calling';
import { createController } from './controller.mjs';
import {Platform} from 'react-native';
import type { CallingController, CallingOptions } from './types.js';
export function createCallingController(options: CallingOptions): CallingController {
  const controller = createController({ ...options, createClient: (settings: ConstructorParameters<typeof RobonoCallingClient>[0]) => new RobonoCallingClient(settings) });
  const components=new Set<string>(['controller',...(options.audio.robonoAdapter?['native-audio']:[]),...(options.media.robonoAdapter?['native-media']:[])]);
  let sent='';
  controller.reportComponents=(extra: string[])=>{
    extra.forEach(x=>components.add(x));const key=[...components].sort().join(',');if(sent===key)return;sent=key;
    // Inventory is explicitly client-declared; it cannot set charges or access.
    void Promise.resolve().then(()=>options.request('client-info',{platform:Platform.OS,engineVersion:'0.1.1',mobileVersion:'0.2.0',components:[...components].sort(),appearanceRevision:options.appearanceRevision})).catch(()=>{sent='';});
  };
  const listen=controller.listen;controller.listen=async()=>{await listen();controller.reportComponents?.([]);};
  return controller;
}
export { CallingScreen, CallingOverlay, useCalling } from './screens.js';
export { CallHistoryItem } from './history.js';
export type { CallingScreenProps, CallingOverlayProps, CallingLabels, CallingTheme } from './screens.js';
export type { CallAudio, CallingState, CallingController, CallingOptions, Contact, MediaAdapter, Phase } from './types.js';

export {callingInk,defaultCallingAppearance,validateCallingAppearance,soundCatalog} from './appearance.js';
export type {CallingAppearance,SoundChoice,SoundEvent} from './appearance.js';
