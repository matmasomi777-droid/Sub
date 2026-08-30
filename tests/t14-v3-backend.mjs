// TEST 14 — v3 backend: live connection details, kick, IP bans, password change,
//           backup/restore. Follows the same pattern as the other suites.
import { makeD1 } from './d1.mjs';
import { makeCtx } from './mocks.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};
const ok = (label, cond, note = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};

const env = { DB: makeD1() };
const HOST = 'panel.example.workers.dev';
const UUID = '11111111-2222-3333-4444-555555555555';
const ctx = makeCtx();

const call = async (method, path, body, token, ip) => {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  /* ورود ۵ تلاش در ۱۰ دقیقه مجاز دارد؛ هر ورود از یک آی‌پیِ جدا می‌آید تا
     محدودکننده بقیه‌ی تست‌ها را نبندد */
  if (ip) h['cf-connecting-ip'] = ip;
  const res = await W.default.fetch(
    new Request('https://' + HOST + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }),
    env, makeCtx());
  let j = null;
  try { j = await res.json(); } catch (e) { j = {}; }
  return { status: res.status, body: j, headers: res.headers };
};

let loginIp = 0;
const login = async (password) => call('POST', '/api/login', { password }, null, '198.18.0.' + (++loginIp));

const first = await login('simorgh');
if (!first.body || !first.body.token) { console.log('FAIL login:', JSON.stringify(first)); process.exit(1); }
const TOK = first.body.token;
console.log('PASS  login');

await W.usageInit(env, W.seed(W.DEF()));
const made = await call('POST', '/api/users', { name: 'ali', uuid: UUID, secret: 'sec-ali' }, TOK);
eq('user created', made.body.ok, true);

/* ══════════════════════════════════════════════════════════════
   ۱) GET /api/connections — جزئیات و خلاصه
   ══════════════════════════════════════════════════════════════ */
const A = '203.0.113.10', B = '198.51.100.20';
await W.connAcquire(env, UUID, A, 0, 'c-a1', { cc: 'ir', ua: 'v2rayN/1.0', transport: 'ws' });
await W.connAcquire(env, UUID, A, 0, 'c-a2', { cc: 'ir', ua: 'v2rayN/1.0', transport: 'ws' });
await W.connAcquire(env, UUID, B, 0, 'c-b1', { cc: 'de', ua: 'Shadowrocket/2.0', transport: 'ws' });
await W.metaBytes(env, 'c-a1', 4096, 65536);

let list = await call('GET', '/api/connections', null, TOK);
eq('connections: ok', list.body.ok, true);
eq('connections: source is the active backend', list.body.source, 'd1');
eq('connections: summary users (distinct)', list.body.summary.users, 1);
eq('connections: summary ips (distinct)', list.body.summary.ips, 2);
eq('connections: summary connections', list.body.summary.connections, 3);

const s1 = (list.body.sessions || []).find((x) => x.connId === 'c-a1');
ok('connections: session found', !!s1);
eq('connections: user name (config label)', s1 && s1.user, 'ali');
eq('connections: uuid', s1 && s1.uuid, UUID);
eq('connections: ip', s1 && s1.ip, A);
eq('connections: cc', s1 && s1.cc, 'IR');
ok('connections: startedAt is a timestamp', typeof (s1 && s1.startedAt) === 'number' && s1.startedAt > 0, String(s1 && s1.startedAt));
ok('connections: durationSec is a number', typeof (s1 && s1.durationSec) === 'number', String(s1 && s1.durationSec));
eq('connections: up bytes', s1 && s1.up, 4096);
eq('connections: down bytes', s1 && s1.down, 65536);
eq('connections: transport', s1 && s1.transport, 'ws');
ok('connections: lastActivityAt present', typeof (s1 && s1.lastActivityAt) === 'number' && s1.lastActivityAt > 0);
ok('connections: idleSec present', typeof (s1 && s1.idleSec) === 'number');
eq('connections: ua kept', s1 && s1.ua, 'v2rayN/1.0');

/* حجمِ یک نشستِ دیگر نباید روی این یکی بیفتد */
const s2 = (list.body.sessions || []).find((x) => x.connId === 'c-a2');
eq('connections: other session up is 0', s2 && s2.up, 0);

