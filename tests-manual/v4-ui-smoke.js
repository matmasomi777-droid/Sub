/**
 * تست دودیِ v4 — موتور پوسته، چندزبانه و ارتقای نسخه
 * بدون مرورگر: سینتکس + ساختار + سازگاریِ پوسته/زبان
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let fail = 0;
const ok = (cond, name) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name); if (!cond) fail++; };

const app = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'ui', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');

/* ─── ۱. سینتکس ─── */
try {
  execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'ui', 'app.js')], { stdio: 'pipe' });
  ok(true, 'سینتکس ui/app.js');
} catch (e) { ok(false, 'سینتکس ui/app.js — ' + String(e.stderr || e.message).split('\n')[0]); }

/* ─── ۲. موتور پوسته ─── */
ok(/const SKINS = \[/.test(app), 'SKINS تعریف شده است');
for (const sk of ['modern', 'minecraft', 'cyberpunk', 'terminal']) {
  ok(app.includes("id: '" + sk + "'"), 'پوسته ' + sk + ' در SKINS هست');
  ok(css.includes('html[data-skin="' + sk + '"]'), 'CSS پوسته ' + sk + ' هست');
}
ok((app.match(/skinModern/g) || []).length >= 3, 'برچسب‌های پوسته مدرن تعریف و استفاده شده');
ok(!/html\[data-skin="modern"\]\s*,\s*\n?\s*html\[data-skin="minecraft"\]\s*,/.test(css), 'پوسته‌ها گروه‌نشده‌اند (هرکدام بلوک خودش)');

/* هر پوسته باید پالت‌های خودش را داشته باشد */
const skins = ['modern', 'minecraft', 'cyberpunk', 'terminal'];
for (const sk of skins) {
  const m = app.match(new RegExp("id: '" + sk + "'[^\\]]*pal: \\[([^\\]]*)\\]"));
  ok(!!m, 'پالت‌های پوسته ' + sk + ' در SKINS اعلام شده');
  if (m) {
    const pals = m[1].split(',').map((x) => x.trim().replace(/'/g, ''));
    ok(pals.length >= 3, 'پوسته ' + sk + ' دست‌کم ۳ پالت دارد (' + pals.join(', ') + ')');
    for (const p of pals) {
      ok(css.includes('[data-skin="' + sk + '"][data-mode="dark"][data-pal="' + p + '"]'), 'پالت ' + sk + '/' + p + ' تاریک در CSS');
      ok(css.includes('[data-skin="' + sk + '"][data-mode="light"][data-pal="' + p + '"]'), 'پالت ' + sk + '/' + p + ' روشن در CSS');
      ok(app.includes(p + ": ['"), 'رنگ‌نمونه‌ی پالت ' + p + ' در app.js');
    }
  }
}

/* حالت شب و روز */
ok(css.includes('html[data-skin="modern"][data-mode="light"]'), 'حالت روشن برای مدرن');
ok(css.includes('html[data-skin="minecraft"][data-mode="light"]'), 'حالت روشن برای ماینکرفت');
ok(css.includes('html[data-skin="cyberpunk"][data-mode="light"]'), 'حالت روشن برای سایبرپانک');
ok(css.includes('html[data-skin="terminal"][data-mode="light"]'), 'حالت روشن برای ترمینال');

/* دکمه‌های solid و گرادیان هر دو باشند */
ok(css.includes('.btn.p{background:var(--ac)'), 'دکمه‌ی اصلی سالید است (پیش‌فرض)');
ok(css.includes('html[data-skin="modern"] .btn.p{background:var(--grad)'), 'مدرن گرادیان دارد (استثنا)');
ok(css.includes('.brand-mark{width:38px'), 'برند سالید پیش‌فرض');
ok(css.includes('html[data-skin="modern"] .brand-mark{border-radius:12px;background:var(--grad)}'), 'گرادیان فقط در مدرن');

/* ─── ۳. چندزبانه ─── */
for (const lang of ['fa', 'en', 'ar', 'ru', 'zh']) {
  ok(app.includes('    ' + lang + ': { _dir:'), 'زبان ' + lang + ' در I18N هست');
}
ok(app.includes("const setLang = (l)"), 'تابع setLang هست');
ok(app.includes('function applyLang()'), 'تابع applyLang هست');
ok(app.includes("localStorage.getItem('sg_lang')"), 'زبان در localStorage ذخیره می‌شود');
ok(html.includes('data-i18n='), 'المان‌های data-i18n در پوسته');
ok(html.includes('data-i18n-ph='), 'placeholder ترجمه‌شدنی در پوسته');
ok(app.includes("id=\"langBtn\"") || html.includes('id="langBtn"'), 'دکمه‌ی زبان در پوسته هست');

/* ─── ۴. مدال ظاهر ─── */
ok(app.includes('function appearanceModal()'), 'مدال ظاهر تعریف شده');
ok(app.includes("data-ap=\"skin\""), 'انتخابگر پوسته در مدال');
ok(app.includes("data-ap=\"mode\""), 'انتخابگر حالت در مدال');
ok(app.includes("data-ap=\"pal\""), 'انتخابگر پالت در مدال');
ok(app.includes("data-ap=\"lang\""), 'انتخابگر زبان در مدال');
ok(html.includes('id="appBtn"'), 'دکمه‌ی ظاهر در نوار بالا');

/* ─── ۵. سازگاری — شناسه‌های پوسته که app.js لمس می‌کند ─── */
  /* (lgPw/lgTp در loginView به‌صورت پویا ساخته می‌شوند، پس در پوسته‌ی ثابت نیستند) */
for (const id of ['modalRoot', 'toastRoot', 'nav', 'view', 'sidebar', 'scrim', 'foot', 'pageTitle',
  'brandName', 'brandVer', 'sfStore', 'sfUsers', 'sfVer', 'menuBtn', 'themeBtn', 'panicBtn', 'logoutBtn',
  'searchBox', 'searchDrop', 'tbSearch', 'tbState', 'tbDot', 'tbReq', 'appBtn', 'langBtn']) {
  ok(html.includes('id="' + id + '"'), 'شناسه‌ی ' + id + ' در index.html');
}

/* ─── ۶. نسخه ۴ ─── */
ok(worker.includes("const VERSION = '4.0.0';"), 'worker.js نسخه 4.0.0');
ok(!worker.includes("const VERSION = '3.0.0';"), 'نسخه‌ی ۳ در worker.js نیست');
ok(/Panel v4\.0\.0 — client logic/.test(app), 'سربرگ app.js نسخه ۴');
ok(css.includes('v4 — Skin Engine') || css.includes('Panel v4.0.0'), 'سربرگ CSS نسخه ۴');
ok(css.includes('.badge.v4'), 'کلاس badge نسخه‌دار به v4 تغییر کرده');
ok(!css.includes('.badge.v3'), 'کلاس قدیمی .badge.v3 حذف شده');
ok(!/نسخه 3\.0\.0/.test(worker), 'متن نسخه ۳ در سربرگ ورکر نیست');
ok(!worker.includes("const VERSION = '3"), 'هیچ VERSION = 3 باقی نمانده');

process.exit(fail ? 1 : 0);
