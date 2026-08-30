/* ══════════════════════════════════════════════════════════════════════
   t12 — نمای «امنیت» در پنل + ماندگاریِ گزارشِ سلامت شمارش مصرف

   این تست متنِ ui/app.js و worker.js را می‌خواند (بدون اجرای مرورگر) و
   چک می‌کند که:
     • بخش امنیت واقعاً یک مسیرِ قابل‌رؤیت دارد (NAV + VIEWS)
     • فیلدهایش دقیقاً به همان کلیدهایی وصل‌اند که ورکر می‌خواند
       (sec.ipConnLimit و sec.connTtlSec)
     • ذخیره از طریق save-security به PUT /api/settings می‌رود
     • نتیجه‌ی «بررسی سلامت» در state و localStorage نگه داشته می‌شود و
       در هر بار رندرِ کارتِ مانیتور دوباره نمایش داده می‌شود
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

const UI = readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8');
const WK = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, note) => {
  if (cond) { pass++; console.log('PASS ', name + (note ? ' — ' + note : '')); }
  else { fail++; console.log('FAIL ', name + (note ? ' — ' + note : '')); }
};

/* بدنه‌ی یک تابع را از متن بیرون می‌کشد تا پنجره‌ی جست‌وجو محدود و دقیق باشد */
const fnBody = (name) => {
  const i = UI.indexOf('function ' + name);
  if (i < 0) return '';
  const j = UI.indexOf('\n  function ', i + 10);
  return j < 0 ? UI.slice(i) : UI.slice(i, j);
};

/* ─── ۱) مسیرِ ناوبری ─── */
const navLine = UI.split('\n').find((l) => l.includes("['security', 'امنیت'")) || '';
ok('nav has a security entry', !!navLine, navLine.trim().slice(0, 90));
ok('security is grouped under پیکربندی', navLine.includes('پیکربندی'));

/* ─── ۲) VIEWS به تابعِ واقعی وصل است (نه فال‌بک به configView) ─── */
ok('VIEWS maps security → securityView', /security:\s*securityView\b/.test(UI));
ok('securityView is defined', /function\s+securityView\s*\(/.test(UI));
const secBody = fnBody('securityView');
ok('securityView renders SCHEMA.security', /SCHEMA\.security/.test(secBody));

/* ─── ۳) کلیدهای UI همان کلیدهایی است که ورکر می‌خواند ─── */
ok('worker reads sec.ipConnLimit', /settings\.sec\.ipConnLimit|sec\.ipConnLimit/.test(WK));
ok('worker reads sec.connTtlSec', /sec\.connTtlSec/.test(WK));
ok('worker clamps connTtlSec to 15..600', /CONN_TTL_MIN\s*=\s*15/.test(WK) && /CONN_TTL_MAX\s*=\s*600/.test(WK));
ok('SCHEMA binds sec.ipConnLimit', /p:\s*'sec\.ipConnLimit'/.test(UI));
ok('SCHEMA binds sec.connTtlSec', /p:\s*'sec\.connTtlSec'/.test(UI));
ok('SCHEMA binds sec.speedTestUrl', /p:\s*'sec\.speedTestUrl'/.test(UI));
ok('connTtlSec help text states the default 45', /'sec\.connTtlSec'[\s\S]{0,200}?۴۵/.test(UI));

/* ─── ۴) ذخیره ─── */
ok('security view has a save-security button', /saveBtn\('save-security'\)/.test(UI));
ok('save-* is routed to PUT /api/settings', /a\.startsWith\('save-'\)[\s\S]{0,600}?api\('PUT',\s*'\/api\/settings'/.test(UI));
ok('worker PUT /api/settings deep-merges', /route === 'settings' && \(m === 'PUT'[\s\S]{0,400}?merge\(s, b\.settings\)/.test(WK));
ok('worker applies sec on API routes', /apiHandler[\s\S]{0,600}?connApplySettings\(s && s\.sec\)/.test(WK));

/* ─── ۵) نشانگرِ مرجعِ محدودیت ─── */
ok('securityView shows the active backend badge', /S\.d\.storage/.test(secBody));
ok('backend badge covers d1/kv/do/mem', /store === 'd1'/.test(secBody) && /store === 'kv'/.test(secBody) && /store === 'do'/.test(secBody));
ok('securityView shows computed ttl/hb/idle', /s\.sec\.connTtlSec/.test(secBody) && /fa\(ttl\)/.test(secBody) && /fa\(hb\)/.test(secBody) && /fa\(idle\)/.test(secBody));

/* ─── ۶) ماندگاریِ گزارشِ سلامت ─── */
ok('health result is kept in state', /const UH = \{ last: null, ts: 0 \}/.test(UI));
ok('health result is persisted to localStorage', /localStorage\.setItem\(UH_KEY/.test(UI));
ok('health result is restored on load', /localStorage\.getItem\(UH_KEY\)/.test(UI));
ok('monitor card re-renders the stored report', /id="usageHealthOut">'\s*\+\s*uhHtml\(UH\.last\)/.test(UI));
ok('usage-health handler saves then shows', /a === 'usage-health'[\s\S]{0,900}?uhSave\(r\);\s*uhShow\(\);/.test(UI));
ok('report header shows last-check time', /آخرین بررسی/.test(UI));
ok('report header says it survives until next check', /تا وقتی دوباره «بررسی سلامت» را نزنید/.test(UI));
ok('a clear button exists', /data-act="usage-health-clear"/.test(UI));
ok('clear handler resets state + storage', /a === 'usage-health-clear'[\s\S]{0,400}?localStorage\.removeItem\(UH_KEY\)/.test(UI));
ok('conn-reset keeps the report (re-runs health)', /a === 'conn-reset'[\s\S]{0,1400}?uhSave\(r2\)/.test(UI));

/* ─── ۷) تست ترافیک هم ماندگار است ─── */
ok('traffic-test result is persisted', /const ttSave = /.test(UI) && /localStorage\.setItem\(TT_KEY/.test(UI));
ok('traffic-test result is re-rendered', /id="trafficTestOut"[^>]*>'\s*\+\s*ttHtml\(TT\.last\)/.test(UI));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('T12 UI-SECURITY TESTS FAILED'); process.exit(1); }
console.log('ALL UI-SECURITY TESTS PASSED');
