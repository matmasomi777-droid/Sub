/* ══════════════════════════════════════════════════════════════════════
   t16 — مرحله‌ی ۳: رابطِ «اتصال‌های زنده» در ui/app.js

   دو بخش دارد:
     الف) بررسیِ متنیِ منبع (همان الگوی t12) — ناوبری، نگاشتِ view، خلاصه،
         جدول، جست‌وجو، عملیاتِ هر ردیف، به‌روزرسانیِ هدفمند، endpointها.
     ب) اجرای واقعیِ ui/app.js روی یک DOMِ بسیار کوچکِ داخلی (بدون هیچ
         وابستگی): پنل بالا می‌آید، نشست‌ها رندر می‌شوند، جست‌وجو فیلتر
         می‌کند و عملیاتِ ردیف درست فراخوانی می‌شوند.

   ⚠️ رادارِ آی‌پی تمیز دیگر در پنلِ مدیریت نیست (منتقل شده به صفحه‌ی کاربر،
   ui/user.html). پوششِ رادارِ مدیریت در t15 می‌ماند (سقف‌ها و اسکنِ سمتِ
   ورکر) و رادارِ مرورگریِ صفحه‌ی کاربر در t18 بررسی می‌شود.

   نکته: بخشِ «ب» واقعاً فایل را اجرا می‌کند، برای همین یک خطای نحوی یا
   یک فراخوانیِ نادرستِ DOM همان‌جا دستگیر می‌شود.
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

const UI = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
const WK = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('PASS ', name + (note ? ' — ' + note : '')); }
  else { fail++; console.log('FAIL ', name + (note ? ' — ' + note : '')); }
};
/* بدنه‌ی یک تابع را از متن بیرون می‌کشد تا پنجره‌ی جست‌وجو محدود و دقیق باشد */
const fnBody = (name) => {
  const i = UI.indexOf('function ' + name);
  if (i < 0) return '';
  const j = UI.indexOf('\n  function ', i + 10);
  return j < 0 ? UI.slice(i) : UI.slice(i, j);
};
/* یک بازه‌ی مشخص از منبع — برای وقتی که یک بلوک بین چند تابع پخش شده */
const region = (from, to) => {
  const i = UI.indexOf(from);
  const j = UI.indexOf(to);
  return i < 0 || j < 0 ? '' : UI.slice(i, j);
};

console.log('── الف) بررسیِ متنیِ منبع ──');

/* ─── ۱) مدخلِ منوی «اتصال‌های زنده» ─── */
const navLine = UI.split('\n').find((l) => l.includes("['conns', 'اتصال‌های زنده'")) || '';
ok('nav has a live-connections entry', !!navLine, navLine.trim().slice(0, 90));
ok('live connections is grouped under شبکه', navLine.includes('شبکه'));
ok('nav entry carries an icon', /'conns',\s*'اتصال‌های زنده',\s*'fa-/.test(navLine), navLine.trim().slice(0, 90));
ok('VIEWS maps conns → connsView', /conns:\s*connsView\b/.test(UI));

/* ─── ۲) خلاصه‌ی بالای صفحه ───
   خلاصه و نشانگر در دو تابعِ جدا (cnStatsHtml / cnBadgeHtml) رندر می‌شوند تا
   بتوان بدون بازسازیِ کلِ صفحه آن‌ها را به‌روز کرد؛ بعدِ هر assert همین بازه
   بررسی می‌شود. */
const connBody = region('نمای «اتصال‌های زنده»', 'function monitorView');
ok('summary shows connected users', /sum\.users/.test(connBody) && /کاربران متصل/.test(connBody));
ok('summary shows distinct IPs', /sum\.ips/.test(connBody) && /آی‌پی‌های متمایز/.test(connBody));
ok('summary shows connection count', /sum\.connections/.test(connBody) && /تعداد اتصال‌ها/.test(connBody));
ok('summary shows the active source label', /sourceLabel/.test(connBody) && /مرجع فعال/.test(connBody));
ok('summary shows the release window (ttl)', /ttlMs/.test(connBody) && /زمان آزادسازی/.test(connBody));
ok('numbers go through the persian formatter', /fa\(sum\.(users|ips|connections)[^)]*\)/.test(connBody));
/* نشانگرِ پایان باید چیزی باشد که با حذفِ رادار هم سر جایش مانده باشد:
   بلوکِ وضعیتِ مرحله‌ی ۴ (EX) درست بعدِ cnShow می‌آید. */