/* خلاصه باید با مرجعِ تصمیم یکی باشد — نه یک نگاشتِ جداگانه */
const rows = await W.liveRowsDetailed(env);
eq('connections: count matches the limiter source', rows.length, 3);
eq('connections: rows carry volume too', rows.find((r) => r.connId === 'c-a1').down, 65536);

/* ══════════════════════════════════════════════════════════════
   ۲) POST /api/connections/kick — قطعِ موقت و آزادسازیِ سهمیه
   ══════════════════════════════════════════════════════════════ */
await W.connRelease(env, UUID, A, 'c-a1');
await W.connRelease(env, UUID, A, 'c-a2');
await W.connRelease(env, UUID, B, 'c-b1');

eq('setup: 2 IPs live at cap 1', (await W.connAcquire(env, UUID, A, 1, 'k-a')).ok, true);
eq('setup: 2nd IP denied at cap 1', (await W.connAcquire(env, UUID, B, 1, 'k-b')).ok, false);

const kick = await call('POST', '/api/connections/kick', { uuid: UUID, ip: A }, TOK);
eq('kick: ok', kick.body.ok, true);
eq('kick: one connection closed', kick.body.kicked, 1);
ok('kick: persian message', /اتصال قطع شد/.test(String(kick.body.msg || '')), String(kick.body.msg));
/* آزاد شدنِ واقعی — کاربر باید بتواند از آی‌پیِ دیگر وصل شود */
eq('kick: quota really freed', (await W.connAcquire(env, UUID, B, 1, 'k-b2')).ok, true);
await W.connRelease(env, UUID, B, 'k-b2');

/* ══════════════════════════════════════════════════════════════
   ۳) مسدودسازی — دائم، زمان‌دار، رفع مسدودی، فهرست
   ══════════════════════════════════════════════════════════════ */
const BAN_IP = '198.51.100.77';
const ban = await call('POST', '/api/connections/ban', { ip: BAN_IP, reason: 'اشتراک‌گذاری' }, TOK);
eq('ban: ok', ban.body.ok, true);
eq('ban: permanent', ban.body.permanent, true);
eq('ban: expiresAt is null', ban.body.expiresAt, null);
ok('ban: stored in the active layer', (ban.body.wrote || []).includes('d1'), JSON.stringify(ban.body.wrote));

/* آی‌پیِ مسدود دیگر پذیرفته نمی‌شود */
const denied = await W.connAcquire(env, UUID, BAN_IP, 0, 'ban-1');
eq('ban: acquire denied', denied.ok, false);
eq('ban: deny reason', denied.reason, 'ip-banned');
eq('ban: flagged as banned', !!denied.banned, true);

/* تمدیدِ مبتنی بر فعالیت هم باید رد کند — بدون هیچ تایمری */
const U2 = '99999999-8888-7777-6666-555555555555';
await call('POST', '/api/users', { name: 'sara', uuid: U2, secret: 'sec-sara' }, TOK);
await W.connAcquire(env, U2, BAN_IP, 0, 'ban-2');
const refreshed = await W.connRefresh(env, U2, BAN_IP, 'ban-2', 0, () => true);
eq('ban: refresh denies an existing session', refreshed && refreshed.ok, false);
eq('ban: refresh reason', refreshed && refreshed.reason, 'ip-banned');
await W.connRelease(env, U2, BAN_IP, 'ban-2');

/* فهرستِ سیاه با زمانِ انقضا */
let bans = await call('GET', '/api/connections/bans', null, TOK);
eq('bans: ok', bans.body.ok, true);
eq('bans: source', bans.body.source, 'd1');
const b1 = (bans.body.bans || []).find((x) => x.ip === BAN_IP);
ok('bans: entry listed', !!b1, JSON.stringify(bans.body.bans));
eq('bans: permanent flag', b1 && b1.permanent, true);
eq('bans: not expired', b1 && b1.expired, false);
eq('bans: reason kept', b1 && b1.reason, 'اشتراک‌گذاری');

/* مسدودسازیِ زمان‌دار — ۱ ساعت */
const TMP_IP = '198.51.100.88';
const ban1h = await call('POST', '/api/connections/ban', { ip: TMP_IP, hours: 1 }, TOK);
eq('ban 1h: ok', ban1h.body.ok, true);
eq('ban 1h: not permanent', ban1h.body.permanent, false);
ok('ban 1h: expires about an hour out',
  Math.abs((ban1h.body.expiresAt - Date.now()) - 3600000) < 5000,
  String(ban1h.body.expiresAt - Date.now()));

