/* شبیه‌سازی مرورگر برای پیدا کردن ارورهای runtime در پنل — با ورود مستقیم به state */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'ui/style.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');

/* مثل ورکر: با تابع جایگزین می‌کنیم تا الگوهای $ در کد تفسیر نشوند */
let out = html
  .replace('<!--STYLESHEET-->', () => '<style>' + css + '</style>')
  .replace('<!--APPJS-->', () => '<script>' + js + '</script>');

const errors = [];
const dom = new JSDOM(out, {
  url: 'https://panel.example.workers.dev/panel',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    window.scrollTo = () => {};
    const state = {
      version: '2.0.0', build: 'test', storage: 'd1', boot: Date.now() - 60000, lastCheck: Date.now(),
      users: [{ id: 'u1', name: 'test', uuid: '11111111-1111-1111-1111-111111111111', secret: 'abcd', enabled: true, note: '', quotaGB: 50, dailyQuotaMB: 0, expiryAt: Date.now() + 30 * 86400000, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, fakes: [], fakeMode: 'inherit', up: 1e9, down: 2e9, totalReq: 12, lastSeen: Date.now(), createdAt: Date.now() }],
      keys: [{ id: 'k1', name: 'monitor', key: 'sk_test_0123456789', ro: true, lastUsedAt: Date.now() - 3600000, uses: 12 }],
      panels: [], logs: [{ id: 'l1', ts: Date.now(), level: 'warn', actor: 'api', action: 'اعتبارنامه نامعتبر — درخواست رد شد', detail: 'PUT /api/settings', ip: '203.0.113.9', method: 'PUT', path: '/api/settings', status: 401, who: 'anon' }], updateLog: [],
      /* ═══ لاگِ دقیقِ API — رینگِ خام + شمارندهٔ مسیرها
         تبِ «API» باید از همین دو رندر شود؛ اگر فیلدی بیفتد یا رکوردی با
         شمارنده (×n) کرش کند، اینجا گرفته می‌شود. */
      apiLog: [
        { id: 'a1', ts: Date.now(), ms: 12, ip: '203.0.113.9', who: 'key:monitor', k: 'r|GET|/api/state|key:monitor|200', m: 'GET', p: '/api/state', st: 200, n: 3, note: '' },
        { id: 'a2', ts: Date.now(), ms: 4, ip: '203.0.113.9', who: 'anon', k: 'f|PUT|/api/settings|anon|401', m: 'PUT', p: '/api/settings', st: 401, n: 1, note: '' },
      ],
      apiStats: { 'GET /api/state': { n: 3, ok: 3, err: 0, ms: 36, lastMs: 12, last: Date.now(), status: 200, ip: '203.0.113.9' } },
      stats: { requests: 42, connections: 0, daily: [1, 2, 3], monthly: [4, 5], yearly: [7] },
      settings: {
        panel: { name: 'پنل تست', url: '' }, mode: 'both', tls: true, transport: 'ws', sni: '', host: '',
        fingerprint: 'chrome', allowInsecure: false, protocols: { vless: true, trojan: true },
        auth: { path: 'panel', panic: false, disguise: true, totp: false, sessionMin: 1440, loginRate: '5/10', recoveryTg: false, recoveryCf: false, maintenanceHost: 'nginx', decoyUrl: '', pathRotate: false },
        sub: { path: 'sub', fakeConfigs: true, fakes: [], rules: [], userAgent: '', nodeLimit: 0, converter: '', telegramChannel: '', telegramSupport: '', telegramBuy: '', countryGroups: false, namePrefix: 'cfg', blockAdult: false, blockAds: true, blockQuic: false, bypassIR: false, doh: '1.1.1.1' },
        sec: { killSwitch: false, ipConnLimit: 0, speedTestUrl: '', cors: false, csp: true },
        fragment: { enabled: false, mode: '', noise: '', padding: '', size: '', delay: '' },
        ech: { enabled: false }, cleanIPs: ['1.2.3.4#تست'], ports: [443, 80], proxyIPs: [],
        tg: { enabled: false, token: '', chatId: '', silent: false },
        upd: { auto: false, repo: 'x/y' },
        cleanIPs: [], proxyIPs: [], doh: '', nat64: '', geoip: '',
        exits: { servers: [], defaultExit: '', defaultMode: 'direct' },
        fr: { repo: 'x/y', files: [] },
      },
    };
    window.fetch = (u, o) => Promise.resolve({ ok: true, status: 200, json: async () => state, text: async () => JSON.stringify(state), headers: { get: () => null } });
    /* توکن از قبل ست — پنل مستقیم وارد می‌شود */
    window.sessionStorage.setItem('sg_t', 'test-token');
  },
});

