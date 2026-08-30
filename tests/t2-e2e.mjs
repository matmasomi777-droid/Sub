// TEST 2 — end-to-end: real fetch() entrypoint, real tunnel path, real D1 (SQLite).
// Drives a VLESS WebSocket session with a known response size and checks what
// actually lands in the usage table.
import { makeD1 } from './d1.mjs';
import { makeCtx, fakeSocket } from './mocks.mjs';
import { __mock } from './cf-sockets.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${got} want=${want}`);
};
const near = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${got} want=${want}±${tol}`);
};

const env = { DB: makeD1() };
const UUID = '11111111-2222-3333-4444-555555555555';
const HOST = 'panel.example.workers.dev';

// seed a state blob with one user
{
  const st = W.seed(W.DEF());
  st.users = [{ id: 'u1', name: 'ali', uuid: UUID, secret: 'sec-ali', enabled: true, ipLimit: 0, deviceLimit: 3, up: 0, down: 0, totalReq: 0, quotaGB: 0, dailyQuotaMB: 0, expiryAt: null, note: '' }];
  await W.save(env, st);
}

const RESP_BYTES = 1048576;            // 1 MiB from the "remote" side

__mock.connect = () => fakeSocket(RESP_BYTES, 65536, true);   // live tunnel: stream stays open

const ctx = makeCtx();
const req = new Request('https://' + HOST + '/sg', {
  headers: { upgrade: 'websocket', connection: 'Upgrade', host: HOST, 'cf-connecting-ip': '203.0.113.7' },
});
const res = await W.default.fetch(req, env, ctx);
eq('101 switching protocols', res.status, 101);

const client = res.webSocket;
if (!client) { console.log('FAIL  no client websocket returned'); process.exit(1); }

// client sends a VLESS TCP dial to example.com:443 with a small HTTP payload
const payload = new TextEncoder().encode('GET /file HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n');
const header = W.vlessHeader({ uuid: UUID }, 'example.com', 443, payload);
await new Promise((r) => setTimeout(r, 50));      // let session() register its listeners
client.deliver(header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength));

// let the pipeline drain
for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 10)); if (client.recvBytes >= RESP_BYTES) break; }
await new Promise((r) => setTimeout(r, 200));
await ctx._settle();

console.log(`   (client received ${client.recvBytes} bytes from the tunnel)`);

const row = await W.usageFresh(env, UUID);
console.log('   usage row:', JSON.stringify(row));

// NOTE: row is read while the WebSocket is still open — this is the property the
// old code broke (usage was only written on disconnect).
eq('counted LIVE while tunnel still open (reqs)', row.reqs, 1);
eq('tunnel still open at read time', client.closed, false);
// upstream = exactly the HTTP request payload the client sent
eq('upstream bytes', row.up, payload.byteLength);
// downstream = the bytes delivered from the remote socket (the 2-byte VLESS
// response header is protocol framing and is deliberately not counted)
eq('downstream bytes', row.down, RESP_BYTES);

// ── now close the tunnel and make sure nothing is lost / double counted ──
client.close();
await new Promise((r) => setTimeout(r, 200));
await ctx._settle();
const row2 = await W.usageFresh(env, UUID);
eq('no double count after close (up)', row2.up, payload.byteLength);
eq('no double count after close (down)', row2.down, RESP_BYTES);
eq('no double count after close (reqs)', row2.reqs, 1);

// ── connection release: session row must be gone (or zero) after close ──
const sess = await W.sessionsOf(env, UUID);
eq('no leaked session rows', sess.length, 0);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL E2E TUNNEL TESTS PASSED');
process.exit(fails ? 1 : 0);