bans = await call('GET', '/api/connections/bans', null, TOK);
const bt = (bans.body.bans || []).find((x) => x.ip === TMP_IP);
ok('bans: timed entry has remainingSec', bt && bt.remainingSec > 3500 && bt.remainingSec <= 3600, String(bt && bt.remainingSec));
eq('bans: timed entry not expired', bt && bt.expired, false);

/* ۲۴ ساعت هم پشتیبانی می‌شود */
const ban24 = await call('POST', '/api/connections/ban', { ip: '198.51.100.99', hours: 24 }, TOK);
eq('ban 24h: ok', ban24.body.ok, true);
ok('ban 24h: about a day out', Math.abs((ban24.body.expiresAt - Date.now()) - 86400000) < 5000);

/* ورودیِ نامعتبر */
const badBan = await call('POST', '/api/connections/ban', { ip: '', hours: 1 }, TOK);
eq('ban: empty ip rejected', badBan.status, 400);
const badBan2 = await call('POST', '/api/connections/ban', { ip: '1.2.3.4', hours: -3 }, TOK);
eq('ban: negative hours rejected', badBan2.status, 400);
const badBan3 = await call('POST', '/api/connections/ban', { ip: '1.2.3.4', hours: 'abc' }, TOK);
eq('ban: non-numeric hours rejected', badBan3.status, 400);

/* رفعِ مسدودی */
const unban = await call('POST', '/api/connections/unban', { ip: BAN_IP }, TOK);
eq('unban: ok', unban.body.ok, true);
eq('unban: removed', unban.body.removed, true);
eq('unban: ip can connect again', (await W.connAcquire(env, UUID, BAN_IP, 0, 'ban-3')).ok, true);
await W.connRelease(env, UUID, BAN_IP, 'ban-3');

await call('POST', '/api/connections/unban', { ip: TMP_IP }, TOK);
await call('POST', '/api/connections/unban', { ip: '198.51.100.99' }, TOK);
bans = await call('GET', '/api/connections/bans', null, TOK);
eq('bans: list empty after unban', (bans.body.bans || []).length, 0);

/* ══════════════════════════════════════════════════════════════
   ۴) POST /api/password — تغییرِ رمز با تأییدِ رمزِ فعلی
   ══════════════════════════════════════════════════════════════ */
const wrong = await call('POST', '/api/password', { current: 'not-the-password', newPassword: 'whatever123' }, TOK);
eq('password: wrong current rejected', wrong.status, 403);
ok('password: persian error', /رمز عبور فعلی نادرست/.test(String(wrong.body.error || '')), String(wrong.body.error));
eq('password: unchanged after rejection', (await login('simorgh')).body.ok, true);

const shortPw = await call('POST', '/api/password', { current: 'simorgh', newPassword: 'abc' }, TOK);
eq('password: too short rejected', shortPw.status, 400);

const samePw = await call('POST', '/api/password', { current: 'simorgh', newPassword: 'simorgh' }, TOK);
eq('password: same-as-current rejected', samePw.status, 400);

const changed = await call('POST', '/api/password', { current: 'simorgh', newPassword: 'new-secret-99' }, TOK);
eq('password: changed', changed.body.ok, true);
eq('password: relogin hint', changed.body.relogin, true);
eq('password: old password no longer works', (await login('simorgh')).status, 401);
const reLogin = await login('new-secret-99');
eq('password: new password works', reLogin.body.ok, true);
eq('password: old token invalidated', (await call('GET', '/api/connections', null, TOK)).status, 401);

const TOK2 = reLogin.body.token;
/* برگرداندن به رمزِ اولیه برای بقیه‌ی تست‌ها */
await call('POST', '/api/password', { current: 'new-secret-99', newPassword: 'simorgh' }, TOK2);
eq('password: restored', (await login('simorgh')).body.ok, true);
const TOK3 = (await login('simorgh')).body.token;

