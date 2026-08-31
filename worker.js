/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  پنل مدیریت کانفیگ — Cloudflare Worker (تک‌فایل)
 *  نسخه 3.0.0 • UI از گیت‌هاب خوانده می‌شود (fragment enhancement / FR)
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

const VERSION = '3.0.0';
const BUILD = '2026.08.30';
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

    /* ═══════════ سرورهای خروجی VLESS (exit / outbound) ═══════════
       ترافیکِ کاربر می‌تواند به‌جای رفتنِ مستقیم به مقصد، از یکی از این
       سرورها عبور کند تا «آی‌پی خروجی» همان سرور باشد.
       پیش‌فرضِ سراسری اینجا است؛ هر کانفیگ (کاربر) می‌تواند جداگانه
       انتخاب کند: پیروی از سراسری / یکی از سرورها / مستقیمِ بدون واسطه. */
    exits: {
      /* کلیدِ اصلی: آیا خروجی‌ها در مسیر تونل به کار می‌روند؟
         با خاموش کردنش، فهرستِ سرورها دست‌نخورده می‌ماند اما تونل مستقیم می‌رود. */
      enabled: true,
      defaultMode: 'direct',     /* 'direct' = بدون واسطه • 'exit' = از سرور خروجی */
      defaultExit: '',           /* شناسه‌ی سرور، وقتی defaultMode === 'exit' */
      /* هر سرور: { id, name, label, address, port, uuid, flow, security,
                    transport, path, serviceName, sni, host, enabled, params }
         params جایِ پارامترهای تازه‌ای است که در آینده اضافه می‌شوند. */
      servers: [],
    },

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
    /* آزادسازیِ آی‌پی دیگر تنظیم‌پذیر نیست: آنی هنگام قطع شدن، و حداکثر ۳ ثانیه
       برای قطعیِ ناگهانی (CONN_TTL در کد ثابت است). */
    sec: { cors: true, csp: true, killSwitch: false, ipConnLimit: 0, speedTestUrl: '' },
    sub: {
      path: 'sub', userAgent: '', fakeConfigs: true, nodeLimit: 12, converter: '', telegramChannel: '@simorgh_channel',
      /* آیدی تلگرامی که در صفحه‌ی کاربر و لینک ساب نمایش داده می‌شود */
      telegramSupport: '@simorgh_channel', telegramBuy: '',
      countryGroups: true, namePrefix: 'پنل',
      /* الگوی نام کاملاً سفارشی — خالی یعنی از nameStrategy (الگوی آماده) استفاده شود.
         توکن‌ها: {prefix} {user} {proto} {port} {ip} {node} {index} {mark} */
      namePattern: '',
      rules: ['GEOIP,IR,DIRECT', 'DOMAIN-SUFFIX,ir,DIRECT', 'GEOSITE,category-ads-all,REJECT'],
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

/* ⚠️ پنجره‌ی «کهنگیِ اتصال» ثابت است و دیگر هیچ تنظیمی ندارد (قبلاً یک گزینه‌ی
   ثانیه‌ای در بخش امنیتِ پنل بود که کاربر گزارش داد اشتباهاً به جای ثانیه،
   «دقیقه» برداشت می‌شود؛ آزادسازی حالا آنی است و آن گزینه حذف شده).
   منطقِ جدید:
     • آزادسازی همان لحظه‌ی قطع شدنِ اتصال انجام می‌شود (بستن، خطا، لغو،
       انصراف، خطای اتصال، مسیر UDP) — این حالتِ «آنی» است؛
     • اگر ردیفی به هر دلیل (kill شدنِ isolate، قطعِ ناگهانیِ موبایل) آزاد
       نشود، نهایتاً ۳ ثانیه بعد هنگامِ پذیرشِ بعدی پاک‌سازی می‌شود؛
     • یک اتصالِ در حالِ انتقالِ واقعی با تمدیدِ مبتنی بر فعالیت (حداکثر یک
       نوشتن در ثانیه) زنده می‌ماند، پس هیچ‌وقت اشتباهاً بیرون رانده نمی‌شود. */
const CONN_TTL = 3000;                // ۳ ثانیه — سقفِ سخت برای قطعیِ ناگهانی
const CONN_ACTIVITY_MS = 1000;        // تمدیدِ مبتنی بر فعالیت: حداکثر ۱ نوشتن/ثانیه
const CONNS = new Map();              // uuid -> Map<ip, Map<connId, lastTs>>
let CONN_LAST_ERR = null;             // آخرین خطا — در کارت سلامت نمایش داده می‌شود
let CONN_DENIES = 0;                  // تعداد رد شدن‌ها (اثباتِ فعال بودن محدودیت)
let CONN_ACQUIRES = 0;
let CONN_EVICTS = 0;                  // تعداد بیرون‌راندنِ آی‌پی‌های کهنه

const KV_C = (uuid, ip, id) => 'c:' + uuid + ':' + ip + ':' + id;
const connErr = (tag, e) => { CONN_LAST_ERR = tag + ': ' + String((e && e.message) || e); };

/* ═══ انتخابِ بک‌اندِ محدودیت (علتِ شماره‌ی یکِ «محدودیت کار نمی‌کند») ═══
   یک ورکر روی صدها isolate اجرا می‌شود و هر isolate حافظه‌ی خودش را دارد؛
   پس یک Map در حافظه فقط «همین isolate» را می‌شمارد و اتصالی که به isolate
   دیگری می‌افتد از صفر شمرده می‌شود → محدودیت عملاً بی‌اثر. برای شمارشِ
   واقعاً سراسری باید یک مرجعِ مشترک وجود داشته باشد:
     do  → Durable Object: یک نمونه‌ی جهانی برای کل ورکر — دقیق و همگام
     kv  → KV: مشترک بین isolateها، اما eventually-consistent (تقریبی)
     mem → فقط حافظه‌ی همین isolate: هیچ تضمینی بین isolateها نمی‌دهد
   پنل همیشه می‌گوید کدام بک‌اند فعال است تا عددِ نمایش‌داده‌شده گمراه‌کننده
   نباشد. */
function limiterBackend(env) {
  if (env && env.LIMITER) return 'do';
  if (env && env.DB) return 'd1';      /* ⚠️ استقرارِ واقعیِ بیشتر کاربران: فقط D1 بایند است */
  if (env && env.KV) return 'kv';
  return 'mem';
}
const LIM_LABEL = {
  do: 'Durable Object — سراسری و دقیق',
  d1: 'D1 — سراسری و دقیق (همهٔ isolateها یک پایگاه‌داده)',
  kv: 'KV — مشترک اما تقریبی',
  mem: 'حافظه — فقط همین isolate (محدودیت بین isolateها تضمین نمی‌شود)'
};

/** فراخوانیِ شیءِ محدودیت — یک نمونه برای کل ورکر (idFromName ثابت) */
async function limiterRpc(env, path, body) {
  const stub = env.LIMITER.get(env.LIMITER.idFromName('global'));
  const r = await stub.fetch('https://limiter' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return await r.json();
}

/* ═══════════════════════════════════════════════════════════════════════════
   معنای سقف — مدلِ Nova-Proxy (نه تعدادِ کانکشن)
   ───────────────────────────────────────────────────────────────────────────
   Nova-Proxy سقف را «تعداد IPهای همزمانِ مجاز برای هر کاربر» می‌سنجد
   (فیلد ipLimit روی پروفایل + activeIps). منطقش دقیقاً این است:

       if (ip در فهرستِ فعال‌ها هست)  → همیشه مجاز (فقط شمارنده‌اش +۱)
       else if (تعداد IPهای فعال >= سقف) → رد با دلیل ip-limit

   پس با سقفِ ۱: اولین IP وصل می‌شود و IP دوم رد می‌شود — و اتصالِ دوم
   از همان IP اول همچنان مجاز است. این همان رفتاری است که کاربر انتظار دارد.

   نگه‌داری:  uuid -> { ip -> { connId -> lastTs } }
   • یک IP تا وقتی «زنده» است که دست‌کم یک اتصالِ فعال داشته باشد؛
   • هر اتصال شناسه‌ی یکتا دارد، پس آزادسازی فقط سهمیه‌ی خودش را کم می‌کند؛
   • ورودی‌های کهنه (بدون هیچ فعالیتی برای CONN_TTL) خودبه‌خود پاک می‌شوند؛
   • سقفِ ۰ یا خالی = نامحدود.
   ═══════════════════════════════════════════════════════════════════════════ */

/** نگاشتِ کاربر (در صورت نیاز ساخته می‌شود) */
function userMapOf(uuid, create) {
  let um = CONNS.get(uuid);
  if (!um && create) { um = new Map(); CONNS.set(uuid, um); }
  return um;
}

/** حذفِ ورودی‌های مرده؛ می‌گرداند: Map<ip, تعداد اتصال‌های زنده> */
function pruneUser(um, now, ttl) {
  if (!um) return new Map();
  const T = Number(ttl) || CONN_TTL;
  um.forEach((m, ip) => {
    if (!m || !(m instanceof Map)) { um.delete(ip); return; }
    m.forEach((ts, id) => { if (!ts || now - ts > T) m.delete(id); });
    if (!m.size) um.delete(ip);
  });
  const out = new Map();
  um.forEach((m, ip) => { if (m && m.size) out.set(ip, m.size); });
  return out;
}

/** تصمیمِ پذیرش — یکجا و مشترک بین DO / KV / حافظه تا رفتار یکی باشد */
function admitDecision(ips, ip, limit) {
  if (ips.has(ip)) return { ok: true, reason: 'same-ip' };          /* همان IP → همیشه مجاز */
  if (limit > 0 && ips.size >= limit) return { ok: false, reason: 'ip-limit' };
  return { ok: true, reason: 'new-ip' };
}

/** آینه‌ی حافظه برای نمایشِ فوری در پنل (مرجعِ تصمیم، DO است) */
function mirrorSet(uuid, ip, connId, now, ok) {
  if (!uuid || !ip || !connId) return;
  const um = userMapOf(uuid, false);
  if (!um) return;
  const m = um.get(ip);
  if (!m) return;
  if (ok) m.set(connId, now); else m.delete(connId);
  if (!m.size) um.delete(ip);
  if (!um.size) CONNS.delete(uuid);
}

/* ═══════════════════════════════════════════════════════════════════════════
   مرجعِ مشترک روی D1 — جدولِ «اتصال‌های زنده» (conns)
   ───────────────────────────────────────────────────────────────────────────
   چرا این جدول لازم شد؟ چون واقعیتِ استقرار این است:
     • کاربر worker.js را در داشبورد کلاودفلر paste می‌کند → Durable Object
       اصلاً ساخته نمی‌شود (فقط با wrangler deploy ممکن است)؛
     • معمولاً فقط یک پایگاه D1 با نام DB بایند است و نه KV.
   در آن حالت تنها مرجعِ مشترکِ بین isolateها همان D1 است؛ بدون آن هر isolate
   شمارنده‌ی خودش را دارد و محدودیت هرگز اعمال نمی‌شود. جدولِ conns دقیقاً یک
   ردیف برای هر اتصالِ زنده نگه می‌دارد و همان معنای سقف (تعداد IPهای متمایز)
   را پیاده می‌کند.
   ═══════════════════════════════════════════════════════════════════════════ */

let LIVE_READY = false;

/** ساخت/تعمیر جدول — idempotent؛ بارها قابل فراخوانی است */
async function liveEnsure(env) {
  if (!env || !env.DB) return false;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conns (
      conn_id TEXT PRIMARY KEY,
      uuid TEXT NOT NULL,
      ip TEXT NOT NULL,
      last_ts INTEGER NOT NULL
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conns_user ON conns(uuid, ip)').run();
    LIVE_READY = true;
    return true;
  } catch (e) { connErr('D1-schema', e); return false; }
}

/** حذفِ اتصال‌های کهنه (بدون هیچ فعالیتی برای CONN_TTL)
    ⚠️ نوعِ ستون هم بررسی می‌شود: در پایگاه‌داده‌های قدیمی ممکن است last_ts به‌جای
    عددِ میلی‌ثانیه، رشته (مثل ISO) یا مقدارِ ثانیه‌ای باشد. مقایسه‌یِ ساده‌ی
    «last_ts < cut» چنین ردیف‌هایی را هرگز پاک نمی‌کند (در SQLite هر رشته از هر
    عدد بزرگ‌تر است) → همان «آی‌پی برای همیشه قفل شده». پس:
      • هرچه عددِ صحیح نیست (رشته/تهی) → همیشه مرده حساب می‌شود؛
      • اعداد هم با آستانه‌ی انقضا سنجیده می‌شوند؛
      • ردیف‌های بی‌uuid هم پاک می‌شوند تا چیزی برای همیشه نماند. */
async function liveSweep(env, uuid) {
  if (!env || !env.DB) return;
  const cut = Date.now() - CONN_TTL;
  try {
    await env.DB.prepare(`DELETE FROM conns
      WHERE typeof(last_ts) <> 'integer' OR last_ts IS NULL OR last_ts < ?`).bind(cut).run();
    if (uuid) {
      /* ردیف‌هایی که به این کاربر تعلق دارند اما شناسه/زمانِ معتبر ندارند */
      await env.DB.prepare('DELETE FROM conns WHERE uuid = ? AND (ip IS NULL OR ip = \'\')').bind(uuid).run();
    }
  } catch (e) { connErr('D1-sweep', e); }
}

/** سنِ آخرین فعالیتِ هر آی‌پی (ثانیه) — برای بیرون راندنِ آی‌پی‌های واقعاً رفته */
async function liveIpsAged(env, uuid) {
  const out = [];
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare(
      `SELECT ip, MAX(last_ts) AS t, COUNT(*) AS n FROM conns
       WHERE uuid = ? AND typeof(last_ts) = 'integer' GROUP BY ip ORDER BY t ASC`).bind(uuid).all();
    for (const row of ((r && r.results) || [])) {
      out.push({ ip: String(row.ip), last: Number(row.t) || 0, n: Number(row.n) || 0 });
    }
  } catch (e) { connErr('D1-ips-aged', e); }
  return out;
}

/** بیرون راندنِ آی‌پی‌های کهنه — راهِ خروج وقتی قطع شدن ثبت نشده است.
    اگر آزادسازی به هر دلیل (kill شدنِ isolate، قطعِ ناگهانیِ موبایل، خطای
    شبکه) اجرا نشده باشد، ردیف قفل می‌ماند. اینجا هر آی‌پی‌ای که به اندازه‌ی
    CONN_TTL هیچ فعالیتی نداشته، «رفته» فرض و حذف می‌شود تا آی‌پیِ جدید
    جای آن را بگیرد. (پاک‌سازیِ هنگامِ پذیرش معمولاً زودتر این کار را کرده؛
    این مسیر فقط شبکه‌ی ایمنیِ دوم است.) */
async function d1EvictIdle(env, uuid, need) {
  if (!env || !env.DB || !uuid) return 0;
  const cut = Date.now() - CONN_TTL;
  let removed = 0;
  try {
    const aged = await liveIpsAged(env, uuid);
    for (const row of aged) {
      if (removed >= need) break;
      if (!row.last || row.last > cut) continue;                 /* هنوز زنده است */
      const r = await env.DB.prepare('DELETE FROM conns WHERE uuid = ? AND ip = ?')
        .bind(uuid, row.ip).run();
      removed += Number((r && r.changes) || (r && r.rowsWritten) || 0) || row.n;
    }
    if (removed) CONN_EVICTS += removed;
  } catch (e) { connErr('D1-evict', e); }
  return removed;
}

/** آی‌پی‌های زنده‌ی یک کاربر به ترتیبِ قدیمی‌ترین — برای رتبه‌بندی در رقابت */
async function liveIpsOrdered(env, uuid) {
  const out = [];
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare('SELECT ip, MIN(last_ts) AS t FROM conns WHERE uuid = ? GROUP BY ip ORDER BY t ASC, ip ASC').bind(uuid).all();
    for (const row of ((r && r.results) || [])) out.push(String(row.ip));
  } catch (e) { connErr('D1-ips-ordered', e); }
  return out;
}

/** IPهای زنده‌ی یک کاربر → Map<ip, تعداد اتصال> */
async function liveIps(env, uuid) {
  const out = new Map();
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare('SELECT ip, COUNT(*) AS n FROM conns WHERE uuid = ? GROUP BY ip').bind(uuid).all();
    for (const row of ((r && r.results) || [])) out.set(String(row.ip), Number(row.n) || 0);
  } catch (e) { connErr('D1-ips', e); }
  return out;
}

/** پذیرش/رد روی D1 — تصمیم با همان admitDecision بقیهٔ بک‌اندها */
async function d1Acquire(env, uuid, ip, limit, id, now) {
  if (!(await liveEnsure(env))) return null;
  await liveSweep(env, uuid);
  let ips = await liveIps(env, uuid);
  let dec = admitDecision(ips, ip, limit);
  /* رد شدن به‌خاطر پر بودنِ سقف؟ اول آی‌پی‌های واقعاً رفته را بیرون بران
     (به اندازه‌ی CONN_TTL فعالیت نداشته باشند) و دوباره تصمیم بگیر — این همان چیزی
     است که «عوض کردنِ اینترنت» را فوری می‌کند. */
  if (!dec.ok) {
    const evicted = await d1EvictIdle(env, uuid, Math.max(1, ips.size - limit + 1));
    if (evicted > 0) { ips = await liveIps(env, uuid); dec = admitDecision(ips, ip, limit); }
  }
  if (!dec.ok) return { ok: false, ips: ips.size, conns: ips.get(ip) || 0, limit, enforced: true, storage: 'd1', reason: dec.reason, id };
  try {
    await env.DB.prepare('INSERT OR REPLACE INTO conns (conn_id, uuid, ip, last_ts) VALUES (?, ?, ?, ?)')
      .bind(id, uuid, ip, now).run();
  } catch (e) {
    /* درج نشد → محدودیت خاموش نمی‌شود: با همان عددِ خوانده‌شده ادامه می‌دهیم
       و خطا را در کارت سلامت نشان می‌دهیم */
    connErr('D1-insert', e);
    return { ok: true, ips: ips.size + (ips.has(ip) ? 0 : 1), conns: (ips.get(ip) || 0) + 1, limit, enforced: limit > 0, storage: 'd1', reason: dec.reason, id };
  }
  /* بستنِ پنجرهٔ رقابت: اگر چند آی‌پیِ جدید هم‌زمان رسیده باشند، بعد از درج
     دوباره می‌شماریم. تصمیم با «رتبه بر اساس زمانِ ورود» است: قدیمی‌ترین‌ها
     تا سقف می‌مانند و مازاد ردیفِ خود را پس می‌گیرد. نتیجه: همیشه دقیقاً به
     اندازهٔ سقف آی‌پی پذیرفته می‌شود و محدودیت نه سخت‌گیرانه می‌شود و نه دور زده. */
  const after = await liveIps(env, uuid);
  if (limit > 0 && after.size > limit && dec.reason === 'new-ip') {
    const order = await liveIpsOrdered(env, uuid);
    const rank = order.indexOf(ip);
    if (rank < 0 || rank >= limit) {
      try { await env.DB.prepare('DELETE FROM conns WHERE conn_id = ?').bind(id).run(); }
      catch (e) { connErr('D1-rollback', e); }
      const back = await liveIps(env, uuid);
      return { ok: false, ips: back.size, conns: back.get(ip) || 0, limit, enforced: true, storage: 'd1', reason: 'ip-limit', id };
    }
  }
  return { ok: true, ips: after.size, conns: after.get(ip) || 0, limit, enforced: limit > 0, storage: 'd1', reason: dec.reason, id };
}

/** آزادسازی — فقط همین conn_id */
async function d1Release(env, connId) {
  if (!env || !env.DB || !connId) return;
  try { await env.DB.prepare('DELETE FROM conns WHERE conn_id = ?').bind(connId).run(); }
  catch (e) { connErr('D1-release', e); }
}

/** heartbeat — فقط تمدیدِ ردیفِ موجود
    ⚠️ نسخه‌ی قبلی وقتی UPDATE هیچ ردیفی را عوض نمی‌کرد، ردیف را دوباره «درج»
    می‌کرد. در عمل ضربان‌هایی که با ctx.waitUntil در صف مانده‌اند بعد از بسته
    شدنِ اتصال اجرا می‌شوند: ردیفِ حذف‌شده دوباره زنده می‌شد و تا پایانِ TTL
    (قبلاً ۵ دقیقه) جایِ آن آی‌پی را قفل نگه می‌داشت — دقیقاً همان چیزی که کاربر
    «ذخیره‌ی دائمیِ اولین آی‌پی» توصیف کرده بود. اتصالِ آزادشده هرگز نباید
    برگردد؛ اگر ردیفی نیست یعنی اتصال تمام شده است. */
async function d1Touch(env, uuid, ip, connId) {
  if (!env || !env.DB || !connId) return;
  const now = Date.now();
  try {
    await env.DB.prepare(`UPDATE conns SET last_ts = ?
      WHERE conn_id = ? AND typeof(last_ts) = 'integer'`).bind(now, connId).run();
  } catch (e) { connErr('D1-touch', e); }
}

/** آینهٔ حافظه برای نمایشِ فوری (مرجعِ تصمیم در حالت d1 خودِ D1 است) */
function mirrorAdd(uuid, ip, connId, now) {
  if (!uuid || !ip || !connId) return;
  const um = userMapOf(uuid, true);
  let m = um.get(ip);
  if (!m) { m = new Map(); um.set(ip, m); }
  m.set(connId, now);
}

/* ═══════════════════════════════════════════════════════════════════════════
   جزئیاتِ اتصال — جدولِ جداگانه (conn_meta) برای نمایش در پنل
   ───────────────────────────────────────────────────────────────────────────
   چرا جدولِ جدا و نه ستونِ تازه روی conns؟
     • جدولِ conns مسیرِ حساسِ محدودساز است؛ هر تغییرِ ساختاری در آن ریسکِ
       «اتصال رد شد» را برای استقرارهای فعلی دارد. ALTER TABLE روی یک جدولِ
       زنده‌ای که INSERT/DELETE‌اش مستقیماً تعیین می‌کند کاربر وصل شود یا نه،
       ارزشِ یک پرچمِ کشور را ندارد.
     • conn_meta فقط خوانده می‌شود، فقط برای نمایش. اگر اصلاً ساخته نشود یا
       خراب شود، محدودساز و تونل دقیقاً مثل قبل کار می‌کنند و پنل به‌سادگی
       ستون‌های جزئیات را خالی نشان می‌دهد.
   نوشته‌شده در D1 (تنها بک‌اندِ واقعیِ استقرار)؛ نبودِ آن هرگز خطا نمی‌سازد.
   ═══════════════════════════════════════════════════════════════════════════ */

const META_TTL_STALE = 24 * 3600 * 1000;   /* ردیف‌های یتیم بعد از یک روز پاک می‌شوند */
let META_READY = null;                     /* null = هنوز probe نشده */

/* ── ستون‌های تازه‌ی conn_meta (افزوده‌شده با migration) ──
   up/down   = حجمِ ارسالی/دریافتیِ همین نشست (بایت)
   transport = نوعِ انتقالی که نشست با آن برقرار شده (ws / grpc / …)
   ستون‌ها با ALTER TABLE اضافه می‌شوند تا پایگاه‌داده‌های از پیش مستقرشده
   بدون از دست رفتنِ داده ارتقا یابند. */
const META_COLS = [['up', 'INTEGER'], ['down', 'INTEGER'], ['transport', 'TEXT']];

/** migrationِ خودکار — فقط ستون‌های مفقود را اضافه می‌کند (idempotent) */
async function metaMigrate(env) {
  let have = null;
  try {
    const r = await env.DB.prepare('PRAGMA table_info(conn_meta)').all();
    have = new Set(((r && r.results) || []).map((x) => String(x.name)));
  } catch (e) { have = null; }             /* PRAGMA در دسترس نیست → ALTERِ کور */
  for (const [col, type] of META_COLS) {
    if (have && have.has(col)) continue;
    try { await env.DB.prepare(`ALTER TABLE conn_meta ADD COLUMN "${col}" ${type}`).run(); }
    catch (e) { /* ستون از قبل وجود دارد */ }
  }
}

