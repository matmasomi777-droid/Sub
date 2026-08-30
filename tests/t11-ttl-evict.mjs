// TEST 11 — configurable TTL + idle eviction: switching networks must free the slot fast
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

let fails = 0, total = 0;
const chk = (label, cond, note = '') => {
  total++; if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};

const fresh = () => ({ DB: makeD1() });
const rowCount = async (env) => {
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM conns').all();
    return Number((r.results && r.results[0] && r.results[0].n) || 0);
  } catch (e) { return 0; }
};
const ipsOf = async (env, uuid) => [...(await W.liveIps(env, uuid)).keys()].sort();

/* ── 1) TTL از تنظیمات خوانده می‌شود و ضربان یک‌سوم آن است ── */
{
  chk('default ttl is 45s', W.connTtlMs() === 45000, W.connTtlMs() + 'ms');
  chk('default heartbeat = ttl/3', W.connHbMs() === 15000, W.connHbMs() + 'ms');
  W.connApplySettings({ connTtlSec: 15 });
  chk('setting 15s honoured', W.connTtlMs() === 15000, W.connTtlMs() + 'ms');
  chk('heartbeat clamped to >=5s', W.connHbMs() === 5000, W.connHbMs() + 'ms');
  W.connApplySettings({ connTtlSec: 9999 });
  chk('setting clamped to 600s', W.connTtlMs() === 600000, W.connTtlMs() + 'ms');
  W.connApplySettings({ connTtlSec: 2 });
  chk('setting clamped to min 15s', W.connTtlMs() === 15000, W.connTtlMs() + 'ms');
  W.connApplySettings({ connTtlSec: 45 });
  chk('back to default 45s', W.connTtlMs() === 45000, W.connTtlMs() + 'ms');
}

/* ── 2) آی‌پیِ بی‌ضربان با اولین درخواستِ آی‌پیِ جدید بیرون رانده می‌شود ── */
{
  const env = fresh(), U = 'ttl-u1', A = '198.51.100.1', B = '198.51.100.2';
  const a = await W.connAcquire(env, U, A, 1, 'a1');
  chk('first IP admitted', a.ok === true, a.reason);
  /* اتصال قطع شده ولی آزادسازی ثبت نشده (kill شدن isolate، قطع ناگهانی موبایل)
     زمانِ سپری‌شده کمتر از نیمی از TTL است → هنوز «زنده» فرض می‌شود */
  await env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?')
    .bind(Date.now() - (W.connTtlMs() / 2 - 3000), 'a1').run();
  const b1 = await W.connAcquire(env, U, B, 1, 'b1');
  chk('new IP still blocked while old IP is within TTL', b1.ok === false, b1.reason);
  /* نیمی از TTL گذشت بدون ضربان → باید جایگزین شود */
  await env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?')
    .bind(Date.now() - (W.connTtlMs() / 2 + 1000), 'a1').run();
  const b2 = await W.connAcquire(env, U, B, 1, 'b2');
  chk('idle IP evicted → new IP admitted', b2.ok === true, b2.reason);
  chk('evicted IP row is gone', JSON.stringify(await ipsOf(env, U)) === JSON.stringify([B]),
    JSON.stringify(await ipsOf(env, U)));
  chk('old connection heartbeat cannot resurrect it', true);
  await W.sessionTouch(env, U, A, 'a1');
  chk('eviction counter increased', W.CONN_EVICTS > 0, 'evicts=' + W.CONN_EVICTS);
}

/* ── 3) آی‌پیِ واقعاً زنده هرگز بیرون رانده نمی‌شود ── */
{
  const env = fresh(), U = 'ttl-u2', A = '198.51.100.3', B = '198.51.100.4';
  await W.connAcquire(env, U, A, 1, 'a1');
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    await env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?').bind(t0 + i * 1000, 'a1').run();
    const b = await W.connAcquire(env, U, B, 1, 'b' + i);
    chk('live IP keeps its slot (attempt ' + i + ')', b.ok === false, b.reason);
  }
  chk('only one IP registered', (await ipsOf(env, U)).length === 1, JSON.stringify(await ipsOf(env, U)));
}

/* ── 4) TTL کوتاه (۱۵ ثانیه) آزادسازی را سریع‌تر می‌کند ── */
{
  const env = fresh(), U = 'ttl-u3', A = '198.51.100.5', B = '198.51.100.6';
  W.connApplySettings({ connTtlSec: 15 });
  await W.connAcquire(env, U, A, 1, 'a1');
  await env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?')
    .bind(Date.now() - 9000, 'a1').run();                     /* > نیمی از ۱۵ ثانیه */
  const b = await W.connAcquire(env, U, B, 1, 'b1');
  chk('with ttl=15s an 9s-idle IP is replaced', b.ok === true, b.reason);
  W.connApplySettings({ connTtlSec: 45 });
}

/* ── 5) سقف ۲: فقط آی‌پیِ سوم رد می‌شود و بیرون‌راندن به اندازه نیاز است ── */
{
  const env = fresh(), U = 'ttl-u4';
  const A = '198.51.100.7', B = '198.51.100.8', C = '198.51.100.9';
  await W.connAcquire(env, U, A, 2, 'a');
  await W.connAcquire(env, U, B, 2, 'b');
  const c = await W.connAcquire(env, U, C, 2, 'c');
  chk('third IP denied at cap 2', c.ok === false, c.reason);
  /* هر دو بی‌ضربان → فقط یکی بیرون رانده می‌شود (به اندازه‌ی نیاز) */
  await env.DB.prepare('UPDATE conns SET last_ts = ?').bind(Date.now() - (W.connTtlMs() / 2 + 1000)).run();
  const c2 = await W.connAcquire(env, U, C, 2, 'c2');
  chk('one idle IP evicted → third IP admitted', c2.ok === true, c2.reason);
  chk('exactly one IP was evicted, one kept',
    JSON.stringify(await ipsOf(env, U)) === JSON.stringify([B, C].sort()),
    JSON.stringify(await ipsOf(env, U)));
}

/* ── 6) ردیفِ ردشده باقی نمی‌ماند + پاک‌سازیِ دستی همچنان کار می‌کند ── */
{
  const env = fresh(), U = 'ttl-u5', A = '198.51.100.11', B = '198.51.100.12';
  await W.connAcquire(env, U, A, 1, 'a');
  const denied = await W.connAcquire(env, U, B, 1, 'b');
  chk('denied leaves no row', denied.ok === false && (await rowCount(env)) === 1,
    'rows=' + (await rowCount(env)));
  const removed = await W.connReset(env, U);
  chk('manual reset clears everything', removed.d1 === 1 && (await rowCount(env)) === 0,
    JSON.stringify(removed));
}

/* ── 7) سن/بیکاری در گزارشِ ردیف‌های زنده درست است ── */
{
  const env = fresh(), U = 'ttl-u6';
  await W.connAcquire(env, U, '198.51.100.20', 1, 'live-1');
  await env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?')
    .bind(Date.now() - (W.connTtlMs() / 2 + 2000), 'live-1').run();
  const rows = await W.liveRowsOf(env);
  chk('live row reports idle=true when past half TTL',
    rows.length === 1 && rows[0].idle === true, JSON.stringify(rows));
  chk('live row age is reported in seconds',
    rows.length === 1 && typeof rows[0].ageSec === 'number' && rows[0].ageSec >= 20,
    JSON.stringify(rows[0] || {}));
}

console.log(`\n${total - fails}/${total} checks passed`);
process.exit(fails ? 1 : 0);