dom.window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));

setTimeout(async () => {
  const w = dom.window, d = w.document;
  const click = (sel) => { const el = d.querySelector(sel); if (!el) { console.log('MISSING:', sel); return; } el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  await new Promise((r) => setTimeout(r, 300));
  console.log('view after boot:', JSON.stringify((d.querySelector('.page-head h1') || {}).textContent));
  const views = ['monitor', 'dash', 'users', 'sub', 'conns', 'logs', 'settings', 'config', 'security'];
  for (const v of views) {
    const before = errors.length;
    click('[data-view="' + v + '"]');
    await new Promise((r) => setTimeout(r, 300));
    const newErrs = errors.slice(before);
    console.log('view', v, '→', newErrs.length ? 'ERRORS: ' + newErrs.join(' | ') : 'OK');
  }
  /* ═══ مودالِ ساختِ کلیدِ API — فقط رندر (بدونِ شبکه) ═══
     دکمه‌ی «کلید جدید» باید نام و دسترسی را از ادمین بپرسد؛ اگر مودال رندر
     نشود یا #keyName نباشد، key-save نمی‌تواند چیزی بسازد و کلید بی‌دسترسی
     ساخته می‌شود — همان باگی که کلیدِ API را بی‌فایده کرده بود. */
  click('[data-view="settings"]');
  await new Promise((r) => setTimeout(r, 250));
  click('[data-act="key-new"]');
  await new Promise((r) => setTimeout(r, 150));
  const kn = d.querySelector('#keyName'), kscope = d.querySelector('#keyRo'), ksave = d.querySelector('[data-act="key-save"]');
  console.log('مودالِ کلیدِ API:', kn ? 'OK (نام=' + kn.value + ' • چک‌باکسِ فقط‌خواندنی=' + !!kscope + ' • دکمهٔ ساخت=' + !!ksave + ')' : 'MISSING');
  if (!kn || !kscope || !ksave) errors.push('مودالِ کلیدِ API کامل رندر نشد');
  const krow = d.querySelector('[data-act="key-scope"]');
  if (!krow) errors.push('دکمهٔ تغییرِ دسترسیِ کلید رندر نشد');

  /* ═══ تبِ «API» در نمای لاگ ═══
     باید رکوردهای خام (روش/مسیر/کد/آی‌پی/اعتبارنامه) و شمارندهٔ مسیرها را
     رندر کند؛ هم‌چنین ردیفِ لاگِ فعالیت باید بافتِ درخواستش را نشان دهد. */
  click('[data-view="logs"]');
  await new Promise((r) => setTimeout(r, 250));
  const beforeApi = errors.length;
  click('[data-act="loglv"][data-v="api"]');
  await new Promise((r) => setTimeout(r, 250));
  const apiTxt = d.body.textContent || '';
  const apiOk = /api\/state/.test(apiTxt) && /key:monitor/.test(apiTxt) && /203\.0\.113\.9/.test(apiTxt) && /فراخوان/.test(apiTxt);
  console.log('تبِ API:', apiOk ? 'OK (رکورد + شمارندهٔ مسیر + آی‌پی)' : 'MISSING');
  if (!apiOk || errors.length > beforeApi) errors.push('تبِ API رندر نشد (رکورد/شمارندهٔ مسیر/آی‌پی)');
  click('[data-act="loglv"][data-v="all"]');
  await new Promise((r) => setTimeout(r, 200));
  const allTxt = d.body.textContent || '';
  /* کدِ وضعیت با رقمِ فارسی رندر می‌شود (HTTP ۴۰۱) — پس فقط وجودِ خودِ
     خطِ بافت (HTTP… + آی‌پی) سنجیده می‌شود، نه رقمِ خاص */
  const ctxOk = /HTTP/.test(allTxt) && /203\.0\.113\.9/.test(allTxt) && /PUT \/api\/settings/.test(allTxt);
  console.log('تبِ رویدادها:', ctxOk ? 'OK (آی‌پی + کدِ وضعیت در ردیف)' : 'MISSING');
  if (!ctxOk) errors.push('ردیفِ لاگِ فعالیت بافتِ درخواست (آی‌پی/کد) را نشان نمی‌دهد');

  console.log('--- all errors ---');
  errors.forEach((e) => console.log(e));
  if (!errors.length) console.log('(none)');
  process.exit(0);
}, 600);