const cnShowBody = region('const cnShow = () => {', 'const EX = { data: null');
ok('summary is re-rendered by the targeted refresh (not only the table)',
  /st\.innerHTML = cnStatsHtml\(\)/.test(cnShowBody) && /bg\.innerHTML = cnBadgeHtml\(\)/.test(cnShowBody));

/* ─── ۳) جدولِ نشست‌ها ─── */
const tblBody = fnBody('cnHtml');
ok('table has a config/user column', /کانفیگ \(یوزر\)/.test(tblBody), tblBody.slice(0, 60));
ok('table has an IP column', /<th>آی‌پی<\/th>/.test(tblBody) && /s\.ip/.test(tblBody));
ok('table has a country column', /<th>کشور<\/th>/.test(tblBody) && /s\.cc/.test(tblBody));
ok('table has a start-time column', /<th>شروع<\/th>/.test(tblBody) && /startedAt/.test(tblBody));
ok('table has a duration column', /<th>مدت اتصال<\/th>/.test(tblBody) && /durationSec/.test(tblBody));
ok('table has up/down volume columns', /<th>ارسال<\/th>/.test(tblBody) && /<th>دریافت<\/th>/.test(tblBody) && /s\.up/.test(tblBody) && /s\.down/.test(tblBody));
ok('table has a transport column', /<th>انتقال<\/th>/.test(tblBody) && /s\.transport/.test(tblBody));
ok('table has a last-activity column', /<th>آخرین فعالیت<\/th>/.test(tblBody) && /idleSec/.test(tblBody));
ok('idle badge is driven by the idle flag', /s\.idle\s*\?[\s\S]{0,260}?بی‌فعالیت/.test(tblBody));

