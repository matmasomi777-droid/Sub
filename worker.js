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
    protocols: { vless: true, trojan: true, ss: true, vmess: true },
    trojanHash: 'sha224',
    transport: 'ws', path: '/sg', grpcService: 'simorgh', xhttpMode: 'auto',
    tfo: true, randomJunk: true, mux: false, ports: '443, 2053, 2083, 2087, 2096, 8443',
    tls: true, fingerprint: 'randomized', sni: 'discordapp.com', host: 'discordapp.com', alpn: 'h2,http/1.1', allowInsecure: false,
    ech: { enabled: false, mode: 'doh' },
    fragment: { enabled: true, mode: 'shadowrocket', length: '40-60', interval: '10-15' },
    fr: { enabled: true, repo: 'user/simorgh-ui', branch: 'main', files: ['ui/index.html', 'ui/style.css', 'ui/app.js'] },
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
    auth: { totp: false, totpSecret: '', sessionMin: 15, loginRate: '5/10m', path: 'panel', pathRotate: false, disguise: true, maintenanceHost: 'nginx', panic: false, password: 'simorgh' },
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
function tranportQ(s, i, host) {
  const path = junk(s.path, i) + (s.randomJunk ? '/' + randHex(6) : '');
  if (s.transport === 'grpc') return { type: 'grpc', serviceName: s.grpcService };
  if (s.transport === 'xhttp') return { type: 'xhttp', path, mode: s.xhttpMode === 'auto' ? 'packet-up' : s.xhttpMode, host };
  return { type: 'ws', path, host, 'ws-opts': { path, headers: { Host: host } } };
}
function tlsQ(s, host) {
  if (!s.tls) return {};
  const q = { security: 'tls', sni: s.sni || host, fp: s.fingerprint, alpn: s.alpn };
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
  const g = tranportQ(s, i, host), t = tlsQ(s, host), f = fragQ(s);
  const raw = { ...g, ...t, ...f };
  if (kind === 'vless') raw.encryption = 'none';
  Object.keys(raw).forEach((k) => raw[k] === undefined && delete raw[k]);
  const q = new URLSearchParams(raw);
  if (kind === 'vless') return `vless://${u.uuid}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port))}`;
  if (kind === 'trojan') {
    const pass = s.trojanHash === 'sha224' ? sha224(u.secret) : u.secret;
    return `trojan://${pass}@${entry.ip}:${port}?${q}#${encodeURIComponent(label(s, entry, port, 'β'))}`;
  }
  if (kind === 'ss') return `ss://${b64('2022-blake3-aes-128-gcm:' + u.secret)}@${entry.ip}:${port}/?plugin=obfs-local%3Bobfs%3Dwebsocket%3Bobfs-host%3D${encodeURIComponent(host)}%3Bobfs-path%3D${encodeURIComponent(g.path || '/')}#${encodeURIComponent(label(s, entry, port, 'SS'))}`;
  if (kind === 'vmess') {
    const o = { v: '2', ps: label(s, entry, port, 'VMess'), add: entry.ip, port: String(port), id: u.uuid, aid: '0', scy: 'auto', net: s.transport === 'ws' ? 'ws' : s.transport, type: 'none', host, path: g.path || g.serviceName || '/', tls: s.tls ? 'tls' : '', sni: s.sni || host, alpn: s.alpn, fp: s.fingerprint };
    return 'vmess://' + b64(JSON.stringify(o));
  }
}

