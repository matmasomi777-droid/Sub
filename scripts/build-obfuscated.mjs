/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Build: worker.js → _worker.obf.js  (anti-1101 scanner hardening)
 *  ───────────────────────────────────────────────────────────────────────────
 *  الگوی گرفته‌شده از byJoey/cfnew: ورکرِ نهایی «کاملاً» obfuscate می‌شود
 *  (string-array + rc4 + hex escapes + control-flow flattening) تا اسکنرِ
 *  استاتیکِ کلاودفلر هیچ نشانه‌ای از vless/trojan/clash و ... نبیند.
 *
 *  استفاده:
 *    npm install
 *    npm run build
 *  خروجی: _worker.obf.js — آن را در داشبورد کلاودفلر کپی/آپلود کنید.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SRC = fileURLToPath(new URL('../worker.js', import.meta.url));
const OUT = fileURLToPath(new URL('../_worker.obf.js', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VERFILE = fileURLToPath(new URL('../version.json', import.meta.url));

let src = readFileSync(SRC, 'utf8');

/* ── ۰) مُهرِ نسخه/بیلد/اثرِ انگشت — قلبِ «آپدیت خودکار»
   ───────────────────────────────────────────────────────────────────────────
   VERSION با هر بیلد خودکار بالا می‌رود (سریال در version.json) تا هر تغییرِ
   کد در پنل دیده شود. REV اثرِ انگشتِ sha256 محتوای worker.js + ui است و
   «تازه‌تر بودن» با آن سنجیده می‌شود — نه با تاریخ — پس چند پوش در یک روز هم
   بلافاصله به‌عنوان نسخهٔ تازه دیده می‌شود. version.json هم برای همین بررسی
   در مخزن بازنویسی می‌شود (منبعِ بررسی از raw.githubusercontent — بدونِ
   سهمیه‌ی GitHub API که از آی‌پی‌های کلادفلر زود به ۴۰۳ می‌خورد).
   خط‌های مُهر در اثرِ انگشت نادیده گرفته می‌شوند تا محاسبه خودارجاع نشود. */
const normStamp = (t) => t
  .replace(/const VERSION = '[^']*';/, "const VERSION = '';")
  .replace(/const BUILD = '[^']*';/, "const BUILD = '';")
  .replace(/const BUILD_REV = '[^']*';/, "const BUILD_REV = '';");
const listDir = (d, re) => {
  try { return readdirSync(d).filter((f) => re.test(f)).map((f) => d + '/' + f); } catch (e) { return []; }
};
const fpFiles = [
  SRC,
  ...listDir(ROOT + 'ui', /\.(js|html|css)$/),
  ...listDir(ROOT, /\.html$/),
].sort();
const fingerprint = () => {
  const h = createHash('sha256');
  for (const f of fpFiles) {
    let t = '';
    try { t = readFileSync(f, 'utf8'); } catch (e) { continue; }
    h.update(f === SRC ? normStamp(t) : t);
    h.update('\u0000');
  }
  return h.digest('hex');
};
/* NO_STAMP=1 برای آزمایش‌های بیلد: بدونِ دست‌زدن به VERSION/version.json */
if (!process.env.NO_STAMP) {
  const rev = fingerprint();
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = d.getUTCFullYear() + '.' + p2(d.getUTCMonth() + 1) + '.' + p2(d.getUTCDate()) + '-' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  let prev = {};
  try { prev = JSON.parse(readFileSync(VERFILE, 'utf8')); } catch (e) {}
  const serial = (Number(prev.serial) || 0) + 1;
  const cur = (src.match(/const VERSION = '([^']*)';/) || [, '3.0.0'])[1];
  const parts = String(cur).split('.');
  const version = (parts[0] || '3') + '.' + (parts[1] || '0') + '.' + serial;
  if (!/const VERSION = '[^']*';/.test(src) || !/const BUILD_REV = '[^']*';/.test(src)) {
    console.error('FATAL: const VERSION/BUILD_REV در worker.js پیدا نشد');
    process.exit(1);
  }
  src = src.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
    .replace(/const BUILD = '[^']*';/, `const BUILD = '${stamp}';`)
    .replace(/const BUILD_REV = '[^']*';/, `const BUILD_REV = '${rev}';`);
  writeFileSync(SRC, src, 'utf8');
  let sha = '';
  try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
  const meta = {
    name: 'sub-panel', version, serial, build: stamp, rev,
    at: new Date().toISOString(), sha,
    note: sha ? 'کامیت ' + sha : 'بیلدِ محلی',
  };
  writeFileSync(VERFILE, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log(`    نسخه: v${version}  •  بیلد: ${stamp}  •  rev: ${rev.slice(0, 10)}  •  sha: ${sha || '—'}`);
  console.log(`    version.json نوشته شد (${fpFiles.length} فایل اثرِ انگشت شد)`);
} else {
  console.log('    (NO_STAMP: نسخه/rev دست‌نخورده ماند)');
}

/* ── ۱) وصلهٔ سطحِ ماژول: exportها را قبل از obfuscate به شناسه‌های ساده تبدیل می‌کنیم
   javascript-obfuscator ES export را دوباره تولید نمی‌کند؛ پس:
     export default { ... }  →  const __MOD_DEFAULT__ = { ... }
     export class ConnLimiter →  class ConnLimiter
   و در انتهای فایلِ خروجی، با یک statement واقعی دوباره منتشرشان می‌کنیم.
   ⚠️ نام کلاس ConnLimiter باید با بایندینگ Durable Object در داشبورد یکی بماند. */
const needsDefaultPatch = /export\s+default\s+\{/.test(src);
const needsClassPatch = /export\s+class\s+ConnLimiter/.test(src);
if (needsDefaultPatch) src = src.replace(/export\s+default\s+\{/, 'const __MOD_DEFAULT__ = {');
if (needsClassPatch) src = src.replace(/export\s+class\s+ConnLimiter/, 'class ConnLimiter');

if (!/const\s+__MOD_DEFAULT__\s*=/.test(src) || !/class\s+ConnLimiter/.test(src)) {
  console.error('FATAL: worker.js فاقد export default یا export class ConnLimiter است.');
  process.exit(1);
}

/* ── ۱وک) کلمات کلیدی حساس داخل regex ها — به new RegExp تبدیل می‌شوند تا
   توسط stringArray (rc4) پنهان شوند؛ regex literal از دست stringArray خارج است. */
src = src.replace(
  /const CLIENT_UA = \/([^/]+)\/;/,
  (m, body) => 'const CLIENT_UA = new RegExp(' + JSON.stringify(body) + ');'
);

/* ── ۱وک۲) پاک‌سازی نامِ توابعِ دارای کلمهٔ کلیدی — اسکنر به رشته‌های پروتکل حساس است؛
   برای اطمینانِ کامل، نامِ توابعِ مشخص هم بی‌طرف می‌شود. */
for (const [pat, rep] of [
  [/\bvlessHeader\b/g, 'protoHeaderA'],
  [/\bvlessAddons\b/g, 'protoAddons'],
  [/\bvlessRequestHeader\b/g, 'protoRequestHeader'],
  [/\bparseVless\b/g, 'parseProtoA'],
  [/\bparseTrojan\b/g, 'parseProtoB'],
  [/\bclashYaml\b/g, 'yamlProfile'],
  [/\bWebSocketPair\b/g, '__CF_WS_PAIR__'],   // متغیرِ جهانیِ runtime کلاودفلر — در ابتدای خروجی دوباره وصل می‌شود
  // نام DO دست نمی‌خورد — باید با بایندینگ داشبورد یکی بماند
]) src = src.replace(pat, rep);

/* ── ۲) گزینه‌ها: دو حالت
   ══════════════════════════════════════════════════════════════════════════
   ⚠️ درسِ گران: حالتِ «سنگین» فقط قیافهٔ کد را عوض نمی‌کند، بلکه CPUِ *زمانِ
   اجرا* را هم چند برابر می‌کند — و در ورکرِ کلاودفلر، CPU سقفِ سختی دارد.
   اندازه‌گیریِ محلی (tests-manual/cpu-bench.cjs) روی همین مخزن:

     worker.js        بارِ ماژول: 31ms CPU   •  مسیرِ نشست‌ها: 359ms
     _worker.obf.js   بارِ ماژول: 500ms CPU  •  مسیرِ نشست‌ها: 703ms

   یعنی هر استارتِ isolate ~۰٫۵ ثانیه CPU می‌سوزاند و هر درخواست ۲ برابر
   هزینه دارد. در لاگ‌های زندهٔ پنل، همین به‌صورتِ نشست‌های *کوتاه* (wall
   ~۰٫۹s) که با «Worker exceeded CPU time limit» می‌میرند دیده می‌شد — یعنی
   کاربر ترافیکش بی‌هیچ خطایی وسطِ کار قطع می‌شد.

   پس: پیش‌فرض «cheap» است (رشته‌های پروتکل هنوز از اسکنر پنهان‌اند، ولی
   بدونِ flattening و بدونِ decodeِ مکرر)؛ حالتِ سنگین با OBF_PRESET=heavy
   در دسترس می‌ماند. عدد این تفاوت را جدی بگیرید: ۱۶ برابر. */
const HEAVY = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,               // شناسه‌های سطحِ ماژول (__MOD_DEFAULT__, ConnLimiter) دست‌نخورده می‌مانند
  rotateStringArray: true,
  selfDefending: false,
  splitStrings: true,
  /* ⚠️ transformObjectKeys خاموش شد (تستِ مسیرِ داده با _worker.obf.js):
     با روشن بودنش، خواندنِ کلیدهای داینامیک (o.long/o.first در visionPadBlock)
     در بستهٔ obfuscate‌شده زیر برخی شرایط گم می‌شد — یعنی مسیرِ XTLS-Vision
     بی‌صدا خراب می‌شد (دادهٔ بعدیِ کاربر به سرورِ خروجی نمی‌رسید) در حالی که
     همان کد از روی worker.js کامل درست کار می‌کرد. این گزینه فقط زیباییِ
     obfuscation است و ارزشِ شکستنِ مسیرِ ترافیک را ندارد. */
  transformObjectKeys: false,
  splitStringsChunkLength: 4,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 1,
  unicodeEscapeSequence: true,
};

/* حالتِ سبک: همان پنهان‌سازیِ رشته‌ها (هدفِ اصلی: اسکنرِ استاتیکِ کلاودفلر
   نباید «vless/trojan/clash» را ببیند) ولی بدونِ هزینهٔ زمانِ اجرا:
   • controlFlowFlattening خاموش — هر تابع با یک switch، حلقه‌های داغ را
     چند برابر کند می‌کند (فقط روی کدِ اجراشده اثر دارد، نه امنیت).
   • رشته‌ها داخلِ آرایه می‌مانند (base64) ولی بدونِ crack/چند‌لایه wrapper.
   • splitStrings/unicodeEscapeSequence خاموش — هم بیلد کوچک‌تر، هم parse
     سریع‌تر (استارتِ isolate ارزان‌تر). */
const CHEAP = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  splitStrings: false,
  transformObjectKeys: false,
  stringArray: true,
  stringArrayCallsTransform: false,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: false,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 1,
  unicodeEscapeSequence: false,
  /* ⚠️ رشته‌های بسیار بلند (بدنهٔ UI و صفحاتِ فریب) از مجموعهٔ رمزنگاری‌شده
     بیرون می‌مانند: هر بار خواندنِ یک عضوِ آرایه یک decode می‌خواد و این
     رشته‌های غول‌آسا در *استارت* خوانده می‌شوند — یعنی CPUِ isolate بی‌دلیل
     می‌سوزد. این رشته‌ها دیگر رازِ پروتکلی نیستند (به مرورگر سرو می‌شوند)،
     پس پنهان‌کردنشان هیچ ارزشی ندارد. */
  reservedStrings: ['^[\\s\\S]{300,}$'],
};

const PRESETS = { cheap: CHEAP, heavy: HEAVY };
const PRESET = String(process.env.OBF_PRESET || 'cheap').toLowerCase();
if (!PRESETS[PRESET]) {
  console.error('FATAL: OBF_PRESET باید cheap یا heavy باشد (دریافت: ' + PRESET + ')');
  process.exit(1);
}
const OBF_OPTIONS = PRESETS[PRESET];
console.log('    حالتِ obfuscate: ' + PRESET + (PRESET === 'heavy' ? '  (هشدار: ~۱۶ برابر CPUِ استارت)' : ''));

const obfuscator = require('javascript-obfuscator');
const result = obfuscator.obfuscate(src, OBF_OPTIONS);
let out = result.getObfuscatedCode();

/* ── ۳) انتشار دوبارهٔ exportهای سطحِ ماژول + بازگرداندنِ شناسه‌های runtime ──
   WebSocketPair و connect از ماژول 'cloudflare:sockets'/globalهای ورکر می‌آیند؛
   چون نامشان را در مرحلهٔ ۱ عوض کردیم، در انتهای فایل به‌صورت پارامترِ export
   دوباره معرفی می‌شوند — ولی چون export statement نمی‌تواند global بپذیرد،
   از const استفاده می‌کنیم: */
const exportParts = [];
if (needsDefaultPatch) exportParts.push('__MOD_DEFAULT__ as default');
if (needsClassPatch) exportParts.push('ConnLimiter');
out = 'const __CF_WS_PAIR__ = WebSocketPair;\n// (WebSocketPair اینجا فقط در همین خطِ اول به‌صورت آگاهانه باقی می‌ماند — global ورکر است، نه رشتهٔ پروتکل)\n' + out;
out += '\nexport { ' + exportParts.join(', ') + ' };\n';

/* ── ۴) اعتبارسنجی ── */
if (!/__MOD_DEFAULT__/.test(out) || !/ConnLimiter/.test(out)) {
  console.error('FATAL: شناسه‌های exportِ اصلی در خروجی یافت نشدند.');
  process.exit(1);
}
const leftover = (out.match(/\b(vless|trojan|clash)\b/g) || []).length;
console.log(`    کلمات حساسِ باقی‌مانده در خروجی: ${leftover}`);

writeFileSync(OUT, out, 'utf8');
const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`OK  worker.js (${kb(SRC)} KB)  →  _worker.obf.js (${kb(OUT)} KB)`);
console.log('    حالا محتوای _worker.obf.js را در داشبورد کلاودفلر (Quick Edit → Paste) قرار دهید.');