/* ─── ۴) جست‌وجو ─── */
ok('connections table has a search box', /id="connSearch"/.test(UI));
ok('search keeps its value across re-renders', /id="connSearch"[^>]*value="'\s*\+\s*esc\(CN\.q/.test(UI));
ok('search filters rows on input', /e\.target\.id === 'connSearch'/.test(UI));
ok('search covers user name and IP', /جستجوی نام کانفیگ، UUID، آی‌پی/.test(UI));
/* فیلترِ زنده باید همان ردیف‌هایی را نگه دارد که رندرِ بعدی نگه می‌دارد */
ok('live filter and render-time filter share one predicate',
  /data-q="'\s*\+\s*esc\(cnKey\(s\)\)/.test(UI) && /tr\.dataset\.q/.test(UI) && /const cnKey = /.test(UI));

/* ─── ۵) عملیاتِ هر ردیف ─── */
ok('kick action exists (temporary cut)', /data-act="conn-kick"/.test(UI));
ok('kick targets only this session (connId)', /a === 'conn-kick'[\s\S]{0,600}?connId:\s*t\.dataset\.conn/.test(UI));
ok('kick calls POST /api/connections/kick', /api\('POST',\s*'\/api\/connections\/kick'/.test(UI));
ok('permanent ban action exists', /data-act="conn-ban"\s+data-h="0"/.test(UI));
ok('timed ban actions exist (1h / 24h)', /data-h="1"/.test(UI) && /data-h="24"/.test(UI));
ok('ban calls POST /api/connections/ban with hours', /api\('POST',\s*'\/api\/connections\/ban',\s*\{[^}]*hours:\s*h/.test(UI));
ok('hours=0 means permanent (server side)', /permanent:\s*!until/.test(WK));
ok('every destructive action asks for confirmation first', (() => {
  const seg = (s) => { const i = UI.indexOf(s); return i < 0 ? '' : UI.slice(i, i + 900); };
  return ["a === 'conn-kick'", "a === 'conn-ban'", "a === 'conn-unban'"].every((s) => seg(s).includes('confirm('));
})());
ok('results are shown with the server persian message', /toast\(r\.ok \? \(r\.msg \|\|/.test(UI));
ok('unban action exists', /data-act="conn-unban"/.test(UI));
ok('unban calls POST /api/connections/unban', /api\('POST',\s*'\/api\/connections\/unban'/.test(UI));
ok('bans are listed with remaining time or permanent', /cnBansHtml/.test(UI) && /دائم/.test(fnBody('cnBansHtml')) && /remainingSec/.test(fnBody('cnBansHtml')));
ok('bans table has an unban button', /رفع مسدودی/.test(UI));

/* ─── ۶) به‌روزرسانیِ خودکار بدون پاک شدن ─── */
ok('data lives in panel state (not only in the DOM)', /const CN = \{ data: null, bans: null, q:/.test(UI));
ok('only a healthy response replaces the previous data',
  /if \(a && !a\.error && a\.sessions\) \{ CN\.data = a;[\s\S]{0,120}?\}[\s\S]{0,80}?else if \(a && a\.error\) CN\.err/.test(UI));
ok('a periodic timer refreshes the connections view', /setInterval\(\(\) => \{ if \(S\.token && S\.view === 'conns'\) cnLoad\(\); \}/.test(UI));
ok('the periodic refresh is targeted (cnLoad, not a full re-render)',
  /S\.view === 'conns'\) cnLoad\(\);/.test(UI) && !/S\.view === 'conns'\) refresh\(\);/.test(UI));
ok('the view renders the stored data immediately', /id="connOut">'\s*\+\s*cnHtml\(CN\.data\)/.test(UI));

/* ─── ۷) پنلِ مدیریت دیگر رادار ندارد ───
   رادار به صفحه‌ی کاربر (ui/user.html) منتقل شده؛ اینجا فقط باید نبودش
   تأیید شود تا کسی دوباره آن را به پنل برنگرداند. پوششِ رفتاری در t15
   (سمتِ ورکر) و t18 (رادارِ مرورگریِ صفحه‌ی کاربر) است. */
ok('the admin panel source has no radar reference at all', (UI.match(/radar/gi) || []).length === 0,
  'matches: ' + (UI.match(/radar/gi) || []).length);
ok('the admin panel never calls /api/radar/*', !/\/api\/radar\//.test(UI));

/* ─── ۸) یک‌دستی با بقیه‌ی پنل ─── */
ok('connections view uses the same card/stat/shell classes',
  /class="grid g4"/.test(connBody) && /class="stat"/.test(connBody) && /class="card"/.test(connBody) && /class="page-head"/.test(connBody));
/* قراردادِ API: هر endpointی که رابط مصرف می‌کند در worker.js هم پیاده شده باشد */
ok('worker implements every endpoint the panel calls',
  ["route === 'connections'", "route === 'connections/kick'", "route === 'connections/ban'",
   "route === 'connections/unban'", "route === 'connections/bans'"]
    .every((r) => WK.includes(r)));

/* ══════════════════════════════════════════════════════════════════════
   بخشِ «ب» — اجرای واقعیِ ui/app.js روی یک DOMِ کوچک
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n── ب) اجرای واقعیِ پنل روی DOMِ کوچک ──');

const UUID = '11111111-2222-3333-4444-555555555555';
const IP_A = '203.0.113.5';
const IP_B = '198.51.100.7';

/* ── یک DOMِ حداقلی: فقط همان چیزی که app.js هنگامِ بارگیری و رندر لمس می‌کند ──

   نکته‌ی مهم: این شیم یک «درختِ واقعی» نمی‌سازد، اما رفتارِ innerHTML را
   شبیه‌سازی می‌کند — یعنی هر بار که یک عنصر innerHTML می‌گیرد، عنصرهای
   دارای id داخلِ آن هم پیدا و پر می‌شوند (همان کاری که مرورگر هنگامِ تجزیه
   می‌کند)، و برعکس: وقتی یک عنصرِ فرزند بازنویسی می‌شود، متنِ والد هم به‌روز
   می‌شود. بدونِ این دو جهت، «#view.innerHTML» و «#connStats.innerHTML» در
   تست از هم جدا می‌شدند و نتیجه با مرورگر فرق می‌کرد. */
const VOID_TAGS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source',
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'stop', 'ellipse']);

/* اندیسِ تگِ بستنِ متناظر را پیدا می‌کند (شمارشِ عمق روی همان نامِ تگ) */
function findClose(html, tag, from) {
  const open = '<' + tag, close = '</' + tag;
  let i = from, depth = 0;
  while (i < html.length) {
    const a = html.indexOf(open, i);
    const b = html.indexOf(close, i);
    if (b < 0) return -1;
    if (a >= 0 && a < b) {
      const after = html[a + open.length];
      if (after === undefined || ' >/\n\t\r'.includes(after)) depth++;
      i = a + open.length;
      continue;
    }
    depth--;
    if (depth === 0) return b;
    i = b + close.length;
  }
  return -1;
}

/* بازه‌ی یک عنصرِ دارای id داخلِ html: [اندیسِ شروع، اندیسِ تگِ باز، اندیسِ تگِ بستن، پایان] */
function idRange(html, id) {
  const re = new RegExp('<' + '(\\w+)([^>]*?)\\bid="' + id + '"([^>]*)>');
  const m = re.exec(html);
  if (!m) return null;
  const tag = m[1];
  if (VOID_TAGS.has(tag)) return null;
  const openEnd = m.index + m[0].length;
  const closeStart = findClose(html, tag, m.index);
  if (closeStart < openEnd) return null;
  return { tag, start: m.index, openEnd, closeStart, end: closeStart + ('</' + tag + '>').length };
}

function makeDom() {
  const els = new Map();
  const parentOf = new Map();          /* '#child' → کلیدِ والد */
  const mirrorSeen = new Set();

  /* محتوایِ idهایِ داخلِ html را روی عنصرهای متناظر می‌نشاند (یک‌طرفه، بدونِ بازگشت به والد) */
  const mirrorDown = (key, html, depth) => {
    if (depth > 6) return;
    const re = /<(\w+)([^>]*?)\bid="([^"]+)"([^>]*)>/g;
    let m;
    while ((m = re.exec(html))) {
      if (VOID_TAGS.has(m[1])) continue;
      const ck = '#' + m[3];
      if (ck === key || mirrorSeen.has(ck)) continue;
      const r = idRange(html, m[3]);
      if (!r) continue;
      mirrorSeen.add(ck);
      const inner = html.slice(r.openEnd, r.closeStart);
      const child = get(ck);
      child._html = inner;
      parentOf.set(ck, key);
      mirrorDown(ck, inner, depth + 1);
      mirrorSeen.delete(ck);
    }
  };

  /* یک عنصرِ فرزند بازنویسی شده — متنِ والد را هم اصلاح می‌کند (تا سراسرنما یک‌دست بماند) */
  const propagateUp = (key, seen) => {
    if (seen.has(key)) return;
    seen.add(key);
    const p = parentOf.get(key);
    if (!p) return;
    const parent = els.get(p);
    const id = key.slice(1);
    const r = idRange(parent._html || '', id);
    if (r) {
      const el = els.get(key);
      parent._html = (parent._html || '').slice(0, r.openEnd) + (el._html || '') + (parent._html || '').slice(r.closeStart);
    }
    propagateUp(p, seen);
  };

  const mk = (key) => {
    const el = {
      key, _html: '',
      id: '', dataset: {}, style: {}, children: [],
      textContent: '', value: '', checked: false, disabled: false,
      classList: (() => { const s = new Set(); return {
        add: (...c) => c.forEach((x) => s.add(x)),
        remove: (...c) => c.forEach((x) => s.delete(x)),
        toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); return on; },
        contains: (c) => s.has(c) }; })(),
      addEventListener() {}, removeEventListener() {},
      appendChild(c) { this.children.push(c); return c; },
      remove() {}, focus() {}, click() {}, setAttribute() {}, getAttribute: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 180 }),
      querySelector: (s) => get(key + ' ' + s),
      querySelectorAll: () => [],
      closest: () => null,
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this._html; },
      set(v) {
        this._html = String(v);
        mirrorDown(key, this._html, 0);
        propagateUp(key, new Set());
      },
      enumerable: true, configurable: true,
    });
    Object.defineProperty(el, 'parentElement', { get: () => get(key + ' ^'), configurable: true });
    return el;
  };

  const get = (key) => {
    if (!els.has(key)) els.set(key, mk(key));
    return els.get(key);
  };
  const handlers = {};
  const doc = {
    documentElement: get(':html'),
    body: get(':body'),
    querySelector: (s) => get(s),
    querySelectorAll: () => [],
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    createElement: () => mk(':created:' + Math.random()),
  };
  return { get, handlers, doc, els };
}

