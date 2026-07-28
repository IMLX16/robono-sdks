import {
  createRobonoHttpTransport,
  RobonoClient,
  type JsonObject,
  type RobonoClientOptions,
  type RobonoHttpTransportOptions,
  type RobonoPushEvent,
} from "@robono/client";

export interface AppStateAdapter {
  currentState: string | null;
  addEventListener(
    event: "change",
    listener: (state: string) => void,
  ): { remove(): void } | (() => void);
}

export type RobonoReactNativeOptions = Omit<RobonoClientOptions, "transport"> & {
  transport?: RobonoClientOptions["transport"];
  http?: RobonoHttpTransportOptions;
  appState?: AppStateAdapter;
};

export class RobonoReactNative {
  readonly client: RobonoClient;
  private readonly appState: AppStateAdapter | undefined;
  private removeAppStateListener: (() => void) | null = null;

  constructor(options: RobonoReactNativeOptions) {
    const transport = options.transport ??
      (options.http ? createRobonoHttpTransport(options.http) : null);
    if (!transport) throw new Error("Provide a Robono transport or HTTP configuration.");
    this.client = new RobonoClient({
      externalUserId: options.externalUserId,
      transport,
      ...(options.directoryTtlMs === undefined ? {} : { directoryTtlMs: options.directoryTtlMs }),
      ...(options.pollingIntervalMs === undefined ? {} : { pollingIntervalMs: options.pollingIntervalMs }),
      ...(options.maxPollingIntervalMs === undefined ? {} : { maxPollingIntervalMs: options.maxPollingIntervalMs }),
      ...(options.pollingJitterRatio === undefined ? {} : { pollingJitterRatio: options.pollingJitterRatio }),
      ...(options.pollingEnabled === undefined ? {} : { pollingEnabled: options.pollingEnabled }),
      ...(options.random === undefined ? {} : { random: options.random }),
    });
    this.appState = options.appState;
  }

  async start() {
    if (this.appState && !this.removeAppStateListener) {
      const subscription = this.appState.addEventListener("change", this.onAppStateChange);
      this.removeAppStateListener = typeof subscription === "function"
        ? subscription
        : () => subscription.remove();
    }
    if (!this.appState || this.appState.currentState === "active") {
      return this.client.start();
    }
    return undefined;
  }

  stop() {
    this.client.stop();
  }

  dispose() {
    this.stop();
    this.removeAppStateListener?.();
    this.removeAppStateListener = null;
  }

  receivePushNotification(notification: JsonObject) {
    const request = record(notification.request);
    const content = record(request?.content);
    const data = record(notification.data) ??
      record(content?.data) ??
      record(notification.robono) ??
      notification;
    return this.client.receivePush(data as RobonoPushEvent);
  }

  private readonly onAppStateChange = (state: string) => {
    if (state === "active") void this.client.start().catch(() => undefined);
    else this.client.stop();
  };
}

export function createRobonoReactNative(options: RobonoReactNativeOptions) {
  return new RobonoReactNative(options);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

export * from "@robono/client";