async function metaEnsure(env) {
  if (META_READY !== null) return META_READY;
  if (!env || !env.DB) { META_READY = false; return false; }
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS conn_meta (
      conn_id TEXT PRIMARY KEY,
      cc TEXT,
      since INTEGER,
      ua TEXT
    )`).run();
    await metaMigrate(env);
    META_READY = true;
  } catch (e) { META_READY = false; }
  return META_READY;
}

/** ثبتِ جزئیات — هرگز نباید مسیرِ اتصال را بشکند */
async function metaPut(env, connId, info) {
  if (!connId) return;
  if (!(await metaEnsure(env))) return;
  const cc = (info && info.cc) ? String(info.cc).toUpperCase().slice(0, 2) : null;
  const ua = (info && info.ua) ? String(info.ua).slice(0, 60) : null;
  const tr = (info && info.transport) ? String(info.transport).slice(0, 16) : null;
  try {
    await env.DB.prepare('INSERT OR REPLACE INTO conn_meta (conn_id, cc, since, ua, transport) VALUES (?, ?, ?, ?, ?)')
      .bind(connId, cc, Date.now(), ua, tr).run();
  } catch (e) { /* نمایش نباید اتصال را ببندد */ }
}

/**
 * جمع‌زدنِ حجمِ نشست — از همان نقاطی صدا زده می‌شود که مصرفِ کاربر در D1 نوشته
 * می‌شود (maybeFlush / finish)؛ پس هیچ تایمر یا ضربانی اضافه نمی‌شود و عددِ
 * نمایش‌داده‌شده با مصرفِ واقعی از یک منبع می‌آید.
 * conn_meta فقط نمایشی است — خطای آن هرگز اتصال را نمی‌بندد.
 */
async function metaBytes(env, connId, dUp, dDown) {
  if (!connId) return;
  const u = Math.max(0, Math.floor(Number(dUp) || 0));
  const d = Math.max(0, Math.floor(Number(dDown) || 0));
  if (!u && !d) return;
  if (!(await metaEnsure(env))) return;
  try {
    await env.DB.prepare(
      `INSERT INTO conn_meta (conn_id, up, down) VALUES (?, ?, ?)
       ON CONFLICT(conn_id) DO UPDATE SET
         up = COALESCE(up, 0) + excluded.up,
         down = COALESCE(down, 0) + excluded.down`
    ).bind(connId, u, d).run();
  } catch (e) { /* همان بالا */ }
}

async function metaDel(env, connId) {
  if (!connId) return;
  if (!(await metaEnsure(env))) return;
  try { await env.DB.prepare('DELETE FROM conn_meta WHERE conn_id = ?').bind(connId).run(); }
  catch (e) { /* همان بالا */ }
}

/** پاک‌سازیِ ردیف‌های یتیم (اتصالی که مدت‌ها پیش بسته شده) */
async function metaSweep(env) {
  if (!(await metaEnsure(env))) return;
  const cut = Date.now() - META_TTL_STALE;
  try {
    await env.DB.prepare('DELETE FROM conn_meta WHERE since IS NULL OR since < ? OR conn_id NOT IN (SELECT conn_id FROM conns)')
      .bind(cut).run();
  } catch (e) { /* اختیاری */ }
}

/** شکلِ یکسانِ ردیفِ زنده — همه‌ی بک‌اندها به این قالب نگاشت می‌شوند */
function liveRow(uuid, ip, connId, last, cc, since, ua, up, down, transport) {
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  return {
    uuid: String(uuid || ''), ip: String(ip || ''), connId: String(connId || ''),
    last: num(last), since: num(since),
    cc: cc ? String(cc).toUpperCase() : '',
    ua: ua ? String(ua) : '',
    up: Math.max(0, Math.floor(num(up) || 0)),
    down: Math.max(0, Math.floor(num(down) || 0)),
    transport: transport ? String(transport) : '',
  };
}

/**
 * تنها منبعِ «چه کسی الآن وصل است» — هم برای نمایش، هم برای تصمیمِ محدودساز.
 *
 * ⚠️ این تابع عمداً تنها نقطه‌ی خواندن است. اگر پنل از یک نگاشتِ جداگانه
 * می‌خواند، گزارش با واقعیت یکی نمی‌شد: محدودساز یک چیز می‌دید و جدولِ نمایش
 * چیزِ دیگر. ترتیبِ انتخابِ مرجع دقیقاً همان ترتیبِ limiterBackend است:
 *   Durable Object → D1 → KV → حافظهٔ همین isolate
 * ستون‌های جزئیات (کشور، زمانِ شروع، حجم، نوعِ انتقال) از conn_meta می‌آیند؛
 * نبودِ آن‌ها فقط یعنی خروجیِ ساده‌تر، هرگز خطا.
 */
async function liveRowsDetailed(env) {
  const now = Date.now();
  const rows = [];
  if (env && env.LIMITER) {
    try {
      const r = await limiterRpc(env, '/dump', { now });
      for (const x of ((r && r.rows) || [])) rows.push(liveRow(x.uuid, x.ip, x.conn_id, x.last_ts));
    } catch (e) { connErr('DO-dump', e); }
  } else if (env && env.DB) {
    try {
      if (!(await liveEnsure(env))) throw new Error('table');
      await liveSweep(env, null);
      let r = null;
      if (await metaEnsure(env)) {
        try {
          r = await env.DB.prepare(`SELECT c.uuid AS uuid, c.ip AS ip, c.conn_id AS conn_id,
            c.last_ts AS last_ts, m.cc AS cc, m.since AS since, m.ua AS ua,
            m.up AS up, m.down AS down, m.transport AS transport
            FROM conns c LEFT JOIN conn_meta m ON m.conn_id = c.conn_id
            ORDER BY c.last_ts ASC LIMIT 500`).all();
        } catch (e) { r = null; }          /* conn_meta ناهمخوان — بدون جزئیات ادامه می‌دهیم */
      }
      if (!r) {
        r = await env.DB.prepare('SELECT uuid, ip, conn_id, last_ts FROM conns ORDER BY last_ts ASC LIMIT 500').all();
      }
      for (const x of ((r && r.results) || [])) {
        rows.push(liveRow(x.uuid, x.ip, x.conn_id, x.last_ts, x.cc, x.since, x.ua, x.up, x.down, x.transport));
      }
    } catch (e) { connErr('D1-live-view', e); }
  } else if (env && env.KV) {
    try {
      const list = await env.KV.list({ prefix: 'c:' });
      for (const k of ((list && list.keys) || [])) {
        const p = String(k.name).split(':');
        if (p.length < 4) continue;
        rows.push(liveRow(p[1], p[2], p[3], now));
      }
    } catch (e) { connErr('KV-live-view', e); }
  } else {
    CONNS.forEach((um, uuid) => {
      if (!um) return;
      um.forEach((m, ip) => {
        if (!m) return;
        m.forEach((ts, id) => rows.push(liveRow(uuid, ip, id, ts)));
      });
    });
  }
  return rows;
}

/**
 * نمای سراسریِ «چه کسی هم‌اکنون وصل است» — برای بخش اتصال‌های پنل.
 * خروجی هم کاربر را دارد (نام، سقف، چند آی‌پی) و هم جزئیاتِ هر آی‌پی
 * (تعداد اتصال، آخرین فعالیت، مدت اتصال، کشور، کلاینت).
 */
async function liveView(env, st) {
  const now = Date.now();
  const lim = limiterBackend(env);
  const globalLimit = Number((st.settings.sec && st.settings.sec.ipConnLimit) || 0);

  /* ۱) گردآوریِ ردیف‌ها — از همان مرجعی که محدودساز تصمیم می‌گیرد */
  const rows = await liveRowsDetailed(env);

  /* ۲) گروه‌بندی: کاربر → آی‌پی → اتصال‌ها */
  const perUser = new Map();
  for (const r of rows) {
    if (!r.uuid) continue;
    let u = perUser.get(r.uuid);
    if (!u) { u = { uuid: r.uuid, ips: new Map(), conns: 0 }; perUser.set(r.uuid, u); }
    u.conns++;
    let e = u.ips.get(r.ip);
    if (!e) {
      e = { ip: r.ip, conns: 0, last: null, since: null, cc: r.cc || '', uas: new Set(), up: 0, down: 0, transports: new Set() };
      u.ips.set(r.ip, e);
    }
    e.conns++;
    e.up += r.up; e.down += r.down;
    if (r.last !== null && (e.last === null || r.last > e.last)) e.last = r.last;
    if (r.since !== null && (e.since === null || r.since < e.since)) e.since = r.since;
    if (r.cc && !e.cc) e.cc = r.cc;
    if (r.ua) e.uas.add(r.ua);
    if (r.transport) e.transports.add(r.transport);
  }

  /* ۳) خروجی — کاربرانِ تعریف‌شده اول (حتی اگر الآن آفلاین باشند) */
  const known = new Set();
  const users = [];
  const push = (u, live) => {
    const limit = Number(u.ipLimit) || globalLimit || 0;
    const ips = [...live.ips.values()].map((e) => ({
      ip: e.ip,
      conns: e.conns,
      lastSec: e.last === null ? null : Math.max(0, Math.round((now - e.last) / 1000)),
      sinceSec: e.since === null ? null : Math.max(0, Math.round((now - e.since) / 1000)),
      cc: e.cc || '',
      ua: [...e.uas][0] || '',
      up: e.up, down: e.down,
      transport: [...e.transports][0] || '',
      idle: e.last === null || (now - e.last) > CONN_TTL,
    })).sort((a, b) => (b.conns - a.conns) || String(a.ip).localeCompare(String(b.ip)));
    users.push({
      id: u.id || '', name: u.name || '', uuid: String(u.uuid || ''),
      enabled: u.enabled !== false,
      note: u.note || '',
      limit,
      ipCount: ips.length,
      connCount: ips.reduce((a, x) => a + x.conns, 0),
      over: limit > 0 && ips.length > limit,
      lastSeen: u.lastSeen || null,
      ips,
    });
    known.add(String(u.uuid));
  };

  for (const u of (st.users || [])) {
    const live = perUser.get(String(u.uuid));
    push(u, live || { ips: new Map(), conns: 0 });
  }
  /* کاربری که در لیست نیست (حذف شده ولی ردیف مانده) — برای پاک‌سازی نمایش داده می‌شود */
  perUser.forEach((live, uuid) => {
    if (known.has(uuid)) return;
    push({ uuid, name: 'ناشناس (' + uuid.slice(0, 8) + ')', enabled: false }, live);
  });

  const online = users.filter((u) => u.ipCount > 0);
  return {
    ok: true,
    ts: now,
    storage: backendOf(env),
    limiter: lim,
    limiterLabel: LIM_LABEL[lim] || lim,
    ttlMs: CONN_TTL,
    meta: !!META_READY,
    globalLimit,
    summary: {
      users: users.length,
      onlineUsers: online.length,
      distinctIps: online.reduce((a, u) => a + u.ipCount, 0),
      activeConns: online.reduce((a, u) => a + u.connCount, 0),
      overLimit: online.filter((u) => u.over).length,
    },
    users: users.sort((a, b) => (b.ipCount - a.ipCount) || (b.connCount - a.connCount)),
  };
}

/** نامِ مرجعِ فعال با همان واژگانی که پنل نشان می‌دهد */
const SOURCE_NAME = { do: 'durable-object', d1: 'd1', kv: 'kv', mem: 'memory' };
const sourceName = (env) => SOURCE_NAME[limiterBackend(env)] || 'memory';

/**
 * فهرستِ تختِ نشست‌های زنده با جزئیاتِ کامل — قراردادِ GET /api/connections.
 *
 * هر ردیف از همان مرجعی می‌آید که محدودساز روی آن تصمیم می‌گیرد
 * (liveRowsDetailed)، پس عددِ این فهرست با عددی که باعثِ رد شدنِ اتصال
 * می‌شود یکی است. «مدت اتصال» از زمانِ ثبتِ نشست (since) تا همین لحظه است و
 * «آخرین فعالیت» همان last_ts است که بر اساسِ فعالیت تمدید می‌شود — نه ضربان.
 */
async function liveSessions(env, st) {
  const now = Date.now();
  const rows = await liveRowsDetailed(env);
  const byUuid = new Map();
  for (const u of (st.users || [])) byUuid.set(String(u.uuid), u);

  const sessions = rows.map((r) => {
    const u = byUuid.get(r.uuid);
    return {
      connId: r.connId,
      uuid: r.uuid,
      /* شناسه/نام کانفیگ (یوزر) — اگر کاربر حذف شده باشد نام خالی می‌ماند */
      user: u ? (u.name || '') : '',
      userId: u ? (u.id || '') : '',
      known: !!u,
      ip: r.ip,
      cc: r.cc,
      /* زمانِ شروعِ اتصال — اگر conn_meta در دسترس نباشد null است */
      startedAt: r.since,
      durationSec: r.since === null ? null : Math.max(0, Math.round((now - r.since) / 1000)),
      /* حجمِ ارسالی/دریافتیِ همین نشست (بایت) */
      up: r.up,
      down: r.down,
      /* نوعِ انتقال — در صورت نبود، از تنظیماتِ فعلی پنل خوانده می‌شود */
      transport: r.transport || ((st.settings && st.settings.transport) || ''),
      lastActivityAt: r.last,
      idleSec: r.last === null ? null : Math.max(0, Math.round((now - r.last) / 1000)),
      idle: r.last === null || (now - r.last) > CONN_TTL,
      ua: r.ua,
    };
  }).sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

  const users = new Set(), ips = new Set();
  for (const s of sessions) { if (s.uuid) users.add(s.uuid); if (s.ip) ips.add(s.ip); }

  return {
    ok: true,
    ts: now,
    /* مرجعِ فعلی — همان جایی که سقفِ آی‌پی روی آن حساب می‌شود */
    source: sourceName(env),
    sourceLabel: LIM_LABEL[limiterBackend(env)] || sourceName(env),
    storage: backendOf(env),
    ttlMs: CONN_TTL,
    meta: !!META_READY,
    summary: {
      users: users.size,          /* کاربرانِ متمایزِ متصل */
      ips: ips.size,              /* آی‌پی‌های متمایز */
      connections: sessions.length, /* مجموعِ اتصال‌ها */
    },
    sessions,
  };
}

/**
 * ثبت یک اتصال برای (کاربر، IP) و اعمالِ سقفِ همزمانی.
 * برمی‌گرداند: { ok, ips, conns, limit, enforced, reason, storage }
 *   ips   = تعداد IPهای همزمانِ این کاربر
 *   conns = تعداد اتصال‌های همین IP
 *
 * ⚠️ این تابع حتی وقتی limit صفر است (نامحدود) هم ردیف را ثبت می‌کند: ثبت و
 * اعمال دو تصمیمِ جدا هستند. limit>0 فقط «رد کردن» را فعال می‌کند؛ نبودِ آن
 * نباید یعنی هیچ‌کس دیده نشود — بخشِ «اتصال‌ها»ی پنل دقیقاً به همین ردیف‌ها
 * نگاه می‌کند.
 * info (اختیاری) = { cc, ua } — جزئیاتی که فقط برای نمایش ذخیره می‌شوند.
 */
async function connAcquire(env, uuid, ip, limit, connId, info) {
  const r = await connAcquireInner(env, uuid, ip, limit, connId);
  /* جزئیاتِ نمایش — فقط وقتی اتصال پذیرفته شده؛ شکستِ آن هرگز تصمیم را عوض نمی‌کند */
  if (r && r.ok && info) {
    try { await metaPut(env, r.id || connId, info); } catch (e) { /* نمایش نباید اتصال را ببندد */ }
  }
  return r;
}

async function connAcquireInner(env, uuid, ip, limit, connId) {
  limit = Number(limit) || 0;
  if (!uuid || !ip) return { ok: true, ips: 0, conns: 0, limit, enforced: false, reason: 'missing-identity' };
  const id = connId || randTok(10);
  const now = Date.now();
  CONN_ACQUIRES++;
  const backend = limiterBackend(env);

  /* ── ۰) فهرستِ سیاه — قبل از هر تصمیمِ دیگری ──
     آی‌پیِ مسدودشده نه سهمیه می‌گیرد و نه به لایه‌ی بعد می‌رسد؛ این بررسی
     جلوی همه‌ی بک‌اندها است تا «مسدود شد» در هر استقراری یک معنا بدهد. */
  try {
    const ban = await banCheck(env, ip, uuid);
    if (ban) {
      CONN_DENIES++;
      return { ok: false, ips: 0, conns: 0, limit, enforced: true, banned: true, ban, reason: 'ip-banned', storage: backendOf(env) };
    }
  } catch (e) { connErr('ban', e); }   /* خطای فهرستِ سیاه هرگز پذیرش را باز نمی‌کند */

  /* ── ۰.۵) نشستِ قطع‌شده — اجرای «قطع اتصال» از پنل ──
     همان connIdِ نشستِ قطع‌شده در بازه‌ی ممنوعیت دوباره پذیرفته نمی‌شود؛
     اتصالِ دوباره‌ی کاربر با connIdِ تازه آزاد است (بن، کار را مسدود می‌کند). */
  try {
    if (await kickCheck(env, uuid, ip, id)) {
      CONN_DENIES++;
      return { ok: false, ips: 0, conns: 0, limit, enforced: true, reason: 'kicked', storage: backendOf(env) };
    }
  } catch (e) { connErr('kick-check', e); }

  /* ── ۱) Durable Object — مرجعِ جهانی؛ تصمیم را همین‌جا می‌گیریم ── */
  if (backend === 'do') {
    try {
      const r = await limiterRpc(env, '/acquire', { uuid, ip, connId: id, limit, now });
      mirrorSet(uuid, ip, id, now, !!(r && r.ok));
      if (r && !r.ok) CONN_DENIES++;
      return Object.assign({}, r, { storage: 'do' });
    } catch (e) {
      /* خطای DO هرگز محدودیت را خاموش نمی‌کند — گزارش می‌شود و با حافظه ادامه می‌یابد */
      connErr('DO', e);
    }
  }

  /* ── ۲) D1 — مرجعِ مشترک در استقرارهایی که فقط پایگاه‌داده دارند ── */
  if (backend === 'd1' && env && env.DB) {
    try {
      const r = await d1Acquire(env, uuid, ip, limit, id, now);
      if (r) {
        if (r.ok) mirrorAdd(uuid, ip, id, now); else { CONN_DENIES++; mirrorSet(uuid, ip, id, now, false); }
        return r;
      }
      connErr('D1', 'جدول conns در دسترس نیست');
    } catch (e) {
      /* خطای D1 هرگز محدودیت را خاموش نمی‌کند — گزارش می‌شود و با حافظه ادامه می‌یابد */
      connErr('D1', e);
    }
  }

  /* ── ۳) حافظه: سریع، بدون نیاز به بایندینگ (فقط همین isolate) ── */
  const um = userMapOf(uuid, true);
  const ipsMem = pruneUser(um, now);
  const dec = admitDecision(ipsMem, ip, limit);
  if (!dec.ok) {
    CONN_DENIES++;
    return { ok: false, ips: ipsMem.size, conns: ipsMem.get(ip) || 0, limit, enforced: true, storage: backendOf(env), reason: dec.reason };
  }
  let im = um.get(ip);
  if (!im) { im = new Map(); um.set(ip, im); }
  im.set(id, now);
  let ips = um.size;

  /* ── ۴) KV (اختیاری): شمارشِ مشترک بین isolateها ── */
  if (backend === 'kv' && env && env.KV) {
    try {
      const list = await env.KV.list({ prefix: 'c:' + uuid + ':' });
      const kvIps = new Map();                       /* ip -> تعداد اتصال */
      for (const k of ((list && list.keys) || [])) {
        const p = String(k.name).split(':');         /* c : uuid : ip : connId */
        if (p.length < 4) continue;
        kvIps.set(p[2], (kvIps.get(p[2]) || 0) + 1); /* منقضی‌شده‌ها در فهرست نیستند */
      }
      const dec2 = admitDecision(kvIps, ip, limit);
      if (!dec2.ok) {
        const m2 = um.get(ip);                       /* افزایشِ رد شده برگردد */
        if (m2) { m2.delete(id); if (!m2.size) um.delete(ip); }
        if (!um.size) CONNS.delete(uuid);
        CONN_DENIES++;
        return { ok: false, ips: Math.max(ipsMem.size, kvIps.size), conns: kvIps.get(ip) || 0, limit, enforced: true, storage: 'kv', reason: dec2.reason };
      }
      await env.KV.put(KV_C(uuid, ip, id), String(now), { expirationTtl: Math.ceil(CONN_TTL / 1000) });
      ips = Math.max(ips, kvIps.size + (kvIps.has(ip) ? 0 : 1));
    } catch (e) {
      /* خطای KV هرگز باعث نمی‌شود محدودیت خاموش شود — فقط گزارش می‌شود */
      connErr('KV', e);
    }
  }
  const cur = um.get(ip);
  return { ok: true, ips, conns: cur ? cur.size : 0, limit, enforced: limit > 0, id, reason: dec.reason, storage: backend };
}

/** کاهش شمارنده — فقط همین connId؛ اگر IP بی‌اتصال شد، آزاد می‌شود */
async function connRelease(env, uuid, ip, connId) {
  /* ⚠️ حذفِ ردیفِ پایگاه‌داده نباید به داشتنِ uuid/ip وابسته باشد:
     شناسه‌ی اتصال (conn_id) کلیدِ اصلی است و برای پاک کردن کافی است. قبلاً
     اگر user یا ip لحظه‌ای در دسترس نبود، ردیف برای همیشه در جدول می‌ماند. */
  if (env && env.DB && connId) {
    try { await d1Release(env, connId); } catch (e) { connErr('D1', e); }
    /* جزئیاتِ نمایش هم با همان کلید پاک می‌شود */
    try { await metaDel(env, connId); } catch (e) { /* همان بالا */ }
  }
  /* ⚠️ آزادسازی در بقیهٔ بک‌اندها هم نباید به داشتنِ uuid/ip وابسته باشد:
     شناسه‌ی اتصال برای حذف کافی است. قبلاً اگر user یا ip لحظه‌ای در دسترس
     نبود، ردیفِ شیءِ ماندگار و کلیدِ KV برای همیشه می‌ماند. */
  if (env && env.LIMITER) {
    try { await limiterRpc(env, '/release', { uuid: uuid || '', ip: ip || '', connId }); }
    catch (e) { connErr('DO', e); }
  }
  if (env && env.KV && connId) {
    try { await env.KV.delete(KV_C(uuid || '', ip || '', connId)); }
    catch (e) { connErr('KV', e); }
  }
  if (!uuid || !ip) return 0;
  /* حافظهٔ همین isolate — فقط آینه است و مرجعِ تصمیم نیست */
  const um = CONNS.get(uuid);
  let left = 0;
  if (um) {
    const m = um.get(ip);
    if (m) {
      if (connId) m.delete(connId);
      else { const f = m.keys().next(); if (!f.done) m.delete(f.value); }
      left = m.size;
      if (!left) um.delete(ip);
    }
    if (!um.size) CONNS.delete(uuid);
  }
  return left;
}

/* ═══════════════════════════════════════════════════════════════════════════
   رجیستریِ «قطع‌شده‌ها» — اجرای واقعیِ دکمه‌ی قطع اتصال
   ───────────────────────────────────────────────────────────────────────────
   باگِ قبلی: connKick فقط سهمیه را آزاد می‌کرد. اتصالِ زنده‌ی کلاینت به
   کار خودش ادامه می‌داد (connRefresh آن را دوباره پذیرفتنی می‌کرد) و در
   نتیجه ردیفِ قطع‌شده بلافاصله در جدول ظاهر می‌شد — انگار هیچ‌کدام از
   عملیات‌ها کار نمی‌کنند.
   راه‌حل: هر نشستِ قطع‌شده تا KICK_TTL در فهرستِ ممنوع می‌ماند؛
   connRefresh نشستِ زنده را می‌بندد و connAcquire همان connId را در
   بازه‌ی ممنوعیت نمی‌پذیرد. اتصالِ دوباره با connIdِ تازه آزاد است —
   «قطع» یعنی نشستِ فعلی می‌میرد، نه مسدودسازیِ کاربر (برای آن بن هست).
   لایه‌ها: حافظه (فوری) → DO (/kick، سراسری) → D1 (جدول kicks) → KV
   ═══════════════════════════════════════════════════════════════════════════ */
const KICK_TTL = 90000;                  /* ۹۰ ثانیه پنجره‌ی ممنوعیتِ نشستِ قطع‌شده */
const KICK_POLL_MS = 8000;               /* فاصله‌ی نظرسنجیِ سبکِ قطع برای نشست‌های باز */
const KICKS = new Map();                 /* کلید -> until (حافظه‌ی همین isolate) */
const KICK_CACHE_MS = 3000;
let KICK_CACHE = { at: 0, list: [] };
let KICK_READY = null;
const kickKey = (uuid, ip, connId) => [String(uuid || ''), String(ip || ''), String(connId || '')].join('|');
const KV_KICK = (k) => 'kk:' + k;

async function kickEnsure(env) {
  if (KICK_READY !== null) return KICK_READY;
  if (!env || !env.DB) { KICK_READY = false; return false; }
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS kicks (
      k TEXT PRIMARY KEY,
      until INTEGER
    )`).run();
    KICK_READY = true;
  } catch (e) { KICK_READY = false; }
  return KICK_READY;
}

/** ثبتِ یک قطع — روی همه‌ی لایه‌ها */
async function kickAdd(env, uuid, ip, connId) {
  const k = kickKey(uuid, ip, connId);
  const until = Date.now() + KICK_TTL;
  KICKS.set(k, until);
  if (env && env.DB) {
    try {
      if (await kickEnsure(env)) {
        await env.DB.prepare('INSERT INTO kicks (k, until) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET until = excluded.until')
          .bind(k, until).run();
      }
    } catch (e) { connErr('D1-kick-add', e); }
  }
  if (env && env.KV) {
    try { await env.KV.put(KV_KICK(k), String(until), { expirationTtl: Math.ceil(KICK_TTL / 1000) }); }
    catch (e) { connErr('KV-kick-add', e); }
  }
  if (env && env.LIMITER) {
    try { await limiterRpc(env, '/kick', { uuid: uuid || '', ip: ip || '', connId: connId || '', until }); }
    catch (e) { connErr('DO-kick', e); }
  }
}

/** آیا این نشست (uuid/ip/connId — هر مؤلفه ممکن است wildcard باشد) قطع شده؟ */
async function kickCheck(env, uuid, ip, connId) {
  const now = Date.now();
  const hit = (list) => {
    for (const x of list) {
      if (x.until && x.until <= now) continue;
      if (x.uuid && x.uuid !== String(uuid || '')) continue;
      if (x.ip && x.ip !== String(ip || '')) continue;
      if (x.connId && x.connId !== String(connId || '')) continue;
      return true;
    }
    return false;
  };
  const mem = [];
  KICKS.forEach((until, k) => {
    const p = k.split('|');
    mem.push({ uuid: p[0], ip: p[1], connId: p[2], until });
    if (until <= now) KICKS.delete(k);
  });
  if (hit(mem)) return true;
  if (!env || (!env.DB && !env.KV)) return false;
  if (!KICK_CACHE.at || now - KICK_CACHE.at > KICK_CACHE_MS) {
    const list = [];
    if (env.DB) {
      try {
        if (await kickEnsure(env)) {
          await env.DB.prepare('DELETE FROM kicks WHERE until <= ?').bind(now).run();
          const r = await env.DB.prepare('SELECT k, until FROM kicks LIMIT 500').all();
          for (const x of ((r && r.results) || [])) {
            const p = String(x.k).split('|');
            list.push({ uuid: p[0], ip: p[1], connId: p[2], until: Number(x.until) || 0 });
          }
        }
      } catch (e) { connErr('D1-kick-read', e); }
    }
    if (env.KV) {
      try {
        const l = await env.KV.list({ prefix: 'kk:' });
        for (const kk of ((l && l.keys) || [])) {
          const p = String(kk.name).slice(3).split('|');
          list.push({ uuid: p[0], ip: p[1], connId: p[2], until: Number(await env.KV.get(kk.name)) || 0 });
        }
      } catch (e) { connErr('KV-kick-read', e); }
    }
    KICK_CACHE = { at: now, list };
  }
  return hit(KICK_CACHE.list);
}

/** قطعِ دستی از پنل — یک اتصالِ مشخص یا همه‌ی اتصال‌های یک آی‌پی/کاربر.
    علاوه بر آزادسازیِ سهمیه، نشست در رجیستریِ قطع‌شده‌ها ثبت می‌شود تا
    refresh اتصالِ زنده را واقعاً ببندد و acquire دوباره نپذیرد. */
