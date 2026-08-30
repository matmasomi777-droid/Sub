// TEST 7 — the browser-driven traffic test at API level: traffic-begin → download → traffic-end
import { makeD1 } from './d1.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};
const close = (label, got, want, tol) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${got} want≈${want} (±${tol})`);
};

const env = { DB: makeD1() };
const HOST = 'panel.example.workers.dev';
const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const st = W.seed(W.DEF());
st.users = [{ id: 'u1', name: 'ali', uuid: UUID, secret: 'sec-ali', enabled: true, up: 0, down: 0, totalReq: 0 }];
await W.save(env, st);

async function call(body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await W.default.fetch(new Request('https://' + HOST + '/api/action', {
    method: 'POST', headers, body: JSON.stringify(body)
  }), env, { waitUntil() {} });
  return res.json();
}

const loginRes = await W.default.fetch(new Request('https://' + HOST + '/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' })
}), env, { waitUntil() {} });
const login = await loginRes.json();
eq('login', !!login.token, true);

const begin = await call({ act: 'traffic-begin', uuid: UUID, sizeMB: 1 }, login.token);
eq('traffic-begin: no error', begin.error || null, null);
eq('traffic-begin: ۱ مگابایت', begin.want || begin.bytes || begin.size, 1048576);
eq('traffic-begin: نشانی دارد', !!begin.url, true);

/* مرورگر فایل را دانلود می‌کند */
const res = await W.default.fetch(new Request('https://' + HOST + begin.url, { headers: { authorization: 'Bearer ' + login.token } }), env, { waitUntil() {} });
const buf = await res.arrayBuffer();
close('اندازه‌ی فایل دریافت‌شده', buf.byteLength, 1048576, 0);

const end = await call({ act: 'traffic-end', sid: begin.sid, received: buf.byteLength }, login.token);
console.log('   traffic-end:', JSON.stringify(end));
eq('verdict ok', end.ok, true);
close('اختلافِ ثبت‌شده با اندازه‌ی فایل', Math.abs(end.diff || 0), 0, 8192);
eq('مصرفِ کاربر ثبت شده', (end.measured || 0) > 0, true);

console.log(fails ? `\n${fails} TEST(S) FAILED` : '\nALL TRAFFIC-TEST API TESTS PASSED');
process.exit(fails ? 1 : 0);
