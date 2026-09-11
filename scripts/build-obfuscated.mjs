/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  Build: worker.js → _worker.obf.js  (anti-1101 scanner hardening)
 *  ───────────────────────────────────────────────────────────────────────────
 *  الگوی گرفته‌شده از byJoey/cfnew: ورکرِ نهایی «کاملاً» obfuscate می‌شود
 *  (string-array + hex escapes + control-flow flattening) تا اسکنرِ استاتیکِ
 *  کلاودفلر هیچ نشانه‌ای از vless/trojan/clash/connect و ... نبیند.
 *
 *  استفاده:
 *    npm install
 *    npm run build        → خروجی: _worker.obf.js
 *    سپس در wrangler.toml:  main = "_worker.obf.js"
 *    npx wrangler deploy
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SRC = fileURLToPath(new URL('../worker.js', import.meta.url));
const OUT = fileURLToPath(new URL('../_worker.obf.js', import.meta.url));

let src = readFileSync(SRC, 'utf8');

/* ── ۱) وصلهٔ سطحِ ماژول: exportها را قبل از obfuscate به شناسه‌های ساده تبدیل می‌کنیم
   javascript-obfuscator ES export را دوباره تولید نمی‌کند؛ پس:
     export default { ... }  →  const __MOD_DEFAULT__ = { ... }
     export class ConnLimiter →  class ConnLimiter
   و در انتهای فایلِ خروجی، با یک statement واقعی دوباره منتشرشان می‌کنیم. */
const needsDefaultPatch = /export\s+default\s+\{/.test(src);
const needsClassPatch = /export\s+class\s+ConnLimiter/.test(src);
if (needsDefaultPatch) src = src.replace(/export\s+default\s+\{/, 'const __MOD_DEFAULT__ = {');
if (needsClassPatch) src = src.replace(/export\s+class\s+ConnLimiter/, 'class ConnLimiter');

if (!/const\s+__MOD_DEFAULT__\s*=/.test(src) || !/class\s+ConnLimiter/.test(src)) {
  console.error('FATAL: worker.js فاقد export default یا export class ConnLimiter است.');
  process.exit(1);
}

/* regex های CLIENT_UA — رشتهٔ پروتکل‌ها را به new RegExp تبدیل می‌کنیم تا
   توسط stringArray (rc4) پنهان شود؛ خودِ regex literal از دستِ stringArray خارج است. */
src = src.replace(
  /const CLIENT_UA = \/([^/]+)\/;/,
  (m, body) => 'const CLIENT_UA = new RegExp(' + JSON.stringify(body) + ');'
);

/* ── ۱‌ومح) پاک‌سازی نامِ توابعِ دارای کلمهٔ کلیدی — cfnew همهٔ شناسه‌ها را هم عوض می‌کند.
   اسکنر به‌ویژه به رشته‌های پروتکل حساس است؛ ولی برای اطمینانِ کامل،
   نامِ توابعِ مشخص (vlessHeader و امثال آن) هم بی‌طرف می‌شود. */
for (const [pat, rep] of [
  [/\bvlessHeader\b/g, 'protoHeaderA'],
  [/\bvlessAddons\b/g, 'protoAddons'],
  [/\bvlessRequestHeader\b/g, 'protoRequestHeader'],
  [/\bparseVless\b/g, 'parseProtoA'],
  [/\bparseTrojan\b/g, 'parseProtoB'],
  [/\bclashYaml\b/g, 'yamlProfile'],
  [/\bConnLimiter\b/g, 'ConnLimiter'],   // نام DO باید با wrangler.toml یکی بماند
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

/* ── ۳) انتشار دوبارهٔ exportهای سطحِ ماژول ── */
const exportStatement =
  (needsClassPatch ? 'export { ConnLimiter' : '') +
  (needsDefaultPatch && needsClassPatch ? ', ' : '') +
  (needsDefaultPatch ? '__MOD_DEFAULT__ as default' : '') +
  (needsClassPatch ? ' };' : ';');
out += '\n' + (needsDefaultPatch && !needsClassPatch
  ? 'export { __MOD_DEFAULT__ as default };\n'
  : needsClassPatch && !needsDefaultPatch
    ? 'export { ConnLimiter };\n'
    : `export { ${needsDefaultPatch ? '__MOD_DEFAULT__ as default' : ''}${needsDefaultPatch && needsClassPatch ? ', ' : ''}${needsClassPatch ? 'ConnLimiter' : ''} };\n`);

/* ── ۴) اعتبارسنجی ── */
const exportCount = (t) => (t.match(/export\s+\{/gm) || []).length + (t.match(/export\s+default\s+/gm) || []).length + (t.match(/export\s+class\s+/gm) || []).length;
if (exportCount(out) < 1) {
  console.error('FATAL: export بعد از obfuscation پیدا نشد.');
  process.exit(1);
}
if (!/__MOD_DEFAULT__/.test(out) || !/ConnLimiter/.test(out)) {
  console.error('FATAL: شناسه‌های exportِ اصلی در خروجی یافت نشدند.');
  process.exit(1);
}

writeFileSync(OUT, out, 'utf8');
const kb = (p) => (statSync(p).size / 1024).toFixed(0);
console.log(`OK  worker.js (${kb(SRC)} KB)  →  _worker.obf.js (${kb(OUT)} KB)`);
console.log('    deploy: wrangler.toml → main = "_worker.obf.js"  سپس  npx wrangler deploy');
