import assert from "node:assert/strict";
import test from "node:test";
import { createRobonoWeb } from "../dist/index.js";

test("web wrapper pauses polling when the page is hidden", async () => {
  const listeners = new Map();
  const document = {
    hidden: false,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
  };
  const transport = {
    listNetworks: async () => ({ directory: [] }),
    requestNetworkConnection: async () => ({}),
    respondNetworkConnection: async () => ({}),
    listNetworkConnections: async () => ({ connections: [], has_more: false, next_before: null }),
    disconnectNetworkConnection: async () => ({}),
    updateNetworkConnection: async () => ({}),
    createRobonoConnection: async () => ({}),
    listRobonoConnections: async () => ({ connections: [], has_more: false, next_before: null }),
    updateRobonoConnection: async () => ({}),
    disconnectRobonoConnection: async () => ({}),
    sendNetworkMessage: async () => ({}),
    listNetworkMessages: async () => ({ messages: [], has_more: false, next_before: null }),
    markNetworkMessage: async () => ({}),
    sendRobonoMessage: async () => ({}),
    listRobonoMessages: async () => ({ messages: [], has_more: false, next_before: null }),
    transformSpeech: async () => ({}),
  };
  const web = createRobonoWeb({ externalUserId: "user-1", transport, document, pollingEnabled: false });
  await web.start();
  assert.equal(web.client.getState().diagnostics.running, true);
  assert.equal(web.client.getState().lastError, null);
  document.hidden = true;
  listeners.get("visibilitychange")();
  assert.equal(web.client.getState().diagnostics.running, false);
  web.dispose();
});