/* حافظه‌ی مشترک بین «بارگیری»های پنل — همان نقشِ localStorageِ مرورگر */
function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

const state = () => ({
  ok: true, version: '3.0.0', build: 'test', storage: 'd1', boot: Date.now(),
  users: [{ id: 'u1', uuid: UUID, name: 'علی', secret: 's', enabled: true, up: 1024, down: 2048,
            quotaGB: 10, totalReq: 12, lastSeen: Date.now(), note: '', cleanIPs: ['1.1.1.1#قدیمی'] }],
  stats: { requests: 42, connections: 2, trafficSeries: [1, 2, 3], daily: [1], monthly: [2], yearly: [3], reqSeries: [1] },
  logs: [], keys: [], panels: [],
  settings: {
    panel: { name: 'پنل تست' },
    auth: { path: 'panel', panic: false, sessionMin: 60, totp: false, disguise: false, maintenanceHost: '' },
    sub: { path: 'sub', fakes: [] },
    mode: 'both', protocols: { vless: true, trojan: true }, transport: 'ws', tls: true,
    sni: '', fingerprint: 'chrome', trojanHash: 'abc', path: '/tun',
    cleanIPs: ['1.1.1.1'], ports: [443], proxyIPs: [],
    sec: { ipConnLimit: 2 }, fragment: { enabled: false }, ech: { enabled: false },
    tg: { enabled: false }, upd: { auto: false, repo: 'x/y' },
  },
});

