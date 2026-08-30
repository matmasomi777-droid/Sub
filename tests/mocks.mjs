// Cloudflare-runtime mocks for local testing (WebSocketPair, ctx.waitUntil, sockets)

export function makeWsPair() {
  const mk = () => ({
    readyState: 0,
    binaryType: 'blob',
    listeners: {},
    sent: [],
    recvBytes: 0,
    closed: false,
    accept() { this.readyState = 1; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    send(data) {
      const len = data && data.byteLength !== undefined ? data.byteLength : 0;
      this.sent.push(data);
      const o = this.other;
      if (o) {
        o.recvBytes += len;
        const ev = { data };
        (o.listeners['message'] || []).forEach((f) => { try { f(ev); } catch (e) {} });
      }
    },
    close(code, reason) {
      if (this.closed) return;
      this.closed = true;
      this.readyState = 3;
      this.closeCode = code; this.closeReason = reason;
      if (this.other) { this.other.closeCode = code; this.other.closeReason = reason; }
      (this.listeners['close'] || []).forEach((f) => { try { f({ code, reason }); } catch (e) {} });
      if (this.other && !this.other.closed) this.other.close(code, reason);
    },
    /** test helper: deliver bytes from the "client" side into the worker */
    deliver(data) {
      const o = this.other;
      if (!o) throw new Error('no peer');
      const ev = { data };
      (o.listeners['message'] || []).forEach((f) => { try { f(ev); } catch (e) {} });
    },
  });
  const client = mk(), server = mk();
  client.other = server; server.other = client;
  return [client, server];
}

globalThis.WebSocketPair = class WebSocketPair {
  constructor() { const [c, s] = makeWsPair(); this[0] = c; this[1] = s; }
};
// allow array destructuring: new WebSocketPair() -> [a, b]
const _WSProxy = new Proxy(globalThis.WebSocketPair, {
  construct(Target, args) { const o = new Target(...args); return [o[0], o[1]]; },
});
globalThis.WebSocketPair = _WSProxy;

// Node's Response rejects the 101 status used for WebSocket upgrades.
const RealResponse = globalThis.Response;
class TestResponse extends RealResponse {
  constructor(body, init) {
    if (init && (init.status === 101 || init.webSocket)) {
      super(null, { status: 200, headers: init.headers });
      Object.defineProperty(this, 'status', { value: 101, configurable: true });
      Object.defineProperty(this, 'webSocket', { value: init.webSocket, configurable: true });
    } else { super(body, init); }
  }
}
globalThis.Response = TestResponse;

/** ctx that records waitUntil promises so tests can await them */
export function makeCtx() {
  const pending = [];
  return {
    waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); },
    _settle: async () => { let n = 0; while (pending.length && n < 200) { await Promise.all(pending.splice(0)); n++; } },
    _pending: pending,
  };
}

/**
 * fake cloudflare socket whose readable yields `bytes` in `chunk` sized pieces.
 * `hold: true` keeps the stream open forever (simulates a live VPN tunnel).
 */
export function fakeSocket(totalBytes, chunk = 65536, hold = false) {
  let sent = 0;
  const written = [];
  const readable = new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) { if (!hold) controller.close(); return; }
      const n = Math.min(chunk, totalBytes - sent);
      controller.enqueue(new Uint8Array(n).fill(0x53));
      sent += n;
    },
  });
  const writable = new WritableStream({
    write(c) { written.push(c.byteLength || c.length || 0); },
  });
  return {
    readable, writable, written,
    close() { try { const p = readable.cancel(); if (p && p.catch) p.catch(() => {}); } catch (e) {} },
  };
}
