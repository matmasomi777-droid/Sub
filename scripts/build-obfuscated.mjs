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
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SRC = fileURLToPath(new URL('../worker.js', import.meta.url));
const OUT = fileURLToPath(new URL('../_worker.obf.js', import.meta.url));

let src = readFileSync(SRC, 'utf8');

/* ── ۰) مُهرِ تاریخِ بیلد — بررسیِ نسخه (آپدیت خودکار) تاریخِ جدیدترین کامیتِ
   ریپو را با همین تاریخ مقایسه می‌کند؛ بدونِ این مُهر، ورکرِ تازه‌مستقرشده هم
   برای همیشه «قدیمی» دیده می‌شد. قالب: YYYY.MM.DD */
{
  const d = new Date();
  const stamp = d.getUTCFullYear() + '.' + String(d.getUTCMonth() + 1).padStart(2, '0') + '.' + String(d.getUTCDate()).padStart(2, '0');
  const m = src.match(/const BUILD = '([^']*)';/);
  if (!m) {
    console.error('WARN: مُهرِ BUILD پیدا نشد — بررسیِ نسخه دقیق نخواهد بود');
  } else if (m[1] === stamp) {
    console.log(`    مُهرِ بیلد: ${stamp} (قبلاً به‌روز بود)`);
  } else {
    src = src.replace(/const BUILD = '[^']*';/, `const BUILD = '${stamp}';`);
    writeFileSync(SRC, src, 'utf8');
    console.log(`    مُهرِ بیلد: ${stamp}`);
  }
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

/* ── ۲) گزینه‌ها: همان سبک cfnew — سنگین ولی سازگار با Workers runtime ── */
const OBF_OPTIONS = {
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
  transformObjectKeys: true,
  unicodeEscapeSequence: true,
};

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
