/* تست تعاملی بخش انقضا در مودال کاربر — ساعت‌وار + شروع از اولین استفاده */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'ui/style.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');

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
    /* کاربر با انقضای ساعتی (۲ ساعت مانده) + کاربرِ منتظرِ اولین اتصال */
    const state = {
      version: '2.0.0', build: 'test', storage: 'd1', boot: Date.now() - 60000, lastCheck: Date.now(),
      users: [
        { id: 'u1', name: 'hourly', uuid: '11111111-1111-1111-1111-111111111111', secret: 'abcd', enabled: true, note: '', quotaGB: 50, dailyQuotaMB: 0, expiryAt: Date.now() + 2 * 3600000, expiryFirstUse: false, expiryArmed: true, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, fakes: [], fakeMode: 'inherit', up: 1e6, down: 2e6, totalReq: 3, lastSeen: Date.now(), createdAt: Date.now() },
        { id: 'u2', name: 'firstuse', uuid: '22222222-2222-2222-2222-222222222222', secret: 'efgh', enabled: true, note: '', quotaGB: 0, dailyQuotaMB: 0, expiryAt: Date.now() + 5 * 3600000, expiryFirstUse: true, expiryArmed: false, expiryDurMs: 5 * 3600000, deviceLimit: 3, ipLimit: 0, maxConfigs: 0, speedLimit: 0, mode: 'inherit', ports: '', cleanIPs: [], proxyIPs: [], nodes: [], nat64: '', panelUrl: '', blockAdult: false, blockAds: true, fakes: [], fakeMode: 'inherit', up: 0, down: 0, totalReq: 0, lastSeen: null, createdAt: Date.now() },
      ],
      keys: [], panels: [], logs: [], updateLog: [],
      stats: { requests: 10, connections: 0, daily: [1, 2], monthly: [3], yearly: [4] },
      settings: {
        panel: { name: 'پنل تست', url: '' }, mode: 'both', tls: true, transport: 'ws', sni: '', host: '',
        fingerprint: 'chrome', allowInsecure: false, protocols: { vless: true, trojan: true },
        auth: { path: 'panel', panic: false, disguise: true, totp: false, sessionMin: 1440, loginRate: '5/10', recoveryTg: false, recoveryCf: false, maintenanceHost: 'nginx', decoyUrl: '', pathRotate: false },
        sub: { path: 'sub', fakeConfigs: false, fakes: [], rules: [], userAgent: '', nodeLimit: 0, converter: '', telegramChannel: '', telegramSupport: '', telegramBuy: '', countryGroups: false, namePrefix: 'cfg', blockAdult: false, blockAds: true, blockQuic: false, bypassIR: false, doh: '1.1.1.1' },
        sec: { killSwitch: false, ipConnLimit: 0, speedTestUrl: '', cors: false, csp: true },
        fragment: { enabled: false, mode: '', noise: '', padding: '', size: '', delay: '' },
        ech: { enabled: false }, cleanIPs: [], ports: [443], proxyIPs: [],
        tg: { enabled: false, token: '', chatId: '', silent: false },
        upd: { auto: false, repo: 'x/y' },
        exits: { servers: [], defaultExit: '', defaultMode: 'direct' },
        fr: { repo: 'x/y', files: [] },
      },
    };
    let saved = null;
    window.fetch = (u, o) => {
      const body = o && o.body ? JSON.parse(o.body) : null;
      if (body && body.patch) saved = body.patch;         /* patch ذخیره را بگیر */
      return Promise.resolve({ ok: true, status: 200, json: async () => state, text: async () => JSON.stringify(state), headers: { get: () => null } });
    };
    window.sessionStorage.setItem('sg_t', 'test-token');
    window.__savedPatch = () => saved;
  },
});
dom.window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));

