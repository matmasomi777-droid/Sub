/* ═══════════════════════════════════════════════════════════════════════════
 *  همان تستِ نشستِ خروجی، ولی روی **بستهٔ obfuscateشده** (_worker.obf.js) —
 *  یعنی همان چیزی که در داشبورد کلاودفلر پیست می‌شود.
 *
 *  چرا لازم است: تنها فایلِ مستقر، خروجیِ obfuscate است، ولی همهٔ تست‌ها روی
 *  worker.js اجرا می‌شدند. اختلافِ آن دو می‌تواند بی‌صدا باشد و دقیقاً مسیرِ
 *  ترافیکِ کاربر را بکشد. نمونهٔ واقعی: با transformObjectKeys روشن در
 *  javascript-obfuscator، خواندنِ کلیدهای داینامیک (o.long/o.first در
 *  visionPadBlock) در بستهٔ خروجی گم می‌شد و دادهٔ بعدیِ کلاینت به سرورِ
 *  خروجی نمی‌رسید — روی worker.js سبز، روی بستهٔ مستقر مرده.
 *
 *  اجرا:  npm run test:obf   (بدونِ باینریِ Xray با پیامِ skip رد می‌شود)
 * ═══════════════════════════════════════════════════════════════════════════ */
const path = require('path');

process.env.WORKER_SRC = process.env.WORKER_SRC || path.join(__dirname, '..', '_worker.obf.js');
console.log('  • بستهٔ تحتِ تست: ' + process.env.WORKER_SRC);
require('./exit-session-e2e.cjs');