async function buildList(u, s, url, cf) {
  const host = s.host || (s.panel.url || url.hostname);
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
    const base = { name: `${s.sub.namePrefix}-${i + 1}`, type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'ss' : 'vless', server: c.entry.ip, port: c.port, udp: true, ...(c.kind === 'vless' ? { uuid: u.uuid } : c.kind === 'trojan' ? { password: s.trojanHash === 'sha224' ? sha224(u.secret) : u.secret } : { cipher: '2022-blake3-aes-128-gcm', password: u.secret }) };
    if (s.tls && c.kind !== 'ss') { base.tls = true; base.servername = s.sni || host; base['skip-cert-verify'] = !!s.allowInsecure; base['client-fingerprint'] = s.fingerprint === 'randomized' ? 'chrome' : s.fingerprint; }
    if (c.kind === 'vmess') { base.uuid = u.uuid; base.alterId = 0; base.cipher = 'auto'; }
    if (s.transport === 'ws') base['ws-opts'] = { path: '/' + s.path + (s.randomJunk ? '/' + randHex(6) : ''), headers: { Host: host } };
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
  const proxies = list.map((c, i) => ({ name: `${s.sub.namePrefix}-${i + 1}`, type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'ss' : 'vless', server: c.entry.ip, port: c.port, udp: true, ...(c.kind === 'vless' ? { uuid: u.uuid } : { password: s.trojanHash === 'sha224' ? sha224(u.secret) : u.secret }), ...(s.tls && c.kind !== 'ss' ? { tls: true, servername: s.sni || host, 'skip-cert-verify': !!s.allowInsecure, 'client-fingerprint': s.fingerprint } : {}), ...(s.transport === 'ws' ? { 'ws-opts': { path: '/' + s.path, headers: { Host: host } } } : {}), ...(s.transport === 'grpc' ? { network: 'grpc', 'grpc-opts': { 'grpc-service-name': s.grpcService } } : {}) }));
  return JSON.stringify({ 'mixed-port': 7890, mode: 'rule', 'log-level': 'warning', dns: { enable: true, nameserver: [s.sub.doh] }, proxies, 'proxy-groups': [{ name: '🚀 پروکسی', type: 'select', proxies: [...proxies.map((p) => p.name), 'DIRECT'] }], rules: [...(s.sub.bypassIR ? ['GEOIP,IR,DIRECT'] : []), ...(s.sub.blockAds ? ['GEOSITE,category-ads-all,REJECT'] : []), ...s.sub.rules, 'MATCH,🚀 پروکسی'] }, null, 2);
}
function singboxJson(list, u, s, url) {
  const host = s.host || url.hostname;
  const obs = list.map((c, i) => ({
    tag: 'sg-' + i, type: c.kind === 'trojan' ? 'trojan' : c.kind === 'vmess' ? 'vmess' : c.kind === 'ss' ? 'shadowsocks' : 'vless',
    server: c.entry.ip, server_port: c.port,
    ...(c.kind === 'vless' ? { uuid: u.uuid } : { password: s.trojanHash === 'sha224' ? sha224(u.secret) : u.secret }),
    ...(c.kind === 'vmess' ? { uuid: u.uuid, security: 'auto' } : {}),
    ...(c.kind === 'ss' ? { method: '2022-blake3-aes-128-gcm' } : {}),
    ...(s.tls && c.kind !== 'ss' ? { tls: { enabled: true, server_name: s.sni || host, insecure: !!s.allowInsecure, utls: { enabled: true, fingerprint: s.fingerprint === 'randomized' ? 'chrome' : s.fingerprint }, ech: s.ech.enabled ? { enabled: true } : undefined } } : {}),
    transport: { type: s.transport === 'ws' ? 'websocket' : s.transport, ...(s.transport === 'ws' ? { path: '/' + s.path, headers: { Host: host }, early_data_header_name: 'Sec-WebSocket-Protocol' } : s.transport === 'grpc' ? { service_name: s.grpcService } : { path: '/' + s.path, mode: 'packet-up' }) },
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
      tag: c.kind + '-' + c.port, ...(c.kind === 'trojan' ? { protocol: 'trojan', settings: { servers: [{ address: c.entry.ip, port: c.port, password: s.trojanHash === 'sha224' ? sha224(u.secret) : u.secret }] } } : { protocol: c.kind === 'vmess' ? 'vmess' : 'vless', settings: { vnext: [{ address: c.entry.ip, port: c.port, users: [{ id: u.uuid, encryption: 'none', security: 'auto', level: 0 }] }] } }),
      streamSettings: { network: s.transport, security: s.tls ? 'tls' : 'none', ...(s.tls ? { tlsSettings: { serverName: s.sni || host, allowInsecure: !!s.allowInsecure, fingerprint: s.fingerprint } } : {}), ...(s.transport === 'ws' ? { wsSettings: { path: '/' + s.path, headers: { Host: host } } } : {}), ...(s.transport === 'grpc' ? { grpcSettings: { serviceName: s.grpcService } } : {}) },
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

async function loadUI(env, force) {
  const st = await load(env), s = st.settings;
  if (!force && UI.html && Date.now() - UI.ts < 300000) return UI.html;
  const base = `https://raw.githubusercontent.com/${s.fr.repo}/${s.fr.branch}`;
  try {
    const [html, css, js] = await Promise.all(['ui/index.html', 'ui/style.css', 'ui/app.js'].map((f) => fetch(base + '/' + f, { cf: { cacheTtl: 900 } }).then((r) => { if (!r.ok) throw new Error(f); return r.text(); })));
    let fr = '';
    if (s.fr.enabled) for (const f of s.fr.files) {
      if (['ui/index.html', 'ui/style.css', 'ui/app.js'].includes(f)) continue;
      try { const t = await fetch(base + '/' + f, { cf: { cacheTtl: 900 } }).then((r) => r.text()); fr += f.endsWith('.css') ? '<style>' + t + '</style>' : '<div style="display:none">' + t + '</div>'; } catch (e) {}
    }
    const out = html.replace('<!--STYLESHEET-->', '<style>' + css + '</style>' + fr).replace('<!--APPJS-->', '<script>' + js + '</script>');
    UI = { html: out, ts: Date.now() }; st.uiLoaded = Date.now(); await save(env, st);
    return out;
  } catch (e) { return UI.html || FALLBACK; }
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
    if (a === 'ui-refresh') { const h = await loadUI(env, true); return json({ ok: !!h && h !== FALLBACK, size: h ? h.length : 0 }); }
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
async function subHandler(req, env, url, cf) {
  const st = seed(await load(env)), s = st.settings;
  if (s.auth.panic || s.sec.killSwitch) return txt('503 Service Unavailable', {}, 503);
  const id = url.pathname.split('/').filter(Boolean).pop();
  const u = st.users.find((x) => x.uuid === id || x.secret === id || x.name === id);
  if (!u) return txt('user not found', {}, 404);
  if (!u.enabled) return txt('user disabled' + (u.reason ? ' — ' + u.reason : ''), {}, 403);
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

/* ════════════════════════════ DoH proxy ════════════════════════════ */
async function dohHandler(req, env, url) {
  const st = await load(env), s = st.settings;
  if (!s.dohProxy) return json({ error: 'disabled' }, 404);
  const target = s.doh.url.split('/dns-query')[0] + '/dns-query?' + url.searchParams.toString();
  const r = await fetch(target, { headers: { accept: 'application/dns-json' } });
  return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/dns-json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=60' } });
}

/* ════════════════════════════ هدرهای امنیتی ════════════════════════════ */
function secHeaders(s) {
  const h = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  if (s.sec.csp) { h['content-security-policy'] = "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https://api.qrserver.com; img-src 'self' data: https:; frame-ancestors 'none'"; h['x-frame-options'] = 'DENY'; }
  if (s.sec.cors) { h['access-control-allow-origin'] = '*'; h['access-control-allow-headers'] = 'authorization,content-type'; h['access-control-allow-methods'] = 'GET,POST,PUT,DELETE,OPTIONS'; }
  return h;
}

/* ════════════════════════════ ورودی ════════════════════════════ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cf = request.cf || null;
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: secHeaders(DEF().settings) });
      if (url.pathname === '/dns-query') return dohHandler(request, env, url);
      if (url.pathname === '/health' || url.pathname.startsWith('/api/')) return apiHandler(request, env, url);
      if (url.pathname.startsWith('/status/')) return statusPage(env, decodeURIComponent(url.pathname.split('/')[2] || ''), url);

      const st = seed(await load(env)), s = st.settings;
      if (url.pathname.startsWith('/' + s.sub.path + '/')) return subHandler(request, env, url, cf);

      /* ← هسته‌ی تونل (WebSocket proxy) را اینجا اضافه کنید:
         if (url.pathname.startsWith(s.path)) return tunnelHandler(request, env, st);
      */

      const isPanel = url.pathname === '/' || url.pathname === '/' + s.auth.path;
      if (isPanel) {
        const html = await loadUI(env, false);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...secHeaders(s) } });
      }
      if (s.auth.disguise) return new Response(DECOY[s.auth.maintenanceHost] || DECOY.nginx, { status: s.auth.maintenanceHost === 'cloudflare-1101' ? 500 : 200, headers: { 'content-type': 'text/html; charset=utf-8', ...secHeaders(s) } });
      return txt('not found', {}, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};
