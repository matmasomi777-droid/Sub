// TEST 8 — usage-health endpoint on a D1-only deployment: backend, live table, diagnostics
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const chk = (label, cond, note = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};

const env = { DB: makeD1() };
const HOST = 'panel.example.workers.dev';
const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const st = W.seed(W.DEF());
st.users = [{ id: 'u1', name: 'ali', uuid: UUID, secret: 'sec-ali', enabled: true, up: 0, down: 0, totalReq: 0, ipLimit: 1 }];
st.settings.sec.ipConnLimit = 2;
await W.save(env, st);

const loginRes = await W.default.fetch(new Request('https://' + HOST + '/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' })
}), env, { waitUntil() {} });
const login = await loginRes.json();

const res = await W.default.fetch(new Request('https://' + HOST + '/api/action', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
  body: JSON.stringify({ act: 'usage-health' })
}), env, { waitUntil() {} });
const h = await res.json();

chk('پاسخ دریافت شد', !!h, '');
chk('مرجعِ محدودیت D1 است', h.limiter === 'd1', h.limiter + ' / ' + (h.limiterLabel || ''));
chk('پایگاه‌داده D1 بایند است', h.diag && h.diag.bound && h.diag.bound.DB === true);
chk('KV و DO بایند نیستند', h.diag && h.diag.bound.KV === false && h.diag.bound.LIMITER === false);
chk('آی‌پیِ درخواست‌کننده گزارش شده', !!(h.diag && h.diag.callerIp), h.diag && h.diag.callerIp);
chk('سقف مؤثرِ کاربر گزارش شده', h.diag && h.diag.perUser && h.diag.perUser[0] && h.diag.perUser[0].limit === 1,
  JSON.stringify(h.diag && h.diag.perUser));

const byName = (n) => (h.checks || []).find((c) => c.name === n);
const lim1 = byName('تست زنده‌ی محدودیت (سقف ۱ IP)');
const lim2 = byName('تست زنده‌ی محدودیت (سقف ۲ IP)');
const ref = byName('مرجعِ شمارشِ محدودیت اتصال');
const live = byName('جدول اتصال‌های زنده (conns)');
chk('تست زنده‌ی سقف ۱ آی‌پی موفق', lim1 && lim1.ok === true, lim1 && lim1.note);
chk('تست زنده‌ی سقف ۲ آی‌پی موفق', lim2 && lim2.ok === true, lim2 && lim2.note);
chk('بررسیِ مرجعِ محدودیت موفق', ref && ref.ok === true, ref && ref.note);
chk('جدول اتصال‌های زنده گزارش شد', live && live.ok === true, live && live.note);
chk('تستِ افزایش مصرف موفق', (byName('تست زنده‌ی افزایش مصرف') || {}).ok === true, (byName('تست زنده‌ی افزایش مصرف') || {}).note);

console.log(fails ? `\n${fails} TEST(S) FAILED` : '\nALL HEALTH/DIAGNOSTIC TESTS PASSED');
process.exit(fails ? 1 : 0);
