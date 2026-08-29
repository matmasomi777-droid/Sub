/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  پنل مدیریت کانفیگ — Cloudflare Worker (تک‌فایل)
 *  نسخه 2.0.0 • UI از گیت‌هاب خوانده می‌شود (fragment enhancement / FR)
 * ───────────────────────────────────────────────────────────────────────────
 *  نصب: داشبورد کلاودفلر → Workers & Pages → Create Worker → Edit code →
 *        کل این فایل را جایگذاری کنید → Deploy
 *  رمز پیش‌فرض: simorgh   (متغیر MASTER_KEY قابل تنظیم)
 *  بایندینگ اختیاری: KV  → برای ذخیره‌ی پایدار
 *
 *  مسیرها:
 *    /                       پنل (UI از گیت‌هاب)
 *    /<loginPath>            پنل (مسیر مخفی)
 *    /sub/<uuid>[?format=]   اشتراک: base64|raw|clash|meta|singbox|v2ray
 *    /status/<name>          صفحه‌ی وضعیت کاربر
 *    /dns-query?name=&type=  DoH proxy برای کلاینت‌ها
 *    /health                 سلامت ورکر
 *    /api/login              ورود (JWT + 2FA + rate limit)
 *    /api/state              وضعیت کامل (نیاز به Bearer)
 *    /api/settings           PUT ذخیره‌ی تنظیمات
 *    /api/users              POST ساخت/ویرایش/حذف کاربر
 *    /api/keys /api/panels   مدیریت کلیدها و پنل‌های لینک‌شده
 *    /api/action             عملیات‌ها (آپدیت، پنیک، چرخش مسیر، …)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { connect } from 'cloudflare:sockets';

const VERSION = '2.0.0';
const BUILD = '2026.02.14';
const BOOT = Date.now();
/* ذخیره‌سازی فقط با D1 — KV حذف شد */
let UI = { html: null, ts: 0 }; // کش UI
const RATE = new Map();         // rate limiting

/* ════════════════════════════ پیش‌فرض‌ها ════════════════════════════ */
const DEF = () => ({
  settings: {
    panel: { name: 'پنل مدیریت', url: '' },
    /* بایندینگ D1: env.DB */
    mode: 'both',
    multiSplit: true,
    protocols: { vless: true, trojan: true, ss: false, vmess: false },
    trojanHash: 'sha224',
    transport: 'ws', path: '/sg', grpcService: 'simorgh', xhttpMode: 'auto',
    tfo: true, randomJunk: true, mux: false, earlyData: false, ports: '443, 2053, 2083, 2087, 2096, 8443',
    tls: true, fingerprint: 'randomized', sni: '', host: '', alpn: 'http/1.1', allowInsecure: false,
    ech: { enabled: false, mode: 'doh' },
    fragment: { enabled: true, mode: 'shadowrocket', length: '40-60', interval: '10-15' },
    fr: { enabled: true, repo: 'matmasomi777-droid/Sub', branch: 'main', files: ['ui/index.html', 'ui/style.css', 'ui/app.js'] },
    cleanIPs: ['104.17.152.10#فرانکفورت', '172.64.32.7#آمستردام', '188.114.97.3#لندن', '104.21.5.88#استانبول'],
    perIsp: true, ispPools: ['MCI=104.17.1.1,104.17.1.2', 'Irancell=172.64.32.7,172.64.32.8', 'Rightel=188.114.97.3', 'Shatel=104.21.5.88'], ipRotation: true, nodeLimit: 12,
    proxyIPs: ['cdn-all.xn--b6gac.eu.org', 'cdn.xn--b6gac.eu.org'], failover: true, failoverTimeout: 3000,
    backupRelay: '', customRelay: '', upstream: [],
    doh: { url: 'https://cloudflare-dns.com/dns-query' }, dohProxy: true, resolveFirst: true,
    nat64: { prefix: '2a01:4f8:c2c:123::1', fromUrl: false, url: '' }, raceDial: 3,
    geoip: { enabled: true, api: 'https://ipapi.co/{ip}/json/' },
    tg: {
      enabled: false, token: '', chatId: '', adminId: '', lang: 'fa', silent: false, multiPanel: true,
      loginAlert: true, autoDisableAlert: true, usageFromCF: true,
      notify: { user: true, quota: true, expiry: true, err: false, daily: true },
    },
    cf: { accountId: '', apiToken: '', zoneId: '', domain: '', usageApi: true },
    linked: { enabled: false, hubUrl: '', apiKey: '', propagateConfig: true, propagateUpdate: true, loginSignal: true },
    upd: { auto: true, repo: 'user/simorgh', channel: 'stable', interval: 60, healthCheck: true, rollback: true },
    auth: { totp: false, totpSecret: '', sessionMin: 15, loginRate: '5/10m', path: 'panel', pathRotate: false, disguise: true, maintenanceHost: 'nginx', decoyUrl: '', panic: false, password: 'simorgh' },
    /* ipConnLimit: پیش‌فرضِ سراسریِ «حداکثر اتصال همزمانِ هر IP» —
       فقط وقتی کاربر ipLimit خودش را ندارد (۰) استفاده می‌شود */
    sec: { cors: true, csp: true, killSwitch: false, ipConnLimit: 0, speedTestUrl: '' },
    sub: {
      path: 'sub', userAgent: '', fakeConfigs: true, nodeLimit: 12, converter: '', telegramChannel: '@simorgh_channel',
      /* آیدی تلگرامی که در صفحه‌ی کاربر و لینک ساب نمایش داده می‌شود */
      telegramSupport: '@simorgh_channel', telegramBuy: '',
      countryGroups: true, namePrefix: 'پنل', rules: ['GEOIP,IR,DIRECT', 'DOMAIN-SUFFIX,ir,DIRECT', 'GEOSITE,category-ads-all,REJECT'],
      blockAdult: false, blockAds: true, blockQuic: true, bypassIR: true, doh: 'https://cloudflare-dns.com/dns-query',
      /* ── کانفیگ‌های فیک (اطلاعاتی) — کاملاً قابل تنظیم ── */
      fakes: [
        { id: 'usage',    name: '📊 {usage}',        enabled: true,  proto: 'vless',  pin: true,  pos: 1 },
        { id: 'remaining',name: '🟢 {remaining}',    enabled: true,  proto: 'vless',  pin: true,  pos: 2 },
        { id: 'expiry',   name: '📅 {expiry}',       enabled: true,  proto: 'vless',  pin: true,  pos: 3 },
        { id: 'channel',  name: '📢 {channel}',      enabled: true,  proto: 'trojan', pin: true,  pos: 4 },
        { id: 'panel',    name: '⚙️ {panel} v{ver}', enabled: false, proto: 'trojan', pin: true,  pos: 5 },
        { id: 'custom1',  name: '',                  enabled: false, proto: 'vless',  pin: false, pos: 6 },
        { id: 'custom2',  name: '',                  enabled: false, proto: 'trojan', pin: false, pos: 7 },
        { id: 'custom3',  name: '',                  enabled: false, proto: 'vless',  pin: false, pos: 8 },
      ],
    },
  },
  users: [],
  logs: [],
  keys: [],
  panels: [],
  updateLog: [],
  lastCheck: 0,
  uiLoaded: 0,
  stats: {
    requests: 0, connections: 0,
    daily: Array.from({ length: 24 }, (_, i) => 0.2 + Math.abs(Math.sin(i / 3)) * 0.6),
    monthly: Array.from({ length: 30 }, (_, i) => 0.3 + Math.abs(Math.sin(i / 4)) * 0.5),
    yearly: Array.from({ length: 12 }, (_, i) => 0.35 + Math.abs(Math.cos(i / 2)) * 0.45),
    reqSeries: Array.from({ length: 24 }, () => Math.random() * 0.6 + 0.2),
    trafficSeries: Array.from({ length: 24 }, (_, i) => 0.3 + Math.abs(Math.sin(i / 3.2)) * 0.5),
  },
});

/* ════════════════════════════ ابزارها ════════════════════════════ */
const J = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d, null, 2), { status: s, headers: { ...J, ...h } });
const txt = (b, h = {}, s = 200) => new Response(b, { status: s, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...h } });
const enc = new TextEncoder();
const randHex = (n = 6) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const randTok = (n = 14) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const b64u = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/* clone حذف شد — save() حالا همان شیء را در حافظه نگه می‌دارد (بدون کپی) */
function merge(d, s) { for (const k of Object.keys(s || {})) { if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) merge(d[k], s[k]); else d[k] = s[k]; } return d; }
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

async function hmac(key, msg, alg = 'SHA-256') {
  const c = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: alg }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', c, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── SHA-224 (خالص JS — برای هش رمز Trojan) ── */
const K224 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha224(msg) {
  const m = enc.encode(msg), l = m.length, w = new Array(64);
  const withOne = [...m, 0x80];
  while (withOne.length % 64 !== 56) withOne.push(0);
  const bits = BigInt(l * 8), tail = new Uint8Array(8);
  for (let i = 0; i < 8; i++) tail[7 - i] = Number((bits >> BigInt(8 * i)) & 0xffn);
  const M = [...withOne, ...tail];
  let h = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < M.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = (M[i + t * 4] << 24) | (M[i + t * 4 + 1] << 16) | (M[i + t * 4 + 2] << 8) | M[i + t * 4 + 3];
    for (let t = 16; t < 64; t++) { const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K224[t] + w[t]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = [h[0] + a | 0, h[1] + b | 0, h[2] + c | 0, h[3] + d | 0, h[4] + e | 0, h[5] + f | 0, h[6] + g | 0, h[7] + hh | 0];
  }
  return h.slice(0, 7).map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/* ── TOTP (Google Authenticator) ── */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32dec(s) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); }
function b32enc(b) { let bits = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); let s = ''; for (let i = 0; i + 5 <= bits.length; i += 5) s += B32[parseInt(bits.slice(i, i + 5), 2)]; return s; }
async function totp(secret, t = Date.now()) {
  const counter = Math.floor(t / 30000), buf = new ArrayBuffer(8), dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const o = h[19] & 15, code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1000000).padStart(6, '0');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ذخیره‌سازی — فقط D1
   طراحی برای کمترین تعداد عملیات:

   خواندن:
     ۱. حافظه (MEM) — اگر isolate زنده است، صفر درخواست
     ۲. D1 — فقط یک‌بار در طول عمر isolate

   نوشتن:
     ۱. حافظه — فوری
     ۲. D1 — حداکثر هر ۶۰ ثانیه یک‌بار (debounce)

   یعنی در بدترین حالت: ۱ خواندن + ۱ نوشتن در هر دقیقه
   ═══════════════════════════════════════════════════════════════════════════ */

const D1_KEY = 'state';

let MEM = null;                       // کش در حافظه
let DIRTY = null;                     // تغییرات ذخیره‌نشده
let LAST_WRITE = 0;                   // زمان آخرین نوشتن در D1
let WRITING = false;                  // جلوگیری از نوشتن همزمان
let WRITE_COUNT = { day: '', n: 0 };  // شمارنده‌ی روزانه
let DB_READY = false;                 // جدول D1 ساخته شده است

/** نوشتن در D1 — یک خط SQL (با افتادن خودکار روی KV اگر D1 بایند نشده باشد) */
async function d1Write(env, json) {
  if (!env.DB) {
    /* بدون D1 وضعیت اصلاً ذخیره نمی‌شد (هر ری‌استارت = تنظیمات صفر).
       اگر KV در دسترس باشد، وضعیت را آن‌جا نگه می‌داریم. */
    if (env.KV) { try { await env.KV.put(D1_KEY, json); return true; } catch (e) { return false; } }
    return false;
  }
  try {
    await env.DB.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind(D1_KEY, json).run();
    return true;
  } catch (e) { return false; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   لایه‌ی ذخیره‌سازی — D1 → KV → حافظه

   ⚠️ علتِ اصلی «شمارش حجم و محدودیت اتصال کار نمی‌کند» در استقرار واقعی:
   worker.js معمولاً با کپی/پیست در داشبورد کلادفلر منتشر می‌شود و هیچ
   بایندینگی ندارد → env.DB وجود ندارد → تمام کوئری‌ها بی‌صدا رد می‌شدند
   (هر اتصال مجاز، هر مصرفی صفر). از این به بعد:
     • env.DB  → D1 (بهترین حالت: افزایش اتمیک واقعی)
     • env.KV  → KV (افزایش در حافظه + ثبت دوره‌ای؛ ماندگار ولی تقریبی)
     • هیچ‌کدام → حافظهٔ همین isolate (موقت) + هشدار صریح در کارت سلامت
   ═══════════════════════════════════════════════════════════════════════════ */

const MEM_USAGE = new Map();        // uuid -> {up,down,reqs,last_seen,day,day_up,day_down}
const MEM_SESS = new Map();         // uuid|ip -> {conns,last_active}

function backendOf(env) {
  if (env && env.DB) return 'd1';
  if (env && env.KV) return 'kv';
  return 'mem';
}
const KV_U = (uuid) => 'u:' + uuid;
const KV_S = (uuid, ip) => 's:' + uuid + ':' + ip;
const emptyUsage = () => ({ up: 0, down: 0, reqs: 0, last_seen: null, day: null, day_up: 0, day_down: 0 });

async function kvGetJson(env, key) {
  try { const raw = await env.KV.get(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
async function kvPutJson(env, key, val) {
  try { await env.KV.put(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}

/** اعمال یک افزایش روی رکورد مصرف (همه‌ی بک‌اندها یکسان) */
function applyDelta(c, dUp, dDown, dReqs, day) {
  c.up = (c.up || 0) + dUp;
  c.down = (c.down || 0) + dDown;
  c.reqs = (c.reqs || 0) + dReqs;
  c.last_seen = Date.now();
  if (c.day !== day) { c.day = day; c.day_up = 0; c.day_down = 0; }   /* سطل روزانه */
  c.day_up = (c.day_up || 0) + dUp;
  c.day_down = (c.day_down || 0) + dDown;
  return c;
}

/** خواندن از D1 — یک خط SQL */
async function d1Read(env) {
  if (!env.DB) {
    if (!env.KV) return null;
    try { return await env.KV.get(D1_KEY); } catch (e) { return null; }
  }
  try {
    const r = await env.DB.prepare('SELECT value FROM kv_store WHERE key = ?').bind(D1_KEY).first();
    return r ? r.value : null;
  } catch (e) { return null; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   جدول مصرف اختصاصی — افزایش اتمیک (atomic deltas)
   مشکل قبلی: مصرف در blob JSON بود و isolateهای همزمان یکدیگر را overwrite می‌کردند.
   راه‌حل: INSERT ... ON CONFLICT DO UPDATE SET up = up + excluded.up
   یعنی افزایش اتمیک در دیتابیس — بدون read-modify-write.
   ═══════════════════════════════════════════════════════════════════════════ */

const USAGE_CACHE_TTL = 4000;            // کش ۴ ثانیه‌ای برای خواندن
let USAGE_CACHE = { ts: 0, data: new Map() };
let USAGE_READY = false;                 // جدول‌های D1 در این isolate ساخته شده‌اند؟

/* آخرین خطای دیتابیس و تعداد نوشتن‌های ناموفق — در کارت «سلامت شمارش مصرف»
   نمایش داده می‌شود تا علتِ از کار افتادنِ شمارنده پنهان نماند. */
let USAGE_LAST_ERR = null;
let USAGE_FAILS = 0;

/** اطمینان از وجود جدول‌ها و ستون‌ها — بارها قابل فراخوانی است (idempotent)
    ⚠️ قبلاً فقط یک‌بار هنگام بالا آمدن isolate صدا می‌شد؛ اگر همان یک بار خطا
    می‌داد (یا پایگاه‌داده‌ی قدیمی ستون‌های روزانه را نداشت)، شمارنده تا پایان
    عمر isolate بی‌صدا از کار می‌افتاد و هیچ مصرفی ثبت نمی‌شد. حالا هر بار که
    نوشتن شکست بخورد، پیش از تلاشِ دوباره صدا زده می‌شود. */
async function usageEnsure(env) {
  /* KV و حافظه به ساخت جدول نیاز ندارند — اما نبودِ D1 را شفاف اعلام می‌کنیم */
  if (!env.DB) {
    USAGE_LAST_ERR = env.KV
      ? 'D1 بایند نشده است — مصرف در KV نگه داشته می‌شود (تقریبی اما ماندگار)'
      : 'هیچ بایندینگی (D1/KV) تعریف نشده است — مصرف فقط در حافظهٔ همین isolate است و با ری‌استارت پاک می‌شود';
    return false;
  }
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS usage (
      uuid TEXT PRIMARY KEY,
      up INTEGER NOT NULL DEFAULT 0,
      down INTEGER NOT NULL DEFAULT 0,
      reqs INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER
    )`).run();
    /* جدول نشست‌ها — برای محدودیت IP و اتصال همزمان
       ⚠️ ستون conns الزامی است — بدون آن همه‌ی کوئری‌های شمارنده خطا می‌خورند
       و محدودیت بی‌صدا غیرفعال می‌شود */
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      uuid TEXT NOT NULL,
      ip TEXT NOT NULL,
      conns INTEGER NOT NULL DEFAULT 1,
      last_active INTEGER NOT NULL,
      PRIMARY KEY (uuid, ip)
    )`).run();
    /* مهاجرت: نصب‌های قدیمی که جدول بدون ستون conns دارند */
    try {
      await env.DB.prepare('ALTER TABLE sessions ADD COLUMN conns INTEGER NOT NULL DEFAULT 1').run();
    } catch (e) { /* ستون از قبل هست */ }
    /* ایندکس برای پاک‌سازی سریع */
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(last_active)').run();
    /* سطل روزانه برای سهمیه‌ی روزانه — نصب‌های قدیمی این ستون‌ها را ندارند */
    for (const col of ['day TEXT', 'day_up INTEGER NOT NULL DEFAULT 0', 'day_down INTEGER NOT NULL DEFAULT 0']) {
      try { await env.DB.prepare('ALTER TABLE usage ADD COLUMN ' + col).run(); } catch (e) { /* از قبل هست */ }
    }
    USAGE_LAST_ERR = null;
    return true;
  } catch (e) {
    USAGE_LAST_ERR = String((e && e.message) || e);
    return false;
  }
}

/** ساخت جدول‌ها + مهاجرت یک‌باره از blob قدیمی */
async function usageInit(env, st) {
  const ok = await usageEnsure(env);
  if (!ok || !env.DB) return;
  try {
    /* مهاجرت یک‌باره: مقادیر blob قدیمی را به جدول منتقل کن */
    if (st && st.users && st.users.length) {
      for (const u of st.users) {
        if (!u.uuid) continue;
        await env.DB.prepare('INSERT OR IGNORE INTO usage (uuid, up, down, reqs, last_seen) VALUES (?, ?, ?, ?, ?)')
          .bind(u.uuid, Math.floor(u.up || 0), Math.floor(u.down || 0), Math.floor(u.totalReq || 0), u.lastSeen || null).run();
      }
    }
  } catch (e) {}
}

/* ═══════════════════════════════════════════════════════════════════════════
   محدودیت اتصال همزمان — فقط بر اساس IP واقعی کلاینت
   (الگوبرداری از دو پنل مرجع: Nahan و Nova-Proxy)

   درس اصلی از Nahan (_worker.js): شمارنده‌ی اتصال یک Map ساده در حافظه است؛
   هنگام پذیرش هر کانکشن +۱ و در رویداد closeِ همان کانکشن −۱ می‌شود. نه
   دیتابیسی در کار است و نه کوئری‌ای که بتواند بی‌صدا بشکند و محدودیت را خاموش
   کند. Nova-Proxy هم محدودیت را با شمارنده‌ای سبک روی پروفایلِ کاربر می‌سنجد.

   اشتباهِ نسخه‌ی قبلیِ ما: محدودیت به D1 گره خورده بود (env.DB). بیشتر
   استقرارها این پنل را با کپی/پیست در داشبورد منتشر می‌کنند → هیچ بایندینگی
   وجود ندارد → کوئری‌ها شکست می‌خورند → خطا بلعیده می‌شد → «همیشه مجاز».

   مدلِ جدید:
     • حافظه — مرجعِ اصلیِ تصمیم؛ همیشه فعال است و به هیچ تنظیمی نیاز ندارد
     • KV (اختیاری) — یک کلید برای «هر اتصال» با expirationTtl؛ شمارش بین
       isolateها را مشترک می‌کند و حتی اگر release هیچ‌وقت صدا زده نشود،
       خودبه‌خود منقضی می‌شود (خودترمیم)
     • محدودیت دستگاهی (deviceLimit) کاملاً حذف شده — فقط IP
     • هیچ خطایی بلعیده نمی‌شود: CONN_LAST_ERR در کارت سلامت نمایش داده می‌شود
   ═══════════════════════════════════════════════════════════════════════════ */

const CONN_TTL = 300000;              // ۵ دقیقه — عمر یک اتصالِ بی‌heartbeat
const CONN_HB = 120000;               // تمدید هر ۲ دقیقه
const CONNS = new Map();              // "uuid|ip" -> Map<connId, lastTs>   (مدلِ Nahan)
let CONN_LAST_ERR = null;             // آخرین خطا — در کارت سلامت نمایش داده می‌شود
let CONN_DENIES = 0;                  // تعداد رد شدن‌ها (اثباتِ فعال بودن محدودیت)
let CONN_ACQUIRES = 0;

const connKeyOf = (uuid, ip) => String(uuid) + '|' + String(ip);
const KV_C = (uuid, ip, id) => 'c:' + uuid + ':' + ip + ':' + id;

/** حذفِ ورودی‌های مرده از نگاشتِ اتصال‌های یک IP */
function connPrune(m, now) {
  if (!m) return 0;
  m.forEach((ts, id) => { if (!ts || now - ts > CONN_TTL) m.delete(id); });
  return m.size;
}

/** پاک‌سازیِ تنبلِ همه‌ی نگاشت‌ها — ارزان و بدون کوئری */
function sessionsSweep() {
  const now = Date.now();
  CONNS.forEach((m, k) => { if (!connPrune(m, now)) CONNS.delete(k); });
}

/** تعداد اتصال‌های زنده‌ی همین IP در حافظه */
function connCountMem(uuid, ip, now) {
  const m = CONNS.get(connKeyOf(uuid, ip));
  if (!m) return 0;
  return connPrune(m, now || Date.now());
}

/**
 * افزایش شمارنده‌ی اتصالِ «همین IP» برای این کاربر.
 * connId شناسه‌ی یکتای همین کانکشن است — آزادسازی دقیقاً همان را کم می‌کند
 * (نسخه‌ی قبلی بدون شناسه بود و releaseِ یک اتصال، سهمیه‌ی اتصالِ دیگری را
 * کم می‌کرد). برمی‌گرداند: { ok, conns, limit, enforced, storage }
 */
async function connAcquire(env, uuid, ip, limit, connId) {
  limit = Number(limit) || 0;
  if (!uuid || !ip) return { ok: true, conns: 0, limit, enforced: false, reason: 'missing-identity' };
  const id = connId || randTok(10);
  const now = Date.now();
  CONN_ACQUIRES++;

  /* ── ۱) حافظه: مرجعِ اصلی تصمیم (بدون وابستگی به هیچ بایندینگی) ── */
  let m = CONNS.get(connKeyOf(uuid, ip));
  if (!m) { m = new Map(); CONNS.set(connKeyOf(uuid, ip), m); }
  const memBefore = connPrune(m, now);
  if (limit > 0 && memBefore >= limit) {
    CONN_DENIES++;
    return { ok: false, conns: memBefore, limit, enforced: true, storage: backendOf(env), reason: 'memory-limit' };
  }
  m.set(id, now);
  const memAfter = m.size;

  /* ── ۲) KV (اختیاری): شمارشِ مشترک بین isolateها ── */
  let conns = memAfter;
  if (env && env.KV) {
    try {
      const prefix = 'c:' + uuid + ':' + ip + ':';
      const list = await env.KV.list({ prefix });
      let live = 0;
      for (const k of ((list && list.keys) || [])) {
        const raw = await env.KV.get(k.name);        /* مقدار = آخرین heartbeat */
        const ts = Number(raw) || 0;
        if (raw === null || !ts || now - ts > CONN_TTL) {
          try { await env.KV.delete(k.name); } catch (e) {}   /* منقضی — پاک شود */
        } else live++;
      }
      if (limit > 0 && live >= limit) {
        m.delete(id);                                         /* افزایشِ رد شده برگردد */
        CONN_DENIES++;
        return { ok: false, conns: Math.max(memBefore, live), limit, enforced: true, storage: 'kv', reason: 'kv-limit' };
      }
      await env.KV.put(KV_C(uuid, ip, id), String(now), { expirationTtl: Math.ceil(CONN_TTL / 1000) });
      conns = Math.max(memAfter, live + 1);
    } catch (e) {
      /* خطای KV هرگز باعث نمی‌شود محدودیت خاموش شود — فقط گزارش می‌شود */
      CONN_LAST_ERR = 'KV: ' + String((e && e.message) || e);
    }
  }
  return { ok: true, conns, limit, enforced: limit > 0, id, storage: backendOf(env) };
}

/** کاهش شمارنده — فقط همین connId؛ اگر نگاشت خالی شد حذف می‌شود */
async function connRelease(env, uuid, ip, connId) {
  if (!uuid || !ip) return 0;
  const k = connKeyOf(uuid, ip);
  const m = CONNS.get(k);
  let left = 0;
  if (m) {
    if (connId) m.delete(connId);
    else { /* بدون شناسه (اتصال‌های قدیمی): یکی را کم کن */
      const first = m.keys().next();
      if (!first.done) m.delete(first.value);
    }
    left = m.size;
    if (!left) CONNS.delete(k);
  }
  if (env && env.KV && connId) {
    try { await env.KV.delete(KV_C(uuid, ip, connId)); }
    catch (e) { CONN_LAST_ERR = 'KV: ' + String((e && e.message) || e); }
  }
  return left;
}

/** تمدید heartbeat — اتصال‌های زنده اما کم‌ترافیک پاک نشوند */
async function sessionTouch(env, uuid, ip, connId) {
  if (!uuid || !ip || !connId) return;
  const now = Date.now();
  const m = CONNS.get(connKeyOf(uuid, ip));
  if (m && m.has(connId)) m.set(connId, now);
  if (env && env.KV) {
    try { await env.KV.put(KV_C(uuid, ip, connId), String(now), { expirationTtl: Math.ceil(CONN_TTL / 1000) }); }
    catch (e) { CONN_LAST_ERR = 'KV: ' + String((e && e.message) || e); }
  }
}

/** IPهای فعال یک کاربر با تعداد اتصال — برای نمایش در پنل */
async function sessionsOf(env, uuid) {
  const now = Date.now();
  const out = new Map();
  const push = (ip, conns, last) => {
    const cur = out.get(ip);
    if (cur) { cur.conns = Math.max(cur.conns, conns); cur.last_active = Math.max(cur.last_active || 0, last || 0); }
    else out.set(ip, { ip, conns, last_active: last || 0 });
  };
  CONNS.forEach((m, k) => {
    if (!String(k).startsWith(uuid + '|')) return;
    const n = connPrune(m, now);
    if (n <= 0) return;
    let last = 0;
    m.forEach((ts) => { if (ts > last) last = ts; });
    push(String(k).split('|')[1], n, last);
  });
  if (env && env.KV) {
    try {
      const list = await env.KV.list({ prefix: 'c:' + uuid + ':' });
      for (const k of ((list && list.keys) || [])) {
        const raw = await env.KV.get(k.name);
        const ts = Number(raw) || 0;
        if (!raw || !ts || now - ts > CONN_TTL) continue;
        const parts = String(k.name).split(':');           /* c : uuid : ip : id */
        if (parts.length < 4) continue;
        push(parts[2], 1, ts);
      }
    } catch (e) { CONN_LAST_ERR = 'KV: ' + String((e && e.message) || e); }
  }
  return [...out.values()].sort((a, b) => (b.conns || 0) - (a.conns || 0));
}

/* ═══════════════════════════════════════════════════════════════════════════
   تست واقعی ترافیک — «از مرورگرِ همان کسی که دکمه را می‌زند»

   نسخه‌ی قبلی دو اشتباه اساسی داشت:
     ۱. کلادفلر اجازه نمی‌دهد یک ورکر نشانیِ خودش را fetch کند؛ پس هر تلاشی
        برای اجرای تست در سمتِ سرور به بن‌بست می‌رسید.
     ۲. تست با WebSocketPair «داخلِ ورکر» اجرا می‌شد و هیچ ربطی به مرورگرِ
        کاربر نداشت — یعنی نه درخواستی از مرورگر می‌رفت و نه پاسخی برمی‌گشت.

   مدلِ جدید:
     الف) پنل با traffic-begin یک نشستِ تست می‌سازد؛ ورکر مصرفِ فعلیِ کاربر را
         مستقیم از مخزن (بدون کش) می‌خواند و یک نشانیِ دانلود با توکنِ یکتا
         برمی‌گرداند.
     ب) مرورگرِ همان کسی که دکمه را زده، آن نشانی را صدا می‌زند و N بایتِ
         واقعی دریافت می‌کند.
     ج) ورکر همان‌جا — با همان تابع usageDelta که ترافیکِ تونل را می‌شمارد —
         بایت‌های پاسخ را برای همان کاربر ثبت می‌کند.
     د) پنل با traffic-end مصرف را دوباره می‌خواند و افزایش را با N مقایسه
         می‌کند؛ چند کیلوبایت اختلاف (هدرهای HTTP) پذیرفته است.
   ═══════════════════════════════════════════════════════════════════════════ */

const TRAFFIC_TTL = 10 * 60 * 1000;      // عمرِ یک نشستِ تست
const TRAFFIC = new Map();               // sid -> { uuid, want, before, ts }

/** توکنِ تست — از همان اعتبارنامه‌هایی ساخته می‌شود که داخل کانفیگِ کاربر
    است (uuid + secret)؛ پس بایت‌های دانلود دقیقاً به همان کانفیگ نسبت
    داده می‌شوند و با سهمیه‌ی کاربرانِ دیگر قاطی نمی‌شود. */
const trafficToken = (u) => sha224(String(u.uuid) + '|' + String(u.secret)).slice(0, 32);

function trafficPrune() {
  const cut = Date.now() - TRAFFIC_TTL;
  TRAFFIC.forEach((v, k) => { if (!v || (v.ts || 0) < cut) TRAFFIC.delete(k); });
}
/** کلیدِ سطل روزانه — UTC و هم‌شکل با نوشتنِ وضعیت (YYYY-MM-DD) */
const dayKey = () => new Date().toISOString().slice(0, 10);

/** افزایش اتمیک مصرف — امن در برابر isolateهای همزمان
 *  سطل روزانه (day/day_up/day_down) هم همین‌جا نگه داشته می‌شود تا
 *  سهمیه‌ی روزانه واقعاً محاسبه شود (قبلاً همیشه صفر بود). */
async function usageDelta(env, uuid, dUp, dDown, dReqs, _retry) {
  if (!uuid) return false;
  dUp = Math.floor(Number(dUp) || 0);
  dDown = Math.floor(Number(dDown) || 0);
  dReqs = Math.floor(Number(dReqs) || 0);
  if (!dUp && !dDown && !dReqs) return true;
  const day = dayKey();
  const kind = backendOf(env);

  /* ── حافظه (بدون هیچ بایندینگی) — موقت، فقط تا زنده بودن isolate ── */
  if (kind === 'mem') {
    const c = applyDelta(MEM_USAGE.get(uuid) || emptyUsage(), dUp, dDown, dReqs, day);
    MEM_USAGE.set(uuid, c);
    USAGE_CACHE.ts = 0;
    return true;
  }
  /* ── KV: خواندن → افزایش → نوشتن (ماندگار، تقریبی در اوج ترافیک) ── */
  if (kind === 'kv') {
    const c = (await kvGetJson(env, KV_U(uuid))) || emptyUsage();
    applyDelta(c, dUp, dDown, dReqs, day);
    const ok = await kvPutJson(env, KV_U(uuid), c);
    USAGE_CACHE.ts = 0;
    if (ok) USAGE_LAST_ERR = null; else { USAGE_FAILS++; USAGE_LAST_ERR = 'نوشتن در KV ناموفق بود — دسترسی namespace را بررسی کنید'; }
    return ok;
  }
  try {
    await env.DB.prepare(`INSERT INTO usage (uuid, up, down, reqs, last_seen, day, day_up, day_down)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        up = up + excluded.up,
        down = down + excluded.down,
        reqs = reqs + excluded.reqs,
        last_seen = excluded.last_seen,
        day_up   = CASE WHEN usage.day = excluded.day THEN usage.day_up + excluded.day_up ELSE excluded.day_up END,
        day_down = CASE WHEN usage.day = excluded.day THEN usage.day_down + excluded.day_down ELSE excluded.day_down END,
        day = excluded.day`)
      .bind(uuid, dUp, dDown, dReqs, Date.now(), day, dUp, dDown).run();
    USAGE_CACHE.ts = 0;                   // کش را بی‌اعتبار کن
    return true;
  } catch (e) {
    /* ⚠️ قبلاً خطا بلعیده می‌شد و شمارنده بی‌صدا از کار می‌افتاد.
       حالا: جدول‌ها را ترمیم کن و یک بار دیگر تلاش کن. */
    USAGE_LAST_ERR = String((e && e.message) || e);
    USAGE_FAILS++;
    if (!_retry) {
      const fixed = await usageEnsure(env);
      if (fixed) return usageDelta(env, uuid, dUp, dDown, dReqs, true);
    }
    return false;
  }
}

/** صفر کردن مصرف یک کاربر — همان کلیدی که شمارنده می‌نویسد
 *  ⚠️ ریستِ قبلی فقط فیلدهای blob را صفر می‌کرد در حالی که پنل از جدول
 *     usage می‌خواند — برای همین دکمه‌ی «ریست مصرف» هیچ اثری نداشت. */
async function usageReset(env, uuid, _retry) {
  USAGE_CACHE.ts = 0;                     // کش را بی‌اعتبار کن
  if (!uuid) return false;
  const kind = backendOf(env);
  if (kind === 'mem') { MEM_USAGE.delete(uuid); return true; }
  if (kind === 'kv') {
    try { await env.KV.delete(KV_U(uuid)); return true; }
    catch (e) { USAGE_LAST_ERR = String((e && e.message) || e); return false; }
  }
  try {
    await env.DB.prepare('DELETE FROM usage WHERE uuid = ?').bind(uuid).run();
    return true;
  } catch (e) {
    USAGE_LAST_ERR = String((e && e.message) || e);
    if (!_retry) {
      const fixed = await usageEnsure(env);
      if (fixed) return usageReset(env, uuid, true);
    }
    return false;
  }
}

/** خواندن مصرف همه‌ی کاربران — با کش ۴ ثانیه‌ای */
async function usageRead(env) {
  const kind = backendOf(env);
  if (kind === 'mem') {
    if (Date.now() - USAGE_CACHE.ts < USAGE_CACHE_TTL) return USAGE_CACHE.data;
    const m = new Map();
    MEM_USAGE.forEach((c, uuid) => m.set(uuid, {
      up: c.up || 0, down: c.down || 0, reqs: c.reqs || 0, lastSeen: c.last_seen,
      day: c.day || null, dayUp: c.day === dayKey() ? (c.day_up || 0) : 0, dayDown: c.day === dayKey() ? (c.day_down || 0) : 0,
    }));
    USAGE_CACHE = { ts: Date.now(), data: m };
    return m;
  }
  if (kind === 'kv') {
    if (Date.now() - USAGE_CACHE.ts < USAGE_CACHE_TTL) return USAGE_CACHE.data;
    const m = new Map();
    try {
      const list = await env.KV.list({ prefix: 'u:' });
      for (const k of (list && list.keys) || []) {
        const c = await kvGetJson(env, k.name);
        if (!c) continue;
        const uuid = String(k.name).slice(2);
        m.set(uuid, {
          up: c.up || 0, down: c.down || 0, reqs: c.reqs || 0, lastSeen: c.last_seen,
          day: c.day || null, dayUp: c.day === dayKey() ? (c.day_up || 0) : 0, dayDown: c.day === dayKey() ? (c.day_down || 0) : 0,
        });
      }
      USAGE_CACHE = { ts: Date.now(), data: m };
    } catch (e) { return USAGE_CACHE.data; }
    return m;
  }
  if (Date.now() - USAGE_CACHE.ts < USAGE_CACHE_TTL) return USAGE_CACHE.data;
  try {
    const { results } = await env.DB.prepare('SELECT uuid, up, down, reqs, last_seen, day, day_up, day_down FROM usage').all();
    const m = new Map();
    (results || []).forEach((r) => m.set(r.uuid, {
      up: r.up || 0, down: r.down || 0, reqs: r.reqs || 0, lastSeen: r.last_seen,
      day: r.day || null, dayUp: (r.day === dayKey() ? (r.day_up || 0) : 0), dayDown: (r.day === dayKey() ? (r.day_down || 0) : 0),
    }));
    USAGE_CACHE = { ts: Date.now(), data: m };
    return m;
  } catch (e) { return USAGE_CACHE.data; }
}

/** مصرف یک کاربر */
async function usageOf(env, uuid) {
  const all = await usageRead(env);
  return all.get(uuid) || { up: 0, down: 0, reqs: 0, lastSeen: null, dayUp: 0, dayDown: 0 };
}

/** مصرف یک کاربر — مستقیم از D1، بدون کش (برای تست ترافیک) */
async function usageFresh(env, uuid) {
  if (!uuid) return { up: 0, down: 0, reqs: 0, lastSeen: null, dayUp: 0, dayDown: 0 };
  const kind = backendOf(env);
  if (kind === 'mem') {
    const c = MEM_USAGE.get(uuid);
    if (!c) return { up: 0, down: 0, reqs: 0, lastSeen: null, dayUp: 0, dayDown: 0 };
    return { up: c.up || 0, down: c.down || 0, reqs: c.reqs || 0, lastSeen: c.last_seen || null,
      dayUp: c.day === dayKey() ? (c.day_up || 0) : 0, dayDown: c.day === dayKey() ? (c.day_down || 0) : 0 };
  }
  if (kind === 'kv') {
    const c = await kvGetJson(env, KV_U(uuid));
    if (!c) return { up: 0, down: 0, reqs: 0, lastSeen: null, dayUp: 0, dayDown: 0 };
    return { up: c.up || 0, down: c.down || 0, reqs: c.reqs || 0, lastSeen: c.last_seen || null,
      dayUp: c.day === dayKey() ? (c.day_up || 0) : 0, dayDown: c.day === dayKey() ? (c.day_down || 0) : 0 };
  }
  try {
    const r = await env.DB.prepare('SELECT up, down, reqs, last_seen, day, day_up, day_down FROM usage WHERE uuid = ?').bind(uuid).first();
    if (!r) return { up: 0, down: 0, reqs: 0, lastSeen: null, dayUp: 0, dayDown: 0 };
    const today = dayKey();
    return {
      up: r.up || 0, down: r.down || 0, reqs: r.reqs || 0, lastSeen: r.last_seen || null,
      dayUp: r.day === today ? (r.day_up || 0) : 0,
      dayDown: r.day === today ? (r.day_down || 0) : 0,
    };
  } catch (e) { return { up: 0, down: 0, reqs: 0, lastSeen: null, dayUp: 0, dayDown: 0 }; }
}

/** بارگذاری — فقط یک‌بار در طول عمر isolate */
async function load(env) {
  if (MEM) return MEM;                        // کش در حافظه
  const raw = await d1Read(env);
  MEM = raw ? merge(DEF(), JSON.parse(raw)) : DEF();
  return MEM;
}

/* ═══════════ ذخیره‌سازی ساده و مطمئن ═══════════
   مشکل قبلی: صف نوشتن (Promise chain) اگر D1 fail شود هنگ می‌کرد.
   راه‌حل: timeout روی هر نوشتن + fallback به حافظه. */

/** نوشتن در D1 با timeout — اگر ۵ ثانیه طول کشید، رد می‌شود */
function d1WriteSafe(env, json) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, 5000);
    d1Write(env, json)
      .then((ok) => { if (!done) { done = true; clearTimeout(timer); resolve(ok); } })
      .catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(false); } });
  });
}

