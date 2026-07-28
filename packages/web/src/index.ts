import {
  createRobonoHttpTransport,
  RobonoClient,
  type RobonoClientOptions,
  type RobonoHttpTransportOptions,
  type RobonoPushEvent,
} from "@robono/client";

export type RobonoWebOptions = Omit<RobonoClientOptions, "transport"> & {
  transport?: RobonoClientOptions["transport"];
  http?: RobonoHttpTransportOptions;
  pauseWhenHidden?: boolean;
  document?: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
};

export class RobonoWeb {
  readonly client: RobonoClient;
  private readonly documentRef: RobonoWebOptions["document"];
  private readonly pauseWhenHidden: boolean;
  private listening = false;

  constructor(options: RobonoWebOptions) {
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
    this.documentRef = options.document ??
      (typeof document === "undefined" ? undefined : document);
    this.pauseWhenHidden = options.pauseWhenHidden ?? true;
  }

  async start() {
    if (this.pauseWhenHidden && this.documentRef && !this.listening) {
      this.documentRef.addEventListener("visibilitychange", this.onVisibilityChange);
      this.listening = true;
    }
    if (!this.documentRef?.hidden) return this.client.start();
    return undefined;
  }

  stop() {
    this.client.stop();
  }

  dispose() {
    this.stop();
    if (this.documentRef && this.listening) {
      this.documentRef.removeEventListener("visibilitychange", this.onVisibilityChange);
      this.listening = false;
    }
  }

  receivePush(event: RobonoPushEvent) {
    return this.client.receivePush(event);
  }

  private readonly onVisibilityChange = () => {
    if (this.documentRef?.hidden) this.client.stop();
    else void this.client.start().catch(() => undefined);
  };
}

export function createRobonoWeb(options: RobonoWebOptions) {
  return new RobonoWeb(options);
}

export * from "@robono/client";
