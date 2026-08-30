// TEST 9 — no live-connection row may survive: release / sweep / reject / reset paths
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const chk = (label, cond, note = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};

const rowCount = async (env) => {
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM conns').all();
    return Number((r.results && r.results[0] && r.results[0].n) || 0);
  } catch (e) { return 0; }        // جدول هنوز ساخته نشده = هیچ ردیفی نیست
};
const fresh = () => ({ DB: makeD1() });

/* ── 1) التیماته: heartbeat بعد از آزادسازی نباید ردیف را برگرداند ── */
{
  const env = fresh();
  const U = 'u1', A = '203.0.113.1';
  const acq = await W.connAcquire(env, U, A, 1, 'c1');
  chk('acquire ok', acq.ok === true);
  chk('row inserted', (await rowCount(env)) === 1, 'rows=' + (await rowCount(env)));
  await W.connRelease(env, U, A, 'c1');
  chk('row removed on release', (await rowCount(env)) === 0);
  /* ضربان‌هایِ در صف (بعد از قطع شدن اتصال اجرا می‌شوند) */
  await W.sessionTouch(env, U, A, 'c1');
  await W.sessionTouch(env, U, A, 'c1');
  chk('queued heartbeat does NOT resurrect the row', (await rowCount(env)) === 0,
    'rows=' + (await rowCount(env)));
  /* و یک آی‌پی‌ی دیگر باید بتواند وصل شود */
  const b = await W.connAcquire(env, U, '203.0.113.2', 1, 'c2');
  chk('second IP admitted after release', b.ok === true, b.reason);
}

/* ── 2) مسیرِ رد: هیچ ردیفی از اتصالِ ردشده نماند ── */
{
  const env = fresh();
  const U = 'u2';
  await W.connAcquire(env, U, '203.0.113.10', 1, 'a');
  const denied = await W.connAcquire(env, U, '203.0.113.11', 1, 'b');
  chk('second IP denied', denied.ok === false, denied.reason);
  const rows = await env.DB.prepare('SELECT conn_id FROM conns').all();
  chk('denied connection left NO row', rows.results.length === 1 && rows.results[0].conn_id === 'a',
    JSON.stringify(rows.results.map((r) => r.conn_id)));
}

/* ── 3) پاک‌سازی: ردیف‌هایی که last_ts معتبر ندارند هرگز نباید بمانند ── */
{
  const env = fresh();
  await W.liveEnsure(env);
  const now = Date.now();
  /* ردیفِ قدیمی با زمانِ رشته‌ای (همان چیزی که محدودیت را برای همیشه قفل می‌کرد) */
  await env.DB.prepare('INSERT OR REPLACE INTO conns (conn_id, uuid, ip, last_ts) VALUES (?,?,?,?)')
    .bind('old-text', 'u3', '203.0.113.20', new Date(now - 3600000).toISOString()).run();
  /* ردیفِ واقعاً مرده با زمانِ عددی */
  await env.DB.prepare('INSERT OR REPLACE INTO conns (conn_id, uuid, ip, last_ts) VALUES (?,?,?,?)')
    .bind('old-int', 'u3', '203.0.113.21', now - 3600000).run();
  /* ردیفِ زنده */
  await env.DB.prepare('INSERT OR REPLACE INTO conns (conn_id, uuid, ip, last_ts) VALUES (?,?,?,?)')
    .bind('live', 'u3', '203.0.113.22', now).run();
  await W.liveSweep(env, 'u3');
  const rows = await env.DB.prepare('SELECT conn_id FROM conns').all();
  const ids = rows.results.map((r) => r.conn_id).sort();
  chk('sweep removed TEXT-timestamp row + dead row, kept live row',
    JSON.stringify(ids) === JSON.stringify(['live']), JSON.stringify(ids));
}

/* ── 4) ضربان روی ردیفِ خراب نباید آن را زنده کند ── */
{
  const env = fresh();
  await W.liveEnsure(env);
  await env.DB.prepare('INSERT OR REPLACE INTO conns (conn_id, uuid, ip, last_ts) VALUES (?,?,?,?)')
    .bind('broken', 'u4', '203.0.113.30', 'not-a-timestamp').run();
  await W.sessionTouch(env, 'u4', '203.0.113.30', 'broken');
  await W.liveSweep(env, 'u4');
  chk('touch does not revive a broken row', (await rowCount(env)) === 0);
}

/* ── 5) آزادسازیِ دستی (conn-reset) — روی هر بک‌اند ── */
{
  /* 5a) D1 */
  const env = fresh();
  const HOST = 'p.example.workers.dev';
  const st = W.seed(W.DEF());
  st.users = [{ id: 'x', name: 'ali', uuid: 'UUID1', secret: 's', enabled: true, ipLimit: 1 }];
  await W.save(env, st);
  const login = await (await W.default.fetch(new Request('https://' + HOST + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' })
  }), env, { waitUntil() {} })).json();
  const call = async (body) => (await W.default.fetch(new Request('https://' + HOST + '/api/action', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
    body: JSON.stringify(body)
  }), env, { waitUntil() {} })).json();

  await W.connAcquire(env, 'UUID1', '203.0.113.40', 1, 'k1');
  chk('5a row exists before reset', (await rowCount(env)) === 1);
  const r1 = await call({ act: 'conn-reset' });
  chk('5a conn-reset ok', r1.ok === true, JSON.stringify(r1));
  chk('5a D1 table emptied', (await rowCount(env)) === 0, 'rows=' + (await rowCount(env)));
  const after = await W.connAcquire(env, 'UUID1', '203.0.113.41', 1, 'k2');
  chk('5a new IP admitted after reset', after.ok === true, after.reason);
}

