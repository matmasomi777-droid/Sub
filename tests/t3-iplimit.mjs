// TEST 3 — the cap counts DISTINCT concurrent IPs per user (Nova-Proxy model)
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

const env = { DB: makeD1() };
const U = 'uuid-limit';
const A = '203.0.113.10', B = '198.51.100.20', C = '198.51.100.21';
await W.usageInit(env, W.seed(W.DEF()));

/* ── ۱) سقفِ ۲: دو آی‌پی مجاز، سومی رد می‌شود ── */
eq('A #1 allowed', (await W.connAcquire(env, U, A, 2, 'a1')).ok, true);
eq('A #2 allowed (same IP)', (await W.connAcquire(env, U, A, 2, 'a2')).ok, true);
eq('B #1 allowed (2nd IP)', (await W.connAcquire(env, U, B, 2, 'b1')).ok, true);
eq('C #1 denied (3rd IP)', (await W.connAcquire(env, U, C, 2, 'c1')).ok, false);

/* ── ۲) آزادسازی فقط سهمیهٔ همان اتصال را کم می‌کند ── */
await W.connRelease(env, U, A, 'a1');
eq('A still counted (a2 is alive)', (await W.connAcquire(env, U, C, 2, 'c2')).ok, false);
await W.connRelease(env, U, A, 'a2');
eq('C admitted after A is fully released', (await W.connAcquire(env, U, C, 2, 'c3')).ok, true);

/* ── ۳) سقفِ ۰ یعنی نامحدود ── */
const nl = await W.connAcquire(env, 'uuid-nolimit', A, 0, 'n1');
eq('limit 0 => allowed', nl.ok, true);
eq('limit 0 => not enforced', nl.enforced, false);

/* ── ۴) ضربان یک اتصالِ زنده را از پاک‌سازی نجات می‌دهد ── */
{
  const st = await W.connAcquire(env, 'uuid-hb', A, 1, 'h1');
  eq('hb: acquired', st.ok, true);
  await W.sessionTouch(env, 'uuid-hb', A, 'h1');
  const live = await W.sessionsOf(env, 'uuid-hb');
  eq('hb: session still live', (live.find((x) => x.ip === A) || { conns: 0 }).conns, 1);
}

/* ── ۵) ردیفِ بی‌ضربان بعد از TTL پاک می‌شود ── */
{
  await W.connAcquire(env, 'uuid-dead', A, 1, 'd1');
  await env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?')
    .bind(Date.now() - (W.CONN_TTL + 1000), 'd1').run();
  await W.liveSweep(env, 'uuid-dead');
  eq('dead row swept', (await W.sessionsOf(env, 'uuid-dead')).length, 0);
}

/* ── ۶) هر کاربر مستقل است — آی‌پیِ مشترک اشتراکِ سهمیه نیست ── */
{
  eq('user2 #1 allowed on the same IP', (await W.connAcquire(env, 'uuid-other', A, 1, 'o1')).ok, true);
  eq('user2 #2 denied at its own cap', (await W.connAcquire(env, 'uuid-other', B, 1, 'o2')).ok, false);
  const u1 = await W.sessionsOf(env, 'uuid-hb');
  eq('user1 unaffected by user2 denial', u1.length, 1);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL IP-LIMIT TESTS PASSED');
process.exit(fails ? 1 : 0);