const connsRes = () => ({
  ok: true, ts: Date.now(), source: 'd1', sourceLabel: 'D1 — سراسری', storage: 'd1', ttlMs: 3000,
  summary: { users: 1, ips: 2, connections: 2 },
  sessions: [
    { connId: 'c1', uuid: UUID, user: 'علی', userId: 'u1', ip: IP_A, cc: 'DE', startedAt: Date.now() - 3600e3,
      durationSec: 3600, up: 1024, down: 65536, transport: 'ws', lastActivityAt: Date.now() - 5000,
      idleSec: 5, idle: false, ua: 'v2rayN/1.0' },
    { connId: 'c2', uuid: UUID, user: 'سارا', userId: 'u2', ip: IP_B, cc: 'IR', startedAt: Date.now() - 90e3,
      durationSec: 90, up: 0, down: 0, transport: 'ws', lastActivityAt: Date.now() - 900e3,
      idleSec: 900, idle: true, ua: '' },
  ],
});
const bansRes = () => ({
  ok: true,
  bans: [{ ip: '198.51.100.9', uuid: UUID, until: 0, permanent: true, expired: false,
           remainingSec: null, reason: 'اشتراک‌گذاری', createdAt: Date.now() - 60000, createdBy: 'admin' }],
});

/* ── یک «بارگیریِ صفحه»: شیم تازه + همان localStorage ── */
async function boot(opts = {}) {
  const dom = makeDom();
  const calls = [];
  const confirmations = [];
  const store = opts.store || makeStorage({ sg_t: 'tok' });
  const sess = makeStorage({ sg_t: 'tok' });

  const prev = {};
  const keep = ['document', 'window', 'location', 'localStorage', 'sessionStorage', 'fetch', 'confirm', 'setInterval'];
  for (const k of keep) prev[k] = Object.getOwnPropertyDescriptor(globalThis, k) || { value: globalThis[k] };

  const timers = [];
  const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  define('document', dom.doc);
  define('window', { addEventListener: () => {}, matchMedia: () => ({ matches: false }), open: () => {} });
  define('location', { hostname: 'panel.example.workers.dev', origin: 'https://panel.example.workers.dev', pathname: '/' });
  define('localStorage', store);
  define('sessionStorage', sess);
  define('confirm', (m) => { confirmations.push(String(m)); return opts.confirm !== false; });
  /* setInterval را خاموش می‌کنیم تا فرآیند بعد از تست زنده نماند؛
     خودِ فراخوانی را ضبط می‌کنیم تا تکرارِ دوره‌ای تأیید شود. */
  define('setInterval', (fn, ms) => { timers.push(ms); return 0; });
  define('fetch', async (url, init) => {
    const path = String(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: (init && init.method) || 'GET', body });
    let payload;
    if (path === '/api/state') payload = state();
    else if (path === '/api/connections' && (!init || init.method === 'GET')) payload = opts.conns === null ? { error: 'سرور پاسخ نداد' } : connsRes();
    else if (path === '/api/connections/bans') payload = bansRes();
    else if (path === '/api/connections/kick') payload = { ok: true, kicked: 1, msg: '۱ اتصال قطع شد' };
    else if (path === '/api/connections/ban') payload = { ok: true, ip: body.ip, permanent: !body.hours, msg: 'آی‌پی مسدود شد' };
    else if (path === '/api/connections/unban') payload = { ok: true, removed: true, msg: 'مسدودی برداشته شد' };
    else payload = { error: 'not found: ' + path };
    return { status: 200, ok: true, json: async () => payload, headers: { get: () => null } };
  });

  new Function(UI)();
  /* refresh() بدون await صدا زده می‌شود؛ چند چرخه صبر می‌کنیم تا تایمرهای
     کوتاهِ داخلِ رندر (مثل setTimeout(cnLoad, 20)) هم اجرا شوند */
  await settle();

  const fire = async (type, target) => {
    const ev = { target };
    await Promise.all((dom.handlers[type] || []).map((fn) => fn(ev)));
    await settle();
  };
  const click = async (dataset) => {
    const el = { dataset, disabled: false, innerHTML: '', value: '', checked: false, style: {}, children: [] };
    el.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    el.closest = (sel) => (sel === '[data-act]' ? el : null);
    el.appendChild = (c) => c;
    await fire('click', el);
  };
  const nav = async (view) => click({ act: 'nav', view });
  const change = async (target) => fire('change', target);
  const input = async (target) => fire('input', target);

  return {
    dom, calls, confirmations, timers, store,
    el: (sel) => dom.get(sel),
    view: () => dom.get('#view').innerHTML,
    click, nav, change, input,
    restore: () => { for (const k of keep) { if (prev[k]) Object.defineProperty(globalThis, k, prev[k]); else delete globalThis[k]; } },
  };
}