/* 5b) Durable Object — wrangler deploys bind LIMITER, so reset MUST clear it */
{
  const env = fresh();
  const limiter = new W.ConnLimiter({});
  const rpc = async (path, body) => (await limiter.fetch(new Request('https://limiter' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {})
  }))).json();
  /* مثل کلاودفلر: stub.fetch(URL|Request, init) خودش درخواست را می‌سازد */
  env.LIMITER = { idFromName: () => 'id', get: () => ({ fetch: (u, i) => limiter.fetch(new Request(u, i)) }) };
  chk('5b backend is do', W.limiterBackend(env) === 'do');
  await rpc('/acquire', { uuid: 'U', ip: '203.0.113.50', connId: 'd1', limit: 1, now: Date.now() });
  const blocked = await rpc('/acquire', { uuid: 'U', ip: '203.0.113.51', connId: 'd2', limit: 1, now: Date.now() });
  chk('5b DO blocks the 2nd IP', blocked.ok === false);
  const HOST = 'p2.example.workers.dev';
  const st = W.seed(W.DEF());
  st.users = [{ id: 'x', name: 'ali', uuid: 'U', secret: 's', enabled: true, ipLimit: 1 }];
  await W.save(env, st);
  const login = await (await W.default.fetch(new Request('https://' + HOST + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' })
  }), env, { waitUntil() {} })).json();
  const rr = await (await W.default.fetch(new Request('https://' + HOST + '/api/action', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
    body: JSON.stringify({ act: 'conn-reset' })
  }), env, { waitUntil() {} })).json();
  chk('5b conn-reset ok', rr.ok === true, JSON.stringify(rr));
  const freed = await rpc('/acquire', { uuid: 'U', ip: '203.0.113.52', connId: 'd3', limit: 1, now: Date.now() });
  chk('5b DO cleared by conn-reset (2nd IP now admitted)', freed.ok === true, JSON.stringify(freed));
}

/* 5c) KV backend */
{
  const env = fresh();
  delete env.DB;
  const store = new Map();
  env.KV = {
    list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
    put: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); },
  };
  chk('5c backend is kv', W.limiterBackend(env) === 'kv');
  await W.connAcquire(env, 'U', '203.0.113.60', 1, 'q1');
  await W.connAcquire(env, 'U', '203.0.113.60', 1, 'q2');
  chk('5c kv has 2 keys', store.size === 2, 'keys=' + store.size);
  const blocked = await W.connAcquire(env, 'U', '203.0.113.61', 1, 'q3');
  chk('5c kv blocks the 2nd IP', blocked.ok === false);
  const HOST = 'p3.example.workers.dev';
  const st = W.seed(W.DEF());
  st.users = [{ id: 'x', name: 'ali', uuid: 'U', secret: 's', enabled: true, ipLimit: 1 }];
  await W.save(env, st);
  const login = await (await W.default.fetch(new Request('https://' + HOST + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' })
  }), env, { waitUntil() {} })).json();
  const rr = await (await W.default.fetch(new Request('https://' + HOST + '/api/action', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
    body: JSON.stringify({ act: 'conn-reset' })
  }), env, { waitUntil() {} })).json();
  chk('5c conn-reset ok', rr.ok === true, JSON.stringify(rr));
  chk('5c KV keys cleared by conn-reset', store.size === 0, 'keys=' + store.size);
  const freed = await W.connAcquire(env, 'U', '203.0.113.62', 1, 'q4');
  chk('5c new IP admitted after reset', freed.ok === true, freed.reason);
}

/* ── ۶) کارتِ سلامت باید از مرجعِ تصمیم بخواند، نه از جدولِ D1 ── */
{
  const env = fresh();
  const limiter = new W.ConnLimiter({});
  env.LIMITER = { idFromName: () => 'id', get: () => ({ fetch: (u, i) => limiter.fetch(new Request(u, i)) }) };
  const HOST = 'p4.example.workers.dev';
  const UUIDX = 'UUID-DO';
  const st = W.seed(W.DEF());
  st.users = [{ id: 'x', name: 'ali', uuid: UUIDX, secret: 's', enabled: true, ipLimit: 1 }];
  await W.save(env, st);
  const login = await (await W.default.fetch(new Request('https://' + HOST + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' })
  }), env, { waitUntil() {} })).json();
  /* قفل در شیءِ ماندگار است؛ جدولِ D1 خالی */
  await W.connAcquire(env, UUIDX, '203.0.113.100', 1, 'z1');
  chk('6) D1 table is empty (DO is the authority)', (await rowCount(env)) === 0, 'rows=' + (await rowCount(env)));
  const h = await (await W.default.fetch(new Request('https://' + HOST + '/api/action', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
    body: JSON.stringify({ act: 'usage-health' })
  }), env, { waitUntil() {} })).json();
  chk('6) health reports the DO as the live source', h.live && h.live.source === 'do', JSON.stringify(h.live));
  chk('6) health shows the locked row even though D1 is empty',
    (h.liveRows || []).length === 1 && (h.liveRows || [])[0].ip === '203.0.113.100',
    JSON.stringify(h.liveRows));
  chk('6) row age is a number', typeof (h.liveRows || [])[0].ageSec === 'number', JSON.stringify((h.liveRows || [])[0]));
  await W.connReset(env, '');
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL LEAK/RESET TESTS PASSED');
process.exit(fails ? 1 : 0);
