/**
 * اسکنِ ساده: توابعی که صدا زده شده‌اند اما تعریف‌شان پیدا نشده
 * (هیچ ادعای کاملی ندارد؛ فقط برای یافتنِ باگ‌های آشکارِ تعریف‌نشدن)
 */
const fs = require('fs');
const src = fs.readFileSync('worker.js', 'utf8');

const names = process.argv.slice(2);
for (const name of names) {
  const callRe = new RegExp('(?<![\\w.$])' + name + '\\s*\\(', 'g');
  const uses = (src.match(callRe) || []).length;
  const defRe = new RegExp(
    '(function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=|let\\s+' + name + '\\s*=|var\\s+' + name + '\\s*=|class\\s+' + name + '\\b)'
  );
  const def = defRe.test(src);
  console.log(name + ' → uses: ' + uses + ' | def: ' + (def ? 'YES' : 'NO'));
}
