/* ═══════════════════════════════════════════════════════════════════════════
 *  سنجشِ مصرفِ CPU — همان هارنسِ «کلاینتِ واقعی» با پروکسیِ crypto.
 *  چرا: در تولید، نشست‌های مسیرِ sg به میانهٔ ۴۸ms CPU می‌رسند و نشست‌های کوتاه
 *  (wall ~0.9s) از سقفِ CPU رد می‌شوند. باید بدانیم آن پردازنده کجا می‌سوزد:
 *  هندشیکِ reality، AEAD، تولیدِ پدینگ، یا خودِ بستهٔ obfuscate‌شده؟
 *
 *  اجرا:  node tests-manual/cpu-bench.cjs                     (worker.js)
 *         WORKER_SRC=_worker.obf.js node tests-manual/cpu-bench.cjs
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, process.env.WORKER_SRC || 'worker.js');
/* باید کنارِ خودِ هارنس تولید شود: هارنس ریشهٔ مخزن را از __dirname/.. می‌گیرد */
const GEN = path.join(ROOT, 'tests-manual', '.cpu-bench.run.cjs');

let src = fs.readFileSync(path.join(__dirname, 'real-client-e2e.cjs'), 'utf8');

/* ۱) پروکسیِ crypto — هر عملیاتِ رمزنگاری شمرده و زمان‌سنجی می‌شود */
const cryptoPatch = `
  const __real = globalThis.crypto;
  globalThis.__stat = { subtle: {}, random: { n: 0, bytes: 0 } };
  /* در Node ویژگیِ crypto فقط-خواندنی است؛ تخصیص بی‌صدا شکست می‌خورد */
  Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: {
    subtle: new Proxy({}, {
      get: (_t, k) => {
        if (k === 'then') return undefined;
        const f = __real.subtle[k];
        if (typeof f !== 'function') return undefined;
        return async (...a) => {
          const t = process.hrtime.bigint();
          try { return await f.apply(__real.subtle, a); }
          finally {
            const s = globalThis.__stat.subtle[String(k)] || (globalThis.__stat.subtle[String(k)] = { n: 0, ms: 0, bytes: 0 });
            s.n++; s.ms += Number(process.hrtime.bigint() - t) / 1e6;
            s.bytes += (a[2] && a[2].byteLength) || 0;
          }
        };
      },
    }),
    getRandomValues: (b) => { globalThis.__stat.random.n++; globalThis.__stat.random.bytes += b.byteLength; return __real.getRandomValues(b); },
    randomUUID: () => __real.randomUUID(),
  } });
`;

/* ۲) سنجشِ بارِ ماژول + سنجشِ CPUِ کلِ فازِ درخواست‌ها */
const importPatch = [
  'const __imp0 = process.cpuUsage(); const __impT = Date.now();',
  'const mod = await import(prepareDir());',
  'const __impC = process.cpuUsage(__imp0);',
  'console.log("  • بارِ ماژول: wall=" + (Date.now() - __impT) + "ms user=" + Math.round(__impC.user / 1000) + "ms sys=" + Math.round(__impC.system / 1000) + "ms");',
].join('\n  ');

const dumpPatch = [
  'console.log = realLog;',
  'console.log = realLog;',
  'const __tot = process.cpuUsage(__cpu0);',
  'console.log("  ── مصرفِ فازِ درخواست‌ها: user=" + Math.round(__tot.user / 1000) + "ms sys=" + Math.round(__tot.system / 1000) + "ms");',
  'console.log("  ── crypto: " + JSON.stringify(globalThis.__stat.subtle));',
  'console.log("  ── random: " + JSON.stringify(globalThis.__stat.random));',
].join('\n  ');

let applied = 0;
const patch = (from, to) => {
  if (!src.includes(from)) { console.log('  ⚠ الگوی وصله پیدا نشد: ' + from.slice(0, 50)); return; }
  src = src.replace(from, () => to);
  applied++;
};

patch('  globalThis.fetch = async () => new Response(\'offline\', { status: 404 });',
  '  globalThis.fetch = async () => new Response(\'offline\', { status: 404 });\n' + cryptoPatch);
patch('  const mod = await import(prepareDir());', importPatch);
patch('  console.log = realLog;', dumpPatch);
patch('  const results = [];', '  const __cpu0 = process.cpuUsage();\n  const results = [];');

fs.writeFileSync(GEN, src);
console.log('  • بیلدِ سنجش (' + applied + ' وصله) روی ' + path.basename(SRC));
const PROF_DIR = path.join(ROOT, 'tests-manual', '.prof');
try { fs.rmSync(PROF_DIR, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(PROF_DIR, { recursive: true });
const r = spawnSync(process.execPath, [
  '--max-old-space-size=4096',
  '--cpu-prof', '--cpu-prof-interval=100', '--cpu-prof-dir=' + PROF_DIR, '--cpu-prof-name=bench.cpuprofile',
  GEN,
], {
  stdio: 'inherit',
  cwd: ROOT,
  env: Object.assign({}, process.env, { WORKER_SRC: SRC }),
});
profile(PROF_DIR);
if (!process.env.KEEP) { try { fs.rmSync(GEN, { force: true }); } catch (e) {} }
process.exit(r.status === null ? 1 : r.status);

/* ── خواندنِ نمایهٔ CPU و نمایشِ تابع‌های داغ (self-time) ── */
function profile(dir) {
  try {
    const f = path.join(dir, 'bench.cpuprofile');
    if (!fs.existsSync(f)) return;
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    const self = new Map();
    let total = 0;
    for (const n of p.nodes) {
      const h = n.hitCount || 0;
      if (!h) continue;
      const cf = n.callFrame || {};
      const where = (cf.url || '').split('/').slice(-1)[0] + ':' + (cf.lineNumber + 1);
      const key = (cf.functionName || '(anon)') + '  @ ' + where;
      self.set(key, (self.get(key) || 0) + h);
      total += h;
    }
    const us = (p.samples || []).length ? p.timeDeltas.reduce((a, b) => a + b, 0) / (p.samples.length || 1) : 0;
    console.log('\n  ══ نمایهٔ CPU (نمونه‌ها=' + total + ' • واحد≈' + Math.round(us) + 'µs) ══');
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, v]) => {
      const pct = ((v / total) * 100).toFixed(1);
      console.log('   ' + String(pct).padStart(5) + '%  ' + String(Math.round(v * us / 1000) + 'ms').padStart(7) + '  ' + k);
    });
  } catch (e) { console.log('  ⚠ نمایه خوانده نشد: ' + e.message); }
}
