/* ══════════════════════════════════════════════════════════════════════
   t17 — مرحله‌ی ۴ در ui/app.js: انتخابگرِ پورت، تغییرِ رمز عبور،
         پشتیبان و بازیابی با کشیدن‌ورها‌کردن، نام‌گذاریِ گروهی،
         سرورهای خروجی VLESS.

   این فایل از همان harnessِ t16 استفاده می‌کند: بالای فایل (تا تعریفِ
   NAV_VIEWS) کپیِ «بخشِ الف و harnessِ» t16 است تا makeDom/boot/state
   دوباره نوشته نشوند — با همان اصلاح‌ها (نبودِ رادار در پنلِ مدیریت)؛
   بخشِ «ج» در انتهای فایل هندلرهای تازه را روی همان DOMِ کوچک واقعاً اجرا
   می‌کند و ادعا می‌کند مسیرها درست صدا زده می‌شوند — ادعای پوششِ کاملِ
   مرحله‌ی ۴ را ندارد.

   نکته: پنل واقعاً اجرا می‌شود، برای همین یک خطای نحوی یا یک فراخوانیِ
   نادرستِ DOM همان‌جا دستگیر می‌شود.
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
   تأیید شود تا کسی دوباره آن را به پنل برنگرداند. */
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
   بخشِ «ب» — همان harnessِ t16 (اینجا فقط تعریف می‌شود؛ اجرا در بخشِ «ج»)
   ══════════════════════════════════════════════════════════════════════ */

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

/* ══════════════════════════════════════════════════════════════════════
   دودگرفتِ مرحله‌ی ۴ — فقط بررسیِ اینکه هندلرهای تازه واقعاً اجرا می‌شوند
   (بدونِ ادعای پوششِ کامل). از همان harnessِ بالا استفاده می‌کند.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n── ج) دودگرفتِ مرحله‌ی ۴ ──');

const s4 = await boot();
await s4.nav('config');
const v4 = () => s4.el('#view').innerHTML;
const raw = async (type, ev) => {
  await Promise.all((s4.dom.handlers[type] || []).map((f) => f(ev)));
  await settle();
};
const chipEl = (port, lock) => {
  const el = { dataset: lock ? { port, lock: '1' } : { port }, style: {}, value: '' };
  el.closest = (sel2) => (sel2 === '[data-port]' ? el : null);
  return el;
};
const chipClick = async (port, lock) => {
  const el = chipEl(port, lock);
  await raw('click', { target: el, preventDefault() {}, stopPropagation() {} });
};

/* ── ۱) انتخابگرِ پورت ── */
ok('config view renders the port chips', v4().includes('id="portChips"'));
await s4.click({ act: 'ports-recommended' });
ok('recommended preset = essential + recommended',
  s4.el('#portsVal').value === '443,80,8443,2053,2083,2087,2096,8880', s4.el('#portsVal').value);
await chipClick('2053');
ok('clicking a recommended chip turns it off',
  !s4.el('#portsVal').value.split(',').includes('2053'), s4.el('#portsVal').value);
await chipClick('2052');
ok('clicking an optional chip turns it on',
  s4.el('#portsVal').value.split(',').includes('2052'), s4.el('#portsVal').value);
const beforeLock = s4.el('#portsVal').value;
await chipClick('443', true);
ok('essential port 443 is locked and cannot be turned off', s4.el('#portsVal').value === beforeLock, s4.el('#portsVal').value);
await s4.click({ act: 'ports-essential' });
ok('essential preset keeps only 443 and 80', s4.el('#portsVal').value === '443,80', s4.el('#portsVal').value);

/* ── ۵) سرورهای خروجی — صفحه باید فهرست را بگیرد ── */
ok('config view requests the exit servers list',
  s4.calls.some((c) => c.path === '/api/exits' && c.method === 'GET'));
ok('exit servers card is rendered', v4().includes('سرورهای خروجی VLESS'));

/* ── ۲) تغییر رمز عبور ── */
await s4.click({ act: 'pw-save' });
ok('empty current password is rejected locally',
  s4.el('#pwOut').innerHTML.includes('رمز عبور فعلی را وارد کنید'), s4.el('#pwOut').innerHTML.slice(0, 80));
ok('no request is sent before local validation passes',
  !s4.calls.some((c) => c.path === '/api/password'));
