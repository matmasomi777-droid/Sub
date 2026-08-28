/* ═══════════════════════════════════════════════════════════════
   پنل مدیریت — منطق سمت کلاینت
   آیکون: Font Awesome 6  •  فونت: Vazirmatn + JetBrains Mono
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = { token: sessionStorage.getItem('sg_t') || '', d: null, view: 'dash', tab: {}, sel: null, fmt: 'base64', range: 'd', q: '' };

  /* ─────────── ابزارها ─────────── */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const n = (v) => (v == null || isNaN(v) ? '—' : fa(Number(v).toLocaleString('en-US')));
  const bytes = (b) => { if (!b || b < 0) return '۰ بایت'; const u = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت']; const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024))); return fa((b / 1024 ** i).toFixed(i ? 1 : 0)) + ' ' + u[i]; };
  const ago = (t) => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 60) return 'همین حالا'; if (s < 3600) return fa(Math.floor(s / 60)) + ' دقیقه پیش'; if (s < 86400) return fa(Math.floor(s / 3600)) + ' ساعت پیش'; return fa(Math.floor(s / 86400)) + ' روز پیش'; };
  const icon = (c, cls = '') => '<i class="' + (c.startsWith('fa-') ? c : 'fa-solid ' + c) + (cls ? ' ' + cls : '') + '"></i>';
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, p, v) => { const a = p.split('.'); let c = o; for (let i = 0; i < a.length - 1; i++) { c[a[i]] = c[a[i]] || {}; c = c[a[i]]; } c[a[a.length - 1]] = v; };

  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { authorization: 'Bearer ' + S.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ error: 'bad json' }));
    if (r.status === 401 && S.token) { S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); }
    return j;
  }
  const toast = (msg, kind = 'ok') => { const d = document.createElement('div'); d.className = 'toast ' + kind; const ic = kind === 'err' ? 'fa-circle-xmark' : kind === 'info' ? 'fa-circle-info' : 'fa-circle-check'; d.innerHTML = icon(ic) + '<span>' + esc(msg) + '</span>'; $('#toastRoot').appendChild(d); setTimeout(() => d.remove(), 3400); };
  const copy = (t) => { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('در کلیپ‌بورد کپی شد')).catch(() => toast('کپی نشد', 'err')); };
  const modal = (html, wide) => { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="box' + (wide ? ' wide' : '') + '" id="mbox">' + html + '</div>'; m.onmousedown = (e) => { if (e.target === m) m.remove(); }; $('#modalRoot').appendChild(m); return m; };
  const closeM = () => { $('#modalRoot').innerHTML = ''; };
  const busy = (el, label) => { if (el) { el.disabled = true; el.dataset.old = el.innerHTML; el.innerHTML = icon('fa-spinner fa-spin') + ' ' + label; } };
  const free = (el) => { if (el && el.dataset.old) { el.disabled = false; el.innerHTML = el.dataset.old; delete el.dataset.old; } };

  /* ─────────── نمودار سطحی (SVG دقیق با تولتیپ) ─────────── */
  function area(data, opt = {}) {
    const W = 600, H = 180, pad = { t: 12, r: 8, b: 20, l: 8 };
    const d = (data && data.length ? data : [0]).map((x) => Number(x) || 0);
    const mx = Math.max(...d, 0.001);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const X = (i) => pad.l + (i / Math.max(1, d.length - 1)) * iw;   // چپ→راست (طبیعی)
    const Y = (v) => pad.t + ih - (v / mx) * ih;
    const pts = d.map((v, i) => [X(i), Y(v)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
    const areaD = line + ' L' + X(d.length - 1).toFixed(2) + ',' + (pad.t + ih) + ' L' + X(0).toFixed(2) + ',' + (pad.t + ih) + ' Z';
    const c = opt.color || 'var(--ac)', c2 = opt.color2 || 'var(--ac2)';
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    const grid = [0, .25, .5, .75, 1].map((g) => '<line class="gl" x1="' + pad.l + '" y1="' + (pad.t + ih * g) + '" x2="' + (W - pad.r) + '" y2="' + (pad.t + ih * g) + '"/>').join('');
    const labels = [0, .5, 1].map((g) => '<text class="ax" x="' + pad.l + '" y="' + (pad.t + ih * g - 3) + '">' + (mx * (1 - g)).toFixed(mx < 10 ? 1 : 0) + '</text>').join('');
    const svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="f' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".34"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="s' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c + '"/></linearGradient></defs>' +
      grid + labels +
      '<path class="ar" d="' + areaD + '" fill="url(#f' + id + ')"/>' +
      '<path class="ln" d="' + line + '" stroke="url(#s' + id + ')"/>' +
      '<circle class="pt" r="3.5" cx="-20" cy="-20"/><line class="hv" x1="0" y1="0" x2="0" y2="0" style="display:none"/></svg>';
    return '<div style="position:relative">' + svg + '<div class="chart-tip" style="display:none"></div></div>';
  }
  /* اتصال تولتیپ به همه‌ی نمودارها */
  function bindCharts(root, series) {
    $$('.chart', root).forEach((svg) => {
      const d = (series && series.length ? series : []).map((x) => Number(x) || 0);
      if (!d.length) return;
      const wrap = svg.parentElement, tip = wrap.querySelector('.chart-tip');
      const pt = svg.querySelector('.pt'), hv = svg.querySelector('.hv');
      const on = (e) => {
        const r = svg.getBoundingClientRect();
        const rel = (e.clientX - r.left) / r.width;
        const i = Math.max(0, Math.min(d.length - 1, Math.round(rel * (d.length - 1))));
        const mx = Math.max(...d, 0.001), W = 600, H = 180, pad = { t: 12, r: 8, b: 20, l: 8 };
        const x = pad.l + (i / Math.max(1, d.length - 1)) * (W - pad.l - pad.r);
        const y = pad.t + (H - pad.t - pad.b) - (d[i] / mx) * (H - pad.t - pad.b);
        pt.setAttribute('cx', x); pt.setAttribute('cy', y);
        hv.setAttribute('x1', x); hv.setAttribute('x2', x); hv.setAttribute('y1', pad.t); hv.setAttribute('y2', H - pad.b); hv.style.display = '';
        tip.style.display = 'block';
        tip.style.left = ((x / W) * 100) + '%';
        tip.style.top = ((y / H) * 100) + '%';
        tip.textContent = 'نقطه ' + fa(i + 1) + ' • ' + fa(d[i].toFixed(2));
      };
      svg.addEventListener('mousemove', on);
      svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; pt.setAttribute('cx', -20); hv.style.display = 'none'; });
    });
  }
  const bars = (data, unit) => { const d = data.length ? data : [0]; const mx = Math.max(...d, 0.001); return '<div class="bars">' + d.map((v, i) => '<div data-tip="' + fa(Number(v).toFixed(2)) + (unit || '') + ' • ' + fa(i + 1) + '" style="height:' + Math.max(3, (Number(v) / mx) * 92) + 'px"></div>').join('') + '</div>'; };
  const ring = (p, l, c) => { const r = 40, cc = 2 * Math.PI * r, v = Math.max(0, Math.min(100, p)); return '<div class="ring"><svg width="100" height="100"><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--bs)" stroke-width="9"/><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + (c || 'var(--ac)') + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + cc + '" stroke-dashoffset="' + (cc - (v / 100) * cc) + '" style="transition:.7s"/></svg><div class="c">' + fa(v.toFixed(0)) + '٪<span>' + esc(l) + '</span></div></div>'; };
  const spark = (d) => { const w = 70, h = 20, m = Math.max(...d, .001); const p = d.map((v, i) => (i ? 'L' : 'M') + (i / (d.length - 1)) * w + ',' + (h - (v / m) * (h - 2) - 1)).join(' '); return '<svg width="' + w + '" height="' + h + '"><path d="' + p + '" fill="none" stroke="var(--ac)" stroke-width="1.5"/></svg>'; };

  /* ─────────── فرم‌ساز ─────────── */
  function field(f, val) {
    const p = esc(f.p);
    let inner;
    if (f.t === 'sw') inner = '<div class="sw ' + (f.bad ? 'bad ' : '') + (val ? 'on' : '') + '" data-sw="' + p + '"><i></i></div><input type="checkbox" class="hide" data-p="' + p + '" data-t="bool"' + (val ? ' checked' : '') + '>';
    else if (f.t === 'sel') inner = '<select data-p="' + p + '">' + f.o.map((o) => '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc((f.lbls && f.lbls[o]) || o) + '</option>').join('') + '</select>';
    else if (f.t === 'num') inner = '<input type="number" data-p="' + p + '" data-t="num" value="' + esc(val ?? 0) + '">';
    else if (f.t === 'pw') inner = '<input type="password" data-p="' + p + '" value="' + esc(val ?? '') + '" class="mono">';
    else if (f.t === 'area') inner = '<textarea rows="4" data-p="' + p + '" data-t="' + (f.dt || 'lines') + '">' + esc(Array.isArray(val) ? val.join('\n') : (val ?? '')) + '</textarea>';
    else if (f.t === 'rng') inner = '<div class="range"><input type="range" data-p="' + p + '" data-t="num" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + esc(val ?? f.min) + '"><b>' + esc(val ?? f.min) + esc(f.u || '') + '</b></div>';
    else inner = '<input data-p="' + p + '" value="' + esc(val ?? '') + '"' + (f.mono ? ' class="mono"' : '') + '>';
    /* نکته: برای سوییچ از div استفاده می‌شود، نه label — label باعث می‌شد کلیک،
       مقدار را دو بار تغییر دهد (یک‌بار توسط ما، یک‌بار توسط رفتار پیش‌فرض label) */
    const tag = f.t === 'sw' ? 'div' : 'label';
    return '<' + tag + ' class="f"><span>' + esc(f.l) + (f.req ? ' <b style="color:var(--bad)">*</b>' : '') + '</span>' + inner + (f.h ? '<div class="hint" style="margin-top:5px">' + f.h + '</div>' : '') + '</' + tag + '>';
  }
  const group = (g, s) => '<div class="card"><header><span class="ic ' + (g.ic || '') + '">' + icon(g.icon || 'fa-gear') + '</span><div><h3>' + esc(g.t) + '</h3>' + (g.d ? '<p>' + g.d + '</p>' : '') + '</div></header><div class="bd"><div class="switches ' + (g.two ? 'two' : '') + '">' + g.f.map((f) => field(f, getP(s, f.p))).join('') + '</div></div></div>';
  function collect(root) { const o = {}; if (!root) return o; $$('[data-p]', root).forEach((el) => { const t = el.dataset.t; let v = el.type === 'checkbox' ? el.checked : el.value; if (t === 'num') v = Number(v) || 0; if (t === 'bool') v = !!v; if (t === 'lines') v = String(v).split('\n').map((x) => x.trim()).filter(Boolean); setP(o, el.dataset.p, v); }); return o; }
  const saveBtn = (act, lbl) => '<div class="btn-row" style="margin-top:4px"><button class="btn p" data-act="' + act + '">' + icon('fa-floppy-disk') + ' ' + (lbl || 'ذخیره تنظیمات') + '</button><span class="hint">تغییرات بلافاصله روی کانفیگ‌ها اعمال می‌شود.</span></div>';

  /* ─────────── ناوبری و اسکیمای تنظیمات ─────────── */
  const NAV = [
    { g: 'عملیات', items: [['dash', 'نمای کلی', 'fa-gauge-high'], ['users', 'کاربران', 'fa-users'], ['sub', 'اشتراک', 'fa-link']] },
    { g: 'هسته', items: [['proto', 'پروتکل و کانفیگ', 'fa-shield-halved'], ['network', 'شبکه و آی‌پی', 'fa-network-wired'], ['monitor', 'مانیتورینگ', 'fa-chart-line']] },
    { g: 'زیرساخت', items: [['telegram', 'ربات تلگرام', 'fa-brands fa-telegram'], ['cloud', 'کلودفلر و پنل‌ها', 'fa-cloud'], ['update', 'به‌روزرسانی', 'fa-rotate']] },
    { g: 'سیستم', items: [['security', 'امنیت و استتار', 'fa-lock'], ['logs', 'لاگ فعالیت', 'fa-list-check'], ['settings', 'تنظیمات و پشتیبان', 'fa-gear']] },
  ];

  const SCHEMA = {
    proto: [
      { t: 'حالت پروتکل', icon: 'fa-shield-halved', d: 'Alpha = VLESS • Beta = Trojan(SHA-224) • Both = هر دو', two: 1, f: [
        { p: 'mode', l: 'حالت کاری', t: 'sel', o: ['alpha', 'beta', 'both'], lbls: { alpha: 'Alpha — VLESS', beta: 'Beta — Trojan', both: 'Both — هر دو' } },
        { p: 'multiSplit', l: 'تقسیم مساوی بین پروتکل‌ها', t: 'sw', h: 'اشتراک چندپروتکله' },
        { p: 'protocols.vless', l: 'VLESS', t: 'sw', h: 'پشتیبانی‌شده در هسته‌ی تونل' },
        { p: 'protocols.trojan', l: 'Trojan (SHA-224)', t: 'sw', h: 'پشتیبانی‌شده در هسته‌ی تونل' },
        { p: 'protocols.ss', l: 'Shadowsocks', t: 'sw', bad: 1, h: 'فقط تولید در ساب — هسته نمی‌پذیرد' },
        { p: 'protocols.vmess', l: 'VMess', t: 'sw', bad: 1, h: 'فقط تولید در ساب — هسته نمی‌پذیرد' },
        { p: 'trojanHash', l: 'هش رمز Trojan', t: 'sel', o: ['sha224', 'sha256'] },
      ] },
      { t: 'ترنسپورت', icon: 'fa-bolt', d: 'هسته‌ی تونل فقط WebSocket را می‌پذیرد', two: 1, f: [
        { p: 'transport', l: 'نوع ترنسپورت', t: 'sel', o: ['ws', 'grpc', 'xhttp'], lbls: { ws: 'WebSocket ✓', grpc: 'gRPC (فقط ساب)', xhttp: 'XHTTP (فقط ساب)' } },
        { p: 'path', l: 'مسیر پایه (path)', t: 'text', mono: 1, h: 'مسیر اتصال تونل — باید با / شروع شود' },
        { p: 'grpcService', l: 'gRPC Service Name', t: 'text', mono: 1 },
        { p: 'xhttpMode', l: 'XHTTP Mode', t: 'sel', o: ['auto', 'packet-up', 'stream-up', 'stream-one'] },
        { p: 'tfo', l: 'TCP Fast Open (TFO)', t: 'sw' },
        { p: 'randomJunk', l: 'جانک تصادفی مسیر (پایدار)', t: 'sw', h: 'مسیر برای هر کاربر ثابت می‌ماند و با رفرش ساب عوض نمی‌شود' },
        { p: 'earlyData', l: 'Early Data (?ed=2048)', t: 'sw', h: 'خاموش = سازگار با همه‌ی کلاینت‌ها (پیشنهادی). روشن = سرعت اتصال بیشتر ولی بعضی کلاینت‌ها وصل نمی‌شوند' },
        { p: 'ports', l: 'پورت‌های TLS (با کاما)', t: 'text', mono: 1 },
        { p: 'mux', l: 'Mux multiplexing', t: 'sw' },
      ] },
      { t: 'TLS و رمزنگاری', icon: 'fa-lock', d: 'uTLS، ECH و ALPN', two: 1, f: [
        { p: 'tls', l: 'TLS فعال', t: 'sw' },
        { p: 'fingerprint', l: 'uTLS Fingerprint', t: 'sel', o: ['randomized', 'chrome', 'firefox', 'safari', 'ios', 'android', 'edge', 'random'] },
        { p: 'sni', l: 'SNI', t: 'text', mono: 1, h: 'خالی = دامنه‌ی خود ورکر (پیشنهادی). مقدار دیگر = کانفیگ وصل نمی‌شود' },
        { p: 'host', l: 'Host header', t: 'text', mono: 1, h: 'خالی = دامنه‌ی خود ورکر' },
        { p: 'alpn', l: 'ALPN', t: 'text', mono: 1 },
        { p: 'allowInsecure', l: 'allowInsecure', t: 'sw', bad: 1, h: 'فقط برای تست' },
        { p: 'ech.enabled', l: 'ECH (رمزنگاری SNI)', t: 'sw' },
        { p: 'ech.mode', l: 'روش دریافت ECH config', t: 'sel', o: ['doh', 'sni'] },
      ] },
      { t: 'Fragment', icon: 'fa-scissors', d: 'شکستن بسته‌ی TLS', two: 1, f: [
        { p: 'fragment.enabled', l: 'Fragment فعال', t: 'sw' },
        { p: 'fragment.mode', l: 'حالت', t: 'sel', o: ['shadowrocket', 'happ', 'custom'] },
        { p: 'fragment.length', l: 'طول (بایت)', t: 'text', mono: 1 },
        { p: 'fragment.interval', l: 'فاصله (ms)', t: 'text', mono: 1 },
      ] },
    ],
    network: [
      { t: 'آی‌پی‌های پاک', icon: 'fa-network-wired', d: 'قالب ip#نام', two: 1, f: [
        { p: 'cleanIPs', l: 'لیست IP پاک (هر خط یکی)', t: 'area', dt: 'lines', h: 'مثال: 104.17.1.1#فرانکفورت' },
        { p: 'perIsp', l: 'استخر اختصاصی هر اپراتور', t: 'sw' },
        { p: 'ispPools', l: 'استخرهای ISP', t: 'area', dt: 'lines', h: 'MCI=104.17.1.1,104.17.1.2' },
        { p: 'ipRotation', l: 'چرخش خودکار بر اساس اپراتور', t: 'sw' },
        { p: 'nodeLimit', l: 'سقف گره در هر اشتراک', t: 'num' },
      ] },
      { t: 'پروکسی و ریلی', icon: 'fa-server', d: 'failover و مسیر پشتیبان', two: 1, f: [
        { p: 'proxyIPs', l: 'Proxy IPs (هر خط یکی)', t: 'area', dt: 'lines' },
        { p: 'failover', l: 'failover خودکار', t: 'sw' },
        { p: 'failoverTimeout', l: 'زمان‌سنج failover (ms)', t: 'num' },
        { p: 'backupRelay', l: 'Backup Relay', t: 'text', mono: 1 },
        { p: 'customRelay', l: 'Custom Relay', t: 'text', mono: 1 },
        { p: 'upstream', l: 'Upstream (VLESS URI)', t: 'area', dt: 'lines', h: 'زنجیره‌ی پراکسی با detour' },
      ] },
      { t: 'DNS و NAT64', icon: 'fa-globe', d: 'resolve قبل از اتصال، جلوگیری از SNI leak', two: 1, f: [
        { p: 'doh.url', l: 'Custom DoH', t: 'text', mono: 1 },
        { p: 'dohProxy', l: 'اندپوینت DoH برای کلاینت (/dns-query)', t: 'sw' },
        { p: 'resolveFirst', l: 'DNS resolution قبل از اتصال', t: 'sw' },
        { p: 'nat64.prefix', l: 'NAT64 Prefix', t: 'text', mono: 1 },
        { p: 'nat64.fromUrl', l: 'دریافت NAT64 از URL', t: 'sw' },
        { p: 'nat64.url', l: 'آدرس دریافت NAT64', t: 'text', mono: 1 },
        { p: 'raceDial', l: 'تلاش همزمان (race dial)', t: 'num' },
        { p: 'geoip.enabled', l: 'GeoIP lookup (پرچم + ISP)', t: 'sw' },
        { p: 'geoip.api', l: 'سرویس GeoIP', t: 'text', mono: 1 },
      ] },
    ],
    telegram: [
      { t: 'ربات تلگرام', icon: 'fa-brands fa-telegram', d: 'پنل تلگرامی با دکمه‌های inline', two: 1, f: [
        { p: 'tg.enabled', l: 'فعال‌سازی ربات', t: 'sw' },
        { p: 'tg.lang', l: 'زبان ربات', t: 'sel', o: ['fa', 'en'], lbls: { fa: 'فارسی', en: 'English' } },
        { p: 'tg.token', l: 'Bot Token', t: 'pw', mono: 1 },
        { p: 'tg.chatId', l: 'Chat ID', t: 'text', mono: 1 },
        { p: 'tg.adminId', l: 'Admin ID', t: 'text', mono: 1 },
        { p: 'tg.silent', l: 'هشدارهای بی‌صدا', t: 'sw' },
        { p: 'tg.multiPanel', l: 'مدیریت چندپنلی از تلگرام', t: 'sw' },
        { p: 'tg.loginAlert', l: 'هشدار ورود', t: 'sw' },
        { p: 'tg.autoDisableAlert', l: 'هشدار غیرفعال‌سازی خودکار', t: 'sw' },
        { p: 'tg.usageFromCF', l: 'Usage از Cloudflare API', t: 'sw' },
        { p: 'tg.notify.user', l: 'اعلان: کاربر جدید', t: 'sw' },
        { p: 'tg.notify.quota', l: 'اعلان: اتمام سهمیه', t: 'sw' },
        { p: 'tg.notify.expiry', l: 'اعلان: نزدیک انقضا', t: 'sw' },
        { p: 'tg.notify.err', l: 'اعلان: خطای ورکر', t: 'sw' },
        { p: 'tg.notify.daily', l: 'گزارش روزانه', t: 'sw' },
      ] },
    ],
    cloud: [
      { t: 'Cloudflare API', icon: 'fa-cloud', d: 'استقرار، آمار و دامنه', two: 1, f: [
        { p: 'cf.accountId', l: 'Account ID', t: 'text', mono: 1 },
        { p: 'cf.apiToken', l: 'API Token', t: 'pw', mono: 1 },
        { p: 'cf.zoneId', l: 'Zone ID', t: 'text', mono: 1 },
        { p: 'cf.domain', l: 'دامنه‌ی اختصاصی', t: 'text', mono: 1 },
        { p: 'cf.usageApi', l: 'آمار درخواست از CF API', t: 'sw' },
        { p: 'panel.name', l: 'نام پنل', t: 'text' },
        { p: 'panel.url', l: 'آدرس پنل', t: 'text', mono: 1 },
        { p: 'kvBinding', l: 'بایندینگ KV', t: 'text', mono: 1 },
      ] },
      { t: 'پنل‌های لینک‌شده', icon: 'fa-network-wired', d: 'Hub & Spoke', two: 1, f: [
        { p: 'linked.enabled', l: 'اتصال چندپنلی', t: 'sw' },
        { p: 'linked.hubUrl', l: 'آدرس Hub', t: 'text', mono: 1 },
        { p: 'linked.apiKey', l: 'کلید همگام‌سازی', t: 'pw', mono: 1 },
        { p: 'linked.propagateConfig', l: 'انتشار کانفیگ به نودها', t: 'sw' },
        { p: 'linked.propagateUpdate', l: 'انتشار آپدیت به نودها', t: 'sw' },
        { p: 'linked.loginSignal', l: 'Login signal', t: 'sw' },
      ] },
    ],
    update: [
      { t: 'به‌روزرسانی خودکار', icon: 'fa-rotate', d: 'مقایسه‌ی نسخه، استقرار و بازگشت', two: 1, f: [
        { p: 'upd.auto', l: 'به‌روزرسانی خودکار', t: 'sw' },
        { p: 'upd.repo', l: 'مخزن GitHub', t: 'text', mono: 1 },
        { p: 'upd.channel', l: 'کانال', t: 'sel', o: ['stable', 'beta'] },
        { p: 'upd.interval', l: 'بازه‌ی بررسی (دقیقه)', t: 'rng', min: 30, max: 1440, step: 30, u: ' دقیقه' },
        { p: 'upd.healthCheck', l: 'سلامت‌سنجی بعد از آپدیت', t: 'sw' },
        { p: 'upd.rollback', l: 'بازگشت خودکار در صورت خطا', t: 'sw' },
      ] },
    ],
    security: [
      { t: 'احراز هویت', icon: 'fa-key', d: 'توکن ۲۴ ساعته + 2FA + rate limit', two: 1, f: [
        { p: 'auth.totp', l: '2FA (TOTP / Google Authenticator)', t: 'sw' },
        { p: 'auth.sessionMin', l: 'انقضای نشست (دقیقه)', t: 'rng', min: 5, max: 1440, step: 5, u: ' دقیقه' },
        { p: 'auth.loginRate', l: 'محدودیت ورود', t: 'text', mono: 1, h: '۵ تلاش در ۱۰ دقیقه' },
        { p: 'auth.recoveryTg', l: 'بازیابی از تلگرام', t: 'sw' },
        { p: 'auth.recoveryCf', l: 'بازیابی با توکن کلودفلر', t: 'sw' },
      ] },
      { t: 'مسیر ورود و سایت پوششی', icon: 'fa-mask', d: 'پنل روی مسیر مخفی؛ ریشه‌ی دامنه یک سایت واقعی نشان می‌دهد', two: 1, f: [
        { p: 'auth.path', l: 'مسیر ورود پنل', t: 'text', mono: 1, h: 'پنل روی /این‌مسیر سرو می‌شود. ریشه (/) سایت پوششی واقعی نشان می‌دهد' },
        { p: 'auth.disguise', l: 'Disguise mode', t: 'sw', h: 'خاموش = ریشه هم پنل را نشان می‌دهد' },
        { p: 'auth.maintenanceHost', l: 'سایت پوششی واقعی', t: 'sel', o: ['nginx', 'wiki', 'wp', 'cloudflare', 'maintenance'], lbls: { nginx: 'nginx.org (سایت رسمی nginx)', wiki: 'ویکی‌پدیا — مقاله‌ی Web server', wp: 'wordpress.org', cloudflare: 'صفحه‌ی خطای کلاودفلر', maintenance: 'example.com' } },
        { p: 'auth.decoyUrl', l: 'آدرس سایت پوششی دلخواه', t: 'text', mono: 1, h: 'خالی = یکی از سایت‌های بالا. هر آدرس واقعی دیگری هم می‌شود' },
        { p: 'auth.pathRotate', l: 'چرخش خودکار مسیر', t: 'sw' },
        { p: 'auth.panic', l: 'Panic mode', t: 'sw', bad: 1 },
        { p: 'sec.killSwitch', l: 'Kill Switch', t: 'sw', bad: 1 },
        { p: 'sec.cors', l: 'هدرهای CORS', t: 'sw' },
        { p: 'sec.csp', l: 'Security headers (CSP/XFO/nosniff)', t: 'sw' },
      ] },
    ],
  };
  const SCHEMA_SUB = [
    { t: 'تنظیمات اشتراک', icon: 'fa-link', two: 1, f: [
      { p: 'sub.path', l: 'مسیر ساب', t: 'text', mono: 1, h: 'هم صفحه‌ی کاربر و هم خروجی کلاینت روی همین مسیر است' },
      { p: 'sub.userAgent', l: 'فیلتر User-Agent', t: 'text', mono: 1 },
      { p: 'sub.fakeConfigs', l: 'کانفیگ‌های فیک (مصرف/انقضا)', t: 'sw' },
      { p: 'sub.nodeLimit', l: 'Node limit', t: 'num' },
      { p: 'sub.converter', l: 'Converter API', t: 'text', mono: 1 },
      { p: 'sub.telegramChannel', l: 'خط کانال تلگرام', t: 'text', mono: 1, h: 'قابل غیرفعال‌سازی نیست' },
      { p: 'sub.countryGroups', l: 'گروه‌بندی خودکار کشورها', t: 'sw' },
      { p: 'sub.namePrefix', l: 'پیشوند نام کانفیگ', t: 'text' },
    ] },
    { t: 'قواعد روتینگ', icon: 'fa-route', d: 'DOMAIN / IP-CIDR / GEOIP / GEOSITE', two: 1, f: [
      { p: 'sub.rules', l: 'قواعد (هر خط یک قاعده)', t: 'area', dt: 'lines', h: 'GEOIP,IR,DIRECT\nGEOSITE,category-ads-all,REJECT' },
      { p: 'sub.blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' },
      { p: 'sub.blockAds', l: 'بلاک تبلیغات و ردیاب', t: 'sw' },
      { p: 'sub.blockQuic', l: 'مسدودسازی QUIC', t: 'sw' },
      { p: 'sub.bypassIR', l: 'عبور مستقیم ترافیک ایران', t: 'sw' },
      { p: 'sub.doh', l: 'DNS رمزنگاری‌شده برای کلاینت', t: 'text', mono: 1 },
    ] },
  ];

  const UF = [
    { p: 'name', l: 'نام کاربر', t: 'text', req: 1 },
    { p: 'note', l: 'یادداشت', t: 'text' },
    { p: 'uuid', l: 'UUID (VLESS/VMess)', t: 'text', mono: 1 },
    { p: 'secret', l: 'رمز Trojan / SS', t: 'text', mono: 1 },
    { p: 'quotaGB', l: 'سهمیه کل (GB) — ۰ = نامحدود', t: 'num' },
    { p: 'dailyQuotaMB', l: 'سهمیه روزانه (MB)', t: 'num' },
    { p: 'expiryDays', l: 'انقضا (روز از امروز) — ۰ = نامحدود', t: 'num' },
    { p: 'deviceLimit', l: 'اتصال همزمان', t: 'num' },
    { p: 'ipLimit', l: 'IP limit', t: 'num' },
    { p: 'maxConfigs', l: 'سقف کانفیگ', t: 'num' },
    { p: 'speedLimit', l: 'Speed limit (Mbps)', t: 'num' },
    { p: 'mode', l: 'حالت اختصاصی', t: 'sel', o: ['inherit', 'alpha', 'beta', 'both'], lbls: { inherit: 'از تنظیمات عمومی', alpha: 'Alpha — VLESS', beta: 'Beta — Trojan', both: 'Both' } },
    { p: 'ports', l: 'پورت‌های اختصاصی', t: 'text', mono: 1 },
    { p: 'cleanIPs', l: 'Clean IPs اختصاصی (هر خط یکی)', t: 'area', dt: 'lines' },
    { p: 'proxyIPs', l: 'Proxy IPs اختصاصی', t: 'area', dt: 'lines' },
    { p: 'nodes', l: 'Nodes اختصاصی', t: 'area', dt: 'lines' },
    { p: 'nat64', l: 'NAT64 اختصاصی', t: 'text', mono: 1 },
    { p: 'panelUrl', l: 'Panel URL اختصاصی', t: 'text', mono: 1 },
    { p: 'blockAdult', l: 'بلاک محتوای بزرگسال', t: 'sw' },
    { p: 'blockAds', l: 'بلاک تبلیغات', t: 'sw' },
    { p: 'enabled', l: 'کاربر فعال باشد', t: 'sw' },
  ];

  /* ─────────── نماها ─────────── */
  function loginView() {
    const nm = (S.d && S.d.settings && S.d.settings.panel && S.d.settings.panel.name) || 'پنل مدیریت';
    const totp = S.d && S.d.settings && S.d.settings.auth && S.d.settings.auth.totp;
    return '<div class="login"><div class="box">' +
      '<header><span class="ic">' + icon('fa-lock') + '</span><div><h3>' + esc(nm) + '</h3><p>ورود مدیر' + (totp ? ' • 2FA فعال' : '') + '</p></div></header>' +
      '<div class="bd">' +
      '<label class="f"><span>رمز عبور</span><input type="password" id="lgPw" autocomplete="current-password" placeholder="••••••••"></label>' +
      (totp ? '<label class="f"><span>کد دو مرحله‌ای (TOTP)</span><input id="lgTp" class="mono" inputmode="numeric" maxlength="6" placeholder="——————"></label>' : '') +
      '<button class="btn p lg" style="width:100%" data-act="login">' + icon('fa-right-to-bracket') + ' ورود به پنل</button>' +
      '<p class="hint" style="margin-top:12px">محدودیت: ۵ تلاش در ۱۰ دقیقه. رمز پیش‌فرض: <span class="mono">simorgh</span></p>' +
      '</div></div></div>';
  }

  function dashView() {
    const d = S.d, us = d.users, s = d.settings;
    const used = us.reduce((a, u) => a + (u.up || 0) + (u.down || 0), 0);
    const quota = us.reduce((a, u) => a + (u.quotaGB || 0) * 1073741824, 0);
    const on = us.filter((u) => u.enabled).length, exp = us.filter((u) => u.expiryAt && u.expiryAt < Date.now()).length;
    const top = [...us].sort((a, b) => (b.up + b.down) - (a.up + a.down)).slice(0, 6);
    const ser = (d.stats && d.stats.trafficSeries) || Array(24).fill(.2);
    const p = (s.auth && s.auth.path) || 'panel';
    return '<div class="page-head"><div><h1>نمای کلی</h1><p>' + esc(s.panel.name) + ' • ' + esc(location.hostname) + ' • نسخه ' + esc(d.version) + '</p></div>' +
      '<div class="btn-row">' +
      '<span class="badge ' + (d.storage === 'kv' ? 'ok' : 'warn') + '">' + icon(d.storage === 'kv' ? 'fa-database' : 'fa-triangle-exclamation') + ' ' + (d.storage === 'kv' ? 'KV پایدار' : 'ذخیره‌سازی موقت') + '</span>' +
      '<span class="badge ac">' + esc(s.mode === 'both' ? 'Alpha + Beta' : s.mode) + '</span>' +
      (s.fragment.enabled ? '<span class="badge ac">' + icon('fa-scissors') + ' Fragment</span>' : '') +
      (s.ech.enabled ? '<span class="badge b2">' + icon('fa-shield-halved') + ' ECH</span>' : '') +
      '<span class="badge b2">' + icon('fa-link') + ' /' + esc(s.sub.path) + '</span>' +
      '<span class="badge">' + icon('fa-mask') + ' /' + esc(p) + '</span>' +
      '</div></div>' +
      '<div class="grid g4">' +
      '<div class="stat"><div class="lbl">' + icon('fa-users') + ' کل کاربران</div><div class="val">' + fa(us.length) + '</div><div class="sub">' + fa(on) + ' فعال • ' + fa(exp) + ' منقضی</div></div>' +
      '<div class="stat"><div class="lbl">' + icon('fa-hard-drive') + ' مصرف کل</div><div class="val">' + bytes(used) + '</div><div class="sub">' + (quota ? fa((used / quota * 100).toFixed(0)) + '٪ از سهمیه' : 'بدون سقف') + '</div><div class="bar" style="margin-top:8px"><i style="width:' + (quota ? used / quota * 100 : 0) + '%"></i></div></div>' +
      '<div class="stat"><div class="lbl">' + icon('fa-arrow-up-right-dots') + ' درخواست‌ها</div><div class="val">' + n((d.stats && d.stats.requests) || 0) + '</div><div class="sub">از Cloudflare API</div>' + spark(((d.stats && d.stats.reqSeries) || [.2, .5, .3, .6, .4])) + '</div>' +
      '<div class="stat"><div class="lbl">' + icon('fa-tower-broadcast') + ' گره‌ها</div><div class="val">' + fa(s.cleanIPs.length) + '</div><div class="sub">' + fa(s.ports.length) + ' پورت • ' + fa(s.proxyIPs.length) + ' پروکسی</div></div>' +
      '</div>' +
      '<div class="grid g2" style="margin-top:12px">' +
      '<div class="card"><header><span class="ic">' + icon('fa-chart-line') + '</span><div><h3>جریان ترافیک</h3><p>۲۴ بازه‌ی اخیر — موس را روی نمودار ببرید</p></div></header><div class="bd" id="chartWrap">' + area(ser) + '</div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-ranking-star') + '</span><div><h3>بیشترین مصرف‌کنندگان</h3><p>۶ کاربر اول</p></div></header><div class="bd">' +
      (top.map((u) => { const q = (u.quotaGB || 0) * 1073741824, pc = q ? (u.up + u.down) / q * 100 : 0; return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<span class="dot ' + (u.enabled ? 'on' : 'bad') + '"></span>' +
        '<div style="min-width:0;flex:1"><div class="cell-main">' + esc(u.name) + '</div><div class="cell-sub mono">' + esc(String(u.uuid).slice(0, 14)) + '…</div></div>' +
        '<div class="bar ' + (pc > 90 ? 'bad' : pc > 70 ? 'warn' : '') + '" style="max-width:120px"><i style="width:' + pc + '%"></i></div>' +
        '<b class="mono" style="font-size:11px">' + bytes(u.up + u.down) + '</b></div>'; }).join('') || '<div class="empty">کاربری وجود ندارد</div>') +
      '</div></div></div>' +
      '<div class="grid g3">' +
      '<div class="card"><header><span class="ic">' + icon('fa-shield-halved') + '</span><div><h3>پروتکل‌ها</h3></div></header><div class="bd">' +
      Object.entries(s.protocols).map(([k, v]) => '<div class="kv"><span>' + k.toUpperCase() + '</span><span class="badge ' + (v ? 'ok' : '') + '">' + (v ? 'فعال' : 'خاموش') + '</span></div>').join('') +
      '<div class="kv"><span>ترنسپورت</span><b>' + esc(s.transport) + '</b></div>' +
      '<div class="kv"><span>fingerprint</span><b class="mono">' + esc(s.fingerprint) + '</b></div>' +
      '<div class="kv"><span>Trojan hash</span><b class="mono">' + esc(s.trojanHash) + '</b></div>' +
      '<div class="kv"><span>مسیر تونل</span><b class="mono">' + esc(s.path) + '</b></div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-gauge-high') + '</span><div><h3>سهمیه‌ی مصرف</h3></div></header><div class="bd" style="display:flex;justify-content:space-around;gap:12px;flex-wrap:wrap">' +
      ring(quota ? used / quota * 100 : 0, 'سهمیه') + ring(quota ? 100 - used / quota * 100 : 100, 'باقیمانده', 'var(--ac2)') +
      '</div></div>' +
      '<div class="card"><header><span class="ic warn">' + icon('fa-list-check') + '</span><div><h3>آخرین رویدادها</h3></div><div class="acts"><button class="btn sm ghost" data-act="nav" data-view="logs">همه</button></div></header><div class="bd">' +
      ((d.logs || []).slice(0, 5).map((l) => '<div class="log"><span class="dot ' + (l.level === 'success' ? 'on' : l.level === 'error' ? 'bad' : 'warn') + '"></span><div class="l"><b>' + esc(l.action) + '</b><div class="hint">' + esc(l.detail || l.actor) + '</div></div><span class="hint">' + ago(l.ts) + '</span></div>').join('') || '<div class="empty">رویدادی نیست</div>') +
      '</div></div></div>';
  }

  function usersView() {
    const us = S.d.users;
    const searchHits = (u) => {
      const q = (S.q || '').trim().toLowerCase();
      if (!q) return 1;
      return [u.name, u.uuid, u.note, u.secret].join(' ').toLowerCase().includes(q) ? 1 : 0;
    };
    return '<div class="page-head"><div><h1>مدیریت کاربران</h1><p>' + fa(us.length) + ' کاربر • ' + fa(us.filter((u) => u.enabled).length) + ' فعال • تنظیمات اختصاصی برای هر کاربر</p></div>' +
      '<div class="btn-row"><div class="search" style="width:190px" id="uSearchBox"><i class="fa-solid fa-magnifying-glass"></i><input id="uSearch" placeholder="جستجوی نام، UUID، یادداشت…" value="' + esc(S.q || '') + '"></div>' +
      '<button class="btn p" data-act="user-new">' + icon('fa-plus') + ' کاربر جدید</button></div></div>' +
      '<div class="card"><div class="bd" style="padding:0"><div class="tbl-wrap"><table>' +
      '<thead><tr><th>کاربر</th><th>UUID</th><th>مصرف</th><th>سهمیه</th><th>انقضا</th><th>حالت</th><th>اختصاصی</th><th>آخرین فعالیت</th><th>عملیات</th></tr></thead><tbody>' +
      (us.map((u) => {
        const q2 = (u.quotaGB || 0) * 1073741824, pc = q2 ? (u.up + u.down) / q2 * 100 : 0;
        const dl = u.expiryAt ? Math.ceil((u.expiryAt - Date.now()) / 86400000) : null;
        const own = [(u.mode && u.mode !== 'inherit') ? 'mode' : '', u.ports ? 'ports' : '', (u.cleanIPs || []).length ? 'ips' : '', u.panelUrl ? 'url' : '', u.speedLimit ? 'speed' : ''].filter(Boolean);
        return '<tr data-hit="' + searchHits(u) + '" data-uid="' + esc(u.id) + '"><td><div style="display:flex;align-items:center;gap:8px"><span class="dot ' + (u.enabled ? 'on' : 'bad') + '"></span><span class="cell-main">' + esc(u.name) + '</span></div><div class="cell-sub">' + esc(u.note || '—') + '</div></td>' +
          '<td><div class="mono" style="font-size:10.5px">' + esc(String(u.uuid).slice(0, 13)) + '…</div><button class="btn sm ghost" data-act="copy" data-v="' + esc(u.uuid) + '">' + icon('fa-copy') + ' کپی</button></td>' +
          '<td><b class="mono" style="font-size:11px">' + bytes(u.up + u.down) + '</b><div class="bar ' + (pc > 90 ? 'bad' : pc > 70 ? 'warn' : '') + '" style="margin-top:5px"><i style="width:' + pc + '%"></i></div><div class="cell-sub">↓' + bytes(u.down) + ' ↑' + bytes(u.up) + '</div></td>' +
          '<td class="mono">' + (u.quotaGB ? fa(u.quotaGB) + ' GB' : '∞') + '<div class="cell-sub">' + (u.dailyQuotaMB ? fa(u.dailyQuotaMB) + ' MB/روز' : '—') + '</div></td>' +
          '<td>' + (dl === null ? '<span class="badge ok">نامحدود</span>' : dl < 0 ? '<span class="badge bad">منقضی</span>' : '<span class="badge' + (dl <= 7 ? ' warn' : '') + '">' + fa(dl) + ' روز</span>') + '</td>' +
          '<td><span class="badge ' + (u.mode === 'both' ? 'ac' : 'b2') + '">' + esc(u.mode || 'inherit') + '</span></td>' +
          '<td>' + (own.length ? own.map((o) => '<span class="badge ac">' + esc(o) + '</span>').join(' ') : '<span class="cell-sub">—</span>') + '</td>' +
          '<td class="cell-sub">' + ago(u.lastSeen) + '<div>' + fa(u.totalReq || 0) + ' req</div></td>' +
          '<td><div class="row-btns">' +
          '<button class="btn sm" data-act="user-edit" data-id="' + u.id + '" title="ویرایش">' + icon('fa-pen') + '</button>' +
          '<button class="btn sm" data-act="user-copy-page" data-id="' + u.id + '" title="کپی لینک صفحه‌ی کاربر (داشبورد + اشتراک)">' + icon('fa-clipboard') + '</button>' +
          '<button class="btn sm" data-act="user-reset" data-id="' + u.id + '" title="ریست مصرف">' + icon('fa-rotate-left') + '</button>' +
          '<button class="btn sm ' + (u.enabled ? 'd' : 's') + '" data-act="user-toggle" data-id="' + u.id + '" title="' + (u.enabled ? 'قطع دسترسی' : 'فعال‌سازی') + '">' + icon(u.enabled ? 'fa-ban' : 'fa-circle-check') + '</button>' +
          '<button class="btn sm d" data-act="user-del" data-id="' + u.id + '" title="حذف">' + icon('fa-trash-can') + '</button>' +
          '</div></td></tr>';
      }).join('')) +
      '</tbody></table></div></div></div>';
  }

  function subView() {
    const s = S.d.settings, us = S.d.users;
    const u = us.find((x) => x.id === S.sel) || us[0];
    const page = u ? location.origin + '/' + s.sub.path + '/' + u.uuid : '';
    return '<div class="page-head"><div><h1>مرکز اشتراک</h1><p>یک لینک = صفحه‌ی کاربر برای مرورگر + خروجی خام برای کلاینت</p></div></div>' +
      (!u ? '<div class="card"><div class="bd"><div class="empty">ابتدا یک کاربر بسازید</div></div></div>' :
      '<div class="card"><header><span class="ic">' + icon('fa-link') + '</span><div><h3>لینک اشتراک</h3><p>تشخیص خودکار کلاینت از روی User-Agent</p></div>' +
      '<div class="acts"><div class="seg">' + ['base64', 'raw', 'clash', 'meta', 'singbox', 'v2ray'].map((x) => '<button data-act="fmt" data-v="' + x + '" class="' + (S.fmt === x ? 'on' : '') + '">' + x + '</button>').join('') + '</div></div></header>' +
      '<div class="bd">' +
      '<div class="grid g3" style="margin-bottom:14px">' +
      '<label class="f" style="margin:0"><span>کاربر</span><select data-act="sel-user">' + us.map((x) => '<option value="' + x.id + '"' + (x.id === u.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      '<div><div class="hint">مصرف</div><b class="mono">' + bytes(u.up + u.down) + '</b><div class="hint">' + (u.quotaGB ? fa(u.quotaGB) + ' GB' : 'نامحدود') + '</div></div>' +
      '<div><div class="hint">سقف گره</div><b class="mono">' + fa(s.sub.nodeLimit || 0) + '</b><div class="hint">node limit</div></div></div>' +

      /* ── دکمه‌ی اصلی: کپی صفحه‌ی کاربر (داشبورد + اشتراک در یک صفحه) ── */
      '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn p lg" data-act="copy" data-v="' + esc(page) + '">' + icon('fa-clipboard') + ' کپی صفحه‌ی کاربر</button>' +
      '<button class="btn" data-act="open" data-v="' + esc(page) + '">' + icon('fa-arrow-up-right-from-square') + ' باز کردن</button>' +
      '<button class="btn" data-act="qr" data-v="' + esc(page) + '">' + icon('fa-qrcode') + ' QR</button></div>' +
      '<div class="hint" style="margin-bottom:14px">این یک لینک است: در <b>مرورگر</b> داشبورد کاربر را نشان می‌دهد و در <b>کلاینت</b> (v2rayNG، Hiddify، Clash و…) کانفیگ‌ها را به‌صورت خودکار دریافت می‌کند.' +
      '<div class="mono" style="margin-top:6px;font-size:10.5px;word-break:break-all;direction:ltr;text-align:left">' + esc(page) + '</div></div>' +

      '<div class="hint" style="margin-bottom:6px">پیش‌نمایش خروجی کلاینت با فرمت <b>' + esc(S.fmt) + '</b>:</div>' +
      '<div class="btn-row" style="margin-bottom:12px">' +
      '<button class="btn sm s" data-act="sub-load" data-id="' + u.id + '">' + icon('fa-eye') + ' نمایش خروجی</button>' +
      '<button class="btn sm" data-act="copy" data-v="' + esc(page + '?format=' + S.fmt) + '">' + icon('fa-copy') + ' کپی خروجی ' + esc(S.fmt) + '</button></div>' +
      '<div id="subOut"><div class="empty">خروجی اینجا نمایش داده می‌شود</div></div>' +
      (s.sub.telegramChannel ? '<div class="hint" style="margin-top:10px">خط کانال تلگرام: <span class="mono">' + esc(s.sub.telegramChannel) + '</span> — این خط قابل غیرفعال‌شدن نیست.</div>' : '') +
      '</div></div>') +
      SCHEMA_SUB.map((g) => group(g, S.d.settings)).join('') + saveBtn('save-sub');
  }

  function monitorView() {
    const st = S.d.stats || {}, u = S.d.users, r = S.range;
    const ser = (r === 'm' ? st.monthly : r === 'y' ? st.yearly : st.daily) || st.daily || Array(14).fill(.3);
    return '<div class="page-head"><div><h1>مانیتورینگ و آمار</h1><p>مصرف روزانه/ماهانه/سالانه، اتصال‌های فعال و سلامت سرویس</p></div>' +
      '<div class="seg">' + [['d', 'روزانه'], ['m', 'ماهانه'], ['y', 'سالانه']].map(([k, l]) => '<button data-act="range" data-v="' + k + '" class="' + (r === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="grid g4">' +
      '<div class="stat"><div class="lbl">آپلود کل</div><div class="val">' + bytes(u.reduce((a, x) => a + (x.up || 0), 0)) + '</div><div class="sub">' + fa(u.length) + ' کاربر</div></div>' +
      '<div class="stat"><div class="lbl">دانلود کل</div><div class="val">' + bytes(u.reduce((a, x) => a + (x.down || 0), 0)) + '</div><div class="sub">اتصال فعال: ' + fa(st.connections || 0) + '</div></div>' +
      '<div class="stat"><div class="lbl">درخواست‌ها</div><div class="val">' + n(st.requests || 0) + '</div><div class="sub">uptime ' + fa(Math.floor((Date.now() - S.d.boot) / 60000)) + ' دقیقه</div></div>' +
      '<div class="stat"><div class="lbl">نسخه / بیلد</div><div class="val" style="font-size:15px">' + esc(S.d.version) + '</div><div class="sub">' + esc(S.d.build || '—') + '</div></div>' +
      '</div>' +
      '<div class="grid g2" style="margin-top:12px">' +
      '<div class="card"><header><span class="ic">' + icon('fa-chart-area') + '</span><div><h3>مصرف ' + (r === 'd' ? 'روزانه' : r === 'm' ? 'ماهانه' : 'سالانه') + '</h3><p>گیگابایت در هر بازه</p></div></header><div class="bd" id="chartWrap">' + area(ser, { color: 'var(--ac2)', color2: 'var(--ac)' }) + '</div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-chart-column') + '</span><div><h3>توزیع مصرف کاربران</h3><p>گیگابایت</p></div></header><div class="bd">' + bars(u.slice(0, 14).map((x) => (x.up + x.down) / 1073741824 || .01), 'GB') + '</div></div></div>' +
      '<div class="card"><header><span class="ic">' + icon('fa-users') + '</span><div><h3>مصرف به تفکیک کاربر</h3><p>با درصد پیشرفت</p></div></header><div class="bd" style="padding:0"><div class="tbl-wrap"><table>' +
      '<thead><tr><th>کاربر</th><th>آپلود</th><th>دانلود</th><th>کل</th><th>درصد سهمیه</th><th>درخواست</th></tr></thead><tbody>' +
      u.map((x) => { const q = (x.quotaGB || 0) * 1073741824, p = q ? (x.up + x.down) / q * 100 : 0; return '<tr><td class="cell-main">' + esc(x.name) + '</td><td class="mono">' + bytes(x.up) + '</td><td class="mono">' + bytes(x.down) + '</td><td class="mono"><b>' + bytes(x.up + x.down) + '</b></td>' +
        '<td><div style="display:flex;align-items:center;gap:8px"><div class="bar ' + (p > 90 ? 'bad' : p > 70 ? 'warn' : '') + '" style="max-width:110px"><i style="width:' + p + '%"></i></div><span class="mono" style="font-size:10px">' + (q ? fa(p.toFixed(0)) + '٪' : '∞') + '</span></div></td>' +
        '<td class="mono">' + fa(x.totalReq || 0) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>';
  }

  function updateView() {
    const d = S.d, s = d.settings;
    return '<div class="page-head"><div><h1>سیستم به‌روزرسانی</h1><p>بررسی نسخه از گیت‌هاب، استقرار و بازگشت به نسخه‌ی قبل</p></div></div>' +
      '<div class="grid g3">' +
      '<div class="card"><header><span class="ic">' + icon('fa-rotate') + '</span><div><h3>نسخه فعلی</h3></div></header><div class="bd">' +
      '<div class="kv"><span>نسخه</span><b class="mono">' + esc(d.version) + '</b></div>' +
      '<div class="kv"><span>بیلد</span><b class="mono">' + esc(d.build || '—') + '</b></div>' +
      '<div class="kv"><span>مخزن</span><b class="mono">' + esc(s.upd.repo) + '</b></div>' +
      '<div class="kv"><span>آخرین بررسی</span><b>' + ago(d.lastCheck) + '</b></div>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn p" data-act="upd-check">' + icon('fa-magnifying-glass') + ' بررسی</button>' +
      '<button class="btn" data-act="upd-deploy">' + icon('fa-download') + ' نصب</button>' +
      '<button class="btn d" data-act="upd-rollback">' + icon('fa-rotate-left') + ' بازگشت</button></div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-network-wired') + '</span><div><h3>انتشار به نودها</h3></div></header><div class="bd">' +
      ((d.panels || []).map((p) => '<div class="kv"><span>' + esc(p.name) + '</span><span class="badge ' + (p.status === 'online' ? 'ok' : p.status === 'syncing' ? 'warn' : 'bad') + '">' + esc(p.status) + '</span></div>').join('') || '<div class="empty">نودی متصل نیست</div>') +
      '</div></div>' +
      '<div class="card"><header><span class="ic warn">' + icon('fa-list-check') + '</span><div><h3>گزارش آخرین عملیات</h3></div></header><div class="bd">' +
      ((d.updateLog || []).map((l) => '<div class="log"><span class="dot ' + (l.ok ? 'on' : 'bad') + '"></span><div class="l"><b>' + esc(l.step) + '</b><div class="hint">' + esc(l.note) + '</div></div></div>').join('') || '<div class="empty">گزارشی نیست</div>') +
      '</div></div></div>' +
      SCHEMA.update.map((g) => group(g, s)).join('') + saveBtn('save-update');
  }

  function logsView() {
    const logs = S.d.logs || [], lv = S.tab.log || 'all';
    const list = logs.filter((l) => lv === 'all' || l.level === lv);
    return '<div class="page-head"><div><h1>لاگ فعالیت</h1><p>' + fa(logs.length) + ' رویداد • audit trail تغییرات ادمین</p></div>' +
      '<div class="seg">' + [['all', 'همه'], ['success', 'موفق'], ['info', 'اطلاعات'], ['warn', 'هشدار'], ['error', 'خطا']].map(([k, l]) => '<button data-act="loglv" data-v="' + k + '" class="' + (lv === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="card"><div class="bd">' +
      (list.map((l) => '<div class="log"><span class="dot ' + (l.level === 'success' ? 'on' : l.level === 'error' ? 'bad' : 'warn') + '"></span>' +
        '<div class="l"><b>' + esc(l.action) + '</b> <span class="badge">' + esc(l.actor) + '</span> <span class="badge ' + (l.level === 'error' ? 'bad' : l.level === 'success' ? 'ok' : 'b2') + '">' + esc(l.level) + '</span>' +
        '<div class="hint">' + esc(l.detail || '') + '</div></div><span class="hint mono" style="font-size:10px">' + new Date(l.ts).toLocaleString('fa-IR') + '</span></div>').join('') || '<div class="empty">رویدادی ثبت نشده</div>') +
      '</div></div>';
  }

  function settingsView() {
    const d = S.d, s = d.settings;
    return '<div class="page-head"><div><h1>تنظیمات و پشتیبان</h1><p>کلیدهای API، پشتیبان‌گیری و بازنشانی</p></div></div>' +
      '<div class="grid g2">' +
      '<div class="card"><header><span class="ic">' + icon('fa-key') + '</span><div><h3>کلیدهای API</h3><p>حداکثر ۱۰ کلید</p></div><div class="acts"><button class="btn sm s" data-act="key-new">' + icon('fa-plus') + ' کلید جدید</button></div></header>' +
      '<div class="bd"><div class="list">' + ((d.keys || []).map((k) => '<div class="row-item"><div class="grow"><b class="mono" style="font-size:11px">' + esc(k.key) + '</b><div class="cell-sub">' + esc(k.name) + ' • ' + (k.ro ? 'فقط‌خواندنی' : 'دسترسی کامل') + '</div></div>' +
        '<button class="btn sm ghost" data-act="copy" data-v="' + esc(k.key) + '">' + icon('fa-copy') + '</button>' +
        '<button class="btn sm d" data-act="key-del" data-id="' + esc(k.id) + '">' + icon('fa-trash-can') + '</button></div>').join('') || '<div class="empty">کلیدی ساخته نشده</div>') + '</div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-cloud') + '</span><div><h3>پشتیبان و بازیابی</h3><p>Export / Import کامل</p></div></header><div class="bd">' +
      '<div class="btn-row"><button class="btn" data-act="backup">' + icon('fa-download') + ' دریافت پشتیبان</button>' +
      '<button class="btn" data-act="restore">' + icon('fa-upload') + ' بازیابی از فایل</button>' +
      '<input type="file" id="restoreFile" accept="application/json" class="hide"></div>' +
      '<div class="hint" style="margin-top:10px">پشتیبان شامل تنظیمات، کاربران، کلیدها و قواعد روتینگ است.</div></div></div>' +
      '<div class="card"><header><span class="ic">' + icon('fa-circle-info') + '</span><div><h3>مسیرهای سرویس</h3></div></header><div class="bd">' +
      '<div class="kv"><span>ورود پنل</span><b class="mono">/' + esc(s.auth.path) + '</b></div>' +
      '<div class="kv"><span>صفحه‌ی کاربر و ساب</span><b class="mono">/' + esc(s.sub.path) + '/&lt;uuid&gt;</b></div>' +
      '<div class="kv"><span>تونل</span><b class="mono">' + esc(s.path) + '</b></div>' +
      '<div class="kv"><span>سلامت</span><b class="mono">/health</b></div>' +
      '<div class="kv"><span>DoH</span><b class="mono">/dns-query</b></div></div></div>' +
      '<div class="card"><header><span class="ic bad">' + icon('fa-trash-can') + '</span><div><h3>بازنشانی</h3><p>عملیات برگشت‌ناپذیر</p></div></header><div class="bd">' +
      '<div class="btn-row"><button class="btn d" data-act="factory">' + icon('fa-rotate-left') + ' ریست کارخانه‌ای</button>' +
      '<button class="btn d" data-act="logs-clear">' + icon('fa-broom') + ' پاک‌سازی لاگ</button></div></div></div></div>';
  }

  const schemaView = (key, head) => '<div class="page-head"><div><h1>' + head[0] + '</h1><p>' + head[1] + '</p></div></div>' + SCHEMA[key].map((g) => group(g, S.d.settings)).join('') + saveBtn('save-' + key);

  function tgExtra() {
    const cmds = ['/panel', '/users', '/usage', '/sub <uuid>', '/add <name>', '/del <name>', '/reset <name>', '/extend <name> <days>', '/rename <name> <new>', '/note <name> <text>', '/limit <name> <n>', '/search <q>', '/inactive', '/panic', '/kill', '/dns <url>', '/ips <list>', '/relay <url>', '/nodes', '/lang en'];
    return '<div class="card"><header><span class="ic">' + icon('fa-brands fa-telegram') + '</span><div><h3>فرمان‌های ربات</h3><p>پنل تلگرامی با دکمه‌های inline</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="tg-test">' + icon('fa-paper-plane') + ' پیام تست</button></div></header>' +
      '<div class="bd"><div class="chips">' + cmds.map((c) => '<span class="chip"><span class="mono">' + esc(c) + '</span></span>').join('') + '</div>' +
      '<div class="hint" style="margin-top:10px">مدیریت کاربران، آمار، تنظیمات، Panic/Kill، جستجو، تمدید انقضا، تغییر نام و مدیریت چندپنلی — همه از داخل تلگرام.</div></div></div>';
  }
  function cloudExtra() {
    const d = S.d;
    return '<div class="grid g2">' +
      '<div class="card"><header><span class="ic">' + icon('fa-network-wired') + '</span><div><h3>پنل‌های لینک‌شده</h3><p>کلید اختصاصی هر نود</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="panel-new">' + icon('fa-plus') + ' افزودن</button></div></header><div class="bd"><div class="list">' +
      ((d.panels || []).map((p) => '<div class="row-item"><span class="dot ' + (p.status === 'online' ? 'on' : p.status === 'syncing' ? 'warn' : 'bad') + '"></span>' +
        '<div class="grow"><b>' + esc(p.name) + '</b> <span class="badge ' + (p.role === 'hub' ? 'ac' : '') + '">' + esc(p.role) + '</span><div class="mono cell-sub">' + esc(p.url) + '</div></div>' +
        '<button class="btn sm" data-act="panel-sync" data-id="' + esc(p.id) + '">' + icon('fa-rotate') + '</button>' +
        '<button class="btn sm d" data-act="panel-del" data-id="' + esc(p.id) + '">' + icon('fa-trash-can') + '</button></div>').join('') || '<div class="empty">پنلی لینک نشده</div>') + '</div></div></div>' +
      '<div class="card"><header><span class="ic b2">' + icon('fa-globe') + '</span><div><h3>دامنه‌ی اختصاصی</h3><p>health check</p></div>' +
      '<div class="acts"><button class="btn sm" data-act="domain-check">' + icon('fa-stethoscope') + ' بررسی سلامت</button></div></header>' +
      '<div class="bd"><div id="domainOut"><div class="empty">برای بررسی دامنه دکمه را بزنید</div></div></div></div></div>';
  }
  function secExtra() {
    const s = S.d.settings, p = s.auth.path;
    return '<div class="grid g2">' +
      '<div class="card"><header><span class="ic bad">' + icon('fa-stethoscope') + '</span><div><h3>تست تونل و کانفیگ</h3><p>چرا کانفیگ وصل نمی‌شود؟ اینجا تشخیص داده می‌شود</p></div>' +
      '<div class="acts"><button class="btn sm p" data-act="tunnel-test">' + icon('fa-vial') + ' اجرای تست</button></div></header>' +
      '<div class="bd"><div id="tunnelOut"><div class="empty">با یک کلیک، مسیر تونل، SNI، پروتکل‌ها، خروجی سوکت و یک کانفیگ نمونه بررسی می‌شود.</div></div></div></div>' +
      '<div class="card"><header><span class="ic">' + icon('fa-key') + '</span><div><h3>تغییر رمز و 2FA</h3><p>پس از تغییر، نشست‌ها باطل می‌شوند</p></div></header><div class="bd">' +
      '<label class="f"><span>رمز فعلی</span><input type="password" id="pwOld"></label>' +
      '<label class="f"><span>رمز جدید</span><input type="password" id="pwNew"></label>' +
      '<div class="btn-row"><button class="btn p" data-act="pw-change">' + icon('fa-check') + ' تغییر رمز</button>' +
      '<button class="btn" data-act="2fa-gen">' + icon('fa-mobile-screen') + ' ساخت کلید 2FA</button>' +
      '<button class="btn" data-act="rotate-path">' + icon('fa-shuffle') + ' چرخش مسیر ورود</button></div>' +
      '<div id="totpOut" style="margin-top:12px"></div></div></div>' +
      '<div class="card"><header><span class="ic warn">' + icon('fa-mask') + '</span><div><h3>مسیر ورود و سایت پوششی واقعی</h3><p>ریشه‌ی دامنه یک سایت زنده‌ی واقعی را کامل نشان می‌دهد</p></div>' +
      '<div class="acts"><button class="btn sm s" data-act="decoy-test">' + icon('fa-vial') + ' تست سایت پوششی</button></div></header><div class="bd">' +
      '<div class="kv"><span>' + icon('fa-lock') + ' آدرس پنل</span><b class="mono">' + esc(location.origin + '/' + p) + '</b></div>' +
      '<div class="kv"><span>Disguise</span><b>' + (s.auth.disguise ? 'فعال — ریشه سایت پوششی است' : 'خاموش — ریشه هم پنل است') + '</b></div>' +
      '<div class="kv"><span>سایت پوششی</span><b class="mono">' + esc(s.auth.decoyUrl || s.auth.maintenanceHost) + '</b></div>' +
      '<div class="kv"><span>' + icon('fa-users') + ' صفحه‌ی کاربر</span><b class="mono">/' + esc(s.sub.path) + '/&lt;uuid&gt;</b></div>' +
      '<div class="kv"><span>CSP / XFO / nosniff</span><b>' + (s.sec.csp ? 'فعال' : 'خاموش') + '</b></div>' +
      '<div id="decoyOut" style="margin-top:10px"></div>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" data-act="open" data-v="' + esc(location.origin + '/' + p) + '">' + icon('fa-arrow-up-right-from-square') + ' باز کردن پنل</button>' +
      '<button class="btn" data-act="open" data-v="' + esc(location.origin + '/?refresh=1') + '">' + icon('fa-eye') + ' پیش‌نمایش سایت پوششی</button>' +
      '<button class="btn ghost" data-act="copy" data-v="' + esc(location.origin + '/' + p) + '">' + icon('fa-copy') + ' کپی آدرس پنل</button></div>' +
      '<div class="hint" style="margin-top:10px">هر مسیر ناشناخته هم همان سایت پوششی را نشان می‌دهد. پس از تغییر مسیر ورود، صفحه را با آدرس جدید باز کنید.</div></div></div></div>';
  }

  const VIEWS = {
    dash: dashView, users: usersView, sub: subView, monitor: monitorView, update: updateView, logs: logsView, settings: settingsView,
    proto: () => schemaView('proto', ['پروتکل و کانفیگ', 'حالت Alpha/Beta/Both، ترنسپورت، TLS، ECH و Fragment']) + protoExtra(),
    network: () => schemaView('network', ['شبکه و آی‌پی', 'Clean IP، Proxy IP با failover، NAT64، DoH و GeoIP']),
    telegram: () => schemaView('telegram', ['ربات تلگرام', 'پنل تلگرامی، اعلان‌ها و مدیریت چندپنلی']) + tgExtra(),
    cloud: () => schemaView('cloud', ['کلودفلر و پنل‌های لینک‌شده', 'API، دامنه و معماری Hub & Spoke']) + cloudExtra(),
    security: () => schemaView('security', ['امنیت و استتار', 'ورود، 2FA، مسیر مخفی و سایت پوششی']) + secExtra(),
  };
  function protoExtra() {
    const s = S.d.settings;
    const ok = s.tls && s.transport === 'ws' && (s.protocols.vless || s.protocols.trojan) && !(s.sni && s.sni !== location.hostname);
    return '<div class="card"><header><span class="ic ' + (ok ? '' : 'bad') + '">' + icon(ok ? 'fa-circle-check' : 'fa-triangle-exclamation') + '</span>' +
      '<div><h3>سازگاری با هسته‌ی تونل</h3><p>بررسی سریع تنظیمات فعلی</p></div></header><div class="bd">' +
      [
        ['ترنسپورت WebSocket', s.transport === 'ws', s.transport],
        ['حداقل یک پروتکل پشتیبانی‌شده', s.protocols.vless || s.protocols.trojan, 'VLESS=' + s.protocols.vless + ' Trojan=' + s.protocols.trojan],
        ['TLS روشن', !!s.tls, s.tls ? 'fp: ' + s.fingerprint : 'خاموش'],
        ['SNI با دامنه‌ی ورکر یکی است', !(s.sni && s.sni !== location.hostname), s.sni || location.hostname],
      ].map(([t, o, note]) => '<div class="kv"><span>' + icon(o ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + t + '</span><b class="mono" style="color:' + (o ? 'var(--ok)' : 'var(--bad)') + '">' + esc(note) + '</b></div>').join('') +
      '<div class="hint" style="margin-top:10px">Shadowsocks و VMess فقط در ساب تولید می‌شوند؛ برای اتصال واقعی از VLESS یا Trojan استفاده کنید.</div></div></div>';
  }

  /* ─────────── پوسته ─────────── */
  function render() {
    const nav = $('#nav');
    if (!S.token || !S.d) {
      /* در صفحه‌ی ورود هیچ هدر، سایدبار یا فوتر وجود ندارد */
      document.body.classList.add('auth');
      closeDrawer();
      $('#view').innerHTML = loginView();
      setTimeout(() => { const e = $('#lgPw'); if (e) e.focus(); }, 60);
      return;
    }
    const d = S.d, s = d.settings;
    document.body.classList.remove('auth');
    ['#menuBtn', '#themeBtn', '#panicBtn', '#logoutBtn', '#searchBox'].forEach((x) => $(x).classList.remove('hide'));
    $('#brandName').textContent = s.panel.name;
    $('#brandVer').textContent = 'v' + d.version;
    $('#pageTitle').textContent = s.panel.name;
    $('#sfStore').textContent = d.storage === 'kv' ? 'KV پایدار' : 'موقت';
    $('#sfUsers').textContent = fa(d.users.length) + ' کاربر';
    $('#sfVer').textContent = d.version;
    const panic = s.auth.panic;
    $('#tbState').textContent = panic ? 'Panic Mode فعال است' : 'سرویس فعال';
    $('#tbState').style.color = panic ? 'var(--bad)' : '';
    $('#tbDot').className = 'dot ' + (panic ? 'bad' : 'on');
    $('#tbReq').innerHTML = icon('fa-arrow-up-right-dots') + ' ' + n((d.stats && d.stats.requests) || 0) + ' req';
    $('#panicBtn').className = 'btn sm ' + (panic ? 'd' : 's');
    nav.innerHTML = NAV.map((g) => '<div class="nav-group"><span>' + g.g + '</span>' + g.items.map(([id, l, ic]) =>
      '<button class="nav-item ' + (S.view === id ? 'on' : '') + '" data-act="nav" data-view="' + id + '">' + icon(ic) + '<span>' + l + '</span>' +
      (id === 'users' ? '<span class="cnt">' + fa(d.users.length) + '</span>' : '') +
      (id === 'logs' ? '<span class="cnt">' + fa((d.logs || []).length) + '</span>' : '') + '</button>').join('') + '</div>').join('');
    $('#view').innerHTML = '<div class="fade">' + (VIEWS[S.view] || dashView)() + '</div>';
    const cw = $('#chartWrap');
    if (cw) {
      const ser = S.view === 'monitor'
        ? ((S.range === 'm' ? d.stats.monthly : S.range === 'y' ? d.stats.yearly : d.stats.daily) || [])
        : (d.stats.trafficSeries || []);
      bindCharts(cw, ser);
    }
    $('#foot').innerHTML = esc(s.panel.name) + ' • ' + esc(location.hostname) + ' • ورود: <span class="mono">/' + esc(s.auth.path) + '</span> • ساب: <span class="mono">/' + esc(s.sub.path) + '</span>';
  }

  async function refresh() {
    if (!S.token) { render(); return; }
    const d = await api('GET', '/api/state');
    if (d && !d.error) { S.d = d; render(); }
  }

  /* ─────────── جستجوی سراسری ─────────── */
  function doSearch(term) {
    const drop = $('#searchDrop');
    const t = (term || '').trim().toLowerCase();
    if (!t || !S.d) { drop.classList.remove('show'); drop.innerHTML = ''; return; }
    const out = [];
    NAV.forEach((g) => g.items.forEach(([id, l]) => { if (l.toLowerCase().includes(t)) out.push({ ic: 'fa-compass', txt: l, sub: g.g, act: 'nav', view: id }); }));
    S.d.users.forEach((u) => {
      if ([u.name, u.uuid, u.note].join(' ').toLowerCase().includes(t))
        out.push({ ic: 'fa-user', txt: u.name, sub: String(u.uuid).slice(0, 16) + '…', act: 'user-edit', id: u.id });
    });
    (S.d.logs || []).slice(0, 40).forEach((l) => {
      if ((l.action + ' ' + l.detail + ' ' + l.actor).toLowerCase().includes(t))
        out.push({ ic: 'fa-list-check', txt: l.action, sub: l.actor, act: 'nav', view: 'logs' });
    });
    Object.keys(S.d.settings).forEach((k) => {
      if (k.toLowerCase().includes(t)) out.push({ ic: 'fa-gear', txt: k, sub: 'تنظیمات', act: 'nav', view: ['protocols', 'mode', 'transport', 'tls', 'path', 'fragment'].includes(k) ? 'proto' : ['cleanIPs', 'proxyIPs', 'doh', 'nat64', 'geoip'].includes(k) ? 'network' : 'settings' });
    });
    drop.innerHTML = out.length ? out.slice(0, 14).map((o, i) =>
      '<div class="sd-item" data-si="' + i + '">' + icon(o.ic) + '<span>' + esc(o.txt) + '</span><span class="m">' + esc(o.sub) + '</span></div>').join('')
      : '<div class="sd-empty">موردی یافت نشد</div>';
    drop.classList.add('show');
    drop._res = out;
  }

  /* ─────────── رویدادها ─────────── */
  document.addEventListener('click', async (e) => {
    const sd = e.target.closest('[data-si]');
    if (sd) {
      const o = ($('#searchDrop')._res || [])[Number(sd.dataset.si)];
      if (o) {
        $('#searchDrop').classList.remove('show'); $('#tbSearch').value = '';
        if (o.act === 'nav') { S.view = o.view; render(); }
        else if (o.act === 'user-edit') { S.view = 'users'; render(); userModal(S.d.users.find((u) => u.id === o.id)); }
      }
      return;
    }
    const sw = e.target.closest('[data-sw]');
    if (sw) {
      e.preventDefault(); e.stopPropagation();
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      const inp = sw.parentElement.querySelector('[data-p="' + sw.dataset.sw + '"]');
      if (inp) inp.checked = on;
      return;
    }

    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act, id = t.dataset.id, v = t.dataset.v;
    try {
      if (a === 'login') {
        const pw = $('#lgPw').value, tp = ($('#lgTp') || {}).value || '';
        busy(t, 'در حال ورود');
        const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw, totp: tp }) }).then((x) => x.json());
        free(t);
        if (r.token) { S.token = r.token; sessionStorage.setItem('sg_t', r.token); await refresh(); toast('خوش آمدید 👋'); }
        else toast(r.error || 'رمز نادرست است', 'err');
      }
      else if (a === 'nav') { S.view = t.dataset.view; closeDrawer(); render(); }
      else if (a === 'copy') copy(v);
      else if (a === 'open') window.open(v, '_blank');
      else if (a === 'fmt') { S.fmt = v; render(); }
      else if (a === 'range') { S.range = v; render(); }
      else if (a === 'loglv') { S.tab.log = v; render(); }
      else if (a.startsWith('save-')) { busy(t, 'ذخیره'); const r = await api('PUT', '/api/settings', { settings: collect($('#view')) }); free(t); if (r.ok) { toast('تنظیمات ذخیره شد'); await refresh(); } else toast(r.error || 'خطا', 'err'); }
      else if (a === 'user-new') { const r = await api('POST', '/api/users', { name: 'کاربر ' + (S.d.users.length + 1) }); if (r.user) { S.sel = r.user.id; await refresh(); userModal(S.d.users.find((u) => u.id === r.user.id) || r.user, true); } }
      else if (a === 'user-edit') userModal(S.d.users.find((u) => u.id === id));
      else if (a === 'user-toggle') { const r = await api('POST', '/api/users', { id, op: 'toggle' }); if (r.ok) { toast('انجام شد'); await refresh(); } }
      else if (a === 'user-reset') { const r = await api('POST', '/api/users', { id, op: 'reset' }); if (r.ok) { toast('مصرف ریست شد'); await refresh(); } }
      else if (a === 'user-del') { const u = S.d.users.find((x) => x.id === id); if (!confirm('کاربر «' + (u ? u.name : '') + '» حذف شود؟')) return; const r = await api('POST', '/api/users', { id, op: 'delete' }); if (r.ok) { toast('کاربر حذف شد', 'err'); closeM(); await refresh(); } }
      else if (a === 'user-copy-page') {
        const u = S.d.users.find((x) => x.id === id);
        if (u) copy(location.origin + '/' + S.d.settings.sub.path + '/' + u.uuid);
      }
      else if (a === 'qr') qrModal(v);
      else if (a === 'sub-load') {
        busy(t, 'دریافت');
        const u = S.d.users.find((x) => x.id === id);
        const link = location.origin + '/' + S.d.settings.sub.path + '/' + u.uuid + '?format=' + S.fmt;
        const tx = await fetch(link).then((r) => r.text());
        free(t);
        const out = $('#subOut');
        if (out) out.innerHTML = '<pre class="code"><div class="hd"><span>' + esc(S.fmt) + ' • ' + esc(tx.length) + ' کاراکتر</span><button class="btn sm" data-act="copy" data-v="' + esc(tx.slice(0, 100000)).replace(/"/g, '&quot;') + '">کپی</button></div>' + esc(tx.slice(0, 6000)) + (tx.length > 6000 ? '\n…' : '') + '</pre>';
      }
      else if (a === 'user-save') { busy(t, 'ذخیره'); const patch = collect($('#mbox')); const r = await api('POST', '/api/users', { id, op: 'update', patch }); free(t); if (r.ok) { toast('ذخیره شد'); closeM(); await refresh(); } else toast(r.error || 'خطا', 'err'); }
      else if (a === 'regen') { const inp = $('#mbox [data-p="uuid"]'); if (inp) { inp.value = crypto.randomUUID(); toast('UUID جدید ساخته شد', 'info'); } }
      else if (a === 'close') closeM();
      else if (a === 'key-new') { const r = await api('POST', '/api/keys', {}); if (r.ok) { toast('کلید ساخته شد'); await refresh(); } else toast(r.error || 'خطا', 'err'); }
      else if (a === 'key-del') { const r = await api('DELETE', '/api/keys?id=' + id); if (r.ok) { toast('کلید حذف شد', 'err'); await refresh(); } }
      else if (a === 'panel-new') { const name = prompt('نام پنل:'); const url = prompt('آدرس ورکر:'); if (name && url) { await api('POST', '/api/panels', { name, url }); toast('پنل لینک شد'); await refresh(); } }
      else if (a === 'panel-del') { await api('DELETE', '/api/panels?id=' + id); toast('حذف شد', 'err'); await refresh(); }
      else if (a === 'panel-sync') { busy(t, 'همگام‌سازی'); await api('POST', '/api/panels', { id, op: 'sync' }); free(t); toast('همگام شد'); await refresh(); }
      else if (a === 'domain-check') { busy(t, 'بررسی'); const r = await api('POST', '/api/action', { act: 'domain-health' }); free(t); const o = $('#domainOut'); if (o) o.innerHTML = (r.checks || []).map((c) => '<div class="kv"><span>' + icon(c.ok ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + esc(c.name) + '</span><b class="mono" style="color:' + (c.ok ? 'var(--ok)' : 'var(--bad)') + '">' + esc(c.note || '') + '</b></div>').join(''); }
      else if (a === 'tg-test') { busy(t, 'ارسال'); const r = await api('POST', '/api/action', { act: 'tg-test' }); free(t); toast(r.ok ? 'پیام تست ارسال شد' : 'ارسال نشد — توکن/چت‌آیدی را چک کنید', r.ok ? 'ok' : 'err'); }
      else if (a === 'decoy-test') {
        busy(t, 'در حال تست');
        const r = await api('POST', '/api/action', { act: 'decoy-test' });
        free(t);
        const o = $('#decoyOut');
        if (o) o.innerHTML = r.ok
          ? '<div class="kv"><span>' + icon('fa-circle-check') + ' سایت پوششی فعال</span><b class="mono">' + esc(r.target) + '</b></div>' +
            '<div class="kv"><span>حجم پاسخ</span><b class="mono">' + fa(r.size) + ' بایت</b></div>' +
            '<div class="kv" style="flex-direction:column;align-items:flex-start"><span>متن صفحه</span><b style="font-weight:400;line-height:1.9">' + esc(r.sample) + '…</b></div>'
          : '<div class="kv"><span>' + icon('fa-circle-xmark') + ' سایت پوششی</span><b class="mono">خطا در دریافت</b></div>';
        toast(r.ok ? 'سایت پوششی واقعی کار می‌کند ✓' : 'سایت پوششی در دسترس نیست', r.ok ? 'ok' : 'err');
      }
      else if (a === 'tunnel-test') {
        busy(t, 'در حال تست');
        const r = await api('POST', '/api/action', { act: 'tunnel-test' });
        free(t);
        const o = $('#tunnelOut');
        if (o) o.innerHTML = (r.checks || []).map((c) => '<div class="kv"><span>' + icon(c.ok ? 'fa-circle-check' : 'fa-circle-xmark') + ' ' + esc(c.name) + '</span><b class="mono" style="font-size:10px;color:' + (c.ok ? 'var(--ok)' : 'var(--bad)') + ';max-width:60%;overflow:hidden;text-overflow:ellipsis">' + esc(c.note || '') + '</b></div>').join('') +
          '<div class="hint" style="margin-top:12px"><b>تست‌های بعدی (خودتان انجام دهید):</b></div>' +
          '<div class="btn-row" style="margin:8px 0">' +
          '<a class="btn sm" href="' + esc(location.origin + S.d.settings.path + '?test=1') + '" target="_blank">' + icon('fa-vial') + ' تست مسیر تونل در مرورگر</a>' +
          '<a class="btn sm" href="/health" target="_blank">' + icon('fa-heart-pulse') + ' تست سلامت ورکر</a></div>' +
          '<div class="hint">اگر روی «تست مسیر تونل» متن <span class="mono">TUNNEL_OK</span> دیدید، مسیر از اینترنت شما در دسترس است و مشکل قطعاً از تنظیمات کلاینت است.</div>' +
          '<div class="hint" style="margin-top:12px"><b>چک‌لیست کلاینت (به‌ترتیب):</b></div>' +
          '<div class="hint">۱. ساب را در کلاینت <b>دوباره رفرش</b> کنید تا کانفیگ جدید (بدون <span class="mono">?ed=2048</span> و با ALPN درست) بیاید.</div>' +
          '<div class="hint">۲. اگر از v2rayNG استفاده می‌کنید: تنظیمات → «Fragment» را خاموش کنید و در تنظیمات SSL، گزینه‌ی «allowInsecure» را روشن کنید و دوباره امتحان کنید.</div>' +
          '<div class="hint">۳. در کلاینت، آدرس سرور را به‌جای IP پاک، خودِ دامنه‌ی ورکر بگذارید (کانفیگ دستی) — اگر وصل شد یعنی آن IP در ISP شما فیلتر است.</div>' +
          '<div class="hint">۴. کانفیگ را در یک کلاینت دیگر (Hiddify یا v2rayN) امتحان کنید تا مشکل کلاینت مشخص شود.</div>' +
          '<div class="hint">۵. اگر سایت مقصد خودش روی کلاودفلر است، از داخل تونل قابل دسترسی نیست (محدودیت <span class="mono">connect()</span>) — سایت دیگری را تست کنید.</div>' +
          '<div class="hint" style="margin-top:12px"><b>راهنمای تفسیر نتایج:</b></div>' +
          '<div class="hint">• <b>SNI / Host قرمز</b> = رایج‌ترین علت. SNI و Host را در «پروتکل و کانفیگ» خالی بگذارید تا دامنه‌ی خود ورکر استفاده شود.</div>' +
          '<div class="hint">• <b>ترنسپورت قرمز</b> = باید WebSocket باشد؛ gRPC و XHTTP فقط در ساب تولید می‌شوند.</div>' +
          '<div class="hint">• <b>خروجی TCP</b> با یک پرس‌وجوی واقعی DNS به <span class="mono">8.8.8.8:53</span> تست می‌شود (نه IP کلاودفلر، نه سرویس HTTP). اگر سبز باشد یعنی سوکت‌های خروجی سالم‌اند.</div>' +
          '<div class="hint">• <b>اتصال TCP به پورت ۸۰</b> اگر قرمز بود، عادی است — کلاودفلر اجازه‌ی اتصال سوکتی به بعضی سرویس‌های HTTP را نمی‌دهد. در این حالت هسته‌ی تونل به‌طور خودکار از <span class="mono">fetch()</span> به‌عنوان مسیر جایگزین استفاده می‌کند.</div>' +
          '<div class="hint">• <b>محدودیت کلاودفلر:</b> سایت‌های میزبانی‌شده روی کلاودفلر از داخل تونل مستقیماً قابل دسترسی نیستند (محدودیت <span class="mono">connect()</span>). سایت‌های معمولی (گوگل، یوتیوب، تلگرام و…) مشکلی ندارند.</div>' +
          '<div class="hint">• <b>هسته‌ی تونل VLESS/Trojan</b> اگر سبز باشد، یعنی پارس پروتکل، تطبیق UUID/رمز و اتصال واقعی به مقصد همه سالم‌اند — پس کانفیگ از سمت سرور درست است؛ اگر کلاینت وصل نمی‌شود، مسیر شبکه (فیلتر بودن workers.dev) یا SNI است.</div>';
        toast(r.ok ? 'همه‌ی بررسی‌ها سالم بود ✓' : 'مشکلی پیدا شد — جزئیات را ببینید', r.ok ? 'ok' : 'err');
        if (r.error) toast('خطای سرور: ' + r.error, 'err');
      }
      else if (a === 'upd-check') { busy(t, 'بررسی'); const r = await api('POST', '/api/action', { act: 'update-check' }); free(t); toast(r.msg || 'بررسی شد', 'info'); await refresh(); }
      else if (a === 'upd-deploy') { busy(t, 'نصب'); const r = await api('POST', '/api/action', { act: 'update-deploy' }); free(t); toast(r.msg || 'نصب شد'); await refresh(); }
      else if (a === 'upd-rollback') { busy(t, 'بازگشت'); const r = await api('POST', '/api/action', { act: 'update-rollback' }); free(t); toast(r.msg || 'بازگشت انجام شد', 'info'); await refresh(); }
      else if (a === 'rotate-path') { const r = await api('POST', '/api/action', { act: 'rotate-path' }); toast('مسیر جدید: /' + (r.path || '')); await refresh(); }
      else if (a === 'pw-change') { const r = await api('POST', '/api/action', { act: 'pw-change', old: $('#pwOld').value, nw: $('#pwNew').value }); toast(r.ok ? 'رمز تغییر کرد — دوباره وارد شوید' : (r.error || 'خطا'), r.ok ? 'ok' : 'err'); if (r.ok) { S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); } }
      else if (a === '2fa-gen') { const r = await api('POST', '/api/action', { act: '2fa-secret' }); const o = $('#totpOut'); if (o) o.innerHTML = r.secret ? '<div class="row-item"><div class="grow"><b class="mono">' + esc(r.secret) + '</b><div class="cell-sub mono">' + esc(r.url || '') + '</div></div><button class="btn sm ghost" data-act="copy" data-v="' + esc(r.secret) + '">' + icon('fa-copy') + '</button></div>' : '<div class="empty">ساخته نشد</div>'; }
      else if (a === 'backup') { const blob = new Blob([JSON.stringify(S.d, null, 2)], { type: 'application/json' }); const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'panel-backup.json'; el.click(); toast('پشتیبان دانلود شد'); }
      else if (a === 'restore') $('#restoreFile').click();
      else if (a === 'factory') { if (!confirm('همه‌ی کاربران و تنظیمات به حالت اول برگردند؟')) return; await api('POST', '/api/action', { act: 'factory' }); toast('ریست شد', 'err'); await refresh(); }
      else if (a === 'logs-clear') { await api('POST', '/api/action', { act: 'logs-clear' }); toast('لاگ پاک شد', 'err'); await refresh(); }
    } catch (err) { free(t); toast('خطا: ' + err.message, 'err'); }
  });

  document.addEventListener('change', async (e) => {
    if (e.target.closest('[data-act="sel-user"]')) { S.sel = e.target.value; render(); }
    if (e.target.id === 'restoreFile') {
      const f = e.target.files[0]; if (!f) return;
      const r = await api('POST', '/api/action', { act: 'restore', data: JSON.parse(await f.text()) });
      toast(r.ok ? 'بازیابی شد' : (r.error || 'خطا'), r.ok ? 'ok' : 'err');
      if (r.ok) await refresh();
    }
  });

  /* جستجوی کاربران: فیلتر زنده‌ی ردیف‌ها بدون رندر مجدد (تمرکز و مقدار حفظ می‌شود) */
  document.addEventListener('input', (e) => {
    if (e.target.id === 'uSearch') {
      S.q = e.target.value;
      const q = S.q.trim().toLowerCase();
      $$('tbody tr[data-uid]').forEach((tr) => {
        const u = S.d.users.find((x) => x.id === tr.dataset.uid);
        if (!u) return;
        const hit = !q || [u.name, u.uuid, u.note, u.secret].join(' ').toLowerCase().includes(q);
        tr.dataset.hit = hit ? '1' : '0';
      });
      const vis = $$('tbody tr[data-uid]').filter((tr) => tr.dataset.hit === '1').length;
      let bar = $('#uCount');
      if (!bar) { bar = document.createElement('div'); bar.id = 'uCount'; bar.className = 'hint'; $('#uSearchBox').parentElement.appendChild(bar); }
      bar.textContent = fa(vis) + ' از ' + fa(S.d.users.length) + ' کاربر';
    }
    if (e.target.id === 'tbSearch') doSearch(e.target.value);
    if (e.target.type === 'range') { const b = e.target.parentElement.querySelector('b'); if (b) b.textContent = e.target.value + (b.textContent.match(/[^\d۰-۹]+$/) || [''])[0]; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'lgPw') { const b = $('[data-act="login"]'); if (b) b.click(); }
    if (e.key === 'Escape') { closeM(); $('#searchDrop').classList.remove('show'); closeDrawer(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const s = $('#tbSearch'); if (s) s.focus(); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#searchBox')) $('#searchDrop').classList.remove('show'); });

  /* کشوی منو */
  const openDrawer = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); };
  const closeDrawer = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); };
  $('#menuBtn').addEventListener('click', () => ($('#sidebar').classList.contains('open') ? closeDrawer() : openDrawer()));
  $('#sbClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  /* خروج */
  $('#logoutBtn').addEventListener('click', () => {
    if (!confirm('از پنل خارج شوید؟')) return;
    S.token = ''; sessionStorage.removeItem('sg_t'); S.d = null; render(); toast('خارج شدید', 'info');
  });

  /* تم */
  const setThemeIcon = () => { $('#themeBtn').innerHTML = icon(document.documentElement.dataset.theme === 'light' ? 'fa-moon' : 'fa-sun'); };
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    try { localStorage.setItem('sg_theme', cur); } catch (e) {}
    setThemeIcon();
  });

  /* Panic */
  $('#panicBtn').addEventListener('click', async () => {
    const b = $('#panicBtn');
    busy(b, '…');
    const r = await api('POST', '/api/action', { act: 'panic' });
    free(b);
    toast(r.panic ? 'Panic Mode فعال شد — همه‌ی تونل‌ها قطع شدند' : 'سرویس فعال شد', r.panic ? 'err' : 'ok');
    await refresh();
  });

  /* ─────────── راه‌اندازی ─────────── */
  try { document.documentElement.dataset.theme = localStorage.getItem('sg_theme') || 'dark'; } catch (e) { document.documentElement.dataset.theme = 'dark'; }
  setThemeIcon();
  render();
  window.__sgBooted = true;
  refresh();
  setInterval(() => { if (S.token && (S.view === 'dash' || S.view === 'monitor')) refresh(); }, 20000);
})();