/* وقتی MASTER_KEY بایند باشد، تغییر از پنل بی‌معناست — باید گفته شود */
{
  const envKey = { DB: makeD1(), MASTER_KEY: 'from-env' };
  let keyIp = 0;
  const callKey = async (path, body, token) => {
    const h = { 'content-type': 'application/json', 'cf-connecting-ip': '198.19.0.' + (++keyIp) };
    if (token) h.authorization = 'Bearer ' + token;
    const r = await W.default.fetch(new Request('https://' + HOST + path, {
      method: 'POST', headers: h, body: JSON.stringify(body),
    }), envKey, makeCtx());
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const lk = await callKey('/api/login', { password: 'from-env' });
  eq('password: MASTER_KEY login works', lk.body.ok, true);
  const rk = await callKey('/api/password', { current: 'from-env', newPassword: 'another-99' }, lk.body.token);
  eq('password: MASTER_KEY set => refused', rk.status, 409);
  ok('password: explains why', /MASTER_KEY/.test(String(rk.body.error || '')), String(rk.body.error));
  eq('password: MASTER_KEY unchanged', (await callKey('/api/login', { password: 'from-env' })).body.ok, true);
}

/* ══════════════════════════════════════════════════════════════
   ۵) پشتیبان‌گیری و بازیابی
   ══════════════════════════════════════════════════════════════ */
await call('PUT', '/api/settings', { settings: { panel: { name: 'پنل اصلی' } } }, TOK3);
const backup = await call('GET', '/api/backup', null, TOK3);
eq('backup: ok', backup.body.ok, true);
eq('backup: kind marker', backup.body.kind, 'sub-panel-backup');
ok('backup: has settings', !!(backup.body.data && backup.body.data.settings));
eq('backup: panel name carried', backup.body.data.settings.panel.name, 'پنل اصلی');
ok('backup: users array carried', Array.isArray(backup.body.data.users) && backup.body.data.users.length >= 1,
  String((backup.body.data.users || []).length));
ok('backup: no encoded blob (plain json object)', typeof backup.body.data === 'object');
ok('backup: offered as a download', /attachment/.test(String(backup.headers.get('content-disposition') || '')),
  String(backup.headers.get('content-disposition')));

const snapshot = JSON.parse(JSON.stringify(backup.body.data));

/* بازیابیِ معتبر — ادغام */
await call('PUT', '/api/settings', { settings: { panel: { name: 'پنل موقت' } } }, TOK3);
const merged = await call('POST', '/api/restore', { data: snapshot, mode: 'merge' }, TOK3);
eq('restore merge: ok', merged.body.ok, true);
eq('restore merge: mode', merged.body.mode, 'merge');
const afterMerge = await call('GET', '/api/backup', null, TOK3);
eq('restore merge: settings applied', afterMerge.body.data.settings.panel.name, 'پنل اصلی');

/* بازیابیِ معتبر — جایگزینی */
const replaced = await call('POST', '/api/restore', { data: snapshot, mode: 'replace' }, TOK3);
eq('restore replace: ok', replaced.body.ok, true);
const afterReplace = await call('GET', '/api/backup', null, TOK3);
eq('restore replace: users restored', afterReplace.body.data.users.length, snapshot.users.length);

/* بازیابیِ نامعتبر — هیچ چیزی نباید نوشته شود */
await call('PUT', '/api/settings', { settings: { panel: { name: 'پنل قبل از خطا' } } }, TOK3);

const bad1 = { settings: { panel: { name: 'خراب' } }, bogusSection: [] };
const r1 = await call('POST', '/api/restore', { data: bad1 }, TOK3);
eq('restore: unknown section rejected', r1.status, 400);
ok('restore: persian error', /نامعتبر/.test(String(r1.body.error || '')), String(r1.body.error));
ok('restore: lists the errors', Array.isArray(r1.body.errors) && r1.body.errors.length > 0);
eq('restore: nothing written (1)', (await call('GET', '/api/backup', null, TOK3)).body.data.settings.panel.name, 'پنل قبل از خطا');

const bad2 = { settings: { panel: { name: 'خراب' }, unknownSetting: 1 } };
eq('restore: unknown setting rejected', (await call('POST', '/api/restore', { data: bad2 }, TOK3)).status, 400);
eq('restore: nothing written (2)', (await call('GET', '/api/backup', null, TOK3)).body.data.settings.panel.name, 'پنل قبل از خطا');

const bad3 = { users: [] };
eq('restore: missing settings rejected', (await call('POST', '/api/restore', { data: bad3 }, TOK3)).status, 400);
eq('restore: nothing written (3)', (await call('GET', '/api/backup', null, TOK3)).body.data.settings.panel.name, 'پنل قبل از خطا');

const bad4 = { settings: { panel: { name: 'خراب' } }, users: 'not-an-array' };
eq('restore: non-array users rejected', (await call('POST', '/api/restore', { data: bad4 }, TOK3)).status, 400);
eq('restore: nothing written (4)', (await call('GET', '/api/backup', null, TOK3)).body.data.settings.panel.name, 'پنل قبل از خطا');

const bad5 = { settings: { panel: { name: 'خراب' } }, keys: [null, 7] };
eq('restore: malformed array items rejected', (await call('POST', '/api/restore', { data: bad5 }, TOK3)).status, 400);
eq('restore: nothing written (5)', (await call('GET', '/api/backup', null, TOK3)).body.data.settings.panel.name, 'پنل قبل از خطا');

eq('restore: array rejected', (await call('POST', '/api/restore', { data: [1, 2, 3] }, TOK3)).status, 400);
eq('restore: null rejected', (await call('POST', '/api/restore', { data: null }, TOK3)).status, 400);

/* فایلِ خام (بدونِ پوششِ data) هم پذیرفته می‌شود */
await call('PUT', '/api/settings', { settings: { panel: { name: 'پنل موقت ۲' } } }, TOK3);
const rawRestore = await call('POST', '/api/restore', snapshot, TOK3);
eq('restore: raw backup file accepted', rawRestore.body.ok, true);
eq('restore: raw backup applied', (await call('GET', '/api/backup', null, TOK3)).body.data.settings.panel.name, 'پنل اصلی');

/* ══════════════════════════════════════════════════════════════
   ۶) migration و منابعِ دیگر
   ══════════════════════════════════════════════════════════════ */
{
  const envOld = { DB: makeD1() };
  await envOld.DB.prepare('CREATE TABLE conn_meta (conn_id TEXT PRIMARY KEY, cc TEXT, since INTEGER, ua TEXT)').run();
  await W.metaMigrate(envOld);
  const cols = (await envOld.DB.prepare('PRAGMA table_info(conn_meta)').all()).results.map((x) => String(x.name));
  eq('migration: up column added', cols.includes('up'), true);
  eq('migration: down column added', cols.includes('down'), true);
  eq('migration: transport column added', cols.includes('transport'), true);
  /* idempotent — بار دوم نباید خطا بدهد */
  let threw = false;
  try { await W.metaMigrate(envOld); } catch (e) { threw = true; }
  eq('migration: idempotent', threw, false);
  /* روی جدولِ تازه‌ی migration هم حجم نوشته می‌شود */
  await W.metaBytes(envOld, 'old-1', 10, 20);
  const row = await envOld.DB.prepare('SELECT up, down FROM conn_meta WHERE conn_id = ?').bind('old-1').first();
  eq('migration: bytes written on migrated table', row && row.up, 10);
  eq('migration: down written on migrated table', row && row.down, 20);
}

eq('source name: d1 when DB bound', W.sourceName({ DB: makeD1() }), 'd1');
eq('source name: kv when only KV bound', W.sourceName({ KV: {} }), 'kv');
eq('source name: memory with no binding', W.sourceName({}), 'memory');

/* بک‌اندِ حافظه هم باید همان قرارداد را برگرداند (بدونِ هیچ بایندینگی) */
{
  const envMem = {};
  const stMem = W.seed(W.DEF());
  stMem.users = [{ id: 'u1', name: 'mem-user', uuid: 'mem-uuid', enabled: true, ipLimit: 0 }];
  await W.connAcquire(envMem, 'mem-uuid', '10.0.0.1', 0, 'm1', { cc: 'ir', transport: 'ws' });
  const view = await W.liveSessions(envMem, stMem);
  eq('memory backend: source', view.source, 'memory');
  eq('memory backend: summary users', view.summary.users, 1);
  eq('memory backend: summary connections', view.summary.connections, 1);
  eq('memory backend: user name', view.sessions[0].user, 'mem-user');
  eq('memory backend: ip', view.sessions[0].ip, '10.0.0.1');
  const kickMem = await W.connKick(envMem, 'mem-uuid', '10.0.0.1', '');
  eq('memory backend: kick works', kickMem.kicked, 1);
  const after = await W.liveSessions(envMem, stMem);
  eq('memory backend: freed after kick', after.summary.connections, 0);
}

/* ══════════════════════════════════════════════════════════════
   ۷) مسیرِ واقعیِ تونل — حجم و زمانِ شروع از همان جایی می‌آید که مصرف ثبت می‌شود
   ══════════════════════════════════════════════════════════════ */
{
  const { __mock } = await import('./cf-sockets.mjs');
  const { fakeSocket } = await import('./mocks.mjs');
  /* حجمی بیش از آستانه‌ی flush (۵۱۲KB) تا تونل واقعاً در میانه‌ی اتصال بنویسد */
  __mock.connect = () => fakeSocket(700 * 1024, 65536, true);
  const payload = new TextEncoder().encode('GET /x HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n');
  const header = W.vlessHeader({ uuid: UUID }, 'example.com', 443, payload);
  const buf = header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength);

  const TIP = '203.0.113.200';
  const tctx = makeCtx();
  const res = await W.default.fetch(new Request('https://' + HOST + '/sg', {
    headers: { upgrade: 'websocket', connection: 'Upgrade', host: HOST, 'cf-connecting-ip': TIP },
  }), env, tctx);
  const ws = res.webSocket;
  ok('tunnel: upgraded', !!ws);
  await new Promise((r) => setTimeout(r, 60));
  ws.deliver(buf);
  await new Promise((r) => setTimeout(r, 200));
  await tctx._settle();

  const view = await W.liveSessions(env, W.seed(await W.load(env)));
  const sess = (view.sessions || []).find((x) => x.ip === TIP);
  ok('tunnel: live session listed', !!sess, JSON.stringify((view.sessions || []).map((s) => s.ip)));
  ok('tunnel: startedAt recorded', !!(sess && typeof sess.startedAt === 'number' && sess.startedAt > 0), String(sess && sess.startedAt));
  ok('tunnel: upload volume recorded', !!(sess && sess.up > 0), 'up=' + (sess && sess.up));
  ok('tunnel: download volume recorded', !!(sess && sess.down > 0), 'down=' + (sess && sess.down));
  ok('tunnel: download is the bulk of it', !!(sess && sess.down > 500 * 1024), 'down=' + (sess && sess.down));
  eq('tunnel: transport recorded', sess && sess.transport, 'ws');
  ok('tunnel: durationSec computed', sess && typeof sess.durationSec === 'number' && sess.durationSec >= 0);
  ok('tunnel: lastActivityAt fresh', !!(sess && sess.idleSec !== null && sess.idleSec < 10), String(sess && sess.idleSec));

  /* بستنِ اتصال باید نشست را از فهرستِ زنده پاک کند (همراه با جزئیاتش) */
  ws.close();
  await new Promise((r) => setTimeout(r, 120));
  await tctx._settle();
  const after = await W.liveSessions(env, W.seed(await W.load(env)));
  eq('tunnel: session gone after close', (after.sessions || []).filter((x) => x.ip === TIP).length, 0);
}

