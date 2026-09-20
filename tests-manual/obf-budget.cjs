/* ═══════════════════════════════════════════════════════════════════════════
 *  بودجهٔ بستهٔ مستقر — جلوی رگرسیونِ گران‌قیمت را می‌گیرد.
 *  ───────────────────────────────────────────────────────────────────────────
 *  چرا این تست وجود دارد: بستهٔ مستقر با حالتِ obfuscate «سنگین»
 *  (control-flow flattening + stringArray rc4 + splitStrings) در هر *استارتِ
 *  isolate* حدوداً **نیم ثانیه CPU** می‌سوزاند و در هر درخواست دو برابر
 *  هزینه دارد. کلاودفلر CPUِ استارت را هم حساب می‌کند: در لاگ‌های زندهٔ یک
 *  نصبِ واقعی، ۵۶۸ پیام «Worker exceeded CPU time limit» در ۶ ساعت ثبت شد
 *  (۱۶٪ نشست‌ها) که همه روی نشست‌های *کوتاه* (wall ~۰٫۹s) رخ می‌دادند —
 *  یعنی کاربر بی‌هیچ خطایی وسطِ کار قطع می‌شد.
 *
 *  این تست آن رگرسیون را روی زمین می‌خواباند: اندازه + هزینهٔ استارت.
 *  اجرا:  npm run test:obf-budget   (بخشی از npm test)
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'worker.js');
const OBF = path.join(ROOT, '_worker.obf.js');
const TMP = path.join(ROOT, '.obf-budget-tmp');

let fail = 0;
const ok = (c, label, extra) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  → ' + extra : ''));
  if (!c) fail++;
};

/* بستهٔ مستقر باید بار شود؛ importِ 'cloudflare:sockets' تنها چیزی است که در
   نود وجود ندارد، پس با یک شبیه‌سازِ کوچک عوضش می‌کنیم (خودِ کد دست‌نخورده
   می‌ماند تا هزینهٔ واقعیِ بارگذاری سنجیده شود). */
function stage(file, tag) {
  /* ⚠️ هر بارگذاری پوشهٔ خودش را دارد: اگر هر دو از یک مسیر بار شوند، نود
     نتیجهٔ کامپایلِ قبلی را دوباره استفاده می‌کند و سنجه بی‌معنا می‌شود
     (در اجرای داخلِ npm test عددِ ۱۲۵× درآمد در حالی که واقعیت ۳× است). */
  const dir = path.join(TMP, tag);
  fs.mkdirSync(dir, { recursive: true });
  const body = fs.readFileSync(file, 'utf8').replace(
    /from\s*(['"])((?:\x[0-9a-fA-F]{2}|\\.|[^'"])*)\1/,
    (m, q, raw) => {
      const spec = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return spec === 'cloudflare:sockets' ? 'from "./sockets.mjs"' : m;
    }
  );
  fs.writeFileSync(path.join(dir, 'w.mjs'), body);
  fs.writeFileSync(path.join(dir, 'sockets.mjs'),
    "export const connect = () => ({ opened: Promise.reject(new Error('no socket')), readable: new ReadableStream(), writable: new WritableStream(), close() {} });\n");
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
  return 'file:///' + path.join(dir, 'w.mjs').replace(/\\/g, '/');
}

/* globalهای ورکر که در نود نیستند (بستهٔ obfuscate در خطِ اول به WebSocketPair
   دست می‌زند) */
globalThis.WebSocketPair = function WebSocketPair() { return [{}, {}]; };

const costOf = async (file, tag) => {
  const url = stage(file, tag) + '?t=' + Date.now();
  const t0 = process.cpuUsage();
  await import(url);
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / 1000;
};

(async () => {
  if (!fs.existsSync(OBF)) {
    console.log('  ✗ بستهٔ مستقر پیدا نشد — اول npm run build را اجرا کنید');
    process.exit(1);
  }
  const sizeKb = Math.round(fs.statSync(OBF).size / 1024);
  /* سقفِ اندازه: حالتِ سنگین ۶٫۴MB بود؛ سقفِ منطقی ۱٫۶MB (سبک ~۶۵۰KB) */
  ok(sizeKb < 1600, 'اندازهٔ بستهٔ مستقر در بودجه است', sizeKb + ' KB (حالتِ سنگین: ~۶٫۴MB)');
  ok(sizeKb > 50, 'بسته واقعاً همان کد است (خالی نیست)', sizeKb + ' KB');

  const plain = await costOf(SRC, 'plain');
  const obf = await costOf(OBF, 'obf');
  console.log('  • هزینهٔ استارت: worker.js=' + Math.round(plain) + 'ms CPU  •  _worker.obf.js=' + Math.round(obf) + 'ms CPU');
  /* معیارِ نسبی (مستقل از سرعتِ ماشین) + یک سقفِ مطلقِ بخشنده */
  ok(obf < plain * 4 + 120, 'هزینهٔ استارتِ بستهٔ مستقر نسبت به کدِ اصلی نجومی نیست',
    Math.round(obf / Math.max(1, plain) * 10) / 10 + '× کدِ اصلی');
  ok(obf < 260, 'هزینهٔ استارت زیرِ سقفِ مطلق است (حالتِ سنگین ~۵۰۰ms بود)', Math.round(obf) + 'ms');
  /* حالتِ پیش‌فرضِ بیلد باید سبک باشد — وگرنه این تست بی‌فایده است */
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-obfuscated.mjs'), 'utf8');
  ok(/process\.env\.OBF_PRESET\s*\|\|\s*'cheap'/.test(build), 'پیش‌فرضِ بیلد = cheap');

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(fail ? '\n  نتیجه: ' + fail + ' مورد شکست ✗' : '\n  نتیجه: بودجهٔ بسته سالم است ✓');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('  ✗ خطای غیرمنتظره: ' + ((e && e.stack) || e));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
