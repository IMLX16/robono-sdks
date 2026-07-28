import assert from "node:assert/strict";
import test from "node:test";
import { createRobonoReactNative } from "../dist/index.js";

function fakeTransport() {
  return {
    listNetworks: async () => ({ directory: [] }),
    listLanguages: async () => ({ languages: [] }),
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
}

test("react native wrapper follows foreground state", async () => {
  let listener;
  const appState = {
    currentState: "active",
    addEventListener: (_name, next) => {
      listener = next;
      return { remove() {} };
    },
  };
  const transport = fakeTransport();
  const native = createRobonoReactNative({ externalUserId: "user-1", transport, appState, pollingEnabled: false });
  await native.start();
  assert.equal(native.client.getState().diagnostics.running, true);
  assert.equal(native.client.getState().lastError, null);
  listener("background");
  assert.equal(native.client.getState().diagnostics.running, false);
  native.dispose();
});

test("react native wrapper starts while the initial app state is still unknown", async () => {
  let listener;
  const appState = {
    currentState: null,
    addEventListener: (_name, next) => {
      listener = next;
      return { remove() {} };
    },
  };
  const native = createRobonoReactNative({
    externalUserId: "user-1",
    transport: fakeTransport(),
    appState,
    pollingEnabled: false,
  });

  await native.start();

  assert.equal(native.client.getState().diagnostics.running, true);
  listener("background");
  assert.equal(native.client.getState().diagnostics.running, false);
  native.dispose();
});

test("react native wrapper accepts Expo notification content data", async () => {
  const received = [];
  const bridge = createRobonoReactNative({
    externalUserId: "user-1",
    transport: fakeTransport(),
    pollingEnabled: false,
  });
  bridge.client.receivePush = async (event) => {
    received.push(event);
  };
  await bridge.receivePushNotification({
    request: {
      content: {
        data: {
          event: "bridge.message_created",
          bridge_connection_id: "connection-1",
          bridge_message_id: "message-1",
        },
      },
    },
  });
  assert.equal(received[0].event, "bridge.message_created");
  assert.equal(received[0].bridge_connection_id, "connection-1");
});
