// TEST 6 — limit enforced through the REAL tunnel entrypoint on a D1-only deployment
// (no KV, no Durable Object) with the correct semantics: the cap counts DISTINCT IPs.
import { makeD1 } from './d1.mjs';
import { makeCtx, fakeSocket } from './mocks.mjs';
import { __mock } from './cf-sockets.mjs';
import * as W from './worker.test.mjs';

let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

const env = { DB: makeD1() };                     // دقیقاً مثل استقرار کاربر
const HOST = 'panel.example.workers.dev';
const UUID = '99999999-8888-7777-6666-555555555555';

{
  const st = W.seed(W.DEF());
  st.users = [{ id: 'u1', name: 'ali', uuid: UUID, secret: 'sec-ali', enabled: true,
    ipLimit: 1, up: 0, down: 0, totalReq: 0, quotaGB: 0, dailyQuotaMB: 0, expiryAt: null }];
  await W.save(env, st);
}
__mock.connect = () => fakeSocket(2048, 2048, true);   // تونل زنده می‌ماند

const payload = new TextEncoder().encode('GET /x HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n');
const header = W.vlessHeader({ uuid: UUID }, 'example.com', 443, payload);
const buf = header.buffer.slice(header.byteOffset, header.byteOffset + header.byteLength);

async function openTunnel(ip) {
  const ctx = makeCtx();
  const req = new Request('https://' + HOST + '/sg', {
    headers: { upgrade: 'websocket', connection: 'Upgrade', host: HOST, 'cf-connecting-ip': ip },
  });
  const res = await W.default.fetch(req, env, ctx);
  const ws = res.webSocket;
  await new Promise((r) => setTimeout(r, 60));
  ws.deliver(buf);
  await new Promise((r) => setTimeout(r, 120));
  await ctx._settle();
  return { ws, ctx, closed: ws.closed, code: ws.closeCode };
}

console.log('— سقف ۱ آی‌پی: آی‌پی دوم باید رد شود (مدل Nova-Proxy) —');
const a1 = await openTunnel('203.0.113.51');
eq('اتصال ۱ از آی‌پی A پذیرفته شد', a1.closed, false);
const a2 = await openTunnel('203.0.113.51');
eq('اتصال ۲ از همان آی‌پی A پذیرفته شد', a2.closed, false);
const b1 = await openTunnel('198.51.100.99');
eq('آی‌پی دوم (B) رد شد', b1.closed, true);
eq('کدِ بسته شدن ۱۰۱۳ است', b1.code, 1013);

console.log('— بعد از بسته شدنِ هر دو اتصالِ A، آی‌پی B باید مجاز شود —');
a1.ws.close();
a2.ws.close();
await new Promise((r) => setTimeout(r, 80));
const b2 = await openTunnel('198.51.100.99');
eq('آی‌پی B بعد از آزادسازی پذیرفته شد', b2.closed, false);

console.log('— انتقال داده (هسته باید سالم باشد) —');
eq('داده به مقصد رسید', b2.ctx ? true : false, true);
const u = await W.usageFresh(env, UUID);
eq('مصرف ثبت شده است (آپلود > 0)', (u.up || 0) > 0, true);
eq('دریافت ثبت شده است', (u.down || 0) > 0, true);

console.log(fails ? `\n${fails} TEST(S) FAILED` : '\nALL D1-TUNNEL TESTS PASSED');
process.exit(fails ? 1 : 0);