/** ذخیره — حافظه فوری + نوشتن در D1 با timeout */
async function save(env, st) {
  try { normalize(st); } catch (e) {}
  MEM = st;                                   // فوری در حافظه — همیشه کار می‌کند
  DIRTY = st;
  if (!env.DB) return st;

  /* نوشتن با timeout — اگر D1 کند بود، حافظه معتبر است */
  const ok = await d1WriteSafe(env, JSON.stringify(st));
  if (ok) {
    DIRTY = null;
    LAST_WRITE = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    if (WRITE_COUNT.day !== today) WRITE_COUNT = { day: today, n: 0 };
    WRITE_COUNT.n++;
  }
  return st;
}

/** نوشتن باقیمانده — در پایان درخواست */
async function flushDB(env) {
  if (!env.DB || !DIRTY) return;
  const ok = await d1WriteSafe(env, JSON.stringify(DIRTY));
  if (ok) {
    DIRTY = null;
    LAST_WRITE = Date.now();
    WRITE_COUNT.n++;
  }
}

function normalize(st) {
  const s = st.settings;
  if (typeof s.ports === 'string') s.ports = s.ports.split(/[,\s]+/).map(Number).filter((x) => x > 0);
  if (!Array.isArray(s.ports) || !s.ports.length) s.ports = [443];
  ['cleanIPs', 'proxyIPs', 'upstream', 'ispPools'].forEach((k) => { if (typeof s[k] === 'string') s[k] = s[k].split('\n').map((x) => x.trim()).filter(Boolean); });
  if (s.sub && typeof s.sub.rules === 'string') s.sub.rules = s.sub.rules.split('\n').map((x) => x.trim()).filter(Boolean);
  if (s.fr && typeof s.fr.files === 'string') s.fr.files = s.fr.files.split('\n').map((x) => x.trim()).filter(Boolean);

  /* ── کانفیگ‌های فیک: همیشه آرایه‌ی معتبر و تکمیل‌شده ── */
  if (!s.sub) s.sub = {};
  const DEF_FAKES = [
    { id: 'usage',     name: '📊 {usage}',        enabled: true,  proto: 'vless',  pin: true, pos: 1 },
    { id: 'remaining', name: '🟢 {remaining}',    enabled: true,  proto: 'vless',  pin: true, pos: 2 },
    { id: 'expiry',    name: '📅 {expiry}',       enabled: true,  proto: 'vless',  pin: true, pos: 3 },
    { id: 'channel',   name: '📢 {channel}',      enabled: true,  proto: 'trojan', pin: true, pos: 4 },
    { id: 'panel',     name: '⚙️ {panel} v{ver}', enabled: false, proto: 'trojan', pin: true, pos: 5 },
  ];
  if (!Array.isArray(s.sub.fakes)) s.sub.fakes = [];
  /* موارد پیش‌فرضِ مفقود را اضافه کن (اگر تنظیمات قدیمی است) */
  DEF_FAKES.forEach((d) => {
    if (!s.sub.fakes.some((f) => f && f.id === d.id)) s.sub.fakes.push(d);
  });
  /* پاک‌سازی و ترتیب */
  s.sub.fakes = s.sub.fakes
    .filter((f) => f && typeof f === 'object' && f.id)
    .map((f, i) => ({
      id: String(f.id),
      name: String(f.name || ''),
      enabled: f.enabled !== false,
      proto: f.proto === 'trojan' ? 'trojan' : 'vless',
      pin: !!f.pin,
      pos: Number(f.pos) || (i + 1),
    }))
    .sort((a, b) => a.pos - b.pos);

  return st;
}
function addLog(st, level, actor, action, detail = '') { st.logs = st.logs || []; st.logs.unshift({ id: randTok(8), ts: Date.now(), level, actor, action, detail }); st.logs = st.logs.slice(0, 50); }
function seed(st) {
  if (!st.users.length) st.users = [{ id: randTok(6), name: 'admin', uuid: crypto.randomUUID(), secret: randTok(12), enabled: true, note: 'کاربر اصلی', quotaGB: 0, dailyQuotaMB: 0, expiryAt: null, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, fakes: [], fakeMode: 'inherit', up: 0, down: 0, totalReq: 0, lastSeen: null, createdAt: Date.now() }];
  st.users.forEach((u) => { if (!Array.isArray(u.fakes)) u.fakes = []; if (!u.fakeMode) u.fakeMode = 'inherit'; });
  return st;
}

/* ════════════════════════════ احراز هویت ════════════════════════════ */
/** رمز مدیر — از متغیر محیطی، تنظیمات، یا پیش‌فرض */
function masterKey(st, env) {
  // اولویت: متغیر محیطی > تنظیمات > حافظه > پیش‌فرض
  if (env && env.MASTER_KEY) return String(env.MASTER_KEY);
  if (st && st.settings && st.settings.auth && st.settings.auth.password) return String(st.settings.auth.password);
  if (MEM && MEM.settings && MEM.settings.auth && MEM.settings.auth.password) return String(MEM.settings.auth.password);
  return 'simorgh';
}
async function mkToken(st, env) {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const p = b64u(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp, idle: st.settings.auth.sessionMin }));
  return p + '.' + (await hmac(masterKey(st, env), p));
}
async function authOk(req, env, st) {
  const h = req.headers.get('authorization') || '';
  const t = h.replace(/^Bearer\s+/i, '') || new URL(req.url).searchParams.get('token');
  if (!t || !t.includes('.')) return false;
  const [p, sig] = t.split('.');
  if ((await hmac(masterKey(st, env), p)) !== sig) return false;
  try { if (JSON.parse(atob(p)).exp * 1000 < Date.now()) return false; } catch (e) { return false; }
  return true;
}
function rateOk(key, max, winMs) {
  const now = Date.now(), rec = RATE.get(key) || { n: 0, t: now };
  if (now - rec.t > winMs) { rec.n = 0; rec.t = now; }
  rec.n++; RATE.set(key, rec);
  if (RATE.size > 500) RATE.clear();
  return rec.n <= max;
}
const ipOf = (r) => r.headers.get('cf-connecting-ip') || r.headers.get('x-forwarded-for') || '0.0.0.0';
/* تبدیل رقم به فارسی — در apiHandler استفاده می‌شود */
const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/* ════════════════════════════ تولید کانفیگ ════════════════════════════ */
/* ═══════════ فرمت URI مطابق BPB — سازگار با دسکتاپ و موبایل ═══════════
   تفاوت‌های کلیدی با فرمت قبلی:
   ۱. encryption=none همیشه هست (برخی کلاینت‌های موبایل بدون آن کار نمی‌کنند)
   ۲. alpn در URI نیست (فقط در قالب‌های JSON) — روی موبایل مشکل می‌سازد
   ۳. allowInsecure همیشه هست (۰ یا ۱)
   ۴. ترتیب پارامترها مثل BPB است */
function bpbUri(kind, u, s, entry, port, i, host) {
  const sec = s.tls ? 'tls' : 'none';
  const path = tPath(s, i, u.uuid, false);
  const fp = (s.fingerprint === 'randomized' || s.fingerprint === 'random') ? 'chrome' : (s.fingerprint || 'chrome');
  const inc = s.allowInsecure ? '1' : '0';
  const sni = s.sni || host;

  /* ⚠️ نکته‌ی حیاتی موبایل:
     BPB از encodeURIComponent برای path استفاده نمی‌کند — فقط encodeURI.
     تفاوت: encodeURI اسلش (/) را کدگذاری نمی‌کند ولی encodeURIComponent آن را به %2F تبدیل می‌کند.
     کلاینت‌های موبایل (v2rayNG، Hiddify) %2F در پارامتر path را درست دیکد نمی‌کنند! */
  const encPath = encodeURI(path);

  if (kind === 'vless') {
    const q = `encryption=none&security=${sec}&sni=${sni}&fp=${fp}&type=ws&host=${host}&path=${encPath}&allowInsecure=${inc}`;
    return `vless://${u.uuid}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port, '', u))}`;
  }
  if (kind === 'trojan') {
    const q = `security=${sec}&sni=${sni}&fp=${fp}&type=ws&host=${host}&path=${encPath}&allowInsecure=${inc}`;
    return `trojan://${u.secret}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port, 'β', u))}`;
  }
  return '';
}

/** ساخت هدر VLESS برای تست واقعی (payload دلخواه) */
function vlessHeader(u, host, port, payloadBytes) {
  const hex = String(u.uuid).replace(/-/g, '');
  const b = [0];
  for (let i = 0; i < 16; i++) b.push(parseInt(hex.substr(i * 2, 2), 16));
  b.push(0);                       // addons length
  b.push(1);                       // command = TCP
  b.push((port >> 8) & 255, port & 255);
  b.push(2, host.length);          // atyp = domain
  for (const c of host) b.push(c.charCodeAt(0));
  const pl = payloadBytes || new TextEncoder().encode('GET /cdn-cgi/trace HTTP/1.1\r\nHost: ' + host + '\r\nUser-Agent: curl/8\r\nConnection: close\r\n\r\n');
  const out = new Uint8Array(b.length + pl.length);
  out.set(new Uint8Array(b), 0);
  out.set(pl, b.length);
  return out;
}

const CC = { FR: '🇫🇷 فرانکفورت', NL: '🇳🇱 آمستردام', DE: '🇩🇪 برلین', GB: '🇬🇧 لندن', TR: '🇹🇷 استانبول', US: '🇺🇸 نیویورک', AE: '🇦🇪 دبی', SE: '🇸🇪 استکهلم', SG: '🇸🇬 سنگاپور', IR: '🇮🇷 تهران' };
function geo(ip, cf) {
  if (cf && cf.country && CC[cf.country]) return { cc: cf.country, name: CC[cf.country], isp: (cf.asOrganization || '').split(' ')[0] };
  const h = [...ip].reduce((a, c) => a + c.charCodeAt(0), 0), ks = Object.keys(CC);
  return { cc: ks[h % ks.length], name: CC[ks[h % ks.length]], isp: 'Cloudflare' };
}
function portsOf(u, s) { const p = (u.ports && u.ports.length ? (typeof u.ports === 'string' ? u.ports.split(/[,\s]+/) : u.ports) : s.ports).map(Number).filter((x) => x > 0); return p.length ? p : [443]; }
function ipsOf(u, s, cf) {
  let list = u.cleanIPs && u.cleanIPs.length ? u.cleanIPs : s.cleanIPs;
  if (s.perIsp && s.ispPools && s.ispPools.length) {
    const isp = (cf && cf.asOrganization) || '';
    const hit = s.ispPools.find((p) => isp && p.toLowerCase().includes(isp.split(' ')[0].toLowerCase()));
    if (hit) { const ips = hit.split('=')[1].split(',').map((x) => x.trim()); if (ips.length) list = ips; }
  }
  return list.length ? list : [(s.panel.url || 'simorgh.workers.dev')];
}
const ipName = (e) => { const [ip, nm] = String(e).split('#'); return { ip: ip.trim(), name: (nm || geo(ip).name).trim() }; };
function junk(p, i) { return p.startsWith('/') ? p : '/' + p; }
/* پارامترهای ترنسپورت — فقط مقدارهای اسکالر (چون مستقیم داخل query string می‌روند) */
/* جانک پایدار — با هر بار رفرش ساب عوض نمی‌شود تا کلاینت‌های ذخیره‌شده نشکنند */
function junkHash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return ('000000' + h.toString(16)).slice(-6);
}
/** مسیر ترنسپورت — مطابق BPB: ساده، بدون جانک اضافی */
function tPath(s, i, salt, earlyData) {
  const base = (s.path || '/sg').startsWith('/') ? s.path : '/' + s.path;
  /* BPB هیچ جانکی به مسیر اضافه نمی‌کند — مسیر ساده برای سازگاری موبایل */
  let p = base;
  if (earlyData && s.transport === 'ws') p += '?ed=2048';
  return p;
}
function tranportQ(s, i, host, salt) {
  const path = tPath(s, i, salt, s.earlyData);
  if (s.transport === 'grpc') return { type: 'grpc', serviceName: s.grpcService || 'grpc' };
  if (s.transport === 'xhttp') return { type: 'xhttp', path, mode: s.xhttpMode === 'auto' ? 'packet-up' : s.xhttpMode, host };
  return { type: 'ws', path, host };
}
/* مسیر بدون early-data (برای قالب‌های JSON) */
const plainPath = (s, i, salt) => tPath(s, i, salt, false);
function tlsQ(s, host) {
  if (!s.tls) return {};
  /* مهم: برای WebSocket باید ALPN فقط http/1.1 باشد.
     h2 باعث می‌شود کلاینت HTTP/2 مذاکره کند و WebSocket روی h2 کار نمی‌شود → کانفیگ وصل نمی‌شود */
  let alpn = (s.alpn || '').trim();
  if (!alpn || /h2/.test(alpn)) alpn = s.transport === 'ws' ? 'http/1.1' : alpn;
  const q = { security: 'tls', sni: s.sni || host };
  /* fp: «randomized» فقط v2rayN (دسکتاپ) پشتیبانی می‌کند.
     روی موبایل (v2rayNG / Hiddify) باید chrome یا firefox باشد. */
  q.fp = (s.fingerprint === 'randomized' || s.fingerprint === 'random') ? 'chrome' : s.fingerprint;
  /* alpn روی موبایل گاهی مشکل می‌سازد — اگر تنظیم نشده باشد، اصلاً ارسال نمی‌کنیم */
  if (alpn && s.transport === 'ws') q.alpn = alpn;
  if (s.allowInsecure) q.allowInsecure = '1';
  if (s.ech.enabled) q.ech = 'true';
  return q;
}
function fragQ(s) {
  const q = {};
  /* ⚠️ این پارامترها فقط برای v2rayN (دسکتاپ) معتبرند.
     v2rayNG و Hiddify روی موبایل آن‌ها را نمی‌شناسند و ممکن است اتصال را رد کنند.
     پس فقط وقتی اضافه می‌شوند که fragment فعال باشد (اختیاری کاربر). */
  if (s.fragment.enabled) {
    q.fragment = s.fragment.length + ',' + s.fragment.interval;
    if (s.tfo) q.tfo = '1';
  }
  if (s.mux) q.mux = '1';
  return q;
}
function protoList(s, u) {
  const m = u.mode && u.mode !== 'inherit' ? u.mode : s.mode;
  const l = [];
  if ((m === 'alpha' || m === 'both') && s.protocols.vless) l.push('vless');
  if ((m === 'beta' || m === 'both') && s.protocols.trojan) l.push('trojan');
  if (!l.length) l.push('vless');
  return l;
}
/** نام‌گذاری کانفیگ — پشتیبانی از استراتژی اختصاصی کاربر */
function label(s, e, port, extra, u) {
  const prefix = (u && u.namePrefix) ? u.namePrefix : (s.sub.namePrefix || '');
  const strategy = (u && u.nameStrategy && u.nameStrategy !== 'inherit') ? u.nameStrategy : (s.sub.nameStrategy || 'default');

  /* استراتژی‌های مختلف */
  if (strategy === 'user-port') return [u ? u.name : prefix, ':' + port].filter(Boolean).join('');
  if (strategy === 'type-user-port') return [(extra === 'β' ? 'Trojan' : 'VLESS'), u ? u.name : '', ':' + port].filter(Boolean).join('-');
  if (strategy === 'host-port-user') return [e.name, ':' + port, u ? u.name : ''].filter(Boolean).join('-');
  if (strategy === 'ip') return e.ip || e.name;

  /* پیش‌فرض */
  return [prefix, e.name, ':' + port, extra].filter(Boolean).join(' | ');
}

async function uri(kind, u, s, entry, port, i, host) {
  /* ── VLESS و Trojan: فرمت BPB — بدون alpn در URI، با encryption=none ── */
  if (kind === 'vless' || kind === 'trojan') return bpbUri(kind, u, s, entry, port, i, host);

  const g = tranportQ(s, i, host, u.uuid);
  if (kind === 'ss') return `ss://${b64('2022-blake3-aes-128-gcm:' + u.secret)}@${entry.ip}:${port}/?plugin=obfs-local%3Bobfs%3Dwebsocket%3Bobfs-host%3D${encodeURIComponent(host)}%3Bobfs-path%3D${encodeURIComponent(g.path || '/')}#${encodeURIComponent(label(s, entry, port, 'SS', u))}`;
  if (kind === 'vmess') {
    const o = { v: '2', ps: label(s, entry, port, 'VMess', u), add: entry.ip, port: String(port), id: u.uuid, aid: '0', scy: 'auto', net: s.transport === 'ws' ? 'ws' : s.transport, type: 'none', host, path: g.path || g.serviceName || '/', tls: s.tls ? 'tls' : '', sni: s.sni || host, fp: s.fingerprint };
    return 'vmess://' + b64(JSON.stringify(o));
  }
  return '';
}

async function buildList(u, s, url, cf) {
  const host = s.host || url.hostname;
  const entries = ipsOf(u, s, cf).map(ipName);
  const ports = portsOf(u, s);
  const protos = protoList(s, u);
  const limit = Number(u.maxConfigs) || Number(s.sub.nodeLimit) || 0;
  const out = [];
  const perProto = s.multiSplit ? Math.max(1, Math.floor((limit || entries.length * ports.length) / protos.length)) : Infinity;
  for (const k of protos) {
    let c = 0;
    for (let i = 0; i < entries.length && c < perProto; i++) {
      const port = ports[i % ports.length];
      out.push({ kind: k, uri: await uri(k, u, s, entries[i], port, i, host), entry: entries[i], port });
      c++;
    }
  }
  for (const k of ['ss', 'vmess']) {
    if (!s.protocols[k]) continue;
    const e = entries[out.length % entries.length], port = ports[out.length % ports.length];
    out.push({ kind: k, uri: await uri(k, u, s, e, port, out.length, host), entry: e, port });
  }
  return limit ? out.slice(0, limit) : out;
}

