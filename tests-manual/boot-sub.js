/* شبیه‌سازی صفحه‌ی ساب (new-subscription) در jsdom — پیدا کردن خطاهای runtime */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'new-subscription'), 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://panel.example.com/sub/abc123',
  beforeParse(window) {
    window.fetch = () => Promise.resolve({ ok: true, headers: { get: (k) => ({ 'subscription-userinfo': 'upload=0; download=0; total=0; expire=0', 'subscription-last-online': '0' }[String(k).toLowerCase()] || null) }, text: () => Promise.resolve(''), json: () => Promise.resolve({}) });
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.navigator && Object.defineProperty(window.navigator, 'onLine', { value: true });
    window.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message + ' @' + (e.filename||'') + ':' + (e.lineno||'?')));
  },
});
dom.window.addEventListener('error', (e) => errors.push('dom error: ' + e.message));

setTimeout(() => {
  const w = dom.window, d = w.document;
  console.log('== صفحه ساب ==');
  console.log('عنوان:', d.getElementById('page-title') ? d.getElementById('page-title').textContent.trim().slice(0,40) : '(ندارد)');
  console.log('دکمه QR:', d.getElementById('btn-toggle-qr') ? 'هست' : 'نیست');
  console.log('btn-dl-client3:', (d.getElementById('btn-dl-client3')||{}).href || '(ندارد)');
  console.log('خطاها:', errors.length ? errors.join('\n') : 'هیچ ✓');
  process.exit(0);
}, 1500);