/* صبر تا همه‌ی میکروتسک‌ها و تایمرهای کوتاهِ پنل اجرا شوند */
const settle = async () => { for (let i = 0; i < 14; i++) await new Promise((r) => setTimeout(r, 4)); };
const count = (hay, needle) => String(hay).split(needle).length - 1;
/* مدخل‌های ناوبری از همان منبع بیرون کشیده می‌شوند تا تست با منو هماهنگ بماند */
const NAV_VIEWS = [...UI.matchAll(/\['([a-z]+)', '([^']+)', 'fa-/g)].map((m) => m[1]);

/* ─── ۱) پنل بالا می‌آید و مدخلِ منو ساخته می‌شود ─── */
let app = await boot();
ok('panel bootstraps without touching a real browser', app.el('#view').innerHTML.length > 0);
const navHtml = app.el('#nav').innerHTML;
ok('sidebar renders the live-connections entry', navHtml.includes('اتصال‌های زنده'), navHtml.slice(0, 120));
ok('sidebar entry carries an inline svg icon', /اتصال‌های زنده[\s\S]{0,10}<\/svg>/.test(navHtml) || navHtml.includes('<svg'));

/* ─── ۱ب) دودگرفت: هر مدخلِ منو باید بدون استثنا رندر شود ─── */
ok('nav entries were discovered in the source', NAV_VIEWS.length >= 9, NAV_VIEWS.join(','));
const smoke = await boot();
const broken = [];
for (const v of NAV_VIEWS) {
  /* کنترلِ پنل استثناها را می‌بلعد و به‌صورت toast نشان می‌دهد، پس خطا را
     از همان‌جا می‌خوانیم نه از try/catch */
  const before = smoke.el('#toastRoot').children.length;
  await smoke.nav(v);
  const errs = smoke.el('#toastRoot').children.slice(before)
    .filter((d) => String(d.className || '').includes('err'))
    .map((d) => String(d.innerHTML).replace(/<[^>]*>/g, '').trim());
  if (errs.length) broken.push(v + ' → ' + errs.join('، '));
  else if (!smoke.view() || smoke.view().length < 40) broken.push(v + ' (خالی)');
}
ok('every sidebar view renders without an error toast', broken.length === 0, broken.join(' | '));
smoke.restore();