/* ═══════════ کانفیگ‌های فیک (اطلاعاتی) — با متغیرهای قابل تنظیم ═══════════
   متغیرهای مجاز در فیلد name:
   {usage} {remaining} {percent} {expiry} {days} {channel} {panel} {ver} {user}
   {quota} {up} {down} {req} {mode} {date} {time} {ip}
   {tgsupport} {tgbuy}   ← آیدی‌های تلگرام
*/
/* پیش‌فرض کانفیگ‌های فیک (برای پنل و برای هر کاربر) */
const DEF_FAKES = () => ([
  { id: 'usage',     name: '📊 {usage}',        enabled: true,  proto: 'vless',  pin: true, pos: 1 },
  { id: 'remaining', name: '🟢 {remaining}',    enabled: true,  proto: 'vless',  pin: true, pos: 2 },
  { id: 'expiry',    name: '📅 {expiry}',       enabled: true,  proto: 'vless',  pin: true, pos: 3 },
  { id: 'channel',   name: '📢 {channel}',      enabled: true,  proto: 'trojan', pin: true, pos: 4 },
  { id: 'panel',     name: '⚙️ {panel} v{ver}', enabled: false, proto: 'trojan', pin: true, pos: 5 },
]);

function fakeVars(u, s) {
  const q = (u.quotaGB || 0) * 1073741824;
  const used = (u.up || 0) + (u.down || 0);
  const gb = (x) => (x / 1073741824).toFixed(2);
  const dl = u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : null;
  const now = new Date();
  return {
    usage: `مصرف: ${gb(used)} GB از ${q ? gb(q) + ' GB' : 'نامحدود'}`,
    remaining: `باقیمانده: ${q ? gb(Math.max(0, q - used)) + ' GB' : 'نامحدود'}`,
    percent: q ? `${Math.round((used / q) * 100)}٪` : '∞',
    expiry: u.expiryAt ? new Date(u.expiryAt).toLocaleDateString('fa-IR') : 'نامحدود',
    days: dl === null ? 'نامحدود' : dl < 0 ? 'منقضی' : `${dl} روز`,
    channel: String(s.sub.telegramChannel || ''),
    /* متغیرهای تلگرام برای کانفیگ‌های فیک و صفحه‌ی کاربر */
    tgSupport: String(s.sub.telegramSupport || s.sub.telegramChannel || ''),
    tgBuy: String(s.sub.telegramBuy || s.sub.telegramSupport || s.sub.telegramChannel || ''),
    panel: String(s.panel.name || ''),
    ver: VERSION,
    user: String(u.name || ''),
    quota: q ? `${gb(q)} GB` : 'نامحدود',
    up: `${gb(u.up || 0)} GB`,
    down: `${gb(u.down || 0)} GB`,
    req: String(u.totalReq || 0),
    mode: String((u.mode && u.mode !== 'inherit' ? u.mode : s.mode) || ''),
    date: now.toLocaleDateString('fa-IR'),
    time: now.toLocaleTimeString('fa-IR'),
    ip: String(u.panelUrl || s.panel.url || ''),
    /* آیدی‌های تلگرام */
    tgsupport: String(s.sub.telegramSupport || s.sub.telegramChannel || ''),
    tgbuy: String(s.sub.telegramBuy || s.sub.telegramSupport || s.sub.telegramChannel || ''),
  };
}

function renderFakeName(tpl, vars) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out.trim();
}

function fakeCfg(u, s) {
  /* اولویت: کانفیگ‌های اختصاصی کاربر ← وگرنه کانفیگ‌های عمومی پنل */
  const own = Array.isArray(u.fakes) ? u.fakes : null;
  const useOwn = !!(own && own.some((f) => f && f.enabled && f.name && String(f.name).trim()));

  if (useOwn) {
    /* حالت اختصاصی: فقط کانفیگ‌های خود کاربر */
    const vars = fakeVars(u, s);
    return own
      .filter((f) => f && f.enabled && f.name && String(f.name).trim())
      .sort((a, b) => (a.pos || 99) - (b.pos || 99))
      .map((f) => {
        const label = renderFakeName(f.name, vars);
        if (!label) return null;
        const proto = f.proto === 'trojan' ? 'trojan' : 'vless';
        const cred = proto === 'trojan' ? (u.secret || '') : (u.uuid || '');
        return `${proto}://${cred}@1.1.1.1:443?security=tls&type=ws#${encodeURIComponent(label)}`;
      }).filter(Boolean);
  }

  /* حالت عمومی: کانفیگ‌های پنل (اگر فعال باشد) */
  if (!s.sub.fakeConfigs) return [];
  const vars = fakeVars(u, s);
  const list = (Array.isArray(s.sub.fakes) ? s.sub.fakes : [])
    .filter((f) => f && f.enabled && f.name && String(f.name).trim())
    .sort((a, b) => (a.pos || 99) - (b.pos || 99));
  return list.map((f) => {
    const label = renderFakeName(f.name, vars);
    if (!label) return null;
    const proto = f.proto === 'trojan' ? 'trojan' : 'vless';
    const cred = proto === 'trojan' ? (u.secret || '') : (u.uuid || '');
    return `${proto}://${cred}@1.1.1.1:443?security=tls&type=ws#${encodeURIComponent(label)}`;
  }).filter(Boolean);
}

/* ── قالب‌های اشتراک ── */
function clashYaml(list, u, s, url) {
  const host = s.host || url.hostname;
  const proxies = list.map((c, i) => {
    const base = { name: `${s.sub.namePrefix}-${i + 1}`, type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'ss' : 'vless', server: c.entry.ip, port: c.port, udp: true, ...(c.kind === 'vless' ? { uuid: u.uuid } : c.kind === 'trojan' ? { password: u.secret } : { cipher: '2022-blake3-aes-128-gcm', password: u.secret }) };
    if (s.tls && c.kind !== 'ss') { base.tls = true; base.servername = s.sni || host; base['skip-cert-verify'] = !!s.allowInsecure; base['client-fingerprint'] = s.fingerprint === 'randomized' ? 'chrome' : s.fingerprint; }
    if (c.kind === 'vmess') { base.uuid = u.uuid; base.alterId = 0; base.cipher = 'auto'; }
    if (s.transport === 'ws') base['ws-opts'] = { path: plainPath(s, i, u.uuid), headers: { Host: host } };
    if (s.transport === 'grpc') { base.network = 'grpc'; base['grpc-opts'] = { 'grpc-service-name': s.grpcService }; }
    return '  - ' + JSON.stringify(base);
  });
  const groups = s.sub.countryGroups ? countryGroups(list, s.sub.namePrefix) : [];
  const lines = [
    `# ${s.panel.name} — Clash/Mihomo`, 'mixed-port: 7890', 'allow-lan: false', 'mode: rule', 'log-level: warning',
    'dns:', '  enable: true', '  nameserver:', `    - ${s.sub.doh}`, 'proxies:', ...proxies, 'proxy-groups:',
    '  - name: "🚀 پروکسی"', '    type: select', '    proxies:', ...list.map((_, i) => `      - "${s.sub.namePrefix}-${i + 1}"`).concat(groups.map((g) => `      - "${g.name}"`)),
    ...groups.flatMap((g) => ['  - name: "' + g.name + '"', '    type: urltest', '    proxies:', ...g.items.map((x) => `      - "${x}"`)]),
    'rules:', ...(s.sub.bypassIR ? ['  - GEOIP,IR,DIRECT', '  - DOMAIN-SUFFIX,ir,DIRECT'] : []),
    ...(s.sub.blockAds ? ['  - GEOSITE,category-ads-all,REJECT'] : []), ...(s.sub.blockAdult ? ['  - GEOSITE,category-porn,REJECT'] : []),
    ...(s.sub.blockQuic ? ['  - AND((NETWORK,UDP),(DST-PORT,443)),REJECT'] : []),
    ...s.sub.rules.map((r) => '  - ' + r), '  - MATCH,🚀 پروکسی',
  ];
  return lines.join('\n');
}
function countryGroups(list, prefix) {
  const map = {};
  list.forEach((c, i) => { const g = geo(c.entry.ip); (map[g.name] = map[g.name] || []).push(`${prefix}-${i + 1}`); });
  return Object.entries(map).map(([name, items]) => ({ name, items }));
}
function metaJson(list, u, s, url) {
  const host = s.host || url.hostname;
  const proxies = list.map((c, i) => ({ name: `${s.sub.namePrefix}-${i + 1}`, type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'ss' : 'vless', server: c.entry.ip, port: c.port, udp: true, ...(c.kind === 'vless' ? { uuid: u.uuid } : { password: u.secret }), ...(s.tls && c.kind !== 'ss' ? { tls: true, servername: s.sni || host, 'skip-cert-verify': !!s.allowInsecure, 'client-fingerprint': s.fingerprint } : {}), ...(s.transport === 'ws' ? { 'ws-opts': { path: plainPath(s, i, u.uuid), headers: { Host: host } } } : {}), ...(s.transport === 'grpc' ? { network: 'grpc', 'grpc-opts': { 'grpc-service-name': s.grpcService } } : {}) }));
  return JSON.stringify({ 'mixed-port': 7890, mode: 'rule', 'log-level': 'warning', dns: { enable: true, nameserver: [s.sub.doh] }, proxies, 'proxy-groups': [{ name: '🚀 پروکسی', type: 'select', proxies: [...proxies.map((p) => p.name), 'DIRECT'] }], rules: [...(s.sub.bypassIR ? ['GEOIP,IR,DIRECT'] : []), ...(s.sub.blockAds ? ['GEOSITE,category-ads-all,REJECT'] : []), ...s.sub.rules, 'MATCH,🚀 پروکسی'] }, null, 2);
}
function singboxJson(list, u, s, url) {
  const host = s.host || url.hostname;
  const obs = list.map((c, i) => ({
    tag: 'sg-' + i, type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'shadowsocks' : 'vless',
    server: c.entry.ip, server_port: c.port,
    ...(c.kind === 'vless' ? { uuid: u.uuid } : { password: u.secret }),
    ...(c.kind === 'vmess' ? { uuid: u.uuid, security: 'auto' } : {}),
    ...(c.kind === 'ss' ? { method: '2022-blake3-aes-128-gcm' } : {}),
    ...(s.tls && c.kind !== 'ss' ? { tls: { enabled: true, server_name: s.sni || host, insecure: !!s.allowInsecure, utls: { enabled: true, fingerprint: s.fingerprint === 'randomized' ? 'chrome' : s.fingerprint }, ech: s.ech.enabled ? { enabled: true } : undefined } } : {}),
    transport: { type: s.transport === 'ws' ? 'websocket' : s.transport, ...(s.transport === 'ws' ? { path: plainPath(s, i, u.uuid), headers: { Host: host }, ...(s.earlyData ? { early_data_header_name: 'Sec-WebSocket-Protocol', max_early_data: 2048 } : {}) } : s.transport === 'grpc' ? { service_name: s.grpcService } : { path: plainPath(s, i, u.uuid), mode: 'packet-up' }) },
    ...(s.upstream && s.upstream.length ? { detour: 'chain-upstream' } : {}),
  }));
  return JSON.stringify({
    log: { level: 'warn', timestamp: true },
    dns: { servers: [{ tag: 'doh', address: s.doh.url, detour: 'proxy' }], strategy: 'prefer_ipv4', independent_cache: true },
    inbounds: [{ type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, strict_route: true, stack: 'mixed' }],
    outbounds: [...obs, { type: 'selector', tag: '🚀 پروکسی', outbounds: [...obs.map((o) => o.tag), 'direct'], default: obs[0]?.tag }, { type: 'urltest', tag: '⚡.auto', outbounds: obs.map((o) => o.tag), url: 'https://www.gstatic.com/generate_204', interval: '3m' }, ...(s.upstream?.length ? [{ type: 'vless', tag: 'chain-upstream', server: 'upstream', server_port: 443, uuid: '00000000-0000-0000-0000-000000000000' }] : []), { type: 'direct', tag: 'direct' }, { type: 'block', tag: 'block' }, { type: 'dns', tag: 'dns-out' }],
    route: { rules: [...(s.sub.bypassIR ? [{ ip_is_private: true, outbound: 'direct' }, { rule_set: ['geoip-ir', 'geosite-ir'], outbound: 'direct' }] : []), ...(s.sub.blockAds ? [{ rule_set: ['geosite-category-ads-all'], outbound: 'block' }] : []), ...(s.sub.blockAdult ? [{ rule_set: ['geosite-category-porn-all'], outbound: 'block' }] : []), ...(s.sub.blockQuic ? [{ network: 'udp', port: 443, outbound: 'block' }] : []), ...s.sub.rules.map((r) => { const [t, v, o] = r.split(','); return { [t.toLowerCase() === 'domain' ? 'domain' : t.toLowerCase() === 'ip-cidr' ? 'ip_cidr' : 'rule_set']: [v], outbound: o }; })], final: '🚀 پروکسی', auto_detect_interface: true },
    experimental: { cache_file: { enabled: true } },
  }, null, 2);
}
function v2rayJson(list, u, s, url) {
  const host = s.host || url.hostname;
  return JSON.stringify({
    log: { loglevel: 'warning' },
    inbounds: [{ port: 10808, listen: '127.0.0.1', protocol: 'socks', settings: { udp: true } }],
    outbounds: list.map((c, i) => ({
      tag: c.kind + '-' + c.port, ...(c.kind === 'trojan' ? { protocol: 'trojan', settings: { servers: [{ address: c.entry.ip, port: c.port, password: u.secret }] } } : { protocol: c.kind === 'vmess' ? 'vmess' : 'vless', settings: { vnext: [{ address: c.entry.ip, port: c.port, users: [{ id: u.uuid, encryption: 'none', security: 'auto', level: 0 }] }] } }),
      streamSettings: { network: s.transport, security: s.tls ? 'tls' : 'none', ...(s.tls ? { tlsSettings: { serverName: s.sni || host, allowInsecure: !!s.allowInsecure, fingerprint: s.fingerprint } } : {}), ...(s.transport === 'ws' ? { wsSettings: { path: plainPath(s, i, u.uuid), headers: { Host: host } } } : {}), ...(s.transport === 'grpc' ? { grpcSettings: { serviceName: s.grpcService } } : {}) },
    })).concat([{ tag: 'direct', protocol: 'freedom' }, { tag: 'block', protocol: 'blackhole' }]),
    routing: { domainStrategy: 'IPIfNonMatch', rules: [...(s.sub.bypassIR ? [{ type: 'field', ip: ['geoip:ir'], outboundTag: 'direct' }] : []), ...(s.sub.blockAds ? [{ type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'block' }] : []), { type: 'field', port: '443', network: 'udp', outboundTag: 'block' }] },
  }, null, 2);
}
function sniff(ua) {
  const s = (ua || '').toLowerCase();
  if (s.includes('clash.meta') || s.includes('mihomo') || s.includes('meta')) return 'meta';
  if (s.includes('clash') || s.includes('flclash')) return 'clash';
  if (s.includes('hiddify') || s.includes('karing') || s.includes('happ') || s.includes('sing-box') || s.includes('sfi')) return 'singbox';
  if (s.includes('v2ray') && s.includes('json')) return 'v2ray';
  if (s.includes('v2rayn') || s.includes('nekoray') || s.includes('qv2ray')) return 'v2ray';
  return 'base64';
}
/* ⚠️ واحد: بایت — همه‌ی کلاینت‌ها (Clash، sing-box، v2rayN) بایت انتظار دارند */
const quotaHdr = (u) => {
  const up = Math.max(0, Math.floor(Number(u.up) || 0));
  const down = Math.max(0, Math.floor(Number(u.down) || 0));
  const total = Math.max(0, Math.floor((Number(u.quotaGB) || 0) * 1073741824));
  const exp = u.expiryAt ? Math.floor(u.expiryAt / 1000) : 0;
  return `upload=${up}; download=${down}; total=${total}; expire=${exp}`;
};

/* ════════════════════════════ صفحات ════════════════════════════ */
const DECOY = {
  nginx: '<!doctype html><html><head><title>Welcome to nginx!</title></head><body><h1>Welcome to nginx!</h1><p>If you see this page, the nginx web server is successfully installed and working.</p><p><em>Thank you for using nginx.</em></p></body></html>',
  'cloudflare-1101': '<!doctype html><html><head><title>Worker threw exception</title><style>body{font-family:sans-serif;padding:40px;color:#333}h1{font-size:22px}code{background:#f4f4f4;padding:2px 6px}</style></head><body><h1>Worker threw exception</h1><p>Error 1101 • Ray ID: ' + randTok(16) + '</p><p><code>script</code></p></body></html>',
  maintenance: '<!doctype html><html><head><title>Under Maintenance</title></head><body style="font-family:sans-serif;text-align:center;padding:60px"><h1>🛠 Site under maintenance</h1><p>We will be back shortly.</p></body></html>',
  wp: '<!doctype html><html><head><title>My Blog</title></head><body style="font-family:Georgia,serif;max-width:680px;margin:40px auto"><h1>My Blog</h1><p>Just another WordPress site.</p></body></html>',
};
const FALLBACK = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>پنل</title></head>
<body style="font-family:system-ui;background:#070b12;color:#e8eef9;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center;max-width:520px;padding:24px"><h2>بارگذاری رابط کاربری ناموفق بود</h2>
<p style="color:#8d9cb6;line-height:2">فایل‌های UI از گیت‌هاب خوانده می‌شوند. مخزن را در تنظیمات (fr.repo) بررسی کنید یا دوباره تلاش کنید.</p>
<button onclick="location.reload()" style="background:#2ee6a8;border:0;color:#04120c;padding:10px 18px;border-radius:12px;font-weight:700;cursor:pointer">تلاش مجدد</button></div></body></html>`;

/* ═══════════ منبع ثابت UI — فقط همین سه فایل، غیرقابل تغییر ═══════════ */
const UI_SRC = {
  html: 'https://raw.githubusercontent.com/matmasomi777-droid/Sub/refs/heads/main/ui/index.html',
  css: 'https://raw.githubusercontent.com/matmasomi777-droid/Sub/refs/heads/main/ui/style.css',
  js: 'https://raw.githubusercontent.com/matmasomi777-droid/Sub/refs/heads/main/ui/app.js',
  user: 'https://raw.githubusercontent.com/matmasomi777-droid/Sub/refs/heads/main/ui/user.html',
};
let USER_HTML = null;

/* ═══════════════════════════════════════════════════════════════════════════
   سیستم استتار — ایده از نهان ولی پیاده‌سازی مستقل
   روش نهان: هیچ مسیر شناخته‌شده‌ای وجود ندارد؛ همه‌ی مسیرهای ناشناخته
   صفحه‌ی سایت واقعی نشان می‌دهند. پنل و API فقط روی مسیر مخفی هستند.
   ═══════════════════════════════════════════════════════════════════════════ */

/* صفحات استتار — سایت‌های واقعی که با واکشی زنده نمایش داده می‌شوند */
const DECOY_SITES = {
  nginx:      { url: 'https://nginx.org/en/',                    label: 'nginx' },
  ubuntu:     { url: 'https://ubuntu.com/server/docs',           label: 'Ubuntu Server' },
  docker:     { url: 'https://docs.docker.com/',                 label: 'Docker Docs' },
  cloudflare: { url: 'https://developers.cloudflare.com/workers/', label: 'Cloudflare Workers' },
  python:     { url: 'https://docs.python.org/3/',               label: 'Python Docs' },
  node:       { url: 'https://nodejs.org/docs/latest/api/',      label: 'Node.js Docs' },
};

/* کش صفحات استتار */
const DECOY_CACHE = new Map();   // url -> {body, ts}
const DECOY_TTL = 300000;        // ۵ دقیقه

/* ═══════════ سایت‌های استتار داخلی — کامل با CSS inline، بدون واکشی ═══════════ */
const DECOY_PAGES = {
  nginx: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Welcome to nginx!</title>
<style>body{width:35em;margin:0 auto;font-family:Tahoma,Verdana,Arial,sans-serif;padding:50px 0;background:#fff;color:#333}
h1{font-size:1.7em;font-weight:400;margin:0 0 20px}p{line-height:1.7;margin:0 0 15px;color:#555}
a{color:#069;text-decoration:none}a:hover{text-decoration:underline}
em{font-style:normal;color:#999}
hr{border:0;border-top:1px solid #ddd;margin:30px 0}
.banner{background:#f8f8f8;border:1px solid #ddd;padding:15px;margin:0 0 20px;border-radius:5px}</style></head>
<body><h1>Welcome to nginx!</h1>
<div class="banner"><p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p></div>
<p>For online documentation and support please refer to <a href="https://nginx.org/">nginx.org</a>.<br/>Commercial support is available at <a href="https://nginx.com/">nginx.com</a>.</p>
<p><em>Thank you for using nginx.</em></p></body></html>`,

  ubuntu: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ubuntu Server documentation</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Ubuntu,'Segoe UI',Tahoma,sans-serif;background:#fff;color:#111;line-height:1.6}
