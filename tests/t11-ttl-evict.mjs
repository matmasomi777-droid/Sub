// TEST 11 — آزادسازیِ آنیِ آی‌پی: پنجره‌ی کهنگی ثابتِ ۳ ثانیه، بدون هیچ تنظیمی
//
// رفتارِ مورد انتظار بعد از حذفِ sec.connTtlSec:
//   • ضربانِ دوره‌ای (heartbeat) حذف شده؛ تمدید فقط وقتی بایتی واقعاً جریان
//     دارد انجام می‌شود و حداکثر یک بار در ثانیه برای هر اتصال است
//     (CONN_ACTIVITY_MS).
//   • آزادسازی آنی است: با قطع شدنِ اتصال ردیف همان لحظه پاک می‌شود.
//   • قطعیِ ناگهانی: نهایتاً ۳ ثانیه (CONN_TTL) بعد هنگامِ پذیرشِ بعدی پاک‌سازی
//     می‌شود.
//   • ردیفِ آزادشده هرگز دوباره زنده نمی‌شود.
import { readFileSync } from 'node:fs';
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

let fails = 0, total = 0;
const chk = (label, cond, note = '') => {
  total++; if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fresh = () => ({ DB: makeD1() });
const rowCount = async (env) => {
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM conns').all();
    return Number((r.results && r.results[0] && r.results[0].n) || 0);
  } catch (e) { return 0; }
};
const rowTs = async (env, id) => {
  try {
    const r = await env.DB.prepare('SELECT last_ts AS t FROM conns WHERE conn_id = ?').bind(id).first();
    return r ? Number(r.t) : null;
  } catch (e) { return null; }
};
/** سنِ ردیف را به اندازه‌ی age میلی‌ثانیه عقب می‌برد (شبیه‌سازیِ گذرِ زمان) */
const ageRow = (env, id, ageMs) =>
  env.DB.prepare('UPDATE conns SET last_ts = ? WHERE conn_id = ?').bind(Date.now() - ageMs, id).run();

