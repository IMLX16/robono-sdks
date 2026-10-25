import { RobonoCallingClient } from '@robono/calling';
import { createController } from './controller.mjs';
import type { CallingController, CallingOptions } from './types.js';
export function createCallingController(options: CallingOptions): CallingController {
  return createController({ ...options, createClient: (settings: ConstructorParameters<typeof RobonoCallingClient>[0]) => new RobonoCallingClient(settings) });
}
export { CallingScreen, CallingOverlay, useCalling } from './screens.js';
export { CallHistoryItem } from './history.js';
export type { CallingScreenProps, CallingOverlayProps, CallingLabels, CallingTheme } from './screens.js';
export type { CallAudio, CallingState, CallingController, CallingOptions, Contact, MediaAdapter, Phase } from './types.js';
