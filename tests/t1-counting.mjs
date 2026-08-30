// TEST 1 — volume/usage counting against real SQLite
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

const env = { DB: makeD1() };
const st = W.seed(W.DEF());
const U1 = 'uuid-aaa', U2 = 'uuid-bbb';
st.users = [
  { id: 'a', name: 'ali', uuid: U1, secret: 's1', enabled: true, ipLimit: 0, deviceLimit: 3, up: 0, down: 0, totalReq: 0, quotaGB: 0, dailyQuotaMB: 0 },
  { id: 'b', name: 'sara', uuid: U2, secret: 's2', enabled: true, ipLimit: 0, deviceLimit: 3, up: 0, down: 0, totalReq: 0, quotaGB: 0, dailyQuotaMB: 0 },
];

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${got} want=${want}`);
};

await W.usageInit(env, st);

// ── 1. many small deltas, like a real tunnel flushing every 512KB ──
const CHUNK = 65536, N = 40;               // 40 * 64KiB = 2,621,440 bytes down
let wantDown = 0, wantUp = 0;
for (let i = 0; i < N; i++) {
  await W.usageDelta(env, U1, CHUNK, CHUNK, 1);
  wantUp += CHUNK; wantDown += CHUNK;
}
let r = await W.usageFresh(env, U1);
eq('cumulative up', r.up, wantUp);
eq('cumulative down', r.down, wantDown);
eq('cumulative reqs', r.reqs, N);
eq('day bucket down', r.dayDown, wantDown);

// ── 2. second user must not be polluted ──
r = await W.usageFresh(env, U2);
eq('user2 untouched up', r.up, 0);

// ── 3. concurrency: 25 parallel deltas of 1000 bytes each ──
await W.usageDelta(env, U2, 0, 0, 0);
await Promise.all(Array.from({ length: 25 }, () => W.usageDelta(env, U2, 1000, 2000, 1)));
r = await W.usageFresh(env, U2);
eq('parallel up (25x1000)', r.up, 25000);
eq('parallel down (25x2000)', r.down, 50000);
eq('parallel reqs', r.reqs, 25);

// ── 4. reset then verify the counter the panel reads ──
await W.usageReset(env, U1);
r = await W.usageFresh(env, U1);
eq('after reset up', r.up, 0);
eq('after reset down', r.down, 0);
const map = await W.usageRead(env);
eq('after reset (usageRead/panel path) up', (map.get(U1) || { up: 0 }).up, 0);
eq('after reset (usageRead/panel path) down', (map.get(U1) || { down: 0 }).down, 0);
eq('after reset user2 unaffected', (map.get(U2) || {}).down, 50000);

// ── 5. counting resumes after reset ──
await W.usageDelta(env, U1, 500, 700, 2);
r = await W.usageFresh(env, U1);
eq('post-reset up', r.up, 500);
eq('post-reset down', r.down, 700);
eq('post-reset reqs', r.reqs, 2);

// ── 6. day-bucket rollover: force a delta with a past day then today ──
const day = W.dayKey();
eq('dayKey format YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(day), true);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL COUNTING TESTS PASSED');
process.exit(fails ? 1 : 0);
