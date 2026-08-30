// TEST 13 — سامانه‌ی استتار (disguise / cover site): مسیریابیِ واقعیِ ورکر با env شبیه‌سازی‌شده
//
// هدف: ثابت کند کلیدهای disguise و panic واقعاً در مسیریابی اثر دارند، انتخابِ
// سایت پوششی عوض می‌شود، دارایی‌های سایت واقعی با content-type درست برمی‌گردند
// (روشِ نهان: بازتابِ مسیر)، و هیچ‌کدام از مسیرهای پنل/اشتراک/health/api/تونل
// در اثر این تغییرها خراب نشده‌اند.
//
// فقط D1 در env است — دقیقاً مثل استقرارِ واقعیِ کاربر (چسباندن در داشبورد،
// بدون Durable Object و بدون KV).
import { makeD1 } from './d1.mjs';
import { makeCtx } from './mocks.mjs';
import * as W from './worker.test.mjs';

let total = 0, fails = 0;
const chk = (label, cond, note = '') => {
  total++; if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${note ? ' — ' + note : ''}`);
};

const HOST = 'cover.example.workers.dev';
const UUID = 'bbbbaaaa-cccc-dddd-eeee-ffffffffffff';
const UI_MARKER = 'SIMORGH_PANEL_UI_MARKER';

/* سایت‌های پوششیِ شبیه‌سازی‌شده — کلیدها با DECOY_SITES در ورکر یکی‌اند */
const SITES = {
  nginx: { host: 'nginx.org', marker: 'NGINX_COVER_SITE' },
  ubuntu: { host: 'ubuntu.com', marker: 'UBUNTU_COVER_SITE' },
  docker: { host: 'docs.docker.com', marker: 'DOCKER_COVER_SITE' },
  cloudflare: { host: 'developers.cloudflare.com', marker: 'CLOUDFLARE_COVER_SITE' },
  python: { host: 'docs.python.org', marker: 'PYTHON_COVER_SITE' },
  node: { host: 'nodejs.org', marker: 'NODE_COVER_SITE' },
};
const CUSTOM_HOST = 'mycover.example';
const CUSTOM_MARKER = 'CUSTOM_COVER_SITE';
const DEAD_HOST = 'dead.invalid';                 // همیشه پرتاب می‌کند

const FILLER = 'This is a normal documentation page with enough visible text to be served as a cover site, '
  + 'because a real documentation site ships its content in the HTML itself and only uses stylesheets and '
  + 'images from its own origin. The cover system must mirror those requests back to this origin so that '
  + 'the page keeps its stylesheet and its images instead of receiving an HTML document for every asset.';
const pageHtml = (marker) => `<!doctype html><html><head><meta charset="utf-8"><title>${marker}</title>
<link rel="stylesheet" href="/assets/site.css">
</head><body><h1>${marker}</h1><p>${FILLER}</p><img src="/assets/logo.png"></body></html>`;
/* سایت تک‌صفحه‌ای: متن فقط بعد از اجرای اسکریپت ساخته می‌شود */
const SPA_HOST = 'spa.example';
const spaHtml = `<!doctype html><html><head><title>Loading…</title></head><body>
<div id="root"></div><script>document.getElementById('root').textContent='rendered';</script></body></html>`;

/* ───────────────── شبیه‌سازِ fetch ───────────────── */
let dead = false;                                  // برای سناریوی «سایت در دسترس نیست»
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const raw = typeof input === 'string' ? input : (input && input.url) || String(input);
  let u;
  try { u = new URL(raw); } catch (e) { return new Response('bad url', { status: 400 }); }
  const host = u.hostname, p = u.pathname;

  /* رابط کاربریِ پنل — از مخزن (loadUI) */
  if (host === 'raw.githubusercontent.com') {
    return new Response(`<html><!--APPJS--><!--STYLESHEET-->${UI_MARKER}</html>`,
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (host === SPA_HOST) {
    return new Response(spaHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  /* سایت پوششیِ دلخواه یا از کار افتاده */
  if (host === CUSTOM_HOST || host === DEAD_HOST) {
    if (dead) throw new Error('network unreachable');
    return new Response(pageHtml(CUSTOM_MARKER),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  /* سایت‌های فهرست — دارایی‌ها با content-type خودشان */
  for (const k in SITES) {
    if (SITES[k].host === host) {
      if (/\.css$/i.test(p)) return new Response('/* css ' + SITES[k].marker + ' */ body{color:#333}',
        { status: 200, headers: { 'content-type': 'text/css; charset=utf-8' } });
      if (/\.png$/i.test(p)) return new Response('PNG-BYTES',
        { status: 200, headers: { 'content-type': 'image/png' } });
      return new Response(pageHtml(SITES[k].marker),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
  }
  throw new Error('unmocked fetch: ' + raw);
};

const env = { DB: makeD1() };
const ctx = makeCtx();
const req = (path, opts = {}) => new Request('https://' + HOST + path, opts);
const get = async (path, opts = {}) => W.default.fetch(req(path, opts), env, ctx);
const setCfg = async (fn) => { const st = W.seed(await W.load(env)); fn(st.settings, st); await W.save(env, st); };
const bodyOf = async (r) => r.text();

/* یک کاربر واقعی برای مسیرِ اشتراک */
const login = await (await get('/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'simorgh' }),
})).json();
chk('login works (baseline)', !!login.token, login.error || '');
await (await get('/api/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + login.token },
  body: JSON.stringify({ name: 'ali', uuid: UUID, secret: 'sec-ali' }),
})).json();
await W.usageInit(env, W.seed(W.DEF()));
await setCfg((s) => { s.auth.path = 'panel'; s.sub.path = 'sub'; });

/* ═══════════════════════════════════════════════════════════════════════════
   ۱) disguise: true → ریشه سایت پوششی است، نه پنل
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.disguise = true; s.auth.panic = false; s.auth.decoyUrl = ''; s.auth.maintenanceHost = 'nginx'; });
{
  const r = await get('/');
  const b = await bodyOf(r);
  chk('disguise on: / is 200', r.status === 200, 'status=' + r.status);
  chk('disguise on: / shows the cover site', b.includes(SITES.nginx.marker));
  chk('disguise on: / does not show the panel', !b.includes(UI_MARKER));
  chk('disguise on: / is html', /text\/html/i.test(r.headers.get('content-type') || ''), r.headers.get('content-type'));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ۲) disguise: false → ریشه پنل را نشان می‌دهد
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.disguise = false; });
{
  const r = await get('/');
  const b = await bodyOf(r);
  chk('disguise off: / is 200', r.status === 200, 'status=' + r.status);
  chk('disguise off: / shows the panel', b.includes(UI_MARKER));
  chk('disguise off: / does not show the cover site', !b.includes(SITES.nginx.marker));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ۳) panic → پنل و اشتراک پشتِ سایت پوششی پنهان می‌شوند
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.disguise = true; s.auth.panic = true; });
{
  const r = await get('/panel');
  const b = await bodyOf(r);
  chk('panic: panel route returns the cover site', b.includes(SITES.nginx.marker));
  chk('panic: panel is not reachable', !b.includes(UI_MARKER));

  const r2 = await get('/panel/dash');
  chk('panic: /panel/dash also hidden', !(await bodyOf(r2)).includes(UI_MARKER));

  const r3 = await get('/sub/' + UUID);
  chk('panic: subscription route shows the cover site', (await bodyOf(r3)).includes(SITES.nginx.marker));

  /* health و api باید باز بمانند — وگرنه راهی برای خاموش کردن panic نمی‌ماند */
  const h = await get('/api/health');
  const hj = await h.json().catch(() => null);
  chk('panic: health still answers', h.status === 200 && hj && hj.ok === true, 'status=' + h.status);
  const st = await (await get('/api/state', { headers: { authorization: 'Bearer ' + login.token } })).json();
  chk('panic: /api/* still answers', st && Array.isArray(st.users), JSON.stringify(st).slice(0, 60));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ۴) هر مقدارِ maintenanceHost یک صفحه‌ی متفاوت و غیرخالی می‌دهد
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.panic = false; });
{
  const seen = new Map();
  for (const k in SITES) {
    await setCfg((s) => { s.auth.maintenanceHost = k; });
    const r = await get('/');
    const b = await bodyOf(r);
    chk('site ' + k + ': 200 and non-empty', r.status === 200 && b.length > 200, 'len=' + b.length);
    chk('site ' + k + ': serves its own page', b.includes(SITES[k].marker));
    seen.set(k, b);
  }
  const uniq = new Set([...seen.values()]);
  chk('every host yields a different page', uniq.size === Object.keys(SITES).length,
    uniq.size + ' unique of ' + Object.keys(SITES).length);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ۵) دارایی‌های سایت واقعی — بازتابِ مسیر (روشِ نهان)
      قبلاً هر مسیر ناشناخته HTML برمی‌گرداند و CSS/تصویر خراب می‌شد.
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.maintenanceHost = 'nginx'; });
{
  const css = await get('/assets/site.css');
  chk('asset: css is served as css', /text\/css/i.test(css.headers.get('content-type') || ''), css.headers.get('content-type'));
  chk('asset: css body is not the html page', !(await bodyOf(css)).includes('<html'));

  const png = await get('/assets/logo.png');
  chk('asset: image keeps its content-type', /image\/png/i.test(png.headers.get('content-type') || ''), png.headers.get('content-type'));

  /* زیرصفحه‌ها هم بازتاب می‌شوند */
  const sub = await get('/en/docs');
  chk('asset: unknown sub-path is mirrored (not html-ised)', /text\/html/i.test(sub.headers.get('content-type') || ''));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ۶) آدرس دلخواه — استفاده می‌شود؛ و اگر در دسترس نبود افتِ graceful
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.decoyUrl = 'https://' + CUSTOM_HOST + '/'; });
{
  const r = await get('/');
  chk('custom decoyUrl is used', (await bodyOf(r)).includes(CUSTOM_MARKER));
}
{
  /* آدرسی که هیچ کشِ موفقی ندارد — واکشی از همان ابتدا شکست می‌خورد */
  await setCfg((s) => { s.auth.decoyUrl = 'https://' + DEAD_HOST + '/'; });
  dead = true;
  const r = await get('/');
  const b = await bodyOf(r);
  chk('dead decoyUrl: never 500', r.status !== 500, 'status=' + r.status);
  chk('dead decoyUrl: never empty', b.length > 200, 'len=' + b.length);
  chk('dead decoyUrl: falls back to the built-in page', /Welcome to nginx!/i.test(b), b.slice(0, 60));

  const asset = await get('/assets/site.css');
  chk('dead decoyUrl: asset is 404, not html', asset.status === 404, 'status=' + asset.status);
  dead = false;

  /* سایت تک‌صفحه‌ای: بعد از حذف اسکریپت تقریباً خالی است → صفحه‌ی داخلی */
  await setCfg((s) => { s.auth.decoyUrl = 'https://' + SPA_HOST + '/'; });
  const spa = await bodyOf(await get('/'));
  chk('spa cover site falls back to the built-in page', /Welcome to nginx!/i.test(spa), spa.slice(0, 60));
  /* ?refresh=1 هم باید کش را دور بزند (تستِ پنل از همین استفاده می‌کند) */
  await setCfg((s) => { s.auth.decoyUrl = 'https://' + CUSTOM_HOST + '/'; });
  chk('refresh=1 bypasses the decoy cache', (await bodyOf(await get('/?refresh=1'))).includes(CUSTOM_MARKER));
}
await setCfg((s) => { s.auth.decoyUrl = ''; });

/* ═══════════════════════════════════════════════════════════════════════════
   ۷) ضدِ رگرسیون — پنل، اشتراک، health و api با استتارِ روشن سر جای خود هستند
   ═══════════════════════════════════════════════════════════════════════════ */
await setCfg((s) => { s.auth.disguise = true; s.auth.panic = false; s.auth.maintenanceHost = 'nginx'; });
{
  const r = await get('/panel');
  chk('regression: panel route still serves the panel', (await bodyOf(r)).includes(UI_MARKER));

  const s1 = await get('/panel/sub/' + UUID);
  const b1 = await bodyOf(s1);
  chk('regression: subscription route is not hijacked',
    s1.status === 200 && b1.length > 0 && !b1.includes(SITES.nginx.marker),
    'status=' + s1.status + ' len=' + b1.length);

  const h = await get('/api/health');
  const hj = await h.json().catch(() => null);
  chk('regression: health returns json', h.status === 200 && hj && hj.ok === true, 'status=' + h.status);

  /* /health (بدون /api) نباید توسط استتار بلعیده شود — پاسخش با استتارِ روشن و
     خاموش یکی است. (خودِ مسیر از قبل ۴۰۴ می‌دهد: apiHandler فقط /api/ را جدا
     می‌کند — خارج از حوزه‌ی این تغییر، اینجا فقط نگهبانِ رگرسیون است.) */
  const bareOn = await get('/health');
  await setCfg((s) => { s.auth.disguise = false; });
  const bareOff = await get('/health');
  await setCfg((s) => { s.auth.disguise = true; });
  chk('regression: /health is not swallowed by disguise',
    bareOn.status === bareOff.status && !(await bodyOf(bareOn)).includes(SITES.nginx.marker),
    'on=' + bareOn.status + ' off=' + bareOff.status);

  const stt = await (await get('/api/state', { headers: { authorization: 'Bearer ' + login.token } })).json();
  chk('regression: /api/* works', stt && Array.isArray(stt.users));

  /* ?test=1 نباید جلوی استتار را بزند و ماهیت تونل را لو بدهد */
  const leak = await get('/anything?test=1');
  chk('regression: ?test=1 does not leak the tunnel while disguised',
    !(await bodyOf(leak)).includes('TUNNEL_OK'));

  /* مسیرهای کاملاً ناشناخته هم‌چنان پوششی‌اند */
  const unk = await bodyOf(await get('/wp-login.php'));
  chk('regression: unknown paths stay covered', unk.includes(SITES.nginx.marker));

  /* صفحه‌ی پوششی نباید هیچ نشانی از پنل بدهد */
  const hdrs = (await get('/')).headers;
  chk('cover page leaks no panel headers',
    !hdrs.get('access-control-allow-origin') && !(hdrs.get('content-security-policy') || '').includes('unsafe-eval'),
    'acao=' + hdrs.get('access-control-allow-origin'));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ۸) ارتقای WebSocket مستقل از استتار به تونل می‌رود
   ═══════════════════════════════════════════════════════════════════════════ */
{
  const r = await get('/whatever', { headers: { upgrade: 'websocket', connection: 'Upgrade', 'cf-connecting-ip': '203.0.113.7' } });
  chk('ws upgrade goes to the tunnel with disguise on', r.status === 101, 'status=' + r.status);
  await setCfg((s) => { s.auth.disguise = false; });
  const r2 = await get('/whatever', { headers: { upgrade: 'websocket', connection: 'Upgrade', 'cf-connecting-ip': '203.0.113.7' } });
  chk('ws upgrade goes to the tunnel with disguise off', r2.status === 101, 'status=' + r2.status);
}

globalThis.fetch = realFetch;
await ctx._settle();
console.log(`\n${total - fails}/${total} checks passed`);
if (fails) { console.log('DISGUISE TESTS FAILED'); process.exit(1); }
console.log('ALL DISGUISE TESTS PASSED');