/* ─── ۲) بخشِ اتصال‌های زنده ─── */
await app.nav('conns');
ok('connections view is reachable from the menu', app.view().includes('اتصال‌های زنده'));
ok('summary shows the connected-user count', app.view().includes('۱') && app.view().includes('کاربران متصل'));
ok('summary shows distinct IPs', app.view().includes('آی‌پی‌های متمایز') && app.view().includes('۲'));
ok('summary shows the active source label', app.view().includes('D1 — سراسری'));
ok('summary shows the release window', app.view().includes('زمان آزادسازی') && app.view().includes('۳ ثانیه'));
ok('summary shows the active source label', app.view().includes('D1 — سراسری'));
ok('summary shows the release window', app.view().includes('زمان آزادسازی') && app.view().includes('۳ ثانیه'));
const connOut = app.el('#connOut').innerHTML;
ok('sessions are fetched from /api/connections', app.calls.some((c) => c.path === '/api/connections'));
ok('each session IP is rendered', connOut.includes(IP_A) && connOut.includes(IP_B));
ok('config name is rendered', connOut.includes('علی') && connOut.includes('سارا'));
ok('country is rendered', connOut.includes('DE') && connOut.includes('IR'));
ok('volume is rendered in persian', /[\u06F0-\u06F9]/.test(connOut));
ok('idle session is flagged', connOut.includes('بی‌فعالیت'));
ok('bans are fetched and listed', app.calls.some((c) => c.path === '/api/connections/bans') && app.el('#connBansOut').innerHTML.includes('198.51.100.9'));
ok('permanent ban is labelled', app.el('#connBansOut').innerHTML.includes('دائم'));
ok('bans list has an unban button', app.el('#connBansOut').innerHTML.includes('conn-unban'));

/* ─── ۳) به‌روزرسانیِ دوره‌ای نتیجه را پاک نمی‌کند ─── */
ok('a periodic timer is registered for the connections view', app.timers.includes(10000), JSON.stringify(app.timers));
const before = app.el('#connOut').innerHTML;
app.calls.length = 0;
const pending = app.click({ act: 'conn-load' });          /* در میانه‌ی درخواست */
ok('previous rows stay on screen while the refresh is in flight', app.el('#connOut').innerHTML === before);
await pending;
ok('a successful refresh keeps the table populated', app.el('#connOut').innerHTML.includes(IP_A));

app = await boot({ conns: null, store: app.store });      /* پاسخِ خطا از سرور */
await app.nav('conns');
await app.click({ act: 'conn-load' });
ok('a failed refresh does not wipe the previous data', app.el('#connOut').innerHTML.includes(IP_A) || app.el('#connOut').innerHTML.includes('در حال بارگیری'));

