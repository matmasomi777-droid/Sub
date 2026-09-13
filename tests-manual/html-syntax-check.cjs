/**
 * استخراج و سینتکس‌چک اسکریپت‌های داخل HTMLها
 * (برای ui/user.html و new-subscription.html — فقط اعتبارسنجی سینتکس)
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');

const files = process.argv.slice(2);
let fail = 0;

for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, i = 0, bad = 0;
  while ((m = re.exec(html))) {
    i++;
    const tmp = f.replace(/[\\/]/g, '_') + '.' + i + '.js';
    const p = os.tmpdir() + require('path').sep + tmp;
    fs.writeFileSync(p, m[1]);
    try {
      execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
    } catch (e) {
      bad++;
      fail = 1;
      const msg = String(e.stderr || e.message || '').split('\n').slice(0, 8).join('\n');
      console.log('SYNTAX FAIL: ' + f + ' (script #' + i + ')\n' + msg);
    }
  }
  if (!bad) console.log('OK: ' + f + ' (' + i + ' scripts)');
}
process.exit(fail);