async function connKick(env, uuid, ip, connId) {
  const u = uuid ? String(uuid) : '';
  const i = ip ? String(ip) : '';
  /* نشست‌ها از همان نمایِ زنده خوانده می‌شوند و uuid/ip واقعیِ هر ردیف
     استفاده می‌شود — قبلاً با uuid/ip خالی فراخوانی می‌شد و ردیفِ
     Durable Object آزاد نمی‌شد و در جدول باقی می‌ماند. */
  const targets = [];
  for (const r of (await liveRowsOf(env))) {
    if (u && r.uuid !== u) continue;
    if (i && r.ip !== i) continue;
    if (connId && r.connId !== String(connId)) continue;
    if (!r.connId) continue;
    targets.push({ uuid: r.uuid, ip: r.ip, connId: r.connId });
  }
  if (connId && !targets.length) targets.push({ uuid: u, ip: i, connId: String(connId) });
  let n = 0;
  for (const t of targets) {
    try {
      await connRelease(env, t.uuid, t.ip, t.connId);
      await kickAdd(env, t.uuid, t.ip, t.connId);
      n++;
    } catch (e) { connErr('kick', e); }
  }
  if (env && env.DB) { try { await metaSweep(env); } catch (e) {} }
  return { ok: true, kicked: n, ids: targets.map((t) => t.connId) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   فهرستِ سیاهِ آی‌پی (مسدودسازیِ دائم و زمان‌دار)
   ───────────────────────────────────────────────────────────────────────────
   همان زنجیره‌ی ذخیره‌سازیِ بقیه‌ی پروژه (D1 → KV → حافظه) و نه یک نگاشتِ
   جداگانه، وگرنه «مسدود شده» در یک لایه بود و «رد شد» در لایه‌ای دیگر.
     • D1   : جدولِ ip_bans — ماندگار و سراسری (استقرارِ واقعی)
     • KV   : کلیدِ b:<ip> با expirationTtl — ماندگار، تقریبی
     • حافظه: فقط همین isolate — بدون تضمین، اما همیشه در دسترس
   منقضی‌شده‌ها هنگامِ خواندن نادیده گرفته می‌شوند و بعداً پاک می‌شوند؛
   هیچ تایمر یا ضربانی برای این کار راه نمی‌افتد.
   ═══════════════════════════════════════════════════════════════════════════ */

const KV_BAN = (ip) => 'b:' + ip;
const BANS = new Map();                  /* آی‌پی -> { until, reason, uuid, createdAt } (حافظه) */
const BAN_CACHE_MS = 3000;               /* تازه‌ترین فهرست — فقط برای مسیرِ داغِ پذیرش */
let BAN_CACHE = { at: 0, list: [] };
let BAN_READY = null;

async function banEnsure(env) {
  if (BAN_READY !== null) return BAN_READY;
  if (!env || !env.DB) { BAN_READY = false; return false; }
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ip_bans (
      ip TEXT PRIMARY KEY,
      uuid TEXT,
      until INTEGER,
      reason TEXT,
      created_at INTEGER,
      created_by TEXT
    )`).run();
    BAN_READY = true;
  } catch (e) { BAN_READY = false; }
  return BAN_READY;
}

/** خواندنِ تازه — فهرستِ سیاهِ نمایش‌داده‌شده همیشه همین است (بدون کش) */
async function banList(env) {
  const now = Date.now();
  const out = [];
  const push = (ip, uuid, until, reason, createdAt, createdBy) => {
    out.push({
      ip: String(ip), uuid: uuid ? String(uuid) : '',
      until: until ? Number(until) : 0,
      permanent: !until,
      /* منقضی‌شده هنوز در فهرست دیده می‌شود تا کاربر بفهمد چرا آزاد شده */
      expired: !!until && Number(until) <= now,
      remainingSec: until ? Math.max(0, Math.round((Number(until) - now) / 1000)) : null,
      reason: reason ? String(reason) : '',
      createdAt: createdAt ? Number(createdAt) : null,
      createdBy: createdBy ? String(createdBy) : '',
    });
  };
  if (env && env.DB) {
    try {
      if (await banEnsure(env)) {
        const r = await env.DB.prepare('SELECT ip, uuid, until, reason, created_at, created_by FROM ip_bans ORDER BY created_at DESC LIMIT 500').all();
        for (const x of ((r && r.results) || [])) push(x.ip, x.uuid, x.until, x.reason, x.created_at, x.created_by);
      }
    } catch (e) { connErr('D1-ban-list', e); }
  }
  if (env && env.KV) {
    try {
      const list = await env.KV.list({ prefix: 'b:' });
      for (const k of ((list && list.keys) || [])) {
        const ip = String(k.name).slice(2);
        if (out.some((x) => x.ip === ip)) continue;
        const v = await kvGetJson(env, k.name);
        if (!v) continue;
        push(ip, v.uuid, v.until, v.reason, v.createdAt, v.createdBy);
      }
    } catch (e) { connErr('KV-ban-list', e); }
  }
  BANS.forEach((v, ip) => {
    if (out.some((x) => x.ip === ip)) return;
    push(ip, v.uuid, v.until, v.reason, v.createdAt, v.createdBy);
  });
  return { ok: true, ts: now, source: banSource(env), bans: out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) };
}

/** کدام لایه فهرستِ سیاه را نگه می‌دارد */
function banSource(env) {
  if (env && env.DB) return 'd1';
  if (env && env.KV) return 'kv';
  return 'memory';
}

/**
 * افزودن/به‌روزرسانیِ یک مسدودی.
 * hours: عددِ ساعت (مثل ۱ یا ۲۴) یا ۰/خالی برای مسدودیِ دائم.
 */
async function banAdd(env, ip, opt) {
  const o = opt || {};
  const clean = String(ip || '').trim();
  if (!clean) return { ok: false, error: 'آی‌پی مشخص نشده است' };
  const hours = Number(o.hours) || 0;
  const until = hours > 0 ? Date.now() + Math.round(hours * 3600 * 1000) : 0;
  const rec = {
    until,
    uuid: o.uuid ? String(o.uuid).trim() : '',
    reason: o.reason ? String(o.reason).slice(0, 200) : '',
    createdAt: Date.now(),
    createdBy: o.createdBy ? String(o.createdBy).slice(0, 64) : '',
  };
  const wrote = [];

  if (env && env.DB) {
    try {
      if (await banEnsure(env)) {
        await env.DB.prepare(
          `INSERT INTO ip_bans (ip, uuid, until, reason, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(ip) DO UPDATE SET
             uuid = excluded.uuid, until = excluded.until, reason = excluded.reason,
             created_at = excluded.created_at, created_by = excluded.created_by`
        ).bind(clean, rec.uuid || null, until || null, rec.reason || null, rec.createdAt, rec.createdBy || null).run();
        wrote.push('d1');
      }
    } catch (e) { connErr('D1-ban-add', e); }
  }
  if (env && env.KV) {
    try {
      const ttl = until ? Math.max(60, Math.ceil((until - Date.now()) / 1000)) : undefined;
      const val = JSON.stringify(rec);
      if (ttl) await env.KV.put(KV_BAN(clean), val, { expirationTtl: ttl });
      else await env.KV.put(KV_BAN(clean), val);
      wrote.push('kv');
    } catch (e) { connErr('KV-ban-add', e); }
  }
  BANS.set(clean, rec);                   /* حافظه — همیشه، تا همین isolate هم رد کند */
  BAN_CACHE.at = 0;                       /* بی‌اعتبار کردنِ کشِ مسیرِ پذیرش */
  return {
    ok: true, ip: clean, until, permanent: !until, hours,
    expiresAt: until || null, wrote, source: banSource(env),
  };
}

/** رفعِ مسدودی — روی همه‌ی لایه‌ها (ماندن در یکی یعنی هنوز رد می‌شود) */
async function banRemove(env, ip) {
  const clean = String(ip || '').trim();
  if (!clean) return { ok: false, error: 'آی‌پی مشخص نشده است' };
  let removed = false;
  if (env && env.DB) {
    try {
      if (await banEnsure(env)) {
        const r = await env.DB.prepare('DELETE FROM ip_bans WHERE ip = ?').bind(clean).run();
        if (r && r.meta && Number(r.meta.changes) > 0) removed = true;
      }
    } catch (e) { connErr('D1-ban-del', e); }
  }
  if (env && env.KV) {
    try { await env.KV.delete(KV_BAN(clean)); removed = true; } catch (e) { connErr('KV-ban-del', e); }
  }
  if (BANS.delete(clean)) removed = true;
  BAN_CACHE.at = 0;
  return { ok: true, ip: clean, removed, source: banSource(env) };
}

/**
 * آیا این آی‌پی مسدود است؟ — مسیرِ داغ (هر پذیرش و هر تمدید)
 * برای اینکه هر تمدیدِ مبتنی بر فعالیت یک کوئری اضافه به D1 نزند، فهرست حداکثر
 * BAN_CACHE_MS ثانیه کش می‌شود؛ افزودن/برداشتنِ مسدودی کش را باطل می‌کند.
 * کش فقط «مسدود نیست» را تا ۳ ثانیه دیر می‌بیند و هرگز یک آی‌پیِ مسدود را آزاد
 * نمی‌گذارد ماندن بیش از حد مجاز — و تازه‌ترین فهرست برای نمایش همیشه تازه است.
 */
async function banCheck(env, ip, uuid) {
  const clean = String(ip || '').trim();
  if (!clean) return null;
  const now = Date.now();
  if (!BAN_CACHE.at || now - BAN_CACHE.at > BAN_CACHE_MS) {
    let list = [];
    if (env && env.DB) {
      try {
        if (await banEnsure(env)) {
          const r = await env.DB.prepare('SELECT ip, uuid, until, reason FROM ip_bans').all();
          list = (r && r.results) || [];
        }
      } catch (e) { connErr('D1-ban-read', e); }
    } else if (env && env.KV) {
      try {
        const l = await env.KV.list({ prefix: 'b:' });
        for (const k of ((l && l.keys) || [])) {
          const v = await kvGetJson(env, k.name);
          if (v) list.push({ ip: String(k.name).slice(2), uuid: v.uuid, until: v.until, reason: v.reason });
        }
      } catch (e) { connErr('KV-ban-read', e); }
    }
    BANS.forEach((v, k) => { if (!list.some((x) => String(x.ip) === k)) list.push({ ip: k, uuid: v.uuid, until: v.until, reason: v.reason }); });
    BAN_CACHE = { at: now, list };
  }
  for (const b of BAN_CACHE.list) {
    if (String(b.ip) !== clean) continue;
    if (b.until && Number(b.until) <= now) continue;          /* منقضی شده */
    if (b.uuid && uuid && String(b.uuid) !== String(uuid)) continue;  /* مربوط به کاربرِ دیگری است */
    return { banned: true, reason: b.reason || '', until: Number(b.until) || 0, permanent: !b.until };
  }
  return null;
}

/** پاک‌سازیِ مسدودی‌های منقضی‌شده — هنگامِ نمایش صدا زده می‌شود، بدون تایمر */
async function banSweep(env) {
  const now = Date.now();
  if (env && env.DB) {
    try { if (await banEnsure(env)) await env.DB.prepare('DELETE FROM ip_bans WHERE until IS NOT NULL AND until <= ?').bind(now).run(); }
    catch (e) { /* اختیاری */ }
  }
  BANS.forEach((v, ip) => { if (v && v.until && v.until <= now) BANS.delete(ip); });
}

/** پاک‌سازیِ کاملِ «اتصال‌های زنده» — روی هر سه بک‌اند.
    ⚠️ قبلاً فقط جدولِ D1 خالی می‌شد؛ در استقرارِ با wrangler مرجعِ تصمیم شیءِ
    ماندگار (LIMITER) است و در استقرارِ بدونِ پایگاه‌داده کلیدهای KV. دکمهٔ
    «آزادسازی اتصال‌ها» در آن استقرارها هیچ کاری نمی‌کرد و تنها راهِ خروج
    دستکاریِ دستیِ پایگاه‌داده بود. */
async function connReset(env, uuid) {
  const removed = { d1: 0, do: 0, kv: 0, mem: 0 };
  const u = uuid ? String(uuid) : '';
  /* ۱) D1 — مرجعِ بیشتر استقرارها (فقط D1 بایند است) */
  if (env && env.DB) {
    try {
      await liveEnsure(env);
      const cnt = u
        ? await env.DB.prepare('SELECT COUNT(*) AS n FROM conns WHERE uuid = ?').bind(u).all()
        : await env.DB.prepare('SELECT COUNT(*) AS n FROM conns').all();
      removed.d1 = Number((cnt && cnt.results && cnt.results[0] && cnt.results[0].n) || 0);
      if (u) await env.DB.prepare('DELETE FROM conns WHERE uuid = ?').bind(u).run();
      else await env.DB.prepare('DELETE FROM conns').run();
    } catch (e) { connErr('D1-reset', e); }
  }
  /* ۲) شیءِ ماندگار — مرجعِ استقرارهای wrangler */
  if (env && env.LIMITER) {
    try {
      const r = await limiterRpc(env, '/reset', { uuid: u });
      removed.do = Number((r && r.removed) || 0);
    } catch (e) { connErr('DO-reset', e); }
  }
  /* ۳) KV — مرجعِ استقرارهای بدونِ پایگاه‌داده */
  if (env && env.KV) {
    try {
      let cursor = undefined, guard = 0;
      const prefix = u ? 'c:' + u + ':' : 'c:';
      do {
        const list = await env.KV.list(cursor ? { prefix, cursor } : { prefix });
        for (const k of ((list && list.keys) || [])) {
          await env.KV.delete(k.name);
          removed.kv++;
        }
        cursor = list && !list.list_complete ? list.cursor : undefined;
      } while (cursor && ++guard < 50);      /* جلوگیری از حلقهٔ بی‌انتها */
    } catch (e) { connErr('KV-reset', e); }
  }
  /* ۴) آینهٔ حافظهٔ همین isolate */
  try {
    if (u) { const um = CONNS.get(u); if (um) { um.forEach((m) => { removed.mem += m.size; }); CONNS.delete(u); } }
    else { CONNS.forEach((um) => um.forEach((m) => { removed.mem += m.size; })); CONNS.clear(); }
  } catch (e) {}
  /* ۵) جزئیاتِ نمایش — ردیف‌های بی‌صاحب پاک می‌شوند (یتیم‌ها هرگز نمایش داده نمی‌شدند) */
  try { await metaSweep(env); } catch (e) {}
  removed.total = removed.d1 + removed.do + removed.kv + removed.mem;
  return removed;
}

/** ردیف‌های زنده با سن‌شان — از مرجعِ تصمیم خوانده می‌شود تا کارتِ سلامت
    دروغ نگوید (اگر شیءِ ماندگار بایند باشد، جدولِ D1 خالی است). */
async function liveRowsOf(env) {
  const nowMs = Date.now();
  const idleCut = CONN_TTL;             /* کهنه‌تر از این = آماده‌ی بیرون‌راندن */
  const asRow = (uuid, ip, connId, ts) => ({
    uuid: String(uuid || ''), ip: String(ip || ''), connId: String(connId || ''),
    ageSec: (typeof ts === 'number' && isFinite(ts)) ? Math.max(0, Math.floor((nowMs - ts) / 1000)) : null,
    stale: !(typeof ts === 'number' && isFinite(ts)),
    idle: (typeof ts === 'number' && isFinite(ts)) ? (nowMs - ts) > idleCut : true,
  });
  const out = [];
  if (env && env.LIMITER) {
    try {
      const r = await limiterRpc(env, '/dump', { now: nowMs });
      for (const x of ((r && r.rows) || [])) out.push(asRow(x.uuid, x.ip, x.conn_id, x.last_ts));
    } catch (e) { connErr('DO-dump', e); }
    return out;
  }
  if (env && env.DB) {
    try {
      await liveEnsure(env);
      await liveSweep(env, null);
      const r = await env.DB.prepare('SELECT uuid, ip, conn_id, last_ts FROM conns ORDER BY last_ts ASC LIMIT 200').all();
      for (const x of ((r && r.results) || [])) out.push(asRow(x.uuid, x.ip, x.conn_id, x.last_ts));
    } catch (e) { connErr('D1-live-rows', e); }
    return out;
  }
  if (env && env.KV) {
    try {
      let cursor = undefined, guard = 0;
      do {
        const list = await env.KV.list(cursor ? { prefix: 'c:', cursor } : { prefix: 'c:' });
        for (const k of ((list && list.keys) || [])) {
          const p = String(k.name).split(':');            /* c : uuid : ip : connId */
          if (p.length < 4) continue;
          out.push(asRow(p[1], p[2], p[3], nowMs));       /* KV سنِ واقعی را نگه نمی‌دارد */
        }
        cursor = list && !list.list_complete ? list.cursor : undefined;
      } while (cursor && ++guard < 50);
    } catch (e) { connErr('KV-live-rows', e); }
    return out;
  }
  /* حافظهٔ همین isolate — مرجعِ استقرارِ بدونِ هیچ بایندینگی.
     ⚠️ این شاخه قبلاً وجود نداشت: در استقرارِ بدونِ DB/KV/LIMITER خروجی همیشه
     خالی بود، پس «قطعِ موقت» (connKick) هیچ اتصالی پیدا نمی‌کرد در حالی که
     نمای زنده همان اتصال‌ها را نشان می‌داد. */
  CONNS.forEach((um, uuid) => {
    if (!um) return;
    um.forEach((m, ip) => {
      if (!m) return;
      m.forEach((ts, id) => out.push(asRow(uuid, ip, id, ts)));
    });
  });
  return out;
}

/** تمدیدِ ردیفِ موجود — اتصالی که ترافیک دارد توسط پاک‌سازی برداشته نشود */
async function sessionTouch(env, uuid, ip, connId) {
  if (!uuid || !ip || !connId) return null;
  const now = Date.now();
  const um = CONNS.get(uuid);
  if (um) { const m = um.get(ip); if (m && m.has(connId)) m.set(connId, now); }
  if (env && env.LIMITER) {
    try {
      const r = await limiterRpc(env, '/touch', { uuid, ip, connId, now });
      return r || null;                    /* { kicked:true } → connRefresh اتصال را می‌بندد */
    } catch (e) { connErr('DO', e); }
    return null;
  }
  if (env && env.DB) {
    try { await d1Touch(env, uuid, ip, connId); } catch (e) { connErr('D1', e); }
    return;
  }
  if (env && env.KV) {
    try { await env.KV.put(KV_C(uuid, ip, connId), String(now), { expirationTtl: Math.ceil(CONN_TTL / 1000) }); }
    catch (e) { connErr('KV', e); }
  }
}

/**
 * تمدیدِ مبتنی بر فعالیت — جایگزینِ ضربانِ دوره‌ای (heartbeat).
 * چرا؟ ضربانِ دوره‌ای یعنی یک نوشتن در D1 برای هر اتصال در هر بازه؛ با پنجره‌ی
 * ۳ ثانیه این هزینه غیرقابل‌قبول است و تازه یک ضربانِ در صف می‌توانست ردیفِ
 * آزادشده را دوباره زنده کند. اینجا فقط وقتی بایتی واقعاً جریان دارد تمدید
 * می‌کنیم (حداکثر یک بار در ثانیه برای هر اتصال).
 *
 * اگر ردیف ناپدید شده باشد (اتصال بی‌ترافیک مانده و پاک‌سازی آن را برده)،
 * دوباره از همان مسیرِ عادیِ پذیرش رد می‌شویم:
 *   • پذیرفته شد → ردیف برمی‌گردد و اتصال ادامه می‌یابد؛
 *   • رد شد        → برمی‌گرداند { ok:false } و فراخوان اتصال را می‌بندد.
 *
 * ⚠️ پارامترِ alive: تابعی که می‌گوید اتصال هنوز باز است یا نه. یک تمدیدِ در
 * صف می‌تواند بعد از بسته شدنِ اتصال اجرا شود؛ بدون این بررسی، ردیفِ تازه
 * آزادشده دوباره درج می‌شد (همان «آی‌پی برای همیشه قفل شده»). اگر اتصال دیگر
 * زنده نباشد هیچ درجی انجام نمی‌شود و { ok:false, reason:'released' }
 * برمی‌گردد.
 * برمی‌گرداند: { ok, reason, storage } یا null (بک‌اندی نبود / خطا)
 */
async function connRefresh(env, uuid, ip, connId, limit, alive) {
  if (!uuid || !ip || !connId) return null;
  const stillAlive = () => !alive || alive();

  /* ۰) مسدودیِ تازه — اتصالی که همین حالا از پنل مسدود شده باید بسته شود،
     نه اینکه تا پایانِ TTL سر جایش بماند. چون تمدید بر اساسِ فعالیت است،
     این بررسی همان لحظه‌ای اثر می‌کند که اتصال بعدی‌اش بایتی رد کند —
     و به هیچ تایمری احتیاج ندارد. برگرداندنِ ok:false تونل را مؤدبانه می‌بندد. */
  try {
    const ban = await banCheck(env, ip, uuid);
    if (ban) return { ok: false, banned: true, ban, reason: 'ip-banned', storage: backendOf(env) };
  } catch (e) { connErr('ban-refresh', e); }

  /* ۰.۵) قطعِ دستی از پنل — اجرای واقعیِ دکمه‌ی «قطع اتصال».
     نشستِ قطع‌شده تا KICK_TTL دوباره پذیرفته نمی‌شود و همین‌جا بسته می‌شود. */
  try {
    if (await kickCheck(env, uuid, ip, connId)) return { ok: false, reason: 'kicked', storage: backendOf(env) };
  } catch (e) { connErr('kick-refresh', e); }

  /* ۱) D1 — مرجعِ استقرارِ واقعی: اول بررسی می‌کنیم ردیف هست یا نه */
  if (env && env.DB) {
    try {
      if (!(await liveEnsure(env))) return null;
      const row = await env.DB.prepare('SELECT 1 AS x FROM conns WHERE conn_id = ?').bind(connId).first();
      if (row) {
        /* فقط تمدید — هرگز درج؛ sessionTouch خودش نمی‌تواند ردیفی بسازد */
        await sessionTouch(env, uuid, ip, connId);
        return { ok: true, reason: 'refreshed', storage: 'd1' };
      }
      if (!stillAlive()) return { ok: false, reason: 'released', storage: 'd1' };
      /* ردیف پاک شده → تصمیمِ عادیِ پذیرش (ممکن است رد کند) */
      return await d1Acquire(env, uuid, ip, Number(limit) || 0, connId, Date.now());
    } catch (e) { connErr('D1-refresh', e); return null; }
  }
  /* ۲) بقیهٔ بک‌اندها — همان تمدیدِ قدیمی، بدون هیچ درجی */
  if (!stillAlive()) return { ok: false, reason: 'released' };
  const tr = await sessionTouch(env, uuid, ip, connId);
  if (tr && tr.kicked) return { ok: false, reason: 'kicked', storage: backendOf(env) };
  return { ok: true, reason: 'refreshed' };
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
  /* مرجعِ جهانی: هرچه Durable Object می‌بیند همان حقیقت است */
  if (env && env.LIMITER) {
    try {
      const r = await limiterRpc(env, '/list', { uuid });
      for (const s of ((r && r.sessions) || [])) out.set(s.ip, s);
      return [...out.values()].sort((a, b) => (b.conns || 0) - (a.conns || 0));
    } catch (e) { connErr('DO', e); }
  }
  /* D1 — مرجعِ مشترک: همان چیزی که پایگاه‌داده می‌بیند حقیقت است */
  if (env && env.DB) {
    try {
      await liveEnsure(env);
      await liveSweep(env, uuid);
      const r = await env.DB.prepare('SELECT ip, COUNT(*) AS n, MAX(last_ts) AS t FROM conns WHERE uuid = ? GROUP BY ip').bind(uuid).all();
      for (const row of ((r && r.results) || [])) push(String(row.ip), Number(row.n) || 0, Number(row.t) || 0);
      return [...out.values()].sort((a, b) => (b.conns || 0) - (a.conns || 0));
    } catch (e) { connErr('D1-list', e); }
  }
  const um = CONNS.get(uuid);
  if (um) {
    const ips = pruneUser(um, now);
    ips.forEach((n, ip) => {
      let last = 0;
      const m = um.get(ip);
      if (m) m.forEach((ts) => { if (ts > last) last = ts; });
      push(ip, n, last);
    });
  }
  if (env && env.KV) {
    try {
      const list = await env.KV.list({ prefix: 'c:' + uuid + ':' });
      const agg = new Map();
      for (const k of ((list && list.keys) || [])) {
        const p = String(k.name).split(':');
        if (p.length < 4) continue;
        const cur = agg.get(p[2]) || { conns: 0, last: 0 };
        cur.conns++;
        agg.set(p[2], cur);
      }
      agg.forEach((v, ip) => push(ip, v.conns, now));
    } catch (e) { connErr('KV', e); }
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

  /* ── سرورهای خروجی (exit) ──
     همیشه آرایه‌ای معتبر از سرورهای قِسم‌داده‌شده؛ اگر پیش‌فرضِ سراسری به
     سروری اشاره کند که دیگر وجود ندارد، به «مستقیم» برمی‌گردیم تا مسیرِ
     تونل هیچ‌وقت منتظرِ یک شناسه‌ی یتیم نماند. */
  if (!s.exits || typeof s.exits !== 'object') s.exits = { enabled: true, defaultMode: 'direct', defaultExit: '', servers: [] };
  s.exits.enabled = s.exits.enabled !== false;
  if (!Array.isArray(s.exits.servers)) s.exits.servers = [];
  s.exits.servers = s.exits.servers.filter(Boolean).map((x) => normalizeExit(x, x.id));
  s.exits.defaultExit = String(s.exits.defaultExit || '');
  if (s.exits.defaultMode !== 'exit') s.exits.defaultMode = 'direct';
  if (s.exits.defaultExit && !s.exits.servers.some((x) => x.id === s.exits.defaultExit)) {
    s.exits.defaultExit = '';
    s.exits.defaultMode = 'direct';
  }
  if (s.exits.defaultMode === 'exit' && !s.exits.defaultExit) s.exits.defaultMode = 'direct';

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

/* ═══════════════════════════════════════════════════════════════════════════
   پشتیبان‌گیری و بازیابیِ تنظیمات — اعتبارسنجی
   ───────────────────────────────────────────────────────────────────────────
   فهرستِ فیلدهای مجاز از خودِ DEF() ساخته می‌شود، نه یک فهرستِ دستی:
   هر کلیدِ جدیدی که به تنظیمات اضافه شود خودبه‌خود در پشتیبان پذیرفته می‌شود و
   هر کلیدی که در DEF نیست (اشتباهِ تایپی، خروجیِ نسخه‌ی دیگر، فایلِ دستکاری‌شده)
   پیش از هر نوشتنی رد می‌شود — تا چیزی نیمه‌کاره ذخیره نشود.
   ═══════════════════════════════════════════════════════════════════════════ */

const BACKUP_ROOT_KEYS = ['settings', 'users', 'keys', 'panels', 'logs', 'stats', 'updateLog', 'lastCheck', 'uiLoaded'];
const BACKUP_ARRAY_KEYS = ['users', 'keys', 'panels', 'logs'];
const SETTING_KEYS = Object.keys(DEF().settings);

/** اعتبارسنجی — برمی‌گرداند { ok, errors }؛ هیچ چیزی تغییر نمی‌دهد */
function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['فایل انتخاب‌شده یک شیء JSON معتبر نیست (باید آبجکت باشد، نه آرایه یا مقدارِ ساده)'] };
  }
  for (const k of Object.keys(data)) {
    if (!BACKUP_ROOT_KEYS.includes(k)) errors.push('بخشِ ناشناخته: «' + k + '»');
  }
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
    errors.push('بخشِ «settings» وجود ندارد یا یک شیء نیست — این فایل پشتیبانِ این پنل نیست');
  } else {
    for (const k of Object.keys(data.settings)) {
      if (!SETTING_KEYS.includes(k)) errors.push('تنظیمِ ناشناخته: «' + k + '»');
    }
  }
  for (const k of BACKUP_ARRAY_KEYS) {
    if (data[k] === undefined) continue;
    if (!Array.isArray(data[k])) { errors.push('بخشِ «' + k + '» باید یک آرایه باشد'); continue; }
    data[k].forEach((x, i) => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) errors.push('بخشِ «' + k + '» موردِ ' + fa(i + 1) + ' یک شیء معتبر نیست');
    });
  }
  if (data.stats !== undefined && (typeof data.stats !== 'object' || Array.isArray(data.stats))) {
    errors.push('بخشِ «stats» باید یک شیء باشد');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [] };
}

/**
 * اِعمالِ پشتیبان — فقط بعد از اعتبارسنجیِ کامل صدا زده می‌شود، پس هیچ نسخه‌ی
 * نیمه‌کاره‌ای از تنظیمات نوشته نمی‌شود.
 *   mode='merge'   → ادغام در وضعیتِ فعلی (تنظیمات کلیدبه‌کلید)
 *   mode='replace' → جایگزینیِ کامل؛ زیرِ آن پیش‌فرض‌های DEF پر می‌شوند
 */
function applyBackup(st, data, mode) {
  if (mode === 'replace') {
    const next = DEF();
    next.settings = merge(next.settings, data.settings || {});
    for (const k of BACKUP_ROOT_KEYS) {
      if (k === 'settings') continue;
      if (data[k] !== undefined) next[k] = data[k];
    }
    return seed(normalize(next));
  }
  merge(st, data);
  return seed(normalize(st));
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
    return `vless://${u.uuid}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port, '', u, i))}`;
  }
  if (kind === 'trojan') {
    const q = `security=${sec}&sni=${sni}&fp=${fp}&type=ws&host=${host}&path=${encPath}&allowInsecure=${inc}`;
    return `trojan://${u.secret}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port, 'β', u, i))}`;
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
/* ═══════════════════════════════════════════════════════════════════════════
   نام‌گذاری کانفیگ — الگوهای آماده + الگوی کاملاً سفارشی
   ───────────────────────────────────────────────────────────────────────────
   محدودیتِ قبلی: فقط ۵ استراتژیِ از پیش نوشته‌شده و هیچ راهی برای ترکیبِ دلخواه.
   مدلِ جدید: هر نام یک «الگو» است — رشته‌ای از متنِ آزاد و توکن‌های {name}.
   الگوهای آماده فقط میان‌برند؛ الگوی سفارشیِ کاربر هر چه باشد همان اعمال می‌شود.
   فهرستِ الگوها بین ورکر و پنل یکی است (در فایلِ رابط هم تکرار شده) تا پیش‌نمایش
   دقیقاً همان چیزی را نشان بدهد که در ساب تولید می‌شود.
   ═══════════════════════════════════════════════════════════════════════════ */

/* توکن‌های قابل استفاده — پیش‌نمایشِ هرکدام در پنل نشان داده می‌شود */
const NAME_TOKENS = [
  { k: 'prefix', l: 'پیشوند', ex: 'پنل' },
  { k: 'user', l: 'نام کاربر', ex: 'علی' },
  { k: 'proto', l: 'پروتکل', ex: 'VLESS' },
  { k: 'port', l: 'پورت', ex: '443' },
  { k: 'ip', l: 'آی‌پی نود', ex: '104.17.152.10' },
  { k: 'node', l: 'نام نود', ex: 'فرانکفورت' },
  { k: 'index', l: 'شماره', ex: '1' },
  { k: 'mark', l: 'نشان', ex: 'β' },
];

/* الگوهای آماده — v همان مقداری است که در nameStrategy ذخیره می‌شود */
const NAME_PRESETS = [
  { v: 'default', l: 'پیش‌فرض', p: '{prefix} | {node} | :{port} | {mark}' },
  { v: 'minimal', l: 'کوتاه', p: '{node}:{port}' },
  { v: 'user-port', l: 'کاربر-پورت', p: '{user}:{port}' },
  { v: 'type-user-port', l: 'پروتکل-کاربر-پورت', p: '{proto}-{user}-:{port}' },
  { v: 'host-port-user', l: 'نود-پورت-کاربر', p: '{node}-:{port}-{user}' },
  { v: 'user-node-port', l: 'کاربر-نود-پورت', p: '{user} | {node} :{port}' },
  { v: 'proto-node', l: 'پروتکل و نود', p: '{proto} • {node}' },
  { v: 'indexed', l: 'شماره‌دار', p: '{index} • {node}:{port}' },
  { v: 'ip', l: 'فقط آی‌پی', p: '{ip}' },
];

const protoName = (extra) => extra === 'β' ? 'Trojan' : extra === 'SS' ? 'SS' : extra === 'VMess' ? 'VMess' : 'VLESS';

/**
 * رندرِ الگو: توکن‌ها جایگزین می‌شوند و جداکننده‌ی کنارِ توکنِ خالی هم می‌رود.
 * بدون این پاک‌سازی، «{prefix} | {node}» با prefix خالی می‌شد « | فرانکفورت».
 */
function renderName(pattern, vars) {
  let out = String(pattern == null ? '' : pattern);
  /* کلاسِ جداکننده‌ها باید دقیقاً همان چیزی باشد که پیش‌نمایشِ پنل
     (nmRender در ui/app.js) می‌شناسد: فاصله، | خط تیره، · نقطه‌ی میانی،
     – خط تیره‌ی کوتاه و — خط تیره‌ی بلند — همه با کدبندیِ درستِ utf-8. */
  out = out.replace(/([\s|·\-–—]*)\{(\w+)\}([\s|·\-–—]*)/g,
    (m, pre, k, post) => {
      const v = vars[k];
      if (v === undefined || v === null || v === '') return (pre && post) ? ' ' : (pre || post);
      return pre + String(v) + post;
    });
  out = out.replace(/\{(\w+)\}/g, '');                       /* توکنِ ناشناس */
  out = out.replace(/[ \t]*\|[ \t]*(\|[ \t]*)+/g, ' | ');     /* جداکننده‌ی تکراری → یکی */
  out = out.replace(/[ \t]{2,}/g, ' ');                       /* فاصله‌ی تکراری → یکی */
  out = out.replace(/^[\s|·\-–—]+/, '');
  out = out.replace(/[\s|·\-–—]+$/, '');
  return out.trim();
}
/** نام‌گذاری کانفیگ — الگوی سفارشی مقدم بر استراتژی است */
function label(s, e, port, extra, u, i) {
  const prefix = (u && u.namePrefix) ? u.namePrefix : (s.sub.namePrefix || '');
  const vars = {
    prefix,
    user: (u && u.name) || '',
    proto: protoName(extra),
    port: String(port),
    ip: (e && e.ip) || '',
    node: (e && e.name) || ((e && e.ip) || ''),
    index: (i === undefined || i === null || !isFinite(Number(i))) ? '' : String(Number(i) + 1),
    mark: extra || '',
  };

  /* ۱) الگوی کاملاً سفارشی — اولویت دارد و به هیچ فهرستی محدود نیست */
  const custom = (u && u.namePattern) ? u.namePattern : (s.sub.namePattern || '');
  if (String(custom).trim()) return renderName(custom, vars) || renderName('{node}:{port}', vars);

  /* ۲) استراتژی‌های آماده (سازگار با مقادیرِ ذخیره‌شده‌ی قبلی) */
  const strategy = (u && u.nameStrategy && u.nameStrategy !== 'inherit') ? u.nameStrategy : (s.sub.nameStrategy || 'default');
  const preset = NAME_PRESETS.find((x) => x.v === strategy);
  if (preset) return renderName(preset.p, vars) || renderName('{node}:{port}', vars);

  /* ۳) ناشناس → همان رفتارِ قدیمیِ پیش‌فرض */
  return renderName('{prefix} | {node} | :{port} | {mark}', vars);
}

async function uri(kind, u, s, entry, port, i, host) {
  /* ── VLESS و Trojan: فرمت BPB — بدون alpn در URI، با encryption=none ── */
  if (kind === 'vless' || kind === 'trojan') return bpbUri(kind, u, s, entry, port, i, host);

  const g = tranportQ(s, i, host, u.uuid);
  if (kind === 'ss') return `ss://${b64('2022-blake3-aes-128-gcm:' + u.secret)}@${entry.ip}:${port}/?plugin=obfs-local%3Bobfs%3Dwebsocket%3Bobfs-host%3D${encodeURIComponent(host)}%3Bobfs-path%3D${encodeURIComponent(g.path || '/')}#${encodeURIComponent(label(s, entry, port, 'SS', u, i))}`;
  if (kind === 'vmess') {
    const o = { v: '2', ps: label(s, entry, port, 'VMess', u, i), add: entry.ip, port: String(port), id: u.uuid, aid: '0', scy: 'auto', net: s.transport === 'ws' ? 'ws' : s.transport, type: 'none', host, path: g.path || g.serviceName || '/', tls: s.tls ? 'tls' : '', sni: s.sni || host, fp: s.fingerprint };
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
  /* هر پورتِ انتخاب‌شده باید در خروجی بیاید — قبلاً پورت فقط تابعِ اندیسِ
     ورودی بود (ports[i % ports.length]) و اگر تعداد ورودی‌ها کمتر از
     پورت‌ها بود، بیشترِ پورت‌های انتخابی هرگز استفاده نمی‌شدند. حالا برای
     هر ورودی روی همه‌ی پورت‌ها می‌چرخیم. */
  const perProto = s.multiSplit ? Math.max(1, Math.floor((limit || entries.length * ports.length) / protos.length)) : Infinity;
  let n = 0;
  for (const k of protos) {
    let c = 0;
    for (let i = 0; i < entries.length && c < perProto; i++) {
      for (let p = 0; p < ports.length && c < perProto; p++) {
        const port = ports[p];
        out.push({ kind: k, uri: await uri(k, u, s, entries[i], port, n, host), entry: entries[i], port });
        n++; c++;
      }
    }
  }
  for (const k of ['ss', 'vmess']) {
    if (!s.protocols[k]) continue;
    const e = entries[n % entries.length], port = ports[n % ports.length];
    out.push({ kind: k, uri: await uri(k, u, s, e, port, n, host), entry: e, port });
    n++;
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
/* نامِ هر کانفیگ از همان label() الگوها می‌آید تا نام‌گذاریِ پنل در همه‌ی
   قالب‌ها (Base64، Clash، sing-box، v2ray) یکسان دیده شود — قبلاً این
   قالب‌ها نام را نادیده می‌گرفتند و همیشه «پیشوند-شماره» می‌گذاشتند.
   چون Clash نامِ تکراری را قبول نمی‌کند، در صورت تکرار شماره اضافه می‌شود. */
function configName(list, c, u, s, i, used) {
  const mark = c.kind === 'trojan' ? 'β' : c.kind === 'vmess' ? 'VMess' : c.kind === 'ss' ? 'SS' : '';
  let nm = String(label(s, c.entry, c.port, mark, u, i) || '').trim();
  if (!nm) nm = `${s.sub.namePrefix || 'cfg'}-${i + 1}`;
  if (used) {
    if (used.has(nm)) { let k = 2; while (used.has(nm + ' ' + k)) k++; nm = nm + ' ' + k; }
    used.add(nm);
  }
  return nm;
}
function clashYaml(list, u, s, url) {
  const host = s.host || url.hostname;
  const used = new Set();
  const names = list.map((c, i) => configName(list, c, u, s, i, used));
  const proxies = list.map((c, i) => {
    const base = { name: names[i], type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'ss' : 'vless', server: c.entry.ip, port: c.port, udp: true, ...(c.kind === 'vless' ? { uuid: u.uuid } : c.kind === 'trojan' ? { password: u.secret } : { cipher: '2022-blake3-aes-128-gcm', password: u.secret }) };
    if (s.tls && c.kind !== 'ss') { base.tls = true; base.servername = s.sni || host; base['skip-cert-verify'] = !!s.allowInsecure; base['client-fingerprint'] = s.fingerprint === 'randomized' ? 'chrome' : s.fingerprint; }
    if (c.kind === 'vmess') { base.uuid = u.uuid; base.alterId = 0; base.cipher = 'auto'; }
    if (s.transport === 'ws') base['ws-opts'] = { path: plainPath(s, i, u.uuid), headers: { Host: host } };
    if (s.transport === 'grpc') { base.network = 'grpc'; base['grpc-opts'] = { 'grpc-service-name': s.grpcService }; }
    return '  - ' + JSON.stringify(base);
  });
  const groups = s.sub.countryGroups ? countryGroups(list, names) : [];
  const lines = [
    `# ${s.panel.name} — Clash/Mihomo`, 'mixed-port: 7890', 'allow-lan: false', 'mode: rule', 'log-level: warning',
    'dns:', '  enable: true', '  nameserver:', `    - ${s.sub.doh}`, 'proxies:', ...proxies, 'proxy-groups:',
    '  - name: "🚀 پروکسی"', '    type: select', '    proxies:', ...names.map((nm) => `      - "${nm}"`).concat(groups.map((g) => `      - "${g.name}"`)),
    ...groups.flatMap((g) => ['  - name: "' + g.name + '"', '    type: urltest', '    proxies:', ...g.items.map((x) => `      - "${x}"`)]),
    'rules:', ...(s.sub.bypassIR ? ['  - GEOIP,IR,DIRECT', '  - DOMAIN-SUFFIX,ir,DIRECT'] : []),
    ...(s.sub.blockAds ? ['  - GEOSITE,category-ads-all,REJECT'] : []), ...(s.sub.blockAdult ? ['  - GEOSITE,category-porn,REJECT'] : []),
    ...(s.sub.blockQuic ? ['  - AND((NETWORK,UDP),(DST-PORT,443)),REJECT'] : []),
    ...s.sub.rules.map((r) => '  - ' + r), '  - MATCH,🚀 پروکسی',
  ];
  return lines.join('\n');
}
function countryGroups(list, names) {
  const map = {};
  list.forEach((c, i) => { const g = geo(c.entry.ip); (map[g.name] = map[g.name] || []).push(names[i]); });
  return Object.entries(map).map(([name, items]) => ({ name, items }));
}
function metaJson(list, u, s, url) {
  const host = s.host || url.hostname;
  const used = new Set();
  const proxies = list.map((c, i) => ({ name: configName(list, c, u, s, i, used), type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'ss' : 'vless', server: c.entry.ip, port: c.port, udp: true, ...(c.kind === 'vless' ? { uuid: u.uuid } : { password: u.secret }), ...(s.tls && c.kind !== 'ss' ? { tls: true, servername: s.sni || host, 'skip-cert-verify': !!s.allowInsecure, 'client-fingerprint': s.fingerprint } : {}), ...(s.transport === 'ws' ? { 'ws-opts': { path: plainPath(s, i, u.uuid), headers: { Host: host } } } : {}), ...(s.transport === 'grpc' ? { network: 'grpc', 'grpc-opts': { 'grpc-service-name': s.grpcService } } : {}) }));
  return JSON.stringify({ 'mixed-port': 7890, mode: 'rule', 'log-level': 'warning', dns: { enable: true, nameserver: [s.sub.doh] }, proxies, 'proxy-groups': [{ name: '🚀 پروکسی', type: 'select', proxies: [...proxies.map((p) => p.name), 'DIRECT'] }], rules: [...(s.sub.bypassIR ? ['GEOIP,IR,DIRECT'] : []), ...(s.sub.blockAds ? ['GEOSITE,category-ads-all,REJECT'] : []), ...s.sub.rules, 'MATCH,🚀 پروکسی'] }, null, 2);
}
function singboxJson(list, u, s, url) {
  const host = s.host || url.hostname;
  const used = new Set();
  const obs = list.map((c, i) => ({
    tag: configName(list, c, u, s, i, used), type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'shadowsocks' : 'vless',
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

/* ═══ سایت‌های استتار واقعی — کلیدها باید دقیقاً با DECOY_PAGES یکی باشند ═══
   انتخابِ کاربر (auth.maintenanceHost) اینجا را انتخاب می‌کند و صفحه به‌صورت
   زنده واکشی می‌شود؛ اگر واکشی شکست خورد، صفحه‌ی داخلیِ هم‌نام جایگزین می‌شود.
   ⚠️ کلیدهای این دو جدول باید یکی‌به‌یکی باشند، وگرنه انتخابِ کاربر بی‌اثر
   می‌شود (قبلاً گزینه‌های wiki/wp/maintenance در رابط بود ولی اینجا نبود). */
const DECOY_SITES = {
  nginx:      { url: 'https://nginx.org/en/',                      label: 'nginx' },
  ubuntu:     { url: 'https://ubuntu.com/server/docs',             label: 'Ubuntu Server' },
  docker:     { url: 'https://docs.docker.com/',                   label: 'Docker Docs' },
  cloudflare: { url: 'https://developers.cloudflare.com/workers/', label: 'Cloudflare Workers' },
  python:     { url: 'https://docs.python.org/3/',                 label: 'Python Docs' },
  node:       { url: 'https://nodejs.org/docs/latest/api/',        label: 'Node.js Docs' },
};

/* کش صفحات استتار */
const DECOY_CACHE = new Map();   // url -> {body, ts}
const DECOY_TTL = 300000;        // ۵ دقیقه

/* فایل‌های غیرـHTML: اگر سایت واقعی خطا بدهد، برای این‌ها ۴۰۴ می‌دهیم تا
   مرورگر یک صفحه‌ی HTML را به‌جای CSS/تصویر نپذیرد (علتِ «سایت پوششی بی‌ styling»). */
const ASSET_EXT = /\.(css|js|mjs|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wasm|map|txt|xml|pdf)$/i;

/* سرآیندهایی که از پاسخِ سایت واقعی حذف می‌شوند: یا محتوای بازنویسی‌شده را
   می‌بندند (CSP/SRI) یا وضعیتِ امنیتیِ دامنه‌ی ما را به هم می‌زنند (HSTS/کوکی). */
const DECOY_DROP_HEADERS = [
  'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'strict-transport-security', 'set-cookie',
  'clear-site-data', 'cross-origin-embedder-policy',
  'cross-origin-opener-policy', 'cross-origin-resource-policy',
];

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
    const ctype = String(r.headers.get('content-type') || '');
    /* فقط HTML — اگر آدرس به یک فایل/JSON اشاره کند، صفحه‌ی داخلی جایگزین می‌شود */
    if (ctype && !/text\/html|application\/xhtml/i.test(ctype)) throw new Error('not html: ' + ctype);
    let body = await r.text();

    /* ═══ ۱. حذف CSP و meta refresh که لودِ دارایی‌ها را بلاک می‌کنند ═══ */
    body = body
      .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
      .replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');

    /* ═══ ۲. حذف اسکریپت‌ها (جلوگیری از رفتار ناخواسته و خطا) ═══ */
    body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    /* ⚠️ لینک‌های نسبی دست‌نخورده می‌مانند — عمداً.
       قبلاً همه‌ی href/src به آدرسِ مطلقِ سایت اصلی تبدیل می‌شدند، برای همین
       مرورگر دارایی را مستقیم از سایت اصلی می‌گرفت: اگر آن سایت برای کاربر
       در دسترس نبود (یا آدرس با regex پوشش داده نمی‌شد، مثل نقل‌قول‌ تکی یا
       crossorigin)، صفحه بی‌استایل می‌شد. حالا مسیرِ نسبی روی دامنه‌ی خودمان
       می‌ماند و proxyDecoyAsset آن را از سایت واقعی می‌گیرد — دقیقاً مثل
       serveMaintenancePage در نهان. دارایی‌ها همیشه از لبه‌ی کلاودفلر می‌آیند. */

    DECOY_CACHE.set(target, { body, ts: Date.now() });
    return body;
  } catch (e) { return null; }
}

/** آدرسِ سایت پوششی: آدرسِ دلخواه، وگرنه سایتِ انتخاب‌شده از فهرست */
function decoyTarget(s) {
  const custom = s && s.auth && s.auth.decoyUrl ? String(s.auth.decoyUrl).trim() : '';
  if (custom) {
    try { return new URL(/^https?:\/\//i.test(custom) ? custom : 'https://' + custom).href; }
    catch (e) { /* آدرس نامعتبر → فهرستِ زیر جایگزین می‌شود */ }
  }
  const host = (s && s.auth && s.auth.maintenanceHost) || 'nginx';
  const site = DECOY_SITES[host];
  return site && site.url ? site.url : null;
}

/** سرآیندهای صفحه‌ی پوششی — عمداً بدون secHeaders تا هیچ نشانی از پنل درز نکند
    (secHeaders شامل CSP و Access-Control-Allow-Origin است که مالِ پنل است) */
function decoyHtml(body, maxAge) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=' + (maxAge || 300),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

/** اندازه‌ی متنِ واقعیِ صفحه (بدون تگ) */
const decoyTextLen = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
/* کمینه‌ی متن برای پذیرشِ صفحه‌ی زنده: سایت‌های تک‌صفحه‌ای (مثل مستنداتِ
   داکر/کلاودفلر) بعد از حذفِ اسکریپت تقریباً خالی می‌مانند — در آن صورت
   صفحه‌ی داخلی نمایش داده می‌شود تا ریشه هیچ‌وقت سفید نماند. */
const DECOY_MIN_TEXT = 400;

/** پاسخِ «پیدا نشد» برای دارایی‌ها — هرگز ۵۰۰ و هرگز بدنه‌ی خالی */
const decoyMiss = () => new Response('Not Found', {
  status: 404,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=60' },
});

/**
 * بازتابِ مسیر روی سایت واقعی — روشِ نهان (serveMaintenancePage):
 * درخواستِ دارایی با همان مسیر به سایت مقصد فرستاده می‌شود و پاسخ با
 * content-type خودش برمی‌گردد. برای همین CSS و تصویر دیگر با text/html
 * اشتباه گرفته نمی‌شوند و صفحه بی‌استایل نمی‌ماند.
 */
async function proxyDecoyAsset(target, request, url) {
  try {
    const u = decoyMirrorUrl(target, url);
    if (!u) return null;
    /* ضدِ حلقه: اگر مقصد خودِ همین ورکر باشد دارایی را واکشی نمی‌کنیم */
    if (u.hostname === url.hostname) return null;

    const h = new Headers(request.headers);
    h.set('host', u.hostname);
    /* نشتِ هویتِ کاربر به سایت مقصد */
    ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'cf-ray', 'cf-visitor',
      'cf-ipcountry', 'authorization', 'cookie'].forEach((k) => h.delete(k));

    const init = { method: request.method, headers: h, redirect: 'follow' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.arrayBuffer();
    }
    const r = await fetch(new Request(u.toString(), init), { cf: { cacheTtl: 300 } });

    const out = new Headers();
    ['content-type', 'cache-control', 'etag', 'last-modified', 'expires',
      'content-language', 'content-disposition'].forEach((k) => {
      const v = r.headers.get(k);
      if (v) out.set(k, v);
    });
    out.set('x-content-type-options', 'nosniff');
    DECOY_DROP_HEADERS.forEach((k) => out.delete(k));
    /* بدنه دست‌نخورده است، پس content-length را به پلتفرم می‌سپاریم */
    out.delete('content-length');
    if (!out.has('cache-control')) out.set('cache-control', 'public, max-age=300');
    return new Response(r.body, { status: r.status, headers: out });
  } catch (e) { return null; }
}

/** مسیرِ درخواست → آدرسِ متناظر روی سایت مقصد (نسبت به پوشه‌ی همان صفحه) */
function decoyMirrorUrl(target, url) {
  try {
    const base = new URL(target);
    const p = String(url.pathname || '/');
    /* مسیرِ کاملِ خودِ سایت مقصد (مثل /en/docs) مستقیم می‌رود */
    const prefix = base.pathname.replace(/\/+$/, '');
    if (prefix && (p === prefix || p.startsWith(prefix + '/'))) {
      const d = new URL(p + (url.search || ''), base.origin);
      return d;
    }
    /* وگرنه نسبت به پوشه‌ی صفحه‌ی پایه حل می‌شود: /style.css روی /en/ → /en/style.css */
    const b = new URL(target);
    if (!b.pathname.endsWith('/')) b.pathname += '/';
    const d = new URL(p.replace(/^\/+/, ''), b);
    d.search = url.search || '';
    return d;
  } catch (e) { return null; }
}

/** پاسخ استتار — سایت واقعی (زنده) یا صفحه‌ی داخلی
    info (اختیاری): {mode} پر می‌شود تا پنل بداند کدام شاخه استفاده شد */
async function decoyPage(s, force, request, url, info) {
  const target = decoyTarget(s);

  /* ۱) دارایی‌ها و زیرصفحه‌ها — مسیر روی سایت واقعی بازتاب می‌شود */
  if (target && url && url.pathname && url.pathname !== '/') {
    const proxied = await proxyDecoyAsset(target, request, url);
    if (proxied) { if (info) info.mode = 'asset'; return proxied; }
    /* خطا: برای دارایی ۴۰۴ (هرگز HTML به‌جای CSS)، برای زیرصفحه ادامه می‌دهیم */
    if (ASSET_EXT.test(url.pathname)) return decoyMiss();
  }

  /* ۲) صفحه‌ی زنده‌ی سایت واقعی — فقط اگر متنِ کافی داشته باشد */
  if (target) {
    const body = await fetchDecoy(target, force);
    if (body && decoyTextLen(body) >= DECOY_MIN_TEXT) {
      if (info) info.mode = 'live';
      return decoyHtml(body, 300);
    }
  }

  /* ۳) صفحه‌ی داخلی — همیشه با CSS کامل، بدون نیاز به واکشی (شکستِ graceful) */
  const host = (s && s.auth && s.auth.maintenanceHost) || 'nginx';
  if (info) info.mode = 'builtin';
  return decoyHtml(DECOY_PAGES[host] || DECOY_PAGES.nginx, 3600);
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
/* ═══════════════════════════════════════════════════════════════════════════
   صفحه‌ی کاربر — نسخه‌ی پشتیبان (فقط وقتی ui/user.html از گیت‌هاب نرسد)
   ───────────────────────────────────────────────────────────────────────────
   ⚠️ تا قبل از این، یک کپیِ کامل از ui/user.html اینجا درون‌ریخت شده بود.
   دو نسخه از یک صفحه یعنی دو مسیرِ نگه‌داری، و در عمل یکی عقب می‌ماند:
   نسخه‌ی زنده (گیت‌هاب) Placeholderهای __PANEL_NAME__ و __EXPIRY_FA__ را
   نداشت، پس عنوانِ مرورگر همان __PANEL_NAME__ خام را نشان می‌داد و تاریخِ
   انقضای فارسی اصلاً چاپ نمی‌شد. تکرار حذف شد: مرجع یکی است (ui/user.html)
   و این فقط یک صفحه‌ی ساده برای وقتی است که آن فایل در دسترس نباشد.
   ═══════════════════════════════════════════════════════════════════════════ */
const USER_PAGE = `<!DOCTYPE html>
<html lang="fa" dir="rtl" id="html-root">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title id="page-title">VPN Dashboard</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* ===== فونت‌ها و ریست ===== */
        @import url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/vazirmatn-font-face.css');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Vazirmatn', sans-serif;
            -webkit-tap-highlight-color: transparent;
        }

        /* ===== متغیرهای تم ===== */
        :root {
            --bg: #090C11;
            --bg-grid: rgba(255, 255, 255, 0.035);
            --surface: #12161F;
            --surface-alt: #171C27;
            --text: #EDEFF3;
            --text-muted: #838DA0;
            --border: rgba(255, 255, 255, 0.07);
            --accent: #2DD4BF;
            --accent-rgb: 45, 212, 191;
            --accent-2: #4C8DFF;
            --accent-2-rgb: 76, 141, 255;
            --alert: #F0655F;
            --alert-rgb: 240, 101, 95;
            --warn: #F4A94A;
            --warn-rgb: 244, 169, 74;
            --nav-bg: #0C0F15;
            --hero-1: #101A28;
            --hero-2: #05070B;
            --hero-alert-1: #2A1214;
            --hero-alert-2: #0B0505;
            --ring-track: rgba(255, 255, 255, 0.06);
            --shadow: rgba(0, 0, 0, 0.4);
            --box-shadow-light: 0 4px 12px rgba(0,0,0,0.15);
            --notification-bg: rgba(18, 22, 31, 0.85);
        }

        body.light-mode {
            --bg: #EEF1F6;
            --bg-grid: rgba(16, 21, 32, 0.05);
            --surface: #FFFFFF;
            --surface-alt: #F4F6FA;
            --text: #10141C;
            --text-muted: #6B7484;
            --border: rgba(16, 21, 32, 0.08);
            --accent: #0EA394;
            --accent-rgb: 14, 163, 148;
            --accent-2: #2D6CDF;
            --accent-2-rgb: 45, 108, 223;
            --alert: #DC4C43;
            --alert-rgb: 220, 76, 67;
            --warn: #DB8A2A;
            --warn-rgb: 219, 138, 42;
            --nav-bg: #FFFFFF;
            --hero-1: #FFFFFF;
            --hero-2: #EAF6F4;
            --hero-alert-1: #FDEBEA;
            --hero-alert-2: #F7CFCB;
            --ring-track: rgba(16, 21, 32, 0.09);
            --shadow: rgba(16, 21, 32, 0.08);
            --box-shadow-light: 0 6px 18px rgba(0,0,0,0.12);
            --notification-bg: rgba(255, 255, 255, 0.92);
        }

        body {
            background-color: var(--bg);
            background-image: radial-gradient(var(--bg-grid) 1px, transparent 1px);
            background-size: 18px 18px;
            color: var(--text);
            padding: 20px 16px 100px 16px;
            max-width: 480px;
            margin: 0 auto;
            transition: background-color 0.35s ease, color 0.35s ease;
            position: relative;
        }

        html[dir="ltr"] body { direction: ltr; }
        html[dir="rtl"] body { direction: rtl; }

        .en-font {
            font-family: 'JetBrains Mono', 'Segoe UI', Tahoma, Geneva, Verdana, monospace !important;
            letter-spacing: 0.2px;
        }

        .app-screen { display: none; }
        .app-screen.active-screen { display: block; }

        /* ===== هدر ===== */
        .header {
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .profile-container { display: flex; align-items: center; flex: 1; min-width: 0; }
        html[dir="rtl"] .profile-img-wrapper { margin-left: 12px; }
        html[dir="ltr"] .profile-img-wrapper { margin-right: 12px; }

        .profile-img-wrapper {
            position: relative;
            cursor: default;
            width: 54px;
            height: 54px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .profile-img {
            width: 46px;
            height: 46px;
            border-radius: 50%;
            background: var(--surface-alt);
            border: 2.5px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: border-color 0.35s ease;
        }
        .profile-img.online {
            border-color: var(--accent);
        }

        .default-avatar-svg {
            width: 24px;
            height: 24px;
            fill: var(--text-muted);
            display: block;
            border-radius: 50%;
        }

        .online-status-text {
            font-size: 9px;
            font-weight: 700;
            color: var(--accent);
            margin-top: 2px;
            transition: color 0.3s;
            letter-spacing: 0.3px;
        }
        .online-status-text.offline {
            color: var(--text-muted);
        }

        .online-dot {
            position: absolute;
            bottom: 2px;
            width: 11px;
            height: 11px;
            background-color: #555;
            border-radius: 50%;
            border: 2px solid var(--bg);
            z-index: 3;
            transition: background-color 0.3s ease;
        }
        .online-dot.online {
            background-color: var(--accent);
        }
        html[dir="rtl"] .online-dot { left: 2px; }
        html[dir="ltr"] .online-dot { right: 2px; }

        .user-info {
            display: flex;
            align-items: center;
            margin-top: 4px;
            min-width: 0;
        }
        .user-name {
            font-size: 16px;
            font-weight: 700;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
            min-width: 0;
        }
        html[dir="rtl"] .user-name { flex-direction: row-reverse; }
        html[dir="ltr"] .user-name { flex-direction: row; }

        .greeting-text {
            color: var(--text);
            transition: color 0.3s;
            white-space: nowrap;
        }
        .username-text {
            transition: color 0.3s;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
        }
        .username-text.online {
            color: var(--accent);
        }

        .wave-icon-wrapper {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            transform-origin: bottom center;
            animation: premiumSoftWave 3.5s ease-in-out infinite;
            flex-shrink: 0;
        }
        .wave-icon-wrapper svg { width: 100%; height: 100%; }

        @keyframes premiumSoftWave {
            0% { transform: rotate(0deg) scale(1); }
            15% { transform: rotate(10deg) scale(1.01); }
            30% { transform: rotate(-6deg) scale(1.02); }
            45% { transform: rotate(8deg) scale(1.01); }
            60% { transform: rotate(-4deg) scale(1); }
            75% { transform: rotate(4deg) scale(1); }
            100% { transform: rotate(0deg) scale(1); }
        }

        .header-icons {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-shrink: 0;
        }
        .lang-container { position: relative; }

        .header-icon {
            height: 42px;
            padding: 0 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 14px;
            cursor: pointer;
            transition: border-color 0.25s;
            gap: 6px;
        }
        .header-icon:hover { border-color: rgba(var(--accent-rgb), 0.4); }
        .header-icon i { font-size: 16px; color: var(--text-muted); }

        .lang-btn {
            font-size: 13px;
            font-weight: 700;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .lang-dropdown-menu {
            position: absolute;
            top: 50px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            min-width: 110px;
            box-shadow: 0 10px 25px var(--shadow);
            z-index: 1000;
            display: none;
            text-align: right;
        }
        html[dir="rtl"] .lang-dropdown-menu { left: 0; }
        html[dir="ltr"] .lang-dropdown-menu { right: 0; }
        .lang-dropdown-menu.show { display: block; }

        .lang-dropdown-item {
            padding: 10px 14px;
            font-size: 13px;
            color: var(--text-muted);
            cursor: pointer;
            transition: background 0.2s;
        }
        .lang-dropdown-item:hover { background: rgba(var(--accent-rgb), 0.12); color: var(--text); }

        /* ===== کارت اشتراک ===== */
        .subscription-card {
            border: 1px solid rgba(var(--accent-rgb), 0.15);
            border-radius: 22px;
            padding: 24px;
            margin-bottom: 16px;
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(150deg, var(--hero-1) 0%, var(--hero-2) 100%);
            box-shadow: inset 0 0 24px rgba(var(--accent-rgb), 0.06), var(--box-shadow-light);
            overflow: hidden;
            transition: background 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease;
        }
        .subscription-card::before {
            content: '';
            position: absolute;
            inset: 0;
            background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
            background-size: 16px 16px;
            pointer-events: none;
        }
        .subscription-card.disconnected {
            background: linear-gradient(150deg, var(--hero-alert-1) 0%, var(--hero-alert-2) 100%);
            box-shadow: inset 0 0 24px rgba(var(--alert-rgb), 0.1), var(--box-shadow-light);
            border-color: rgba(var(--alert-rgb), 0.18);
        }

        .status-right { display: flex; flex-direction: column; position: relative; z-index: 1; }
        .active-badge {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            color: #fff;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
        }
        .status-dot-green {
            width: 16px;
            height: 16px;
            background-color: var(--accent);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: statusPulseGreen 2s infinite;
        }
        .status-dot-green i { font-size: 9px; color: #06110F; }
        .subscription-card.disconnected .status-dot-green {
            background-color: var(--alert);
            animation: statusPulseRed 1.5s infinite;
        }
        .subscription-card.disconnected .status-dot-green i { color: #2A0B09; }

        @keyframes statusPulseGreen {
            0% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.5); }
            70% { box-shadow: 0 0 0 8px rgba(var(--accent-rgb), 0); }
            100% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
        }
        @keyframes statusPulseRed {
            0% { box-shadow: 0 0 0 0 rgba(var(--alert-rgb), 0.6); }
            70% { box-shadow: 0 0 10px rgba(var(--alert-rgb), 0); }
            100% { box-shadow: 0 0 0 0 rgba(var(--alert-rgb), 0); }
        }

        .days-left {
            font-size: 36px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 4px;
            font-family: 'JetBrains Mono', monospace;
        }
        .days-left span {
            color: var(--accent);
            font-size: 18px;
            font-weight: 600;
            font-family: 'Vazirmatn', sans-serif;
            margin-left: 6px;
        }
        .subscription-card.disconnected .days-left span { color: var(--alert); }
        .expire-date { font-size: 12px; color: rgba(255,255,255,0.65) !important; font-weight: 600; }

        .progress-circle {
            position: relative;
            width: 108px;
            height: 108px;
            border-radius: 50%;
            background: conic-gradient(var(--accent) 0% 100%, rgba(255, 255, 255, 0.06) 100% 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            transition: background 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .progress-circle::after {
            content: '';
            position: absolute;
            width: 88px;
            height: 88px;
            background-color: var(--hero-2);
            border-radius: 50%;
            transition: background-color 0.3s;
        }
        .radar-sweep {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            animation: radarSpin 3.2s linear infinite;
            pointer-events: none;
        }
        .radar-sweep::before {
            content: '';
            position: absolute;
            top: 1px;
            left: 50%;
            width: 5px;
            height: 5px;
            margin-left: -2.5px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 0 8px 2px rgba(var(--accent-rgb), 0.9);
        }
        @keyframes radarSpin { to { transform: rotate(360deg); } }
        .subscription-card.disconnected .radar-sweep { animation-play-state: paused; opacity: 0.3; }
        .subscription-card.disconnected .radar-sweep::before { box-shadow: 0 0 8px 2px rgba(var(--alert-rgb), 0.9); }
        .subscription-card.disconnected .progress-circle::after { background-color: var(--hero-alert-2); }

        .progress-text { position: relative; z-index: 2; text-align: center; }
        .progress-text .percent { font-size: 22px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; }
        .progress-text .label { font-size: 10px; color: #8891A3; display: block; margin-top: 2px; }

        /* ===== سازگاری کارت اشتراک با حالت روشن ===== */
        body.light-mode .subscription-card {
            border-color: rgba(var(--accent-rgb), 0.25);
        }
        body.light-mode .subscription-card.disconnected {
            border-color: rgba(var(--alert-rgb), 0.4);
            box-shadow: inset 0 0 24px rgba(var(--alert-rgb), 0.12), var(--box-shadow-light);
        }
        body.light-mode .subscription-card::before {
            background-image: linear-gradient(rgba(16,21,32,0.03) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(16,21,32,0.03) 1px, transparent 1px);
        }
        body.light-mode .active-badge { color: var(--text); }
        body.light-mode .days-left { color: var(--text); }
        body.light-mode .expire-date { color: var(--text-muted) !important; }
        body.light-mode .progress-circle::after { background-color: var(--hero-2); }
        body.light-mode .progress-text .percent { color: var(--text); }
        body.light-mode .progress-text .label { color: var(--text-muted); }
        body.light-mode .radar-sweep::before { background: var(--text); }

        /* ===== کارت آمار ===== */
        .stats-card {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 18px 10px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            box-shadow: var(--box-shadow-light);
        }
        .stat-item { flex: 1; display: flex; flex-direction: column; align-items: center; }
        .stat-header-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 12px;
            flex-direction: row-reverse;
        }
        html[dir="ltr"] .stat-header-row { flex-direction: row; }
        .stat-icon-wrapper {
            width: 26px;
            height: 26px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--surface-alt);
            border: 1px solid var(--border);
        }
        .stat-title { font-size: 11px; color: var(--text-muted); }
        .stat-value { font-size: 14px; font-weight: 700; color: var(--text); font-family: 'JetBrains Mono', monospace; }
        .stat-value.purple-value { color: var(--accent); }
        .stat-divider { height: 40px; width: 1px; background: var(--border); align-self: center; }

        /* ===== کارت تبلیغاتی ===== */
        .promo-card {
            background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.15), rgba(var(--accent-rgb), 0.05));
            border: 1px solid rgba(var(--accent-rgb), 0.25);
            border-radius: 18px;
            padding: 18px 16px;
            margin-bottom: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            box-shadow: var(--box-shadow-light);
            text-align: center;
        }
        .promo-card .promo-text {
            font-size: 16px;
            font-weight: 500;
            color: var(--text);
            line-height: 1.8;
        }
        .promo-card .promo-text span {
            color: var(--accent);
            font-weight: 700;
        }
        .promo-buttons {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            justify-content: center;
        }
        .promo-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 18px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.25s ease;
            background: var(--surface);
            border: 1px solid var(--border);
            color: var(--text);
            box-shadow: var(--box-shadow-light);
        }
        .promo-btn:hover {
            transform: scale(1.03);
            border-color: rgba(var(--accent-rgb), 0.4);
        }
        .promo-btn i { font-size: 18px; }
        .promo-btn.telegram i { color: #0088cc; }


        /* ===== گرید جزئیات ===== */
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 16px;
        }
        .detail-card {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 14px 12px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            min-height: 72px;
            box-shadow: var(--box-shadow-light);
        }
        .detail-card .label {
            font-size: 10px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .detail-card .value {
            font-size: 16px;
            font-weight: 700;
            color: var(--text);
            font-family: 'JetBrains Mono', monospace;
        }
        .detail-card .value.accent-value { color: var(--accent); }
        .detail-card .value.alert-value { color: var(--alert); }

        .section-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-muted);
            margin-bottom: 12px;
            text-align: right;
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        html[dir="ltr"] .section-title { text-align: left; }

        /* ===== دکمه‌های عملیاتی ===== */
        .actions-grid {
            display: flex;
            gap: 10px;
            margin-bottom: 12px;
        }
        .action-cell { flex: 1; }
        .action-card {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 18px 4px;
            text-align: center;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            height: 100%;
            transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
            box-shadow: var(--box-shadow-light);
        }
        .action-card:active { transform: scale(0.96); }
        .action-card:hover { border-color: rgba(var(--accent-rgb), 0.3); }
        .action-card i { font-size: 20px; }
        .action-card.renew i { color: var(--warn); }
        .action-card.link i { color: var(--accent); }
        .action-card.qr i { color: var(--accent-2); }
        .action-card.config i { color: var(--accent); }
        .action-label { font-size: 11px; color: var(--text); font-weight: 600; line-height: 1.3; }

        .action-dropdown-container {
            width: 100%;
            margin-bottom: 24px;
            display: none;
        }
        .action-dropdown-container.show { display: block; }
        .action-dropdown-menu {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 10px;
            box-shadow: 0 10px 25px var(--shadow);
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-height: 60px;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            font-size: 13px;
        }

        /* ===== رادار آی‌پی تمیز ===== */
        .radar-panel { align-items: stretch; justify-content: flex-start; gap: 10px; text-align: right; }
        html[dir="ltr"] .radar-panel { text-align: left; }
        .radar-head { display: flex; flex-direction: column; gap: 2px; padding: 2px 4px; }
        .radar-title { font-size: 13px; font-weight: 700; color: var(--text); }
        .radar-hint { font-size: 10px; color: var(--text-muted); }
        .radar-ports { display: flex; flex-wrap: wrap; gap: 6px; }
        .radar-port-chip {
            background: var(--surface-alt);
            border: 1px solid var(--border);
            color: var(--text-muted);
            border-radius: 999px;
            padding: 4px 12px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .radar-port-chip.active { background: rgba(var(--accent-rgb), 0.15); border-color: rgba(var(--accent-rgb), 0.4); color: var(--accent); }
        .radar-start-btn {
            background: rgba(var(--accent-rgb), 0.15);
            border: 1px solid rgba(var(--accent-rgb), 0.3);
            color: var(--text);
            padding: 8px 14px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s;
        }
        .radar-start-btn:hover { background: var(--accent); color: #06110F; }
        .radar-start-btn.running { background: rgba(var(--warn-rgb), 0.15); border-color: rgba(var(--warn-rgb), 0.35); color: var(--warn); }
        .radar-progress-track { width: 100%; height: 6px; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
        .radar-progress-bar { width: 0%; height: 100%; background: var(--accent); transition: width 0.2s; }
        .radar-status { font-size: 11px; color: var(--text-muted); padding: 0 4px; min-height: 14px; }
        .radar-table-wrap { width: 100%; overflow-x: auto; display: none; }
        .radar-table-wrap.show { display: block; }
        .radar-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .radar-table th { color: var(--text-muted); font-weight: 600; text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--border); }
        html[dir="ltr"] .radar-table th { text-align: left; }
        .radar-table td { color: var(--text); padding: 6px 8px; border-bottom: 1px solid var(--border); }
        .radar-table tbody tr:last-child td { border-bottom: none; }
        .radar-table tr.radar-row-best td { background: rgba(var(--accent-rgb), 0.12); color: var(--accent); font-weight: 700; }
        .radar-port-tag { color: var(--text-muted); font-size: 10px; }
        .radar-best { display: none; flex-direction: column; gap: 6px; width: 100%; }
        .radar-best.show { display: flex; }
        .radar-best-label { font-size: 11px; color: var(--text-muted); padding: 0 4px; }
        .radar-best-row { display: flex; gap: 6px; align-items: center; width: 100%; }
        .radar-best-input {
            flex: 1; min-width: 0;
            background: var(--surface-alt);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text);
            font-size: 10px;
            padding: 7px 10px;
            direction: ltr;
            text-overflow: ellipsis;
        }
        .radar-best-input:focus { outline: none; border-color: rgba(var(--accent-rgb), 0.4); }
        .radar-best-note { font-size: 10px; color: var(--text-muted); padding: 0 4px; }

        .ip-row-item {
            background: var(--surface-alt);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 10px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
        }
        .ip-details-left { display: flex; align-items: center; gap: 12px; text-align: right; }
        html[dir="ltr"] .ip-details-left { text-align: left; flex-direction: row; }
        html[dir="rtl"] .ip-details-left { flex-direction: row-reverse; }

        .action-mini-flag {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-size: cover;
            background-position: center;
            border: 1px solid var(--border);
        }
        .ip-meta-block { display: flex; flex-direction: column; gap: 4px; }
        .ip-address-text { font-size: 13px; font-weight: bold; color: var(--text); }

        .ip-protocol-badge-box {
            display: inline-flex;
            gap: 3px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 2px 6px;
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 500;
            line-height: 1.4;
        }
        .proto-part-1 { color: var(--warn); }
        .proto-part-2 { color: var(--accent-2); }
        .proto-part-3 { color: var(--accent); }

        .ip-copy-btn {
            background: rgba(var(--accent-rgb), 0.12);
            border: 1px solid rgba(var(--accent-rgb), 0.25);
            color: var(--accent);
            padding: 6px 12px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .ip-copy-btn:hover { background: var(--accent); color: #06110F; }

        .copy-all-btn {
            background: rgba(var(--accent-rgb), 0.15);
            border: 1px solid rgba(var(--accent-rgb), 0.3);
            color: var(--text);
            padding: 8px 14px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            transition: all 0.25s;
            margin-bottom: 8px;
        }
        .copy-all-btn:hover { background: var(--accent); color: #06110F; }

        .qr-modern-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            flex-shrink: 0;
            margin: 0 4px;
            transition: border-color 0.2s;
        }
        .qr-modern-wrapper:hover { border-color: rgba(var(--accent-rgb), 0.4); }
        .qr-modern-wrapper img {
            width: 24px;
            height: 24px;
            display: block;
            border-radius: 4px;
        }

        /* ===== دانلود برنامه‌ها ===== */
        .download-os-tabs {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            background: var(--surface);
            padding: 6px;
            border-radius: 16px;
            margin-bottom: 24px;
            text-align: center;
            border: 1px solid var(--border);
            box-shadow: var(--box-shadow-light);
        }
        .os-tab-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            padding: 10px 4px;
            font-size: 12px;
            font-weight: bold;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.25s ease;
        }
        .os-tab-btn.active-tab {
            background-color: var(--accent);
            color: #06110F;
            box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
        }

        .client-card-item {
            background-color: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: var(--box-shadow-light);
        }
        .client-info-side { display: flex; align-items: center; gap: 12px; }
        html[dir="rtl"] .client-info-side { flex-direction: row; text-align: right; }
        html[dir="ltr"] .client-info-side { flex-direction: row-reverse; text-align: left; }
        .client-icon-box {
            width: 44px;
            height: 44px;
            background: var(--surface-alt);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: var(--text-muted);
        }
        .client-title-text { font-size: 14px; font-weight: 700; color: var(--text); }
        .client-subtitle-text { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .client-download-btn {
            background-color: rgba(var(--accent-rgb), 0.15);
            color: var(--accent);
            padding: 8px 18px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.2s ease;
        }
        .client-download-btn:hover { background-color: var(--accent); color: #06110F; }

        /* ===== مودال QR کد یک کانفیگ ===== */
        .config-qr-overlay {
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            z-index: 9999;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }
        .config-qr-overlay.show {
            opacity: 1;
            pointer-events: auto;
        }
        .config-qr-box {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 22px;
            padding: 24px;
            max-width: 320px;
            width: 100%;
            text-align: center;
            position: relative;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .config-qr-overlay.show .config-qr-box {
            transform: scale(1);
        }
        .config-qr-close {
            position: absolute;
            top: 14px;
            left: 14px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: none;
            background: var(--surface-alt);
            color: var(--text-muted);
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .config-qr-close:hover { background: rgba(var(--alert-rgb), 0.15); color: var(--alert); }
        .config-qr-remark {
            font-size: 14px;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 18px;
            margin-top: 6px;
            word-break: break-word;
        }
        .config-qr-img-wrap {
            background: #ffffff;
            border-radius: 16px;
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06);
        }
        .config-qr-img-wrap img {
            width: 220px;
            height: 220px;
            display: block;
        }

        /* ===== ناوبری پایین ===== */
        .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 480px;
            background-color: var(--nav-bg);
            border-top: 1px solid var(--border);
            padding: 12px 16px;
            display: flex;
            z-index: 100;
        }
        .nav-item-cell { flex: 1; display: flex; justify-content: center; }
        .nav-item {
            color: var(--text-muted);
            font-size: 11px;
            cursor: pointer;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            width: 100%;
            padding: 8px 0;
        }
        .nav-item i { font-size: 18px; }
        .nav-item.active {
            background-color: rgba(var(--accent-rgb), 0.12);
            border: 1px solid rgba(var(--accent-rgb), 0.25);
            border-radius: 16px;
            color: var(--accent);
        }

/* ===== Responsive multi-device layout ===== */
html, body { width: 100%; min-height: 100%; }
body { max-width: none; width: 100%; margin: 0; padding: 28px 24px 110px; }
.header, #screen-dashboard, #screen-download-apps { width: 100%; max-width: 1180px; margin-left: auto; margin-right: auto; }
.bottom-nav { max-width: 1180px; width: calc(100% - 48px); border: 1px solid var(--border); border-bottom: 0; border-radius: 18px 18px 0 0; }
@media (min-width: 769px) {
  #screen-dashboard { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(300px,.9fr); gap:16px; align-items:start; }
  #screen-dashboard > .subscription-card { grid-column:1/-1; }
  #screen-dashboard > .stats-card { grid-column:1; margin-bottom:0; }
  #screen-dashboard > .promo-card { grid-column:2; margin-bottom:0; height:100%; }
  #screen-dashboard > .details-grid { grid-column:1/-1; grid-template-columns:repeat(4,minmax(0,1fr)); }
  #screen-dashboard > .actions-grid { grid-column:1/-1; gap:12px; }
  #screen-dashboard > .action-dropdown-container, #screen-dashboard > .designer-card { grid-column:1/-1; }
  .subscription-card { min-height:180px; padding:28px 32px; }
  .progress-circle { width:132px; height:132px; }
  .progress-circle::after { width:108px; height:108px; }
  .days-left { font-size:42px; }
  .action-card { padding:20px 10px; }
  .action-label { font-size:12px; }
}
@media (min-width:1200px) { body{padding-left:40px;padding-right:40px;} .header,#screen-dashboard,#screen-download-apps{max-width:1280px;} .bottom-nav{max-width:1280px;width:calc(100% - 80px);} }
@media (min-width:481px) and (max-width:768px) { body{padding:24px 20px 105px;} .bottom-nav{width:calc(100% - 40px);} .details-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
@media (max-width:480px) { body{padding:16px 12px 96px;} .subscription-card{padding:20px 18px;} .progress-circle{width:92px;height:92px;} .progress-circle::after{width:74px;height:74px;} .days-left{font-size:30px;} .details-grid{gap:8px;} .action-card{padding:15px 2px;} .action-label{font-size:10px;} .bottom-nav{width:calc(100% - 24px);} }
@media (max-width:360px) { body{padding-left:8px;padding-right:8px;} .subscription-card{padding:17px 13px;} .progress-circle{width:82px;height:82px;} .progress-circle::after{width:66px;height:66px;} .days-left{font-size:26px;} }
@media (max-height:520px) and (orientation:landscape) { body{padding-bottom:88px;} .subscription-card{min-height:145px;} }
</style>
</head>
<body>

    <svg style="position: absolute; width: 0; height: 0;" width="0" height="0">
        <defs>
            <linearGradient id="premiumPurpleNeon" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#5EEAD4"/>
                <stop offset="50%" stop-color="#2DD4BF"/>
                <stop offset="100%" stop-color="#0F9E90"/>
            </linearGradient>
        </defs>
    </svg>

    <div class="header">
        <div class="profile-container">
            <div class="profile-img-wrapper">
                <div class="profile-img" id="profile-img">
                    <svg class="default-avatar-svg" id="default-avatar" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                </div>
                <div class="online-dot" id="online-status-dot"></div>
                <span class="online-status-text" id="online-status-text">آفلاین</span>
            </div>
            <div class="user-info">
                <div class="user-name" id="user-name"></div>
            </div>
        </div>

        <div class="header-icons">
            <div class="lang-container">
                <div class="header-icon" id="lang-toggle-btn">
                    <span class="lang-btn"><i class="fa-solid fa-globe"></i> <span id="lang-text">FA</span></span>
                </div>
                <div class="lang-dropdown-menu" id="lang-dropdown">
                    <div class="lang-dropdown-item" onclick="selectLanguage('fa')">فارسی</div>
                    <div class="lang-dropdown-item" onclick="selectLanguage('en')">English</div>
                    <div class="lang-dropdown-item" onclick="selectLanguage('tr')">Türkçe</div>
                    <div class="lang-dropdown-item" onclick="selectLanguage('ar')">العربية</div>
                </div>
            </div>
            <div class="header-icon" id="theme-toggle">
                <i class="fa-solid fa-moon" id="theme-icon"></i>
            </div>
        </div>
    </div>

    <div id="screen-dashboard" class="app-screen active-screen">
        <!-- کارت اشتراک -->
        <div class="subscription-card" id="main-sub-card">
            <div class="status-right">
                <div class="active-badge">
                    <span class="status-dot-green" id="status-indicator-dot"><i class="fa-solid fa-check" id="status-icon-mark"></i></span>
                    <span id="badge-text">فعال</span>
                </div>
                <div class="days-left en-font" id="live-days-count">0 <span id="days-label">روز</span></div>
                <div class="expire-date" id="expire-date">تاریخ انقضا: --</div>
            </div>
            <div class="status-left">
                <div class="progress-circle" id="sub-progress-circle">
                    <div class="radar-sweep"></div>
                    <div class="progress-text">
                        <span class="percent en-font" id="live-percent-display">0%</span>
                        <span class="label" id="remaining-label">باقی‌مانده</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- کارت آمار -->
        <div class="stats-card">
            <div class="stat-item">
                <div class="stat-header-row">
                    <div class="stat-icon-wrapper"><i class="fa-solid fa-database" style="color: #4C8DFF;"></i></div>
                    <div class="stat-title" id="title-limit">حجم کلی</div>
                </div>
                <div class="stat-value purple-value en-font" id="stat-limit">0 GB</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <div class="stat-header-row">
                    <div class="stat-icon-wrapper"><i class="fa-solid fa-chart-pie" style="color: #2DD4BF;"></i></div>
                    <div class="stat-title" id="title-total">مصرف کل</div>
                </div>
                <div class="stat-value en-font" id="stat-total-val">0 B</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
                <div class="stat-header-row">
                    <div class="stat-icon-wrapper"><i class="fa-solid fa-calendar-day" style="color: #4C8DFF;"></i></div>
                    <div class="stat-title" id="title-download">مصرف روزانه</div>
                </div>
                <div class="stat-value en-font" id="stat-dl-val">0 GB</div>
            </div>
        </div>

        <!-- کارت تبلیغاتی (فقط تلگرام) -->
        <div class="promo-card">
            <div class="promo-text">
                آیا نیاز به <span>خرید</span> یا <span>تمدید ساب</span> دارید؟<br>
                با پشتیبانی تماس بگیرید.
            </div>
            <div class="promo-buttons" style="justify-content: center;">
                <a href="__TG_CHANNEL__" target="_blank" class="promo-btn telegram">
                    <i class="fa-brands fa-telegram"></i> تلگرام
                </a>
            </div>
        </div>

        <!-- گرید جزئیات -->
        <div class="details-grid">
            <div class="detail-card">
                <span class="label" id="detail-total-label">مصرف کل</span>
                <span class="value" id="detail-total-value">0 B</span>
            </div>
            <div class="detail-card">
                <span class="label" id="detail-remaining-label">باقی‌مانده</span>
                <span class="value accent-value" id="detail-remaining-value">0%</span>
            </div>
            <div class="detail-card">
                <span class="label" id="detail-remaining-volume-label">حجم باقی‌مانده</span>
                <span class="value" id="detail-remaining-volume">نامحدود</span>
            </div>
            <div class="detail-card">
                <span class="label" id="detail-last-connect-label">آخرین اتصال</span>
                <span class="value" id="detail-last-connect-value">--</span>
            </div>
        </div>

        <!-- دکمه‌های عملیاتی -->
        <div class="actions-grid">
            <div class="action-cell">
                <div class="action-card renew" onclick="window.open('__TG_CHANNEL__', '_blank')">
                    <i class="fa-solid fa-battery-three-quarters"></i>
                    <div class="action-label" id="action-renew">تمدید ساب</div>
                </div>
            </div>
            <div class="action-cell">
                <div class="action-card link" id="btn-copy-sub">
                    <i class="fa-solid fa-link"></i>
                    <div class="action-label" id="action-copy">کپی لینک ساب</div>
                </div>
            </div>
            <div class="action-cell">
                <div class="action-card qr" id="btn-toggle-qr">
                    <i class="fa-solid fa-qrcode"></i>
                    <div class="action-label" id="action-qr">QR Code</div>
                </div>
            </div>
            <div class="action-cell">
                <div class="action-card config" id="btn-toggle-config">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                    <div class="action-label" id="action-config">کپی کانفیگ</div>
                </div>
            </div>
            <div class="action-cell">
                <div class="action-card" id="btn-radar">
                    <i class="fa-solid fa-satellite-dish" style="color: var(--accent-2);"></i>
                    <div class="action-label" id="action-radar">رادار</div>
                </div>
            </div>
        </div>

        <div class="action-dropdown-container" id="dropdown-qr-container">
            <div class="action-dropdown-menu" id="list-qr-ips">
                <span style="color:#6c6c8c;" id="qr-empty-msg">خالی</span>
            </div>
        </div>

        <div class="action-dropdown-container" id="dropdown-config-container">
            <div class="action-dropdown-menu" id="list-config-ips">
                <span style="color:#6c6c8c;" id="config-empty-msg">خالی</span>
            </div>
        </div>

        <div class="action-dropdown-container" id="dropdown-radar-container">
            <div class="action-dropdown-menu radar-panel" id="radar-panel">
                <div class="radar-head">
                    <span class="radar-title" id="radar-title">رادار آی‌پی تمیز</span>
                    <span class="radar-hint" id="radar-hint">کاملاً در مرورگر شما اجرا می‌شود</span>
                </div>
                <div class="radar-ports" id="radar-ports">
                    <span class="radar-port-chip active" data-port="443">443</span>
                    <span class="radar-port-chip" data-port="8443">8443</span>
                    <span class="radar-port-chip" data-port="2053">2053</span>
                    <span class="radar-port-chip" data-port="2083">2083</span>
                    <span class="radar-port-chip" data-port="2087">2087</span>
                    <span class="radar-port-chip" data-port="2096">2096</span>
                </div>
                <button class="radar-start-btn" id="radar-start-btn">
                    <i class="fa-solid fa-satellite-dish"></i> <span id="radar-start-label">شروع اسکن</span>
                </button>
                <div class="radar-progress-track">
                    <div class="radar-progress-bar" id="radar-progress-bar"></div>
                </div>
                <div class="radar-status" id="radar-status">آماده برای اسکن</div>
                <div class="radar-table-wrap" id="radar-table-wrap">
                    <table class="radar-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>IP</th>
                                <th id="radar-th-ping">تأخیر</th>
                                <th id="radar-th-jitter">جیتر</th>
                                <th id="radar-th-loss">لاس٪</th>
                            </tr>
                        </thead>
                        <tbody id="radar-results-body"></tbody>
                    </table>
                </div>
                <div class="radar-best" id="radar-best">
                    <div class="radar-best-label" id="radar-best-label">کانفیگ بهترین آی‌پی</div>
                    <div class="radar-best-row">
                        <input type="text" class="radar-best-input en-font" id="radar-best-link" readonly value="">
                        <button class="ip-copy-btn" id="radar-copy-btn">
                            <i class="fa-solid fa-copy"></i> <span id="radar-copy-label">کپی</span>
                        </button>
                    </div>
                    <div class="radar-best-note" id="radar-best-note"></div>
                </div>
            </div>
        </div>
    </div>

    <div id="screen-download-apps" class="app-screen">
        <div class="section-title" id="download-screen-title" style="margin-bottom: 16px;">دانلود برنامه ها</div>
        <div class="download-os-tabs">
            <div class="os-tab-btn active-tab" id="os-tab-android" onclick="switchDownloadTab('android')">
                <i class="fa-brands fa-android"></i> <span id="lbl-tab-android">اندروید</span>
            </div>
            <div class="os-tab-btn" id="os-tab-ios" onclick="switchDownloadTab('ios')">
                <i class="fa-brands fa-apple"></i> <span id="lbl-tab-ios">آیفون / آیپد</span>
            </div>
            <div class="os-tab-btn" id="os-tab-desktop" onclick="switchDownloadTab('desktop')">
                <i class="fa-solid fa-desktop"></i> <span id="lbl-tab-desktop">ویندوز / مک</span>
            </div>
        </div>
        <div class="client-card-item">
            <a href="#" id="btn-dl-client1" target="_blank" class="client-download-btn">دانلود</a>
            <div class="client-info-side">
                <div class="client-details">
                    <div class="client-title-text" id="title-client1">v2rayNG</div>
                    <div class="client-subtitle-text" id="sub-client1">کلاینت رسمی فروشگاه</div>
                </div>
                <div class="client-icon-box"><i class="fa-solid fa-paper-plane" id="icon-client1"></i></div>
            </div>
        </div>
        <div class="client-card-item">
            <a href="#" id="btn-dl-client2" target="_blank" class="client-download-btn">دانلود</a>
            <div class="client-info-side">
                <div class="client-details">
                    <div class="client-title-text" id="title-client2">Hiddify Next</div>
                    <div class="client-subtitle-text" id="sub-client2">کلاینت رسمی فروشگاه</div>
                </div>
                <div class="client-icon-box"><i class="fa-solid fa-shield-halved" id="icon-client2"></i></div>
            </div>
        </div>
        <div class="client-card-item">
            <a href="#" id="btn-dl-client3" target="_blank" class="client-download-btn">دانلود</a>
            <div class="client-info-side">
                <div class="client-details">
                    <div class="client-title-text" id="title-client3">sing-box</div>
                    <div class="client-subtitle-text" id="sub-client3">کلاینت رسمی فروشگاه</div>
                </div>
                <div class="client-icon-box"><i class="fa-solid fa-box-open" id="icon-client3"></i></div>
            </div>
        </div>
        <div class="client-card-item" id="client-card-4">
            <a href="#" id="btn-dl-client4" target="_blank" class="client-download-btn">دانلود</a>
            <div class="client-info-side">
                <div class="client-details">
                    <div class="client-title-text" id="title-client4">V2Box</div>
                    <div class="client-subtitle-text" id="sub-client4">کلاینت رسمی فروشگاه</div>
                </div>
                <div class="client-icon-box"><i class="fa-solid fa-cube" id="icon-client4"></i></div>
            </div>
        </div>
    </div>

    <!-- ===== مودال QR کد یک کانفیگ ===== -->
    <div class="config-qr-overlay" id="configQrOverlay" onclick="if(event.target===this) closeConfigQrModal()">
        <div class="config-qr-box">
            <button class="config-qr-close" onclick="closeConfigQrModal()"><i class="fa-solid fa-xmark"></i></button>
            <div class="config-qr-remark en-font" id="configQrRemark"></div>
            <div class="config-qr-img-wrap">
                <img id="configQrImage" src="" alt="QR Code" />
            </div>
        </div>
    </div>

    <div class="bottom-nav">
        <div class="nav-item-cell">
            <div class="nav-item active" id="nav-dashboard" onclick="navigateToScreen('dashboard')">
                <i class="fa-solid fa-house"></i>داشبورد
            </div>
        </div>
        <div class="nav-item-cell">
            <div class="nav-item" id="nav-download" onclick="navigateToScreen('download')">
                <i class="fa-solid fa-download"></i>دانلود برنامه
            </div>
        </div>
    </div>

    <script>
        // ===== داده‌های دریافتی از پنل =====
        // این مقادیر به‌صورت متن ساده توسط بک‌اند جایگزین می‌شوند.
        const panelData = {
            username: "__USER_NAME__",
            userId: "__USER_ID__",
            statusCode: "__STATUS_CODE__",       // active | paused | expired | limit | dailyLimit
            expiryDateText: "__EXPIRY_DATE__",   // متن آماده و فرمت‌شده از سمت سرور
            totalUsedGB: parseFloat("__TOTAL_GB__"),
            totalLimitGB: parseFloat("__LIMIT_TOTAL_GB__"),
            dailyUsedGB: parseFloat("__DAILY_GB__"),
            dailyLimitGB: parseFloat("__LIMIT_DAILY_GB__"),
            subUrl: "__SYNC_NORMAL__",
            subUrlBase64: "__SYNC_NORMAL_BASE64__",
            rawUrl: "__SYNC_RAW__"
        };

        // ===== متغیرهای سراسری =====
        let currentLang = 'fa';
        let isServerConnected = panelData.statusCode === 'active';

        // ===== توابع کمکی =====
        function decodeBase64Unicode(str) {
            const clean = str.replace(/-/g, '+').replace(/_/g, '/').trim();
            const binary = atob(clean);
            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        }

        let sanaeiClientData = {
            username: panelData.username,
            userId: panelData.userId,
            statusCode: panelData.statusCode,
            expiryDateText: panelData.expiryDateText,
            totalUsedGB: isNaN(panelData.totalUsedGB) ? 0 : panelData.totalUsedGB,
            totalLimitGB: isNaN(panelData.totalLimitGB) ? 0 : panelData.totalLimitGB,
            dailyUsedGB: isNaN(panelData.dailyUsedGB) ? 0 : panelData.dailyUsedGB,
            dailyLimitGB: isNaN(panelData.dailyLimitGB) ? 0 : panelData.dailyLimitGB,
            subUrl: panelData.subUrl,
            links: [],
            clientIp: null
        };

        function updateConnectionStatus() {
            isServerConnected = sanaeiClientData.statusCode === 'active';
        }
        updateConnectionStatus();

        // کانفیگ‌های خام را از __SYNC_RAW__ می‌گیریم
        async function loadConfigsFromRawEndpoint() {
            if (!panelData.rawUrl) return;
            try {
                const response = await fetch(panelData.rawUrl, { cache: 'no-store' });
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const base64Str = (await response.text()).trim();
                let decodedLinks = [];
                try {
                    decodedLinks = decodeBase64Unicode(base64Str).split('\\n').map(l => l.trim()).filter(Boolean);
                } catch (e) {
                    decodedLinks = base64Str.split('\\n').map(l => l.trim()).filter(Boolean);
                }
                sanaeiClientData.links = decodedLinks;
                renderActionMenus();
            } catch (error) {
                console.error("خطا در دریافت کانفیگ‌ها:", error);
            }
        }

        // فچ IP کاربر
        function loadClientIp() {
            fetch('https://api.ipify.org?format=json')
                .then(r => r.json())
                .then(d => { sanaeiClientData.clientIp = d.ip; renderPanelData(); })
                .catch(() => { sanaeiClientData.clientIp = null; renderPanelData(); });
        }

        const appDownloadLinks = {
            android: {
                c1: { name: "v2rayNG", url: "https://play.google.com/store/apps/details?id=com.v2ray.ang" },
                c2: { name: "Hiddify Next", url: "https://play.google.com/store/apps/details?id=fg.hiddify.com" },
                c3: { name: "KP2P / sing-box", url: "https://play.google.com/store/apps/details?id=io.nekohasekai.sfa" },
                c4: { name: "V2Box", url: "https://play.google.com/store/search?q=V2Box%20V2ray%20Client&c=apps" }
            },
            ios: {
                c1: { name: "FoXray", url: "https://apps.apple.com/us/app/foxray/id6448898375" },
                c2: { name: "Hiddify Next", url: "https://apps.apple.com/us/app/hiddify-next/id6473611382" },
                c3: { name: "sing-box", url: "https://apps.apple.com/us/app/sing-box/id6443657551" },
                c4: { name: "V2Box", url: "https://apps.apple.com/us/app/v2box-v2ray-client/id6446814690" }
            },
            desktop: {
                c1: { name: "v2rayN (Windows)", url: "https://github.com/2dust/v2rayN/releases" },
                c2: { name: "Hiddify (Win/Mac)", url: "https://apps.microsoft.com/detail/hiddify" },
                c3: { name: "NekoRay (Win/Linux)", url: "https://github.com/MatsuriDayo/nekoray/releases" }
            }
        };

        const waveIconHTML = \`
            <div class="wave-icon-wrapper">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 23h7.5c2.2 0 4-1.8 4-4v-7.5c0-.8-.7-1.5-1.5-1.5s-1.5.7-1.5 1.5V11h-.5V4.5c0-.8-.7-1.5-1.5-1.5S12 3.7 12 4.5V11h-.5V2.5c0-.8-.7-1.5-1.5-1.5S8.5 1.7 8.5 2.5V11h-.5V5.5c0-.8-.7-1.5-1.5-1.5S5 4.7 5 5.5v10.3c-.6-.7-1.5-1.1-2.4-.9-.9.2-1.5 1.1-1.4 2 .2 1.9 2 4.2 3.8 5.4C5.7 22.7 6.3 23 7 23z" fill="url(#premiumPurpleNeon)"/>
                </svg>
            </div>\`;

        const locales = {
            fa: {
                dir: "rtl", greet: "سلام ", badgeActive: "فعال", badgeInactive: "غیرفعال",
                badgePaused: "متوقف", badgeExpired: "منقضی", badgeLimit: "اتمام حجم", badgeDailyLimit: "اتمام حجم روزانه",
                detailUserIdLabel: "شناسه کاربری",
                daysUnit: "روز", remainingLabel: "باقی‌مانده", titleLimit: "حجم کلی", titleTotal: "مصرف کل",
                titleDownload: "مصرف روزانه",
                detailTotal: "مصرف کل", detailRemaining: "باقی‌مانده", detailRemainingVolume: "حجم باقی‌مانده", detailLastConnect: "IP اتصال",
                actionRenew: "تمدید ساب", actionCopy: "کپی لینک ساب", actionCopied: "کپی شد!",
                actionQr: "QR Code", actionConfig: "کپی کانفیگ", copyAllBtn: "کپی همه کانفیگ‌ها",
                navDashboard: "<i class='fa-solid fa-house'></i>داشبورد", navDownload: "<i class='fa-solid fa-download'></i>دانلود برنامه",
                dlScreenTitle: "دانلود برنامه ها", dlSubtitle: "کلاینت رسمی فروشگاه", btnDl: "دانلود",
                tabAndroid: "اندروید", tabIos: "آیفون / آیپد", tabDesktop: "ویندوز / مک",
                expiredText: "منقضی", unlimitedText: "نامحدود", emptyConfigs: "خالی", copyBtnText: "کپی", showQrBtn: "نمایش QR",
                lastConnectUnknown: "--", onlineText: "آنلاین", offlineText: "آفلاین",
                promoText: "آیا نیاز به <span>خرید</span> یا <span>تمدید ساب</span> دارید؟<br>با پشتیبانی تماس بگیرید.",
                promoTelegram: "تلگرام",
                actionRadar: "رادار",
                radarTitle: "رادار آی‌پی تمیز", radarHint: "کاملاً در مرورگر شما اجرا می‌شود",
                radarStart: "شروع اسکن", radarStop: "توقف", radarStatusReady: "آماده برای اسکن",
                radarStatusScan: "در حال اسکن... {done} از {total} - یافت‌شده: {found}",
                radarStatusDone: "پایان اسکن - {found} آی‌پی سالم یافت شد",
                radarStatusNoPort: "حداقل یک پورت را انتخاب کنید",
                radarStatusNoResult: "آی‌پی سالمی یافت نشد",
                radarStatusNoConfig: "کانفیگ vless در این ساب یافت نشد",
                radarThPing: "تأخیر", radarThJitter: "جیتر", radarThLoss: "لاس٪",
                radarBestLabel: "کانفیگ بهترین آی‌پی", radarBestNote: "پورت برتر: {port}"
            },
            en: {
                dir: "ltr", greet: "Hello ", badgeActive: "Active", badgeInactive: "Inactive",
                badgePaused: "Paused", badgeExpired: "Expired", badgeLimit: "Limit Exceeded", badgeDailyLimit: "Daily Limit Exceeded",
                detailUserIdLabel: "User ID",
                daysUnit: "Days", remainingLabel: "Remaining", titleLimit: "Total Limit", titleTotal: "Total Usage",
                titleDownload: "Daily Usage",
                detailTotal: "Total Usage", detailRemaining: "Remaining", detailRemainingVolume: "Remaining Volume", detailLastConnect: "Connection IP",
                actionRenew: "Renew", actionCopy: "Copy Sub Link", actionCopied: "Copied!",
                actionQr: "QR Code", actionConfig: "Copy Config", copyAllBtn: "Copy All Configs",
                navDashboard: "<i class='fa-solid fa-house'></i>Dashboard", navDownload: "<i class='fa-solid fa-download'></i>App",
                dlScreenTitle: "Download Clients", dlSubtitle: "Official Store Client", btnDl: "Get App",
                tabAndroid: "Android", tabIos: "iPhone / iPad", tabDesktop: "Win / Mac",
                expiredText: "Expired", unlimitedText: "Unlimited", emptyConfigs: "Empty", copyBtnText: "Copy", showQrBtn: "Show QR",
                lastConnectUnknown: "--", onlineText: "Online", offlineText: "Offline",
                promoText: "Need to <span>buy</span> or <span>renew</span> your subscription?<br>Contact support.",
                promoTelegram: "Telegram",
                actionRadar: "Radar",
                radarTitle: "Clean IP Radar", radarHint: "Runs entirely in your browser",
                radarStart: "Start Scan", radarStop: "Stop", radarStatusReady: "Ready to scan",
                radarStatusScan: "Scanning... {done} of {total} - found: {found}",
                radarStatusDone: "Scan finished - {found} healthy IPs found",
                radarStatusNoPort: "Select at least one port",
                radarStatusNoResult: "No healthy IP found",
                radarStatusNoConfig: "No vless config found in this subscription",
                radarThPing: "Ping", radarThJitter: "Jitter", radarThLoss: "Loss%",
                radarBestLabel: "Best IP config", radarBestNote: "Winning port: {port}"
            },
            tr: {
                dir: "ltr", greet: "Merhaba ", badgeActive: "Aktif", badgeInactive: "Pasif",
                badgePaused: "Duraklatıldı", badgeExpired: "Süresi Doldu", badgeLimit: "Kota Doldu", badgeDailyLimit: "Günlük Kota Doldu",
                detailUserIdLabel: "Kullanıcı ID",
                daysUnit: "Gün", remainingLabel: "Kalan", titleLimit: "Toplam Kota", titleTotal: "Toplam",
                titleDownload: "Günlük Kullanım",
                detailTotal: "Toplam", detailRemaining: "Kalan", detailRemainingVolume: "Kalan Hacim", detailLastConnect: "Bağlantı IP'si",
                actionRenew: "Yenile", actionCopy: "Sub Linki Kopyala", actionCopied: "Kopyalandı!",
                actionQr: "QR Kodu", actionConfig: "Konfig Kopyala", copyAllBtn: "Tüm Konfigleri Kopyala",
                navDashboard: "<i class='fa-solid fa-house'></i>Panel", navDownload: "<i class='fa-solid fa-download'></i>Uygulama",
                dlScreenTitle: "Uygulamaları İndir", dlSubtitle: "Resmi Mağaza İstemcisi", btnDl: "İndir",
                tabAndroid: "Android", tabIos: "iPhone / iPad", tabDesktop: "Win / Mac",
                expiredText: "Süresi Doldu", unlimitedText: "Sınırsız", emptyConfigs: "Boş", copyBtnText: "Kopyala", showQrBtn: "QR Göster",
                lastConnectUnknown: "--", onlineText: "Çevrimiçi", offlineText: "Çevrimdışı",
                promoText: "Aboneliğinizi <span>satın</span> veya <span>yenile</span> mi gerekiyor?<br>Destek ile iletişime geçin.",
                promoTelegram: "Telegram",
                actionRadar: "Radar",
                radarTitle: "Temiz IP Radarı", radarHint: "Tamamen tarayıcınızda çalışır",
                radarStart: "Taramayı Başlat", radarStop: "Durdur", radarStatusReady: "Taramaya hazır",
                radarStatusScan: "Taranıyor... {done} / {total} - bulunan: {found}",
                radarStatusDone: "Tarama bitti - {found} sağlıklı IP bulundu",
                radarStatusNoPort: "En az bir port seçin",
                radarStatusNoResult: "Sağlıklı IP bulunamadı",
                radarStatusNoConfig: "Bu abonelikte vless konfigi bulunamadı",
                radarThPing: "Gecikme", radarThJitter: "Jitter", radarThLoss: "Kayıp%",
                radarBestLabel: "En iyi IP konfigi", radarBestNote: "Kazanan port: {port}"
            },
            ar: {
                dir: "rtl", greet: "أهلاً ", badgeActive: "نشط", badgeInactive: "غير نشط",
                badgePaused: "متوقف", badgeExpired: "منتهي", badgeLimit: "تجاوز الحد", badgeDailyLimit: "تجاوز الحد اليومي",
                detailUserIdLabel: "معرّف المستخدم",
                daysUnit: "يوم", remainingLabel: "المتبقي", titleLimit: "الحجم الكلي", titleTotal: "الإجمالي",
                titleDownload: "الاستخدام اليومي",
                detailTotal: "الإجمالي", detailRemaining: "المتبقي", detailRemainingVolume: "الحجم المتبقي", detailLastConnect: "عنوان IP",
                actionRenew: "تجديد", actionCopy: "نسخ رابط الساب", actionCopied: "تم النسخ!",
                actionQr: "رمز QR", actionConfig: "نسخ التكوين", copyAllBtn: "نسخ كل التكوينات",
                navDashboard: "<i class='fa-solid fa-house'></i>الرئيسية", navDownload: "<i class='fa-solid fa-download'></i>التطبيق",
                dlScreenTitle: "تحميل التطبيقات", dlSubtitle: "عميل المتجر الرسمي", btnDl: "تحميل",
                tabAndroid: "أندروید", tabIos: "آيفون / آيباد", tabDesktop: "ویندوز / ماک",
                expiredText: "منتهي", unlimitedText: "غير محدود", emptyConfigs: "خالي", copyBtnText: "نسخ", showQrBtn: "عرض QR",
                lastConnectUnknown: "--", onlineText: "متصل", offlineText: "غير متصل",
                promoText: "هل تحتاج إلى <span>شراء</span> أو <span>تجديد</span> اشتراكك؟<br>اتصل بالدعم.",
                promoTelegram: "تيليجرام",
                actionRadar: "الرادار",
                radarTitle: "رادار الآي‌بي النظيف", radarHint: "يعمل بالكامل داخل متصفحك",
                radarStart: "بدء الفحص", radarStop: "إيقاف", radarStatusReady: "جاهز للفحص",
                radarStatusScan: "جارٍ الفحص... {done} من {total} - تم العثور: {found}",
                radarStatusDone: "انتهى الفحص - تم العثور على {found} آي‌بي سليم",
                radarStatusNoPort: "اختر منفذًا واحدًا على الأقل",
                radarStatusNoResult: "لم يتم العثور على آي‌بي سليم",
                radarStatusNoConfig: "لا يوجد تكوين vless في هذا الاشتراك",
                radarThPing: "التأخير", radarThJitter: "التذبذب", radarThLoss: "الفقد٪",
                radarBestLabel: "تكوين أفضل آي‌بي", radarBestNote: "المنفذ الفائز: {port}"
            }
        };

        // ===== توابع اصلی =====
        function isUserOnline() {
            return isServerConnected;
        }

        function renderAll() {
            renderPanelData();
            renderActionMenus();
            updateOnlineStatus();
            updatePageTitle();
        }

        function getColorForPercentage(percent) {
            if (percent >= 50) return 'var(--accent)';
            if (percent >= 20) return 'var(--warn)';
            return 'var(--alert)';
        }

        function getRingColorForState(statusCode, percentRemaining) {
            if (statusCode !== 'active') return 'var(--alert)';
            return getColorForPercentage(percentRemaining);
        }

        function getStatusOverrideText(statusCode, data) {
            switch (statusCode) {
                case 'expired': return data.expiredText;
                case 'paused': return data.badgePaused;
                case 'limit': return data.badgeLimit;
                case 'dailyLimit': return data.badgeDailyLimit;
                default: return null;
            }
        }

        function isUnlimitedGB(value) {
            return value === 9999;
        }

        function calculateDaysLeftFromExpiryText(expiryText) {
            if (!expiryText || expiryText.trim() === '') return null;
            const parsed = new Date(expiryText);
            if (isNaN(parsed.getTime())) return undefined;
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfExpiry = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
            return Math.round((startOfExpiry - startOfToday) / (1000 * 60 * 60 * 24));
        }

        function renderPanelData() {
            const data = locales[currentLang] || locales.fa;

            const username = sanaeiClientData.username;
            const isOnline = isUserOnline();
            const usernameClass = isOnline ? 'username-text online' : 'username-text';
            document.getElementById("user-name").innerHTML = \`
                \${waveIconHTML}
                <span class="greeting-text">\${data.greet}</span>
                <span class="\${usernameClass}">\${username}</span>
            \`;

            const statusOverrideText = getStatusOverrideText(sanaeiClientData.statusCode, data);
            const rawExpiryText = (sanaeiClientData.expiryDateText || '').trim();

            document.getElementById("expire-date").innerText = rawExpiryText || data.unlimitedText;

            if (statusOverrideText) {
                document.getElementById("live-days-count").innerHTML = \`<span style="font-size:22px; color:var(--alert);">\${statusOverrideText}</span>\`;
            } else {
                const daysLeft = calculateDaysLeftFromExpiryText(rawExpiryText);
                if (daysLeft === null) {
                    document.getElementById("live-days-count").innerHTML = \`<span style="font-size:22px;">\${data.unlimitedText}</span>\`;
                } else if (daysLeft === undefined) {
                    document.getElementById("live-days-count").innerHTML = \`<span class="en-font" style="font-size:18px;">\${rawExpiryText}</span>\`;
                } else if (daysLeft < 0) {
                    document.getElementById("live-days-count").innerHTML = \`<span style="font-size:22px; color:var(--alert);">\${data.expiredText}</span>\`;
                } else {
                    document.getElementById("live-days-count").innerHTML = \`\${daysLeft} <span id="days-label">\${data.daysUnit}</span>\`;
                }
            }

            const totalLimitGB = sanaeiClientData.totalLimitGB;
            const totalUsedGB = sanaeiClientData.totalUsedGB;
            const dailyUsedGB = sanaeiClientData.dailyUsedGB;
            const totalLimitIsUnlimited = totalLimitGB <= 0 || isUnlimitedGB(totalLimitGB);

            document.getElementById("stat-limit").innerText = totalLimitIsUnlimited ? data.unlimitedText : (totalUsedGB.toFixed(2) === "0.00" && totalLimitGB === 0 ? data.unlimitedText : totalLimitGB + " GB");
            document.getElementById("stat-total-val").innerText = totalUsedGB + " GB";
            document.getElementById("stat-dl-val").innerText = dailyUsedGB + " GB";

            document.getElementById("detail-total-value").innerText = totalUsedGB + " GB";

            let percentRemaining = 100;
            let remainingVolume = totalLimitGB - totalUsedGB;
            if (!totalLimitIsUnlimited) {
                let percentUsage = (totalUsedGB / totalLimitGB) * 100;
                percentRemaining = Math.round(100 - percentUsage);
                if (percentRemaining < 0) percentRemaining = 0;
                if (percentRemaining > 100) percentRemaining = 100;
            }
            document.getElementById("detail-remaining-value").innerText = percentRemaining + '%';

            if (!totalLimitIsUnlimited && !isUnlimitedGB(Math.round(remainingVolume))) {
                document.getElementById("detail-remaining-volume").innerText = remainingVolume > 0 ? (remainingVolume.toFixed(2) + " GB") : '0 GB';
            } else {
                document.getElementById("detail-remaining-volume").innerText = data.unlimitedText;
            }

            document.getElementById("detail-last-connect-value").innerText = sanaeiClientData.clientIp || data.lastConnectUnknown;

            const percentTextEl = document.getElementById("live-percent-display");
            if (totalLimitIsUnlimited) {
                percentTextEl.textContent = "∞";
            } else {
                percentTextEl.textContent = percentRemaining + "%";
            }
            percentTextEl.style.color = (sanaeiClientData.statusCode === 'active') ? '' : 'var(--alert)';

            const ringColor = getRingColorForState(sanaeiClientData.statusCode, percentRemaining);
            const ringPercent = totalLimitIsUnlimited ? 100 : percentRemaining;
            document.getElementById("sub-progress-circle").style.background = \`conic-gradient(\${ringColor} 0% \${ringPercent}%, var(--ring-track) \${ringPercent}% 100%)\`;
            updateStatusUI();
        }

        function updateOnlineStatus() {
            const data = locales[currentLang] || locales.fa;
            const dot = document.getElementById('online-status-dot');
            const statusText = document.getElementById('online-status-text');
            const usernameElement = document.querySelector('.username-text');
            const profileImg = document.getElementById('profile-img');

            const isOnline = isUserOnline();

            if (isOnline && isServerConnected) {
                dot.classList.add('online');
                statusText.innerText = data.onlineText;
                statusText.classList.remove('offline');
                if (usernameElement) usernameElement.classList.add('online');
                profileImg.classList.add('online');
            } else {
                dot.classList.remove('online');
                statusText.innerText = data.offlineText;
                statusText.classList.add('offline');
                if (usernameElement) usernameElement.classList.remove('online');
                profileImg.classList.remove('online');
            }
        }

        function updateStatusUI() {
            const data = locales[currentLang] || locales.fa;
            const card = document.getElementById("main-sub-card");
            const badgeText = document.getElementById("badge-text");
            const iconMark = document.getElementById("status-icon-mark");

            const statusMap = {
                active: { text: data.badgeActive, icon: "fa-solid fa-check", disconnected: false },
                paused: { text: data.badgePaused, icon: "fa-solid fa-pause", disconnected: true },
                expired: { text: data.badgeExpired, icon: "fa-solid fa-xmark", disconnected: true },
                limit: { text: data.badgeLimit, icon: "fa-solid fa-triangle-exclamation", disconnected: true },
                dailyLimit: { text: data.badgeDailyLimit, icon: "fa-solid fa-triangle-exclamation", disconnected: true }
            };
            const s = statusMap[sanaeiClientData.statusCode] || statusMap.active;

            card.classList.toggle("disconnected", s.disconnected);
            badgeText.innerText = s.text;
            iconMark.className = s.icon;
        }

        function updatePageTitle() {
            const titleEl = document.getElementById('page-title');
            const username = sanaeiClientData.username || 'VPN Dashboard';
            titleEl.textContent = username;
        }

        function parseConfigLink(rawLink) {
            const result = { protocol: 'unknown', remark: '', host: '', port: '', link: rawLink };
            try {
                const schemeMatch = rawLink.match(/^([a-zA-Z0-9]+):\\/\\//);
                if (!schemeMatch) return result;
                result.protocol = schemeMatch[1].toLowerCase();

                if (result.protocol === 'vmess') {
                    const b64 = rawLink.replace(/^vmess:\\/\\//, '');
                    const json = JSON.parse(decodeBase64Unicode(b64));
                    result.remark = json.ps || '';
                    result.host = json.add || '';
                    result.port = json.port || '';
                } else {
                    const u = new URL(rawLink);
                    result.remark = decodeURIComponent((u.hash || '').replace(/^#/, ''));
                    result.host = u.hostname || '';
                    result.port = u.port || '';
                }
            } catch (e) { /* ignore */ }
            return result;
        }

        function getProtocolDetails(link) {
            const parsed = parseConfigLink(link);
            if (parsed.protocol === 'vmess') {
                try {
                    const b64 = link.replace(/^vmess:\\/\\//, '');
                    const json = JSON.parse(decodeBase64Unicode(b64));
                    const net = json.net || 'tcp';
                    const security = json.tls === 'tls' ? 'tls' : (json.tls === 'reality' ? 'reality' : 'none');
                    return { parts: [parsed.protocol, net, security], full: \`\${parsed.protocol}+\${net}+\${security}\` };
                } catch (e) { return { parts: [parsed.protocol], full: parsed.protocol }; }
            } else if (parsed.protocol === 'vless' || parsed.protocol === 'trojan') {
                try {
                    const u = new URL(link);
                    const type = u.searchParams.get('type') || 'tcp';
                    const security = u.searchParams.get('security') || 'none';
                    return { parts: [parsed.protocol, type, security], full: \`\${parsed.protocol}+\${type}+\${security}\` };
                } catch (e) { return { parts: [parsed.protocol], full: parsed.protocol }; }
            } else if (parsed.protocol === 'ss') {
                try {
                    const b64 = link.replace(/^ss:\\/\\//, '').split('#')[0];
                    const decoded = atob(b64);
                    const parts = decoded.split(':');
                    const method = parts[0] || 'unknown';
                    return { parts: ['ss', method], full: \`ss+\${method}\` };
                } catch (e) { return { parts: [parsed.protocol], full: parsed.protocol }; }
            } else if (parsed.protocol === 'hysteria2' || parsed.protocol === 'hysteria') {
                try {
                    const u = new URL(link);
                    const security = u.searchParams.get('insecure') === '0' ? 'secure' : 'insecure';
                    return { parts: [parsed.protocol, security], full: \`\${parsed.protocol}+\${security}\` };
                } catch (e) { return { parts: [parsed.protocol], full: parsed.protocol }; }
            }
            return { parts: [parsed.protocol], full: parsed.protocol };
        }

        function extractCountryInfo(parsedConfig) {
            const remark = (parsedConfig.remark || parsedConfig.host || "").trim();
            const textWithoutFlagEmojis = remark.replace(/[\\u{1F1E0}-\\u{1F1FF}]/gu, '').trim();
            const dashParts = textWithoutFlagEmojis.split(/[-–—]/).map(p => p.trim()).filter(p => p);
            const pipeParts = textWithoutFlagEmojis.split('|').map(p => p.trim()).filter(p => p);
            const colonParts = textWithoutFlagEmojis.split(':').map(p => p.trim()).filter(p => p);

            let countryName = "";
            let cityName = "";

            if (dashParts.length >= 2) {
                countryName = dashParts[0];
                cityName = dashParts[1];
            } else if (pipeParts.length >= 2) {
                countryName = pipeParts[0];
                cityName = pipeParts[1];
            } else if (colonParts.length >= 2) {
                countryName = colonParts[0];
                cityName = colonParts[1];
            } else {
                countryName = textWithoutFlagEmojis || parsedConfig.host || "Unknown";
                cityName = parsedConfig.host || "";
            }

            let countryCode = "";
            if (remark) {
                const flagMatch = remark.match(/[\\u{1F1E0}-\\u{1F1FF}]{2}/gu);
                if (flagMatch) {
                    const codePoints = [...flagMatch[0]];
                    countryCode = String.fromCodePoint(
                        codePoints[0].codePointAt(0) - 0x1F1E6 + 0x61,
                        codePoints[1].codePointAt(0) - 0x1F1E6 + 0x61
                    );
                }
            }

            if (!countryCode && countryName) {
                try {
                    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
                    const commonCodes = ['de', 'nl', 'fr', 'gb', 'us', 'ca', 'tr', 'ae', 'sg', 'jp',
                        'fi', 'se', 'no', 'ch', 'it', 'es', 'pt', 'pl', 'ru', 'ua',
                        'ir', 'cn', 'hk', 'tw', 'kr', 'in', 'br', 'ar', 'au', 'at',
                        'be', 'dk', 'gr', 'ie', 'il', 'mx', 'nz', 'za'
                    ];
                    const lowerCountry = countryName.toLowerCase();
                    for (const code of commonCodes) {
                        if (regionNames.of(code).toLowerCase() === lowerCountry) {
                            countryCode = code;
                            break;
                        }
                    }
                } catch (e) {
                    countryCode = countryName.substring(0, 2).toLowerCase();
                }
            }

            if (!countryCode || countryCode.length !== 2) countryCode = 'unknown';
            return {
                countryName: countryName || "Unknown",
                countryCode: countryCode,
                cityName: cityName || parsedConfig.host || "",
                host: parsedConfig.host || ""
            };
        }

        function formatBytes(bytes) {
            if (bytes === 0) return "0 B";
            if (bytes < 0 || bytes === undefined || bytes === null) return "---";
            const k = 1024;
            const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
        }

        // ===== مودال QR کد یک کانفیگ =====
        function showConfigQrModal(link, remark) {
            const overlay = document.getElementById('configQrOverlay');
            const img = document.getElementById('configQrImage');
            const remarkEl = document.getElementById('configQrRemark');
            remarkEl.textContent = remark || '';
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(link);
            overlay.classList.add('show');
        }

        function closeConfigQrModal() {
            const overlay = document.getElementById('configQrOverlay');
            overlay.classList.remove('show');
        }

        function renderActionMenus() {
            const data = locales[currentLang] || locales.fa;
            const links = sanaeiClientData.links || [];

            const qrContainer = document.getElementById("list-qr-ips");
            const configContainer = document.getElementById("list-config-ips");

            function buildProtocolBadge(protocolDetails) {
                const parts = protocolDetails.parts || [];
                if (parts.length === 0) return '';
                return parts.map((part, idx) => {
                    let cls = '';
                    if (parts.length >= 3) {
                        if (idx === 0) cls = 'proto-part-1';
                        else if (idx === 1) cls = 'proto-part-2';
                        else cls = 'proto-part-3';
                    } else if (parts.length === 2) {
                        if (idx === 0) cls = 'proto-part-1';
                        else cls = 'proto-part-2';
                    } else {
                        cls = 'proto-part-1';
                    }
                    return \`<span class="\${cls}">\${part}</span>\`;
                }).join('<span style="color: rgba(255,255,255,0.4); margin: 0 1px;">+</span>');
            }

            function buildQrItem(parsed) {
                const flagInfo = extractCountryInfo(parsed);
                const flagUrl = flagInfo.countryCode !== 'unknown' ? \`https://flagcdn.com/w80/\${flagInfo.countryCode}.png\` : '';
                const flagHtml = flagUrl
                    ? \`<div class="action-mini-flag" style="background-image: url('\${flagUrl}');"></div>\`
                    : \`<div class="action-mini-flag" style="background: #2C2C3E; display: flex; align-items: center; justify-content: center; color: #6c6c8c;"><i class="fa-solid fa-globe"></i></div>\`;

                const protocolDetails = getProtocolDetails(parsed.link);
                const item = document.createElement("div");
                item.className = "ip-row-item";
                item.innerHTML = \`
                    <div class="ip-details-left">
                        \${flagHtml}
                        <div class="ip-meta-block">
                            <div class="ip-address-text en-font">\${parsed.remark || parsed.host}</div>
                            <div>
                                <span class="ip-protocol-badge-box en-font">\${buildProtocolBadge(protocolDetails)}</span>
                            </div>
                        </div>
                    </div>
                    <button class="ip-copy-btn ip-show-qr-btn" data-config-link="\${encodeURIComponent(parsed.link)}" data-config-remark="\${encodeURIComponent(parsed.remark || parsed.host)}">
                        <i class="fa-solid fa-qrcode"></i> \${data.showQrBtn}
                    </button>
                \`;

                const qrBtn = item.querySelector('.ip-show-qr-btn');
                qrBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const link = decodeURIComponent(this.getAttribute('data-config-link'));
                    const remark = decodeURIComponent(this.getAttribute('data-config-remark'));
                    showConfigQrModal(link, remark);
                });

                return item;
            }

            function buildConfigItem(parsed) {
                const flagInfo = extractCountryInfo(parsed);
                const flagUrl = flagInfo.countryCode !== 'unknown' ? \`https://flagcdn.com/w80/\${flagInfo.countryCode}.png\` : '';
                const flagHtml = flagUrl
                    ? \`<div class="action-mini-flag" style="background-image: url('\${flagUrl}');"></div>\`
                    : \`<div class="action-mini-flag" style="background: #2C2C3E; display: flex; align-items: center; justify-content: center; color: #6c6c8c;"><i class="fa-solid fa-globe"></i></div>\`;

                const protocolDetails = getProtocolDetails(parsed.link);
                const item = document.createElement("div");
                item.className = "ip-row-item";
                item.innerHTML = \`
                    <div class="ip-details-left">
                        \${flagHtml}
                        <div class="ip-meta-block">
                            <div class="ip-address-text en-font">\${parsed.remark || parsed.host}</div>
                            <div>
                                <span class="ip-protocol-badge-box en-font">\${buildProtocolBadge(protocolDetails)}</span>
                            </div>
                        </div>
                    </div>
                    <button class="ip-copy-btn" data-config-text="\${encodeURIComponent(parsed.link)}">
                        <i class="fa-solid fa-copy"></i> \${data.copyBtnText}
                    </button>
                \`;

                const copyBtn = item.querySelector('.ip-copy-btn');
                copyBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const textToCopy = decodeURIComponent(this.getAttribute('data-config-text'));
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        this.innerHTML = \`<i class="fa-solid fa-check"></i> \${data.actionCopied}\`;
                        this.style.background = "#22C55E";
                        this.style.color = "#fff";
                        setTimeout(() => {
                            this.innerHTML = \`<i class="fa-solid fa-copy"></i> \${data.copyBtnText}\`;
                            this.style.background = "";
                            this.style.color = "";
                        }, 2000);
                    });
                });

                return item;
            }

            qrContainer.innerHTML = "";
            configContainer.innerHTML = "";

            if (links.length === 0) {
                qrContainer.innerHTML = \`<span style="color:#6c6c8c;" id="qr-empty-msg">\${data.emptyConfigs}</span>\`;
                configContainer.innerHTML = \`<span style="color:#6c6c8c;" id="config-empty-msg">\${data.emptyConfigs}</span>\`;
            } else {
                const copyAllBtn = document.createElement("button");
                copyAllBtn.className = "copy-all-btn";
                copyAllBtn.innerHTML = \`<i class="fa-solid fa-copy"></i> \${data.copyAllBtn}\`;
                copyAllBtn.addEventListener('click', function() {
                    const allLinks = links.join('\\n');
                    navigator.clipboard.writeText(allLinks).then(() => {
                        this.innerHTML = \`<i class="fa-solid fa-check"></i> \${data.actionCopied}\`;
                        this.style.background = "#22C55E";
                        setTimeout(() => {
                            this.innerHTML = \`<i class="fa-solid fa-copy"></i> \${data.copyAllBtn}\`;
                            this.style.background = "";
                        }, 2000);
                    });
                });
                configContainer.appendChild(copyAllBtn);

                links.forEach(rawLink => {
                    const parsed = parseConfigLink(rawLink);
                    qrContainer.appendChild(buildQrItem(parsed));
                    configContainer.appendChild(buildConfigItem(parsed));
                });
            }
        }

        // ===== زبان و UI =====
        function selectLanguage(lang) {
            currentLang = lang;
            const data = locales[lang] || locales.fa;
            document.getElementById("lang-text").innerText = lang.toUpperCase();
            document.getElementById("html-root").setAttribute("dir", data.dir);

            document.getElementById("remaining-label").innerText = data.remainingLabel;
            document.getElementById("title-limit").innerText = data.titleLimit;
            document.getElementById("title-total").innerText = data.titleTotal;
            document.getElementById("title-download").innerText = data.titleDownload;

            document.getElementById("detail-total-label").innerText = data.detailTotal;
            document.getElementById("detail-remaining-label").innerText = data.detailRemaining;
            document.getElementById("detail-remaining-volume-label").innerText = data.detailRemainingVolume;
            document.getElementById("detail-last-connect-label").innerText = data.detailLastConnect;

            document.getElementById("action-renew").innerText = data.actionRenew;
            document.getElementById("action-copy").innerText = data.actionCopy;
            document.getElementById("action-qr").innerText = data.actionQr;
            document.getElementById("action-config").innerText = data.actionConfig;
            document.getElementById("action-radar").innerText = data.actionRadar;
            document.getElementById("radar-title").innerText = data.radarTitle;
            document.getElementById("radar-hint").innerText = data.radarHint;
            document.getElementById("radar-th-ping").innerText = data.radarThPing;
            document.getElementById("radar-th-jitter").innerText = data.radarThJitter;
            document.getElementById("radar-th-loss").innerText = data.radarThLoss;
            document.getElementById("radar-best-label").innerText = data.radarBestLabel;
            document.getElementById("radar-copy-label").innerText = data.copyBtnText;
            if (!radarRunning) {
                document.getElementById("radar-start-label").innerText = data.radarStart;
                document.getElementById("radar-status").innerText = data.radarStatusReady;
            }
            document.getElementById("download-screen-title").innerText = data.dlScreenTitle;
            document.getElementById("lbl-tab-android").innerText = data.tabAndroid;
            document.getElementById("lbl-tab-ios").innerText = data.tabIos;
            document.getElementById("lbl-tab-desktop").innerText = data.tabDesktop;

            document.querySelector('.promo-text').innerHTML = data.promoText;
            const promoBtns = document.querySelectorAll('.promo-btn');
            if (promoBtns.length >= 1) {
                promoBtns[0].innerHTML = \`<i class="fa-brands fa-telegram"></i> \${data.promoTelegram}\`;
            }

            document.getElementById("nav-dashboard").innerHTML = \`<i class='fa-solid fa-house'></i>\${data.navDashboard.replace(/<.*?>/g, '')}\`;
            document.getElementById("nav-download").innerHTML = \`<i class='fa-solid fa-download'></i>\${data.navDownload.replace(/<.*?>/g, '')}\`;

            renderAll();
        }

        // ===== رویدادها =====
        document.getElementById("btn-copy-sub").addEventListener("click", function(e) {
            e.stopPropagation();
            const data = locales[currentLang] || locales.fa;
            const linkToCopy = sanaeiClientData.subUrl || window.location.href;

            document.getElementById("dropdown-qr-container").classList.remove("show");
            document.getElementById("dropdown-config-container").classList.remove("show");

            navigator.clipboard.writeText(linkToCopy).then(() => {
                const labelNode = document.getElementById("action-copy");
                labelNode.innerText = data.actionCopied;
                labelNode.style.color = "#22C55E";
                setTimeout(() => {
                    labelNode.innerText = data.actionCopy;
                    labelNode.style.color = "";
                }, 2000);
            });
        });

        document.getElementById("btn-toggle-qr").addEventListener("click", function(e) {
            e.stopPropagation();
            document.getElementById("dropdown-config-container").classList.remove("show");
            document.getElementById("dropdown-radar-container").classList.remove("show");
            document.getElementById("dropdown-qr-container").classList.toggle("show");
        });

        document.getElementById("btn-toggle-config").addEventListener("click", function(e) {
            e.stopPropagation();
            document.getElementById("dropdown-qr-container").classList.remove("show");
            document.getElementById("dropdown-radar-container").classList.remove("show");
            document.getElementById("dropdown-config-container").classList.toggle("show");
        });

        // ===== رادار آی‌پی تمیز (کاملاً سمت مرورگر) =====
        const CF_RANGES = [['104.16.', 0, 255], ['104.17.', 0, 255], ['104.18.', 0, 255], ['104.19.', 0, 255], ['104.20.', 0, 255], ['104.21.', 0, 255], ['104.22.', 0, 255], ['104.24.', 0, 255], ['104.25.', 0, 255], ['104.26.', 0, 255], ['104.27.', 0, 255], ['162.159.', 0, 255], ['172.64.', 0, 255], ['172.66.', 0, 255], ['172.67.', 0, 255], ['188.114.', 96, 111], ['141.101.', 64, 127]];
        const RADAR_PORTS = [443, 8443, 2053, 2083, 2087, 2096];
        const RADAR_TIMEOUT = 2000;
        const RADAR_PROBES = 3;
        const RADAR_CONCURRENCY = 12;
        const RADAR_IP_COUNT = 140;
        const RADAR_KEEP = 8;

        let radarRunning = false;
        let radarCancelRequested = false;

        function randCfIp() {
            var r = CF_RANGES[Math.floor(Math.random() * CF_RANGES.length)];
            var c = r[1] + Math.floor(Math.random() * (r[2] - r[1] + 1));
            return r[0] + c + '.' + Math.floor(Math.random() * 256);
        }

        // هم onload و هم onerror یعنی «هاست جواب داد»؛ ما دسترسی و تأخیر را می‌سنجیم نه موفقیت تصویر.
        function pingIp(ip, port, timeout) {
            return new Promise(function(res) {
                var t0 = performance.now();
                var done = false;
                var img = new Image();
                function fin(ok) {
                    if (done) return;
                    done = true;
                    img.onerror = img.onload = null;
                    res(ok ? Math.round(performance.now() - t0) : null);
                }
                var timer = setTimeout(function() { fin(false); }, timeout);
                img.onerror = function() { clearTimeout(timer); fin(true); };
                img.onload = function() { clearTimeout(timer); fin(true); };
                img.src = 'https://' + (port == 443 ? ip : ip + ':' + port) + '/cdn-cgi/trace?' + Math.random();
            });
        }

        function radarSelectedPorts() {
            return Array.from(document.querySelectorAll('#radar-ports .radar-port-chip.active'))
                .map(function(el) { return parseInt(el.getAttribute('data-port'), 10); });
        }

        async function radarProbeIp(ip, ports) {
            for (let i = 0; i < ports.length; i++) {
                const port = ports[i];
                const samples = [];
                for (let p = 0; p < RADAR_PROBES; p++) {
                    if (radarCancelRequested) return null;
                    const rtt = await pingIp(ip, port, RADAR_TIMEOUT);
                    if (rtt !== null) samples.push(rtt);
                }
                if (samples.length === 0) continue;
                const avg = Math.round(samples.reduce(function(a, b) { return a + b; }, 0) / samples.length);
                const jitter = Math.max.apply(null, samples) - Math.min.apply(null, samples);
                const loss = Math.round((1 - samples.length / RADAR_PROBES) * 100);
                return { ip: ip, port: port, avg: avg, jitter: jitter, loss: loss, score: avg + jitter * 0.5 + loss * 20 };
            }
            return null;
        }

        function radarRenderResults(list) {
            const tbody = document.getElementById('radar-results-body');
            tbody.innerHTML = '';
            list.forEach(function(r, idx) {
                const tr = document.createElement('tr');
                if (idx === 0) tr.className = 'radar-row-best';
                tr.innerHTML = '<td>' + (idx + 1) + '</td>' +
                    '<td class="en-font">' + r.ip + '<span class="radar-port-tag">:' + r.port + '</span></td>' +
                    '<td class="en-font">' + r.avg + ' ms</td>' +
                    '<td class="en-font">' + r.jitter + '</td>' +
                    '<td class="en-font">' + r.loss + '%</td>';
                tbody.appendChild(tr);
            });
            document.getElementById('radar-table-wrap').classList.toggle('show', list.length > 0);
        }

        function radarFindVlessLink() {
            const links = sanaeiClientData.links || [];
            for (let i = 0; i < links.length; i++) {
                if (/^vless:\\/\\//i.test(links[i])) return links[i];
            }
            return null;
        }

        function radarBuildBestConfig(best) {
            const data = locales[currentLang] || locales.fa;
            const noteEl = document.getElementById('radar-best-note');
            document.getElementById('radar-best').classList.add('show');
            document.getElementById('radar-best-link').value = '';

            const sourceLink = radarFindVlessLink();
            if (!sourceLink) {
                noteEl.textContent = data.radarStatusNoConfig;
                return;
            }
            const uuidMatch = sourceLink.match(/^vless:\\/\\/([^@]+)@/i);
            const queryStart = sourceLink.indexOf('?');
            if (!uuidMatch || queryStart < 0) {
                noteEl.textContent = data.radarStatusNoConfig;
                return;
            }
            const uuid = uuidMatch[1];
            const afterQuery = sourceLink.slice(queryStart + 1);
            const hashIdx = afterQuery.indexOf('#');
            const query = hashIdx >= 0 ? afterQuery.slice(0, hashIdx) : afterQuery;

            const parsed = parseConfigLink(sourceLink);
            const baseName = (parsed.remark || sanaeiClientData.username || 'Sub').trim();
            const newLink = 'vless://' + uuid + '@' + best.ip + ':' + best.port + '?' + query + '#' + encodeURIComponent(baseName + ' - Radar');

            document.getElementById('radar-best-link').value = newLink;
            noteEl.textContent = data.radarBestNote.replace('{port}', best.port);
        }

        async function radarRun() {
            const data = locales[currentLang] || locales.fa;
            const statusEl = document.getElementById('radar-status');
            const startBtn = document.getElementById('radar-start-btn');

            if (radarRunning) {
                radarCancelRequested = true;
                return;
            }

            const ports = radarSelectedPorts();
            if (ports.length === 0) {
                statusEl.textContent = data.radarStatusNoPort;
                return;
            }

            radarRunning = true;
            radarCancelRequested = false;
            startBtn.classList.add('running');
            document.getElementById('radar-start-label').textContent = data.radarStop;
            document.getElementById('radar-best').classList.remove('show');
            document.getElementById('radar-best-note').textContent = '';
            document.getElementById('radar-results-body').innerHTML = '';
            document.getElementById('radar-table-wrap').classList.remove('show');
            document.getElementById('radar-progress-bar').style.width = '0%';
            statusEl.textContent = data.radarStatusScan.replace('{done}', '0').replace('{total}', RADAR_IP_COUNT).replace('{found}', '0');

            const ips = [];
            for (let i = 0; i < RADAR_IP_COUNT; i++) ips.push(randCfIp());

            const results = [];
            let cursor = 0;
            let doneCount = 0;

            async function worker() {
                while (cursor < ips.length) {
                    if (radarCancelRequested) return;
                    const ip = ips[cursor++];
                    const res = await radarProbeIp(ip, ports);
                    if (res) results.push(res);
                    doneCount++;
                    document.getElementById('radar-progress-bar').style.width = Math.round(doneCount / ips.length * 100) + '%';
                    statusEl.textContent = data.radarStatusScan
                        .replace('{done}', doneCount)
                        .replace('{total}', ips.length)
                        .replace('{found}', results.length);
                }
            }

            const workers = [];
            for (let w = 0; w < RADAR_CONCURRENCY; w++) workers.push(worker());
            await Promise.all(workers);

            results.sort(function(a, b) { return a.score - b.score; });
            const top = results.slice(0, RADAR_KEEP);
            radarRenderResults(top);

            if (top.length > 0) {
                statusEl.textContent = data.radarStatusDone.replace('{found}', results.length);
                radarBuildBestConfig(top[0]);
            } else {
                statusEl.textContent = data.radarStatusNoResult;
            }

            radarRunning = false;
            radarCancelRequested = false;
            startBtn.classList.remove('running');
            document.getElementById('radar-start-label').textContent = data.radarStart;
        }

        document.getElementById("btn-radar").addEventListener("click", function(e) {
            e.stopPropagation();
            document.getElementById("dropdown-qr-container").classList.remove("show");
            document.getElementById("dropdown-config-container").classList.remove("show");
            document.getElementById("dropdown-radar-container").classList.toggle("show");
        });

        document.getElementById("radar-start-btn").addEventListener("click", function(e) {
            e.stopPropagation();
            radarRun();
        });

        document.querySelectorAll('#radar-ports .radar-port-chip').forEach(function(chip) {
            chip.addEventListener('click', function(e) {
                e.stopPropagation();
                this.classList.toggle('active');
            });
        });

        document.getElementById("radar-copy-btn").addEventListener("click", function(e) {
            e.stopPropagation();
            const data = locales[currentLang] || locales.fa;
            const value = document.getElementById('radar-best-link').value;
            if (!value) return;
            const label = document.getElementById('radar-copy-label');
            navigator.clipboard.writeText(value).then(() => {
                label.textContent = data.actionCopied;
                this.style.background = "#22C55E";
                this.style.color = "#fff";
                setTimeout(() => {
                    label.textContent = data.copyBtnText;
                    this.style.background = "";
                    this.style.color = "";
                }, 2000);
            });
        });

        function navigateToScreen(screenName) {
            document.querySelectorAll('.app-screen').forEach(scr => scr.classList.remove('active-screen'));
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

            if (screenName === 'dashboard') {
                document.getElementById('screen-dashboard').classList.add('active-screen');
                document.getElementById('nav-dashboard').classList.add('active');
            } else if (screenName === 'download') {
                document.getElementById('screen-download-apps').classList.add('active-screen');
                document.getElementById('nav-download').classList.add('active');
                switchDownloadTab('android');
            }
        }

        function switchDownloadTab(os) {
            document.querySelectorAll('.os-tab-btn').forEach(btn => btn.classList.remove('active-tab'));
            document.getElementById(\`os-tab-\${os}\`).classList.add('active-tab');

            const currentLocale = locales[currentLang] || locales.fa;
            const data = appDownloadLinks[os];

            document.getElementById('title-client1').innerText = data.c1.name;
            document.getElementById('btn-dl-client1').href = data.c1.url;
            document.getElementById('sub-client1').innerText = currentLocale.dlSubtitle;

            document.getElementById('title-client2').innerText = data.c2.name;
            document.getElementById('btn-dl-client2').href = data.c2.url;
            document.getElementById('sub-client2').innerText = currentLocale.dlSubtitle;

            document.getElementById('title-client3').innerText = data.c3.name;
            document.getElementById('btn-dl-client3').href = data.c3.url;
            document.getElementById('sub-client3').innerText = currentLocale.dlSubtitle;

            const client4Card = document.getElementById('client-card-4');
            if (data.c4) {
                client4Card.style.display = '';
                document.getElementById('title-client4').innerText = data.c4.name;
                document.getElementById('btn-dl-client4').href = data.c4.url;
                document.getElementById('sub-client4').innerText = currentLocale.dlSubtitle;
            } else {
                client4Card.style.display = 'none';
            }

            document.querySelectorAll('.client-download-btn').forEach(btn => {
                btn.innerText = currentLocale.btnDl;
            });
        }

        // ===== راه‌اندازی اولیه =====
        document.addEventListener("DOMContentLoaded", () => {
            selectLanguage(currentLang);
            loadConfigsFromRawEndpoint();
            loadClientIp();
        });

        const langToggleBtn = document.getElementById("lang-toggle-btn");
        const langDropdown = document.getElementById("lang-dropdown");
        langToggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            langDropdown.classList.toggle("show");
        });

        document.addEventListener("click", () => {
            langDropdown.classList.remove("show");
            document.getElementById("dropdown-qr-container").classList.remove("show");
            document.getElementById("dropdown-config-container").classList.remove("show");
            document.getElementById("dropdown-radar-container").classList.remove("show");
        });

        const themeToggle = document.getElementById("theme-toggle");
        const themeIcon = document.getElementById("theme-icon");
        themeToggle.addEventListener("click", () => {
            document.body.classList.toggle("light-mode");
            themeIcon.className = document.body.classList.contains("light-mode") ? "fa-solid fa-sun" : "fa-solid fa-moon";
        });
    </script>
</body>
</html>
`;

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

  /* ═══════════════════════════════════════════════════════════════════════
     اتصال‌های زنده • قطعِ موقت • مسدودسازیِ آی‌پی
     ───────────────────────────────────────────────────────────────────────
     همه‌ی این مسیرها از همان مرجعی می‌خوانند که محدودساز روی آن تصمیم
     می‌گیرد (liveRowsDetailed)، پس عددِ گزارش با واقعیتِ رد شدن یکی است.
     ═══════════════════════════════════════════════════════════════════════ */

  if (route === 'connections' && m === 'GET') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    return json(await liveSessions(env, st));
  }

  if (route === 'connections/kick' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const uuid = String((b && b.uuid) || '').trim();
    const ip = String((b && b.ip) || '').trim();
    const connId = String((b && b.connId) || '').trim();
    if (!uuid && !connId) return json({ error: 'کاربر یا شناسه‌ی اتصال مشخص نشده است' }, 400);
    const r = await connKick(env, uuid, ip, connId);
    addLog(st, 'warn', 'core', 'قطع موقت اتصال',
      [uuid.slice(0, 8), ip].filter(Boolean).join(' • ') + ' • ' + fa(r.kicked) + ' مورد');
    await save(env, st);
    return json({
      ...r,
      msg: r.kicked
        ? fa(r.kicked) + ' اتصال قطع شد — سهمیه آزاد است و کاربر می‌تواند دوباره وصل شود'
        : 'هیچ اتصالِ زنده‌ای با این نشانی پیدا نشد (احتمالاً خودبه‌خود آزاد شده است)',
    });
  }

  /* مسدودسازی — دائم (hours=0) یا زمان‌دار (مثل ۱ یا ۲۴ ساعت).
     بلافاصله بعد از ثبت، نشست‌های در جریانِ همان آی‌پی هم بسته می‌شوند؛
     اثرِ آن بر اتصال‌های بعدی در connAcquire و بر اتصالِ فعلی در connRefresh
     (تمدیدِ مبتنی بر فعالیت) اعمال می‌شود — بدون هیچ تایمری. */
  if (route === 'connections/ban' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const ip = String((b && b.ip) || '').trim();
    if (!ip) return json({ error: 'آی‌پی برای مسدود کردن مشخص نشده است' }, 400);

    const raw = (b && b.hours !== undefined && b.hours !== null && b.hours !== '') ? b.hours : 0;
    const hours = Number(raw);
    if (!isFinite(hours) || hours < 0) {
      return json({ error: 'مدتِ مسدودسازی باید عددِ ساعت (مثل ۱ یا ۲۴) یا ۰ برای مسدودیِ دائم باشد' }, 400);
    }
    const res = await banAdd(env, ip, {
      uuid: (b && b.uuid) ? String(b.uuid).trim() : '',
      hours: Math.round(hours * 100) / 100,
      reason: (b && b.reason) ? String(b.reason) : '',
      createdBy: ipOf(req),
    });
    if (!res.ok) return json({ error: res.error }, 400);

    /* نشست‌های فعلیِ این آی‌پی را هم می‌بندیم — «مسدود شد» نباید تا قطع شدنِ
       خودشان صبر کند */
    const kicked = await connKick(env, '', ip, '');
    addLog(st, 'warn', 'core', res.permanent ? 'مسدودسازیِ دائم آی‌پی' : 'مسدودسازیِ موقت آی‌پی',
      ip + (res.permanent ? ' • دائم' : ' • ' + fa(res.hours) + ' ساعت') + ' • ' + fa(kicked.kicked) + ' اتصال بسته شد');
    await save(env, st);
    return json({
      ...res,
      kicked: kicked.kicked,
      msg: res.permanent
        ? 'آی‌پی ' + ip + ' برای همیشه مسدود شد'
        : 'آی‌پی ' + ip + ' تا ' + fa(res.hours) + ' ساعت دیگر مسدود شد',
    });
  }

  if (route === 'connections/unban' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const ip = String((b && b.ip) || '').trim();
    if (!ip) return json({ error: 'آی‌پی برای رفعِ مسدودی مشخص نشده است' }, 400);
    const res = await banRemove(env, ip);
    addLog(st, 'success', 'core', 'رفع مسدودی آی‌پی', ip);
    await save(env, st);
    return json({
      ...res,
      msg: res.removed
        ? 'مسدودیِ آی‌پی ' + ip + ' برداشته شد — حالا می‌تواند دوباره وصل شود'
        : 'این آی‌پی در فهرستِ سیاه نبود',
    });
  }

  if (route === 'connections/bans' && m === 'GET') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    /* منقضی‌شده‌ها اول پاک می‌شوند تا فهرست فقط مسدودی‌های جاری را نشان بدهد */
    await banSweep(env);
    return json(await banList(env));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     سرورهای خروجی VLESS (exit / outbound)
     ─────────────────────────────────────────────────────────────────────────
     فهرست/افزودن/ویرایش/حذف، تستِ اتصالِ هر سرور، و تعیینِ پیش‌فرضِ سراسری.
     انتخاب برای هر کانفیگ (کاربر) همین‌جا و با op: 'select' انجام می‌شود.
     ═══════════════════════════════════════════════════════════════════════ */

  if (route === 'exits' && m === 'GET') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const ex = exitsOf(st);
    return json({
      ok: true,
      enabled: ex.enabled !== false,
      defaultMode: ex.defaultMode,
      defaultExit: ex.defaultExit,
      /* پیش‌فرضِ مؤثر — همان چیزی که مسیر تونل استفاده می‌کند */
      effective: (() => { const r = resolveExit(st, null); return { mode: r.mode, id: r.id, name: r.name }; })(),
      servers: ex.servers.map((x) => ({ ...x })),
      stats: { ...EXIT_STATS, lastError: EXIT_LAST_ERR || null },
      /* انتخابِ هر کانفیگ — برای نمایشِ وضعیت در پنل */
      perConfig: st.users.map((u) => {
        const r = resolveExit(st, u);
        return { id: u.id, name: u.name, mode: u.exitMode || 'inherit', exitId: u.exitId || '', effectiveMode: r.mode, effectiveId: r.id };
      }),
    });
  }

  if (route === 'exits' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const op = String((b && b.op) || 'add').toLowerCase();
    const ex = exitsOf(st);

    /* افزودن/ویرایشِ تک‌فیلدی: فقط یک لینکِ vless:// کافی است */
    const linkRaw = (b && b.link != null) ? String(b.link).trim() : '';
    const fromLink = linkRaw ? parseVlessLink(linkRaw) : null;
    if (linkRaw && !fromLink) return json({ ok: false, error: EXIT_LINK_ERR }, 400);

    if (op === 'add') {
      const srv = normalizeExit(fromLink || b.server || b, '');
      const issues = exitIssues(srv);
      if (issues.length) return json({ ok: false, error: issues[0], issues }, 400);
      if (ex.servers.some((x) => x.address === srv.address && x.port === srv.port && x.uuid === srv.uuid)) {
        return json({ ok: false, error: 'این سرور خروجی قبلاً افزوده شده است' }, 409);
      }
      ex.servers.push(srv);
      addLog(st, 'success', 'core', 'افزودن سرور خروجی', srv.name + ' • ' + srv.address + ':' + srv.port);
      await save(env, st);
      return json({
        ok: true, op, server: srv, servers: ex.servers,
        msg: 'سرور خروجی «' + srv.name + '» افزوده شد — برای استفاده آن را به‌عنوانِ پیش‌فرضِ سراسری انتخاب کنید یا روی یک کانفیگ ببندید',
      }, 201);
    }

    if (op === 'update') {
      const id = String((b && b.id) || (b.server && b.server.id) || '').trim();
      const i = ex.servers.findIndex((x) => x.id === id);
      if (i < 0) return json({ ok: false, error: 'سرور خروجی با این شناسه پیدا نشد' }, 404);
      const patch = fromLink || ((b && b.server) ? b.server : b);
      /* ادغامِ عمیق با سرورِ فعلی — پارامترهای ناشناخته هم در params می‌مانند */
      const merged = { ...ex.servers[i], ...patch, id, params: { ...(ex.servers[i].params || {}), ...((patch && patch.params) || {}) } };
      const srv = normalizeExit(merged, id);
      const issues = exitIssues(srv);
      if (issues.length) return json({ ok: false, error: issues[0], issues }, 400);
      ex.servers[i] = srv;
      addLog(st, 'info', 'core', 'ویرایش سرور خروجی', srv.name);
      await save(env, st);
      return json({ ok: true, op, server: srv, servers: ex.servers, msg: 'سرور خروجی «' + srv.name + '» به‌روزرسانی شد' });
    }

    if (op === 'delete') {
      const id = String((b && b.id) || '').trim();
      const before = ex.servers.length;
      ex.servers = ex.servers.filter((x) => x.id !== id);
      if (ex.servers.length === before) return json({ ok: false, error: 'سرور خروجی با این شناسه پیدا نشد' }, 404);
      if (ex.defaultExit === id) { ex.defaultExit = ''; ex.defaultMode = 'direct'; }
      st.users.forEach((u) => { if (u.exitId === id) { u.exitId = ''; u.exitMode = 'direct'; } });
      addLog(st, 'warn', 'core', 'حذف سرور خروجی', id);
      await save(env, st);
      return json({ ok: true, op, servers: ex.servers, msg: 'سرور خروجی حذف شد — کانفیگ‌هایی که به آن وابسته بودند مستقیم شدند' });
    }

    /* انتخاب برای هر کانفیگ: پیش‌فرضِ سراسری / یکی از سرورها / مستقیم */
    if (op === 'select') {
      const uuid = String((b && b.uuid) || '').trim();
      const u = st.users.find((x) => x.uuid === uuid || x.id === uuid);
      if (!u) return json({ ok: false, error: 'کانفیگی با این شناسه پیدا نشد' }, 404);
      const mode = String((b && b.mode) || 'inherit').toLowerCase();
      if (!['inherit', 'direct', 'exit'].includes(mode)) {
        return json({ ok: false, error: 'حالت باید یکی از این‌ها باشد: inherit (پیروی از پیش‌فرضِ سراسری)، direct (مستقیم)، exit (یکی از سرورها)' }, 400);
      }
      if (mode === 'exit') {
        const srv = exitById(st, b.exitId);
        if (!srv) return json({ ok: false, error: 'سرور خروجی انتخاب‌شده پیدا نشد' }, 404);
        u.exitMode = 'exit'; u.exitId = srv.id;
      } else if (mode === 'direct') { u.exitMode = 'direct'; u.exitId = ''; }
      else { u.exitMode = 'inherit'; u.exitId = ''; }
      const r = resolveExit(st, u);
      addLog(st, 'info', 'core', 'تغییر خروجیِ کانفیگ', u.name + ' • ' + r.name);
      await save(env, st);
      return json({
        ok: true, op, uuid: u.uuid, mode: u.exitMode, exitId: u.exitId,
        effective: { mode: r.mode, id: r.id, name: r.name },
        msg: 'خروجیِ کانفیگِ «' + u.name + '» برابر با ' + r.name + ' شد',
      });
    }

    return json({ ok: false, error: 'عملیات نامعتبر — مجاز: add، update، delete، select' }, 400);
  }

  /* پیش‌فرضِ سراسری: 'direct' (بدون واسطه) یا شناسه‌ی یکی از سرورها */
  if (route === 'exits/default' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const ex = exitsOf(st);
    const mode = String((b && b.mode) || 'exit').toLowerCase();
    if (mode === 'direct') {
      ex.defaultMode = 'direct'; ex.defaultExit = '';
      addLog(st, 'info', 'core', 'پیش‌فرضِ سراسریِ خروجی', 'مستقیم (بدون واسطه)');
      await save(env, st);
      return json({ ok: true, defaultMode: 'direct', defaultExit: '', msg: 'خروجیِ پیش‌فرضِ سراسری برابر با «مستقیم (بدون واسطه)» شد' });
    }
    const srv = exitById(st, (b && b.exitId !== undefined) ? b.exitId : b.id);
    if (!srv) return json({ ok: false, error: 'سرور خروجی با این شناسه پیدا نشد' }, 404);
    ex.defaultMode = 'exit'; ex.defaultExit = srv.id;
    addLog(st, 'info', 'core', 'پیش‌فرضِ سراسریِ خروجی', srv.name);
    await save(env, st);
    return json({
      ok: true, defaultMode: 'exit', defaultExit: srv.id, server: srv,
      msg: 'خروجیِ پیش‌فرضِ سراسری برابر با «' + srv.name + '» شد — کانفیگ‌هایی که روی «پیروی از سراسری» هستند از این به بعد از آن عبور می‌کنند',
    });
  }

  /* تستِ اتصالِ یک سرور خروجی — گزارشِ موفق/ناموفق و زمانِ پاسخ واقعی.
     اگر id داده نشود، سرور از خودِ درخواست (بدون ذخیره شدن) تست می‌شود. */
  if (route === 'exits/test' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const id = String((b && b.id) || '').trim();
    const srv = id ? exitById(st, id) : normalizeExit(b.server || b, '');
    if (!srv) return json({ ok: false, error: 'سرور خروجی با این شناسه پیدا نشد' }, 404);
    const r = await testExit(srv, b);
    addLog(st, r.ok ? 'success' : 'warn', 'core', 'تست سرور خروجی',
      srv.name + ' • ' + (r.ok ? fa(r.ms) + ' میلی‌ثانیه' : (r.error || 'ناموفق')));
    await save(env, st);
    return json({
      ok: true, id: srv.id, name: srv.name,
      reachable: r.ok, ms: r.ms, transport: r.transport, security: r.security,
      error: r.error,
      msg: r.ok
        ? 'اتصال به «' + srv.name + '» برقرار شد — زمان پاسخ ' + fa(r.ms) + ' میلی‌ثانیه'
        : 'اتصال به «' + srv.name + '» برقرار نشد: ' + (r.error || 'علت نامشخص'),
    });
  }

  /* ═══════════════ تغییرِ رمز عبور پنل ═══════════════
     رمز با همان الگویِ فعلیِ پروژه نگه داشته می‌شود (تنظیمات → auth.password،
     یا متغیرِ محیطی MASTER_KEY اگر بایند شده باشد). تأییدِ رمزِ فعلی اجباری
     است؛ بدون آن هیچ تغییری نوشته نمی‌شود. */
  if (route === 'password' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    const current = String((b && b.current) || '');
    const next = String((b && (b.newPassword !== undefined ? b.newPassword : b['new'])) || '');
    if (!current) return json({ error: 'رمز عبور فعلی را وارد کنید' }, 400);
    if (current !== masterKey(st, env)) return json({ error: 'رمز عبور فعلی نادرست است' }, 403);
    if (!next || next.length < 5) return json({ error: 'رمز جدید باید دست‌کم ۵ حرف باشد' }, 400);
    if (next === current) return json({ error: 'رمز جدید باید با رمز فعلی فرق داشته باشد' }, 400);
    /* وقتی MASTER_KEY بایند شده باشد، همیشه بر تنظیمات غلبه می‌کند — نوشتن در
       تنظیمات بی‌اثر است و کاربر فکر می‌کند رمز عوض شده */
    if (env && env.MASTER_KEY) {
      return json({ error: 'رمز عبور از متغیر محیطی MASTER_KEY خوانده می‌شود؛ برای تغییرِ آن باید خودِ این متغیر را در تنظیماتِ ورکر عوض کنید' }, 409);
    }
    s.auth.password = next;
    addLog(st, 'warn', 'auth', 'رمز عبور پنل تغییر کرد', 'از ' + ipOf(req));
    await save(env, st);
    /* نشستِ فعلی با رمزِ قبلی امضا شده — بعد از تغییر نامعتبر است */
    return json({
      ok: true, relogin: true,
      msg: 'رمز عبور تغییر کرد — لطفاً دوباره وارد شوید',
    });
  }

  /* ═══════════════ پشتیبان‌گیری و بازیابی ═══════════════ */
  if (route === 'backup' && m === 'GET') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    return json({
      ok: true, kind: 'sub-panel-backup', version: VERSION, build: BUILD,
      exportedAt: Date.now(), storage: backendOf(env), source: sourceName(env),
      data: {
        settings: st.settings, users: st.users, keys: st.keys, panels: st.panels,
        logs: st.logs, stats: st.stats, updateLog: st.updateLog,
        lastCheck: st.lastCheck, uiLoaded: st.uiLoaded,
      },
    }, 200, { 'content-disposition': 'attachment; filename="panel-backup.json"' });
  }

  if (route === 'restore' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    /* هم { data: {...} } را می‌پذیریم و هم خودِ فایلِ پشتیبان را */
    const data = (b && b.data !== undefined) ? b.data : b;
    const mode = String((b && b.mode) || 'merge').toLowerCase() === 'replace' ? 'replace' : 'merge';

    const v = validateBackup(data);
    if (!v.ok) {
      /* هیچ چیزی نوشته نمی‌شود — فایلِ نامعتبر نباید تنظیمات را نیمه‌کاره کند */
      return json({
        ok: false, mode,
        error: 'فایل پشتیبان نامعتبر است و هیچ تغییری اعمال نشد (' + fa(v.errors.length) + ' مورد)',
        errors: v.errors,
      }, 400);
    }
    const next = applyBackup(st, data, mode);
    addLog(next, 'warn', 'system', 'بازیابی از پشتیبان',
      (mode === 'replace' ? 'جایگزینی کامل' : 'ادغام') + ' • ' + fa((data.users || []).length) + ' کاربر');
    await save(env, next);
    return json({
      ok: true, mode,
      users: (next.users || []).length,
      msg: mode === 'replace'
        ? 'تنظیمات با فایل پشتیبان جایگزین شد'
        : 'فایل پشتیبان در تنظیماتِ فعلی ادغام شد',
    });
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
    if (a === 'decoy-test') {
      const target = decoyTarget(s);
      const info = {};
      const r = await decoyPage(s, true, null, null, info);
      const t = await r.text();
      const host = (s.auth && s.auth.maintenanceHost) || 'nginx';
      return json({
        ok: t.length > 500, size: t.length,
        /* «زنده» = واکشی از سایت واقعی موفق بود؛ «داخلی» = صفحه‌ی آماده‌ی خودمان */
        mode: info.mode || 'builtin',
        target: target || host,
        site: (DECOY_SITES[host] && DECOY_SITES[host].label) || host,
        disguise: s.auth.disguise !== false, panic: !!s.auth.panic,
        sample: t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
      });
    }
    if (a === 'logs-clear') { st.logs = []; await save(env, st); return json({ ok: true }); }
    if (a === 'factory') {
      const fresh = DEF();
      fresh.settings.auth.password = masterKey(st, env);
      MEM = fresh;
      if (env.DB) { try { await d1Write(env, JSON.stringify(fresh)); } catch (e) {} }
      addLog(fresh, 'warn', 'system', 'ریست کارخانه‌ای', '');
      return json({ ok: true });
    }
    /* ⚠️ بازیابی از همان اعتبارسنجیِ /api/restore می‌گذرد. قبلاً هر JSONی که
       کلیدِ settings داشت بی‌چون‌وچرا ادغام می‌شد و یک فایلِ اشتباهی می‌توانست
       تنظیمات را نیمه‌کاره و بی‌صدا خراب کند. */
    if (a === 'restore') {
      const data = (b && b.data !== undefined) ? b.data : b;
      const mode = String((b && b.mode) || 'merge').toLowerCase() === 'replace' ? 'replace' : 'merge';
      const v = validateBackup(data);
      if (!v.ok) {
        return json({
          ok: false, mode,
          error: 'فایل پشتیبان نامعتبر است و هیچ تغییری اعمال نشد (' + fa(v.errors.length) + ' مورد)',
          errors: v.errors,
        }, 400);
      }
      const next = applyBackup(st, data, mode);
      addLog(next, 'warn', 'system', 'بازیابی از پشتیبان', mode === 'replace' ? 'جایگزینی کامل' : 'ادغام');
      await save(env, next);
      return json({ ok: true, mode, users: (next.users || []).length });
    }
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
    /* ═══ آزادسازیِ دستیِ اتصال‌ها ═══
       اگر به هر دلیلی ردیفی در جدول/شیءِ اتصال‌های زنده جامانده باشد، یک آی‌پی
       برای همیشه قفل می‌ماند. این عملیات روی هر سه مرجع (D1 • شیءِ ماندگار • KV)
       و آینهٔ حافظه پاک‌سازی می‌کند تا کاربر بتواند فوراً از آی‌پیِ جدید وصل
       شود — بدون نیاز به دستکاریِ پایگاه‌داده. */
    if (a === 'conn-reset') {
      const uuid = String((b && b.uuid) || '').trim();
      const removed = await connReset(env, uuid);
      const parts = [];
      if (removed.d1) parts.push(fa(removed.d1) + ' ردیف از پایگاه‌داده');
      if (removed.do) parts.push(fa(removed.do) + ' اتصال از شیءِ ماندگار');
      if (removed.kv) parts.push(fa(removed.kv) + ' کلید از KV');
      if (removed.mem) parts.push(fa(removed.mem) + ' از حافظهٔ این isolate');
      addLog(st, 'info', 'core', 'آزادسازی اتصال‌ها', (uuid ? 'کاربر ' + uuid.slice(0, 8) : 'همه') + ' • ' + fa(removed.total) + ' مورد');
      await save(env, st);
      return json({
        ok: true, removed: removed.total, byBackend: removed,
        msg: removed.total
          ? (parts.join(' • ') + ' آزاد شد — حالا می‌توانید از آی‌پیِ جدید وصل شوید')
          : 'هیچ اتصالِ زنده‌ای ثبت نبود (جدول از قبل خالی است) — پس هیچ آی‌پی‌ای قفل نیست'
      });
    }

    /* ═══ نمای زنده‌ی اتصال‌ها — «چه کسی، از کدام آی‌پی، چند اتصال» ═══
       ثبتِ ردیف از اِعمالِ سقف جداست: حتی با سقفِ صفر (نامحدود) هم اتصال‌ها
       ثبت می‌شوند تا این بخش واقعاً چیزی نشان بدهد. */
    if (a === 'live') return json(await liveView(env, st));

    /* ═══ قطعِ دستیِ یک آی‌پی/اتصال از پنل ═══ */
    if (a === 'conn-kick') {
      const uuid = String((b && b.uuid) || '').trim();
      const ip = String((b && b.ip) || '').trim();
      const connId = String((b && b.connId) || '').trim();
      if (!uuid && !connId) return json({ error: 'کاربر یا شناسه‌ی اتصال مشخص نشده' }, 400);
      const r = await connKick(env, uuid, ip, connId);
      addLog(st, 'warn', 'core', 'قطع دستی اتصال', [uuid.slice(0, 8), ip].filter(Boolean).join(' • ') + ' • ' + fa(r.kicked) + ' مورد');
      await save(env, st);
      return json({
        ...r,
        msg: r.kicked
          ? fa(r.kicked) + ' اتصال قطع شد — آن آی‌پی همین حالا آزاد است'
          : 'هیچ اتصالِ زنده‌ای با این نشانی پیدا نشد (احتمالاً خودبه‌خود آزاد شده)'
      });
    }

    if (a === 'usage-health') {
      /* ═══ سلامت شمارش مصرف (volume counting health check) ═══
         بررسی می‌کند: کدام بایندینگ ذخیره‌سازی در دسترس است؟، جدول usage
         خوانا؟، ستون conns وجود دارد؟، افزایش واقعاً ثبت می‌شود؟،
         محدودیت IP واقعاً اتصال سوم را رد می‌کند؟، مصرف هر کاربر چقدر است؟ */
      const kind = backendOf(env);
      const lim = limiterBackend(env);
      const out = { ok: true, storage: kind, limiter: lim, limiterLabel: LIM_LABEL[lim] || lim, db: { bound: !!env.DB, kv: !!env.KV, do: !!env.LIMITER, storage: kind }, checks: [], users: [] };
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

      /* ۲٫۵) اتصال‌های زنده — همان چیزی که سقفِ آی‌پی روی آن حساب می‌کند.
         ⚠️ از مرجعِ تصمیم خوانده می‌شود (liveRowsOf): در استقرارِ wrangler شیءِ
         ماندگار بایند است و جدولِ D1 خالی می‌ماند؛ نشان دادنِ جدول در آن حالت
         یک دروغِ تشخیصی است — «هیچ آی‌پی‌ای قفل نیست» در حالی که قفل در شیءِ
         ماندگار است. سنِ هر ردیف هم نمایش داده می‌شود تا ردیفِ گیرکرده دیده شود. */
      {
        const names = new Map(st.users.map((u) => [u.uuid, u.name]));
        out.liveRows = (await liveRowsOf(env))
          .map((x) => Object.assign({}, x, { name: names.get(x.uuid) || String(x.uuid).slice(0, 8) }));
        const ips = new Set(out.liveRows.map((x) => x.ip));
        const uuids = new Set(out.liveRows.map((x) => x.uuid));
        const stale = out.liveRows.filter((x) => x.stale).length;
        const oldest = out.liveRows.reduce((acc, x) => (x.ageSec !== null && x.ageSec > acc ? x.ageSec : acc), 0);
        out.live = { rows: out.liveRows.length, users: uuids.size, ips: ips.size, source: lim, stale, oldestSec: oldest };
        const SRC = { do: 'شیءِ ماندگار (LIMITER)', d1: 'جدول conns در D1', kv: 'KV', mem: 'حافظهٔ این isolate' }[lim] || lim;
        chk('اتصال‌های زنده (مبنای سقفِ آی‌پی)', true,
          fa(out.live.rows) + ' اتصال • ' + fa(out.live.ips) + ' آی‌پی • ' + fa(out.live.users) + ' کاربر' +
          ' • مرجع: ' + SRC +
          (oldest ? ' • قدیمی‌ترین ردیف: ' + fa(oldest) + ' ثانیه' : ''));
        if (stale) chk('ردیفِ خراب در اتصال‌های زنده', false,
          fa(stale) + ' ردیف زمانِ معتبر ندارد و در اولین پاک‌سازی حذف می‌شود — اگر دوباره برگشت، پایگاه‌داده دستی دستکاری شده است');
      }
      /* جدولِ D1 — فقط وقتی مرجع است باید پر باشد؛ در استقرارهای دیگر می‌تواند
         خالی بماند، پس نبودش فقط وقتی شکست است که هیچ مرجعِ مشترکی نباشد. */
      if (env.DB) {
        try {
          await liveEnsure(env);
          await liveSweep(env, null);
          const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM conns').all();
          const n = Number((r && r.results && r.results[0] && r.results[0].n) || 0);
          chk('جدول اتصال‌های زنده (conns)', true,
            'در دسترس ✓ • ' + fa(n) + ' ردیف' + (lim === 'd1' ? ' (مرجعِ تصمیم همین است)' : ' (مرجعِ تصمیم ' + lim + ' است، پس خالی بودن طبیعی است)'));
        } catch (e) { chk('جدول اتصال‌های زنده (conns)', false, 'جدول پیدا نشد یا خطا دارد: ' + String((e && e.message) || e)); }
      }

      /* ۳) تست زنده‌ی افزایش مصرف — واقعاً می‌نویسیم و بازمی‌خوانیم */
      try {
        const probe = '__health_probe__';
        /* جدول‌ها ممکن است هنوز ساخته نشده باشند (استقرار تازه) — اول می‌سازیم،
           بعد پاک‌سازی را در بلوکِ خودش انجام می‌دهیم تا یک نصبِ تازه به‌اشتباه
           «خراب» گزارش نشود */
        if (kind === 'd1') {
          await usageEnsure(env);
          try { await env.DB.prepare('DELETE FROM usage WHERE uuid = ?').bind(probe).run(); } catch (e) {}
        }
        const wrote = await usageDelta(env, probe, 1234, 4321, 1);
        const back = await usageFresh(env, probe);
        await usageReset(env, probe);
        chk('تست زنده‌ی افزایش مصرف', wrote && back.up === 1234 && back.down === 4321,
          wrote ? ('نوشتن و بازخوانی درست انجام شد (' + fa(back.up) + ' بایت ارسال / ' + fa(back.down) + ' بایت دریافت) ✓')
                : 'نوشتن ناموفق — شمارنده عملاً مصرف را ثبت نمی‌کند');
      } catch (e) { chk('تست زنده‌ی افزایش مصرف', false, 'خطا: ' + String((e && e.message) || e)); }

      /* ۴) تست زنده‌ی محدودیت — سقف = «تعداد IPهای همزمانِ هر کاربر» (مدلِ Nova-Proxy)
            سناریو ۱ (سقف ۱): IP اول مجاز • اتصالِ دوم از همان IP هم مجاز • IP دوم رد می‌شود
            سناریو ۲ (سقف ۲): دو IP مجاز • IP سوم رد می‌شود • بعد از آزادسازی جا باز می‌شود
            تست روی همان بک‌اندی اجرا می‌شود که در استقرار واقعی در دسترس است. */
      try {
        const pu = '__limit_probe__', ipA = '198.51.100.7', ipB = '198.51.100.8', ipC = '198.51.100.9';
        const id = (n) => 'probe-' + n;
        const nums = [11, 12, 13, 14, 21, 22, 23, 24];
        const relAll = async () => {
          for (const n of nums) {
            await connRelease(env, pu, ipA, id(n));
            await connRelease(env, pu, ipB, id(n));
            await connRelease(env, pu, ipC, id(n));
          }
        };
        /* ── سناریو ۱: سقفِ ۱ IP ── */
        const s1a = await connAcquire(env, pu, ipA, 1, id(11));      /* مجاز */
        const s1b = await connAcquire(env, pu, ipA, 1, id(12));      /* همان IP → مجاز */
        const s1c = await connAcquire(env, pu, ipB, 1, id(13));      /* IP دوم → باید رد شود */
        await connRelease(env, pu, ipA, id(11));
        await connRelease(env, pu, ipA, id(12));
        const s1d = await connAcquire(env, pu, ipB, 1, id(14));      /* بعد از آزادسازی → مجاز */
        await relAll();
        /* ── سناریو ۲: سقفِ ۲ IP ── */
        const s2a = await connAcquire(env, pu, ipA, 2, id(21));      /* مجاز */
        const s2b = await connAcquire(env, pu, ipB, 2, id(22));      /* مجاز */
        const s2c = await connAcquire(env, pu, ipC, 2, id(23));      /* سومین IP → باید رد شود */
        await connRelease(env, pu, ipA, id(21));
        const s2d = await connAcquire(env, pu, ipC, 2, id(24));      /* بعد از آزادسازی → مجاز */
        await relAll();
        const okOne = s1a.ok && s1b.ok && !s1c.ok && s1d.ok;
        const okTwo = s2a.ok && s2b.ok && !s2c.ok && s2d.ok;
        const yn = (r, want) => (r.ok === want ? (want ? 'مجاز ✓' : 'مجاز ✗') : (want ? 'رد ✗' : 'رد ✓'));
        chk('تست زنده‌ی محدودیت (سقف ۱ IP)', okOne,
          'روی «' + lim + '» • اتصال ۱ از IP اول: ' + yn(s1a, true) +
          ' • اتصال ۲ از همان IP: ' + yn(s1b, true) +
          ' • IP دوم: ' + yn(s1c, false) +
          ' • بعد از آزادسازی: ' + yn(s1d, true));
        chk('تست زنده‌ی محدودیت (سقف ۲ IP)', okTwo,
          'IP اول: ' + yn(s2a, true) + ' • IP دوم: ' + yn(s2b, true) +
          ' • IP سوم: ' + yn(s2c, false) + ' • بعد از آزادسازی: ' + yn(s2d, true));
        /* بک‌اندِ محدودیت — باید صریح باشد: حافظه بین isolateها مشترک نیست */
        chk('مرجعِ شمارشِ محدودیت اتصال', lim === 'do' || lim === 'd1',
          lim === 'do' ? 'Durable Object — یک نمونه‌ی سراسری؛ شمارش بین همه‌ی isolateها دقیق ✓'
            : lim === 'd1' ? 'D1 — همه‌ی isolateها یک پایگاه‌داده را می‌بینند، پس شمارش سراسری و دقیق ✓ (جدول conns)'
            : lim === 'kv' ? 'KV بایند شده — شمارش بین isolateها مشترک است اما با تأخیر (تقریبی). برای دقت کامل یک پایگاه D1 با نام DB ببندید.'
            : 'هیچ مرجعِ مشترکی نیست (نه D1، نه KV، نه LIMITER): هر isolate حافظه‌ی خودش را می‌شمارد، پس اتصالِ اضافه در isolate دیگر از صفر شمرده می‌شود و محدودیت عملاً اعمال نمی‌شود. در Settings → Variables یک پایگاه D1 با نام DB ببندید.'
        );
        chk('آمارِ محدودیت اتصال', true,
          fa(CONN_ACQUIRES) + ' درخواست پذیرش • ' + fa(CONN_DENIES) + ' رد شده • ' +
          fa(CONN_EVICTS) + ' آی‌پیِ کهنه بیرون رانده شد' +
          (CONN_LAST_ERR ? ' • آخرین خطا: ' + CONN_LAST_ERR : ' • بدون خطا ✓'));
      chk('آزادسازی آی‌پی', true,
          'آنی هنگام قطع شدن؛ حداکثر ' + fa(Math.floor(CONN_TTL / 1000)) +
          ' ثانیه برای قطعیِ ناگهانی • اتصالی که واقعاً ترافیک دارد با هر بایت تمدید می‌شود ' +
          '(حداکثر یک بار در ثانیه) و هرگز بیرون رانده نمی‌شود');
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
        (gLimit > 0 ? 'پیش‌فرض سراسری: ' + fa(gLimit) + ' IP همزمان برای هر کاربر • ' : 'پیش‌فرض سراسری: نامحدود • ') +
        fa(withLimit) + ' کاربر سقف اختصاصی دارد' + (gLimit > 0 || withLimit > 0 ? ' ✓' : ' — عملاً هیچ محدودیتی اعمال نمی‌شود'));
      /* تشخیص برای استقرار واقعی: چه چیزی بایند است، آی‌پیِ درخواست‌کننده چیست،
         و سقفی که ورکر برای هر کاربر واقعاً می‌خواند (تا ناهماهنگیِ کلیدِ تنظیمات
         دیده شود). */
      out.diag = {
        bound: { DB: !!env.DB, KV: !!env.KV, LIMITER: !!env.LIMITER },
        storage: kind, limiter: lim, limiterLabel: LIM_LABEL[lim] || lim,
        callerIp: ipOf(req),
        defaultLimit: gLimit,
        perUser: st.users.map((u) => ({ name: u.name, uuid: u.uuid, limit: Number(u.ipLimit) || gLimit || 0 })),
        connErr: CONN_LAST_ERR || null, usageErr: USAGE_LAST_ERR || null,
        acquires: CONN_ACQUIRES, denies: CONN_DENIES,
        releaseSec: Math.floor(CONN_TTL / 1000), evicts: CONN_EVICTS,
        liveSource: lim, live: out.live
      };
      chk('سقف مؤثری که ورکر برای هر کاربر می‌خواند', true,
        (out.diag.perUser.length ? out.diag.perUser.map((x) => x.name + ': ' + fa(x.limit)).join(' • ') : 'کاربری تعریف نشده') +
        ' • آی‌پیِ شما: ' + out.diag.callerIp);
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

  return json({
    error: 'not found',
    routes: ['/api/login', '/api/health', '/api/state', '/api/settings', '/api/users', '/api/keys', '/api/panels', '/api/action',
      '/api/connections', '/api/connections/kick', '/api/connections/ban', '/api/connections/unban', '/api/connections/bans',
      '/api/password', '/api/backup', '/api/restore'],
  }, 404);
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

/* ═══════════════════════════════════════════════════════════════════════════
   سرورهای خروجی VLESS (exit / outbound) — مرحله‌ی ۲
   ───────────────────────────────────────────────────────────────────────────
   این بلوک، «اتصال‌دهنده‌ی بالادست» است: بعد از این‌که هدر VLESS/Trojan پارس
   شد و پیش از connect() به مقصد، صدا زده می‌شود. خروجیِ آن شیئی هم‌شکل با
   سوکتِ کلاودفلر ({ readable, writable, close }) است — به همین دلیل بقیه‌ی
   مسیرِ تونل (پایپ، شمارشِ مصرف، محدودساز) هیچ تغییری نمی‌کند.
   تنها نقطه‌ی ورود به مسیر تونل در dial() است؛ هیچ تایمر ضربان‌قلبی ندارد.
   ═══════════════════════════════════════════════════════════════════════════ */

const EXIT_SECURITIES = ['none', 'tls', 'reality'];
const EXIT_TRANSPORTS = ['raw', 'ws', 'grpc'];

/* آخرین خطا و آمار — فقط برای گزارش؛ هیچ تایمری راه نمی‌افتد */
let EXIT_LAST_ERR = '';
const EXIT_STATS = { tunnels: 0, fallbacks: 0, lastMs: 0, lastAt: 0 };
const exitNote = (msg) => { EXIT_LAST_ERR = String(msg).slice(0, 300); EXIT_STATS.lastAt = Date.now(); };

const toU8 = (d) => {
  if (!d) return new Uint8Array(0);
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  if (typeof d === 'string') return new TextEncoder().encode(d);
  return new Uint8Array(0);
};

const EXIT_FIELDS = ['name', 'label', 'address', 'port', 'uuid', 'flow', 'security', 'transport',
  'path', 'serviceName', 'sni', 'host', 'enabled'];

/**
 * قِسم‌دادنِ یک سرور خروجی.
 * ⚠️ هر کلیدی که امروز نمی‌شناسیم (پارامترهای تازه در آینده) دور ریخته نمی‌شود:
 * در params نگه داشته می‌شود تا با ذخیره/بازیابی از بین نرود.
 */
function normalizeExit(raw, keepId) {
  const o = (raw && typeof raw === 'object') ? raw : {};
  const id = String((keepId !== undefined && keepId !== null && keepId !== '') ? keepId : (o.id || '')).trim()
    || ('ex-' + randTok(6));
  let security = String(o.security || 'tls').toLowerCase();
  if (!EXIT_SECURITIES.includes(security)) security = 'tls';
  let transport = String(o.transport || 'ws').toLowerCase();
  if (!EXIT_TRANSPORTS.includes(transport)) transport = 'ws';
  const params = (o.params && typeof o.params === 'object' && !Array.isArray(o.params)) ? { ...o.params } : {};
  Object.keys(o).forEach((k) => {
    /* addr/server نام‌های جایگزینِ address هستند، نه پارامترِ تازه */
    if (EXIT_FIELDS.includes(k) || k === 'id' || k === 'params' || k === 'addr' || k === 'server') return;
    params[k] = o[k];
  });
  const port = Math.max(1, Math.min(65535, Math.round(Number(o.port) || 443)));
  return {
    id,
    name: String(o.name || '').trim() || ('خروجی ' + id.slice(-4)),
    label: String(o.label || o.name || '').trim(),
    address: String(o.address || o.addr || o.server || '').trim(),
    port,
    uuid: String(o.uuid || '').trim(),
    flow: String(o.flow || '').trim(),
    security,
    transport,
    path: String(o.path || '/').trim() || '/',
    serviceName: String(o.serviceName || '').trim(),
    sni: String(o.sni || '').trim(),
    host: String(o.host || '').trim(),
    enabled: o.enabled !== false,
    params,
  };
}

/**
 * کلیدهای کوئریِ لینکِ vless:// و معادل‌شان در فیلدهای سرور خروجی.
 * ⚠️ کلیدی که معادلش جزو EXIT_FIELDS نباشد (مثل encryption) در params می‌نشیند
 * تا چیزی از لینک در ذخیره/بازیابی گم نشود.
 */
const VLESS_QUERY_MAP = {
  security: 'security',
  type: 'transport',
  path: 'path',
  serviceName: 'serviceName',
  sni: 'sni',
  host: 'host',
  flow: 'flow',
  encryption: 'encryption',
};

/** رمزگشاییِ امنِ بخش‌های لینک — لینکِ خراب نباید ورکر را بیندازد */
const safeDecode = (s) => {
  const t = String(s == null ? '' : s);
  try { return decodeURIComponent(t); } catch { return t; }
};

/**
 * تبدیلِ یک لینکِ آماده‌ی vless:// به شیءِ سرور خروجی.
 * نمونه‌ی واقعیِ چیزی که کاربر می‌چسباند:
 *   vless://7e2c8d71-...@host:443?encryption=none&security=tls&sni=...&alpn=http%2F1.1&fp=chrome&type=ws&host=...&path=%2Fws%2F...#نام
 * خروجی مستقیم به normalizeExit داده می‌شود؛ پس همان ساختارِ همیشگی را دارد و
 * کلیدهای ناشناس (alpn، fp، …) در params نگه داشته می‌شوند.
 * لینکِ غیرِ vless یا ناقص → null (فراخوان خطای فارسی می‌دهد).
 */
function parseVlessLink(link) {
  const raw = String(link == null ? '' : link).trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'vless:') return null;

  const q = url.searchParams;
  const o = {
    uuid: safeDecode(url.username),
    address: url.hostname,
    port: url.port ? Number(url.port) : 443,
    enabled: true,
  };
  Object.keys(VLESS_QUERY_MAP).forEach((k) => {
    if (!q.has(k)) return;
    const v = q.get(k);
    const field = VLESS_QUERY_MAP[k];
    if (EXIT_FIELDS.includes(field)) o[field] = v;
  });
  if (!o.security) o.security = 'tls';
  if (!o.transport) o.transport = 'ws';
  if (!o.path) o.path = '/';
  /* نام از هَشِ لینک؛ اگر نبود همان آدرس */
  o.name = safeDecode(String(url.hash || '').replace(/^#/, '')).trim() || o.address;

  /* هر کلیدِ کوئری که روی یک فیلدِ سرور ننشسته (alpn، fp، encryption، …) → params */
  const params = {};
  q.forEach((v, k) => {
    const field = VLESS_QUERY_MAP[k];
    if (field && EXIT_FIELDS.includes(field)) return;
    params[k] = v;
  });
  o.params = params;
  return o;
}

/* پیامِ خطای لینکِ نامعتبر — فارسی چون مستقیم به کاربر نشان داده می‌شود */
const EXIT_LINK_ERR = 'لینک معتبر نیست — باید یک لینکِ vless:// کامل (با یو‌یو‌آی‌دی و آدرسِ سرور) باشد';

/** خطاهای یک سرور خروجی — متن‌ها فارسی‌اند چون مستقیم به کاربر نشان داده می‌شوند */
function exitIssues(x) {
  const e = [];
  if (!x.address) e.push('آدرسِ سرور خروجی مشخص نشده است');
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(x.uuid)) {
    e.push('یو‌یو‌آی‌دی معتبر نیست (باید ساختارِ استانداردِ ۸-۴-۴-۴-۱۲ داشته باشد)');
  }
  if (!/^[a-z0-9.\-[\]:]+$/i.test(x.address)) e.push('آدرسِ سرور خروجی نویسه‌ی غیرمجاز دارد');
  if (x.transport === 'ws' && !x.path) e.push('برای انتقالِ ws باید مسیر (path) مشخص شود');
  if (x.transport === 'grpc' && !x.serviceName) e.push('برای انتقالِ grpc باید نام سرویس (serviceName) مشخص شود');
  return e;
}

/** فهرستِ سرورهای خروجی — همیشه آرایه‌ای معتبر برمی‌گرداند */
function exitsOf(st) {
  const s = st.settings;
  if (!s.exits || typeof s.exits !== 'object') {
    s.exits = { enabled: true, defaultMode: 'direct', defaultExit: '', servers: [] };
  }
  if (!Array.isArray(s.exits.servers)) s.exits.servers = [];
  return s.exits;
}

const exitById = (st, id) => (exitsOf(st).servers || []).find((x) => x && x.id === String(id || '').trim()) || null;

/**
 * خروجیِ مؤثر برای یک کانفیگ (کاربر).
 * انتخابِ هر کانفیگ بر پیش‌فرضِ سراسری مقدم است:
 *   u.exitMode = 'inherit' (یا خالی) → پیش‌فرضِ سراسری
 *   u.exitMode = 'direct'            → مستقیمِ بدون واسطه
 *   u.exitMode = 'exit'              → سرورِ u.exitId
 */
function resolveExit(st, u) {
  const ex = exitsOf(st);
  const DIRECT = { mode: 'direct', id: '', name: 'مستقیم (بدون واسطه)', server: null };
  const perConfig = u && u.exitMode && u.exitMode !== 'inherit';
  const mode = perConfig ? String(u.exitMode) : (ex.defaultMode === 'exit' ? 'exit' : 'direct');
  if (mode !== 'exit') return DIRECT;
  const id = perConfig ? String(u.exitId || '') : String(ex.defaultExit || '');
  const srv = id ? (ex.servers || []).find((x) => x && x.id === id && x.enabled !== false) : null;
  if (!srv) {
    return { mode: 'direct', id: '', name: 'مستقیم (بدون واسطه)', server: null, reason: id ? 'سرور خروجی انتخاب‌شده یافت نشد' : 'هیچ سرور خروجی‌ای انتخاب نشده است' };
  }
  return { mode: 'exit', id: srv.id, name: srv.name, server: srv };
}

/**
 * آیا مسیر تونل اجازه دارد از سرور خروجی استفاده کند؟
 * exits.enabled === false یعنی «خروجی‌ها تعریف‌اند اما در مسیر به کار نمی‌روند»
 * — بدون این‌که فهرستِ سرورها پاک شود.
 * ⚠️ وقتی خروجی به کار می‌رود و خطا می‌دهد، همیشه به مسیر مستقیم برمی‌گردیم
 * (در dial()) تا اتصالِ کاربر به‌خاطر خرابیِ سرور خروجی قطع نشود.
 */
function exitRoutingEnabled(st) {
  const ex = (st && st.settings && st.settings.exits) || {};
  return ex.enabled !== false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   هندشیکِ سمت‌کلاینتِ VLESS
   فرمت: [نسخه][۱۶ بایت UUID][طولِ addons][addons][فرمان][پورت ۲ بایتی]
         [atyp][آدرس][بارِ اولیه]
   ═══════════════════════════════════════════════════════════════════════════ */

/** تبدیلِ متنِ IPv6 به ۱۶ بایت — با پشتیبانی از فشردگیِ :: و ::ffff:a.b.c.d */
function ipv6ToBytes(addr) {
  let t = String(addr || '').trim().replace(/^\[/, '').replace(/\]$/, '');
  const tail4 = t.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail4) {
    const p = tail4.slice(1).map(Number);
    if (p.some((n) => n > 255)) return null;
    const head = t.slice(0, tail4.index).replace(/:$/, '');
    t = head + ':' + (((p[0] << 8) | p[1]).toString(16)) + ':' + (((p[2] << 8) | p[3]).toString(16));
  }
  const compact = t.indexOf('::') >= 0;
  let head = [], tail = [];
  if (compact) { const [a, b] = t.split('::'); head = a ? a.split(':') : []; tail = b ? b.split(':') : []; }
  else { head = t.split(':'); }
  const groups = compact
    ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail]
    : head;
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i] || '')) return null;
    const v = parseInt(groups[i], 16);
    out[i * 2] = (v >> 8) & 255;
    out[i * 2 + 1] = v & 255;
  }
  return out;
}

/** addons فقط وقتی flow تنظیم شده باشد (XTLS-Vision): [نوع=۱][طول][رشته] */
function vlessAddons(flow) {
  if (!flow) return new Uint8Array(0);
  const f = new TextEncoder().encode(String(flow));
  const out = new Uint8Array(2 + f.length);
  out[0] = 1;
  out[1] = Math.min(255, f.length);
  out.set(f.subarray(0, out[1]), 2);
  return out;
}

/** بایت‌های درخواستِ VLESS که سرور خروجی انتظار دارد */
function vlessRequestHeader(srv, addr, port, payload) {
  const hex = String(srv.uuid || '').replace(/-/g, '');
  const uuidBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const p = hex.substr(i * 2, 2);
    uuidBytes[i] = p.length === 2 ? (parseInt(p, 16) || 0) : 0;
  }
  const addons = vlessAddons(srv.flow);

  let atyp = 2, addrBytes;
  const v4 = String(addr).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const v6 = v4 ? null : ipv6ToBytes(addr);
  if (v4 && v4.slice(1).every((n) => Number(n) <= 255)) {
    atyp = 1;
    addrBytes = new Uint8Array(v4.slice(1).map(Number));
  } else if (v6) {
    atyp = 3;
    addrBytes = v6;
  } else {
    const d = new TextEncoder().encode(String(addr));
    addrBytes = new Uint8Array(1 + d.length);
    addrBytes[0] = Math.min(255, d.length);
    addrBytes.set(d.subarray(0, addrBytes[0]), 1);
  }

  const pl = toU8(payload);
  const p2 = Math.max(0, Math.min(65535, Math.round(Number(port) || 0)));
  const out = new Uint8Array(1 + 16 + 1 + addons.length + 1 + 2 + 1 + addrBytes.length + pl.length);
  let i = 0;
  out[i++] = 0;                                   /* نسخه */
  out.set(uuidBytes, i); i += 16;                 /* بایت‌های UUID */
  out[i++] = addons.length;                       /* طولِ addons */
  out.set(addons, i); i += addons.length;
  out[i++] = 1;                                   /* فرمان = TCP */
  out[i++] = (p2 >> 8) & 255; out[i++] = p2 & 255; /* پورت */
  out[i++] = atyp;                                /* نوعِ آدرس */
  out.set(addrBytes, i); i += addrBytes.length;   /* مقدارِ آدرس */
  out.set(pl, i);                                 /* سپس بارِ اولیه */
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   کدکِ WebSocketِ کلاینت (RFC 6455) — فقط آنچه برای انتقالِ ws لازم است
   ═══════════════════════════════════════════════════════════════════════════ */

/* RFC 6455 کلیدِ ارتقا را base64 می‌خواهد — این رمزنگاریِ داده نیست،
   الزامِ خودِ پروتکل است. */
const wsSecKey = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
};

/** قابِ کلاینت: FIN + opcode، طول، ماسکِ ۴ بایتی، سپس بارِ ماسک‌شده */
function wsFrame(payload, opcode) {
  const p = toU8(payload);
  const op = opcode === undefined ? 2 : opcode;         /* پیش‌فرض: دودویی */
  const mask = new Uint8Array(4);
  crypto.getRandomValues(mask);
  let head;
  if (p.length < 126) {
    head = new Uint8Array(2);
    head[1] = 0x80 | p.length;
  } else if (p.length < 65536) {
    head = new Uint8Array(4);
    head[1] = 0x80 | 126;
    head[2] = (p.length >> 8) & 255; head[3] = p.length & 255;
  } else {
    head = new Uint8Array(10);
    head[1] = 0x80 | 127;
    new DataView(head.buffer).setBigUint64(2, BigInt(p.length));
  }
  head[0] = 0x80 | op;
  const out = new Uint8Array(head.length + 4 + p.length);
  out.set(head, 0);
  out.set(mask, head.length);
  const off = head.length + 4;
  for (let i = 0; i < p.length; i++) out[off + i] = p[i] ^ mask[i & 3];
  return out;
}

/** جداسازِ قاب‌های سرور: فقط بارِ قاب‌های دودویی را بیرون می‌دهد (بدون هدر) */
function makeWsUnwrap(initial) {
  let buf = initial && initial.length ? toU8(initial) : new Uint8Array(0);
  return {
    feed(chunk) {
      const c = toU8(chunk);
      if (c.length) {
        const n = new Uint8Array(buf.length + c.length);
        n.set(buf); n.set(c, buf.length);
        buf = n;
      }
      const out = [];
      let closed = false;
      for (;;) {
        if (buf.length < 2) break;
        const b0 = buf[0], b1 = buf[1];
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f, off = 2;
        if (len === 126) {
          if (buf.length < 4) break;
          len = (buf[2] << 8) | buf[3]; off = 4;
        } else if (len === 127) {
          if (buf.length < 10) break;
          const hi = new DataView(buf.buffer, buf.byteOffset + 2, 4).getUint32(0);
          const lo = new DataView(buf.buffer, buf.byteOffset + 6, 4).getUint32(0);
          len = hi * 4294967296 + lo;
          if (!isFinite(len) || len < 0 || len > 67108864) throw new Error('قابِ وب‌سوکتِ غیرعادی از سرور خروجی');
          off = 10;
        }
        let mask = null;
        if (masked) { if (buf.length < off + 4) break; mask = buf.slice(off, off + 4); off += 4; }
        if (buf.length < off + len) break;
        const data = buf.slice(off, off + len);
        if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
        const op = b0 & 0x0f;
        buf = buf.slice(off + len);
        if (op === 0x2 || op === 0x0) out.push(data);       /* دودویی / ادامه */
        else if (op === 0x8) { closed = true; break; }       /* بستن */
        /* ping/pong/متن نادیده گرفته می‌شوند */
      }
      return { frames: out, closed };
    },
  };
}

const CRLFCRLF = [13, 10, 13, 10];
function indexOfSeq(buf, seq) {
  outer:
  for (let i = 0; i + seq.length <= buf.length; i++) {
    for (let k = 0; k < seq.length; k++) if (buf[i + k] !== seq[k]) continue outer;
    return i;
  }
  return -1;
}

/** خواندنِ سرِ HTTP تا \r\n\r\n — باقی‌مانده (که می‌تواند اولین قاب باشد) برگردانده می‌شود */
async function readHttpHead(sock, timeout) {
  const reader = sock.readable.getReader();
  let acc = new Uint8Array(0);
  let timer = null;
  try {
    for (;;) {
      const r = await Promise.race([
        reader.read(),
        new Promise((_, rj) => { timer = setTimeout(() => rj(new Error('زمان انتظار برای پاسخِ ارتقا تمام شد')), timeout); }),
      ]);
      if (timer) { clearTimeout(timer); timer = null; }
      if (r.done) throw new Error('سرور خروجی پیش از پاسخ، اتصال را بست');
      const v = toU8(r.value);
      const n = new Uint8Array(acc.length + v.length);
      n.set(acc); n.set(v, acc.length); acc = n;
      const idx = indexOfSeq(acc, CRLFCRLF);
      if (idx >= 0) return { head: acc.slice(0, idx + 4), rest: acc.slice(idx + 4) };
      if (acc.length > 16384) throw new Error('سرور خروجی پاسخِ معتبرِ HTTP نداد');
    }
  } finally {
    if (timer) clearTimeout(timer);
    try { reader.releaseLock(); } catch (e) {}
  }
}

/**
 * اتصال‌دهنده‌ی بالادست — تنها تابعی که به جای مقصد، به سرور خروجی وصل می‌شود.
 *
 * @returns {{readable: ReadableStream, writable: WritableStream, close: Function,
 *            transport: string, security: string}}
 *   شیئی هم‌شکل با سوکتِ کلاودفلر، تا بقیه‌ی مسیرِ تونل بدون تغییر بماند.
 * @throws در صورت هر خطا (نرسیدن به سرور، شکستِ هندشیک، انتقالِ پشتیبانی‌نشده)
 */
async function openExitSocket(srv, info, opt) {
  const timeout = Math.max(500, Number((opt && opt.timeoutMs) || 8000));
  if (srv.transport === 'grpc') {
    /* gRPC روی HTTP/2 نیازمندِ کدکِ HPACK است — اینجا پیاده نشده، پس صریحاً
       خطا می‌دهیم تا مسیر مستقیم جایگزین شود (اتصالِ کاربر قطع نمی‌شود). */
    throw new Error('انتقالِ grpc برای سرور خروجی پشتیبانی نمی‌شود (فقط raw و ws)');
  }
  const security = srv.security || 'tls';
  const socketOpts = { secureTransport: security === 'none' ? 'off' : 'on' };
  const sock = connect({ hostname: srv.address, port: srv.port }, socketOpts);

  /* باز شدنِ واقعیِ سوکت — همان چیزی است که تأخیر را معنا می‌کند */
  if (sock && sock.opened) {
    let timer = null;
    try {
      await Promise.race([
        sock.opened,
        new Promise((_, rj) => { timer = setTimeout(() => rj(new Error('زمان انتظار برای اتصال به سرور خروجی تمام شد')), timeout); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  const header = vlessRequestHeader(srv, info.addr, info.port, info.payload);

  /* ── انتقالِ raw: هندشیک بلافاصله روی همان TCP نوشته می‌شود ── */
  if (srv.transport === 'raw') {
    const w = sock.writable.getWriter();
    try { await w.write(header); } finally { w.releaseLock(); }
    return {
      readable: sock.readable,
      writable: sock.writable,
      close: () => { try { sock.close(); } catch (e) {} },
      transport: 'raw', security,
    };
  }

  /* ── انتقالِ ws: ارتقای HTTP، سپس هندشیک داخلِ اولین قابِ دودویی ── */
  const host = srv.host || srv.address;
  const path = String(srv.path || '/').startsWith('/') ? srv.path : '/' + srv.path;
  const req = 'GET ' + path + ' HTTP/1.1\r\n'
    + 'Host: ' + host + '\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + 'Sec-WebSocket-Key: ' + wsSecKey() + '\r\n'
    + 'Sec-WebSocket-Version: 13\r\n'
    + 'User-Agent: Mozilla/5.0\r\n'
    + '\r\n';
  const w = sock.writable.getWriter();
  try { await w.write(new TextEncoder().encode(req)); } finally { w.releaseLock(); }

  const { head, rest } = await readHttpHead(sock, timeout);
  const statusLine = new TextDecoder().decode(head).split('\r\n')[0] || '';
  if (!/ 101 /.test(statusLine)) {
    try { sock.close(); } catch (e) {}
    throw new Error('سرور خروجی ارتقا به وب‌سوکت را نپذیرفت (' + statusLine.trim() + ')');
  }
  const w2 = sock.writable.getWriter();
  try { await w2.write(wsFrame(header, 2)); } finally { w2.releaseLock(); }

  const unwrap = makeWsUnwrap(rest);
  const reader = sock.readable.getReader();
  const readable = new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { try { controller.close(); } catch (e) {} return; }
          const { frames, closed } = unwrap.feed(value);
          for (const f of frames) controller.enqueue(f);
          if (closed) { try { controller.close(); } catch (e) {} return; }
          if (frames.length) return;
        }
      } catch (e) {
        try { controller.error(e); } catch (e2) {}
      }
    },
    cancel() { try { reader.cancel(); } catch (e) {} },
  });

  const writer = sock.writable.getWriter();
  const writable = new WritableStream({
    async write(chunk) { await writer.write(wsFrame(toU8(chunk), 2)); },
    async abort() { try { await writer.abort(); } catch (e) {} },
    async close() { try { await writer.close(); } catch (e) {} },
  });

  return {
    readable, writable,
    close: () => { try { sock.close(); } catch (e) {} },
    transport: 'ws', security,
  };
}

/** تستِ اتصالِ یک سرور خروجی — اندازه‌گیریِ واقعی (وصل شدن + هندشیک) */
async function testExit(srv, opt) {
  const issues = exitIssues(srv);
  if (issues.length) return { ok: false, ms: null, error: issues[0] };
  const timeoutMs = Math.max(500, Math.min(30000, Number((opt && opt.timeoutMs) || 8000)));
  const target = {
    addr: String((opt && opt.addr) || 'www.cloudflare.com'),
    port: Number((opt && opt.port) || 443),
    cmd: 1,
    payload: new Uint8Array(0),
  };
  const t0 = Date.now();
  let out = null;
  try {
    out = await openExitSocket(srv, target, { timeoutMs });
    const ms = Date.now() - t0;
    EXIT_STATS.lastMs = ms;
    return { ok: true, ms, transport: srv.transport, security: srv.security, error: null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, transport: srv.transport, security: srv.security, error: String((e && e.message) || e) };
  } finally {
    if (out) { try { out.close(); } catch (e) {} }
  }
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

  /* جزئیاتِ اتصال برای بخش «اتصال‌ها»ی پنل — فقط نمایشی، از request.cf و هدرها.
     cf.country فقط وقتی در دسترس است که IP Geolocation روی مسیر فعال باشد؛
     هدر cf-ipcountry مسیرِ جایگزین است. نبودش تنها یعنی ستونِ کشور خالی. */
  const connMeta = {
    cc: (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || '',
    ua: request.headers.get('user-agent') || '',
    /* نوعِ انتقال از تنظیمات — همان چیزی که کانفیگِ کلاینت با آن می‌سازد */
    transport: (st.settings && st.settings.transport) || 'ws',
  };

  /* همه‌ی کارهای سنگین در پس‌زمینه — بدون مسدود کردن handshake */
  session(server, request.headers.get('sec-websocket-protocol') || '', st, env, ctx, clientIp,
    boot, selfHost, connMeta)
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

async function session(ws, early, st, env, ctx, clientIp, boot, selfHost, connMeta) {
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
  /* ═══ تمدیدِ مبتنی بر فعالیت (جایگزینِ ضربانِ دوره‌ای) ═══
     ضربانِ دوره‌ای حذف شده است: (۱) با پنجره‌ی ۳ ثانیه یعنی یک نوشتن در D1 برای
     هر اتصال در هر ۳ ثانیه — حتی برای اتصال‌های کاملاً بی‌ترافیک؛ (۲) یک
     ضربان که در صف مانده باشد بعد از آزادسازی اجرا می‌شد و ردیفِ مرده را
     زنده می‌کرد. حالا فقط وقتی بایتی واقعاً جریان دارد تمدید می‌کنیم و آن هم
     حداکثر یک بار در ثانیه (CONN_ACTIVITY_MS). */
  let lastActivity = 0;
  const noteActivity = () => {
    if (closed || !connAcquired || connReleased || !user || !ctx || !ctx.waitUntil) return;
    const now = Date.now();
    if (now - lastActivity < CONN_ACTIVITY_MS) return;
    lastActivity = now;
    const u = user, lim = Number(u.ipLimit) || Number(s.sec.ipConnLimit) || 0;
    /* این تابع بعد از هر await هم بررسی می‌شود: اگر در همین فاصله اتصال بسته
       شده باشد، هیچ ردیفی دوباره درج نمی‌شود (ضدِ زنده‌شدنِ ردیفِ آزادشده). */
    const stillOpen = () => !closed && !connReleased && connAcquired;
    ctx.waitUntil((async () => {
      if (!stillOpen()) return;
      try {
        const r = await connRefresh(env, u.uuid, ip, connId, lim, stillOpen);
        /* ردیف این اتصال پاک شده بود و سقف جایِ دوباره دادن ندارد → بستنِ مؤدبانه.
           reason==='released' یعنی اتصال خودش تمام شده — finish() قبلاً اجرا شده. */
        if (r && r.ok === false && r.reason !== 'released') {
          try { ws.close(1013, 'connection limit reached'); } catch (e) {}
          await finish();
        }
      } catch (e) {}
    })());
  };

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

  /** ثبت دوره‌ای در پس‌زمینه — هر ۱۰ ثانیه یا ۵۱۲KB (هر کدام زودتر برسد)
      ⚠️ این تابع در تمام مسیرهای شمارشِ بایت (بالا/پایین‌دست) صدا زده می‌شود،
      پس تمدیدِ مبتنی بر فعالیت هم همین‌جا انجام می‌شود: هر بار که بایتی جریان
      پیدا کند، ردیفِ همین اتصال تمدید می‌شود (درونnoteActivity خودش به یک بار
      در ثانیه محدود شده است). */
  const maybeFlush = (force) => {
    if (!user || !ctx || !ctx.waitUntil) return;
    noteActivity();
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
    /* حجمِ همین نشست — برای ستونِ «ارسال/دریافت» در بخش اتصال‌ها.
       از همین نقطه‌ی flush می‌آید (نه یک تایمرِ تازه)، پس با مصرفِ کاربر
       از یک منبع است و خطایش هرگز اتصال را نمی‌بندد. */
    ctx.waitUntil(metaBytes(env, connId, dUp, dDown).catch(() => {}));
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
    try { if (ws.readyState === 1 || ws.readyState === 2) ws.close(); } catch (e) {}
    try { sock && sock.close(); } catch (e) {}
    /* ثبت مصرفِ باقیمانده + آزاد کردن سهمیه — کاملاً در پس‌زمینه */
    const dUp = pendUp, dDown = pendDown, dReqs = pendReqs, u = user;
    pendUp = 0; pendDown = 0; pendReqs = 0;
    const p = (async () => {
      if (u && (dUp || dDown || dReqs)) { try { await usageDelta(env, u.uuid, dUp, dDown, dReqs); } catch (e) {} }
      /* حجمِ باقیمانده‌ی همین نشست — قبل از آزادسازی ثبت می‌شود (همان conn_id) */
      if (dUp || dDown) { try { await metaBytes(env, connId, dUp, dDown); } catch (e) {} }
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
    /* ⚠️ ثبت همیشه انجام می‌شود — حتی وقتی سقف صفر (نامحدود) است.
       «ثبت» و «اعمال» دو تصمیمِ جدا هستند: سقفِ بزرگ‌تر از صفر فقط رد کردن را
       فعال می‌کند. اگر ثبت را به ipLimit>0 گره می‌زدیم، بخشِ «اتصال‌ها»ی پنل
       در حالتِ نامحدود همیشه خالی می‌ماند و کاربر فکر می‌کند کسی وصل نیست. */
    const adm = await connAcquire(env, user.uuid, ip, ipLimit, connId, connMeta);
    if (adm && !adm.ok) {
      try { ws.close(1013, 'connection limit reached'); } catch (e) {}
      /* هیچ ردیفی از این اتصال نباید بماند: پاک‌سازیِ صریح با conn_id.
         قبلاً چون connAcquired هنوز false بود، releaseConn() کاری نمی‌کرد و
         اگر ردیفی در مسیرِ رقابت مانده بود تا پایانِ TTL قفل می‌ماند. */
      try { await connRelease(env, user.uuid, ip, connId); } catch (e) {}
      await finish();
      return;
    }
    connAcquired = true;

    /* ═══ نظرسنجیِ سبکِ «قطعِ دستی» — اجرای فوریِ دکمه‌ی قطع حتی روی نشستِ بیکار ═══
       تمدید فقط با فعالیت انجام می‌شود؛ اگر کلاینت بی‌ترافیک باشد، connRefresh
       هرگز صدا زده نمی‌شود و نشستِ قطع‌شده از پنل باز می‌ماند. این حلقه فقط
       وضعیتِ «قطع‌شده» را می‌خواند (بدون هیچ نوشتنی) و در صورتِ قطع، سوکت را
       می‌بندد. هزینه: برای بک‌اندِ DO یک RPC سبکِ درون‌حافظه‌ای؛ برای D1/KV
       خواندنِ kickCheck که در هر isolate حداکثر یک بار در هر ۳ ثانیه کش می‌شود. */
    let kickTimer = null;
    const kickWatch = () => {
      if (closed || connReleased || !connAcquired || !user) return;
      if (ctx && ctx.waitUntil) ctx.waitUntil((async () => {
        if (closed || connReleased || !connAcquired || !user) return;
        let kicked = false;
        try {
          if (env && env.LIMITER) {
            const r = await limiterRpc(env, '/touch', { uuid: user.uuid, ip, connId, now: Date.now() });
            kicked = !!(r && r.kicked);
          } else {
            kicked = await kickCheck(env, user.uuid, ip, connId);
          }
        } catch (e) {}
        if (kicked && !closed) {
          try { ws.close(1013, 'kicked by panel'); } catch (e) {}
          await finish();
        }
      })());
      if (!closed) kickTimer = setTimeout(kickWatch, KICK_POLL_MS);
    };
    kickWatch();

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

    /* ═══ مرحله ۰/۵: خروجی (exit) — تنها نقطه‌ی اتصالِ بالادست به مسیر تونل ═══
       این بلوک تنها جایی است که منطقِ سرور خروجی وارد مسیر تونل می‌شود. قبلش
       هدر پارس و احراز هویت شده، و بعدش همان مسیرِ همیشگی است. openExitSocket
       شیئی هم‌شکل با سوکت برمی‌گرداند، پس پایپ و شمارشِ مصرف تغییر نمی‌کنند.
       ⚠️ هر خطایی (نرسیدن به سرور، شکستِ هندشیک، انتقالِ پشتیبانی‌نشده) فقط
       گزارش می‌شود و مسیر مستقیم ادامه می‌دهد — اتصالِ کاربر قطع نمی‌شود. */
    if (exitRoutingEnabled(st)) {
      const ex = resolveExit(st, user);
      if (ex.mode === 'exit' && ex.server) {
        try {
          const up = await openExitSocket(ex.server, info);
          sock = up;
          EXIT_STATS.tunnels++;
          EXIT_STATS.lastAt = Date.now();
          /* retry داده نمی‌شود: مسیرِ خروجی با ProxyIP معنا ندارد */
          remoteToWs(up, respHeader, null);
          return;
        } catch (e) {
          EXIT_STATS.fallbacks++;
          exitNote('[' + ex.server.name + '] ' + String((e && e.message) || e));
          try { console.log('[SG] exit failed, falling back to direct:', EXIT_LAST_ERR); } catch (e2) {}
          sock = null;
          /* ادامه به مسیر مستقیم — هیچ استثنایی بالا نمی‌رود */
        }
      }
    }

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

/* ═══════════════════════════════════════════════════════════════════════════
   Durable Object: شمارنده‌ی سراسریِ اتصال‌ها (محدودیت همزمان بر اساس IP)
   ───────────────────────────────────────────────────────────────────────────
   چرا؟ هر ورکر روی isolateهای متعدد اجرا می‌شود و حافظه‌ی آن‌ها مشترک نیست؛
   یک Map در حافظه نمی‌تواند اتصال‌های کل ورکر را بشمارد. این شیء دقیقاً یک
   نمونه برای کل ورکر است (idFromName('global'))، پس شمارش آن سراسری است:
   اتصالِ سومِ یک IP، در هر isolate ای که بیفتد، رد می‌شود.

   ساختار: "uuid|ip" -> Map<connId, lastTs>
   • acquire: تعدادِ زنده را می‌شمرد؛ اگر به سقف رسیده باشد رد می‌کند
   • release : فقط همان connId را حذف می‌کند (هرگز سهمیه‌ی دیگری را کم نمی‌کند)
   • touch   : تمدید — فقط ردیفِ موجود را به‌روز می‌کند، هرگز درج نمی‌کند
   • کهنه‌ها (بدون فعالیت برای CONN_TTL) هنگام شمارش نادیده گرفته می‌شوند
   ═══════════════════════════════════════════════════════════════════════════ */
export class ConnLimiter {
  constructor(state) {
    this.state = state;
    /* حافظه‌ی داخلِ شیء — بین فراخوانی‌ها زنده می‌ماند (تنها یک نمونه وجود دارد) */
    this.users = new Map();          // uuid -> Map<ip, Map<connId, ts>>
    this.kicks = new Map();          // 'uuid|ip|connId' -> until (نشست‌های قطع‌شده از پنل)
  }

  /** آیا این نشست در بازه‌ی ممنوعیتِ «قطع» است؟ مؤلفه‌ی خالیِ کلید = wildcard */
  isKicked(uuid, ip, connId, now) {
    for (const [k, until] of this.kicks) {
      if (until <= now) { this.kicks.delete(k); continue; }
      const p = k.split('|');
      if (p[0] && p[0] !== String(uuid || '')) continue;
      if (p[1] && p[1] !== String(ip || '')) continue;
      if (p[2] && p[2] !== String(connId || '')) continue;
      return true;
    }
    return false;
  }

  /** حذفِ ورودی‌های مرده؛ می‌گرداند: Map<ip, تعداد اتصال‌های زنده> */
  prune(uuid, now) {
    const um = this.users.get(uuid);
    const out = new Map();
    if (!um) return out;
    um.forEach((m, ip) => {
      if (!m || !(m instanceof Map)) { um.delete(ip); return; }
      m.forEach((ts, id) => { if (!ts || now - ts > CONN_TTL) m.delete(id); });
      if (!m.size) um.delete(ip);
    });
    um.forEach((m, ip) => { if (m && m.size) out.set(ip, m.size); });
    if (!um.size) this.users.delete(uuid);
    return out;
  }

  async fetch(req) {
    const url = new URL(req.url);
    let b = {};
    try { b = await req.json(); } catch (e) { b = {}; }
    const now = Number(b.now) || Date.now();
    const uuid = String(b.uuid || '');
    const ip = String(b.ip || '');
    const limit = Number(b.limit) || 0;
    const j = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });

    if (url.pathname === '/acquire') {
      if (!uuid || !ip) return j({ ok: true, ips: 0, conns: 0, limit, enforced: false, reason: 'missing-identity' });
      if (this.isKicked(uuid, ip, String(b.connId || ''), now)) {
        return j({ ok: false, ips: 0, conns: 0, limit, enforced: true, storage: 'do', reason: 'kicked' });
      }
      let um = this.users.get(uuid);
      if (!um) { um = new Map(); this.users.set(uuid, um); }
      const ips = this.prune(uuid, now);
      const dec = admitDecision(ips, ip, limit);
      if (!dec.ok) {
        return j({ ok: false, ips: ips.size, conns: ips.get(ip) || 0, limit, enforced: true, storage: 'do', reason: dec.reason });
      }
      /* prune ممکن است کاربر را (در صورت خالی شدن) حذف کرده باشد — دوباره ثبت می‌شود */
      if (!this.users.has(uuid)) this.users.set(uuid, um);
      let m = um.get(ip);
      if (!m) { m = new Map(); um.set(ip, m); }
      m.set(String(b.connId), now);
      return j({ ok: true, ips: um.size, conns: m.size, limit, enforced: limit > 0, id: String(b.connId), reason: dec.reason, storage: 'do' });
    }

    if (url.pathname === '/release') {
      const um = this.users.get(uuid);
      let left = 0;
      if (um) {
        const m = um.get(ip);
        if (m) {
          if (b.connId) m.delete(String(b.connId));
          else { const f = m.keys().next(); if (!f.done) m.delete(f.value); }
          left = m.size;
          if (!left) um.delete(ip);
        }
        if (!um.size) this.users.delete(uuid);
      }
      return j({ ok: true, left });
    }

    if (url.pathname === '/touch') {
      if (this.isKicked(uuid, ip, String(b.connId || ''), now)) {
        return j({ ok: false, kicked: true, storage: 'do', reason: 'kicked' });
      }
      const um = this.users.get(uuid);
      if (um) {
        const m = um.get(ip);
        if (m && b.connId && m.has(String(b.connId))) m.set(String(b.connId), now);
      }
      return j({ ok: true });
    }

    /* ثبتِ نشستِ قطع‌شده از پنل — تا پایانِ until همان connId پذیرفته/تمدید نمی‌شود */
    if (url.pathname === '/kick') {
      const k = [uuid, ip, String(b.connId || '')].join('|');
      this.kicks.set(k, Number(b.until) || now + 90000);
      return j({ ok: true });
    }

    if (url.pathname === '/list') {
      const out = new Map();
      const um = this.users.get(uuid);
      if (um) {
        const ips = this.prune(uuid, now);
        ips.forEach((n, ipk) => {
          let last = 0;
          const m = um.get(ipk);
          if (m) m.forEach((ts) => { if (ts > last) last = ts; });
          out.set(ipk, { ip: ipk, conns: n, last_active: last });
        });
      }
      const sessions = [...out.values()].sort((a, c) => (c.conns || 0) - (a.conns || 0));
      return j({ ok: true, sessions });
    }

    /* آزادسازیِ دستی — اگر uuid داده شده باشد فقط همان کاربر */
    if (url.pathname === '/reset') {
      let removed = 0;
      const count = (um) => { if (um) um.forEach((m) => { if (m) removed += m.size; }); };
      if (uuid && this.users.has(uuid)) { count(this.users.get(uuid)); this.users.delete(uuid); }
      else if (!uuid) { this.users.forEach((um) => count(um)); this.users.clear(); }
      return j({ ok: true, removed });
    }

    /* ریزِ ردیف‌ها با سن‌شان — برای کارتِ سلامت (تشخیصِ «کدام آی‌پی قفل کرده») */
    if (url.pathname === '/dump') {
      const rows = [];
      const list = uuid ? [uuid] : [...this.users.keys()];
      for (const u of list) {
        if (!this.users.has(u)) continue;
        this.prune(u, now);                                  /* مرده‌ها اول پاک می‌شوند */
        const um = this.users.get(u);
        if (!um) continue;
        um.forEach((m, ip) => { if (m) m.forEach((ts, id) => rows.push({ uuid: u, ip, conn_id: id, last_ts: ts })); });
      }
      rows.sort((a, c) => (a.last_ts || 0) - (c.last_ts || 0));
      return j({ ok: true, rows: rows.slice(0, 200) });
    }

    return j({ ok: false, error: 'unknown-path' });
  }
}

/* ════════════════════════════ ورودی ════════════════ */
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

      /* ── کلیدهای استتار (قبلاً فقط در تنظیمات بودند و هیچ جا خوانده نمی‌شدند) ──
         disguise: پیش‌فرض روشن؛ با خاموش بودن، ریشه (/) هم پنل را نشان می‌دهد.
         panic:    پنل و اشتراک هم پشتِ سایت پوششی پنهان می‌شوند. */
      const refresh = url.searchParams.get('refresh') === '1';
      const disguiseOn = s.auth.disguise !== false;
      const panicOn = !!s.auth.panic;
      const cover = () => decoyPage(s, refresh, request, url);
      const panelHtml = async () => new Response(await loadUI(env, false), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...secHeaders(s) },
      });

      const isPanel = path === route || path === route + '/dash';
      const isSub   = path.startsWith(route + '/sub');
      const isHealth = path === '/health' || path.startsWith('/api/');

      /* health و api همیشه آزادند (برای مانیتورینگ) — حتی در وضعیت اضطراری،
         وگرنه نه راهی برای خاموش کردنش می‌ماند و نه برای مانیتورینگ */
      if (isHealth) { try { return await apiHandler(request, env, url, ctx); } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }, 500); } }

      /* ۳) پنل — روی مسیر مخفی (در وضعیت اضطراری: سایت پوششی) */
      if (isPanel) {
        if (panicOn) return cover();
        return panelHtml();
      }

      /* ۴) اشتراک — روی مسیر مخفی (در وضعیت اضطراری: سایت پوششی) */
      if (isSub) {
        if (panicOn) return cover();
        const id = path.split('/').pop();
        const newUrl = new URL(url);
        newUrl.pathname = '/' + s.sub.path + '/' + (id || '');
        return subHandler(request, env, newUrl, cf, false);
      }

      /* ۵) صفحه‌ی کاربر (اختیاری، مسیر مستقیم) */
      if (path.startsWith('/status/')) return panicOn ? cover() : subHandler(request, env, url, cf, true);
      if (path.startsWith('/' + s.sub.path + '/')) return panicOn ? cover() : subHandler(request, env, url, cf, false);

      /* ۶) ریشه — با استتارِ خاموش پنل، وگرنه سایت پوششی
         (وضعیت اضطراری همیشه سایت پوششی را نشان می‌دهد) */
      if (path === '/') return (!panicOn && !disguiseOn) ? panelHtml() : cover();

      /* ۷) تست سلامت مسیر — فقط وقتی استتار خاموش است؛ وگرنه هر رباتی با
         یک ?test=1 می‌توانست بفهمد این دامنه یک تونل است */
      if (!disguiseOn && url.searchParams.get('test') === '1') {
        return txt('TUNNEL_OK • host=' + url.hostname + '\nمسیر تونل فعال است.', { 'x-tunnel': 'ok' });
      }

      /* ۸) همه‌ی مسیرهای دیگر = سایت پوششی (استتار مثل نهان) */
      return cover();
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