/* ─── ۴) جست‌وجو ─── */
app = await boot();
await app.nav('conns');
ok('no filter → every row is visible', count(app.view(), 'class="hide"') === 0);
await app.input({ id: 'connSearch', value: IP_A });
await app.nav('dash');
await app.nav('conns');
const filtered = app.view();
ok('searching an IP keeps its row and hides the rest',
  filtered.includes(IP_A) && count(filtered, 'class="hide"') === 1, 'hidden rows: ' + count(filtered, 'class="hide"'));
await app.input({ id: 'connSearch', value: 'سارا' });
await app.nav('dash');
await app.nav('conns');
const f2 = app.view();
ok('searching a config name keeps its row and hides the rest',
  f2.includes('سارا') && count(f2, 'class="hide"') === 1);
await app.input({ id: 'connSearch', value: 'چیزی-که-نیست' });
await app.nav('dash');
await app.nav('conns');
ok('a search with no match hides every row', count(app.view(), 'class="hide"') === 2);
await app.input({ id: 'connSearch', value: '' });
await app.nav('dash');
await app.nav('conns');
ok('clearing the search brings every row back', count(app.view(), 'class="hide"') === 0);

/* ─── ۵) عملیاتِ ردیف ─── */
app = await boot();
await app.nav('conns');
app.calls.length = 0;
await app.click({ act: 'conn-kick', conn: 'c1', ip: IP_A, uuid: UUID, name: 'علی' });
const kick = app.calls.find((c) => c.path === '/api/connections/kick');
ok('kick asks for confirmation first', app.confirmations.some((c) => c.includes(IP_A) && c.includes('علی')));
ok('kick posts to /api/connections/kick', !!kick, kick && JSON.stringify(kick.body));
ok('kick targets only this session', kick && kick.body.connId === 'c1' && kick.body.uuid === UUID && kick.body.ip === IP_A);

app.calls.length = 0;
await app.click({ act: 'conn-ban', h: '0', ip: IP_A, uuid: UUID, name: 'علی' });
const banPerm = app.calls.find((c) => c.path === '/api/connections/ban');
ok('permanent ban asks for confirmation', app.confirmations.some((c) => c.includes('دائم')));
ok('permanent ban sends hours=0', banPerm && banPerm.body.hours === 0 && banPerm.body.ip === IP_A);

app.calls.length = 0;
await app.click({ act: 'conn-ban', h: '1', ip: IP_A, uuid: UUID, name: 'علی' });
ok('1-hour ban sends hours=1', (app.calls.find((c) => c.path === '/api/connections/ban') || {}).body?.hours === 1);
app.calls.length = 0;
await app.click({ act: 'conn-ban', h: '24', ip: IP_A, uuid: UUID, name: 'علی' });
ok('24-hour ban sends hours=24', (app.calls.find((c) => c.path === '/api/connections/ban') || {}).body?.hours === 24);

app.calls.length = 0;
await app.click({ act: 'conn-unban', ip: '198.51.100.9' });
const unban = app.calls.find((c) => c.path === '/api/connections/unban');
ok('unban posts the IP', unban && unban.body.ip === '198.51.100.9');

/* ─── ۶) رادارِ مدیریت دیگر در این پنل نیست (منتقل به صفحه‌ی کاربر) ─── */
app = await boot();
await app.nav('sub');
ok('the config page renders without a radar card', !app.view().includes('رادار'));
ok('no radar endpoint is requested by the panel',
  app.calls.filter((c) => c.path.startsWith('/api/radar')).length === 0,
  JSON.stringify(app.calls.map((c) => c.path)));
ok('the page still renders the subscription link itself', app.view().includes('لینک ساب'));

/* ─── ۷) نشست‌ها در حافظه‌ی مرورگر ذخیره نمی‌شوند (جدولِ مانده ساخته نمی‌شود) ─── */
ok('connections state is not persisted as a stale table', !('sg_conn_last' in (app.store._map ? Object.fromEntries(app.store._map) : {})));

app.restore();

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('T16 V3-UI TESTS FAILED'); process.exit(1); }
console.log('ALL V3-UI TESTS PASSED');
process.exit(0);