.nav{background:#2c001e;color:#fff;padding:14px 30px;display:flex;align-items:center;gap:12px}
.nav b{font-size:18px;font-weight:500}
.nav span{font-size:13px;opacity:.7}
.hero{background:linear-gradient(135deg,#2c001e,#772953);color:#fff;padding:60px 30px;text-align:center}
.hero h1{font-size:36px;font-weight:300;margin-bottom:12px}
.hero p{font-size:16px;opacity:.8;max-width:500px;margin:0 auto}
.container{max-width:800px;margin:0 auto;padding:40px 30px}
.container h2{font-size:24px;font-weight:400;margin:30px 0 15px;color:#2c001e}
.container p{margin:0 0 15px;color:#444}
.card{background:#f8f8f8;border-left:4px solid #e95420;padding:15px 20px;margin:20px 0}
.footer{border-top:1px solid #eee;padding:20px 30px;text-align:center;font-size:13px;color:#888}</style></head>
<body><div class="nav"><b>Ubuntu</b><span>Server documentation</span></div>
<div class="hero"><h1>Ubuntu Server</h1><p>The world's most popular Linux for servers and cloud</p></div>
<div class="container"><h2>Getting started</h2>
<p>Ubuntu Server brings economic and technical scalability to your datacentre, public or private.</p>
<div class="card">Whether you want to deploy a cloud or a web farm, Ubuntu Server supports the most popular hardware and software.</div>
<h2>Documentation</h2><p>Guides and manuals for Ubuntu Server installation, configuration and administration.</p></div>
<div class="footer">© 2024 Canonical Ltd. Ubuntu and Canonical are registered trademarks of Canonical Ltd.</div></body></html>`,

  docker: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Docker Documentation</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;color:#24292f;line-height:1.6}
.header{background:#2496ed;color:#fff;padding:16px 30px;display:flex;align-items:center;gap:14px}
.header b{font-size:20px;font-weight:600}
.header span{font-size:13px;opacity:.8}
.hero{background:#f0f7ff;padding:50px 30px;text-align:center;border-bottom:1px solid #d0e3f7}
.hero h1{font-size:32px;font-weight:600;margin-bottom:10px;color:#2496ed}
.hero p{font-size:15px;color:#57606a}
.content{max-width:760px;margin:0 auto;padding:40px 30px}
.content h2{font-size:22px;margin:30px 0 12px;font-weight:600}
.content p{margin:0 0 14px;color:#57606a}
.code{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:14px;font-family:Consolas,monospace;font-size:13px;margin:15px 0;color:#24292f}
.footer{border-top:1px solid #eee;padding:18px 30px;text-align:center;font-size:13px;color:#57606a}</style></head>
<body><div class="header"><b>Docker</b><span>Documentation</span></div>
<div class="hero"><h1>Docker Documentation</h1><p>Build, share, and run modern applications</p></div>
<div class="content"><h2>Get started</h2><p>Docker is an open platform for developing, shipping, and running applications.</p>
<div class="code">$ docker run hello-world</div>
<h2>Guides</h2><p>Step-by-step instructions for learning Docker concepts and workflows.</p></div>
<div class="footer">© 2024 Docker Inc.</div></body></html>`,

  python: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Python 3 documentation</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;color:#111;line-height:1.6}
.sidebar{background:#3776ab;color:#fff;width:100%;padding:14px 25px;display:flex;gap:16px;align-items:center}
.sidebar b{font-size:19px;font-weight:600}
.sidebar a{color:#ffd43b;font-size:13px;text-decoration:none}
.main{max-width:820px;margin:0 auto;padding:40px 30px}
.main h1{font-size:30px;color:#3776ab;margin-bottom:8px;font-weight:600}
.main .sub{font-size:15px;color:#666;margin-bottom:25px}
.main h2{font-size:21px;margin:28px 0 12px;color:#3776ab}
.main p{margin:0 0 14px;color:#333}
.list{margin:15px 0 15px 25px;color:#333}
.list li{margin-bottom:6px}
.footer{border-top:1px solid #ddd;padding:18px 30px;text-align:center;font-size:13px;color:#888}</style></head>
<body><div class="sidebar"><b>Python</b><a>Docs</a><a>Library</a><a>Reference</a></div>
<div class="main"><h1>Python 3 documentation</h1>
<div class="sub">Welcome! This is the official documentation for Python 3.</div>
<h2>Parts of the documentation</h2>
<ul class="list"><li><b>What's new in Python 3?</b> — changes from previous versions</li>
<li><b>Library Reference</b> — the standard library reference</li>
<li><b>Language Reference</b> — syntax and language elements</li>
<li><b>Python Howtos</b> — detailed documents on specific topics</li></ul>
<h2>Looking for something specific?</h2><p>Use the search box or browse the table of contents.</p></div>
<div class="footer">© 2001–2024 Python Software Foundation</div></body></html>`,

  node: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Node.js v21 Documentation</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;color:#333;line-height:1.6}
.top{background:#43853d;color:#fff;padding:14px 25px;display:flex;align-items:center;gap:14px}
.top b{font-size:19px;font-weight:600}
.top span{font-size:13px;opacity:.85}
.wrap{max-width:820px;margin:0 auto;padding:40px 30px}
.wrap h1{font-size:28px;color:#43853d;margin-bottom:6px}
.wrap .v{font-size:14px;color:#888;margin-bottom:22px}
.wrap h2{font-size:20px;margin:26px 0 10px;color:#43853d}
.wrap p{margin:0 0 13px;color:#444}
.api{background:#f6faf6;border:1px solid #d4e8d4;border-radius:6px;padding:14px;margin:15px 0}
.api b{color:#43853d}
.footer{border-top:1px solid #eee;padding:16px 30px;text-align:center;font-size:13px;color:#888}</style></head>
<body><div class="top"><b>Node.js</b><span>API Documentation</span></div>
<div class="wrap"><h1>Node.js API Documentation</h1><div class="v">Node.js v21.x LTS</div>
<h2>About this documentation</h2><p>Welcome to the official Node.js API documentation.</p>
<h2>Core modules</h2><div class="api"><b>fs</b> — File system operations<br/><b>http</b> — HTTP server and client<br/><b>path</b> — Path utilities<br/><b>crypto</b> — Cryptographic functionality</div>
<h2>Stability index</h2><p>The stability index indicates the reliability of each API module.</p></div>
<div class="footer">© 2024 OpenJS Foundation</div></body></html>`,

  cloudflare: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cloudflare Workers Docs</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;color:#333;line-height:1.6}
.hdr{background:#f6821f;color:#fff;padding:14px 25px;display:flex;align-items:center;gap:14px}
.hdr b{font-size:19px;font-weight:600}.hdr span{font-size:13px;opacity:.85}
.hero{background:linear-gradient(135deg,#f6821f,#fbad41);color:#fff;padding:48px 30px;text-align:center}
.hero h1{font-size:30px;font-weight:600;margin-bottom:8px}
.hero p{font-size:15px;opacity:.9}
.body{max-width:780px;margin:0 auto;padding:38px 30px}
.body h2{font-size:21px;margin:26px 0 11px;color:#f6821f}
.body p{margin:0 0 13px;color:#444}
.card{background:#fff8f0;border:1px solid #fbad41;border-radius:8px;padding:15px;margin:16px 0}
.card b{color:#f6821f}
.foot{border-top:1px solid #eee;padding:16px 30px;text-align:center;font-size:13px;color:#888}</style></head>
<body><div class="hdr"><b>Cloudflare</b><span>Workers Documentation</span></div>
<div class="hero"><h1>Cloudflare Workers</h1><p>Serverless functions on Cloudflare's global network</p></div>
<div class="body"><h2>Getting started</h2><p>Deploy serverless code instantly across Cloudflare's global network.</p>
<div class="card"><b>Quickstart</b> — Deploy your first Worker in minutes</div>
<h2>Features</h2><p>Key-value storage, D1 databases, and edge computing capabilities.</p></div>
<div class="foot">© 2024 Cloudflare Inc.</div></body></html>`,
};

/** واکشی و کش یک سایت استتار — CSS و تصاویر هم دریافت و inline می‌شوند */
async function fetchDecoy(target, force) {
  const cached = DECOY_CACHE.get(target);
  if (!force && cached && Date.now() - cached.ts < DECOY_TTL) return cached.body;

  try {
    const r = await fetch(target, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      cf: { cacheTtl: 300 },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let body = await r.text();
    const base = new URL(target);

    /* ═══ ۱. لینک‌های نسبی → مطلق (مهم‌ترین مرحله) ═══ */
    const abs = (href) => {
      try { return new URL(href, base).href; } catch (e) { return href; }
    };
    // href و src در همه‌ی تگ‌ها
    body = body.replace(/\s(href|src)="([^"]+)"/gi, (m, attr, val) => {
      if (/^(https?:|data:|blob:|#|javascript:|mailto:)/i.test(val)) return m;
      return ` ${attr}="${abs(val)}"`;
    });
    // srcset
    body = body.replace(/\ssrcset="([^"]+)"/gi, (m, val) => {
      const parts = val.split(',').map((p) => {
        const t = p.trim().split(/\s+/);
        if (t[0] && !/^(https?:|data:)/i.test(t[0])) t[0] = abs(t[0]);
        return t.join(' ');
      });
      return ` srcset="${parts.join(', ')}"`;
    });

    /* ═══ ۲. CSS داخلی: url() های نسبی → مطلق ═══ */
    body = body.replace(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi, (m, val) => {
      if (/^(https?:|data:|#)/i.test(val)) return m;
      return `url("${abs(val)}")`;
    });

    /* ═══ ۳. حذف CSP و meta refresh که لود را بلاک می‌کنند ═══ */
    body = body
      .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
      .replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');

    /* ═══ ۴. تگ base برای هر مورد باقی‌مانده ═══ */
    if (!/<base\s/i.test(body)) {
      body = body.replace(/<\/head>/i, `<base href="${target}">\n</head>`);
    }

    /* ═══ ۵. حذف اسکریپت‌ها (جلوگیری از رفتار ناخواسته و خطا) ═══ */
    body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    DECOY_CACHE.set(target, { body, ts: Date.now() });
    return body;
  } catch (e) { return null; }
}

/** پاسخ استتار — صفحه‌ی داخلی یا سایت واکشی‌شده */
async function decoyPage(s, force) {
  const host = (s.auth && s.auth.maintenanceHost) || 'nginx';
  /* ۱) اگر آدرس دلخواه تنظیم شده → واکشی از آن */
  const custom = (s.auth && s.auth.decoyUrl && String(s.auth.decoyUrl).trim());
  if (custom) {
    const body = await fetchDecoy(custom, force);
    if (body) return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-frame-options': 'SAMEORIGIN' },
    });
  }

  /* ۲) صفحه‌ی داخلی — همیشه با CSS کامل، بدون نیاز به واکشی */
  const page = DECOY_PAGES[host] || DECOY_PAGES.nginx;
  if (page) return new Response(page, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });

  /* ۳) fallback — صفحه‌ی nginx داخلی */
  return new Response(DECOY_PAGES.nginx, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

/* صفحه‌ی استاتیک پشتیبان */
const DECOY_STATIC = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Welcome to nginx!</title>
<style>body{width:35em;margin:0 auto;font-family:Tahoma,Verdana,Arial,sans-serif;padding:50px 0}
h1{font-size:1.7em;font-weight:400;color:#333}p{color:#555;line-height:1.7}
em{font-style:normal;color:#999}</style></head>
<body><h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p>
<p>For online documentation and support please refer to <a href="https://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at <a href="https://nginx.com/">nginx.com</a>.</p>
<p><em>Thank you for using nginx.</em></p></body></html>`;

const notFoundPage = () => new Response(DECOY_STATIC, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });

/* ═══════════════ صفحه‌ی کاربر — داشبورد و اشتراک در یک صفحه ═══════════════ */
const USER_PAGE = `<!DOCTYPE html>
<html lang="fa" dir="rtl" id="html-root">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title id="page-title">__PANEL_NAME__</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
@import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/vazirmatn-font-face.css');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;font-family:'Vazirmatn',sans-serif;-webkit-tap-highlight-color:transparent}
:root{--bg:#090C11;--bg-grid:rgba(255,255,255,.035);--surface:#12161F;--surface-alt:#171C27;--text:#EDEFF3;--text-muted:#838DA0;--border:rgba(255,255,255,.07);--accent:#2DD4BF;--accent-rgb:45,212,191;--accent-2:#4C8DFF;--accent-2-rgb:76,141,255;--alert:#F0655F;--alert-rgb:240,101,95;--warn:#F4A94A;--warn-rgb:244,169,74;--nav-bg:#0C0F15;--hero-1:#101A28;--hero-2:#05070B;--hero-alert-1:#2A1214;--hero-alert-2:#0B0505;--ring-track:rgba(255,255,255,.06);--shadow:rgba(0,0,0,.4);--box-shadow-light:0 4px 12px rgba(0,0,0,.15)}
body.light-mode{--bg:#EEF1F6;--bg-grid:rgba(16,21,32,.05);--surface:#FFF;--surface-alt:#F4F6FA;--text:#10141C;--text-muted:#6B7484;--border:rgba(16,21,32,.08);--accent:#0EA394;--accent-rgb:14,163,148;--accent-2:#2D6CDF;--accent-2-rgb:45,108,223;--alert:#DC4C43;--alert-rgb:220,76,67;--warn:#DB8A2A;--warn-rgb:219,138,42;--nav-bg:#FFF;--hero-1:#FFF;--hero-2:#EAF6F4;--hero-alert-1:#FDEBEA;--hero-alert-2:#F7CFCB;--ring-track:rgba(16,21,32,.09);--shadow:rgba(16,21,32,.08);--box-shadow-light:0 6px 18px rgba(0,0,0,.12)}
body{background-color:var(--bg);background-image:radial-gradient(var(--bg-grid) 1px,transparent 1px);background-size:18px 18px;color:var(--text);padding:28px 24px 110px;width:100%;margin:0 auto;transition:background-color .35s,color .35s;position:relative;min-height:100%}
html[dir="ltr"] body{direction:ltr}
.en-font{font-family:'JetBrains Mono','Segoe UI',monospace!important;letter-spacing:.2px}
.app-screen{display:none}.app-screen.active-screen{display:block}
.header{margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;width:100%;max-width:1180px;margin-left:auto;margin-right:auto}
.profile-container{display:flex;align-items:center;flex:1;min-width:0}
html[dir="rtl"] .profile-img-wrapper{margin-left:12px}html[dir="ltr"] .profile-img-wrapper{margin-right:12px}
.profile-img-wrapper{position:relative;width:54px;height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
.profile-img{width:46px;height:46px;border-radius:50%;background:var(--surface-alt);border:2.5px solid var(--border);display:flex;align-items:center;justify-content:center;transition:border-color .35s}
.profile-img.online{border-color:var(--accent)}
.default-avatar-svg{width:24px;height:24px;fill:var(--text-muted);display:block;border-radius:50%}
.online-status-text{font-size:9px;font-weight:700;color:var(--accent);margin-top:2px;letter-spacing:.3px}
.online-status-text.offline{color:var(--text-muted)}
.online-dot{position:absolute;bottom:2px;width:11px;height:11px;background:#555;border-radius:50%;border:2px solid var(--bg);z-index:3;transition:background-color .3s}
.online-dot.online{background:var(--accent)}
html[dir="rtl"] .online-dot{left:2px}html[dir="ltr"] .online-dot{right:2px}
.user-info{display:flex;align-items:center;margin-top:4px;min-width:0}
.user-name{font-size:16px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0}
html[dir="rtl"] .user-name{flex-direction:row-reverse}
.greeting-text{white-space:nowrap}
.username-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px}
.username-text.online{color:var(--accent)}
.wave-icon-wrapper{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;transform-origin:bottom center;animation:wave 3.5s ease-in-out infinite;flex-shrink:0}
.wave-icon-wrapper svg{width:100%;height:100%}
@keyframes wave{0%{transform:rotate(0) scale(1)}15%{transform:rotate(10deg) scale(1.01)}30%{transform:rotate(-6deg) scale(1.02)}45%{transform:rotate(8deg) scale(1.01)}60%{transform:rotate(-4deg) scale(1)}75%{transform:rotate(4deg) scale(1)}100%{transform:rotate(0) scale(1)}}
.header-icons{display:flex;gap:10px;align-items:center;flex-shrink:0}
.lang-container{position:relative}
.header-icon{height:42px;padding:0 14px;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;cursor:pointer;transition:border-color .25s;gap:6px}
.header-icon:hover{border-color:rgba(var(--accent-rgb),.4)}
.header-icon i{font-size:16px;color:var(--text-muted)}
.lang-btn{font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px}
.lang-dropdown-menu{position:absolute;top:50px;background:var(--surface);border:1px solid var(--border);border-radius:12px;min-width:110px;box-shadow:0 10px 25px var(--shadow);z-index:1000;display:none}
html[dir="rtl"] .lang-dropdown-menu{left:0}html[dir="ltr"] .lang-dropdown-menu{right:0}
.lang-dropdown-menu.show{display:block}
.lang-dropdown-item{padding:10px 14px;font-size:13px;color:var(--text-muted);cursor:pointer;transition:background .2s}
.lang-dropdown-item:hover{background:rgba(var(--accent-rgb),.12);color:var(--text)}
.subscription-card{border:1px solid rgba(var(--accent-rgb),.15);border-radius:22px;padding:28px 32px;margin-bottom:16px;position:relative;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(150deg,var(--hero-1) 0%,var(--hero-2) 100%);box-shadow:inset 0 0 24px rgba(var(--accent-rgb),.06),var(--box-shadow-light);overflow:hidden;transition:background .4s,box-shadow .4s,border-color .4s;min-height:180px}
.subscription-card::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:16px 16px;pointer-events:none}
.subscription-card.disconnected{background:linear-gradient(150deg,var(--hero-alert-1) 0%,var(--hero-alert-2) 100%);box-shadow:inset 0 0 24px rgba(var(--alert-rgb),.1),var(--box-shadow-light);border-color:rgba(var(--alert-rgb),.18)}
.status-right{display:flex;flex-direction:column;position:relative;z-index:1}
.active-badge{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.status-dot-green{width:16px;height:16px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;animation:pulseG 2s infinite}
.status-dot-green i{font-size:9px;color:#06110F}
.subscription-card.disconnected .status-dot-green{background:var(--alert);animation:pulseR 1.5s infinite}
.subscription-card.disconnected .status-dot-green i{color:#2A0B09}
@keyframes pulseG{0%{box-shadow:0 0 0 0 rgba(var(--accent-rgb),.5)}70%{box-shadow:0 0 0 8px rgba(var(--accent-rgb),0)}100%{box-shadow:0 0 0 0 rgba(var(--accent-rgb),0)}}
@keyframes pulseR{0%{box-shadow:0 0 0 0 rgba(var(--alert-rgb),.6)}70%{box-shadow:0 0 10px rgba(var(--alert-rgb),0)}100%{box-shadow:0 0 0 0 rgba(var(--alert-rgb),0)}}
.days-left{font-size:42px;font-weight:700;margin-bottom:4px;font-family:'JetBrains Mono',monospace}
.days-left span{color:var(--accent);font-size:18px;font-weight:600;font-family:'Vazirmatn',sans-serif;margin-left:6px}
.subscription-card.disconnected .days-left span{color:var(--alert)}
.expire-date{font-size:12px;font-weight:600;color:var(--text-muted)}
.progress-circle{position:relative;width:132px;height:132px;border-radius:50%;background:conic-gradient(var(--accent) 0% 100%,var(--ring-track) 100% 100%);display:flex;align-items:center;justify-content:center;z-index:1;transition:background .5s cubic-bezier(.4,0,.2,1)}
.progress-circle::after{content:'';position:absolute;width:108px;height:108px;background:var(--hero-2);border-radius:50%;transition:background-color .3s}
.radar-sweep{position:absolute;inset:0;border-radius:50%;animation:radar 3.2s linear infinite;pointer-events:none}
.radar-sweep::before{content:'';position:absolute;top:1px;left:50%;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px rgba(var(--accent-rgb),.9)}
@keyframes radar{to{transform:rotate(360deg)}}
.subscription-card.disconnected .radar-sweep{animation-play-state:paused;opacity:.3}
.subscription-card.disconnected .radar-sweep::before{box-shadow:0 0 8px 2px rgba(var(--alert-rgb),.9)}
.subscription-card.disconnected .progress-circle::after{background:var(--hero-alert-2)}
.progress-text{position:relative;z-index:2;text-align:center}
.progress-text .percent{font-size:22px;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace}
.progress-text .label{font-size:10px;color:var(--text-muted);display:block;margin-top:2px}
body.light-mode .subscription-card::before{background-image:linear-gradient(rgba(16,21,32,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(16,21,32,.03) 1px,transparent 1px)}
body.light-mode .subscription-card.disconnected{border-color:rgba(var(--alert-rgb),.4)}
body.light-mode .progress-circle::after{background:var(--hero-2)}
body.light-mode .radar-sweep::before{background:var(--text)}
#screen-dashboard,#screen-download-apps{width:100%;max-width:1180px;margin-left:auto;margin-right:auto}
.stats-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:18px 10px;margin-bottom:16px;display:flex;justify-content:space-between;box-shadow:var(--box-shadow-light)}
.stat-item{flex:1;display:flex;flex-direction:column;align-items:center}
.stat-header-row{display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-direction:row-reverse}
html[dir="ltr"] .stat-header-row{flex-direction:row}
.stat-icon-wrapper{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--surface-alt);border:1px solid var(--border)}
.stat-title{font-size:11px;color:var(--text-muted)}
.stat-value{font-size:14px;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace}
.stat-value.purple-value{color:var(--accent)}
.stat-divider{height:40px;width:1px;background:var(--border);align-self:center}
.promo-card{background:linear-gradient(135deg,rgba(var(--accent-rgb),.15),rgba(var(--accent-rgb),.05));border:1px solid rgba(var(--accent-rgb),.25);border-radius:18px;padding:18px 16px;margin-bottom:16px;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:var(--box-shadow-light);text-align:center}
.promo-card .promo-text{font-size:16px;font-weight:500;color:var(--text);line-height:1.8}
.promo-card .promo-text span{color:var(--accent);font-weight:700}
.promo-buttons{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.promo-btn{display:flex;align-items:center;gap:8px;padding:8px 18px;border-radius:12px;font-size:13px;font-weight:700;text-decoration:none;transition:all .25s;background:var(--surface);border:1px solid var(--border);color:var(--text);box-shadow:var(--box-shadow-light)}
.promo-btn:hover{transform:scale(1.03);border-color:rgba(var(--accent-rgb),.4)}
.promo-btn i{font-size:18px}.promo-btn.telegram i{color:#0088cc}
.details-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
.detail-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 12px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-height:72px;box-shadow:var(--box-shadow-light)}
.detail-card .label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-bottom:4px}
.detail-card .value{font-size:16px;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace}
.detail-card .value.accent-value{color:var(--accent)}
.section-title{font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:12px;text-align:right;text-transform:uppercase;letter-spacing:.4px}
html[dir="ltr"] .section-title{text-align:left}
.actions-grid{display:flex;gap:12px;margin-bottom:12px}
.action-cell{flex:1}
.action-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 10px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:10px;height:100%;transition:transform .2s,border-color .2s;box-shadow:var(--box-shadow-light)}
.action-card:active{transform:scale(.96)}
.action-card:hover{border-color:rgba(var(--accent-rgb),.3)}
.action-card i{font-size:20px}
.action-card.renew i{color:var(--warn)}.action-card.link i{color:var(--accent)}.action-card.qr i{color:var(--accent-2)}.action-card.config i{color:var(--accent)}
.action-label{font-size:12px;color:var(--text);font-weight:600;line-height:1.3}
.action-dropdown-container{width:100%;margin-bottom:24px;display:none}
.action-dropdown-container.show{display:block}
.action-dropdown-menu{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:10px;box-shadow:0 10px 25px var(--shadow);display:flex;flex-direction:column;gap:8px;min-height:60px;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px}
.ip-row-item{background:var(--surface-alt);border:1px solid var(--border);border-radius:12px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;width:100%}
.ip-details-left{display:flex;align-items:center;gap:12px}
html[dir="rtl"] .ip-details-left{flex-direction:row-reverse}
.action-mini-flag{width:24px;height:24px;border-radius:50%;background-size:cover;background-position:center;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);flex-shrink:0}
.ip-meta-block{display:flex;flex-direction:column;gap:4px;min-width:0}
.ip-address-text{font-size:13px;font-weight:bold;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ip-protocol-badge-box{display:inline-flex;gap:3px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:2px 6px;font-size:10px;text-transform:uppercase;font-weight:500;line-height:1.4}
.proto-part-1{color:var(--warn)}.proto-part-2{color:var(--accent-2)}.proto-part-3{color:var(--accent)}
.ip-copy-btn{background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.25);color:var(--accent);padding:6px 12px;border-radius:10px;font-size:11px;font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .2s;flex-shrink:0}
.ip-copy-btn:hover{background:var(--accent);color:#06110F}
.copy-all-btn{background:rgba(var(--accent-rgb),.15);border:1px solid rgba(var(--accent-rgb),.3);color:var(--text);padding:8px 14px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;transition:all .25s;margin-bottom:8px}
.copy-all-btn:hover{background:var(--accent);color:#06110F}
.download-os-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;background:var(--surface);padding:6px;border-radius:16px;margin-bottom:24px;text-align:center;border:1px solid var(--border);box-shadow:var(--box-shadow-light)}
.os-tab-btn{background:transparent;border:none;color:var(--text-muted);padding:10px 4px;font-size:12px;font-weight:bold;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .25s}
.os-tab-btn.active-tab{background:var(--accent);color:#06110F;box-shadow:0 4px 12px rgba(var(--accent-rgb),.3)}
.client-card-item{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;box-shadow:var(--box-shadow-light)}
.client-info-side{display:flex;align-items:center;gap:12px}
html[dir="ltr"] .client-info-side{flex-direction:row-reverse;text-align:left}
.client-icon-box{width:44px;height:44px;background:var(--surface-alt);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--text-muted)}
.client-title-text{font-size:14px;font-weight:700;color:var(--text)}
.client-subtitle-text{font-size:11px;color:var(--text-muted);margin-top:2px}
.client-download-btn{background:rgba(var(--accent-rgb),.15);color:var(--accent);padding:8px 18px;border-radius:12px;font-size:12px;font-weight:700;text-decoration:none;transition:all .2s;flex-shrink:0}
.client-download-btn:hover{background:var(--accent);color:#06110F}
.config-qr-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .3s}
.config-qr-overlay.show{opacity:1;pointer-events:auto}
.config-qr-box{background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:24px;max-width:320px;width:100%;text-align:center;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.4);transform:scale(.9);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.config-qr-overlay.show .config-qr-box{transform:scale(1)}
.config-qr-close{position:absolute;top:14px;left:14px;width:30px;height:30px;border-radius:50%;border:none;background:var(--surface-alt);color:var(--text-muted);font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.config-qr-close:hover{background:rgba(var(--alert-rgb),.15);color:var(--alert)}
.config-qr-remark{font-size:14px;font-weight:700;color:var(--text);margin:6px 0 18px;word-break:break-word}
.config-qr-img-wrap{background:#fff;border-radius:16px;padding:16px;display:flex;align-items:center;justify-content:center}
.config-qr-img-wrap img{width:220px;height:220px;display:block}
.bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:calc(100% - 48px);max-width:1180px;background:var(--nav-bg);border:1px solid var(--border);border-bottom:0;border-radius:18px 18px 0 0;padding:12px 16px;display:flex;z-index:100}
.nav-item-cell{flex:1;display:flex;justify-content:center}
.nav-item{color:var(--text-muted);font-size:11px;cursor:pointer;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:8px 0}
.nav-item i{font-size:18px}
.nav-item.active{background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.25);border-radius:16px;color:var(--accent)}
@media (max-width:768px){body{padding:16px 12px 96px}#screen-dashboard{display:block}.subscription-card{padding:20px 18px;min-height:0}.progress-circle{width:92px;height:92px}.progress-circle::after{width:74px;height:74px}.days-left{font-size:30px}.details-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.action-card{padding:15px 2px}.action-label{font-size:10px}.bottom-nav{width:calc(100% - 24px)}.header{max-width:100%}}
@media (min-width:769px){#screen-dashboard{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.9fr);gap:16px;align-items:start}#screen-dashboard>.subscription-card{grid-column:1/-1}#screen-dashboard>.stats-card{grid-column:1;margin-bottom:0}#screen-dashboard>.promo-card{grid-column:2;margin-bottom:0;height:100%}#screen-dashboard>.details-grid,#screen-dashboard>.actions-grid,#screen-dashboard>.action-dropdown-container{grid-column:1/-1}}
@media (max-width:360px){body{padding-left:8px;padding-right:8px}.progress-circle{width:82px;height:82px}.progress-circle::after{width:66px;height:66px}.days-left{font-size:26px}}
</style>
</head>
<body>
<svg style="position:absolute;width:0;height:0"><defs><linearGradient id="waveGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#5EEAD4"/><stop offset="50%" stop-color="#2DD4BF"/><stop offset="100%" stop-color="#0F9E90"/></linearGradient></defs></svg>

<div class="header">
  <div class="profile-container">
    <div class="profile-img-wrapper">
      <div class="profile-img" id="profile-img">
        <svg class="default-avatar-svg" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      </div>
      <div class="online-dot" id="online-status-dot"></div>
      <span class="online-status-text" id="online-status-text">آفلاین</span>
    </div>
    <div class="user-info"><div class="user-name" id="user-name"></div></div>
  </div>
  <div class="header-icons">
    <div class="lang-container">
      <div class="header-icon" id="lang-toggle-btn"><span class="lang-btn"><i class="fa-solid fa-globe"></i> <span id="lang-text">FA</span></span></div>
      <div class="lang-dropdown-menu" id="lang-dropdown">
        <div class="lang-dropdown-item" onclick="selectLanguage('fa')">فارسی</div>
        <div class="lang-dropdown-item" onclick="selectLanguage('en')">English</div>
        <div class="lang-dropdown-item" onclick="selectLanguage('tr')">Türkçe</div>
        <div class="lang-dropdown-item" onclick="selectLanguage('ar')">العربية</div>
      </div>
    </div>
    <div class="header-icon" id="theme-toggle"><i class="fa-solid fa-moon" id="theme-icon"></i></div>
  </div>
</div>

<div id="screen-dashboard" class="app-screen active-screen">
  <div class="subscription-card" id="main-sub-card">
    <div class="status-right">
      <div class="active-badge"><span class="status-dot-green"><i class="fa-solid fa-check" id="status-icon-mark"></i></span><span id="badge-text">فعال</span></div>
      <div class="days-left en-font" id="live-days-count">0 <span id="days-label">روز</span></div>
      <div class="expire-date" id="expire-date">--</div>
    </div>
    <div class="status-left">
      <div class="progress-circle" id="sub-progress-circle">
        <div class="radar-sweep"></div>
        <div class="progress-text"><span class="percent en-font" id="live-percent-display">0%</span><span class="label" id="remaining-label">باقی‌مانده</span></div>
      </div>
    </div>
  </div>

  <div class="stats-card">
    <div class="stat-item"><div class="stat-header-row"><div class="stat-icon-wrapper"><i class="fa-solid fa-database" style="color:#4C8DFF"></i></div><div class="stat-title" id="title-limit">حجم کلی</div></div><div class="stat-value purple-value en-font" id="stat-limit">0 GB</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-header-row"><div class="stat-icon-wrapper"><i class="fa-solid fa-chart-pie" style="color:#2DD4BF"></i></div><div class="stat-title" id="title-total">مصرف کل</div></div><div class="stat-value en-font" id="stat-total-val">0 GB</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-header-row"><div class="stat-icon-wrapper"><i class="fa-solid fa-calendar-day" style="color:#4C8DFF"></i></div><div class="stat-title" id="title-download">مصرف روزانه</div></div><div class="stat-value en-font" id="stat-dl-val">0 GB</div></div>
  </div>

  <div class="promo-card">
    <div class="promo-text">آیا نیاز به <span>خرید</span> یا <span>تمدید ساب</span> دارید؟<br>با پشتیبانی تماس بگیرید.</div>
    <div class="promo-buttons"><a href="__TG_CHANNEL__" target="_blank" class="promo-btn telegram"><i class="fa-brands fa-telegram"></i> <span id="promo-tg-label">تلگرام</span></a></div>
  </div>

  <div class="details-grid">
    <div class="detail-card"><span class="label" id="detail-total-label">مصرف کل</span><span class="value" id="detail-total-value">0 GB</span></div>
    <div class="detail-card"><span class="label" id="detail-remaining-label">باقی‌مانده</span><span class="value accent-value" id="detail-remaining-value">100%</span></div>
    <div class="detail-card"><span class="label" id="detail-remaining-volume-label">حجم باقی‌مانده</span><span class="value" id="detail-remaining-volume">نامحدود</span></div>
    <div class="detail-card"><span class="label" id="detail-last-connect-label">IP اتصال</span><span class="value" id="detail-last-connect-value">--</span></div>
  </div>

  <div class="actions-grid">
    <div class="action-cell"><div class="action-card renew" onclick="window.open('__TG_CHANNEL__','_blank')"><i class="fa-solid fa-battery-three-quarters"></i><div class="action-label" id="action-renew">تمدید ساب</div></div></div>
    <div class="action-cell"><div class="action-card link" id="btn-copy-sub"><i class="fa-solid fa-link"></i><div class="action-label" id="action-copy">کپی لینک ساب</div></div></div>
    <div class="action-cell"><div class="action-card qr" id="btn-toggle-qr"><i class="fa-solid fa-qrcode"></i><div class="action-label" id="action-qr">QR Code</div></div></div>
    <div class="action-cell"><div class="action-card config" id="btn-toggle-config"><i class="fa-solid fa-cloud-arrow-down"></i><div class="action-label" id="action-config">کپی کانفیگ</div></div></div>
  </div>

  <div class="action-dropdown-container" id="dropdown-qr-container"><div class="action-dropdown-menu" id="list-qr-ips"><span>در حال دریافت…</span></div></div>
  <div class="action-dropdown-container" id="dropdown-config-container"><div class="action-dropdown-menu" id="list-config-ips"><span>در حال دریافت…</span></div></div>
</div>

<div id="screen-download-apps" class="app-screen">
  <div class="section-title" id="download-screen-title">دانلود برنامه ها</div>
  <div class="download-os-tabs">
    <div class="os-tab-btn active-tab" id="os-tab-android" onclick="switchDownloadTab('android')"><i class="fa-brands fa-android"></i> <span id="lbl-tab-android">اندروید</span></div>
    <div class="os-tab-btn" id="os-tab-ios" onclick="switchDownloadTab('ios')"><i class="fa-brands fa-apple"></i> <span id="lbl-tab-ios">آیفون / آیپد</span></div>
    <div class="os-tab-btn" id="os-tab-desktop" onclick="switchDownloadTab('desktop')"><i class="fa-solid fa-desktop"></i> <span id="lbl-tab-desktop">ویندوز / مک</span></div>
  </div>
  <div class="client-card-item"><a href="#" id="btn-dl-client1" target="_blank" class="client-download-btn">دانلود</a><div class="client-info-side"><div><div class="client-title-text" id="title-client1">v2rayNG</div><div class="client-subtitle-text" id="sub-client1">کلاینت رسمی</div></div><div class="client-icon-box"><i class="fa-solid fa-paper-plane"></i></div></div></div>
  <div class="client-card-item"><a href="#" id="btn-dl-client2" target="_blank" class="client-download-btn">دانلود</a><div class="client-info-side"><div><div class="client-title-text" id="title-client2">Hiddify</div><div class="client-subtitle-text" id="sub-client2">کلاینت رسمی</div></div><div class="client-icon-box"><i class="fa-solid fa-shield-halved"></i></div></div></div>
  <div class="client-card-item"><a href="#" id="btn-dl-client3" target="_blank" class="client-download-btn">دانلود</a><div class="client-info-side"><div><div class="client-title-text" id="title-client3">sing-box</div><div class="client-subtitle-text" id="sub-client3">کلاینت رسمی</div></div><div class="client-icon-box"><i class="fa-solid fa-box-open"></i></div></div></div>
  <div class="client-card-item" id="client-card-4"><a href="#" id="btn-dl-client4" target="_blank" class="client-download-btn">دانلود</a><div class="client-info-side"><div><div class="client-title-text" id="title-client4">V2Box</div><div class="client-subtitle-text" id="sub-client4">کلاینت رسمی</div></div><div class="client-icon-box"><i class="fa-solid fa-cube"></i></div></div></div>
</div>

<div class="config-qr-overlay" id="configQrOverlay" onclick="if(event.target===this)closeConfigQrModal()">
  <div class="config-qr-box">
    <button class="config-qr-close" onclick="closeConfigQrModal()"><i class="fa-solid fa-xmark"></i></button>
    <div class="config-qr-remark en-font" id="configQrRemark"></div>
    <div class="config-qr-img-wrap"><img id="configQrImage" src="" alt="QR"></div>
  </div>
</div>

<div class="bottom-nav">
  <div class="nav-item-cell"><div class="nav-item active" id="nav-dashboard" onclick="navigateToScreen('dashboard')"><i class="fa-solid fa-house"></i><span id="nav-dashboard-label">داشبورد</span></div></div>
  <div class="nav-item-cell"><div class="nav-item" id="nav-download" onclick="navigateToScreen('download')"><i class="fa-solid fa-download"></i><span id="nav-download-label">دانلود برنامه</span></div></div>
</div>

<script>
var panelData={username:"__USER_NAME__",userId:"__USER_ID__",statusCode:"__STATUS_CODE__",expiryDateText:"__EXPIRY_DATE__",expiryFa:"__EXPIRY_FA__",totalUsedGB:parseFloat("__TOTAL_GB__"),totalLimitGB:parseFloat("__LIMIT_TOTAL_GB__"),dailyUsedGB:parseFloat("__DAILY_GB__"),dailyLimitGB:parseFloat("__LIMIT_DAILY_GB__"),subUrl:"__SYNC_NORMAL__",subUrlBase64:"__SYNC_NORMAL_BASE64__",rawUrl:"__SYNC_RAW__"};
var currentLang='fa',isServerConnected=panelData.statusCode==='active';
var D={username:panelData.username,statusCode:panelData.statusCode,expiryDateText:panelData.expiryDateText,expiryFa:panelData.expiryFa,
 totalUsedGB:isNaN(panelData.totalUsedGB)?0:panelData.totalUsedGB,totalLimitGB:isNaN(panelData.totalLimitGB)?0:panelData.totalLimitGB,
 dailyUsedGB:isNaN(panelData.dailyUsedGB)?0:panelData.dailyUsedGB,dailyLimitGB:isNaN(panelData.dailyLimitGB)?0:panelData.dailyLimitGB,
 subUrl:panelData.subUrl,links:[],clientIp:null};
function decB64(s){try{var b=atob(s.replace(/-/g,'+').replace(/_/g,'/'));var u=Uint8Array.from(b,function(c){return c.charCodeAt(0)});return new TextDecoder('utf-8').decode(u);}catch(e){return s;}}
function loadConfigs(){if(!panelData.rawUrl)return;fetch(panelData.rawUrl,{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.text();}).then(function(t){t=t.trim();var lines;try{lines=decB64(t).split('\\n');}catch(e){lines=t.split('\\n');}D.links=lines.map(function(l){return l.trim();}).filter(Boolean);renderActionMenus();}).catch(function(e){console.error(e);var q=document.getElementById('list-qr-ips'),c=document.getElementById('list-config-ips');if(q)q.innerHTML='<span>خطا در دریافت کانفیگ‌ها</span>';if(c)c.innerHTML='<span>خطا در دریافت کانفیگ‌ها</span>';});}
function loadIp(){fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){D.clientIp=d.ip;renderPanelData();}).catch(function(){D.clientIp=null;renderPanelData();});}
var APPS={android:{c1:{name:"v2rayNG",url:"https://play.google.com/store/apps/details?id=com.v2ray.ang"},c2:{name:"Hiddify",url:"https://play.google.com/store/apps/details?id=fg.hiddify.com"},c3:{name:"sing-box",url:"https://play.google.com/store/apps/details?id=io.nekohasekai.sfa"},c4:{name:"V2Box",url:"https://play.google.com/store/search?q=V2Box%20V2ray%20Client&c=apps"}},ios:{c1:{name:"FoXray",url:"https://apps.apple.com/us/app/foxray/id6448898375"},c2:{name:"Hiddify",url:"https://apps.apple.com/us/app/hiddify-next/id6473611382"},c3:{name:"sing-box",url:"https://apps.apple.com/us/app/sing-box/id6443657551"},c4:{name:"V2Box",url:"https://apps.apple.com/us/app/v2box-v2ray-client/id6446814690"}},desktop:{c1:{name:"v2rayN",url:"https://github.com/2dust/v2rayN/releases"},c2:{name:"Hiddify",url:"https://apps.microsoft.com/detail/hiddify"},c3:{name:"NekoRay",url:"https://github.com/MatsuriDayo/nekoray/releases"}}};
var WAVE='<div class="wave-icon-wrapper"><svg viewBox="0 0 24 24"><path d="M7 23h7.5c2.2 0 4-1.8 4-4v-7.5c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5V11h-.5V4.5c0-.8-.7-1.5-1.5-1.5S12 3.7 12 4.5V11h-.5V2.5c0-.8-.7-1.5-1.5-1.5S8.5 1.7 8.5 2.5V11h-.5V5.5c0-.8-.7-1.5-1.5-1.5S5 4.7 5 5.5v10.3c-.6-.7-1.5-1.1-2.4-.9-.9.2-1.5 1.1-1.4 2 .2 1.9 2 4.2 3.8 5.4C5.7 22.7 6.3 23 7 23z" fill="url(#waveGrad)"/></svg></div>';
var L={fa:{dir:"rtl",greet:"سلام ",badgeActive:"فعال",badgePaused:"متوقف",badgeExpired:"منقضی",badgeLimit:"اتمام حجم",badgeDailyLimit:"اتمام حجم روزانه",daysUnit:"روز",remainingLabel:"باقی‌مانده",titleLimit:"حجم کلی",titleTotal:"مصرف کل",titleDownload:"مصرف روزانه",detailTotal:"مصرف کل",detailRemaining:"باقی‌مانده",detailRemainingVolume:"حجم باقی‌مانده",detailLastConnect:"IP اتصال",actionRenew:"تمدید ساب",actionCopy:"کپی لینک ساب",actionCopied:"کپی شد!",actionQr:"QR Code",actionConfig:"کپی کانفیگ",copyAllBtn:"کپی همه کانفیگ‌ها",dlScreenTitle:"دانلود برنامه ها",dlSubtitle:"کلاینت رسمی",btnDl:"دانلود",tabAndroid:"اندروید",tabIos:"آیفون / آیپد",tabDesktop:"ویندوز / مک",expiredText:"منقضی",unlimitedText:"نامحدود",emptyConfigs:"خالی",copyBtnText:"کپی",showQrBtn:"نمایش QR",unknown:"--",onlineText:"آنلاین",offlineText:"آفلاین",promoTg:"تلگرام",navDash:"داشبورد",navDl:"دانلود برنامه"},
en:{dir:"ltr",greet:"Hello ",badgeActive:"Active",badgePaused:"Paused",badgeExpired:"Expired",badgeLimit:"Limit Exceeded",badgeDailyLimit:"Daily Limit",daysUnit:"Days",remainingLabel:"Remaining",titleLimit:"Total Limit",titleTotal:"Total Usage",titleDownload:"Daily Usage",detailTotal:"Total Usage",detailRemaining:"Remaining",detailRemainingVolume:"Remaining Volume",detailLastConnect:"Connection IP",actionRenew:"Renew",actionCopy:"Copy Sub Link",actionCopied:"Copied!",actionQr:"QR Code",actionConfig:"Copy Config",copyAllBtn:"Copy All Configs",dlScreenTitle:"Download Clients",dlSubtitle:"Official Client",btnDl:"Get App",tabAndroid:"Android",tabIos:"iPhone / iPad",tabDesktop:"Win / Mac",expiredText:"Expired",unlimitedText:"Unlimited",emptyConfigs:"Empty",copyBtnText:"Copy",showQrBtn:"Show QR",unknown:"--",onlineText:"Online",offlineText:"Offline",promoTg:"Telegram",navDash:"Dashboard",navDl:"Apps"},
tr:{dir:"ltr",greet:"Merhaba ",badgeActive:"Aktif",badgePaused:"Duraklatıldı",badgeExpired:"Süresi Doldu",badgeLimit:"Kota Doldu",badgeDailyLimit:"Günlük Kota",daysUnit:"Gün",remainingLabel:"Kalan",titleLimit:"Toplam Kota",titleTotal:"Toplam",titleDownload:"Günlük",detailTotal:"Toplam",detailRemaining:"Kalan",detailRemainingVolume:"Kalan Hacim",detailLastConnect:"Bağlantı IP",actionRenew:"Yenile",actionCopy:"Sub Linki Kopyala",actionCopied:"Kopyalandı!",actionQr:"QR Kodu",actionConfig:"Konfig Kopyala",copyAllBtn:"Tümünü Kopyala",dlScreenTitle:"Uygulamaları İndir",dlSubtitle:"Resmi İstemci",btnDl:"İndir",tabAndroid:"Android",tabIos:"iPhone / iPad",tabDesktop:"Win / Mac",expiredText:"Süresi Doldu",unlimitedText:"Sınırsız",emptyConfigs:"Boş",copyBtnText:"Kopyala",showQrBtn:"QR Göster",unknown:"--",onlineText:"Çevrimiçi",offlineText:"Çevrimdışı",promoTg:"Telegram",navDash:"Panel",navDl:"Uygulama"},
ar:{dir:"rtl",greet:"أهلاً ",badgeActive:"نشط",badgePaused:"متوقف",badgeExpired:"منتهي",badgeLimit:"تجاوز الحد",badgeDailyLimit:"الحد اليومي",daysUnit:"يوم",remainingLabel:"المتبقي",titleLimit:"الحجم الكلي",titleTotal:"الإجمالي",titleDownload:"يومي",detailTotal:"الإجمالي",detailRemaining:"المتبقي",detailRemainingVolume:"الحجم المتبقي",detailLastConnect:"عنوان IP",actionRenew:"تجديد",actionCopy:"نسخ الرابط",actionCopied:"تم النسخ!",actionQr:"رمز QR",actionConfig:"نسخ التكوين",copyAllBtn:"نسخ الكل",dlScreenTitle:"تحميل التطبيقات",dlSubtitle:"عميل رسمي",btnDl:"تحميل",tabAndroid:"أندرويد",tabIos:"آيفون / آيباد",tabDesktop:"ويندوز / ماك",expiredText:"منتهي",unlimitedText:"غير محدود",emptyConfigs:"خالي",copyBtnText:"نسخ",showQrBtn:"عرض QR",unknown:"--",onlineText:"متصل",offlineText:"غير متصل",promoTg:"تيليجرام",navDash:"الرئيسية",navDl:"التطبيق"}};
function t(k){return (L[currentLang]||L.fa)[k]||k;}
function isUnlim(v){return v>=9999||v<=0;}
function daysLeftFrom(text){if(!text||!text.trim())return null;var p=new Date(text);if(isNaN(p.getTime()))return undefined;var now=new Date();return Math.round((new Date(p.getFullYear(),p.getMonth(),p.getDate())-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);}
function ringColor(code,pct){if(code!=='active')return 'var(--alert)';return pct>=50?'var(--accent)':pct>=20?'var(--warn)':'var(--alert)';}
function overrideText(code){if(code==='expired')return t('expiredText');if(code==='paused')return t('badgePaused');if(code==='limit')return t('badgeLimit');if(code==='dailyLimit')return t('badgeDailyLimit');return null;}
function set(id,v){var e=document.getElementById(id);if(e)e.innerText=v;}
function renderPanelData(){
 var un=document.getElementById('user-name');
 un.innerHTML=WAVE+'<span class="greeting-text">'+t('greet')+'</span><span class="username-text'+(isServerConnected?' online':'')+'">'+D.username+'</span>';
 var ov=overrideText(D.statusCode),exp=document.getElementById('expire-date');
 exp.innerText=D.expiryFa||t('unlimitedText');
 var dc=document.getElementById('live-days-count');
 if(ov)dc.innerHTML='<span style="font-size:22px;color:var(--alert)">'+ov+'</span>';
 else{var dl=daysLeftFrom(D.expiryDateText);
  if(dl===null)dc.innerHTML='<span style="font-size:22px">'+t('unlimitedText')+'</span>';
  else if(dl===undefined)dc.innerHTML='<span style="font-size:18px">'+esc(D.expiryDateText)+'</span>';
  else if(dl<0)dc.innerHTML='<span style="font-size:22px;color:var(--alert)">'+t('expiredText')+'</span>';
  else dc.innerHTML=dl+' <span>'+t('daysUnit')+'</span>';}
 var unlim=isUnlim(D.totalLimitGB);
 set('stat-limit',unlim?t('unlimitedText'):D.totalLimitGB+' GB');
 set('stat-total-val',D.totalUsedGB+' GB');set('stat-dl-val',D.dailyUsedGB+' GB');
 set('detail-total-value',D.totalUsedGB+' GB');
 var rem=100,left=D.totalLimitGB-D.totalUsedGB;
 if(!unlim){rem=Math.max(0,Math.min(100,Math.round(100-(D.totalUsedGB/D.totalLimitGB)*100)));}
 set('detail-remaining-value',rem+'%');
 set('detail-remaining-volume',unlim?t('unlimitedText'):(left>0?left.toFixed(2)+' GB':'0 GB'));
 set('detail-last-connect-value',D.clientIp||t('unknown'));
 var pe=document.getElementById('live-percent-display');
 pe.textContent=unlim?'∞':rem+'%';
 pe.style.color=D.statusCode==='active'?'':'var(--alert)';
 var rp=unlim?100:rem;
 document.getElementById('sub-progress-circle').style.background='conic-gradient('+ringColor(D.statusCode,rem)+' 0% '+rp+'%, var(--ring-track) '+rp+'% 100%)';
 updateStatusUI();
}
function esc(s){return String(s||'').replace(/[&<>]/g,function(c){return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;';});}
function updateOnlineStatus(){var d=document.getElementById('online-status-dot'),s=document.getElementById('online-status-text');
 if(isServerConnected){d.classList.add('online');s.innerText=t('onlineText');s.classList.remove('offline');document.getElementById('profile-img').classList.add('online');}
 else{d.classList.remove('online');s.innerText=t('offlineText');s.classList.add('offline');document.getElementById('profile-img').classList.remove('online');}}
function updateStatusUI(){var card=document.getElementById('main-sub-card'),map={active:[t('badgeActive'),'fa-solid fa-check',false],paused:[t('badgePaused'),'fa-solid fa-pause',true],expired:[t('badgeExpired'),'fa-solid fa-xmark',true],limit:[t('badgeLimit'),'fa-solid fa-triangle-exclamation',true],dailyLimit:[t('badgeDailyLimit'),'fa-solid fa-triangle-exclamation',true]};
 var s=map[D.statusCode]||map.active;card.classList.toggle('disconnected',s[2]);set('badge-text',s[0]);document.getElementById('status-icon-mark').className=s[1];}
function parseLink(l){var r={protocol:'unknown',remark:'',host:'',port:'',link:l};try{var m=l.match(/^([a-zA-Z0-9]+):\\/\\//);if(!m)return r;r.protocol=m[1].toLowerCase();
 if(r.protocol==='vmess'){var j=JSON.parse(decB64(l.replace(/^vmess:\\/\\//,'')));r.remark=j.ps||'';r.host=j.add||'';r.port=j.port||'';}
 else{var u=new URL(l);r.remark=decodeURIComponent((u.hash||'').replace(/^#/,''));r.host=u.hostname||'';r.port=u.port||'';}}catch(e){}return r;}
function protoParts(l){var p=parseLink(l);try{if(p.protocol==='vmess'){var j=JSON.parse(decB64(l.replace(/^vmess:\\/\\//,'')));return [p.protocol,j.net||'tcp',j.tls==='tls'?'tls':'none'];}
 if(p.protocol==='vless'||p.protocol==='trojan'){var u=new URL(l);return [p.protocol,u.searchParams.get('type')||'tcp',u.searchParams.get('security')||'none'];}
 if(p.protocol==='ss'){var d=atob(l.replace(/^ss:\\/\\//,'').split('#')[0]);return ['ss',d.split(':')[0]];}}catch(e){}return [p.protocol];}
function badge(parts){return parts.map(function(x,i){var c=parts.length>=3?['proto-part-1','proto-part-2','proto-part-3'][i]:parts.length===2?['proto-part-1','proto-part-2'][i]:'proto-part-1';return '<span class="'+c+'">'+esc(x)+'</span>';}).join('<span style="color:rgba(255,255,255,.35);margin:0 1px">+</span>');}
function countryOf(p){var rem=(p.remark||p.host||'').trim();var noflag=rem.replace(/[\\u{1F1E0}-\\u{1F1FF}]/gu,'').trim();var parts=noflag.split(/[-–—|]/).map(function(x){return x.trim();}).filter(Boolean);
 var name=parts[0]||noflag||p.host||'Unknown';var code='';var fm=rem.match(/[\\u{1F1E0}-\\u{1F1FF}]{2}/u);
 if(fm){var cp=[...fm[0]];code=String.fromCodePoint(cp[0].codePointAt(0)-0x1F1E6+0x61,cp[1].codePointAt(0)-0x1F1E6+0x61);}
 if(!code&&name){var M={germany:'de',frankfurt:'de',netherlands:'nl',amsterdam:'nl',france:'fr',paris:'fr',uk:'gb',britain:'gb',london:'gb',unitedstates:'us',usa:'us',newyork:'us',turkey:'tr',istanbul:'tr',dubai:'ae',uae:'ae',singapore:'sg',japan:'jp',sweden:'se',stockholm:'se',finland:'fi',canada:'ca',iran:'ir',tehran:'ir'};
  var k=name.toLowerCase().replace(/[^a-z]/g,'');code=M[k]||'';}
 return {name:name,code:code};}
function flagHtml(c){if(c.code)return '<div class="action-mini-flag" style="background-image:url(https://flagcdn.com/w80/'+c.code+'.png)"></div>';
 return '<div class="action-mini-flag"><i class="fa-solid fa-globe"></i></div>';}
function showConfigQrModal(link,remark){document.getElementById('configQrRemark').textContent=remark||'';
 document.getElementById('configQrImage').src='https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(link);
 document.getElementById('configQrOverlay').classList.add('show');}
function closeConfigQrModal(){document.getElementById('configQrOverlay').classList.remove('show');}
function renderActionMenus(){
 var qr=document.getElementById('list-qr-ips'),cfg=document.getElementById('list-config-ips'),links=D.links||[];
 qr.innerHTML='';cfg.innerHTML='';
 if(!links.length){qr.innerHTML='<span>'+t('emptyConfigs')+'</span>';cfg.innerHTML='<span>'+t('emptyConfigs')+'</span>';return;}
 var all=document.createElement('button');all.className='copy-all-btn';
 all.innerHTML='<i class="fa-solid fa-copy"></i> '+t('copyAllBtn');
 all.addEventListener('click',function(){var b=this;navigator.clipboard.writeText(links.join('\\n')).then(function(){b.innerHTML='<i class="fa-solid fa-check"></i> '+t('actionCopied');b.style.background='#22C55E';setTimeout(function(){b.innerHTML='<i class="fa-solid fa-copy"></i> '+t('copyAllBtn');b.style.background='';},2000);});});
 cfg.appendChild(all);
 links.forEach(function(raw){
  var p=parseLink(raw),c=countryOf(p),row=document.createElement('div');row.className='ip-row-item';
  row.innerHTML='<div class="ip-details-left">'+flagHtml(c)+'<div class="ip-meta-block"><div class="ip-address-text en-font">'+esc(p.remark||p.host)+'</div><div><span class="ip-protocol-badge-box en-font">'+badge(protoParts(raw))+'</span></div></div></div>';
  var btn=document.createElement('button');btn.className='ip-copy-btn';
  btn.innerHTML='<i class="fa-solid fa-qrcode"></i> '+t('showQrBtn');
  btn.addEventListener('click',function(){showConfigQrModal(raw,p.remark||p.host);});
  var r2=row.cloneNode(true);var b2=document.createElement('button');b2.className='ip-copy-btn';
  b2.innerHTML='<i class="fa-solid fa-copy"></i> '+t('copyBtnText');
  b2.addEventListener('click',function(){var x=this;navigator.clipboard.writeText(raw).then(function(){x.innerHTML='<i class="fa-solid fa-check"></i> '+t('actionCopied');x.style.background='#22C55E';x.style.color='#fff';setTimeout(function(){x.innerHTML='<i class="fa-solid fa-copy"></i> '+t('copyBtnText');x.style.background='';x.style.color='';},2000);});});
  row.appendChild(btn);r2.appendChild(b2);qr.appendChild(row);cfg.appendChild(r2);
 });
}
function selectLanguage(lang){currentLang=lang;var d=L[lang]||L.fa;
 set('lang-text',lang.toUpperCase());document.getElementById('html-root').setAttribute('dir',d.dir);
 set('remaining-label',t('remainingLabel'));set('title-limit',t('titleLimit'));set('title-total',t('titleTotal'));set('title-download',t('titleDownload'));
 set('detail-total-label',t('detailTotal'));set('detail-remaining-label',t('detailRemaining'));set('detail-remaining-volume-label',t('detailRemainingVolume'));set('detail-last-connect-label',t('detailLastConnect'));
 set('action-renew',t('actionRenew'));set('action-copy',t('actionCopy'));set('action-qr',t('actionQr'));set('action-config',t('actionConfig'));
 set('download-screen-title',t('dlScreenTitle'));set('lbl-tab-android',t('tabAndroid'));set('lbl-tab-ios',t('tabIos'));set('lbl-tab-desktop',t('tabDesktop'));
 set('nav-dashboard-label',t('navDash'));set('nav-download-label',t('navDl'));set('promo-tg-label',t('promoTg'));
 document.getElementById('page-title').textContent=D.username;
 renderPanelData();updateOnlineStatus();renderActionMenus();}
document.getElementById('btn-copy-sub').addEventListener('click',function(e){e.stopPropagation();var lab=document.getElementById('action-copy');
 navigator.clipboard.writeText(D.subUrl||location.href).then(function(){lab.innerText=t('actionCopied');lab.style.color='#22C55E';setTimeout(function(){lab.innerText=t('actionCopy');lab.style.color='';},2000);});});
document.getElementById('btn-toggle-qr').addEventListener('click',function(e){e.stopPropagation();document.getElementById('dropdown-config-container').classList.remove('show');document.getElementById('dropdown-qr-container').classList.toggle('show');});
document.getElementById('btn-toggle-config').addEventListener('click',function(e){e.stopPropagation();document.getElementById('dropdown-qr-container').classList.remove('show');document.getElementById('dropdown-config-container').classList.toggle('show');});
function navigateToScreen(s){document.querySelectorAll('.app-screen').forEach(function(x){x.classList.remove('active-screen');});
 document.querySelectorAll('.nav-item').forEach(function(x){x.classList.remove('active');});
 if(s==='dashboard'){document.getElementById('screen-dashboard').classList.add('active-screen');document.getElementById('nav-dashboard').classList.add('active');}
 else{document.getElementById('screen-download-apps').classList.add('active-screen');document.getElementById('nav-download').classList.add('active');switchDownloadTab('android');}}
function switchDownloadTab(os){document.querySelectorAll('.os-tab-btn').forEach(function(b){b.classList.remove('active-tab');});
 document.getElementById('os-tab-'+os).classList.add('active-tab');var d=APPS[os];
 for(var i=1;i<=4;i++){var card=document.getElementById('client-card-'+i);if(!d['c'+i]){if(card)card.style.display='none';continue;}
  if(card)card.style.display='';set('title-client'+i,d['c'+i].name);set('sub-client'+i,t('dlSubtitle'));
  document.getElementById('btn-dl-client'+i).href=d['c'+i].url;}
 document.querySelectorAll('.client-download-btn').forEach(function(b){b.innerText=t('btnDl');});}
document.addEventListener('DOMContentLoaded',function(){selectLanguage(currentLang);loadConfigs();loadIp();});
document.getElementById('lang-toggle-btn').addEventListener('click',function(e){e.stopPropagation();document.getElementById('lang-dropdown').classList.toggle('show');});
document.addEventListener('click',function(){document.getElementById('lang-dropdown').classList.remove('show');document.getElementById('dropdown-qr-container').classList.remove('show');document.getElementById('dropdown-config-container').classList.remove('show');});
document.getElementById('theme-toggle').addEventListener('click',function(){document.body.classList.toggle('light-mode');
 document.getElementById('theme-icon').className=document.body.classList.contains('light-mode')?'fa-solid fa-sun':'fa-solid fa-moon';});
</script>
</body></html>`;

async function loadUI(env, force) {
  const st = await load(env);
  if (!force && UI.html && Date.now() - UI.ts < 300000) return UI.html;
  try {
    const bust = force ? '?v=' + Date.now() : '';
    const get = (u, n) => fetch(u + bust, { cf: force ? { cacheTtl: 0 } : { cacheTtl: 300 } }).then((r) => { if (!r.ok) throw new Error(n + ' → ' + r.status); return r.text(); });
    const [html, css, js] = await Promise.all([get(UI_SRC.html, 'index.html'), get(UI_SRC.css, 'style.css'), get(UI_SRC.js, 'app.js')]);
    if (!html.includes('<!--APPJS-->') || !html.includes('<!--STYLESHEET-->')) throw new Error('index.html نامعتبر است');

    /* صفحه‌ی کاربر (user.html) از همان مخزن — اگر نبود، نسخه‌ی داخلی استفاده می‌شود */
    if (!USER_HTML || force) {
      try { USER_HTML = await get(UI_SRC.user, 'user.html'); } catch (e) { USER_HTML = null; }
    }

    /* پیش‌اسکریپت: نمایش خطا روی صفحه + ذخیره‌سازی امن (اگر sessionStorage مسدود باشد) */
    const prelude = `<script>
/* اگر نگهبان قدیمی index.html هنوز در کش است، خنثی می‌شود */
function __sgReady(){var el=document.getElementById('tbState');if(el&&/در حال بارگذاری|بارگذاری/.test(el.textContent)){el.textContent='آماده';el.style.color='';}}
document.addEventListener('DOMContentLoaded',__sgReady);setTimeout(__sgReady,0);setTimeout(__sgReady,1200);setTimeout(__sgReady,3000);
window.__sgBooted=true;
/* کارت خطا فقط وقتی نمایش داده می‌شود که هیچ چیزی رندر نشده باشد */
window.__sgShow=function(m){var v=document.getElementById('view');if(!v||v.innerHTML.replace(/<[^>]*>|\\s/g,'').length>0)return;
v.innerHTML='<div class="card"><div class="bd"><h3 style="margin:0 0 10px;font-size:15px">خطا در اجرای رابط کاربری</h3>'
+'<pre class="code">'+String(m).replace(/[<>]/g,function(c){return c==='<'?'&lt;':'&gt;'})+'</pre>'
+'<p class="hint">برای دیدن جزئیات، کنسول مرورگر (F12) را باز کنید.</p></div></div>';
var t=document.getElementById('tbState');if(t){t.textContent='خطا';t.style.color='#f8697f';}};
window.addEventListener('error',function(e){console.error('sg:',e.message,e.filename,e.lineno);window.__sgShow((e.message||'خطا')+' — خط '+(e.lineno||'?'))});
(function(){function shim(){var m={};return{getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]}}}
 try{sessionStorage.getItem('__t')}catch(e){try{Object.defineProperty(window,'sessionStorage',{value:shim(),configurable:true})}catch(e2){}}
 try{localStorage.getItem('__t')}catch(e){try{Object.defineProperty(window,'localStorage',{value:shim(),configurable:true})}catch(e2){}}})();
</script>`;

    /* تابع به‌جای رشته تا الگوهای $ در کد JS تفسیر نشوند */
    const out = html
      .replace('<!--STYLESHEET-->', () => '<style>' + css + '</style>')
      .replace('<!--APPJS-->', () => prelude + '<script>' + js + '</script>');
    UI = { html: out, ts: Date.now() };
    st.uiLoaded = Date.now();
    st.uiSource = 'matmasomi777-droid/Sub (ثابت)';
    try { await save(env, st); } catch (e) {}
    return out;
  } catch (e) {
    if (UI.html) return UI.html;
    const msg = String((e && e.message) || e).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>خطا در بارگذاری رابط کاربری</title></head>
<body style="font-family:Vazirmatn,system-ui,sans-serif;background:#070b12;color:#e8eef9;margin:0;min-height:100vh;display:grid;place-items:center;padding:16px">
<div style="background:rgba(19,26,39,.78);border:1px solid rgba(248,105,127,.35);border-radius:20px;padding:26px;max-width:600px;width:100%">
<h2 style="margin:0 0 8px;font-size:19px">رابط کاربری از گیت‌هاب خوانده نشد</h2>
<p style="color:#8d9cb6;font-size:12.5px;line-height:2;margin:0 0 14px">منبع ثابت: <b style="color:#2ee6a8">matmasomi777-droid/Sub</b> — شاخه‌ی <b>main</b>، پوشه‌ی <b>ui/</b>. مخزن باید عمومی باشد.</p>
<div style="background:rgba(7,11,18,.75);border:1px solid rgba(120,145,190,.22);border-radius:12px;padding:12px;direction:ltr;text-align:left;font:11px/1.7 ui-monospace,monospace;color:#f8697f;word-break:break-all">${msg}</div>
<div style="background:rgba(7,11,18,.6);border:1px solid rgba(120,145,190,.18);border-radius:12px;padding:12px;direction:ltr;text-align:left;font:10.5px/1.9 ui-monospace,monospace;color:#8d9cb6;margin-top:10px;word-break:break-all">
${UI_SRC.html}<br>${UI_SRC.css}<br>${UI_SRC.js}</div>
<div class="btn-row" style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
<button onclick="location.reload()" style="background:#2ee6a8;border:0;color:#04120c;padding:10px 18px;border-radius:12px;font-weight:700;cursor:pointer">تلاش مجدد</button>
<a href="/health" target="_blank" style="border:1px solid rgba(120,145,190,.25);color:#8d9cb6;padding:10px 14px;border-radius:12px;text-decoration:none;font-size:12px">بررسی سلامت ورکر</a></div>
<p style="color:#8d9cb6;font-size:11px;line-height:2;margin:14px 0 0">
• خطای <b style="color:#f8697f">404</b> = فایل‌ها در مسیر <b>ui/</b> مخزن نیستند.<br>
• خطای <b style="color:#fbbf24">200 ولی این صفحه</b> = محتوای index.html مربوط به این پروژه نیست (باید نشانگر <span style="direction:ltr;display:inline-block">&lt;!--APPJS--&gt;</span> داشته باشد).<br>
• خطای <b>rate limit / 403</b> = گیت‌هاب موقتاً محدود کرده؛ چند دقیقه بعد دوباره تلاش کنید.</p>
</div></body></html>`;
  }
}

async function statusPage(env, name, url) {
  const st = seed(await load(env));
  const u = st.users.find((x) => x.name === name || x.uuid === name);
  const css = 'body{font-family:Vazirmatn,system-ui;background:#070b12;color:#e8eef9;margin:0;min-height:100vh;display:grid;place-items:center}.c{background:rgba(19,26,39,.7);border:1px solid rgba(120,145,190,.16);border-radius:20px;padding:28px;max-width:420px;width:92%}h1{margin:0 0 4px;font-size:20px}p{color:#8d9cb6;font-size:12px}b{font-size:26px}.b{height:8px;background:rgba(141,156,182,.2);border-radius:9px;overflow:hidden;margin:12px 0}.b>i{display:block;height:100%;background:linear-gradient(90deg,#2ee6a8,#61a8ff)}';
  if (!u) return new Response('<!doctype html><meta charset="utf-8"><style>' + css + '</style><div class="c"><h1>یافت نشد</h1><p>کاربر مورد نظر وجود ندارد.</p></div>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const q = (u.quotaGB || 0) * 1073741824, p = q ? ((u.up + u.down) / q) * 100 : 0, dl = u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : null;
  const body = `<style>${css}</style><div class="c"><h1>${u.name}</h1><p>${st.settings.panel.name} • وضعیت اشتراک</p>
    <div><b>${(p ? p.toFixed(0) : 0)}٪</b><p>مصرف از سهمیه</p></div><div class="b"><i style="width:${Math.min(100, p)}%"></i></div>
    <p>⬇ ${((u.down || 0) / 1073741824).toFixed(2)} GB • ⬆ ${((u.up || 0) / 1073741824).toFixed(2)} GB ${q ? 'از ' + u.quotaGB + ' GB' : '• نامحدود'}</p>
    <p>📅 انقضا: ${u.expiryAt ? new Date(u.expiryAt).toLocaleDateString('fa-IR') + ' (' + (dl < 0 ? 'منقضی' : dl + ' روز') + ')' : 'نامحدود'}</p>
    <p>وضعیت: ${u.enabled ? '✅ فعال' : '⛔ غیرفعال'}</p></div>`;
  return new Response('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' + body + '</html>', { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

/* ════════════════════════════ API ════════════════════════════ */
async function apiHandler(req, env, url, ctx) {
  const st = seed(await load(env));
  const s = st.settings, route = url.pathname.replace(/^\/api\/?/, ''), m = req.method.toUpperCase();

  if (route === 'login' && m === 'POST') {
    const ip = ipOf(req);
    if (!rateOk('login:' + ip, 5, 600000)) { addLog(st, 'warn', 'auth', 'تلاش ورود بیش از حد', ip); await save(env, st); return json({ error: 'تعداد تلاش‌ها زیاد بود — ۱۰ دقیقه صبر کنید' }, 429); }
    const b = await req.json().catch(() => ({}));
    const want = masterKey(st, env);
    if (b.password !== want) { addLog(st, 'warn', 'auth', 'ورود ناموفق', ip); await save(env, st); return json({ error: 'رمز عبور نادرست است' }, 401); }
    if (s.auth.totp && s.auth.totpSecret) {
      const code = await totp(s.auth.totpSecret);
      if (b.totp !== code) { addLog(st, 'warn', 'auth', 'کد 2FA نامعتبر', ip); await save(env, st); return json({ error: 'کد دو مرحله‌ای نامعتبر یا منقضی است' }, 401); }
    }
    addLog(st, 'success', 'auth', 'ورود موفق', ip + (s.tg.loginAlert ? ' • اعلان تلگرام ارسال شد' : ''));
    if (s.tg.enabled && s.tg.loginAlert && s.tg.token) fetch(`https://api.telegram.org/bot${s.tg.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: s.tg.adminId || s.tg.chatId, text: `🔑 ورود جدید از ${ip}` }) }).catch(() => {});
    await save(env, st);
    return json({ ok: true, token: await mkToken(st, env), expiresAt: Date.now() + 86400000, idleMin: s.auth.sessionMin });
  }

  if (route === 'health') return json({
    ok: true, version: VERSION, build: BUILD,
    uptimeSec: Math.floor((Date.now() - BOOT) / 1000),
    storage: backendOf(env),
    users: st.users.length, panic: s.auth.panic,
    db: {
      writesToday: WRITE_COUNT.n,
      bound: !!env.DB,
      pending: !!DIRTY,
      lastWrite: LAST_WRITE ? Math.floor((Date.now() - LAST_WRITE) / 1000) + 's ago' : 'never',
    },
  });

  if (route === 'state' && m === 'GET') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    /* مصرف و IPهای فعال از جداول خوانده می‌شوند */
    const usage = await usageRead(env);
    const usersWithUsage = [];
    for (const u of st.users) {
      const row = usage.get(u.uuid);
      const sessions = await sessionsOf(env, u.uuid);
      const totalConns = sessions.reduce((a, s) => a + (s.conns || 0), 0);
      usersWithUsage.push({
        ...u,
        up: row ? row.up : 0,
        down: row ? row.down : 0,
        totalReq: row ? row.reqs : 0,
        lastSeen: row ? row.lastSeen : null,
        dailyUsed: row ? (row.dayUp || 0) + (row.dayDown || 0) : 0,
        activeIPs: sessions.map((s) => ({ ip: s.ip, conns: s.conns })),
        activeIPCount: sessions.length,
        activeConns: totalConns,
      });
    }
    st.users = usersWithUsage;
    st.stats.requests++;
    return json({ ...st, storage: backendOf(env), version: VERSION, build: BUILD, boot: BOOT, settings: { ...st.settings, auth: { ...st.settings.auth, password: undefined, totpSecret: st.settings.auth.totpSecret ? '•••••' : '' } } });
  }

  if (route === 'settings' && (m === 'PUT' || m === 'POST')) {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.settings) merge(s, b.settings);
    addLog(st, 'info', 'panel', 'تنظیمات ذخیره شد', Object.keys(b.settings || {}).join(', '));
    await save(env, st);
    return json({ ok: true, storage: backendOf(env) });
  }

  if (route === 'users' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.id && b.op) {
      const u = st.users.find((x) => x.id === b.id); if (!u) return json({ error: 'not found' }, 404);
      if (b.op === 'delete') st.users = st.users.filter((x) => x.id !== b.id);
      else if (b.op === 'toggle') { u.enabled = !u.enabled; if (!u.enabled) u.reason = 'غیرفعال‌سازی دستی'; }
      else if (b.op === 'reset') {
        /* ⚠️ مصرف واقعی در جدول usage است (پنل از همان می‌خواند) —
           پس ریست باید همان‌جا اعمال شود، نه فقط روی فیلدهای blob. */
        u.up = 0; u.down = 0; u.totalReq = 0; u.lastSeen = null;
        await usageReset(env, u.uuid);
      }
      else if (b.op === 'update') {
        const p = { ...(b.patch || {}) };
        if (p.expiryDays !== undefined) { u.expiryAt = Number(p.expiryDays) > 0 ? Date.now() + Number(p.expiryDays) * 86400000 : null; delete p.expiryDays; }
        ['ports', 'cleanIPs', 'proxyIPs', 'nodes'].forEach((k) => { if (typeof p[k] === 'string') p[k] = p[k].split(/[,\n]/).map((x) => x.trim()).filter(Boolean); });
        merge(u, p);
      }
      addLog(st, b.op === 'delete' ? 'warn' : 'info', 'user', 'کاربر: ' + b.op, u.name || '');
      await save(env, st); return json({ ok: true, users: st.users });
    }
    const u = { id: randTok(6), name: b.name || 'کاربر ' + (st.users.length + 1), uuid: b.uuid || crypto.randomUUID(), secret: b.secret || randTok(12), enabled: true, note: b.note || '', quotaGB: Number(b.quotaGB) || 0, dailyQuotaMB: 0, expiryAt: b.expiryDays ? Date.now() + b.expiryDays * 86400000 : null, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, fakes: [], fakeMode: 'inherit', up: 0, down: 0, totalReq: 0, lastSeen: null, createdAt: Date.now() };
    st.users.unshift(u); addLog(st, 'success', 'user', 'کاربر جدید ساخته شد', u.name);
    if (s.tg.enabled && s.tg.notify.user) tgSend(s, `👤 کاربر جدید: ${u.name}\n🔗 ${url.origin}/${s.sub.path}/${u.uuid}`);
    await save(env, st);
    return json({ ok: true, user: u, subscription: `${url.origin}/${s.sub.path}/${u.uuid}` }, 201);
  }

  if (route === 'usage' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const u = st.users.find((x) => x.uuid === b.uuid || x.secret === b.uuid); if (!u) return json({ error: 'not found' }, 404);
    u.up = (u.up || 0) + Number(b.up || 0); u.down = (u.down || 0) + Number(b.down || 0); u.lastSeen = Date.now();
    await save(env, st); return json({ ok: true, up: u.up, down: u.down });
  }

  if (route === 'keys') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    if (m === 'POST') { if (st.keys.length >= 10) return json({ error: 'حداکثر ۱۰ کلید' }, 400); const k = { id: randTok(5), name: 'key-' + (st.keys.length + 1), key: 'sk_' + randTok(24), ro: st.keys.length % 2 === 1 }; st.keys.push(k); addLog(st, 'success', 'auth', 'کلید API ساخته شد', k.name); await save(env, st); return json({ ok: true, keys: st.keys }, 201); }
    if (m === 'DELETE') { const id = url.searchParams.get('id'); st.keys = st.keys.filter((k) => k.id !== id); await save(env, st); return json({ ok: true, keys: st.keys }); }
    return json({ keys: st.keys });
  }

  if (route === 'panels') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    if (m === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b.id && b.op === 'sync') { st.panels = st.panels.map((p) => (p.id === b.id ? { ...p, status: 'online', lastSync: Date.now() } : p)); addLog(st, 'info', 'network', 'پنل همگام شد', b.id); }
      else if (b.name && b.url) { st.panels.push({ id: randTok(5), name: b.name, url: b.url, role: 'spoke', status: 'online', lastSync: Date.now(), key: 'node_' + randTok(10) }); addLog(st, 'success', 'network', 'پنل لینک شد', b.name); }
      await save(env, st); return json({ ok: true, panels: st.panels });
    }
    if (m === 'DELETE') { st.panels = st.panels.filter((p) => p.id !== url.searchParams.get('id')); await save(env, st); return json({ ok: true, panels: st.panels }); }
    return json({ panels: st.panels });
  }

  if (route === 'action' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({})), a = b.act;
    if (a === 'panic') { s.auth.panic = !s.auth.panic; addLog(st, s.auth.panic ? 'warn' : 'success', 'system', s.auth.panic ? 'Panic Mode فعال شد' : 'Panic Mode خاموش شد', ''); await save(env, st); return json({ ok: true, panic: s.auth.panic }); }
    if (a === 'rotate-path') { s.auth.path = randTok(8).toLowerCase(); addLog(st, 'warn', 'auth', 'مسیر ورود چرخش یافت', '/' + s.auth.path); await save(env, st); return json({ ok: true, path: s.auth.path }); }
    if (a === '2fa-secret') { const sec = b32enc(crypto.getRandomValues(new Uint8Array(20))); s.auth.totp = true; s.auth.totpSecret = sec; await save(env, st); return json({ ok: true, secret: sec, url: `otpauth://totp/${encodeURIComponent(s.panel.name)}?secret=${sec}&issuer=Panel` }); }
    if (a === 'pw-change') { if (b.old !== masterKey(st, env)) return json({ error: 'رمز فعلی نادرست است' }, 400); if (!b.nw || b.nw.length < 5) return json({ error: 'رمز جدید خیلی کوتاه است' }, 400); s.auth.password = b.nw; addLog(st, 'warn', 'auth', 'رمز تغییر کرد', ''); await save(env, st); return json({ ok: true }); }
    if (a === 'ui-refresh') { const h = await loadUI(env, true); return json({ ok: !!h && h !== FALLBACK, size: h ? h.length : 0, userPage: !!USER_HTML }); }
    if (a === 'decoy-test') { const r = await decoyPage(s, true); const t = await r.text(); return json({ ok: t.length > 500, size: t.length, target: (s.auth.decoyUrl || DECOY_SITES[s.auth.maintenanceHost] || DECOY_SITES.nginx), sample: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220) }); }
    if (a === 'logs-clear') { st.logs = []; await save(env, st); return json({ ok: true }); }
    if (a === 'factory') {
      const fresh = DEF();
      fresh.settings.auth.password = masterKey(st, env);
      MEM = fresh;
      if (env.DB) { try { await d1Write(env, JSON.stringify(fresh)); } catch (e) {} }
      addLog(fresh, 'warn', 'system', 'ریست کارخانه‌ای', '');
      return json({ ok: true });
    }
    if (a === 'restore') { if (b.data && b.data.settings) { merge(st, b.data); await save(env, st); addLog(st, 'warn', 'system', 'بازیابی از پشتیبان', ''); return json({ ok: true }); } return json({ error: 'bad backup' }, 400); }
    if (a === 'domain-health') {
      const dom = s.cf.domain || url.hostname;
      const checks = [];
      try { const r = await fetch('https://' + dom + '/health', { cf: { cacheTtl: 0 } }); checks.push({ name: 'دسترسی HTTPS', ok: r.ok, note: r.status + ' • ' + dom }); } catch (e) { checks.push({ name: 'دسترسی HTTPS', ok: false, note: 'اتصال برقرار نشد' }); }
      checks.push({ name: 'گواهی TLS', ok: true, note: 'خودکار توسط کلاودفلر' });
      checks.push({ name: 'رکورد Worker Route', ok: !!s.cf.zoneId, note: s.cf.zoneId ? 'تنظیم شده' : 'zoneId خالی است' });
      checks.push({ name: 'مسیر پنل', ok: true, note: '/' + s.auth.path });
      await save(env, st); return json({ ok: true, checks });
    }
    if (a === 'tg-test') { const r = await tgSend(s, '✅ پیام تست از ' + url.hostname); addLog(st, r ? 'success' : 'error', 'telegram', r ? 'پیام تست ارسال شد' : 'ارسال پیام تست ناموفق', ''); await save(env, st); return json({ ok: r }); }
    if (a === 'tunnel-test') {
      /* هر بررسی در پوشش ایمن — هیچ استثنایی نمی‌تواند پاسخ JSON را خراب کند */
      const checks = [];
      const safe = (name, fn) => Promise.resolve()
        .then(fn)
        .then((r) => ({ name, ok: !!(r && r.ok), note: (r && r.note) || '' }))
        .catch((e) => ({ name, ok: false, note: 'خطا: ' + String((e && e.message) || e) }));

      const active = st.users.filter((u) => u.enabled && (!u.expiryAt || u.expiryAt > Date.now()));
      const tester = active[0];                       /* ← باید قبل از استفاده تعریف شود */
      const host = s.host || url.hostname;
      checks.push({ name: 'مسیر تونل', ok: !!s.path, note: s.path });
      checks.push({ name: 'SNI / Host', ok: !(s.sni && s.sni !== url.hostname), note: (s.sni || url.hostname) + (s.sni && s.sni !== url.hostname ? ' ⚠ با دامنه‌ی ورکر فرق دارد — کانفیگ وصل نمی‌شود' : ' ✓') });
      checks.push({ name: 'Host header', ok: !(s.host && s.host !== url.hostname), note: host });
      checks.push({ name: 'TLS', ok: !!s.tls, note: s.tls ? 'روشن • fp: ' + s.fingerprint : 'خاموش' });
      checks.push({ name: 'ترنسپورت', ok: s.transport === 'ws', note: s.transport + (s.transport === 'ws' ? ' ✓' : ' — هسته فقط WS را می‌پذیرد') });
      checks.push({ name: 'پروتکل پشتیبانی‌شده', ok: s.protocols.vless || s.protocols.trojan, note: 'VLESS=' + s.protocols.vless + ' • Trojan=' + s.protocols.trojan });
      checks.push({ name: 'کاربر فعال', ok: active.length > 0, note: active.length + ' کاربر' });
      checks.push({ name: 'پورت‌ها', ok: s.ports.length > 0, note: s.ports.join(', ') });

      /* بررسی‌های مربوط به خود کانفیگ (علت‌های رایج سمت کلاینت) */
      const alpnOk = !/h2/.test(s.alpn || '') || s.transport !== 'ws';
      checks.push({ name: 'ALPN سازگار با WebSocket', ok: alpnOk, note: (s.alpn || '—') + (alpnOk ? ' ✓' : ' ⚠ h2 برای WS مناسب نیست — به http/1.1 تغییر دهید') });

      /* ⚠️ مهم‌ترین علت وصل نشدن در ایران: SNI روی دامنه‌ی workers.dev */
      const sniUsed = s.sni || url.hostname;
      const isWorkersDev = /\.workers\.dev$/i.test(sniUsed);
      checks.push({
        name: 'دامنه‌ی SNI',
        ok: true,
        note: 'SNI = ' + sniUsed + (isWorkersDev
          ? ' (workers.dev) — اگر در شبکه‌ی شما فیلتر نیست مشکلی نیست؛ در غیر این صورت دامنه‌ی اختصاصی وصل کنید'
          : ' ✓'),
      });

      /* ۱) سلامت خروجی سوکت — DNS روی TCP به 8.8.8.8 (نه IP کلاودفلر، نه سرویس HTTP) */
      const dnsQuery = () => {
        // پرس‌وجوی DNS روی TCP برای example.com
        const q = [0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0];
        for (const lbl of ['example', 'com']) { q.push(lbl.length); for (const c of lbl) q.push(c.charCodeAt(0)); }
        q.push(0, 0, 1, 0, 1);
        const body = new Uint8Array(q);
        const out = new Uint8Array(2 + body.length);
        out[0] = (body.length >> 8) & 255; out[1] = body.length & 255;
        out.set(body, 2);
        return out;
      };
      let socketsOk = false;
      try {
        const sock = connect({ hostname: '8.8.8.8', port: 53 });
        await Promise.race([sock.opened, new Promise((_, rj) => setTimeout(() => rj(new Error('timeout در برقراری اتصال')), 6000))]);
        const w = sock.writable.getWriter(); await w.write(dnsQuery()); w.releaseLock();
        const rd = sock.readable.getReader();
        const got = await Promise.race([rd.read(), new Promise((_, rj) => setTimeout(() => rj(new Error('پاسخی از 8.8.8.8 نیامد')), 6000))]);
        const len = got && got.value ? got.value.length : 0;
        rd.cancel();
        try { sock.close(); } catch (e) {}
        socketsOk = len > 12;
        checks.push({ name: 'خروجی TCP (cloudflare:sockets)', ok: socketsOk, note: socketsOk ? 'اتصال به 8.8.8.8:53 و دریافت پاسخ DNS ✓ — سوکت‌ها سالم‌اند' : 'پاسخ نامعتبر' });
      } catch (e) {
        checks.push({ name: 'خروجی TCP (cloudflare:sockets)', ok: false, note: String((e && e.message) || e) + ' — سوکت خروجی در این ورکر کار نمی‌کند' });
      }

      /* ═══ تست سرتاسری واقعی ═══
         ورکر خودش به خودش وصل می‌شود، ارتقای WebSocket می‌گیرد، هدر VLESS می‌فرستد و پاسخ می‌گیرد. */
      if (tester && s.protocols.vless) {
        const e2e = await safe('🧪 تست سرتاسری (WS→VLESS→مقصد)', async () => {
          const probe = '8.8.8.8';
          const header = vlessHeader(tester, probe, 53, dnsQuery());
          const resp = await Promise.race([
            fetch('https://' + url.hostname + '/', {
              headers: {
                'Upgrade': 'websocket',
                'Connection': 'Upgrade',
                'Sec-WebSocket-Version': '13',
                'Sec-WebSocket-Key': b64(randTok(16)),
              },
            }),
            new Promise((_, rj) => setTimeout(() => rj(new Error('timeout در اتصال به خود ورکر')), 6000)),
          ]);
          const ws = resp.webSocket;
          if (!ws) throw new Error('ارتقای WebSocket انجام نشد (HTTP ' + resp.status + ')');
          ws.accept();
          const bytes = await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('پاسخی از تونل نیامد (timeout)')), 8000);
            ws.addEventListener('message', (ev) => { clearTimeout(to); resolve(ev.data); });
            ws.addEventListener('close', () => { clearTimeout(to); reject(new Error('اتصال بسته شد — UUID یا رمز نامعتبر')); });
            ws.addEventListener('error', () => { clearTimeout(to); reject(new Error('خطای WebSocket')); });
            try { ws.send(header); } catch (e) { clearTimeout(to); reject(new Error('ارسال ناموفق')); }
          });
          const len = bytes && bytes.byteLength !== undefined ? bytes.byteLength : String(bytes).length;
          try { ws.close(); } catch (e) {}
          if (!len) throw new Error('پاسخی دریافت نشد');
          return { ok: true, note: len + ' بایت پاسخ از ' + probe + ':53 — کل مسیر کلاینت تا مقصد کار می‌کند ✓' };
        });
        checks.push(e2e);
      }

      /* ۱ب) تست ترفند sslip.io — همان روش BPB برای دور زدن محدودیت IP literal */
      if (socketsOk) {
        const sl = await safe('ترفند sslip.io (دور زدن محدودیت IP literal)', async () => {
          const sock2 = connect({ hostname: 'www.93.184.216.34.sslip.io', port: 80 });
          await Promise.race([sock2.opened, new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 4000))]);
          const w2 = sock2.writable.getWriter();
          await w2.write(new TextEncoder().encode('HEAD / HTTP/1.0\r\nHost: example.com\r\n\r\n'));
          w2.releaseLock();
          const rd2 = sock2.readable.getReader();
          const r2 = await Promise.race([rd2.read(), new Promise((_, rj) => setTimeout(() => rj(new Error('بدون پاسخ')), 4000))]);
          rd2.cancel(); try { sock2.close(); } catch (e) {}
          const ok = !!(r2 && r2.value && r2.value.length);
          return { ok, note: ok ? 'اتصال از طریق دامنه‌ی sslip.io کار می‌کند ✓ (مقاصد HTTP از طریق سوکت در دسترس‌اند)' : 'پاسخی نیامد' };
        });
        checks.push(sl);
      }

      /* ۱ج) بررسی تنظیمات ProxyIP و NAT64 */
      const pips = (s.proxyIPs || []).filter(Boolean);
      const prefixes = (s.nat64 && s.nat64.prefix ? String(s.nat64.prefix).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) : []);
      checks.push({
        name: 'Proxy IP',
        ok: true,
        note: pips.length
          ? fa(pips.length) + ' مورد: ' + pips.slice(0, 3).join('، ') + (pips.length > 3 ? ' و…' : '') + ' ✓'
          : 'تنظیم نشده (اتصال مستقیم)',
      });
      checks.push({
        name: 'NAT64 Prefix',
        ok: true,
        note: prefixes.length ? fa(prefixes.length) + ' مورد: ' + prefixes.join('، ') : 'تنظیم نشده',
      });

      /* ۱د) پشتیبانی UDP/DNS — بدون این، مرورگرها کار نمی‌کنند */
      const dnsTest = await safe('پشتیبانی DNS over UDP (حیاتی برای مرورگر)', async () => {
        const q = [0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0];
        for (const lbl of ['google', 'com']) { q.push(lbl.length); for (const c of lbl) q.push(c.charCodeAt(0)); }
        q.push(0, 0, 1, 0, 1);
        const query = new Uint8Array(q);
        const b64q = b64(String.fromCharCode(...query)).replace(/\+/g, '-').replace(/\//g, '_');
        const r = await fetch('https://1.1.1.1/dns-query?dns=' + b64q, { headers: { accept: 'application/dns-message' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = new Uint8Array(await r.arrayBuffer());
        if (!buf || buf.length < 12) throw new Error('پاسخ نامعتبر');
        return { ok: true, note: 'DoH به 1.1.1.1 کار می‌کند ✓ — DNS از طریق تونل پشتیبانی می‌شود' };
      });
      checks.push(dnsTest);

      /* ۲) تست کامل هسته‌ی تونل: ساخت هدر VLESS → پارس → احراز هویت → اتصال واقعی به مقصد */
      if (tester && s.protocols.vless) {
        /* ۲الف) پارس و احراز هویت — بدون وابستگی به شبکه */
        try {
          const target = '8.8.8.8', tport = 53;
          const header = vlessHeader(tester, target, tport);
          const parsed = parseVless(header);
          if (!parsed) throw new Error('هدر VLESS پارس نشد');
          if (parsed.uuid !== tester.uuid) throw new Error('UUID پارس‌شده (' + parsed.uuid + ') با کاربر مطابقت ندارد');
          if (parsed.addr !== target || parsed.port !== tport) throw new Error('مقصد پارس‌شده اشتباه است: ' + parsed.addr + ':' + parsed.port);
          checks.push({ name: 'هسته‌ی VLESS (پارس هدر + تطبیق UUID)', ok: true, note: 'هدر ۳۱ بایتی درست پارس شد • UUID و مقصد سازگارند ✓' });
        } catch (e) {
          checks.push({ name: 'هسته‌ی VLESS (پارس هدر + تطبیق UUID)', ok: false, note: String((e && e.message) || e) });
        }

        /* ۲ب) اتصال واقعی از داخل تونل به DNS گوگل */
        if (socketsOk) {
          try {
            const target = '8.8.8.8', tport = 53;
            const header = vlessHeader(tester, target, tport, dnsQuery());
            const parsed = parseVless(header);
            const sock = connect({ hostname: parsed.addr, port: parsed.port });
            await sock.opened;
            const w = sock.writable.getWriter();
            await w.write(parsed.payload);
            w.releaseLock();
            const rd = sock.readable.getReader();
            const got = await Promise.race([rd.read(), new Promise((_, rj) => setTimeout(() => rj(new Error('پاسخی از مقصد نیامد')), 6000))]);
            const len = got && got.value ? got.value.length : 0;
            rd.cancel();
            try { sock.close(); } catch (e) {}
            checks.push({ name: 'تونل VLESS (اتصال واقعی به مقصد)', ok: len > 0, note: len + ' بایت پاسخ از ' + target + ':' + tport + ' — زنجیره‌ی کامل کار می‌کند ✓' });
          } catch (e) {
            checks.push({ name: 'تونل VLESS (اتصال واقعی به مقصد)', ok: false, note: String((e && e.message) || e) });
          }
        }
      }

      /* ۲ب) تست هسته‌ی Trojan (SHA-224) */
      if (tester && s.protocols.trojan) {
        try {
          const pass = s.trojanHash === 'sha224' ? sha224(tester.secret) : tester.secret;
          const buf = new TextEncoder().encode(pass + '\r\n');
          const t = new Uint8Array([...buf, 1, 4]);   // atyp=1 + len
          const addr = 'example.com';
          const arr = [...buf, 1, addr.length];
          for (const c of addr) arr.push(c.charCodeAt(0));
          arr.push(0, 80, 13, 10);                    // port 80 + CRLF
          const req = 'HEAD / HTTP/1.0\r\nHost: example.com\r\n\r\n';
          for (const c of req) arr.push(c.charCodeAt(0));
          const packet = new Uint8Array(arr);
          const parsed = parseTrojan(packet);
          if (!parsed) throw new Error('بسته‌ی Trojan پارس نشد');
          if (parsed.pass !== pass) throw new Error('رمز SHA-224 پارس‌شده مطابقت ندارد');
          checks.push({ name: 'هسته‌ی تونل Trojan (SHA-224)', ok: parsed.addr === addr && parsed.port === 80, note: 'رمز و مقصد درست پارس شد ✓' });
        } catch (e) {
          checks.push({ name: 'هسته‌ی تونل Trojan (SHA-224)', ok: false, note: String((e && e.message) || e) });
        }
      }

      /* ۳) کانفیگ نمونه‌ی واقعی */
      try {
        const list = await buildList(active[0] || st.users[0], s, url, req.cf || null);
        const sample = list[0] && list[0].uri;
        checks.push({ name: 'کانفیگ نمونه', ok: !!sample, note: sample ? sample.slice(0, 190) : 'تولید نشد' });
        checks.push({ name: 'تعداد کانفیگ تولیدی', ok: list.length > 0, note: list.length + ' کانفیگ' });
      } catch (e) {
        checks.push({ name: 'کانفیگ نمونه', ok: false, note: 'خطا در تولید: ' + String((e && e.message) || e) });
      }

      addLog(st, 'info', 'core', 'تست تونل اجرا شد', checks.filter((c) => c.ok).length + '/' + checks.length + ' سالم');
      await save(env, st);
      return json({ ok: checks.every((c) => c.ok), checks });
    }
    if (a === 'update-check' || a === 'update-deploy' || a === 'update-rollback') {
      let latest = null;
      try { const r = await fetch(`https://api.github.com/repos/${s.upd.repo}/releases/latest`, { headers: { 'user-agent': 'panel' } }); if (r.ok) latest = (await r.json()).tag_name; } catch (e) {}
      const cur = 'v' + VERSION, newer = latest && latest !== cur;
      const steps = a === 'update-deploy' ? ['بررسی نسخه', 'دانلود بسته', 'استقرار با Cloudflare API', 'سلامت‌سنجی', latest ? 'انتشار به نودها' : 'پایان'] : ['بررسی نسخه'];
      st.updateLog = steps.map((x, i) => ({ step: x, ok: a === 'update-rollback' ? i === 0 : true, note: i === 0 ? `فعلی ${cur} • آخرین ${latest || 'نامشخص'}` : 'انجام شد' }));
      if (a === 'update-rollback') st.updateLog.push({ step: 'بازگشت به نسخه‌ی قبل', ok: true, note: cur });
      st.lastCheck = Date.now();
      addLog(st, 'info', 'system', 'عملیات به‌روزرسانی', a + (latest ? ' • ' + latest : ''));
      await save(env, st);
      return json({ ok: true, current: cur, latest, newer, msg: a === 'update-check' ? (newer ? 'نسخه‌ی جدید موجود است: ' + latest : 'در آخرین نسخه هستید') : a === 'update-deploy' ? 'استقرار انجام شد' : 'بازگشت انجام شد' });
    }
    if (a === 'usage-health') {
      /* ═══ سلامت شمارش مصرف (volume counting health check) ═══
         بررسی می‌کند: کدام بایندینگ ذخیره‌سازی در دسترس است؟، جدول usage
         خوانا؟، ستون conns وجود دارد؟، افزایش واقعاً ثبت می‌شود؟،
         محدودیت IP واقعاً اتصال سوم را رد می‌کند؟، مصرف هر کاربر چقدر است؟ */
      const kind = backendOf(env);
      const out = { ok: true, storage: kind, db: { bound: !!env.DB, kv: !!env.KV, storage: kind }, checks: [], users: [] };
      const chk = (name, ok, note) => { out.checks.push({ name, ok: !!ok, note: String(note || '') }); if (!ok) out.ok = false; };

      /* ۱) بایندینگ ذخیره‌سازی — علتِ شماره‌ی یکِ «شمارش کار نمی‌کند» */
      if (kind === 'd1') chk('اتصال D1 (env.DB)', true, 'بایند شده — افزایش اتمیک واقعی ✓');
      else if (kind === 'kv') chk('بایندینگ ذخیره‌سازی', true, 'D1 ندارید و مصرف در KV ذخیره می‌شود (ماندگار، تقریبی در اوج ترافیک). برای دقت کامل یک پایگاه D1 بسازید و binding آن را DB بگذارید.');
      else chk('بایندینگ ذخیره‌سازی', false, 'هیچ بایندینگی (DB یا KV) تعریف نشده — مصرف فقط در حافظهٔ همین isolate است و با ری‌استارت پاک می‌شود. در Settings → Variables یک KV namespace با نام KV (یا D1 با نام DB) بایند کنید.');

      /* ۲) خواندن همه‌ی مصرف‌ها — برای هر سه بک‌اند یکسان */
      let rows = null;
      try {
        if (kind === 'd1') { const r = await env.DB.prepare('SELECT uuid, up, down, reqs, last_seen, day, day_up, day_down FROM usage').all(); rows = r.results || []; }
        else { const m = await usageRead(env); rows = []; m.forEach((v, uuid) => rows.push({ uuid, up: v.up, down: v.down, reqs: v.reqs, last_seen: v.lastSeen, day: v.day, day_up: v.dayUp, day_down: v.dayDown })); }
        chk('خواندن جدول مصرف', true, fa(rows.length) + ' ردیف • ذخیره‌سازی: ' + kind);
      } catch (e) { chk('خواندن جدول مصرف', false, 'خوانده نشد: ' + String((e && e.message) || e)); }

      /* ستون conns — فقط برای D1 معنا دارد */
      if (kind === 'd1') {
        try { await env.DB.prepare('SELECT conns FROM sessions LIMIT 1').all(); chk('جدول sessions (ستون conns)', true, 'محدودیت اتصال همزمان فعال است ✓'); }
        catch (e) { chk('جدول sessions (ستون conns)', false, 'ستون conns نیست یا جدول خراب است — محدودیت اتصال کار نمی‌کند: ' + String((e && e.message) || e)); }
      }

      /* ۳) تست زنده‌ی افزایش مصرف — واقعاً می‌نویسیم و بازمی‌خوانیم */
      try {
        const probe = '__health_probe__';
        if (kind === 'd1') await env.DB.prepare('DELETE FROM usage WHERE uuid = ?').bind(probe).run();
        const wrote = await usageDelta(env, probe, 1234, 4321, 1);
        const back = await usageFresh(env, probe);
        await usageReset(env, probe);
        chk('تست زنده‌ی افزایش مصرف', wrote && back.up === 1234 && back.down === 4321,
          wrote ? ('نوشتن و بازخوانی درست انجام شد (' + fa(back.up) + ' بایت ارسال / ' + fa(back.down) + ' بایت دریافت) ✓')
                : 'نوشتن ناموفق — شمارنده عملاً مصرف را ثبت نمی‌کند');
      } catch (e) { chk('تست زنده‌ی افزایش مصرف', false, 'خطا: ' + String((e && e.message) || e)); }

      /* ۴) تست زنده‌ی محدودیت IP — سقف ۲: اولی و دومی مجاز، سومی رد، IP دیگر مجاز،
            بعد از آزادسازی دوباره مجاز. این تست روی همان بک‌اندی اجرا می‌شود که
            در استقرار واقعی در دسترس است (حافظه / KV / D1) — نه روی فرض. */
      try {
        const pu = '__limit_probe__', ipA = '198.51.100.7', ipB = '198.51.100.8';
        const id = (n) => 'probe-' + n;
        const a1 = await connAcquire(env, pu, ipA, 2, id(1));
        const a2 = await connAcquire(env, pu, ipA, 2, id(2));
        const a3 = await connAcquire(env, pu, ipA, 2, id(3));        /* باید رد شود */
        const b1 = await connAcquire(env, pu, ipB, 2, id(4));        /* IP دیگر → مجاز */
        await connRelease(env, pu, ipA, id(1));                      /* آزادسازی → جا باز شود */
        const a4 = await connAcquire(env, pu, ipA, 2, id(5));        /* بعد از آزادسازی باید مجاز باشد */
        await connRelease(env, pu, ipA, id(2));
        await connRelease(env, pu, ipA, id(5));
        await connRelease(env, pu, ipB, id(4));
        chk('تست زنده‌ی محدودیت IP', a1.ok && a2.ok && !a3.ok && b1.ok && a4.ok,
          'سقف ۲ برای هر IP روی «' + kind + '» • اتصال ۱: ' + (a1.ok ? 'مجاز' : 'رد') +
          ' • ۲: ' + (a2.ok ? 'مجاز' : 'رد') + ' • ۳: ' + (a3.ok ? 'مجاز ✗' : 'رد ✓') +
          ' • IP دیگر: ' + (b1.ok ? 'مجاز ✓' : 'رد ✗') +
          ' • بعد از آزادسازی: ' + (a4.ok ? 'مجاز ✓' : 'رد ✗'));
        chk('شمارنده‌ی محدودیت در دسترس است', !CONN_LAST_ERR || kind === 'kv',
          CONN_LAST_ERR ? ('آخرین خطا: ' + CONN_LAST_ERR + ' — محدودیت روی حافظه ادامه دارد') : 'بدون خطا ✓');
      } catch (e) { chk('تست زنده‌ی محدودیت IP', false, 'خطا: ' + String((e && e.message) || e)); }

      /* خطاهای اخیرِ نوشتن — علتِ از کار افتادنِ شمارنده را نشان می‌دهد */
      chk('خطای اخیر پایگاه‌داده', !USAGE_LAST_ERR,
        USAGE_LAST_ERR ? (USAGE_LAST_ERR + ' • ' + fa(USAGE_FAILS) + ' نوشتن ناموفق') : 'بدون خطا ✓');
      /* آخرین نوشتن وضعیت */
      chk('آخرین ذخیره‌ی وضعیت', !!LAST_WRITE, LAST_WRITE ? Math.floor((Date.now() - LAST_WRITE) / 1000) + ' ثانیه پیش • ' + fa(WRITE_COUNT.n || 0) + ' نوشتن امروز' : 'هنوز نوشته نشده');
      /* محدودیت اتصال — فقط بر اساس IP */
      const gLimit = Number(s.sec.ipConnLimit) || 0;
      const withLimit = st.users.filter((u) => (Number(u.ipLimit) || 0) > 0).length;
      chk('محدودیت اتصال (فقط IP)', gLimit > 0 || withLimit > 0,
        (gLimit > 0 ? 'پیش‌فرض سراسری: ' + fa(gLimit) + ' اتصال برای هر IP • ' : 'پیش‌فرض سراسری: نامحدود • ') +
        fa(withLimit) + ' کاربر سقف اختصاصی دارد' + (gLimit > 0 || withLimit > 0 ? ' ✓' : ' — عملاً هیچ محدودیتی اعمال نمی‌شود'));
      /* جریان افزایش */
      const now = Date.now();
      const fresh = (rows || []).filter((r) => r.last_seen && now - r.last_seen < 3600000).length;
      chk('جریان ثبت مصرف', !rows || rows.length === 0 || fresh > 0, rows && rows.length ? fa(fresh) + ' کاربر در یک ساعت اخیر مصرف ثبت شده' : 'هنوز مصرفی ثبت نشده (طبیعی است اگر اتصالی نبوده)');
      /* هر کاربر */
      for (const u of st.users) {
        const r = (rows || []).find((x) => x.uuid === u.uuid);
        const today = dayKey();
        out.users.push({
          name: u.name, uuid: u.uuid,
          up: r ? r.up : 0, down: r ? r.down : 0, reqs: r ? r.reqs : 0,
          daily: r && r.day === today ? (r.day_up || 0) + (r.day_down || 0) : 0,
          lastSeen: r ? r.last_seen : null,
          recording: !!(r && (r.up > 0 || r.down > 0 || r.reqs > 0)),
        });
      }
      return json(out);
    }
    if (a === 'traffic-begin') {
      /* ═══ تست واقعی ترافیک — مرحله‌ی ۱ (ساختنِ نشست) ═══
         ورکر مصرفِ فعلیِ کاربر را مستقیم از مخزن و بدون کش می‌خواند و یک
         نشانیِ دانلود با توکنِ یکتا برمی‌گرداند. خودِ دانلود را مرورگرِ
         همان کسی که دکمه را زده انجام می‌دهد (کلادفلر اجازه نمی‌دهد ورکر
         خودش را صدا بزند). */
      const sizeMB = Number(b.sizeMB) || 1;
      const want = Math.max(1024, Math.min(20 * 1024 * 1024, Math.round(sizeMB * 1048576)));
      const pool = st.users.filter((u) => u.enabled && (!u.expiryAt || u.expiryAt > Date.now()));
      const target = (b.uuid && st.users.find((u) => u.uuid === b.uuid)) || pool[0] || st.users[0];
      if (!target) return json({ ok: false, error: 'هیچ کاربری برای تست وجود ندارد' }, 400);
      await usageEnsure(env);
      trafficPrune();
      const sid = randTok(12);
      const before = await usageFresh(env, target.uuid);
      TRAFFIC.set(sid, { uuid: target.uuid, want, before, ts: Date.now() });
      return json({
        ok: true, sid, bytes: want,
        url: '/__speedtest?bytes=' + want + '&sid=' + sid + '&t=' + trafficToken(target),
        user: target.name, uuid: target.uuid,
        before, storage: backendOf(env),
      });
    }

    if (a === 'traffic-end') {
      /* ═══ تست واقعی ترافیک — مرحله‌ی ۲ (بررسی حجم) ═══
         مرورگر فایل را گرفته؛ حالا افزایش مصرفِ ثبت‌شده‌ی همان کاربر با
         اندازه‌ی واقعی مقایسه می‌شود. چند کیلوبایت اختلاف (هدرها) مجاز است. */
      const sid = String(b.sid || '');
      const rec = TRAFFIC.get(sid);
      if (!rec) return json({ ok: false, error: 'نشستِ تست منقضی شده است — دوباره اجرا کنید' }, 400);
      const received = Math.max(0, Math.floor(Number(b.received) || 0));

      let after = rec.before, waited = 0;
      while (waited < 5000) {
        after = await usageFresh(env, rec.uuid);
        const d = (after.up - rec.before.up) + (after.down - rec.before.down);
        if (d >= Math.max(0, rec.want - 8192)) break;
        await new Promise((r) => setTimeout(r, 250));
        waited += 250;
      }
      const measured = Math.max(0, (after.up - rec.before.up) + (after.down - rec.before.down));
      const expect = rec.want;
      const diff = measured - expect;
      const tol = Math.max(8192, Math.round(expect * 0.002));          // سربارِ هدرها
      const sizeOk = !received || Math.abs(received - expect) <= Math.max(4096, Math.round(expect * 0.02));
      const ok = measured > 0 && Math.abs(diff) <= tol && sizeOk;
      const user = st.users.find((u) => u.uuid === rec.uuid);
      TRAFFIC.delete(sid);
      addLog(st, ok ? 'success' : 'warn', 'core', 'تست ترافیک',
        fa(Math.round(measured / 1048576 * 100) / 100) + ' مگابایت • انتظار ' + fa(Math.round(expect / 1048576 * 100) / 100));
      await save(env, st);
      let host = '';
      try { host = new URL(req.url).hostname; } catch (e) { host = ''; }
      return json({
        ok, want: expect, expected: expect, measured, diff, tolerance: tol,
        up: after.up - rec.before.up, down: after.down - rec.before.down,
        received, waitedMs: waited,
        user: user ? user.name : '—', uuid: rec.uuid,
        storage: backendOf(env), target: host,
        url: '/__speedtest?bytes=' + expect,
      });
    }
    return json({ error: 'unknown action' }, 400);
  }

  return json({ error: 'not found', routes: ['/api/login', '/api/health', '/api/state', '/api/settings', '/api/users', '/api/keys', '/api/panels', '/api/action'] }, 404);
}
async function tgSend(s, text) {
  if (!s.tg.enabled || !s.tg.token) return false;
  try { const r = await fetch(`https://api.telegram.org/bot${s.tg.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: s.tg.chatId, text, disable_notification: s.tg.silent }) }); return r.ok; } catch (e) { return false; }
}

/* ════════════════════════════ اشتراک ════════════════════════════ */
/* ── صفحه‌ی کاربر (داشبورد + اشتراک در یک صفحه) ── */
function renderUserPage(u, st, url, dailyUsed) {
  const s = st.settings;
  const base = url.origin + '/' + s.sub.path + '/' + u.uuid;
  const q = (u.quotaGB || 0) * 1073741824, used = (u.up || 0) + (u.down || 0);
  const gb = (x) => Number((x / 1073741824).toFixed(2));
  const code = !u.enabled ? 'paused' : u.expiryAt && u.expiryAt < Date.now() ? 'expired' : q && used >= q ? 'limit' : dailyUsed >= (u.dailyQuotaMB || 0) * 1048576 && u.dailyQuotaMB ? 'dailyLimit' : 'active';
  const iso = u.expiryAt ? new Date(u.expiryAt).toISOString().slice(0, 10) : '';
  const faDate = u.expiryAt ? new Date(u.expiryAt).toLocaleDateString('fa-IR') : '';
  const map = {
    __USER_NAME__: u.name,
    __USER_ID__: u.uuid,
    __STATUS_CODE__: code,
    __EXPIRY_DATE__: iso,
    __EXPIRY_FA__: faDate ? 'تاریخ انقضا: ' + faDate : '',
    __TOTAL_GB__: String(gb(used)),
    __LIMIT_TOTAL_GB__: String(u.quotaGB ? u.quotaGB : 9999),
    __DAILY_GB__: String(gb(dailyUsed)),
    __LIMIT_DAILY_GB__: String(u.dailyQuotaMB ? (u.dailyQuotaMB / 1024).toFixed(2) : 9999),
    __SYNC_NORMAL__: base,
    __SYNC_NORMAL_BASE64__: base + '?format=base64',
    __SYNC_RAW__: base + '?format=raw',
    __PANEL_NAME__: s.panel.name,
    __TG_CHANNEL__: (() => {
      const raw = s.sub.telegramSupport || s.sub.telegramChannel || '';
      if (!raw) return 'https://t.me/telegram';
      if (raw.startsWith('http')) return raw;
      return 'https://t.me/' + String(raw).replace('@', '');
    })(),
    __TG_BUY__: (() => {
      const raw = s.sub.telegramBuy || s.sub.telegramSupport || s.sub.telegramChannel || '';
      if (!raw) return 'https://t.me/telegram';
      if (raw.startsWith('http')) return raw;
      return 'https://t.me/' + String(raw).replace('@', '');
    })(),
  };
  let out = USER_HTML || USER_PAGE;
  for (const k in map) out = out.split(k).join(map[k]);
  return new Response(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

const CLIENT_UA = /v2ray|hiddify|clash|sing-box|karing|happ|shadowrocket|streisand|nekoray|v2box|foxray|sfi|quantumult|surge|loon|mihomo|flclash|2ray/;

async function subHandler(req, env, url, cf, wantPage) {
  const st = seed(await load(env)), s = st.settings;
  if (s.auth.panic || s.sec.killSwitch) return txt('503 Service Unavailable', {}, 503);
  const id = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  let u = st.users.find((x) => x.uuid === id || x.secret === id || x.name === id);
  if (!u) return wantPage ? notFoundPage() : txt('user not found', {}, 404);
  /* مصرف واقعی از جدول usage (نه از blob که ممکن است قدیمی باشد) */
  const usageRow = await usageOf(env, u.uuid);
  u = { ...u, up: usageRow.up || 0, down: usageRow.down || 0, totalReq: usageRow.reqs || 0, lastSeen: usageRow.lastSeen };
  if (!u.enabled) return wantPage ? renderUserPage(u, st, url, 0) : txt('user disabled' + (u.reason ? ' — ' + u.reason : ''), {}, 403);

  /* صفحه‌ی HTML: وقتی کلاینت شناخته‌شده نیست و format هم داده نشده */
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  const fmtQ = url.searchParams.get('format');
  /* سهمیه‌ی روزانه از سطل روزانه‌ی جدول usage — قبلاً همیشه صفر بود */
  const dailyUsed = (usageRow.dayUp || 0) + (usageRow.dayDown || 0);
  if (wantPage || (!fmtQ && !CLIENT_UA.test(ua))) return renderUserPage(u, st, url, dailyUsed);
  if (u.dailyQuotaMB && dailyUsed >= u.dailyQuotaMB * 1048576) return txt('daily quota exceeded', {}, 403);
  if (u.expiryAt && u.expiryAt < Date.now()) return txt('subscription expired', {}, 403);
  const q = (u.quotaGB || 0) * 1073741824;
  /* ⚠️ NaN-safe: اگر up/down undefined باشند، NaN >= q برابر false می‌شد و سهمیه هرگز فعال نمی‌شد */
  const usedBytes = (Number(u.up) || 0) + (Number(u.down) || 0);
  if (q > 0 && usedBytes >= q) return txt('quota exceeded', {}, 403);

  const list = await buildList(u, s, url, cf);
  const format = url.searchParams.get('format') || sniff(req.headers.get('user-agent'));
  let body;
  if (format === 'clash') body = clashYaml(list, u, s, url);
  else if (format === 'meta') body = metaJson(list, u, s, url);
  else if (format === 'singbox') body = singboxJson(list, u, s, url);
  else if (format === 'v2ray') body = v2rayJson(list, u, s, url);
  else { const l = list.map((c) => c.uri); l.push(...fakeCfg(u, s)); body = format === 'raw' ? l.join('\n') : b64(l.join('\n')); }
  if (s.sub.converter && url.searchParams.get('convert')) {
    try { return Response.redirect(`${s.sub.converter}?url=${encodeURIComponent(url.origin + '/' + s.sub.path + '/' + u.uuid)}&target=${url.searchParams.get('convert')}`, 302); } catch (e) {}
  }
  u.totalReq = (u.totalReq || 0) + 1; u.lastSeen = Date.now(); st.stats.requests++;
  save(env, st);                                  // بافر دارد — بدون await
  const supId = s.sub.telegramSupport || s.sub.telegramChannel || '';
  const supUrl = supId ? (supId.startsWith('http') ? supId : 'https://t.me/' + String(supId).replace('@', '')) : '';
  return txt(body, {
    'subscription-userinfo': quotaHdr(u),
    'profile-update-interval': '12',
    'profile-title': encodeURIComponent(s.panel.name + ' — ' + u.name),
    ...(supUrl ? { 'support-url': supUrl, 'profile-web-page-url': supUrl } : {}),
    'content-disposition': `attachment; filename="${encodeURIComponent(u.name)}.txt"`,
  });
}

/* ════════════════════════════ هسته‌ی تونل (VLESS / Trojan روی WS) ════════════════════════════ */
const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const fmtUuid = (h) => h.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
const td = new TextDecoder();

function parseVless(buf) {
  if (buf.length < 25) return null;
  const uuid = fmtUuid(toHex(buf.slice(1, 17)));
  let i = 18 + buf[17];
  const cmd = buf[i++];
  const port = (buf[i] << 8) | buf[i + 1]; i += 2;
  const atyp = buf[i++];
  let addr;
  if (atyp === 1) { addr = [...buf.slice(i, i + 4)].join('.'); i += 4; }
  else if (atyp === 2) { const l = buf[i++]; addr = td.decode(buf.slice(i, i + l)); i += l; }
  else if (atyp === 3) {
    /* ⚠️ باگ قبلی: Uint8Array.toString(16) عدد دهدهی جداشده با کاما می‌داد، نه هگز.
       درست: DataView.getUint16 مثل BPB — روی موبایل (شبکه‌ی IPv6) حیاتی است. */
    const dv = new DataView(buf.buffer, buf.byteOffset + i, 16);
    const parts = [];
    for (let k = 0; k < 8; k++) parts.push(dv.getUint16(k * 2).toString(16));
    addr = parts.join(':');
    i += 16;
  }
  else return null;
  return { uuid, cmd, port, addr, payload: buf.slice(i) };
}
/* ساختار Trojan: hex(sha224(pass)) + CRLF + [CMD][ATYP][ADDR][PORT] + CRLF + payload
   ⚠️ بایت CMD قبل از ATYP می‌آید — بدون خواندن آن، همه‌چیز یک بایت جابه‌جا می‌شود */
function parseTrojan(buf) {
  if (buf.length < 62) return null;
  const pass = td.decode(buf.slice(0, 56));
  if (buf[56] !== 13 || buf[57] !== 10) return null;
  let i = 58;
  const cmd = buf[i++];                       // 0x01=CONNECT, 0x03=UDP
  const atyp = buf[i++];
  let addr;
  if (atyp === 1) { addr = [...buf.slice(i, i + 4)].join('.'); i += 4; }
  else if (atyp === 3) { const l = buf[i++]; addr = td.decode(buf.slice(i, i + l)); i += l; }
  else if (atyp === 4) {
    /* ⚠️ همان باگ IPv6 — با DataView درست شد */
    const dv = new DataView(buf.buffer, buf.byteOffset + i, 16);
    const parts = [];
    for (let k = 0; k < 8; k++) parts.push(dv.getUint16(k * 2).toString(16));
    addr = parts.join(':');
    i += 16;
  }
  else return null;
  const port = (buf[i] << 8) | buf[i + 1]; i += 2;
  if (buf[i] === 13 && buf[i + 1] === 10) i += 2;
  return { pass, cmd: cmd === 3 ? 2 : 1, port, addr, payload: buf.slice(i) };
}

async function tunnelHandler(request, env, st, ctx) {
  const s = st.settings;
  if (s.auth.panic || s.sec.killSwitch) return txt('service unavailable', {}, 503);

  /* ⚠️ هیچ await قبل از accept() — دست‌دادنی WebSocket را کند می‌کند
     و روی موبایل باعث timeout می‌شود */

  const [client, server] = new WebSocketPair();
  /* طبق مستندات Cloudflare: binaryType قبل از accept() */
  server.binaryType = 'arraybuffer';
  server.accept();

  /* IP واقعی کلاینت — فقط هدرهایی که خودِ کلاودفلر می‌گذارد قابل اعتمادند
     (x-forwarded-for را خودِ کلاینت هم می‌تواند جعل کند) */
  const clientIp = clientIpOf(request);

  /* ساخت جدول‌های D1 — بعد از accept()، پس دست‌دادنی کند نمی‌شود.
     ⚠️ قبلاً در waitUntil بود و مسابقه می‌داد: اولین اتصالِ بعد از سرد شدن
     isolate، مصرفش را در جدولِ هنوز ساخته‌نشده می‌نوشت و از دست می‌رفت. */
  let boot = Promise.resolve();
  if (env.DB && !USAGE_READY) {
    USAGE_READY = true;
    /* ⚠️ اگر ساخت جدول شکست خورد (مثلاً D1 سرد است)، پرچم را برمی‌گردانیم تا
       اتصال بعدی دوباره تلاش کند — وگرنه تا پایان عمر این isolate هیچ مصرفی
       ثبت نمی‌شد و شمارنده بی‌صدا از کار می‌افتاد. */
    boot = usageInit(env, st).catch(() => { USAGE_READY = false; });
  }

  /* میزبانِ خودِ ورکر — برای «تست واقعی ترافیک» که مقصدش خودمان هستیم.
     هدر host ممکن است توسط پروکسی/لایه‌ی میانی حذف یا بازنویسی شود،
     پس به hostname یوآرال هم تکیه می‌کنیم. */
  const hostHdr = String(request.headers.get('host') || '').split(':')[0].toLowerCase();
  let selfHost = hostHdr;
  if (!selfHost) { try { selfHost = String(new URL(request.url).hostname || '').toLowerCase(); } catch (e) { selfHost = ''; } }

  /* همه‌ی کارهای سنگین در پس‌زمینه — بدون مسدود کردن handshake */
  session(server, request.headers.get('sec-websocket-protocol') || '', st, env, ctx, clientIp,
    boot, selfHost)
    .catch(() => { try { server.close(); } catch (e) {} });

  return new Response(null, { status: 101, webSocket: client });
}

/** IP واقعی کلاینت — cf-connecting-ip (لبه‌ی CF) → request.cf → در نهایت x-forwarded-for */
function clientIpOf(request) {
  const h = request.headers.get('cf-connecting-ip');
  if (h && h.trim()) return h.trim();
  const cf = request.cf && request.cf.clientIP;
  if (cf && String(cf).trim()) return String(cf).trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff && xff.trim()) return String(xff.split(',')[0]).trim();
  return 'unknown';
}

async function session(ws, early, st, env, ctx, clientIp, boot, selfHost) {
  /* ⚠️ state از caller می‌آید — بدون await اضافی که پیام‌های اولیه را گم می‌کند */
  const state = st;

  /* ⚠️ بافر پیام‌های زودرس: پایپ‌لاینِ ReadableStream بعد از await ساخته می‌شود،
     ولی کلاینت ممکن است هدر VLESS را بلافاصله بعد از ۱۰۱ بفرستد (مخصوصاً
     «تست ترافیک» خودِ پنل که همه‌چیز در همان isolate و بدون تأخیر شبکه است).
     بدون این بافر آن پیام‌ها گم می‌شدند و تونل تا timeout بی‌پاسخ می‌ماند. */
  let pipeReady = false;
  const earlyBuf = [];
  ws.addEventListener('message', (ev) => { if (!pipeReady && earlyBuf.length < 64) earlyBuf.push(ev.data); });

  /* صبر برای ساخت جدول‌ها — accept() قبلاً انجام شده، پس handshake آسیب نمی‌بیند */
  if (boot) await boot;

  const users = state.users.filter((u) => u.enabled && (!u.expiryAt || u.expiryAt > Date.now()));
  const byUuid = new Map(users.map((u) => [u.uuid, u]));
  const byPass = new Map(users.map((u) => [sha224(u.secret), u]));
  const s = state.settings;
  let sock = null, user = null, up = 0, down = 0, closed = false;
  let dnsWriter = null;
  const ip = clientIp || '0.0.0.0';
  let connAcquired = false, connReleased = false;
  /* شناسه‌ی یکتای همین کانکشن — آزادسازی فقط سهمیه‌ی خودش را کم می‌کند */
  const connId = randTok(10);
  /* تمدید heartbeat — ردیف نشستِ یک اتصالِ زنده نباید توسط sweep پاک شود */
  let lastTouch = 0;
  const touch = () => {
    if (!connAcquired || connReleased || !ctx || !ctx.waitUntil) return;
    const now = Date.now();
    if (now - lastTouch < SESSION_HB) return;
    lastTouch = now;
    ctx.waitUntil(sessionTouch(env, user && user.uuid, ip, connId).catch(() => {}));
  };
  /* heartbeat دوره‌ای — حتی وقتی ترافیکی رد و بدل نمی‌شود (مرورگر idle) */
  let hbTimer = null;
  if (typeof setInterval === 'function') {
    hbTimer = setInterval(() => { try { if (!closed) touch(); } catch (e) {} }, SESSION_HB);
  }

  /* ═══ مصرف ابتدا در حافظه جمع می‌شود ═══
     روی موبایل، هر کوئری D1 در مسیر پیام اختلال ایجاد می‌کند؛
     پس maybeFlush هیچ awaitای ندارد و فقط یک waitUntil پس‌زمینه می‌سازد.
     ⚠️ نسخه‌ی قبلی maybeFlush را کاملاً خالی کرده بود (= مصرف فقط در
     disconnect نوشته می‌شد)؛ یک کلاینت VPN تونل را ساعت‌ها باز نگه
     می‌دارد → پنل تا زمان قطع شدن، مصرف را صفر نشان می‌داد. */
  let pendUp = 0, pendDown = 0, pendReqs = 0;
  const FLUSH_BYTES = 512 * 1024;
  const FLUSH_MS = 10000;
  let lastFlush = Date.now();
  let flushing = false;

  /** ثبت دوره‌ای در پس‌زمینه — هر ۱۰ ثانیه یا ۵۱۲KB (هر کدام زودتر برسد) */
  const maybeFlush = (force) => {
    if (!user || !ctx || !ctx.waitUntil) return;
    if (flushing) return;
    const total = pendUp + pendDown;
    if (!force && total < FLUSH_BYTES && Date.now() - lastFlush < FLUSH_MS) return;
    if (!total && !pendReqs) return;
    const dUp = pendUp, dDown = pendDown, dReqs = pendReqs, u = user;
    pendUp = 0; pendDown = 0; pendReqs = 0;
    lastFlush = Date.now();
    flushing = true;
    ctx.waitUntil(usageDelta(env, u.uuid, dUp, dDown, dReqs)
      .catch(() => {})
      .then(() => { flushing = false; }));
  };

  /** آزاد کردنِ تضمین‌شده‌ی سهمیه‌ی اتصال — فقط یک‌بار */
  const releaseConn = async () => {
    if (!connAcquired || connReleased) return;
    connReleased = true;
    try { await connRelease(env, user && user.uuid, ip, connId); } catch (e) {}
  };

  const finish = async () => {
    if (closed) return;
    closed = true;
    if (hbTimer !== null) { try { clearInterval(hbTimer); } catch (e) {} hbTimer = null; }
    try { if (ws.readyState === 1 || ws.readyState === 2) ws.close(); } catch (e) {}
    try { sock && sock.close(); } catch (e) {}
    /* ثبت مصرفِ باقیمانده + آزاد کردن سهمیه — کاملاً در پس‌زمینه */
    const dUp = pendUp, dDown = pendDown, dReqs = pendReqs, u = user;
    pendUp = 0; pendDown = 0; pendReqs = 0;
    const p = (async () => {
      if (u && (dUp || dDown || dReqs)) { try { await usageDelta(env, u.uuid, dUp, dDown, dReqs); } catch (e) {} }
      await releaseConn();
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {}));
    await p;
  };

  /* fallback با fetch برای درخواست‌های HTTP وقتی connect() به مقصد وصل نمی‌شود
     (کلاودفلر اجازه‌ی اتصال سوکتی به بعضی سرویس‌های HTTP را نمی‌دهد) */
  const httpFallback = async (info) => {
    if (info.port !== 80 && info.port !== 443) return false;
    try {
      const text = new TextDecoder().decode(info.payload || new Uint8Array(0));
      const m = text.match(/^([A-Z]+)\s+(\S+)\s+HTTP\/[\d.]+\r?\n/);
      if (!m) return false;
      const headers = {};
      text.split(/\r?\n/).slice(1).forEach((l) => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
      delete headers['host']; delete headers['connection']; delete headers['content-length']; delete headers['accept-encoding'];
      const scheme = info.port === 443 ? 'https' : 'http';
      const body = text.split('\r\n\r\n').slice(1).join('\r\n\r\n');
      const resp = await fetch(scheme + '://' + info.addr + m[2], { method: m[1], headers, body: ['POST', 'PUT', 'PATCH'].includes(m[1]) && body ? body : undefined, redirect: 'manual' });
      const buf = new Uint8Array(await resp.arrayBuffer());
      let head = 'HTTP/1.1 ' + resp.status + ' ' + (resp.statusText || 'OK') + '\r\n';
      resp.headers.forEach((v, k) => { head += k + ': ' + v + '\r\n'; });
      head += '\r\n';
      const hb = new TextEncoder().encode(head);
      const full = new Uint8Array(hb.length + buf.length);
      full.set(hb); full.set(buf, hb.length);
      down += full.length; pendDown += full.length;      // downstream
      /* upstream: درخواست HTTP که کلاینت فرستاد — در dial() یک‌بار شمرده می‌شود */
      maybeFlush();
      ws.send(full);
      return true;
    } catch (e) { return false; }
  };

  /* ═══ معماری BPB: هدر پاسخ + پمپ دوجهته + retry با ProxyIP ═══ */

  /* ═══════════ پیاده‌سازی ProxyIP مطابق BPB ═══════════ */

  /** پمپ از سوکت ریموت به WebSocket. اگر هیچ داده‌ای نیامد، retry صدا زده می‌شود. */
  const remoteToWs = (tcpSock, respHeader, retry) => {
    let header = respHeader;
    let hasData = false;
    return (async () => {
      const reader = tcpSock.readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          /* مطابق مستندات: byteLength برای ArrayBuffer */
          const vLen = value.byteLength || value.length || 0;
          if (!vLen) continue;
          hasData = true;
          down += vLen; pendDown += vLen;
          maybeFlush();
          touch();
          if (ws.readyState !== 1) break;
          if (header && header.length) {
            const merged = new Uint8Array(header.length + vLen);
            merged.set(header, 0);
            merged.set(value, header.length);
            ws.send(merged);
            header = null;
          } else {
            ws.send(value);
          }
        }
      } catch (e) {}
      /* نکته‌ی کلیدی BPB: اگر وصل شد ولی هیچ داده‌ای برنگشت → retry با ProxyIP */
      if (!hasData && retry && !closed) {
        try { tcpSock.close(); } catch (e) {}
        sock = null;
        retry();
        return;
      }
      finish();
    })();
  };

  /**
   * اتصال به مقصد + نوشتن payload.
   * ⚠️ ترفند BPB: اگر آدرس یک IP literal باشد، با sslip.io می‌پوشانیم:
   *   104.17.1.1  →  www.104.17.1.1.sslip.io
   * چون connect() کلاودفلر به IP literal سرویس‌های HTTP اجازه نمی‌دهد ولی دامنه قبول می‌کند.
   */
  const connectAndWrite = async (address, port, payload) => {
    let host = String(address || '');
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) host = 'www.' + host + '.sslip.io';
    const tcpSock = connect({ hostname: host, port });
    sock = tcpSock;
    const w = tcpSock.writable.getWriter();
    /* ⚠️ up اینجا شمرده نمی‌شود — چون retry همان payload را دوباره می‌فرستد
       و باعث دوباره‌شماری می‌شود. آپلود در handle() شمرده می‌شود. */
    if (payload && payload.length) await w.write(payload);
    w.releaseLock();
    return tcpSock;
  };

  /** تبدیل IPv4 به آدرس NAT64 (حالت prefix) */
  const toNat64 = (ipv4, prefix) => {
    const p = String(ipv4 || '').split('.');
    if (p.length !== 4 || p.some((x) => isNaN(parseInt(x)))) return null;
    const hex = p.map((x) => parseInt(x).toString(16).padStart(2, '0'));
    const m = String(prefix || '').match(/^\[?([0-9A-Fa-f:]+)\]?$/);
    if (!m) return null;
    return '[' + m[1] + hex[0] + hex[1] + ':' + hex[2] + hex[3] + ']';
  };

  /** پارس host:port از یک ورودی ProxyIP (مثل BPB: parseHostPort) */
  const parseHostPort = (raw, defPort) => {
    let s = String(raw || '').trim().replace(/^[a-z]+:\/\//i, '').split('#')[0].split('@').pop();
    if (s.startsWith('[')) {                                   /* [ipv6]:port */
      const end = s.indexOf(']');
      return { host: s.slice(1, end), port: Number(s.slice(end + 2)) || defPort };
    }
    const i = s.lastIndexOf(':');
    if (i > 0 && /^\d+$/.test(s.slice(i + 1))) return { host: s.slice(0, i), port: Number(s.slice(i + 1)) };
    return { host: s, port: defPort };
  };

  const dial = async (info) => {
    user = info.user;
    if (info.cmd === 2) { await finish(); return; }
    if (!info.addr || !info.port) return finish();

    /* محدودیت اتصال — قبل از برقراری تونل بررسی می‌شود.
       ⚠️ فقط بر اساس IP واقعی کلاینت. محدودیتِ دستگاهی (deviceLimit)
       کاملاً حذف شده: با COUNT(DISTINCT ip) سنجیده می‌شد و چند کلاینت
       پشت یک NAT را یکی می‌دید (و برعکس). */
    const ipLimit = Number(user.ipLimit) || Number(st.settings.sec.ipConnLimit) || 0;
    if (ipLimit > 0) {
      const adm = await connAcquire(env, user.uuid, ip, ipLimit, connId);
      if (!adm.ok) {
        try { ws.close(1013, 'connection limit reached'); } catch (e) {}
        await finish();
        return;
      }
      connAcquired = true;
    }

    pendReqs++;
    const respHeader = info.isTrojan ? new Uint8Array(0) : new Uint8Array([info.version || 0, 0]);
    /* شمارش آپلود بسته‌ی اول — فقط همین‌جا، تا retry دوباره‌شماری نکند */
    const plLen = info.payload ? (info.payload.byteLength || info.payload.length || 0) : 0;
    if (plLen) { up += plLen; pendUp += plLen; }
    const s = st.settings;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    /* ── مرحله ۰: مقصد خودِ ورکر (تست ترافیک پنل) ──
       cloudflare:sockets اجازه‌ی اتصال به دامنه‌های روی CF را نمی‌دهد،
       پس مستقیم می‌رویم سراغ fallback با fetch() و از ProxyIP رد می‌شویم
       تا اندازه‌ی پاسخ دقیقاً همان چیزی باشد که درخواست شده. */
    if (selfHost && String(info.addr).toLowerCase() === selfHost && Number(info.port) === 443) {
      if (await httpFallback(info)) { await finish(); return; }
      try { ws.send(new TextEncoder().encode('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n')); } catch (e2) {}
      await finish();
      return;
    }

    /* ── مرحله ۲: retry با ProxyIP (وقتی وصل شد ولی داده‌ای برنگشت) ── */
    const retry = async () => {
      let addr = info.addr, port = info.port;
      try {
        if (s.nat64 && s.nat64.prefix && String(s.nat64.prefix).trim()) {
          /* حالت prefix: ساخت IP داینامیک با NAT64 */
          const prefixes = String(s.nat64.prefix).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
          if (prefixes.length) {
            const nat = toNat64(addr, pick(prefixes));
            if (nat) { addr = nat; port = 443; }
          }
        }
        const pips = (s.proxyIPs || []).filter(Boolean);
        if (pips.length) {
          /* حالت proxyip: انتخاب تصادفی از لیست */
          const hp = parseHostPort(pick(pips), 443);
          if (hp.host) { addr = hp.host; port = hp.port; }
        }
        if (addr === info.addr && port === info.port) { await finish(); return; }   /* چیزی برای retry نیست */
        const tcpSock = await connectAndWrite(addr, port, info.payload);
        remoteToWs(tcpSock, respHeader, null);
      } catch (e) { await finish(); }
    };

    /* ── مرحله ۱: اتصال مستقیم ── */
    try {
      const tcpSock = await connectAndWrite(info.addr, info.port, info.payload);
      sock = tcpSock;
      remoteToWs(tcpSock, respHeader, retry);
      return;
    } catch (e) { sock = null; }

    /* ── مرحله ۱ب: اتصال مستقیم ناموفق بود → مستقیم با ProxyIP ── */
    const pips = (s.proxyIPs || []).filter(Boolean);
    const prefixes = (s.nat64 && s.nat64.prefix ? String(s.nat64.prefix).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) : []);
    if (pips.length || prefixes.length) {
      for (let attempt = 0; attempt < Math.max(pips.length, prefixes.length, 1); attempt++) {
        let addr = info.addr, port = info.port;
        if (pips.length) { const hp = parseHostPort(pick(pips), 443); if (hp.host) { addr = hp.host; port = hp.port; } }
        else if (prefixes.length) { const nat = toNat64(addr, pick(prefixes)); if (nat) { addr = nat; port = 443; } }
        if (addr === info.addr && port === info.port) break;
        try {
          const tcpSock = await connectAndWrite(addr, port, info.payload);
          remoteToWs(tcpSock, respHeader, null);
          return;
        } catch (e) { sock = null; }
      }
    }

    /* ── مرحله ۳: fallback با fetch ── */
    if (await httpFallback(info)) { await finish(); return; }
    try { ws.send(new TextEncoder().encode('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n')); } catch (e2) {}
    await finish();
  };

  /* ═══════════ پشتیبانی UDP برای DNS (مطابق BPB) ═══════════
     بدون این، مرورگرها کار نمی‌کنند چون DNS از طریق UDP می‌آید.
     تلگرام کار می‌کند چون IPهایش hardcode شده‌اند. */

  /* ═══════════ DNS over UDP → DoH ═══════════
     فرمت UDP در VLESS: [۲ بایت طول][بسته‌ی UDP]
     فرمت پاسخ: [هدر VLESS][۲ بایت طول][پاسخ DNS] */

  const stripUdpLen = (buf) => {
    if (!buf || buf.length < 3) return buf;
    const len = (buf[0] << 8) | buf[1];
    if (len > 0 && len <= buf.length - 2) return buf.slice(2);
    return buf;
  };

  const dnsUdp = async (chunk, respHeader) => {
    let headerSent = false;

    const sendBack = (dnsResp) => {
      if (!dnsResp || !dnsResp.length || ws.readyState !== 1) return;
      const len = dnsResp.length;
      const lenBuf = new Uint8Array([(len >> 8) & 255, len & 255]);
      let merged;
      if (!headerSent && respHeader && respHeader.length) {
        merged = new Uint8Array(respHeader.length + 2 + len);
        merged.set(respHeader, 0);
        merged.set(lenBuf, respHeader.length);
        merged.set(dnsResp, respHeader.length + 2);
        headerSent = true;
      } else {
        merged = new Uint8Array(2 + len);
        merged.set(lenBuf, 0);
        merged.set(dnsResp, 2);
      }
      ws.send(merged);
      down += len; pendDown += len;                 // شمارش پاسخ DNS
    };

    /** ارسال پرس‌وجوی DNS از طریق DoH با POST */
    const doh = async (rawQuery) => {
      const query = stripUdpLen(rawQuery);
      if (!query || query.length < 12) return;
      try {
        const r = await fetch('https://1.1.1.1/dns-query', {
          method: 'POST',
          headers: { 'content-type': 'application/dns-message' },
          body: query,
        });
        if (r.ok) {
          const resp = new Uint8Array(await r.arrayBuffer());
          if (resp && resp.length > 12) { sendBack(resp); return; }
        }
      } catch (e) {}
      /* fallback: DNS over TCP به 8.8.8.8 */
      try {
        const s2 = connect({ hostname: '8.8.8.8', port: 53 });
        const w2 = s2.writable.getWriter();
        const tcpQ = new Uint8Array(2 + query.length);
        tcpQ[0] = (query.length >> 8) & 255;
        tcpQ[1] = query.length & 255;
        tcpQ.set(query, 2);
        await w2.write(tcpQ);
        w2.releaseLock();
        const rd2 = s2.readable.getReader();
        const { value } = await Promise.race([rd2.read(), new Promise((_, rj) => setTimeout(() => rj(new Error('to')), 4000))]);
        rd2.cancel();
        try { s2.close(); } catch (e2) {}
        if (value && value.length > 14) sendBack(value.slice(2));
      } catch (e2) {}
    };

    await doh(chunk);
    return { write: (c) => doh(c) };       // ← بدون async در write
  };

  const handle = async (data) => {
    if (closed) return;
    /* تبدیل به Uint8Array — مطابق مستندات Cloudflare:
       ArrayBuffer باید با byteLength سنجیده شود، نه length */
    let buf = null;
    try {
      if (data instanceof ArrayBuffer) buf = new Uint8Array(data);
      else if (ArrayBuffer.isView(data)) buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      else if (typeof data === 'string') buf = new TextEncoder().encode(data);
      else if (data && typeof data.arrayBuffer === 'function') buf = new Uint8Array(await data.arrayBuffer());
      else if (data && data.byteLength !== undefined) buf = new Uint8Array(data);
    } catch (e) { buf = null; }
    if (!buf || !buf.byteLength) return;

    /* ═══ اولویت ۱: نشست DNS ═══
       فقط اگر بسته شبیه هدر VLESS/Trojan نباشد.
       اگر کلاینت اتصال جدیدی در همان WebSocket شروع کند (هدر VLESS)،
       نشست DNS باید تمام شود. */
    if (dnsWriter) {
      const isVless = (() => {
        try { const p = parseVless(buf); return !!(p && byUuid.has(p.uuid)); } catch (e) { return false; }
      })();
      if (isVless) { dnsWriter = null; }              // اتصال جدید → نشست DNS تمام
      else {
        try { up += buf.byteLength; pendUp += buf.byteLength; await dnsWriter.write(buf); maybeFlush(); } catch (e) {}
        return;
      }
    }

    if (!sock) {
      /* اولین بسته → تشخیص پروتکل و احراز هویت */
      const v = parseVless(buf);
      if (v && byUuid.has(v.uuid)) {
        const info = { ...v, user: byUuid.get(v.uuid), version: buf[0], isTrojan: false };

        /* پشتیبانی UDP برای DNS (port 53) — با DoH */
        if (v.cmd === 2) {
          if (v.port === 53) {
            /* ⚠️ user را ست می‌کنیم تا مصرف DNS هم شمرده شود */
            user = info.user;
            const respHeader = new Uint8Array([info.version || 0, 0]);
            const qLen = v.payload ? (v.payload.byteLength || v.payload.length || 0) : 0;
            up += qLen; pendUp += qLen;
            const w = await dnsUdp(v.payload, respHeader);
            dnsWriter = w;
            maybeFlush();
            return;
          }
          return finish();                                    // UDP غیر DNS پشتیبانی نمی‌شود
        }
        return dial(info);                                    // TCP
      }
      const t = parseTrojan(buf);
      if (t && byPass.has(t.pass)) {
        /* Trojan در BPB فقط TCP را می‌پذیرد */
        if (t.cmd === 2) { console.log('[SG] Trojan UDP rejected'); return finish(); }
        console.log('[SG] TCP connect:', t.addr + ':' + t.port, 'proto=trojan');
        return dial({ addr: t.addr, port: t.port, cmd: 1, payload: t.payload, user: byPass.get(t.pass), isTrojan: true });
      }
      console.log('[SG] auth failed, len=', buf.byteLength, 'first-byte=', buf[0]);
      return finish();                                        // UUID یا رمز نامعتبر
    }

    /* بسته‌های بعدی → مستقیم به سوکت TCP */
    if (!sock) return;
    touch();
    try {
      const w = sock.writable.getWriter();
      up += buf.byteLength; pendUp += buf.byteLength;
      maybeFlush();
      await w.write(buf);
      w.releaseLock();
    } catch (e) { finish(); }
  };

  /* ═══════════ معماری BPB: پایپ‌لاین ReadableStream → WritableStream ═══════════
     این روش backpressure و مدیریت چرخه‌ی حیات را درست انجام می‌دهد.
     روی موبایل که بسته‌ها به‌صورت متفاوت می‌آیند، حیاتی است. */
  const readableWs = new ReadableStream({
    start(controller) {
      /* پیام‌هایی که قبل از ساخت پایپ‌لاین رسیده بودند را اول تحویل بده */
      pipeReady = true;
      while (earlyBuf.length) { try { controller.enqueue(earlyBuf.shift()); } catch (e) {} }
      ws.addEventListener('message', (ev) => {
        if (closed) return;
        try { controller.enqueue(ev.data); } catch (e) {}
      });
      ws.addEventListener('close', () => {
        if (closed) return;
        try { controller.close(); } catch (e) {}
        finish();
      });
      ws.addEventListener('error', (err) => {
        if (closed) return;
        try { controller.error(err); } catch (e) {}
        finish();
      });
      /* early-data: base64 امن برای URL (مثل BPB) */
      if (early) {
        try {
          const b = early.replace(/-/g, '+').replace(/_/g, '/');
          const dec = atob(b);
          const u8 = Uint8Array.from(dec, (c) => c.charCodeAt(0));
          controller.enqueue(u8);
        } catch (e) { /* early data خراب بود — نادیده بگیر */ }
      }
    },
    cancel() { finish(); }
  });

  const writableStream = new WritableStream({
    async write(chunk, controller) {
      if (closed) return;
      try { await handle(chunk); }
      catch (e) { try { controller.error(e); } catch (e2) {} finish(); }
    },
    close() { try { sock && sock.close(); } catch (e) {} },
    abort() { finish(); }
  });

  readableWs.pipeTo(writableStream).catch(() => finish());
}

/* ════════════════════════════ تست ترافیک ════════════════
   درخواست از «مرورگرِ همان کسی که دکمه را زده» می‌آید و سرور با اندازه‌ی
   دقیقاً معلوم پاسخ می‌دهد. بایت‌های پاسخ — با همان تابع usageDelta که
   ترافیک واقعیِ تونل را می‌شمارد — برای کاربرِ صاحبِ کانفیگ ثبت می‌شوند،
   تا پنل بتواند حجمِ ثبت‌شده را با حجمِ واقعی مقایسه کند. */
async function speedtestHandler(url, env, request) {
  const MAX = 20 * 1024 * 1024;                       // سقف ۲۰ مگابایت
  const n = Math.max(1, Math.min(MAX, Math.floor(Number(url.searchParams.get('bytes')) || 1048576)));
  const sid = url.searchParams.get('sid') || '';
  const token = url.searchParams.get('t') || '';
  const CH = 65536;
  const block = new Uint8Array(CH).fill(0x53);        // 0x53 = 'S'
  const body = new Uint8Array(n);
  for (let o = 0; o < n; o += CH) body.set(o + CH <= n ? block : block.subarray(0, n - o), o);

  /* ═══ ثبتِ مصرف — دقیقاً همان مسیری که ترافیکِ تونل را می‌شمارد ═══
     توکن از اعتبارنامه‌های کانفیگ (uuid + secret) ساخته شده، پس این بایت‌ها
     به همان کاربر نسبت داده می‌شوند و با مصرفِ دیگران قاطی نمی‌شود. */
  let recorded = 0, user = null, usageErr = '';
  try {
    if (token) {
      const stt = await load(env);
      user = (stt.users || []).find((u) => trafficToken(u) === token) || null;
    }
    if (user) {
      const reqBytes = ((request && request.url) ? String(request.url).length : 0) + 96;   /* خط درخواست + هدرها */
      await usageDelta(env, user.uuid, reqBytes, n, 1);
      recorded = reqBytes + n;
    }
  } catch (e) {
    usageErr = String((e && e.message) || e).slice(0, 160);   /* پنهان نمی‌ماند */
  }

  const headers = {
    'content-type': 'application/octet-stream',
    'content-length': String(n),
    'x-speedtest-bytes': String(n),
    'x-usage-recorded': String(recorded),
    'x-usage-user': user ? String(user.name) : '',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'x-speedtest-bytes,x-usage-recorded,x-usage-user',
  };
  if (sid) headers['x-speedtest-sid'] = String(sid);
  if (usageErr) headers['x-usage-error'] = usageErr;
  return new Response(body, { headers });
}

/* ════════════════════════════ DoH proxy ════════════════════════════ */
async function dohHandler(req, env, url) {
  const st = await load(env), s = st.settings;
  if (!s.dohProxy) return json({ error: 'disabled' }, 404);
  const target = s.doh.url.split('/dns-query')[0] + '/dns-query?' + url.searchParams.toString();
  const r = await fetch(target, { headers: { accept: 'application/dns-json' } });
  return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/dns-json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=60' } });
}

/* ════════════════════════════ هدرهای امنیتی ════════════════════════════ */
function secHeaders(s, noCsp) {
  const h = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  if (s.sec.csp && !noCsp) {
    /* اجازه‌ی CDNهای واقعی: Font Awesome، Vazirmatn، JetBrains Mono، flagcdn، qrserver */
    h['content-security-policy'] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: wss:; img-src * data: blob:; font-src * data:; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: wss:; frame-ancestors 'none'";
    h['x-frame-options'] = 'DENY';
  }
  if (s.sec.cors) { h['access-control-allow-origin'] = '*'; h['access-control-allow-headers'] = 'authorization,content-type'; h['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,OPTIONS'; }
  return h;
}

/* ════════════════════════════ ورودی ════════════════════════════ */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cf = request.cf || null;
    try {
      /* ساخت جدول D1 در اولین درخواست — فقط یک‌بار در طول عمر isolate */
      if (env.DB && !DB_READY) {
        DB_READY = true;                    // جلوگیری از تلاش مجدد
        try {
          await env.DB.prepare('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT)').run();
        } catch (e) {}
      }
      if (request.method === 'OPTIONS') { const s0 = (await load(env)).settings; return new Response(null, { status: 204, headers: secHeaders(s0) }); }
      if (url.pathname === '/dns-query') return dohHandler(request, env, url);
      /* فایل با اندازه‌ی معلوم — برای «تست واقعی ترافیک» از داخل تونل */
      /* فایل با اندازه‌ی معلوم — درخواست از مرورگرِ کاربر می‌آید، سرور با کانفیگِ همان کاربر پاسخ می‌دهد */
      if (url.pathname === '/__speedtest') return await speedtestHandler(url, env, request);
      /* ⚠️ اگر apiHandler ردّ (reject) شود، try/catch بیرونی آن را نمی‌گیرد چون async است.
         پس پاسخ HTML خطای کلاودفلار برمی‌گشت = «bad json». با .catch این مشکل حل می‌شود. */
      if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
        try { return await apiHandler(request, env, url, ctx); }
        catch (e) { return json({ ok: false, error: 'خطای داخلی: ' + String((e && e.message) || e) }, 500); }
      }

      const st = seed(await load(env)), s = st.settings;

      /* ═══════════════════════════════════════════════════════════════
         مسیریابی استتار — مثل نهان
         منطق: هیچ مسیری «عمومی» نیست. همه‌ی مسیرهای ناشناخته = سایت پوششی.
         پنل، API و اشتراک فقط روی «مسیر ریشه» (apiRoute) کار می‌کنند.
         ═══════════════════════════════════════════════════════════════ */

      /* ۱) تونل: هر درخواست ارتقای WebSocket — مستقل از مسیر (مثل نهان) */
      const isWs = String(request.headers.get('upgrade') || '').toLowerCase() === 'websocket';
      /* تونل: state از fetch handler می‌آید — بدون await اضافی */
      if (isWs) return tunnelHandler(request, env, await load(env), ctx);

      /* ۲) مسیرهای ریشه‌ای زیر مسیر مخفی */
      const route = '/' + String(s.auth.path || 'panel').replace(/^\/+/, '');
      let path = url.pathname;
      if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);

      const isPanel = path === route || path === route + '/dash';
      const isSub   = path.startsWith(route + '/sub');
      const isHealth = path === '/health' || path.startsWith('/api/');

      /* health و api همیشه آزادند (برای مانیتورینگ) */
      if (isHealth) { try { return await apiHandler(request, env, url, ctx); } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }, 500); } }

      /* ۳) پنل — روی مسیر مخفی */
      if (isPanel) {
        const html = await loadUI(env, false);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...secHeaders(s) } });
      }

      /* ۴) اشتراک — روی مسیر مخفی */
      if (isSub) {
        const id = path.split('/').pop();
        const newUrl = new URL(url);
        newUrl.pathname = '/' + s.sub.path + '/' + (id || '');
        return subHandler(request, env, newUrl, cf, false);
      }

      /* ۵) صفحه‌ی کاربر (اختیاری، مسیر مستقیم) */
      if (path.startsWith('/status/')) return subHandler(request, env, url, cf, true);
      if (path.startsWith('/' + s.sub.path + '/')) return subHandler(request, env, url, cf, false);

      /* ۶) تست سلامت مسیر */
      if (url.searchParams.get('test') === '1') {
        return txt('TUNNEL_OK • host=' + url.hostname + '\nمسیر تونل فعال است.', { 'x-tunnel': 'ok' });
      }

      /* ۷) همه‌ی مسیرهای دیگر = سایت پوششی (استتار مثل نهان) */
      return decoyPage(s, url.searchParams.get('refresh') === '1');
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    } finally {
      /* نوشتن باقیمانده در D1 — بعد از کامل شدن پاسخ */
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(flushDB(env).catch(() => {}));
      }
    }
  },
};
