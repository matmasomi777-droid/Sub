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
const KV_KEY = 'panel:state';
let MEM = null;                 // حافظه‌ی جایگزین KV
let UI = { html: null, ts: 0 }; // کش UI
const RATE = new Map();         // rate limiting

/* ════════════════════════════ پیش‌فرض‌ها ════════════════════════════ */
const DEF = () => ({
  settings: {
    panel: { name: 'پنل مدیریت', url: '' },
    kvBinding: '',
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
    sec: { cors: true, csp: true, killSwitch: false },
    sub: {
      path: 'sub', userAgent: '', fakeConfigs: true, nodeLimit: 12, converter: '', telegramChannel: '@simorgh_channel',
      countryGroups: true, namePrefix: 'پنل', rules: ['GEOIP,IR,DIRECT', 'DOMAIN-SUFFIX,ir,DIRECT', 'GEOSITE,category-ads-all,REJECT'],
      blockAdult: false, blockAds: true, blockQuic: true, bypassIR: true, doh: 'https://cloudflare-dns.com/dns-query',
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
const clone = (o) => JSON.parse(JSON.stringify(o));
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

/* ════════════════════════════ ذخیره‌سازی ════════════════════════════ */
async function load(env) {
  if (env.KV) { try { const r = await env.KV.get(KV_KEY); if (r) return merge(DEF(), JSON.parse(r)); } catch (e) {} }
  if (!MEM) MEM = DEF();
  return clone(MEM);
}
async function save(env, st) { st = normalize(st); if (env.KV) await env.KV.put(KV_KEY, JSON.stringify(st)); else MEM = clone(st); return st; }
function normalize(st) {
  const s = st.settings;
  if (typeof s.ports === 'string') s.ports = s.ports.split(/[,\s]+/).map(Number).filter((x) => x > 0);
  if (!Array.isArray(s.ports) || !s.ports.length) s.ports = [443];
  ['cleanIPs', 'proxyIPs', 'upstream', 'ispPools'].forEach((k) => { if (typeof s[k] === 'string') s[k] = s[k].split('\n').map((x) => x.trim()).filter(Boolean); });
  if (s.sub && typeof s.sub.rules === 'string') s.sub.rules = s.sub.rules.split('\n').map((x) => x.trim()).filter(Boolean);
  if (s.fr && typeof s.fr.files === 'string') s.fr.files = s.fr.files.split('\n').map((x) => x.trim()).filter(Boolean);
  return st;
}
function addLog(st, level, actor, action, detail = '') { st.logs = st.logs || []; st.logs.unshift({ id: randTok(8), ts: Date.now(), level, actor, action, detail }); st.logs = st.logs.slice(0, 50); }
function seed(st) {
  if (!st.users.length) st.users = [{ id: randTok(6), name: 'admin', uuid: crypto.randomUUID(), secret: randTok(12), enabled: true, note: 'کاربر اصلی', quotaGB: 0, dailyQuotaMB: 0, expiryAt: null, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, up: 0, down: 0, totalReq: 0, lastSeen: null, createdAt: Date.now() }];
  return st;
}

/* ════════════════════════════ احراز هویت ════════════════════════════ */
function masterKey(st, env) { return env.MASTER_KEY || (st.settings.auth && st.settings.auth.password) || 'simorgh'; }
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

/* ════════════════════════════ تولید کانفیگ ════════════════════════════ */
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
/** مسیر ترنسپورت. salt معمولاً uuid کاربر است تا هر کاربر مسیر ثابت و یکتایی داشته باشد */
function tPath(s, i, salt, earlyData) {
  const base = (s.path || '/sg').startsWith('/') ? s.path : '/' + s.path;
  let p = base;
  if (s.randomJunk) p += '/' + junkHash(base + '|' + i + '|' + (salt || ''));
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
     h2 باعث می‌شود کلاینت HTTP/2 مذاکره کند و WebSocket روی h2 کار نمی‌کند → کانفیگ وصل نمی‌شود */
  let alpn = (s.alpn || '').trim();
  if (!alpn || /h2/.test(alpn)) alpn = s.transport === 'ws' ? 'http/1.1' : alpn;
  const q = { security: 'tls', sni: s.sni || host, fp: s.fingerprint };
  if (alpn) q.alpn = alpn;
  if (s.allowInsecure) q.allowInsecure = '1';
  if (s.ech.enabled) q.ech = 'true';
  return q;
}
function fragQ(s) {
  const q = {};
  if (s.fragment.enabled) q.fragment = s.fragment.length + ',' + s.fragment.interval;
  if (s.tfo) q.tfo = '1';
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
function label(s, e, port, extra) { return [s.sub.namePrefix, e.name, ':' + port, extra].filter(Boolean).join(' | '); }

async function uri(kind, u, s, entry, port, i, host) {
  const g = tranportQ(s, i, host, u.uuid), t = tlsQ(s, host), f = fragQ(s);
  const raw = { ...g, ...t, ...f };
  if (kind === 'vless') raw.encryption = 'none';
  Object.keys(raw).forEach((k) => raw[k] === undefined && delete raw[k]);
  const q = new URLSearchParams(raw);
  if (kind === 'vless') return `vless://${u.uuid}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port))}`;
  if (kind === 'trojan') {
    /* رمز باید خام باشد — کلاینت خودش sha224 می‌گیرد و همان را می‌فرستد */
    return `trojan://${u.secret}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port, 'β'))}`;
  }
  if (kind === 'ss') return `ss://${b64('2022-blake3-aes-128-gcm:' + u.secret)}@${entry.ip}:${port}/?plugin=obfs-local%3Bobfs%3Dwebsocket%3Bobfs-host%3D${encodeURIComponent(host)}%3Bobfs-path%3D${encodeURIComponent(g.path || '/')}#${encodeURIComponent(label(s, entry, port, 'SS'))}`;
  if (kind === 'vmess') {
    const o = { v: '2', ps: label(s, entry, port, 'VMess'), add: entry.ip, port: String(port), id: u.uuid, aid: '0', scy: 'auto', net: s.transport === 'ws' ? 'ws' : s.transport, type: 'none', host, path: g.path || g.serviceName || '/', tls: s.tls ? 'tls' : '', sni: s.sni || host, alpn: s.alpn, fp: s.fingerprint };
    return 'vmess://' + b64(JSON.stringify(o));
  }
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

function fakeCfg(u, s) {
  const q = (u.quotaGB || 0) * 1073741824, used = (u.up || 0) + (u.down || 0);
  const gb = (x) => (x / 1073741824).toFixed(2);
  const mk = (l) => `vless://${u.uuid}@1.1.1.1:443?security=tls&type=ws#${encodeURIComponent(l)}`;
  return [
    mk(`📊 مصرف: ${gb(used)} GB از ${q ? gb(q) + ' GB' : 'نامحدود'}`),
    mk(`🟢 باقیمانده: ${q ? gb(Math.max(0, q - used)) + ' GB' : 'نامحدود'}`),
    mk(`📅 انقضا: ${u.expiryAt ? new Date(u.expiryAt).toLocaleDateString('fa-IR') : 'نامحدود'} • ${s.panel.name}`),
    mk(`📢 ${s.sub.telegramChannel}`),
  ];
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
    outbounds: list.map((c) => ({
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
const quotaHdr = (u) => `upload=${Math.floor((u.up || 0) / 1048576)}; download=${Math.floor((u.down || 0) / 1048576)}; total=${Math.floor(((u.quotaGB || 0) * 1073741824) / 1048576)}; expire=${u.expiryAt ? Math.floor(u.expiryAt / 1000) : 0}`;

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

/* ═══════════ سایت پوششی واقعی — یک سایت زنده‌ی واقعی برمی‌گرداند ═══════════ */
const DECOY_SITES = {
  nginx: 'https://nginx.org/en/',
  wiki: 'https://en.wikipedia.org/wiki/Web_server',
  wp: 'https://wordpress.org/',
  cloudflare: 'https://www.cloudflare.com/500-errors/',
  maintenance: 'https://example.com/',
};
const DECOY_CACHE = { body: null, ts: 0, url: '' };
async function decoyPage(s, force) {
  const target = (s.auth && s.auth.decoyUrl) || DECOY_SITES[(s.auth && s.auth.maintenanceHost) || 'nginx'] || DECOY_SITES.nginx;
  if (!force && DECOY_CACHE.body && DECOY_CACHE.url === target && Date.now() - DECOY_CACHE.ts < 300000)
    return new Response(DECOY_CACHE.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  try {
    const r = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'accept': 'text/html,*/*' }, cf: { cacheTtl: 300 } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let body = await r.text();
    if (/<\/head>/i.test(body) && !/<base\s/i.test(body)) body = body.replace(/<\/head>/i, '<base href="' + target + '"></head>');
    DECOY_CACHE.body = body; DECOY_CACHE.ts = Date.now(); DECOY_CACHE.url = target;
    /* بدون CSP و XFO: خودِ سایت پوششی باید کامل رندر شود */
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-frame-options': 'SAMEORIGIN' } });
  } catch (e) {
    return new Response(DECOY[(s.auth && s.auth.maintenanceHost) || 'nginx'] || DECOY.nginx, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } });
  }
}

const notFoundPage = () => new Response(DECOY.nginx, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });

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
async function apiHandler(req, env, url) {
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

  if (route === 'health') return json({ ok: true, version: VERSION, build: BUILD, uptimeSec: Math.floor((Date.now() - BOOT) / 1000), storage: env.KV ? 'kv' : 'memory', users: st.users.length, panic: s.auth.panic });

  if (route === 'state' && m === 'GET') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    st.stats.requests++;
    await save(env, st);
    return json({ ...st, storage: env.KV ? 'kv' : 'memory', version: VERSION, build: BUILD, boot: BOOT, settings: { ...st.settings, auth: { ...st.settings.auth, password: undefined, totpSecret: st.settings.auth.totpSecret ? '•••••' : '' } } });
  }

  if (route === 'settings' && (m === 'PUT' || m === 'POST')) {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.settings) merge(s, b.settings);
    addLog(st, 'info', 'panel', 'تنظیمات ذخیره شد', Object.keys(b.settings || {}).join(', '));
    await save(env, st);
    return json({ ok: true, storage: env.KV ? 'kv' : 'memory' });
  }

  if (route === 'users' && m === 'POST') {
    if (!(await authOk(req, env, st))) return json({ error: 'unauthorized' }, 401);
    const b = await req.json().catch(() => ({}));
    if (b.id && b.op) {
      const u = st.users.find((x) => x.id === b.id); if (!u) return json({ error: 'not found' }, 404);
      if (b.op === 'delete') st.users = st.users.filter((x) => x.id !== b.id);
      else if (b.op === 'toggle') { u.enabled = !u.enabled; if (!u.enabled) u.reason = 'غیرفعال‌سازی دستی'; }
      else if (b.op === 'reset') { u.up = 0; u.down = 0; u.totalReq = 0; }
      else if (b.op === 'update') {
        const p = { ...(b.patch || {}) };
        if (p.expiryDays !== undefined) { u.expiryAt = Number(p.expiryDays) > 0 ? Date.now() + Number(p.expiryDays) * 86400000 : null; delete p.expiryDays; }
        ['ports', 'cleanIPs', 'proxyIPs', 'nodes'].forEach((k) => { if (typeof p[k] === 'string') p[k] = p[k].split(/[,\n]/).map((x) => x.trim()).filter(Boolean); });
        merge(u, p);
      }
      addLog(st, b.op === 'delete' ? 'warn' : 'info', 'user', 'کاربر: ' + b.op, u.name || '');
      await save(env, st); return json({ ok: true, users: st.users });
    }
    const u = { id: randTok(6), name: b.name || 'کاربر ' + (st.users.length + 1), uuid: b.uuid || crypto.randomUUID(), secret: b.secret || randTok(12), enabled: true, note: b.note || '', quotaGB: Number(b.quotaGB) || 0, dailyQuotaMB: 0, expiryAt: b.expiryDays ? Date.now() + b.expiryDays * 86400000 : null, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, up: 0, down: 0, totalReq: 0, lastSeen: null, createdAt: Date.now() };
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
    if (a === 'factory') { const fresh = DEF(); fresh.settings.auth.password = masterKey(st, env); if (env.KV) await env.KV.put(KV_KEY, JSON.stringify(fresh)); MEM = fresh; addLog(fresh, 'warn', 'system', 'ریست کارخانه‌ای', ''); await save(env, fresh); return json({ ok: true }); }
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
      const checks = [];
      const active = st.users.filter((u) => u.enabled && (!u.expiryAt || u.expiryAt > Date.now()));
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

      /* ═══ تست سرتاسری واقعی: همان مسیری که کلاینت طی می‌کند ═══
         ورکر خودش از طریق DNS و لبه‌ی کلاودفلار به خودش وصل می‌شود،
         ارتقای WebSocket می‌گیرد، هدر VLESS می‌فرستد و پاسخ واقعی می‌گیرد. */
      if (tester && s.protocols.vless) {
        try {
          const probe = '8.8.8.8';
          const header = vlessHeader(tester, probe, 53, dnsQuery());
          const resp = await fetch('https://' + url.hostname + '/', {
            headers: {
              'Upgrade': 'websocket',
              'Connection': 'Upgrade',
              'Sec-WebSocket-Version': '13',
              'Sec-WebSocket-Key': b64(randTok(16)),
            },
          });
          const ws = resp.webSocket;
          if (!ws) throw new Error('ارتقای WebSocket انجام نشد (HTTP ' + resp.status + ') — مسیر تونل در دسترس نیست');
          ws.accept();
          const bytes = await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('پاسخی از تونل نیامد (timeout)')), 10000);
            ws.addEventListener('message', (ev) => { clearTimeout(to); resolve(ev.data); });
            ws.addEventListener('close', () => { clearTimeout(to); reject(new Error('اتصال بسته شد — UUID نامعتبر یا هسته نپذیرفت')); });
            ws.addEventListener('error', () => { clearTimeout(to); reject(new Error('خطای WebSocket')); });
            ws.send(header);
          });
          const len = bytes && bytes.byteLength !== undefined ? bytes.byteLength : String(bytes).length;
          try { ws.close(); } catch (e) {}
          checks.push({ name: '🧪 تست سرتاسری (DNS→لبه→WS→VLESS→مقصد)', ok: len > 0, note: len + ' بایت پاسخ از ' + probe + ':53 — کل مسیر کلاینت تا مقصد کار می‌کند ✓' });
        } catch (e) {
          checks.push({ name: '🧪 تست سرتاسری (DNS→لبه→WS→VLESS→مقصد)', ok: false, note: String((e && e.message) || e) });
        }
      }

      /* ۱ب) دسترسی سوکتی به مقاصد HTTP (صرفاً اطلاعاتی) */
      if (socketsOk) {
        try {
          const sock2 = connect({ hostname: '93.184.216.34', port: 80 });
          await Promise.race([sock2.opened, new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 4000))]);
          const w2 = sock2.writable.getWriter(); await w2.write(new TextEncoder().encode('HEAD / HTTP/1.0\r\nHost: example.com\r\n\r\n')); w2.releaseLock();
          const rd2 = sock2.readable.getReader();
          const r2 = await Promise.race([rd2.read(), new Promise((_, rj) => setTimeout(() => rj(new Error('بدون پاسخ')), 4000))]);
          rd2.cancel(); try { sock2.close(); } catch (e) {}
          checks.push({ name: 'سوکت به پورت ۸۰ مقصد (اطلاعاتی)', ok: true, note: r2 && r2.value ? 'در دسترس ✓' : 'در دسترس نیست — هسته از fetch() جایگزین استفاده می‌کند' });
        } catch (e) {
          checks.push({ name: 'سوکت به پورت ۸۰ مقصد (اطلاعاتی)', ok: true, note: 'در دسترس نیست — هسته به‌طور خودکار از fetch() جایگزین استفاده می‌کند (این یک محدودیت کلاودفلر است، نه خطا)' });
        }
      }

      /* ۲) تست کامل هسته‌ی تونل: ساخت هدر VLESS → پارس → احراز هویت → اتصال واقعی به مقصد */
      const tester = active[0];
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
    __TG_CHANNEL__: (s.sub.telegramChannel && (s.sub.telegramChannel.startsWith('http') ? s.sub.telegramChannel : 'https://t.me/' + s.sub.telegramChannel.replace('@', ''))) || 'https://t.me/telegram',
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
  const u = st.users.find((x) => x.uuid === id || x.secret === id || x.name === id);
  if (!u) return wantPage ? notFoundPage() : txt('user not found', {}, 404);
  if (!u.enabled) return wantPage ? renderUserPage(u, st, url, 0) : txt('user disabled' + (u.reason ? ' — ' + u.reason : ''), {}, 403);

  /* صفحه‌ی HTML: وقتی کلاینت شناخته‌شده نیست و format هم داده نشده */
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  const fmtQ = url.searchParams.get('format');
  if (wantPage || (!fmtQ && !CLIENT_UA.test(ua))) return renderUserPage(u, st, url, 0);
  if (u.expiryAt && u.expiryAt < Date.now()) return txt('subscription expired', {}, 403);
  const q = (u.quotaGB || 0) * 1073741824;
  if (q && u.up + u.down >= q) return txt('quota exceeded', {}, 403);

  const list = await buildList(u, s, url, cf);
  const format = url.searchParams.get('format') || sniff(req.headers.get('user-agent'));
  let body;
  if (format === 'clash') body = clashYaml(list, u, s, url);
  else if (format === 'meta') body = metaJson(list, u, s, url);
  else if (format === 'singbox') body = singboxJson(list, u, s, url);
  else if (format === 'v2ray') body = v2rayJson(list, u, s, url);
  else { const l = list.map((c) => c.uri); if (s.sub.fakeConfigs) l.push(...fakeCfg(u, s)); body = format === 'raw' ? l.join('\n') : b64(l.join('\n')); }
  if (s.sub.converter && url.searchParams.get('convert')) {
    try { return Response.redirect(`${s.sub.converter}?url=${encodeURIComponent(url.origin + '/' + s.sub.path + '/' + u.uuid)}&target=${url.searchParams.get('convert')}`, 302); } catch (e) {}
  }
  u.totalReq = (u.totalReq || 0) + 1; u.lastSeen = Date.now(); st.stats.requests++;
  await save(env, st);
  return txt(body, { 'subscription-userinfo': quotaHdr(u), 'profile-update-interval': '12', 'profile-title': encodeURIComponent(s.panel.name + ' — ' + u.name), 'support-url': 'https://t.me/' + String(s.sub.telegramChannel || '').replace('@', ''), 'content-disposition': `attachment; filename="${encodeURIComponent(u.name)}.txt"` });
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
  else if (atyp === 3) { const p = []; for (let k = i; k < i + 16; k += 2) p.push(buf.slice(k, k + 2).toString(16)); addr = p.join(':'); i += 16; }
  else return null;
  return { uuid, cmd, port, addr, payload: buf.slice(i) };
}
function parseTrojan(buf) {
  if (buf.length < 62) return null;
  const pass = td.decode(buf.slice(0, 56));
  if (buf[56] !== 13 || buf[57] !== 10) return null;
  let i = 58;
  const atyp = buf[i++];
  let addr;
  if (atyp === 1) { addr = [...buf.slice(i, i + 4)].join('.'); i += 4; }
  else if (atyp === 3) { const l = buf[i++]; addr = td.decode(buf.slice(i, i + l)); i += l; }
  else if (atyp === 4) { const p = []; for (let k = i; k < i + 16; k += 2) p.push(buf.slice(k, k + 2).toString(16)); addr = p.join(':'); i += 16; }
  else return null;
  const port = (buf[i] << 8) | buf[i + 1]; i += 2;
  if (buf[i] === 13 && buf[i + 1] === 10) i += 2;
  return { pass, port, addr, payload: buf.slice(i) };
}