s4.el('#pwCur').value = 'old1234';
s4.el('#pwNew').value = 'newpass1';
s4.el('#pwNew2').value = 'other123';
await s4.click({ act: 'pw-save' });
ok('mismatched repeat is rejected locally',
  s4.el('#pwOut').innerHTML.includes('یکسان نیست') && !s4.calls.some((c) => c.path === '/api/password'));
s4.el('#pwNew2').value = 'newpass1';
await s4.click({ act: 'pw-save' });
const pwCall = s4.calls.find((c) => c.path === '/api/password');
ok('password change posts to /api/password', !!pwCall && pwCall.method === 'POST');
ok('password change sends current + new', !!pwCall && pwCall.body.current === 'old1234' && pwCall.body.newPassword === 'newpass1',
  JSON.stringify(pwCall && pwCall.body));
ok('server message is shown in the password block', s4.el('#pwOut').innerHTML.length > 0);

/* ── ۴) نام‌گذاریِ کانفیگ‌ها ── */
await s4.click({ act: 'nm-tpl', v: '{node}-{index}' });
ok('ready-made template fills the pattern field', s4.el('#nmPat').value === '{node}-{index}', s4.el('#nmPat').value);
await s4.click({ act: 'nm-sel-all' });
ok('select-all shows a live preview for each config',
  s4.el('#nmPreview').innerHTML.includes('فرانکفورت-1'), s4.el('#nmPreview').innerHTML.slice(0, 120));
await s4.click({ act: 'nm-var', v: 'port' });
ok('variable chip appends the token', s4.el('#nmPat').value === '{node}-{index}{port}', s4.el('#nmPat').value);
await s4.click({ act: 'nm-sel-none' });
ok('select-none empties the selection', s4.el('#nmPreview').innerHTML.includes('هیچ کانفیگی انتخاب نشده'));
await s4.click({ act: 'nm-sel-all' });
await s4.click({ act: 'nm-tpl', v: '{node}-{index}' });
await s4.click({ act: 'nm-apply' });
const nmCalls = s4.calls.filter((c) => c.path === '/api/users' && c.body && c.body.op === 'update');
ok('bulk naming saves a per-config pattern', nmCalls.length === 1 && !!nmCalls[0].body.patch.namePattern,
  JSON.stringify(nmCalls[0] && nmCalls[0].body));
ok('bulk naming numbers the configs automatically',
  !!nmCalls[0] && /1$/.test(String(nmCalls[0].body.patch.namePattern)), String(nmCalls[0] && nmCalls[0].body.patch.namePattern));

/* ── ۳) پشتیبان و بازیابی با رها‌کردن ── */
const dropTarget = { style: {}, classList: { toggle() {} } };
dropTarget.closest = (sel2) => (sel2 === '#bkDrop' ? dropTarget : null);
const backup = { kind: 'sub-panel-backup', version: '3.0.0', exportedAt: Date.now(), storage: 'd1', data: { users: [{ id: 'u1' }] } };
await raw('drop', {
  target: dropTarget, preventDefault() {},
  dataTransfer: { files: [{ name: 'b.json', text: async () => JSON.stringify(backup) }], getData: () => '' },
});
ok('dropping a file fills the backup summary',
  s4.el('#bkInfo').innerHTML.includes('تعداد کاربر'), s4.el('#bkInfo').innerHTML.slice(0, 90));
await s4.click({ act: 'bk-mode', v: 'replace' });
ok('restore mode can be switched to replace', s4.el('#bkInfo').innerHTML.includes('جایگزینی'));
await s4.click({ act: 'bk-restore' });
const rsCall = s4.calls.find((c) => c.path === '/api/restore');
ok('restore posts the file data to /api/restore', !!rsCall && rsCall.method === 'POST' && Array.isArray(rsCall.body.data.users));
ok('restore forwards the chosen mode', !!rsCall && rsCall.body.mode === 'replace', String(rsCall && rsCall.body.mode));
ok('invalid backup shows the server error list', s4.el('#bkErr').innerHTML.length > 0);

console.log('\n════════════════════════════════');
if (fail === 0) console.log('ALL STAGE-4 SMOKE CHECKS PASSED');
else console.log(fail + ' CHECK(S) FAILED');
process.exit(fail === 0 ? 0 : 1);
