import { RobonoLinkedAppError, type Tokens } from "./index.js";
import type { EventPage } from "./delivery.js";

/** Supported by browser, React Native and modern Node WebSocket implementations. */
export type LinkedSocket = Pick<WebSocket,
  "readyState" | "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close">;
export type LinkedSocketFactory = (url: string) => LinkedSocket;

/** One connection; the caller owns replay/checkpoints and reconnect backoff. */
export async function consumeStream(input: {
  url: string; factory: LinkedSocketFactory; tokens: Tokens; cursor: string | null;
  signal: AbortSignal; onPage(page: EventPage): Promise<void>;
}) {
  if (input.signal.aborted) return;
  const socket = input.factory(input.url);
  let ended = false, ready = false, processing = false, chain = Promise.resolve();
  let settle: (error?: unknown) => void;
  const completion = new Promise<void>((resolve, reject) => { settle = (error) => error ? reject(error) : resolve(); });
  let watchdog: ReturnType<typeof setTimeout>;
  const finish = (error?: unknown) => {
    if (ended) return;
    ended = true; clearTimeout(watchdog); input.signal.removeEventListener("abort", abort);
    try { socket.close(1000); } catch { /* Already disconnected. */ }
    // No overlapping callbacks when the next connection resumes.
    void chain.then(() => settle(error), (callbackError) => settle(callbackError));
  };
  const touch = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => finish(new RobonoLinkedAppError("stream_timeout", 503)), 40_000);
  };
  const abort = () => finish();
  input.signal.addEventListener("abort", abort, { once: true });
  touch();
  socket.onopen = () => {
    if (ended || input.signal.aborted) return finish();
    socket.send(JSON.stringify({ type: "authenticate", version: 1, access_token: input.tokens.accessToken, cursor: input.cursor }));
  };
  socket.onmessage = (event) => {
    if (ended) return;
    try {
      if (typeof event.data !== "string" || event.data.length > 256_000) throw new Error();
      const frame = JSON.parse(event.data);
      touch();
      if (frame.type === "error") return finish(new RobonoLinkedAppError(typeof frame.error === "string" ? frame.error : "stream_error", Number(frame.status) || 503));
      if (frame.type === "reconnect") return finish();
      if (frame.type === "ready") {
        if (ready || frame.grant_id !== input.tokens.grantId) throw new Error();
        ready = true; return;
      }
      if (!ready) throw new Error();
      if (frame.type === "ping") { socket.send(JSON.stringify({ type: "pong" })); return; }
      const page = frame.page as EventPage;
      if (frame.type !== "page" || processing || !page || !Array.isArray(page.events) || page.events.length > 100 ||
        typeof page.cursor !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(page.cursor) || typeof page.has_more !== "boolean") throw new Error();
      processing = true;
      chain = chain.then(async () => {
        if (input.signal.aborted) return;
        await input.onPage(page);
        processing = false;
        if (!ended && !input.signal.aborted && socket.readyState === 1) socket.send(JSON.stringify({ type: "ack", cursor: page.cursor }));
      });
      void chain.catch(finish);
    } catch { finish(new RobonoLinkedAppError("invalid_stream", 400)); }
  };
  socket.onerror = () => finish(new RobonoLinkedAppError("stream_unavailable", 503));
  socket.onclose = (event) => finish(event.code === 1000 ? undefined : new RobonoLinkedAppError("stream_disconnected", 503));
  if (input.signal.aborted) abort();
  return completion;
}
