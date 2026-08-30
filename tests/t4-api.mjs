// TEST 4 — reset-usage button end-to-end (UI request -> /api/users op=reset -> D1 -> /api/state)
//          and the real 1 MB traffic test through the tunnel.
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

const env = { DB: makeD1() };
const HOST = 'panel.example.workers.dev';
const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ctx = makeCtx();
const call = async (method, path, body, token) => {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await W.default.fetch(new Request('https://' + HOST + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  return res.json();
};

// ── login ──
const login = await call('POST', '/api/login', { password: 'simorgh' });
if (!login.token) { console.log('FAIL login:', JSON.stringify(login)); process.exit(1); }
console.log('PASS  login');

// ── create the user through the API (so it is in the blob) ──
const created = await call('POST', '/api/users', { name: 'ali', uuid: UUID, secret: 'sec-ali' }, login.token);
eq('user created', created.ok, true);

// ── push some usage in (as the tunnel would) ──
await W.usageInit(env, W.seed(W.DEF()));
await W.usageDelta(env, UUID, 123456, 6543210, 42);
let st = await call('GET', '/api/state', null, login.token);
let u = st.users.find((x) => x.uuid === UUID);
eq('state shows up', u.up, 123456);
eq('state shows down', u.down, 6543210);
eq('state shows reqs', u.totalReq, 42);

// ── reset via the exact request the UI button sends ──
const reset = await call('POST', '/api/users', { id: u.id, op: 'reset' }, login.token);
eq('reset endpoint ok', reset.ok, true);

st = await call('GET', '/api/state', null, login.token);
u = st.users.find((x) => x.uuid === UUID);
eq('after reset: up is 0', u.up, 0);
eq('after reset: down is 0', u.down, 0);
eq('after reset: reqs is 0', u.totalReq, 0);
eq('after reset: dailyUsed is 0', u.dailyUsed, 0);
const fresh = await W.usageFresh(env, UUID);
eq('after reset: D1 row gone (up)', fresh.up, 0);
eq('after reset: D1 row gone (down)', fresh.down, 0);

// ══════════════════════════════════════════════════════════════
//  traffic test: 1 MB downloaded *through the user's own config*
// ══════════════════════════════════════════════════════════════
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u2 = new URL(typeof input === 'string' ? input : input.url);
  if (u2.hostname === HOST) return W.default.fetch(new Request(u2.toString(), init), env, makeCtx());
  throw new Error('unexpected outbound fetch to ' + u2.toString());
};
__mock.connect = () => fakeSocket(1);   // should never be used: the panel test goes via httpFallback

/* «تست ترافیک» حالا دو مرحله‌ای است (traffic-begin → traffic-end) و خودش را در
   t7-traffic-api کامل بررسی می‌کنیم؛ اینجا فقط APIِ مدیریتی را می‌سنجیم. */
globalThis.fetch = realFetch;

await ctx._settle();
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL API/RESET TESTS PASSED');
process.exit(fails ? 1 : 0);
