/* ═══════════════════════════════════════════════════════════════
   پنل مدیریت — منطق سمت کلاینت (بدون فریم‌ورک)
   این فایل از گیت‌هاب خوانده می‌شود (fragment enhancement / FR)
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = { token: sessionStorage.getItem('sg_t') || '', d: null, view: 'dash', tab: {}, sel: null, fmt: 'base64', range: 'd' };

  /* ───────── utils ───────── */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const n = (v) => (v === null || v === undefined || isNaN(v)) ? '—' : fa(Number(v).toLocaleString('en-US'));
  const bytes = (b) => { if (!b || b < 0) return '۰ بایت'; const u = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت']; const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024))); return fa((b / 1024 ** i).toFixed(i ? 1 : 0)) + ' ' + u[i]; };
  const ago = (t) => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 60) return 'همین حالا'; if (s < 3600) return fa(Math.floor(s / 60)) + ' دقیقه پیش'; if (s < 86400) return fa(Math.floor(s / 3600)) + ' ساعت پیش'; return fa(Math.floor(s / 86400)) + ' روز پیش'; };
  const ic = (i) => `<svg class="i"><use href="#i-${i}"/></svg>`;
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const a = p.split('.'); let c = o; for (let i = 0; i < a.length - 1; i++) { c[a[i]] = c[a[i]] || {}; c = c[a[i]]; } c[a[a.length - 1]] = v; };

  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { authorization: 'Bearer ' + S.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ error: 'bad json' }));
    if (r.status === 401 && S.token) { S.token = ''; sessionStorage.removeItem('sg_t'); render(); }
    return j;
  }
  const toast = (msg, kind = 'ok') => { const d = document.createElement('div'); d.className = 'toast ' + kind; d.innerHTML = `<span class="dot ${kind === 'err' ? 'bad' : kind === 'info' ? 'warn' : 'on'}"></span>${esc(msg)}`; $('#toastRoot').appendChild(d); setTimeout(() => d.remove(), 3200); };
  const copy = (t) => { navigator.clipboard?.writeText(t); toast('در کلیپ‌بورد کپی شد'); };
  const modal = (html, wide) => { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box ${wide ? 'wide' : ''}" id="mbox">${html}</div>`; m.onmousedown = (e) => { if (e.target === m) m.remove(); }; $('#modalRoot').appendChild(m); return m; };

  /* ───────── charts ───────── */
  function area(data, h = 150, c = 'var(--ac)', c2 = 'var(--ac2)') {
    const mx = Math.max(...data, .001), W = 100, H = 40;
    const pts = data.map((v, i) => [W - (i / (data.length - 1)) * W, H - (v / mx) * (H - 4) - 2]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${h}px">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".38"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>
      <linearGradient id="al" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
      ${[.25, .5, .75].map((g) => `<line class="gl" x1="0" y1="${H * g}" x2="${W}" y2="${H * g}"/>`).join('')}
      <path d="${d} L0,${H} L${W},${H} Z" fill="url(#ag)"/><path class="ln draw" d="${d}" stroke="url(#al)"/></svg>`;
  }
  const bars = (data, u = '') => { const mx = Math.max(...data, .001); return `<div class="bars">${data.map((v) => `<div style="height:${Math.max(4, (v / mx) * 90)}px" title="${v.toFixed(2)}${u}"></div>`).join('')}</div>`; };
  const ring = (p, l, c = 'var(--ac)') => { const r = 40, c2 = 2 * Math.PI * r; return `<div class="ring"><svg width="100" height="100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--bs)" stroke-width="9"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c2}" stroke-dashoffset="${c2 - (Math.min(100, p) / 100) * c2}" style="transition:.7s"/></svg><div class="c">${fa(p.toFixed(0))}٪<span>${l}</span></div></div>`; };
  const spark = (d, w = 70, h = 20) => { const mx = Math.max(...d, .001); const p = d.map((v, i) => `${i ? 'L' : 'M'}${(i / (d.length - 1)) * w},${h - (v / mx) * (h - 2) - 1}`).join(' '); return `<svg width="${w}" height="${h}"><path d="${p}" fill="none" stroke="var(--ac)" stroke-width="1.5"/></svg>`; };

  /* ───────── field renderer ───────── */
  function field(f, val) {
    const p = esc(f.p), id = 'f_' + f.p.replace(/\./g, '_');
    let inner;
    if (f.t === 'sw') inner = `<div class="sw ${f.bad ? 'bad' : ''} ${val ? 'on' : ''}" data-sw="${p}"><i></i></div><input type="checkbox" class="hide" data-p="${p}" data-t="bool" ${val ? 'checked' : ''}>`;
    else if (f.t === 'sel') inner = `<select data-p="${p}">${f.o.map((o) => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(f.lbls?.[o] ?? o)}</option>`).join('')}</select>`;
    else if (f.t === 'num') inner = `<input type="number" data-p="${p}" data-t="num" value="${esc(val ?? 0)}">`;
    else if (f.t === 'pw') inner = `<input type="password" data-p="${p}" value="${esc(val ?? '')}" class="mono">`;
    else if (f.t === 'area') inner = `<textarea rows="4" data-p="${p}" data-t="${f.dt || 'lines'}">${esc((Array.isArray(val) ? val.join('\n') : val) ?? '')}</textarea>`;
    else if (f.t === 'rng') inner = `<div class="range"><input type="range" data-p="${p}" data-t="num" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${esc(val ?? f.min)}"><b>${esc(val ?? f.min)}${esc(f.u || '')}</b></div>`;
    else if (f.t === 'chips') inner = `<div class="chips" data-chips="${p}">${(val || []).map((v) => `<span class="chip"><span class="mono">${esc(v)}</span><button data-chip-del="${esc(v)}">×</button></span>`).join('')}</div><input data-p="${p}" data-t="lines" class="hide" value="${esc((val || []).join('\n'))}">`;
    else inner = `<input data-p="${p}" value="${esc(val ?? '')}" class="${f.mono ? 'mono' : ''}">`;
    return `<label class="f"><span>${f.l}${f.req ? ' <b style="color:var(--bad)">*</b>' : ''}</span>${inner}${f.h ? `<div class="hint" style="margin-top:5px">${f.h}</div>` : ''}</label>`;
  }
  const group = (g, s) => `<div class="card"><header><span class="ic ${g.ic || ''}">${ic(g.icon || 'cog')}</span><div><h3>${g.t}</h3>${g.d ? `<p>${g.d}</p>` : ''}</div></header><div class="bd"><div class="switches ${g.two ? 'two' : ''}">${g.f.map((f) => field(f, getP(s, f.p))).join('')}</div></div></div>`;
  function collect(root) { const o = {}; $$('[data-p]', root).forEach((el) => { const t = el.dataset.t; let v = el.type === 'checkbox' ? el.checked : el.value; if (t === 'num') v = Number(v) || 0; if (t === 'bool') v = !!v; if (t === 'lines') v = String(v).split('\n').map((x) => x.trim()).filter(Boolean); setP(o, el.dataset.p, v); }); return o; }
  const saveBtn = (act, lbl = 'ذخیره تنظیمات') => `<div class="btn-row" style="margin-top:4px"><button class="btn p" data-act="${act}">${ic('shield')} ${lbl}</button><span class="hint">تغییرات بلافاصله روی کانفیگ‌های ساب اعمال می‌شود.</span></div>`;

  /* ───────── schema ───────── */
  const NAV = [
    { g: 'عملیات', items: [['dash', 'نمای کلی', 'dash'], ['users', 'کاربران', 'users'], ['sub', 'اشتراک', 'sub']] },
    { g: 'هسته', items: [['proto', 'پروتکل و کانفیگ', 'proto'], ['network', 'شبکه و آی‌پی', 'net'], ['monitor', 'مانیتورینگ', 'chart']] },
    { g: 'زیرساخت', items: [['telegram', 'ربات تلگرام', 'bot'], ['cloud', 'کلودفلر و پنل‌ها', 'cloud'], ['update', 'به‌روزرسانی', 'refresh']] },
    { g: 'سیستم', items: [['security', 'امنیت و استتار', 'shield'], ['logs', 'لاگ فعالیت', 'log'], ['settings', 'تنظیمات و پشتیبان', 'cog']] },
  ];

  const SCHEMA = {
    proto: [
      { t: 'حالت پروتکل', icon: 'proto', d: 'انتخاب پروتکل‌های فعال روی هسته', two: 1, f: [
        { p: 'mode', l: 'حالت کاری', t: 'sel', o: ['alpha', 'beta', 'both'], lbls: { alpha: 'Alpha — VLESS', beta: 'Beta — Trojan', both: 'Both — هر دو' }, h: 'Alpha: VLESS/WS • Beta: Trojan/WS با SHA-224 • Both: هر دو همزمان' },
        { p: 'multiSplit', l: 'تقسیم مساوی بین پروتکل‌ها', t: 'sw', h: 'اشتراک چندپروتکله: تعداد کانفیگ بین پروتکل‌های فعال به‌طور مساوی تقسیم می‌شود' },
        { p: 'protocols.vless', l: 'VLESS', t: 'sw' },
        { p: 'protocols.trojan', l: 'Trojan (SHA-224)', t: 'sw' },
        { p: 'protocols.ss', l: 'Shadowsocks (در اشتراک)', t: 'sw' },
        { p: 'protocols.vmess', l: 'VMess (در اشتراک)', t: 'sw' },
        { p: 'trojanHash', l: 'هش Trojan', t: 'sel', o: ['sha224', 'sha256'], h: 'SHA-224 برای سازگاری با کلاینت‌های خاص' },
      ] },
      { t: 'ترنسپورت', icon: 'bolt', d: 'WebSocket / gRPC / XHTTP', two: 1, f: [
        { p: 'transport', l: 'نوع ترنسپورت', t: 'sel', o: ['ws', 'grpc', 'xhttp'], lbls: { ws: 'WebSocket', grpc: 'gRPC', xhttp: 'XHTTP' } },
        { p: 'path', l: 'مسیر پایه (path)', t: 'text', mono: 1 },
        { p: 'grpcService', l: 'gRPC Service Name', t: 'text', mono: 1 },
        { p: 'xhttpMode', l: 'XHTTP Mode', t: 'sel', o: ['auto', 'packet-up', 'stream-up', 'stream-one'] },
        { p: 'tfo', l: 'TCP Fast Open (TFO)', t: 'sw', h: 'کاهش تأخیر اتصال اولیه' },
        { p: 'randomJunk', l: 'جانک تصادفی مسیر', t: 'sw', h: 'مبهم‌سازی مسیر برای مقاوم‌سازی در برابر DPI' },
        { p: 'ports', l: 'پورت‌های TLS', t: 'text', mono: 1, h: 'با کاما جدا کنید — 443, 2053, 8443' },
        { p: 'mux', l: 'Mux multiplexing', t: 'sw' },
      ] },
      { t: 'TLS و رمزنگاری', icon: 'shield', d: 'uTLS، ECH و ALPN', two: 1, f: [
        { p: 'tls', l: 'TLS فعال', t: 'sw' },
        { p: 'fingerprint', l: 'uTLS Fingerprint', t: 'sel', o: ['randomized', 'chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'random'] },
        { p: 'sni', l: 'SNI', t: 'text', mono: 1, h: 'خالی = دامنه‌ی خود ورکر (پیشنهادی — مقدار دیگر باعث می‌شود کانفیگ وصل نشود)' },
        { p: 'host', l: 'Host header', t: 'text', mono: 1, h: 'خالی = دامنه‌ی خود ورکر. Host باید به ورکر شما اشاره کند' },
        { p: 'alpn', l: 'ALPN', t: 'text', mono: 1 },
        { p: 'allowInsecure', l: 'allowInsecure', t: 'sw', bad: 1, h: 'فقط برای تست' },
        { p: 'ech.enabled', l: 'ECH (Encrypted Client Hello)', t: 'sw', h: 'رمزنگاری SNI برای پنهان‌سازی مقصد' },
        { p: 'ech.mode', l: 'روش دریافت ECH config', t: 'sel', o: ['doh', 'sni'] },
      ] },
      { t: 'Fragment و FR', icon: 'edit', d: 'شکستن بسته + فایل‌های رابط کاربری از گیت‌هاب', two: 1, f: [
        { p: 'fragment.enabled', l: 'Fragment بسته‌ی TLS', t: 'sw' },
        { p: 'fragment.mode', l: 'حالت Fragment', t: 'sel', o: ['shadowrocket', 'happ', 'custom'] },
        { p: 'fragment.length', l: 'طول فرگمنت (بایت)', t: 'text', mono: 1 },
        { p: 'fragment.interval', l: 'فاصله (ms)', t: 'text', mono: 1 },
        { p: 'fr.enabled', l: 'بارگذاری UI از گیت‌هاب', t: 'sw', h: 'منبع ثابت: matmasomi777-droid/Sub/ui — قابل تغییر نیست' },
      ] },
    ],
    network: [
      { t: 'آی‌پی‌های پاک', icon: 'net', d: 'قالب ip#name برای نام‌گذاری گره‌ها', two: 1, f: [
        { p: 'cleanIPs', l: 'لیست IP پاک', t: 'chips', h: 'هر خط: ip#نام — مثل 104.17.1.1#فرانکفورت' },
        { p: 'perIsp', l: 'استخر IP اختصاصی هر اپراتور', t: 'sw', h: 'MCI، ایرانسل، رایتل، شاتل، پارس‌آنلاین…' },
        { p: 'ispPools', l: 'استخرهای ISP', t: 'area', dt: 'lines', h: 'هر خط: MCI=104.17.1.1,104.17.1.2' },
        { p: 'ipRotation', l: 'چرخش خودکار IP بر اساس اپراتور', t: 'sw' },
        { p: 'nodeLimit', l: 'سقف گره در هر اشتراک', t: 'num' },
      ] },
      { t: 'پروکسی و ریلی', icon: 'server', d: 'failover خودکار و مسیرهای پشتیبان', two: 1, f: [
        { p: 'proxyIPs', l: 'Proxy IPs (متعدد)', t: 'chips', h: 'به‌ترتیب اولویت؛ در صورت خطا خودکار به بعدی می‌رود' },
        { p: 'failover', l: 'failover خودکار', t: 'sw' },
        { p: 'failoverTimeout', l: 'زمان‌سنج failover (ms)', t: 'num' },
        { p: 'backupRelay', l: 'Backup Relay', t: 'text', mono: 1 },
        { p: 'customRelay', l: 'Custom Relay', t: 'text', mono: 1 },
        { p: 'upstream', l: 'Upstream proxy (VLESS URI)', t: 'area', dt: 'lines', h: 'زنجیره‌ی پراکسی با detour' },
      ] },
      { t: 'DNS و NAT64', icon: 'globe', d: 'resolve قبل از اتصال، جلوگیری از SNI leak', two: 1, f: [
        { p: 'doh.url', l: 'Custom DoH', t: 'text', mono: 1 },
        { p: 'dohProxy', l: 'اندپوینت DoH برای کلاینت‌ها', t: 'sw', h: 'روی /dns-query در دسترس قرار می‌گیرد' },
        { p: 'resolveFirst', l: 'DNS resolution قبل از اتصال', t: 'sw', h: 'جلوگیری از SNI leak' },
        { p: 'nat64.prefix', l: 'NAT64 Prefix', t: 'text', mono: 1 },
        { p: 'nat64.fromUrl', l: 'دریافت NAT64 از URL', t: 'sw' },
        { p: 'nat64.url', l: 'آدرس دریافت NAT64', t: 'text', mono: 1 },
        { p: 'raceDial', l: 'تلاش همزمان (race dial)', t: 'num', h: 'تعداد اتصال موازی برای سرعت بیشتر' },
        { p: 'geoip.enabled', l: 'GeoIP lookup', t: 'sw', h: 'پرچم کشور و نام ISP برای هر گره' },
        { p: 'geoip.api', l: 'سرویس GeoIP', t: 'text', mono: 1 },
      ] },
    ],
    telegram: [
      { t: 'ربات تلگرام', icon: 'bot', d: 'پنل کامل تلگرامی با دکمه‌های inline', two: 1, f: [
        { p: 'tg.enabled', l: 'فعال‌سازی ربات', t: 'sw' },
        { p: 'tg.lang', l: 'زبان ربات', t: 'sel', o: ['fa', 'en'], lbls: { fa: 'فارسی', en: 'English' } },
        { p: 'tg.token', l: 'Bot Token', t: 'pw', mono: 1 },
        { p: 'tg.chatId', l: 'Chat ID', t: 'text', mono: 1 },
        { p: 'tg.adminId', l: 'Admin ID', t: 'text', mono: 1 },
        { p: 'tg.silent', l: 'هشدارهای بی‌صدا', t: 'sw' },
        { p: 'tg.multiPanel', l: 'مدیریت چندپنلی از تلگرام', t: 'sw' },
        { p: 'tg.loginAlert', l: 'هشدار ورود (موفق/ناموفق)', t: 'sw' },
        { p: 'tg.autoDisableAlert', l: 'هشدار غیرفعال‌سازی خودکار کاربر', t: 'sw' },
        { p: 'tg.usageFromCF', l: 'Usage tracking از Cloudflare API', t: 'sw' },
      ] },
      { t: 'رویدادهای اعلان', icon: 'log', two: 1, f: [
        { p: 'tg.notify.user', l: 'کاربر جدید', t: 'sw' },
        { p: 'tg.notify.quota', l: 'اتمام سهمیه', t: 'sw' },
        { p: 'tg.notify.expiry', l: 'نزدیک انقضا', t: 'sw' },
        { p: 'tg.notify.err', l: 'خطای ورکر', t: 'sw' },
        { p: 'tg.notify.daily', l: 'گزارش روزانه', t: 'sw' },
      ] },
    ],
    cloud: [
      { t: 'Cloudflare API', icon: 'cloud', d: 'استقرار، آمار و مدیریت دامنه', two: 1, f: [
        { p: 'cf.accountId', l: 'Account ID', t: 'text', mono: 1 },
        { p: 'cf.apiToken', l: 'API Token', t: 'pw', mono: 1 },
        { p: 'cf.zoneId', l: 'Zone ID (دامنه)', t: 'text', mono: 1 },
        { p: 'cf.domain', l: 'دامنه‌ی اختصاصی', t: 'text', mono: 1 },
        { p: 'cf.usageApi', l: 'دریافت آمار درخواست از CF API', t: 'sw' },
        { p: 'panel.name', l: 'نام پنل', t: 'text' },
        { p: 'panel.url', l: 'آدرس پنل', t: 'text', mono: 1 },
        { p: 'kvBinding', l: 'بایندینگ KV', t: 'text', mono: 1, h: 'اگر تنظیم نشده باشد، ذخیره‌سازی موقت است' },
      ] },
      { t: 'پنل‌های لینک‌شده', icon: 'net', d: 'معماری Hub & Spoke', two: 1, f: [
        { p: 'linked.enabled', l: 'اتصال چندپنلی فعال', t: 'sw' },
        { p: 'linked.hubUrl', l: 'آدرس Hub', t: 'text', mono: 1 },
        { p: 'linked.apiKey', l: 'کلید همگام‌سازی', t: 'pw', mono: 1 },
        { p: 'linked.propagateConfig', l: 'انتشار کانفیگ به همه‌ی نودها', t: 'sw' },
        { p: 'linked.propagateUpdate', l: 'انتشار آپدیت به نودهای متصل', t: 'sw' },
        { p: 'linked.loginSignal', l: 'Login signal برای انتخاب پنل فعال', t: 'sw' },
      ] },
    ],
    update: [
      { t: 'به‌روزرسانی خودکار', icon: 'refresh', d: 'مقایسه‌ی نسخه، استقرار و بازگشت', two: 1, f: [
        { p: 'upd.auto', l: 'به‌روزرسانی خودکار', t: 'sw' },
        { p: 'upd.repo', l: 'مخزن GitHub', t: 'text', mono: 1 },
        { p: 'upd.channel', l: 'کانال', t: 'sel', o: ['stable', 'beta'] },
        { p: 'upd.interval', l: 'بازه‌ی بررسی (دقیقه)', t: 'rng', min: 30, max: 1440, step: 30, u: ' دقیقه' },
        { p: 'upd.healthCheck', l: 'سلامت‌سنجی بعد از آپدیت', t: 'sw' },
        { p: 'upd.rollback', l: 'بازگشت خودکار در صورت خطا', t: 'sw' },
      ] },
    ],
    security: [
      { t: 'احراز هویت', icon: 'key', d: 'JWT با انقضای ۲۴ ساعت + 2FA', two: 1, f: [
        { p: 'auth.totp', l: '2FA (TOTP / Google Authenticator)', t: 'sw' },
        { p: 'auth.totpSecret', l: 'کلید 2FA (Base32)', t: 'text', mono: 1 },
        { p: 'auth.sessionMin', l: 'انقضای نشست', t: 'rng', min: 5, max: 1440, step: 5, u: ' دقیقه', h: 'خروج خودکار پس از بی‌کاری ۱۵ دقیقه' },
        { p: 'auth.loginRate', l: 'محدودیت ورود', t: 'text', mono: 1, h: '۵ تلاش در ۱۰ دقیقه' },
        { p: 'auth.recoveryTg', l: 'لینک بازیابی از تلگرام', t: 'sw' },
        { p: 'auth.recoveryCf', l: 'بازیابی رمز با توکن کلودفلر', t: 'sw' },
      ] },
      { t: 'مسیرها و استتار', icon: 'shield', d: 'path rotation، disguise و decoy', two: 1, f: [
        { p: 'auth.path', l: 'مسیر ورود پنل', t: 'text', mono: 1 },
        { p: 'auth.pathRotate', l: 'چرخش خودکار مسیر', t: 'sw' },
        { p: 'auth.disguise', l: 'Disguise mode', t: 'sw', h: 'مسیرهای ناشناخته سایت عادی نشان می‌دهند' },
        { p: 'auth.maintenanceHost', l: 'سایت پوششی', t: 'sel', o: ['nginx', 'cloudflare-1101', 'maintenance', 'wp'] },
        { p: 'auth.panic', l: 'Panic mode (توقف فوری)', t: 'sw', bad: 1 },
        { p: 'sec.cors', l: 'هدرهای CORS مناسب', t: 'sw' },
        { p: 'sec.csp', l: 'Security headers (CSP, XFO, nosniff)', t: 'sw' },
        { p: 'sec.killSwitch', l: 'Kill Switch', t: 'sw', bad: 1 },
      ] },
    ],
  };

  const UF = [
    { p: 'name', l: 'نام کاربر', t: 'text', req: 1 },
    { p: 'note', l: 'یادداشت', t: 'text' },
    { p: 'uuid', l: 'UUID (VLESS/VMess)', t: 'text', mono: 1 },
    { p: 'secret', l: 'رمز Trojan / SS', t: 'text', mono: 1 },
    { p: 'quotaGB', l: 'سهمیه کل (GB) — ۰ = نامحدود', t: 'num' },
    { p: 'dailyQuotaMB', l: 'سهمیه روزانه (MB)', t: 'num' },
    { p: 'expiryDays', l: 'انقضا (روز از امروز) — ۰ = نامحدود', t: 'num' },
    { p: 'deviceLimit', l: 'Connection limit (اتصال همزمان)', t: 'num' },
    { p: 'ipLimit', l: 'IP limit (تعداد IP مجاز)', t: 'num' },
    { p: 'maxConfigs', l: 'Max configs (سقف کانفیگ)', t: 'num' },
    { p: 'speedLimit', l: 'Speed limit (Mbps) — ۰ = نامحدود', t: 'num' },
    { p: 'mode', l: 'حالت اختصاصی', t: 'sel', o: ['inherit', 'alpha', 'beta', 'both'], lbls: { inherit: 'از تنظیمات عمومی', alpha: 'Alpha — VLESS', beta: 'Beta — Trojan', both: 'Both' } },
    { p: 'ports', l: 'پورت‌های اختصاصی', t: 'text', mono: 1, h: 'خالی = پورت‌های عمومی' },
    { p: 'cleanIPs', l: 'Clean IPs اختصاصی', t: 'area', dt: 'lines', h: 'خالی = لیست عمومی' },
    { p: 'proxyIPs', l: 'Proxy IPs اختصاصی', t: 'area', dt: 'lines' },
    { p: 'nodes', l: 'Nodes اختصاصی', t: 'area', dt: 'lines' },
    { p: 'nat64', l: 'NAT64 اختصاصی', t: 'text', mono: 1 },
    { p: 'panelUrl', l: 'Panel URL اختصاصی', t: 'text', mono: 1 },
    { p: 'blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' },
    { p: 'blockAds', l: 'بلاک تبلیغات', t: 'sw' },
    { p: 'enabled', l: 'کاربر فعال باشد', t: 'sw' },
  ];

  /* ───────── views ───────── */
  function loginView() {
    return `<div class="login"><div class="box">
      <header><span class="ic">${ic('shield')}</span><div><h3>${esc(S.d?.settings?.panel?.name || 'پنل')}</h3><p>ورود مدیر • JWT 24h ${S.d?.settings?.auth?.totp ? '+ 2FA' : ''}</p></div></header>
      <div class="bd">
        <label class="f"><span>رمز عبور</span><input type="password" id="lgPw" placeholder="••••••••"></label>
        ${S.d?.settings?.auth?.totp ? `<label class="f"><span>کد دو مرحله‌ای (TOTP)</span><input id="lgTp" class="mono" inputmode="numeric" maxlength="6" placeholder="——————"></label>` : ''}
        <button class="btn p lg" style="width:100%" data-act="login">ورود به پنل</button>
        <p class="hint" style="margin-top:12px">محدودیت: ۵ تلاش در ۱۰ دقیقه. رمز پیش‌فرض: <span class="mono">simorgh</span></p>
      </div></div></div>`;
  }

  function dashView() {
    const d = S.d, us = d.users, s = d.settings;
    const used = us.reduce((a, u) => a + u.up + u.down, 0), quota = us.reduce((a, u) => a + (u.quotaGB || 0) * 1073741824, 0);
    const on = us.filter((u) => u.enabled).length, exp = us.filter((u) => u.expiryAt && u.expiryAt < Date.now()).length;
    const top = [...us].sort((a, b) => b.up + b.down - (a.up + a.down)).slice(0, 6);
    return `
    <div class="page-head"><div><h1>نمای کلی</h1><p>${esc(s.panel.name)} • ${esc(location.hostname)} • نسخه ${esc(d.version)}</p></div>
      <div class="btn-row"><span class="badge ${d.storage === 'kv' ? 'ok' : 'warn'}">${d.storage === 'kv' ? 'KV پایدار' : 'ذخیره‌سازی موقت'}</span>
      <span class="badge ac">${esc(s.mode === 'both' ? 'Alpha + Beta' : s.mode)}</span>
      ${s.fragment.enabled ? '<span class="badge ac">Fragment</span>' : ''}${s.ech.enabled ? '<span class="badge b2">ECH</span>' : ''}${s.tfo ? '<span class="badge b2">TFO</span>' : ''}
      ${s.transport !== 'ws' ? `<span class="badge">${esc(s.transport.toUpperCase())}</span>` : ''}</div></div>
    <div class="grid g4">
      <div class="stat"><div class="lbl">کل کاربران</div><div class="val">${fa(us.length)}</div><div class="sub">${fa(on)} فعال • ${fa(exp)} منقضی</div></div>
      <div class="stat"><div class="lbl">مصرف کل</div><div class="val">${bytes(used)}</div><div class="sub">${quota ? fa((used / quota * 100).toFixed(0)) + '٪ از سهمیه' : 'بدون سقف'}</div><div class="bar" style="margin-top:8px"><i style="width:${quota ? used / quota * 100 : 0}%"></i></div></div>
      <div class="stat"><div class="lbl">درخواست‌ها</div><div class="val">${n(d.stats?.requests || 0)}</div><div class="sub">از Cloudflare API</div>${spark(d.stats?.reqSeries || [.2, .5, .3, .6, .4])}</div>
      <div class="stat"><div class="lbl">اتصال‌های فعال</div><div class="val">${fa(d.stats?.connections || 0)}</div><div class="sub">uptime ${fa(Math.floor((Date.now() - d.boot) / 60000))} دقیقه</div></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><header><span class="ic">${ic('chart')}</span><div><h3>جریان ترافیک</h3><p>۲۴ بازه‌ی اخیر</p></div></header><div class="bd">${area(d.stats?.trafficSeries || Array(24).fill(.2), 165)}</div></div>
      <div class="card"><header><span class="ic b2">${ic('users')}</span><div><h3>بیشترین مصرف‌کنندگان</h3><p>۶ کاربر اول</p></div></header><div class="bd">
        ${top.map((u) => { const q = (u.quotaGB || 0) * 1073741824, p = q ? (u.up + u.down) / q * 100 : 0; return `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <span class="dot ${u.enabled ? 'on' : 'bad'}"></span>
            <div style="min-width:0;flex:1"><div class="cell-main">${esc(u.name)}</div><div class="cell-sub mono">${esc(String(u.uuid).slice(0, 14))}…</div></div>
            <div class="bar ${p > 90 ? 'bad' : p > 70 ? 'warn' : ''}" style="max-width:130px"><i style="width:${p}%"></i></div>
            <b class="mono" style="font-size:11px">${bytes(u.up + u.down)}</b></div>`; }).join('') || '<div class="empty">کاربری وجود ندارد</div>'}
      </div></div>
    </div>
    <div class="grid g3">
      <div class="card"><header><span class="ic">${ic('net')}</span><div><h3>گره‌ها</h3><p>IP پاک و پروکسی</p></div></header><div class="bd">
        <div class="kv"><span>IP پاک</span><b>${fa(s.cleanIPs.length)} گره</b></div>
        <div class="kv"><span>Proxy IP</span><b>${fa(s.proxyIPs.length)}</b></div>
        <div class="kv"><span>پورت‌های TLS</span><b class="mono">${esc(s.ports.length ? s.ports.join(' ') : '—')}</b></div>
        <div class="kv"><span>failover</span><b>${s.failover ? 'فعال' : 'خاموش'}</b></div>
        <div class="kv"><span>GeoIP</span><b>${s.geoip.enabled ? 'فعال' : 'خاموش'}</b></div>
      </div></div>
      <div class="card"><header><span class="ic b2">${ic('proto')}</span><div><h3>پروتکل‌ها</h3><p>وضعیت هسته</p></div></header><div class="bd">
        ${Object.entries(s.protocols).map(([k, v]) => `<div class="kv"><span>${k.toUpperCase()}</span><span class="badge ${v ? 'ok' : ''}">${v ? 'فعال' : 'خاموش'}</span></div>`).join('')}
        <div class="kv"><span>ترنسپورت</span><b>${esc(s.transport)}</b></div>
        <div class="kv"><span>fingerprint</span><b class="mono">${esc(s.fingerprint)}</b></div>
        <div class="kv"><span>Trojan hash</span><b class="mono">${esc(s.trojanHash)}</b></div>
      </div></div>
      <div class="card"><header><span class="ic warn">${ic('log')}</span><div><h3>آخرین رویدادها</h3><p>از audit log</p></div><div class="acts"><button class="btn sm ghost" data-act="nav" data-view="logs">همه</button></div></header><div class="bd">
        ${(d.logs || []).slice(0, 5).map((l) => `<div class="log"><span class="dot ${l.level === 'success' ? 'on' : l.level === 'error' ? 'bad' : 'warn'}"></span><div class="l"><b>${esc(l.action)}</b><div class="hint">${esc(l.detail || l.actor)}</div></div><span class="hint">${ago(l.ts)}</span></div>`).join('') || '<div class="empty">رویدادی نیست</div>'}
      </div></div>
    </div>`;
  }

  function usersView() {
    const us = S.d.users, q = (S.q || '').toLowerCase();
    const list = us.filter((u) => !q || [u.name, u.uuid, u.note].join(' ').toLowerCase().includes(q));
    return `<div class="page-head"><div><h1>مدیریت کاربران</h1><p>${fa(us.length)} کاربر • ${fa(us.filter((u) => u.enabled).length)} فعال • تنظیمات اختصاصی برای هر کاربر</p></div>
      <div class="btn-row"><input id="uSearch" class="tb-search" placeholder="جستجو…" value="${esc(S.q || '')}"><button class="btn p" data-act="user-new">${ic('plus')} کاربر جدید</button></div></div>
    <div class="card"><div class="bd flush"><div class="tbl-wrap"><table>
      <thead><tr><th>کاربر</th><th>UUID / رمز</th><th>مصرف</th><th>سهمیه</th><th>انقضا</th><th>حالت</th><th>اختصاصی</th><th>آخرین فعالیت</th><th></th></tr></thead>
      <tbody>${list.map((u) => {
      const q2 = (u.quotaGB || 0) * 1073741824, p = q2 ? (u.up + u.down) / q2 * 100 : 0, dl = u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : null;
      const own = [u.mode !== 'inherit' && u.mode ? 'mode' : '', u.ports?.length ? 'ports' : '', u.cleanIPs?.length ? 'ips' : '', u.panelUrl ? 'url' : '', u.speedLimit ? 'speed' : ''].filter(Boolean);
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><span class="dot ${u.enabled ? 'on' : 'bad'}"></span><span class="cell-main">${esc(u.name)}</span></div><div class="cell-sub">${esc(u.note || '—')}</div></td>
        <td class="mono">${esc(String(u.uuid).slice(0, 12))}…<div style="display:flex;gap:4px;margin-top:4px"><button class="btn sm" data-act="copy" data-v="${esc(u.uuid)}">UUID</button><button class="btn sm" data-act="sub-of" data-id="${u.id}">ساب</button></div></td>
        <td><b class="mono" style="font-size:11px">${bytes(u.up + u.down)}</b><div class="bar ${p > 90 ? 'bad' : p > 70 ? 'warn' : ''}" style="margin-top:5px"><i style="width:${p}%"></i></div><div class="cell-sub">↓${bytes(u.down)} ↑${bytes(u.up)}</div></td>
        <td class="mono">${u.quotaGB ? fa(u.quotaGB) + ' GB' : '∞'}<div class="cell-sub">${u.dailyQuotaMB ? fa(u.dailyQuotaMB) + ' MB/روز' : '—'}</div></td>
        <td>${dl === null ? '<span class="badge ok">نامحدود</span>' : dl < 0 ? '<span class="badge bad">منقضی</span>' : `<span class="badge ${dl <= 7 ? 'warn' : ''}">${fa(dl)} روز</span>`}</td>
        <td><span class="badge ${u.mode === 'both' ? 'ac' : 'b2'}">${esc(u.mode || 'inherit')}</span></td>
        <td>${own.length ? own.map((o) => `<span class="badge ac">${esc(o)}</span>`).join(' ') : '<span class="cell-sub">—</span>'}</td>
        <td class="cell-sub">${ago(u.lastSeen)}<div>${fa(u.totalReq || 0)} req</div></td>
        <td><div class="btn-row" style="gap:3px">
          <button class="btn sm" data-act="user-edit" data-id="${u.id}">${ic('edit')}</button>
          <button class="btn sm" data-act="user-reset" data-id="${u.id}" title="ریست مصرف">${ic('refresh')}</button>
          <button class="btn sm ${u.enabled ? 'd' : 's'}" data-act="user-toggle" data-id="${u.id}">${u.enabled ? 'قطع' : 'فعال'}</button>
          <button class="btn sm d" data-act="user-del" data-id="${u.id}">${ic('trash')}</button>
        </div></td></tr>`; }).join('') || `<tr><td colspan="9"><div class="empty">موردی یافت نشد</div></td></tr>`}
      </tbody></table></div></div></div>
    <div class="card"><header><span class="ic">${ic('qr')}</span><div><h3>صفحه‌ی وضعیت کاربر</h3><p>هر کاربر یک صفحه‌ی عمومی برای دیدن مصرف و انقضا دارد</p></div></header><div class="bd">
      <div class="list">${us.slice(0, 4).map((u) => `<div class="row-item"><div class="grow"><b>${esc(u.name)}</b><div class="mono" style="font-size:10px">${esc(location.origin)}/status/${esc(u.name)}</div></div>
        <button class="btn sm" data-act="open" data-v="/status/${esc(u.name)}">باز کردن</button><button class="btn sm" data-act="copy" data-v="${esc(location.origin + '/status/' + u.name)}">کپی</button></div>`).join('')}</div>
    </div></div>`;
  }

  function subView() {
    const s = S.d.settings, us = S.d.users;
    const u = us.find((x) => x.id === S.sel) || us[0];
    const link = u ? `${location.origin}/${s.sub.path}/${u.uuid}` : '';
    const f = S.fmt;
    return `<div class="page-head"><div><h1>مرکز اشتراک</h1><p>۶ فرمت خروجی • تشخیص خودکار از User-Agent • قواعد روتینگ و گروه کشور</p></div></div>
    ${!u ? '<div class="card"><div class="bd"><div class="empty">ابتدا یک کاربر بسازید</div></div></div>' : `
    <div class="card"><header><span class="ic">${ic('sub')}</span><div><h3>لینک اشتراک</h3><p>یک لینک برای همه‌ی کلاینت‌ها</p></div><div class="acts">
      <div class="seg">${['base64', 'clash', 'meta', 'singbox', 'v2ray', 'raw'].map((x) => `<button data-act="fmt" data-v="${x}" class="${f === x ? 'on' : ''}">${x}</button>`).join('')}</div></div></header>
      <div class="bd">
        <div class="grid g3" style="margin-bottom:12px">
          <label class="f" style="margin:0"><span>کاربر</span><select data-act="sel-user">${us.map((x) => `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          <div><div class="hint">مصرف</div><b class="mono">${bytes(u.up + u.down)}</b><div class="hint">${u.quotaGB ? fa(u.quotaGB) + ' GB' : 'نامحدود'}</div></div>
          <div><div class="hint">سقف گره</div><b class="mono">${fa(s.sub.nodeLimit || 0)}</b><div class="hint">node limit per subscription</div></div>
        </div>
        <div class="btn-row" style="margin-bottom:12px">
          <input class="mono" readonly value="${esc(link)}" style="flex:1;min-width:200px">
          <button class="btn sm" data-act="copy" data-v="${esc(link)}">کپی لینک</button>
          <button class="btn sm s" data-act="sub-load" data-id="${u.id}">نمایش خروجی</button>
          <button class="btn sm" data-act="qr" data-v="${esc(link)}">${ic('qr')} QR</button>
        </div>
        <div id="subOut"><div class="empty">خروجی اینجا نمایش داده می‌شود</div></div>
        ${s.sub.telegramChannel ? `<div class="hint" style="margin-top:10px">خط کانال تلگرام: <span class="mono">${esc(s.sub.telegramChannel)}</span> — این خط قابل غیرفعال‌شدن نیست.</div>` : ''}
      </div></div>`}
    ${SCHEMA_SUB.map((g) => group(g, S.d.settings)).join('')}
    ${saveBtn('save-sub')}`;
  }
  const SCHEMA_SUB = [
    { t: 'تنظیمات اشتراک', icon: 'sub', two: 1, f: [
      { p: 'sub.path', l: 'مسیر ساب', t: 'text', mono: 1 },
      { p: 'sub.userAgent', l: 'فیلتر User-Agent', t: 'text', mono: 1 },
      { p: 'sub.fakeConfigs', l: 'کانفیگ‌های فیک (مصرف/انقضا)', t: 'sw' },
      { p: 'sub.nodeLimit', l: 'Node limit در هر ساب', t: 'num' },
      { p: 'sub.converter', l: 'Subscription Converter API', t: 'text', mono: 1 },
      { p: 'sub.telegramChannel', l: 'خط کانال تلگرام', t: 'text', mono: 1, h: 'قابل غیرفعال‌سازی نیست' },
      { p: 'sub.countryGroups', l: 'گروه‌بندی خودکار بر اساس کشور', t: 'sw', h: 'GeoIP → گروه کشور در sing-box/clash' },
      { p: 'sub.namePrefix', l: 'پیشوند نام کانفیگ', t: 'text' },
    ] },
    { t: 'قواعد روتینگ سفارشی', icon: 'net', d: 'DOMAIN / IP-CIDR / GEOIP / GEosite', two: 1, f: [
      { p: 'sub.rules', l: 'قواعد (هر خط یک قاعده)', t: 'area', dt: 'lines', h: 'DOMAIN,example.com,DIRECT\nIP-CIDR,10.0.0.0/8,DIRECT\nGEOIP,IR,DIRECT\nGEosite,category-ads-all,REJECT' },
      { p: 'sub.blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' },
      { p: 'sub.blockAds', l: 'بلاک تبلیغات و ردیاب', t: 'sw' },
      { p: 'sub.blockQuic', l: 'مسدودسازی QUIC', t: 'sw' },
      { p: 'sub.bypassIR', l: 'عبور مستقیم ترافیک ایران', t: 'sw' },
      { p: 'sub.doh', l: 'DNS رمزنگاری‌شده برای کلاینت', t: 'text', mono: 1 },
    ] },
  ];

  function monitorView() {
    const st = S.d.stats || {}, u = S.d.users;
    const used = u.reduce((a, x) => a + x.up + x.down, 0);
    const r = S.range, key = r === 'd' ? 'daily' : r === 'm' ? 'monthly' : 'yearly';
    const series = st[key] || st.daily || Array(14).fill(.3);
    return `<div class="page-head"><div><h1>مانیتورینگ و آمار</h1><p>مصرف روزانه/ماهانه/سالانه، اتصال‌های فعال و سلامت سرویس</p></div>
      <div class="seg">${[['d', 'روزانه'], ['m', 'ماهانه'], ['y', 'سالانه']].map(([k, l]) => `<button data-act="range" data-v="${k}" class="${r === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="grid g4">
      <div class="stat"><div class="lbl">آپلود کل</div><div class="val">${bytes(u.reduce((a, x) => a + x.up, 0))}</div><div class="sub">تعداد کل کاربران: ${fa(u.length)}</div></div>
      <div class="stat"><div class="lbl">دانلود کل</div><div class="val">${bytes(u.reduce((a, x) => a + x.down, 0))}</div><div class="sub">اتصال فعال: ${fa(st.connections || 0)}</div></div>
      <div class="stat"><div class="lbl">درخواست‌ها</div><div class="val">${n(st.requests || 0)}</div><div class="sub">uptime ${fa(Math.floor((Date.now() - S.d.boot) / 60000))} دقیقه</div></div>
      <div class="stat"><div class="lbl">نسخه و بیلد</div><div class="val mono" style="font-size:15px">${esc(S.d.version)}</div><div class="sub">${esc(S.d.build || 'build-')}</div></div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><header><span class="ic">${ic('chart')}</span><div><h3>مصرف ${r === 'd' ? 'روزانه' : r === 'm' ? 'ماهانه' : 'سالانه'}</h3><p>گیگابایت در هر بازه</p></div></header><div class="bd">${area(series, 180, 'var(--ac2)', 'var(--ac)')}</div></div>
      <div class="card"><header><span class="ic b2">${ic('chart')}</span><div><h3>توزیع مصرف</h3><p>سهم هر کاربر</p></div></header><div class="bd">${bars(u.slice(0, 14).map((x) => (x.up + x.down) / 1073741824 || .01), 'GB')}</div></div>
    </div>
    <div class="card"><header><span class="ic">${ic('users')}</span><div><h3>مصرف به تفکیک کاربر</h3><p>با درصد پیشرفت</p></div></header><div class="bd"><div class="tbl-wrap"><table>
      <thead><tr><th>کاربر</th><th>آپلود</th><th>دانلود</th><th>کل</th><th>درصد سهمیه</th><th>درخواست</th></tr></thead>
      <tbody>${u.map((x) => { const q = (x.quotaGB || 0) * 1073741824, p = q ? (x.up + x.down) / q * 100 : 0; return `<tr><td class="cell-main">${esc(x.name)}</td><td class="mono">${bytes(x.up)}</td><td class="mono">${bytes(x.down)}</td><td class="mono"><b>${bytes(x.up + x.down)}</b></td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="bar ${p > 90 ? 'bad' : p > 70 ? 'warn' : ''}" style="max-width:120px"><i style="width:${p}%"></i></div><span class="mono" style="font-size:10px">${q ? fa(p.toFixed(0)) + '٪' : '∞'}</span></div></td>
        <td class="mono">${fa(x.totalReq || 0)}</td></tr>`; }).join('')}</tbody></table></div></div></div>`;
  }

  function updateView() {
    const d = S.d, s = d.settings;
    return `<div class="page-head"><div><h1>سیستم به‌روزرسانی</h1><p>بررسی نسخه از گیت‌هاب، استقرار از طریق Cloudflare API و بازگشت به نسخه‌ی قبل</p></div></div>
    <div class="grid g3">
      <div class="card"><header><span class="ic">${ic('refresh')}</span><div><h3>نسخه فعلی</h3></div></header><div class="bd">
        <div class="kv"><span>نسخه</span><b class="mono">${esc(d.version)}</b></div>
        <div class="kv"><span>بیلد</span><b class="mono">${esc(d.build || '—')}</b></div>
        <div class="kv"><span>مخزن</span><b class="mono">${esc(s.upd.repo)}</b></div>
        <div class="kv"><span>کانال</span><b>${esc(s.upd.channel)}</b></div>
        <div class="kv"><span>آخرین بررسی</span><b>${ago(d.lastCheck)}</b></div>
        <div class="btn-row" style="margin-top:12px"><button class="btn p" data-act="upd-check">بررسی آپدیت</button><button class="btn" data-act="upd-deploy">نصب</button><button class="btn d" data-act="upd-rollback">بازگشت</button></div>
      </div></div>
      <div class="card"><header><span class="ic b2">${ic('net')}</span><div><h3>انتشار به نودها</h3><p>propagation</p></div></header><div class="bd">
        ${(d.panels || []).map((p) => `<div class="kv"><span>${esc(p.name)}</span><span class="badge ${p.status === 'online' ? 'ok' : p.status === 'syncing' ? 'warn' : 'bad'}">${esc(p.status)}</span></div>`).join('') || '<div class="empty">نودی متصل نیست</div>'}
        <div class="hint" style="margin-top:10px">${s.linked.propagateUpdate ? 'آپدیت به‌صورت خودکار به همه‌ی نودها منتشر می‌شود.' : 'انتشار آپدیت خاموش است.'}</div>
      </div></div>
      <div class="card"><header><span class="ic warn">${ic('shield')}</span><div><h3>گزارش آخرین آپدیت</h3></div></header><div class="bd">
        ${(d.updateLog || []).map((l) => `<div class="log"><span class="dot ${l.ok ? 'on' : 'bad'}"></span><div class="l"><b>${esc(l.step)}</b><div class="hint">${esc(l.note)}</div></div></div>`).join('') || '<div class="empty">گزارشی نیست</div>'}
      </div></div>
    </div>
    ${SCHEMA.update.map((g) => group(g, s)).join('')}${saveBtn('save-proto')}`;
  }

  function logsView() {
    const logs = S.d.logs || [];
    const lv = S.tab.log || 'all';
    const list = logs.filter((l) => lv === 'all' || l.level === lv);
    return `<div class="page-head"><div><h1>لاگ فعالیت</h1><p>آخرین ${fa(logs.length)} رویداد • audit trail تغییرات ادمین</p></div>
      <div class="seg">${[['all', 'همه'], ['success', 'موفق'], ['info', 'اطلاعات'], ['warn', 'هشدار'], ['error', 'خطا']].map(([k, l]) => `<button data-act="loglv" data-v="${k}" class="${lv === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="card"><div class="bd">${list.map((l) => `<div class="log"><span class="dot ${l.level === 'success' ? 'on' : l.level === 'error' ? 'bad' : 'warn'}"></span>
      <div class="l"><b>${esc(l.action)}</b> <span class="badge">${esc(l.actor)}</span> <span class="badge ${l.level === 'error' ? 'bad' : l.level === 'success' ? 'ok' : 'b2'}">${esc(l.level)}</span>
      <div class="hint">${esc(l.detail || '')}</div></div><span class="hint mono">${new Date(l.ts).toLocaleString('fa-IR')}</span></div>`).join('') || '<div class="empty">رویدادی ثبت نشده</div>'}</div></div>`;
  }

  function settingsView() {
    const d = S.d, s = d.settings;
    return `<div class="page-head"><div><h1>تنظیمات و پشتیبان</h1><p>کلیدهای API، پشتیبان‌گیری، فایل‌های UI و بازنشانی</p></div></div>
    <div class="grid g2">
      <div class="card"><header><span class="ic">${ic('key')}</span><div><h3>کلیدهای API</h3><p>حداکثر ۱۰ کلید — با دسترسی فقط‌خواندنی</p></div><div class="acts"><button class="btn sm s" data-act="key-new">${ic('plus')} کلید جدید</button></div></header>
        <div class="bd"><div class="list">${(d.keys || []).map((k) => `<div class="row-item"><div class="grow"><b class="mono" style="font-size:11px">${esc(k.key)}</b><div class="cell-sub">${esc(k.name)} • ${k.ro ? 'فقط‌خواندنی' : 'دسترسی کامل'}</div></div>
          <button class="btn sm d" data-act="key-del" data-id="${esc(k.id)}">${ic('trash')}</button></div>`).join('') || '<div class="empty">کلیدی ساخته نشده</div>'}</div></div></div>
      <div class="card"><header><span class="ic b2">${ic('edit')}</span><div><h3>فایل‌های UI (FR)</h3><p>css و html از گیت‌هاب خوانده می‌شوند</p></div><div class="acts"><button class="btn sm" data-act="ui-refresh">${ic('refresh')} بازخوانی</button></div></header>
        <div class="bd">
          <div class="kv"><span>مخزن</span><b class="mono">${esc(s.fr.repo)}</b></div>
          <div class="kv"><span>شاخه</span><b class="mono">${esc(s.fr.branch)}</b></div>
          <div class="kv"><span>فایل‌ها</span><b>${fa(s.fr.files.length)}</b></div>
          <div class="kv"><span>آخرین بارگذاری</span><b>${ago(d.uiLoaded)}</b></div>
          <div class="hint" style="margin-top:10px">مسیر خام: <span class="mono">https://raw.githubusercontent.com/${esc(s.fr.repo)}/${esc(s.fr.branch)}/</span></div>
          <div class="chips" style="margin-top:8px">${s.fr.files.map((f) => `<span class="chip"><span class="mono">${esc(f)}</span></span>`).join('')}</div>
        </div></div>
      <div class="card"><header><span class="ic">${ic('cloud')}</span><div><h3>پشتیبان و بازیابی</h3><p>Export / Import کامل تنظیمات و کاربران</p></div></header><div class="bd">
        <div class="btn-row"><button class="btn" data-act="backup">${ic('log')} دریافت پشتیبان</button>
        <button class="btn" data-act="restore">${ic('refresh')} بازیابی از فایل</button>
        <input type="file" id="restoreFile" accept="application/json" class="hide"></div>
        <div class="hint" style="margin-top:10px">پشتیبان شامل تنظیمات، کاربران، کلیدها و قواعد روتینگ است.</div>
      </div></div>
      <div class="card"><header><span class="ic bad">${ic('trash')}</span><div><h3>بازنشانی و خطرناک</h3><p>عملیات‌های برگشت‌ناپذیر</p></div></header><div class="bd">
        <div class="btn-row"><button class="btn d" data-act="factory">ریست کارخانه‌ای</button><button class="btn d" data-act="logs-clear">پاک‌سازی لاگ</button></div>
        <div class="hint" style="margin-top:10px">ریست کارخانه‌ای همه‌ی کاربران و تنظیمات را به حالت اول برمی‌گرداند.</div>
      </div></div>
    </div>`;
  }

  const schemaView = (key, head) => `<div class="page-head"><div><h1>${head[0]}</h1><p>${head[1]}</p></div></div>${SCHEMA[key].map((g) => group(g, S.d.settings)).join('')}${saveBtn('save-' + key)}`;

  const VIEWS = {
    dash: dashView, users: usersView, sub: subView, monitor: monitorView, update: updateView, logs: logsView, settings: settingsView,
    proto: () => schemaView('proto', ['پروتکل و کانفیگ', 'حالت Alpha/Beta/Both، ترنسپورت‌ها، TLS، ECH و Fragment']),
    network: () => schemaView('network', ['شبکه و آی‌پی', 'Clean IP، Proxy IP با failover، NAT64، DoH و GeoIP']),
    telegram: () => schemaView('telegram', ['ربات تلگرام', 'پنل تلگرامی، اعلان‌ها و مدیریت چندپنلی']) + tgExtra(),
    cloud: () => schemaView('cloud', ['کلودفلر و پنل‌های لینک‌شده', 'API، دامنه، سلامت دامنه و معماری Hub & Spoke']) + cloudExtra(),
    security: () => schemaView('security', ['امنیت و استتار', 'JWT، 2FA، rate limit، path rotation و پوشش']) + secExtra(),
  };

  function tgExtra() {
    const cmds = ['/start', '/panel', '/users', '/usage', '/sub <uuid>', '/add <name>', '/del <name>', '/reset <name>', '/extend <name> <days>', '/rename <name> <new>', '/note <name> <text>', '/limit <name> <n>', '/search <q>', '/inactive', '/panic', '/kill', '/dns <url>', '/ips <list>', '/relay <url>', '/nodes', '/lang en'];
    return `<div class="card"><header><span class="ic">${ic('bot')}</span><div><h3>فرمان‌های ربات</h3><p>پنل تلگرامی با دکمه‌های inline</p></div><div class="acts"><button class="btn sm s" data-act="tg-test">ارسال پیام تست</button></div></header>
      <div class="bd"><div class="chips">${cmds.map((c) => `<span class="chip"><span class="mono">${esc(c)}</span></span>`).join('')}</div>
      <div class="hint" style="margin-top:10px">مدیریت کاربران، آمار، تنظیمات سیستم، Panic/Kill، جستجو، تمدید انقضا، تغییر نام و یادداشت، محدودیت کانفیگ و مدیریت چندپنلی — همه از داخل تلگرام.</div></div></div>`;
  }
  function cloudExtra() {
    const d = S.d;
    return `<div class="grid g2">
      <div class="card"><header><span class="ic">${ic('net')}</span><div><h3>پنل‌های لینک‌شده</h3><p>Per-node API key</p></div><div class="acts"><button class="btn sm s" data-act="panel-new">${ic('plus')} افزودن</button></div></header>
        <div class="bd"><div class="list">${(d.panels || []).map((p) => `<div class="row-item"><span class="dot ${p.status === 'online' ? 'on' : p.status === 'syncing' ? 'warn' : 'bad'}"></span>
          <div class="grow"><b>${esc(p.name)}</b> <span class="badge ${p.role === 'hub' ? 'ac' : ''}">${esc(p.role)}</span><div class="mono cell-sub">${esc(p.url)}</div></div>
          <button class="btn sm" data-act="panel-sync" data-id="${esc(p.id)}">همگام</button><button class="btn sm d" data-act="panel-del" data-id="${esc(p.id)}">${ic('trash')}</button></div>`).join('') || '<div class="empty">پنلی لینک نشده</div>'}</div></div></div>
      <div class="card"><header><span class="ic b2">${ic('globe')}</span><div><h3>دامنه‌ی اختصاصی</h3><p>health check و وضعیت رکورد</p></div><div class="acts"><button class="btn sm" data-act="domain-check">بررسی سلامت</button></div></header>
        <div class="bd"><div id="domainOut"><div class="empty">برای بررسی دامنه، دکمه را بزنید</div></div></div></div>
    </div>`;
  }
  function secExtra() {
    const s = S.d.settings;
    return `<div class="grid g2">
      <div class="card"><header><span class="ic">${ic('key')}</span><div><h3>تغییر رمز و 2FA</h3><p>پس از تغییر، نشست‌ها باطل می‌شوند</p></div></header><div class="bd">
        <label class="f"><span>رمز فعلی</span><input type="password" id="pwOld"></label>
        <label class="f"><span>رمز جدید</span><input type="password" id="pwNew"></label>
        <div class="btn-row"><button class="btn p" data-act="pw-change">تغییر رمز</button><button class="btn" data-act="2fa-gen">ساخت کلید 2FA</button><button class="btn" data-act="rotate-path">چرخش مسیر ورود</button></div>
        <div id="totpOut" style="margin-top:12px"></div>
      </div></div>
      <div class="card"><header><span class="ic warn">${ic('shield')}</span><div><h3>پوشش و استتار</h3><p>سایت پوششی برای مسیرهای ناشناخته</p></div></header><div class="bd">
        <div class="kv"><span>مسیر ورود</span><b class="mono">/${esc(s.auth.path)}</b></div>
        <div class="kv"><span>Disguise</span><b>${s.auth.disguise ? 'فعال' : 'خاموش'}</b></div>
        <div class="kv"><span>سایت پوششی</span><b class="mono">${esc(s.auth.maintenanceHost)}</b></div>
        <div class="kv"><span>CSP / XFO / nosniff</span><b>${s.sec.csp ? 'فعال' : 'خاموش'}</b></div>
        <div class="kv"><span>CORS</span><b>${s.sec.cors ? 'فعال' : 'خاموش'}</b></div>
        <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="preview-decoy">پیش‌نمایش سایت پوششی</button></div>
      </div></div>
    </div>`;
  }

  /* ───────── shell ───────── */
  function render() {
    const app = $('#app'), nav = $('#nav');
    if (!S.token || !S.d) {
      app.classList.add('login-mode');
      nav.innerHTML = ''; $('#sidebar').style.display = 'none'; $('.main').style.display = '';
    $('#view').innerHTML = loginView();
    const tb0 = document.getElementById('tbState');
    if (tb0) { tb0.textContent = 'آماده ورود'; tb0.style.color = ''; }
    setTimeout(() => $('#lgPw')?.focus(), 60);
    return;
  }
    app.classList.remove('login-mode');
    $('#sidebar').style.display = '';
    const d = S.d, s = d.settings;
    $('#brandName').textContent = s.panel.name; $('#brandVer').textContent = 'v' + d.version;
    $('#sfStore').textContent = d.storage === 'kv' ? 'KV پایدار' : 'موقت';
    $('#sfUsers').textContent = fa(d.users.length) + ' کاربر';
    $('#sfVer').textContent = d.version;
    $('#tbState').textContent = s.auth.panic ? 'Panic Mode فعال است' : 'سرویس فعال';
    $('#tbReq').textContent = n(d.stats?.requests || 0) + ' req';
    $('#panicBtn').className = 'btn sm ' + (s.auth.panic ? 'd' : 's');
    nav.innerHTML = NAV.map((g) => `<div class="nav-group"><span>${g.g}</span>${g.items.map(([id, l, icn]) => `<button class="nav-item ${S.view === id ? 'on' : ''}" data-act="nav" data-view="${id}">${ic(icn)}<span>${l}</span>${id === 'users' ? `<span class="cnt">${fa(d.users.length)}</span>` : ''}${id === 'logs' ? `<span class="cnt">${fa((d.logs || []).length)}</span>` : ''}</button>`).join('')}</div>`).join('');
    $('#view').innerHTML = `<div class="fade">${(VIEWS[S.view] || dashView)()}</div>`;
    $('#foot').innerHTML = `${esc(s.panel.name)} • ${esc(location.hostname)} • ورکر کلاودفلر • UI از ${esc(s.fr.repo)}`;
  }

  async function refresh() {
    if (!S.token) { render(); return; }
    const d = await api('GET', '/api/state');
    if (d && !d.error) { S.d = d; render(); }
  }

  /* ───────── events ───────── */
  document.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-sw]');
    if (sw) { sw.classList.toggle('on'); const inp = sw.parentElement.querySelector(`[data-p="${sw.dataset.sw}"]`); if (inp) inp.checked = sw.classList.contains('on'); return; }
    const cd = e.target.closest('[data-chip-del]');
    if (cd) {
      const box = cd.closest('[data-chips]'), p = box.dataset.chips;
      const val = cd.dataset.chipDel, inp = box.parentElement.querySelector(`[data-p="${p}"]`);
      const list = inp.value.split('\n').filter((x) => x.trim() && x.trim() !== val);
      inp.value = list.join('\n'); box.querySelectorAll('.chip').forEach((c) => c.remove());
      list.forEach((v) => { const el = document.createElement('span'); el.className = 'chip'; el.innerHTML = `<span class="mono">${esc(v)}</span>`; box.appendChild(el); });
      return;
    }
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act, id = t.dataset.id, v = t.dataset.v;
    const busy = (lbl) => { t.disabled = true; t.innerHTML = `<span class="dot warn"></span> ${lbl}`; };
    try {
      if (a === 'login') {
        const pw = $('#lgPw').value, tp = $('#lgTp')?.value || '';
        const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw, totp: tp }) }).then((x) => x.json());
        if (r.token) { S.token = r.token; sessionStorage.setItem('sg_t', r.token); await refresh(); toast('خوش آمدید 👋'); } else toast(r.error || 'رمز نادرست است', 'err');
      }
      else if (a === 'nav') { S.view = t.dataset.view; $('#sidebar').classList.remove('open'); render(); }
      else if (a === 'copy') copy(v);
      else if (a === 'open') window.open(v, '_blank');
      else if (a === 'fmt') { S.fmt = v; render(); }
      else if (a === 'range') { S.range = v; render(); }
      else if (a === 'loglv') { S.tab.log = v; render(); }
      else if (a === 'sel-user') { /* handled by change */ }
      else if (a.startsWith('save-')) { const r = await api('PUT', '/api/settings', { settings: collect($('#view')) }); if (r.ok) { toast('تنظیمات ذخیره شد'); await refresh(); } else toast(r.error || 'خطا', 'err'); }
      else if (a === 'user-new') { const r = await api('POST', '/api/users', { name: 'کاربر ' + (S.d.users.length + 1) }); if (r.user) { S.sel = r.user.id; await refresh(); userModal(r.user, true); } }
      else if (a === 'user-edit') userModal(S.d.users.find((u) => u.id === id));
      else if (a === 'user-toggle' || a === 'user-reset' || a === 'user-del') { const r = await api('POST', '/api/users', { id, op: a.replace('user-', '') }); if (r.ok) { toast('انجام شد'); await refresh(); } }
      else if (a === 'sub-of') { S.sel = id; S.view = 'sub'; render(); }
      else if (a === 'qr') qrModal(v);
      else if (a === 'sub-load') {
        busy('در حال دریافت'); const u = S.d.users.find((x) => x.id === id);
        const link = `${location.origin}/${S.d.settings.sub.path}/${u.uuid}${S.fmt !== 'base64' ? '?format=' + S.fmt : ''}`;
        const txt = await fetch(link).then((r) => r.text());
        const out = $('#subOut'); if (out) out.innerHTML = `<pre class="code"><div class="hd"><span>${esc(S.fmt)}</span><button class="btn sm" data-act="copy" data-v="${esc(txt.slice(0, 60000))}">کپی</button></div>${esc(txt.slice(0, 6000))}${txt.length > 6000 ? '\n…' : ''}</pre>`;
      }
      else if (a === 'user-save') {
        const patch = collect($('#mbox'));
        const r = await api('POST', '/api/users', { id, op: 'update', patch });
        if (r.ok) { toast('ذخیره شد'); $('#modalRoot').innerHTML = ''; await refresh(); } else toast(r.error || 'خطا', 'err');
      }
      else if (a === 'close') $('#modalRoot').innerHTML = '';
      else if (a === 'regen') { const inp = $('#mbox [data-p="uuid"]'); if (inp) inp.value = crypto.randomUUID(); }
      else if (a === 'key-new') { const r = await api('POST', '/api/keys', {}); if (r.ok) { toast('کلید ساخته شد'); await refresh(); } }
      else if (a === 'key-del') { const r = await api('DELETE', '/api/keys?id=' + id); if (r.ok) { toast('کلید حذف شد', 'err'); await refresh(); } }
      else if (a === 'panel-new') { const name = prompt('نام پنل:'); const url = prompt('آدرس ورکر:'); if (name && url) { await api('POST', '/api/panels', { name, url }); toast('پنل لینک شد'); await refresh(); } }
      else if (a === 'panel-del') { await api('DELETE', '/api/panels?id=' + id); toast('حذف شد', 'err'); await refresh(); }
      else if (a === 'panel-sync') { busy('همگام‌سازی'); await api('POST', '/api/panels', { id, op: 'sync' }); toast('همگام شد'); await refresh(); }
      else if (a === 'domain-check') { busy('بررسی'); const r = await api('POST', '/api/action', { act: 'domain-health' }); const o = $('#domainOut'); if (o) o.innerHTML = (r.checks || []).map((c) => `<div class="kv"><span>${esc(c.name)}</span><span class="badge ${c.ok ? 'ok' : 'bad'}">${esc(c.note || (c.ok ? 'سالم' : 'خطا'))}</span></div>`).join(''); }
      else if (a === 'tg-test') { busy('ارسال'); const r = await api('POST', '/api/action', { act: 'tg-test' }); toast(r.ok ? 'پیام تست ارسال شد' : 'ارسال نشد', r.ok ? 'ok' : 'err'); }
      else if (a === 'upd-check') { busy('بررسی'); const r = await api('POST', '/api/action', { act: 'update-check' }); toast(r.msg || 'بررسی شد', 'info'); await refresh(); }
      else if (a === 'upd-deploy') { busy('نصب'); const r = await api('POST', '/api/action', { act: 'update-deploy' }); toast(r.msg || 'نصب شد'); await refresh(); }
      else if (a === 'upd-rollback') { busy('بازگشت'); const r = await api('POST', '/api/action', { act: 'update-rollback' }); toast(r.msg || 'بازگشت انجام شد', 'info'); await refresh(); }
      else if (a === 'rotate-path') { const r = await api('POST', '/api/action', { act: 'rotate-path' }); toast('مسیر جدید: /' + (r.path || '')); await refresh(); }
      else if (a === 'ui-refresh') { busy('بازخوانی'); const r = await api('POST', '/api/action', { act: 'ui-refresh' }); toast(r.ok ? 'فایل‌های UI بازخوانی شد' : 'خطا در بازخوانی', r.ok ? 'ok' : 'err'); await refresh(); }
      else if (a === 'preview-decoy') { const r = await fetch('/' + Math.random().toString(36).slice(2)).then((x) => x.text()); modal(`<header><h3>پیش‌نمایش سایت پوششی</h3><div class="acts"><button class="btn sm" data-act="close">بستن</button></div></header><div class="bd"><pre class="code">${esc(r.slice(0, 1200))}</pre></div>`); }
      else if (a === 'pw-change') { const r = await api('POST', '/api/action', { act: 'pw-change', old: $('#pwOld').value, nw: $('#pwNew').value }); toast(r.ok ? 'رمز تغییر کرد — دوباره وارد شوید' : (r.error || 'خطا'), r.ok ? 'ok' : 'err'); if (r.ok) { S.token = ''; sessionStorage.removeItem('sg_t'); await api('GET', '/api/state'); render(); } }
      else if (a === '2fa-gen') { const r = await api('POST', '/api/action', { act: '2fa-secret' }); $('#totpOut').innerHTML = r.secret ? `<div class="row-item"><div class="grow"><b class="mono">${esc(r.secret)}</b><div class="cell-sub mono">${esc(r.url || '')}</div></div><button class="btn sm" data-act="copy" data-v="${esc(r.secret)}">کپی</button></div>` : '<div class="empty">ساخته نشد</div>'; }
      else if (a === 'backup') { const blob = new Blob([JSON.stringify(S.d, null, 2)], { type: 'application/json' }); const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'panel-backup.json'; el.click(); }
      else if (a === 'restore') $('#restoreFile').click();
      else if (a === 'factory') { if (confirm('همه‌چیز به حالت اول برگردد؟')) { await api('POST', '/api/action', { act: 'factory' }); toast('ریست شد', 'err'); await refresh(); } }
      else if (a === 'logs-clear') { await api('POST', '/api/action', { act: 'logs-clear' }); toast('لاگ پاک شد', 'err'); await refresh(); }
    } catch (err) { toast('خطا: ' + err.message, 'err'); }
  });

  document.addEventListener('change', async (e) => {
    if (e.target.id === 'uSearch') { S.q = e.target.value; const p = e.target.selectionStart; render(); const el = $('#uSearch'); if (el) { el.focus(); el.setSelectionRange(p, p); } }
    if (e.target.closest('[data-act="sel-user"]')) { S.sel = e.target.value; render(); }
    if (e.target.id === 'restoreFile') {
      const f = e.target.files[0]; if (!f) return;
      const txt = await f.text();
      const r = await api('POST', '/api/action', { act: 'restore', data: JSON.parse(txt) });
      toast(r.ok ? 'بازیابی شد' : (r.error || 'خطا'), r.ok ? 'ok' : 'err'); if (r.ok) await refresh();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'uSearch') { S.q = e.target.value; const p = e.target.selectionStart; render(); const el = $('#uSearch'); if (el) { el.focus(); el.setSelectionRange(p, p); } }
    if (e.target.type === 'range') { const b = e.target.parentElement.querySelector('b'); if (b) b.textContent = e.target.value + (b.textContent.match(/[^\d]+$/)?.[0] || ''); }
    if (e.target.matches('[data-t="lines"]')) {
      const box = e.target.parentElement.querySelector('[data-chips]');
      if (box) box.innerHTML = e.target.value.split('\n').filter((x) => x.trim()).map((x) => `<span class="chip"><span class="mono">${esc(x.trim())}</span></span>`).join('');
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'lgPw') $('[data-act="login"]')?.click(); if (e.key === 'Escape') $('#modalRoot').innerHTML = ''; });

  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#logoutBtn').onclick = () => { S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); };
  $('#panicBtn').onclick = async () => { const r = await api('POST', '/api/action', { act: 'panic' }); toast(r.panic ? 'Panic Mode فعال شد' : 'سرویس فعال شد', r.panic ? 'err' : 'ok'); await refresh(); };
  $('#themeBtn').onclick = () => { const h = document.documentElement; const cur = h.dataset.theme === 'light' ? 'dark' : 'light'; h.dataset.theme = cur; localStorage.setItem('sg_theme', cur); setThemeIcon(); };
  function setThemeIcon() { $('#themeBtn').textContent = document.documentElement.dataset.theme === 'light' ? '☾' : '☀'; }

  function userModal(u, isNew = false) {
    const val = (p) => { if (p === 'expiryDays') return u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : 0; if (Array.isArray(u[p])) return u[p].join('\n'); return u[p] ?? ''; };
    modal(`<header><span class="ic">${ic('users')}</span><div><h3>${isNew ? 'کاربر جدید' : 'ویرایش ' + esc(u.name)}</h3><p>تنظیمات اختصاصی، سهمیه و محدودیت‌ها</p></div>
      <div class="acts"><button class="btn sm" data-act="regen">UUID جدید</button><button class="btn sm" data-act="close">بستن</button></div></header>
      <div class="bd"><div class="switches two">${UF.map((f) => field({ ...f, t: f.t === 'sw' ? 'sw' : (f.t === 'area' ? 'area' : f.t) }, val(f.p))).join('')}</div>
      <div class="grid g4" style="margin-top:10px">
        <div class="stat"><div class="lbl">مصرف</div><div class="val" style="font-size:15px">${bytes(u.up + u.down)}</div></div>
        <div class="stat"><div class="lbl">لینک ساب</div><div class="val" style="font-size:12px"><a href="/${esc(S.d.settings.sub.path)}/${esc(u.uuid)}" target="_blank">باز کردن</a></div></div>
        <div class="stat"><div class="lbl">وضعیت</div><div class="val" style="font-size:14px">${u.enabled ? 'فعال' : 'غیرفعال'}</div></div>
        <div class="stat"><div class="lbl">آخرین فعالیت</div><div class="val" style="font-size:13px">${ago(u.lastSeen)}</div></div>
      </div></div>
      <footer><button class="btn d" data-act="user-del" data-id="${u.id}">${ic('trash')} حذف</button><span class="spacer"></span>
      <button class="btn" data-act="close">انصراف</button><button class="btn p" data-act="user-save" data-id="${u.id}">${ic('shield')} ذخیره</button></footer>`, true);
  }
  function qrModal(link) {
    modal(`<header><h3>QR اشتراک</h3><div class="acts"><button class="btn sm" data-act="close">بستن</button></div></header>
      <div class="bd" style="text-align:center"><div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}" width="220" height="220" alt="QR"></div>
      <p class="mono" style="word-break:break-all;font-size:10px;margin:12px 0">${esc(link)}</p>
      <div class="btn-row" style="justify-content:center"><button class="btn sm" data-act="copy" data-v="${esc(link)}">کپی</button></div></div>`);
  }

  /* ───────── boot ───────── */
  document.documentElement.dataset.theme = localStorage.getItem('sg_theme') || 'dark';
  setThemeIcon();
  render();
  window.__sgBooted = true;   /* برای اسکریپت نگهبان در index.html */
  refresh();
  setInterval(() => { if (S.token && S.view === 'dash') refresh(); }, 20000);
})();