setTimeout(async () => {
  const w = dom.window, d = w.document;
  const click = (sel) => { const el = d.querySelector(sel); if (!el) { console.log('MISSING:', sel); return false; } el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return true; };
  await new Promise((r) => setTimeout(r, 400));

  console.log('== نمایش جدول کاربران ==');
  click('[data-view="users"]');
  await new Promise((r) => setTimeout(r, 300));
  const badges = [...d.querySelectorAll('td .badge')].map((b) => b.textContent.trim());
  console.log('بجِ ساعتی (۲ ساعت):', badges.find((b) => b.includes('ساعت')) || 'نیست ✗');
  console.log('بجِ منتظرِ اولین اتصال:', badges.find((b) => b.includes('اولین اتصال')) || 'نیست ✗');

  console.log('\n== مودال کاربرِ ساعتی ==');
  const edit1 = [...d.querySelectorAll('[data-act="user-edit"]')].find((b) => b.dataset.id === 'u1');
  edit1.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  console.log('بخش انقضا رندر شد:', !!d.querySelector('#expQtyRow'));
  const onChip = d.querySelector('[data-act="exp-mode"].on');
  console.log('چیپ فعال پیش‌فرض:', onChip ? onChip.dataset.v : 'نیست');
  console.log('مقدار فیلد تعداد:', (d.querySelector('[data-p="expQty"]') || {}).value);
  console.log('کلید first-use خاموش:', !(d.querySelector('[data-p="expiryFirstUse"]') || {}).checked);

  /* کلیک روی «نامحدود» و ذخیره */
  console.log('\n== تغییر به نامحدود و ذخیره ==');
  click('[data-act="exp-mode"][data-v="none"]');
  await new Promise((r) => setTimeout(r, 150));
  console.log('ردیف تعداد پنهان شد:', d.querySelector('#expQtyRow').style.display === 'none');
  const saveBtn = d.querySelector('[data-act="user-save"]');
  saveBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  let p = w.__savedPatch() || {};
  console.log('patch.expiryDays:', p.expiryDays, '(باید 0)');
  console.log('patch.expiryFirstUse:', p.expiryFirstUse, '(باید false)');
  console.log('بدون expiryHours:', p.expiryHours === undefined ? 'بله ✓' : 'خیر ✗: ' + p.expiryHours);

  /* حالا حالت ساعتی با ۳ ساعت */
  console.log('\n== حالت ساعتی، ۳ ساعت ==');
  const edit2 = [...d.querySelectorAll('[data-act="user-edit"]')].find((b) => b.dataset.id === 'u1');
  if (edit2) {
    edit2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    click('[data-act="exp-mode"][data-v="hours"]');
    await new Promise((r) => setTimeout(r, 150));
    const qty = d.querySelector('[data-p="expQty"]');
    qty.value = '3';
    d.querySelector('[data-act="user-save"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    p = w.__savedPatch() || {};
    console.log('patch.expiryHours:', p.expiryHours, '(باید 3)');
    console.log('patch.expiryFirstUse:', p.expiryFirstUse, '(باید false)');
  }

  /* کاربرِ first-use: toggle روشن است + ذخیره با toggle روشن → expiryFirstUse: true */
  console.log('\n== کاربر «از اولین استفاده» ==');
  const edit3 = [...d.querySelectorAll('[data-act="user-edit"]')].find((b) => b.dataset.id === 'u2');
  if (edit3) {
    edit3.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    console.log('کلید first-use روشن:', (d.querySelector('[data-p="expiryFirstUse"]') || {}).checked === true);
    /* خاموش کردن toggle، انتخاب «۱ روز» و ذخیره → expiryFirstUse باید false شود */
    const swEl = d.querySelector('[data-sw="expiryFirstUse"]');
    if (swEl) swEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    console.log('بعد از کلیک، toggle خاموش شد:', !(d.querySelector('[data-p="expiryFirstUse"]') || {}).checked);
    click('[data-act="exp-mode"][data-v="days"]');
    await new Promise((r) => setTimeout(r, 150));
    const qty2 = d.querySelector('[data-p="expQty"]');
    qty2.value = '1';
    d.querySelector('[data-act="user-save"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    p = w.__savedPatch() || {};
    console.log('patch.expiryDays:', p.expiryDays, '(باید 1)');
    console.log('patch.expiryFirstUse:', p.expiryFirstUse, '(باید false)');
  }

  console.log('\n--- خطاها ---');
  errors.forEach((e) => console.log(e));
  if (!errors.length) console.log('(none) ✓');
  process.exit(0);
}, 600);
