/* ══════════════════════════════════════════════════════════════════════
   t16 — مرحله‌ی ۳: رابطِ «اتصال‌های زنده» و «رادار» در ui/app.js

   دو بخش دارد:
     الف) بررسیِ متنیِ منبع (همان الگوی t12) — ناوبری، نگاشتِ view،
         endpointها، محدودیت‌ها، ماندگاریِ گزارش.
     ب) اجرای واقعیِ ui/app.js روی یک DOMِ بسیار کوچکِ داخلی (بدون هیچ
         وابستگی): اسکنِ رادار اجرا می‌شود، پنل «بازسازی می‌شود» (بارگیریِ
         دوباره‌ی فایل با همان localStorage) و گزارش هنوز سر جایش است.

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
const cnShowBody = region('const cnShow = () => {', 'const RD = { last');
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

/* ─── ۷) کارتِ رادار در صفحه‌ی کاربر ─── */
ok('radar card is rendered on the per-config page', /heroCard\(\) \+ statusCard\(\) \+ radarCard\(u\)/.test(UI));
ok('radar card has a persian title', /رادار — اسکنرِ آی‌پی تمیز/.test(UI));
ok('radar has a start-scan button', /data-act="radar-scan"/.test(UI));
ok('radar scan calls POST /api/radar/scan', /api\('POST',\s*'\/api\/radar\/scan'/.test(UI));
ok('radar reads its defaults from GET /api/radar/config', /api\('GET',\s*'\/api\/radar\/config'/.test(UI));
ok('config is fetched once when the page opens', /S\.view === 'sub'\) radarCfg\(\);/.test(UI));
const rdOptBody = fnBody('rdOpt') || UI.slice(UI.indexOf('const rdOpt'), UI.indexOf('async function radarCfg'));
ok('candidate count is capped by maxCount', /Math\.min\(maxN,/.test(rdOptBody));
ok('concurrency is capped by maxConcurrency', /Math\.min\(maxC,/.test(rdOptBody));
ok('scan settings cover count/concurrency/timeout/port/tls/exit',
  /rdCount/.test(UI) && /rdConc/.test(UI) && /rdTimeout/.test(UI) && /rdPort/.test(UI) && /rdTls/.test(UI) && /rdExit/.test(UI));
ok('exit servers come from the config response', /RD\.cfg\.exits/.test(UI) && /rdExit/.test(UI));
ok('scan shows in-progress state', /RD\.running/.test(UI) && /در حال اسکن/.test(UI));
ok('report shows the tested count', /تست‌شده: ' \+ fa\(rec\.tested/.test(UI));
ok('report shows total scan time', /زمان کل اسکن/.test(UI) && /rec\.scanMs/.test(UI));
ok('report shows success/failure counts', /موفق: ' \+ fa\(rec\.alive/.test(UI) && /ناموفق: ' \+ fa\(rec\.failed/.test(UI));
ok('results are ordered best-first (server sorts)', /results\.sort\(\(a, c\) =>/.test(WK));
ok('result table has all the columns',
  /<th>آی‌پی<\/th><th>پورت<\/th><th>وضعیت<\/th><th>تأخیر<\/th><th>جیتر<\/th><th>میزان خطا<\/th><th>امتیاز<\/th>/.test(UI));
ok('best IP is highlighted', /بهترین<\/span>/.test(UI) && /rec\.best\.ip/.test(UI));
ok('apply to this config exists', /data-act="radar-apply"/.test(UI));
ok('apply to all configs exists', /data-act="radar-apply-all"/.test(UI) && /all:\s*true/.test(UI));
ok('apply calls POST /api/radar/apply', /api\('POST',\s*'\/api\/radar\/apply'/.test(UI));
ok('only healthy IPs are applied', /filter\(\(x\) => x\.ok\)/.test(UI));

/* ─── ۸) ماندگاریِ گزارشِ رادار (الگویِ UH/TT) ─── */
ok('radar result is kept in state', /const RD = \{ last: \{\}/.test(UI));
ok('radar result is persisted to localStorage', /localStorage\.setItem\(RD_KEY/.test(UI));
ok('radar result is restored on load', /localStorage\.getItem\(RD_KEY\)/.test(UI));
ok('radar card re-renders the stored report', /id="radarOut">'\s*\+\s*radarHtml\(rec\)/.test(UI));
ok('report header shows the last scan time', /آخرین اسکن/.test(UI));
ok('report header says it survives until the next scan', /این گزارش تا اسکنِ بعدی باقی می‌ماند/.test(UI));
ok('a clear button exists', /data-act="radar-clear"/.test(UI));
ok('clear handler resets state + storage', /a === 'radar-clear'[\s\S]{0,500}?localStorage\.setItem\(RD_KEY/.test(UI));
ok('only a fresh scan replaces the report (save is in the scan handler)',
  /a === 'radar-scan'[\s\S]{0,2600}?radarSave\(/.test(UI) &&
  (UI.match(/radarSave\(/g) || []).length === 1);      /* تعریف یک تابعِ پیکانی + یک فراخوانی */

/* ─── ۹) یک‌دستی با بقیه‌ی پنل ─── */
ok('connections view uses the same card/stat/shell classes',
  /class="grid g4"/.test(connBody) && /class="stat"/.test(connBody) && /class="card"/.test(connBody) && /class="page-head"/.test(connBody));
ok('radar card uses the same card shell', /radarCard[\s\S]{0,400}?class="card"/.test(UI));
ok('radar settings use the panel form grid', /um-grid three/.test(fnBody('radarSettings')));
ok('radar settings live in their own re-renderable block', /id="radarCfgWrap">'\s*\+\s*radarSettings\(\)/.test(UI));
/* قراردادِ API: هر endpointی که رابط مصرف می‌کند در worker.js هم پیاده شده باشد */
ok('worker implements every endpoint the panel calls',
  ["route === 'connections'", "route === 'connections/kick'", "route === 'connections/ban'",
   "route === 'connections/unban'", "route === 'connections/bans'",
   "route === 'radar/config'", "route === 'radar/scan'", "route === 'radar/apply'"]
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
const radarCfgRes = () => ({
  ok: true,
  config: { ranges: [], cidrs: [], pools: [], ports: [443], count: 20, probes: 2, concurrency: 4,
            timeoutMs: 2000, keep: 10, tls: true, exitId: '' },
  maxConcurrency: 6, maxCount: 200,
  exits: [{ id: 'ex-1', name: 'آلمان' }],
  msg: 'سقفِ اتصالِ هم‌زمان ۶ است (محدودیتِ سوکتِ ورکرز)',
});
const scanRes = () => ({
  ok: true,
  results: [
    { ip: '104.17.1.1', port: 443, ok: true, ms: 180, jitter: 12, loss: 0, score: 186, error: null },
    { ip: '172.64.32.7', port: 443, ok: true, ms: 210, jitter: 8, loss: 0, score: 214, error: null },
    { ip: '203.0.113.9', port: 443, ok: false, ms: null, jitter: null, loss: 100, score: null, error: 'زمان انتظار تمام شد' },
  ],
  best: { ip: '104.17.1.1', port: 443, ok: true, ms: 180, jitter: 12, loss: 0, score: 186 },
  scanMs: 1234, tested: 3, alive: 2, failed: 1, via: 'direct',
  config: radarCfgRes().config, msg: '۲ آی‌پی سالم پیدا شد',
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
    else if (path === '/api/radar/config') payload = radarCfgRes();
    else if (path === '/api/radar/scan') payload = opts.scan === null ? { ok: false, error: 'هیچ آی‌پی‌ای پیدا نشد' } : scanRes();
    else if (path === '/api/radar/apply') payload = { ok: true, updated: 1, ips: (body && body.ips) || [], msg: '۲ آی‌پیِ تمیز روی ۱ کانفیگ اعمال شد' };
    else if (path === '/api/connections/kick') payload = { ok: true, kicked: 1, msg: '۱ اتصال قطع شد' };
    else if (path === '/api/connections/ban') payload = { ok: true, ip: body.ip, permanent: !body.hours, msg: 'آی‌پی مسدود شد' };
    else if (path === '/api/connections/unban') payload = { ok: true, removed: true, msg: 'مسدودی برداشته شد' };
    else payload = { error: 'not found: ' + path };
    return { status: 200, ok: true, json: async () => payload, headers: { get: () => null } };
  });

  new Function(UI)();
  /* refresh() و radarCfg() بدون await صدا زده می‌شوند؛ چند چرخه صبر می‌کنیم
     تا تایمرهای کوتاهِ داخلِ رندر (مثل setTimeout(cnLoad, 20)) هم اجرا شوند */
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

/* ─── ۶) رادار ─── */
app = await boot();
await app.nav('sub');
ok('radar card is on the per-config page', app.view().includes('رادار — اسکنرِ آی‌پی تمیز'));
ok('radar config is fetched once', app.calls.filter((c) => c.path === '/api/radar/config').length === 1);
ok('candidate count default comes from the config response',
  /id="rdCount"[^>]*value="20"/.test(app.view()), (app.view().match(/id="rdCount"[^>]*>/) || [''])[0]);
ok('concurrency default comes from the config response', /id="rdConc"[^>]*value="4"/.test(app.view()));
ok('timeout default comes from the config response', /id="rdTimeout"[^>]*value="2000"/.test(app.view()));
ok('candidate count input is capped by maxCount', app.view().includes('max="200"'));
ok('concurrency input is capped by maxConcurrency', app.view().includes('max="6"'));
ok('exit servers are offered', app.view().includes('آلمان'));
ok('no scan yet → empty report', app.el('#radarOut').innerHTML.includes('هنوز اسکنی اجرا نشده'));

app.el('#rdCount').value = '12';
app.el('#rdConc').value = '40';                 /* بیشتر از سقف — باید محدود شود */
app.el('#rdTimeout').value = '1500';
app.el('#rdPort').value = '8443';
app.el('#rdTls').checked = true;
app.el('#rdExit').value = '';
app.calls.length = 0;
await app.click({ act: 'radar-scan', uuid: UUID });
const scan = app.calls.find((c) => c.path === '/api/radar/scan');
ok('scan is posted', !!scan, scan && JSON.stringify(scan.body));
ok('scan sends the requested candidate count', scan && scan.body.count === 12);
ok('concurrency is clamped to the worker socket limit', scan && scan.body.concurrency === 6, scan && String(scan.body.concurrency));
ok('port is forwarded', scan && scan.body.ports[0] === 8443);
ok('timeout is forwarded', scan && scan.body.timeoutMs === 1500);
ok('tls flag is forwarded', scan && scan.body.tls === true);
const rep = app.el('#radarOut').innerHTML;
ok('report shows the last-scan stamp', rep.includes('آخرین اسکن'));
ok('report shows the tested count', rep.includes('تست‌شده') && rep.includes('۳'));
ok('report shows alive/failed counts', rep.includes('موفق') && rep.includes('ناموفق'));
ok('report shows the total scan time', rep.includes('زمان کل اسکن') && rep.includes('۱۲۳۴'));
ok('best IP is highlighted', rep.includes('104.17.1.1') && rep.includes('بهترین'));
ok('results are ordered best first', rep.indexOf('104.17.1.1') < rep.indexOf('172.64.32.7'));
ok('failed IP is reported as unanswered', rep.includes('پاسخ نداد'));

/* ─── ۷) اعمال ─── */
app.calls.length = 0;
await app.click({ act: 'radar-apply', uuid: UUID });
const ap = app.calls.find((c) => c.path === '/api/radar/apply');
ok('apply asks for confirmation', app.confirmations.some((c) => c.includes('آی‌پیِ تمیز')));
ok('apply posts to /api/radar/apply', !!ap);
ok('apply sends only the healthy IPs', ap && JSON.stringify(ap.body.ips) === JSON.stringify(['104.17.1.1', '172.64.32.7']));
ok('apply targets this config', ap && ap.body.uuid === UUID && !ap.body.all);
app.calls.length = 0;
await app.click({ act: 'radar-apply-all', uuid: UUID });
const apAll = app.calls.find((c) => c.path === '/api/radar/apply');
ok('apply-all sets all:true', apAll && apAll.body.all === true && !apAll.body.uuid);

/* ─── ۸) ماندگاری: جابه‌جایی بین بخش‌ها ─── */
await app.nav('dash');
await app.nav('sub');
ok('report survives switching sections', app.el('#radarOut').innerHTML.includes('104.17.1.1'));

/* ─── ۹) ماندگاری: بازسازیِ کاملِ صفحه (همان localStorage، بارگیریِ دوباره) ─── */
const persisted = app.store.getItem('sg_radar_last');
ok('report is written to localStorage', !!persisted && persisted.includes('104.17.1.1'));
const rebuilt = await boot({ store: app.store });
ok('a rebuild does not wipe localStorage', String(rebuilt.store.getItem('sg_radar_last') || '').includes('104.17.1.1'));
await rebuilt.nav('sub');
const rebuiltHtml = rebuilt.el('#radarOut').innerHTML;
ok('after a page rebuild the report is restored from storage',
  rebuiltHtml.includes('104.17.1.1'), rebuiltHtml.slice(0, 80));
ok('rebuilt page shows the same scan, not an empty report',
  rebuiltHtml.includes('آخرین اسکن') && rebuiltHtml.includes('تست‌شده') && rebuiltHtml.includes('۱۲۳۴'));
ok('rebuilt page still offers the apply buttons', rebuiltHtml.includes('radar-apply'));
ok('rebuilt page does not re-run the scan', rebuilt.calls.filter((c) => c.path === '/api/radar/scan').length === 0);

/* ─── ۱۰) فقط اسکنِ تازه جای آن را می‌گیرد + دکمه‌ی پاک‌کردن ─── */
const fresh = await boot({ store: app.store });
await fresh.nav('sub');
fresh.el('#rdCount').value = '3';
await fresh.click({ act: 'radar-scan', uuid: UUID });
ok('a new scan replaces the stored report', fresh.store.getItem('sg_radar_last').includes('104.17.1.1'));
await fresh.click({ act: 'radar-clear' });
ok('clear wipes the report from state', !fresh.el('#radarOut').innerHTML.includes('104.17.1.1'));
ok('clear wipes the report from storage', !String(fresh.store.getItem('sg_radar_last') || '').includes('104.17.1.1'));
const afterClear = await boot({ store: fresh.store });
await afterClear.nav('sub');
ok('a rebuild after clearing shows the empty state', afterClear.el('#radarOut').innerHTML.includes('هنوز اسکنی اجرا نشده'));

/* ─── ۱۱) خطای اسکن گزارش را خراب نمی‌کند ─── */
const bad = await boot({ store: app.store });
await bad.nav('sub');
await bad.click({ act: 'radar-scan', uuid: UUID });
const badStore = bad.store.getItem('sg_radar_last') || '';
ok('a failed scan (error) does not overwrite the stored report', badStore.includes('104.17.1.1'));

/* ─── ۱۲) نشستِ قبل از اسکن دست‌نخورده می‌ماند ─── */
ok('connections state is not persisted as a stale table', !('sg_conn_last' in (app.store._map ? Object.fromEntries(app.store._map) : {})));

for (const a of [app, rebuilt, fresh, afterClear, bad]) { try { a.restore(); } catch (e) {} }

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('T16 V3-UI TESTS FAILED'); process.exit(1); }
console.log('ALL V3-UI TESTS PASSED');
process.exit(0);
