/* شبیه‌سازی مرورگر برای پیدا کردن ارورهای runtime در پنل — با ورود مستقیم به state */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(process.cwd(), 'Sub');
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
      keys: [], panels: [], logs: [], updateLog: [],
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
  console.log('--- all errors ---');
  errors.forEach((e) => console.log(e));
  if (!errors.length) console.log('(none)');
  process.exit(0);
}, 600);