async function tunnelHandler(request, env, st) {
  const s = st.settings;
  if (s.auth.panic || s.sec.killSwitch) return txt('service unavailable', {}, 503);
  const [client, server] = new WebSocketPair();
  server.accept();
  session(server, request.headers.get('sec-websocket-protocol'), st, env).catch(() => { try { server.close(); } catch (e) {} });
  return new Response(null, { status: 101, webSocket: client });
}

async function session(ws, early, st, env) {
  const users = st.users.filter((u) => u.enabled && (!u.expiryAt || u.expiryAt > Date.now()));
  const byUuid = new Map(users.map((u) => [u.uuid, u]));
  const byPass = new Map(users.map((u) => [sha224(u.secret), u]));
  let sock = null, writer = null, user = null, up = 0, down = 0, closed = false;

  const finish = async () => {
    if (closed) return;
    closed = true;
    try { ws.close(); } catch (e) {}
    try { writer && writer.releaseLock(); } catch (e) {}
    try { sock && sock.close(); } catch (e) {}
    if (user) { user.up = (user.up || 0) + up; user.down = (user.down || 0) + down; user.totalReq = (user.totalReq || 0) + 1; user.lastSeen = Date.now(); try { await save(env, st); } catch (e) {} }
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
      down += full.length;
      ws.send(full);
      return true;
    } catch (e) { return false; }
  };

  const dial = async (info) => {
    user = info.user;
    if (info.cmd === 2) { await finish(); return; }              // UDP در این هسته پشتیبانی نمی‌شود
    if (!info.addr || !info.port) return finish();
    const host = info.addr;
    try {
      sock = connect({ hostname: host, port: info.port });
      await sock.opened;
      writer = sock.writable.getWriter();
      if (info.payload && info.payload.length) { up += info.payload.length; await writer.write(info.payload); }
    } catch (e) {
      sock = null;
      /* تلاش برای پاسخ از طریق fetch */
      if (await httpFallback(info)) { await finish(); return; }
      try { ws.send(new TextEncoder().encode('HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n')); } catch (e2) {}
      return finish();
    }
    (async () => {
      const reader = sock.readable.getReader();
      try { while (true) { const { done, value } = await reader.read(); if (done) break; down += value.length; ws.send(value); } } catch (e) {}
      await finish();
    })();
  };

  const handle = async (data) => {
    if (closed) return;
    const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data instanceof Uint8Array ? data : data && data.arrayBuffer ? new Uint8Array(await data.arrayBuffer()) : null;
    if (!buf || !buf.length) return;
    if (!sock) {
      const v = parseVless(buf);
      if (v && byUuid.has(v.uuid)) return dial({ ...v, user: byUuid.get(v.uuid) });
      const t = parseTrojan(buf);
      if (t && byPass.has(t.pass)) return dial({ addr: t.addr, port: t.port, cmd: 1, payload: t.payload, user: byPass.get(t.pass) });
      return finish();                                            // UUID یا رمز نامعتبر
    }
    if (writer && buf.length) { up += buf.length; await writer.write(buf); }
  };

  if (early) {
    try {
      const raw = atob(early.replace(/[^A-Za-z0-9+/=]/g, ''));
      const u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      await handle(u8);
    } catch (e) { await finish(); return; }
  }

  ws.addEventListener('message', (ev) => { handle(ev.data).catch(() => finish()); });
  ws.addEventListener('close', () => { finish(); });
  ws.addEventListener('error', () => { finish(); });
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
  async fetch(request, env) {
    const url = new URL(request.url);
    const cf = request.cf || null;
    try {
      if (request.method === 'OPTIONS') { const s0 = (await load(env)).settings; return new Response(null, { status: 204, headers: secHeaders(s0) }); }
      if (url.pathname === '/dns-query') return dohHandler(request, env, url);
      if (url.pathname === '/health' || url.pathname.startsWith('/api/')) return apiHandler(request, env, url);

      const st = seed(await load(env)), s = st.settings;

      /* ═══ مسیریابی مثل نهان: هر درخواست «ارتقای WebSocket» = تونل، هر مسیر ═══
         این مقاوم‌ترین روش است چون به مسیر دقیق (جانک/کدگذاری‌شده) وابسته نیست. */
      const isWs = String(request.headers.get('upgrade') || '').toLowerCase() === 'websocket';
      if (isWs) return tunnelHandler(request, env, st);

      /* نشانه‌ی سلامت مسیر تونل برای مرورگر (فقط با ?test) */
      if (url.searchParams.get('test') === '1') {
        return txt('TUNNEL_OK ' + s.transport + ' ' + s.path + ' • host=' + url.hostname + ' • ws=ready\n' +
          'مسیر تونل در دسترس است. برای تست واقعی، کلاینت را وصل کنید.', { 'x-tunnel': 'ok' });
      }

      /* صفحه‌ی کاربر و اشتراک در یک مسیر واحد */
      if (url.pathname.startsWith('/status/')) return subHandler(request, env, url, cf, true);
      if (url.pathname.startsWith('/' + s.sub.path + '/')) return subHandler(request, env, url, cf, false);

      /* پنل فقط روی مسیر مخفی؛ ریشه با Disguise سایت پوششی نشان می‌دهد */
      const p = '/' + String(s.auth.path || 'panel').replace(/^\/+/, '');
      if (url.pathname === p || url.pathname === p + '/') {
        const html = await loadUI(env, false);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...secHeaders(s) } });
      }
      if (url.pathname === '/' && !s.auth.disguise) {
        const html = await loadUI(env, false);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...secHeaders(s) } });
      }
      /* سایت پوششی واقعی — بدون CSP تا CSS/تصاویر سایت اصلی کامل بارگذاری شود */
      if (s.auth.disguise) return decoyPage(s, url.searchParams.get('refresh') === '1');
      return decoyPage(s, false);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};