/* نمای قدیمیِ act=live باید بعد از بازسازیِ liveView همچنان کار کند */
{
  const liveAct = await call('POST', '/api/action', { act: 'live' }, TOK3);
  eq('backward compat: act=live still ok', liveAct.body.ok, true);
  ok('backward compat: act=live users array', Array.isArray(liveAct.body.users));
  ok('backward compat: per-ip volume present',
    (liveAct.body.users || []).every((u) => (u.ips || []).every((x) => typeof x.up === 'number' && typeof x.down === 'number')));
  const connKickAct = await call('POST', '/api/action', { act: 'conn-kick', uuid: UUID }, TOK3);
  eq('backward compat: act=conn-kick still ok', connKickAct.body.ok, true);
}

/* بدونِ احراز هویت هیچ‌کدام از endpointهای جدید باز نیست */
for (const p of ['/api/connections', '/api/connections/bans', '/api/backup']) {
  eq('auth: GET ' + p + ' guarded', (await call('GET', p, null, null)).status, 401);
}
for (const p of ['/api/connections/kick', '/api/connections/ban', '/api/connections/unban', '/api/password', '/api/restore']) {
  eq('auth: POST ' + p + ' guarded', (await call('POST', p, {}, null)).status, 401);
}

await ctx._settle();
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL V3 BACKEND TESTS PASSED');
process.exit(fails ? 1 : 0);