/* ─────────────────────────────────────────────────────────────────────────────
   ۱) پنجره ثابت است و دیگر هیچ تنظیمی ندارد
   ───────────────────────────────────────────────────────────────────────────── */
{
  const SRC = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  const UI = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
  chk('staleness window is hardcoded to 3000ms', W.CONN_TTL === 3000, W.CONN_TTL + 'ms');
  chk('hard ceiling is at most 3 seconds', W.CONN_TTL <= 3000, W.CONN_TTL + 'ms');
  chk('activity refresh is throttled to 1000ms', W.CONN_ACTIVITY_MS === 1000, W.CONN_ACTIVITY_MS + 'ms');
  chk('sec.connTtlSec is gone from the worker', !SRC.includes('connTtlSec'));
  chk('sec.connTtlSec is gone from the panel', !UI.includes('connTtlSec'));
  chk('worker default settings no longer carry it', !/sec:\s*\{[^}]*connTtlSec/.test(SRC));
  chk('no configurable TTL knob left', !/CONN_TTL_SEC|CONN_TTL_MIN|CONN_TTL_MAX|connTtlMs|connHbMs|connApplySettings/.test(SRC));
  chk('the periodic heartbeat timer is gone', !/hbTimer|setInterval\([^)]*touch/.test(SRC));
  /* تمدیدِ مبتنی بر فعالیت: فقط از مسیرِ شمارشِ بایت صدا زده می‌شود و خودش
     به یک بار در ثانیه محدود است (نه یک تایمر). */
  chk('refresh is driven by byte accounting', /const maybeFlush = \(force\) => \{[\s\S]{0,200}?noteActivity\(\);/.test(SRC));
  chk('refresh is throttled by CONN_ACTIVITY_MS', /now - lastActivity < CONN_ACTIVITY_MS/.test(SRC));
  /* ضدِ زنده‌شدن: تمدید فقط روی ردیفِ موجود، و بازپس‌گیری مشروط به زنده بودن */
  chk('refresh re-asserts only while the connection is open',
    /if\s*\(!stillAlive\(\)\)\s*return\s*\{\s*ok:\s*false,\s*reason:\s*'released'/.test(SRC));
  chk('sessionTouch never inserts (UPDATE only)',
    /UPDATE conns SET last_ts = \?\s*\n?\s*WHERE conn_id = \? AND typeof\(last_ts\) = 'integer'/.test(SRC));
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۲) تمدیدِ مبتنی بر فعالیت — یک اتصالِ پُرترافیک از پنجره‌ی ۳ ثانیه عبور می‌کند
      (زمانِ واقعی، بدون جعل)
   ───────────────────────────────────────────────────────────────────────────── */
{
  const env = fresh(), U = 'act-u1', A = '198.51.100.1', B = '198.51.100.2';
  const a = await W.connAcquire(env, U, A, 1, 'a1');
  chk('busy: first IP admitted', a.ok === true, a.reason);
  const t0 = Date.now();
  /* هر ۵۰۰ میلی‌ثانیه بایت جریان دارد → ردیف تمدید می‌شود */
  while (Date.now() - t0 < W.CONN_TTL + 400) {
    await W.connRefresh(env, U, A, 'a1', 1, () => true);
    await sleep(500);
  }
  const elapsed = Date.now() - t0;
  chk('busy: connection outlived the 3s window', elapsed > W.CONN_TTL, elapsed + 'ms');
  chk('busy: row was refreshed (never dropped)', (await rowCount(env)) === 1, 'rows=' + (await rowCount(env)));
  chk('busy: last_ts stayed fresh', (await rowTs(env, 'a1')) > Date.now() - 2000,
    'age=' + (Date.now() - (await rowTs(env, 'a1'))) + 'ms');
  const b = await W.connAcquire(env, U, B, 1, 'b1');
  chk('busy: IP B still denied while A transfers', b.ok === false, b.reason);
  chk('busy: A kept its row', (await rowCount(env)) === 1, 'rows=' + (await rowCount(env)));
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۳) یک اتصالِ بی‌فعالیت بعد از ۳ ثانیه پاک‌سازی می‌شود (و نه زودتر)
   ───────────────────────────────────────────────────────────────────────────── */
{
  const env = fresh(), U = 'idle-u1', A = '198.51.100.3', B = '198.51.100.4';
  await W.connAcquire(env, U, A, 1, 'a1');
  /* داخلِ پنجره (۲٫۵ ثانیه بی‌فعالیتی) → هنوز زنده است */
  await ageRow(env, 'a1', W.CONN_TTL - 500);
  const b1 = await W.connAcquire(env, U, B, 1, 'b1');
  chk('idle: still counted inside the 3s window', b1.ok === false, b1.reason);
  chk('idle: row survived inside the window', (await rowCount(env)) === 1, 'rows=' + (await rowCount(env)));
  /* بیرونِ پنجره (۳٫۲ ثانیه بی‌فعالیتی) → آزاد می‌شود */
  await ageRow(env, 'a1', W.CONN_TTL + 200);
  const b2 = await W.connAcquire(env, U, B, 1, 'b2');
  chk('idle: row swept after the 3s window', b2.ok === true, b2.reason);
  chk('idle: only the new IP remains', (await rowCount(env)) === 1, 'rows=' + (await rowCount(env)));
  chk('idle: the remaining row is IP B',
    JSON.stringify([...(await W.liveIps(env, U)).keys()]) === JSON.stringify([B]),
    JSON.stringify([...(await W.liveIps(env, U)).keys()]));
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۴) آزادسازی آنی است — بدون هیچ انتظاری
   ───────────────────────────────────────────────────────────────────────────── */
{
  const env = fresh(), U = 'rel-u1', A = '198.51.100.5', B = '198.51.100.6';
  await W.connAcquire(env, U, A, 1, 'a1');
  chk('release: row present before release', (await rowCount(env)) === 1);
  await W.connRelease(env, U, A, 'a1');
  chk('release: row count is 0 immediately (no wait)', (await rowCount(env)) === 0,
    'rows=' + (await rowCount(env)));
  await W.connRelease(env, U, A, 'a1');
  chk('release: releasing twice is idempotent', (await rowCount(env)) === 0);
  const b = await W.connAcquire(env, U, B, 1, 'b1');
  chk('release: the slot is free right away', b.ok === true, b.reason);
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۵) ردیفِ آزادشده هرگز دوباره زنده نمی‌شود
   ───────────────────────────────────────────────────────────────────────────── */
{
  const env = fresh(), U = 'rev-u1', A = '198.51.100.7', B = '198.51.100.8';
  await W.connAcquire(env, U, A, 1, 'a1');
  await W.connRelease(env, U, A, 'a1');
  chk('resurrect: released → 0 rows', (await rowCount(env)) === 0);
  /* یک تمدید که در صف مانده و بعد از بسته شدنِ اتصال اجرا می‌شود */
  const dead = await W.connRefresh(env, U, A, 'a1', 1, () => false);
  chk('resurrect: queued refresh on a closed connection is refused',
    dead && dead.ok === false && dead.reason === 'released', JSON.stringify(dead));
  chk('resurrect: still 0 rows', (await rowCount(env)) === 0, 'rows=' + (await rowCount(env)));
  /* تمدیدِ خالص (بدون بازپس‌گیری) هم هرگز ردیفی درج نمی‌کند */
  await W.sessionTouch(env, U, A, 'a1');
  await W.sessionTouch(env, U, A, 'a1');
  chk('resurrect: queued sessionTouch does not insert', (await rowCount(env)) === 0,
    'rows=' + (await rowCount(env)));
  const b = await W.connAcquire(env, U, B, 1, 'b1');
  chk('resurrect: new IP admitted after release', b.ok === true, b.reason);

  /* وارونه: برای یک اتصالِ واقعاً باز، ردیفِ پاک‌شده دوباره پذیرفته می‌شود */
  const env2 = fresh(), U2 = 'rev-u2';
  await W.connAcquire(env2, U2, A, 1, 'a1');
  await ageRow(env2, 'a1', W.CONN_TTL + 500);
  await W.liveSweep(env2, U2);
  chk('re-assert: idle row is gone', (await rowCount(env2)) === 0);
  const back = await W.connRefresh(env2, U2, A, 'a1', 1, () => true);
  chk('re-assert: live connection gets its row back', back && back.ok === true, JSON.stringify(back));
  chk('re-assert: row is back', (await rowCount(env2)) === 1);
  /* اما اگر سقف پر باشد، بازپس‌گیری رد می‌شود و اتصال باید بسته شود */
  const env3 = fresh(), U3 = 'rev-u3';
  await W.connAcquire(env3, U3, A, 1, 'a1');
  await env3.DB.prepare('DELETE FROM conns WHERE conn_id = ?').bind('a1').run();
  await W.connAcquire(env3, U3, B, 1, 'b1');                 /* آی‌پیِ B سهمیه را گرفت */
  const denied = await W.connRefresh(env3, U3, A, 'a1', 1, () => true);
  chk('re-assert: denied when the cap is full', denied && denied.ok === false, JSON.stringify(denied));
  const loser = await env3.DB.prepare('SELECT COUNT(*) AS n FROM conns WHERE conn_id = ?').bind('a1').first();
  chk('re-assert: denial leaves no row for the loser', Number(loser && loser.n) === 0, JSON.stringify(loser));
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۶) پاک‌سازی: NULL و TEXT همیشه کهنه حساب می‌شوند
      (در SQLite هر رشته از هر عدد بزرگ‌تر است، پس مقایسه‌ی ساده آن‌ها را
       هرگز پاک نمی‌کند — همان «آی‌پی برای همیشه قفل شده»)
   ───────────────────────────────────────────────────────────────────────────── */
{
  const env = fresh();
  /* پایگاه‌داده‌ی قدیمی: ستونِ last_ts بدون NOT NULL بود، پس مقادیرِ تهی و
     رشته‌ای هم می‌توانست در آن بنشیند — همان حالتی که ورکر باید تحمل کند. */
  await env.DB.prepare('DROP TABLE IF EXISTS conns').run();
  await env.DB.prepare('CREATE TABLE conns (conn_id TEXT PRIMARY KEY, uuid TEXT NOT NULL, ip TEXT NOT NULL, last_ts INTEGER)').run();
  await W.liveEnsure(env);
  const ins = (id, ts) =>
    env.DB.prepare('INSERT OR REPLACE INTO conns (conn_id, uuid, ip, last_ts) VALUES (?,?,?,?)')
      .bind(id, 'sweep-u', '198.51.100.20', ts).run();
  await ins('null-row', null);
  await ins('text-row', 'not-a-timestamp');
  await ins('iso-row', new Date().toISOString());
  await ins('fresh-row', Date.now());
  chk('sweep: four rows seeded', (await rowCount(env)) === 4, 'rows=' + (await rowCount(env)));
  await W.liveSweep(env, 'sweep-u');
  const left = await env.DB.prepare('SELECT conn_id FROM conns').all();
  chk('sweep: NULL / TEXT / ISO rows are treated as expired',
    JSON.stringify((left.results || []).map((r) => r.conn_id)) === JSON.stringify(['fresh-row']),
    JSON.stringify((left.results || []).map((r) => r.conn_id)));
  /* پاک‌سازیِ هنگامِ پذیرش هم همین رفتار را دارد */
  await ins('text-row2', 'not-a-timestamp');
  /* سقفِ ۲ چون fresh-row هنوز همان اسلات را دارد */
  const r = await W.d1Acquire(env, 'sweep-u', '198.51.100.21', 2, 'new-1', Date.now());
  chk('sweep: admission path drops the TEXT row too', r.ok === true, JSON.stringify(r));
  chk('sweep: no stale row survives admission',
    (await env.DB.prepare('SELECT COUNT(*) AS n FROM conns WHERE typeof(last_ts) <> \'integer\'').first()).n === 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۷) سقفِ ۱: آی‌پیِ B تا وقتی A مشغول است رد می‌شود و حداکثر ۳ ثانیه بعد از
      توقف/قطعِ A پذیرفته می‌شود (زمانِ واقعی)
   ───────────────────────────────────────────────────────────────────────────── */
{
  /* ۷الف) A توقف می‌کند و قطع می‌شود → آزادسازیِ آنی */
  const env = fresh(), U = 'cap-u1', A = '198.51.100.30', B = '198.51.100.31';
  await W.connAcquire(env, U, A, 1, 'a1');
  const bBusy = await W.connAcquire(env, U, B, 1, 'b1');
  chk('cap=1: B rejected while A is connected', bBusy.ok === false, bBusy.reason);
  await W.connRelease(env, U, A, 'a1');
  const bAfter = await W.connAcquire(env, U, B, 1, 'b2');
  chk('cap=1: B admitted the instant A disconnects', bAfter.ok === true, bAfter.reason);

  /* ۷ب) قطعیِ ناگهانی (هیچ آزادسازی‌ای ثبت نشد) → حداکثر ۳ ثانیه */
  const env2 = fresh(), U2 = 'cap-u2';
  await W.connAcquire(env2, U2, A, 1, 'a1');
  const bBusy2 = await W.connAcquire(env2, U2, B, 1, 'b1');
  chk('cap=1 (sudden): B rejected while A holds the slot', bBusy2.ok === false, bBusy2.reason);
  /* ردیف را به ۲٫۸ ثانیه قبل می‌بریم و فقط ۴۰۰ میلی‌ثانیه صبرِ واقعی می‌کنیم */
  await ageRow(env2, 'a1', W.CONN_TTL - 200);
  const t0 = Date.now();
  await sleep(400);
  const bLate = await W.connAcquire(env2, U2, B, 1, 'b2');
  chk('cap=1 (sudden): B admitted once the row passes 3s', bLate.ok === true, bLate.reason);
  chk('cap=1 (sudden): waited no more than ~3s', Date.now() - t0 < 2000,
    (Date.now() - t0) + 'ms of real waiting');
  chk('cap=1 (sudden): old row is gone', (await rowCount(env2)) === 1, 'rows=' + (await rowCount(env2)));
}

/* ─────────────────────────────────────────────────────────────────────────────
   ۸) پاک‌سازیِ دستی و سنِ ردیف‌ها در کارتِ سلامت همچنان کار می‌کنند
   ───────────────────────────────────────────────────────────────────────────── */
{
  const env = fresh(), U = 'misc-u1', A = '198.51.100.40', B = '198.51.100.41';
  await W.connAcquire(env, U, A, 2, 'a');
  await W.connAcquire(env, U, B, 2, 'b');
  chk('misc: two IPs registered', (await rowCount(env)) === 2);
  const removed = await W.connReset(env, U);
  chk('misc: manual reset clears everything', removed.d1 === 2 && (await rowCount(env)) === 0,
    JSON.stringify(removed));

  await W.connAcquire(env, U, A, 1, 'live-1');
  await ageRow(env, 'live-1', W.CONN_TTL + 1000);
  const rows = await W.liveRowsOf(env);
  chk('misc: liveRowsOf drops the stale row', rows.length === 0, JSON.stringify(rows));
  await W.connAcquire(env, U, A, 1, 'live-2');
  const rows2 = await W.liveRowsOf(env);
  chk('misc: liveRowsOf reports a fresh row as not idle',
    rows2.length === 1 && rows2[0].idle === false && rows2[0].ageSec === 0, JSON.stringify(rows2));
}

console.log(`\n${total - fails}/${total} checks passed`);
process.exit(fails ? 1 : 0);
